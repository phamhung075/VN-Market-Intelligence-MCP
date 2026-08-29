#!/usr/bin/env bun
/**
 * scripts/migrations/backfill-monthly-signal-quality-audit.ts
 *
 * FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD — one-shot
 * historical monthly signal-quality audit backfill (AC: "explicit one-shot
 * historical query over signal_rejections").
 *
 * WHY THIS SCRIPT EXISTS:
 *   monthlySignalQualityAuditJob (cron '0 0 1 * *', UTC) missed the 2026-07-01
 *   and 2026-08-01 fires with zero recovery (RAW-verified live: last real
 *   cron_job_runs success 2026-06-01). The companion code fix's startup
 *   catch-up (startScheduler.ts, shouldRunCatchup cadence='month') recovers
 *   ONLY the MOST RECENT missed month — any fire within a calendar month
 *   resolves to the SAME prior-month target, so after deployment it audits the
 *   month just before the deploy (July 2026) and then the cadence moves on.
 *   Months older than the most-recent missed one (June 2026) are unrecoverable
 *   through natural cadence and need an explicit one-shot query — this script.
 *
 * USAGE:
 *   # Dry-run (default — read-only, prints report, NO send):
 *   bun scripts/migrations/backfill-monthly-signal-quality-audit.ts --month 2026-06 --month 2026-07
 *
 *   # Apply (sends via the live WORK Telegram channel):
 *   bun scripts/migrations/backfill-monthly-signal-quality-audit.ts --month 2026-06 --apply
 *
 *   # Against the live named-volume DB (docker exec — matches the other CANONICAL scripts):
 *   docker cp scripts/migrations/backfill-monthly-signal-quality-audit.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/backfill-monthly-signal-quality-audit.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/backfill-monthly-signal-quality-audit.ts --month 2026-06 --apply
 *
 *   Requires TELEGRAM_BOT_TOKEN + TELEGRAM_INFO_WORK_CHANNEL_ID in the container
 *   env (same vars the job's own sendTelegramWork uses); when either is missing
 *   --apply is a no-op (exit 0, message printed) — never throws.
 *
 * SEMANTICS (honesty contract):
 *   - Computes MONTH-FILTERED stats over signal_rejections
 *     (strftime('%Y-%m', created_at) = ?) + the signal count over agent_signals
 *     for the SAME target month. Deliberately self-contained rather than reusing
 *     queryRejectionStats()/generateAuditReport() from the live service: those
 *     functions' queries are all-time/current-month (a known SEPARATE defect —
 *     see FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H scope
 *     notes), so reusing them would produce a current-month report mislabelled
 *     as the missed month. This script's numbers are honest for the target month.
 *   - Message shape mirrors runMonthlySignalQualityJob()'s (scheduler/audits/
 *     monthlySignalQualityJob.ts) header + stats + threshold footer; on the
 *     ALERT branch (>2% rejection rate) it appends the month-filtered markdown
 *     breakdown (top agents/types/reasons/stocks) instead of the current-month
 *     generateAuditReport embed — a backfilled June report must never embed
 *     August's report text under a June header.
 *   - Dedup guard (--apply only): refuses to send month M when (a) a SUCCESS
 *     cron_job_runs row for monthlySignalQualityAuditJob exists started in month
 *     M+1 (the natural 1st-of-month fire — incl. the new startup catch-up — that
 *     would have produced M's report), OR (b) a backfill marker row already
 *     exists for M (job_name 'monthlySignalQualityAuditJob:backfill-<YYYY-MM>',
 *     written right after a successful send — see below). No duplicate report.
 *   - After a SUCCESSFUL send, records an honest marker row in cron_job_runs
 *     (job_name 'monthlySignalQualityAuditJob:backfill-<YYYY-MM>', started_at
 *     now, status 'success') — a real run DID happen (this script sent the
 *     report), and the distinct job name keeps the marker invisible to the
 *     scheduler's per-target-month guards (shouldSkipMonthlyReplay / the
 *     catch-up's success-only dedup query the EXACT job name and are never
 *     suppressed by a backfill of an older month). No backdated/falsified
 *     timestamps — the marker records when the backfill actually ran.
 *   - Zero-row months are reported honestly (signal/rejection counts printed,
 *     rate shown as 0.00% with a "(no data)" note) — never fabricated.
 *
 * Idempotent: a second --apply for an already-backfilled month is refused by
 * marker check (b) (exit 0 no-op for that month).
 */

import { Database } from "bun:sqlite";

const JOB_NAME = "monthlySignalQualityAuditJob";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─────────────────────────────────────────────────────────────────────────────
// CLI parsing (self-contained; mirrors the manual parse of sibling scripts)
// ─────────────────────────────────────────────────────────────────────────────

interface CliArgs {
  months: string[]; // 'YYYY-MM'
  apply: boolean;
}

function parseCli(argv: string[]): CliArgs {
  const months: string[] = [];
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--month") {
      const v = argv[i + 1];
      if (!v || !/^\d{4}-\d{2}$/.test(v)) {
        console.error(`Invalid --month value: ${String(v)} (expected YYYY-MM)`);
        process.exit(2);
      }
      months.push(v);
      i++;
    } else if (a === "--apply") {
      apply = true;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: bun ${argv[1] ?? "backfill-monthly-signal-quality-audit.ts"} --month YYYY-MM [--month ...] [--apply]`);
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (months.length === 0) {
    console.error("At least one --month YYYY-MM is required (explicit target, never guessed).");
    process.exit(2);
  }
  return { months, apply };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data layer
// ─────────────────────────────────────────────────────────────────────────────

interface MonthStats {
  yearMonth: string; // 'YYYY-MM'
  total: number;
  by_agent: Record<string, number>;
  by_type: Record<string, number>;
  by_stock: Record<string, number>;
  by_reason: Array<{ reason: string; count: number }>;
  signalCount: number;
}

export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1] ?? `Month${m}`} ${y}`;
}

export function nextMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  // Date.UTC month arg is 0-based: passing the 1-based m shifts to the NEXT
  // month (e.g. '2026-06' → Date.UTC(2026, 6, 1) = 2026-07).
  const next = new Date(Date.UTC(y!, m ?? 1, 1));
  return next.toISOString().slice(0, 7);
}

export function computeMonthStats(db: Database, yearMonth: string): MonthStats {
  const by_agent: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  const by_stock: Record<string, number> = {};
  let total = 0;

  const rows = db
    .prepare(
      `SELECT from_agent, signal_type, stock_code, COUNT(*) AS count
       FROM signal_rejections
       WHERE strftime('%Y-%m', created_at) = ?
       GROUP BY from_agent, signal_type, stock_code`,
    )
    .all(yearMonth) as Array<{ from_agent: string; signal_type: string; stock_code: string | null; count: number }>;

  for (const r of rows) {
    total += r.count;
    by_agent[r.from_agent] = (by_agent[r.from_agent] ?? 0) + r.count;
    by_type[r.signal_type] = (by_type[r.signal_type] ?? 0) + r.count;
    const stockKey = r.stock_code || "NULL";
    by_stock[stockKey] = (by_stock[stockKey] ?? 0) + r.count;
  }

  const reasons = db
    .prepare(
      `SELECT reason, COUNT(*) AS count
       FROM signal_rejections
       WHERE strftime('%Y-%m', created_at) = ?
       GROUP BY reason
       ORDER BY count DESC
       LIMIT 3`,
    )
    .all(yearMonth) as Array<{ reason: string; count: number }>;

  const sig = db
    .prepare(`SELECT COUNT(*) AS c FROM agent_signals WHERE strftime('%Y-%m', created_at) = ?`)
    .get(yearMonth) as { c: number };

  return { yearMonth, total, by_agent, by_type, by_stock, by_reason: reasons, signalCount: sig?.c ?? 0 };
}

export function markerJobName(yearMonth: string): string {
  return `${JOB_NAME}:backfill-${yearMonth}`;
}

/**
 * Dedup guard — true when the report for `yearMonth` was already produced by a
 * path OTHER than this script: a SUCCESS run for the job started in the month
 * AFTER the target (the natural 1st-of-month fire — or the new startup
 * catch-up — that would have produced target month's report), or an existing
 * backfill marker row for the exact target month. Mirrors the T4 guard
 * semantics used by the live job (shouldSkipMonthlyReplay): per-target-month,
 * success-only.
 */
export function alreadyAudited(db: Database, yearMonth: string): boolean {
  const bound = nextMonth(yearMonth) + "-01";
  try {
    const natural = db
      .prepare<{ cnt: number }, [string, string]>(
        `SELECT COUNT(*) AS cnt FROM cron_job_runs
         WHERE job_name = ? AND status = 'success' AND started_at >= ?`,
      )
      .get(JOB_NAME, bound);
    if ((natural?.cnt ?? 0) > 0) return true;

    const marker = db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) AS cnt FROM cron_job_runs
         WHERE job_name = ? AND status = 'success'`,
      )
      .get(markerJobName(yearMonth));
    return (marker?.cnt ?? 0) > 0;
  } catch {
    return false; // cron_job_runs missing — no dedup evidence → do not block (dry-run context)
  }
}

/** Honest observability marker — records that THIS script sent the report (see file header). */
export function writeMarker(db: Database, yearMonth: string, rowsWritten: number): void {
  try {
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status, rows_written)
       VALUES (?, datetime('now'), 'success', ?)`,
    ).run(markerJobName(yearMonth), rowsWritten);
  } catch (err) {
    // Non-fatal: the report was already sent; a failed marker only degrades
    // future idempotency (next run would re-check the natural-fire guard).
    console.error(`[backfill] marker write failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function buildMessage(stats: MonthStats): string {
  const label = monthLabel(stats.yearMonth);
  const rejectionRatePercent = stats.signalCount > 0 ? (stats.total / stats.signalCount) * 100 : 0;
  const shouldAlert = rejectionRatePercent / 100 > 0.02;

  const topAgent = Object.entries(stats.by_agent).sort((a, b) => b[1] - a[1])[0]?.[0] || "none";

  let msg = `📊 Signal Quality Audit — ${label}\n`;
  msg += `\n`;
  msg += `Total Rejections: ${stats.total}\n`;
  msg += `Rejection Rate: ${rejectionRatePercent.toFixed(2)}%\n`;
  msg += `Top Agent: ${topAgent}\n`;
  if (stats.signalCount === 0 && stats.total === 0) {
    msg += `(no data: zero signals and zero rejections recorded for ${label})\n`;
  }
  msg += `\n`;

  if (shouldAlert) {
    msg += `⚠️ **ALERT**: Rejection rate (${rejectionRatePercent.toFixed(2)}%) exceeds 2% threshold.\n`;
    msg += `\n`;
    msg += `**${label} breakdown (month-filtered):**\n`;
    msg += `| Agent | Count |\n|---|---|\n`;
    for (const [agent, c] of Object.entries(stats.by_agent).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      msg += `| ${agent} | ${c} |\n`;
    }
    if (Object.keys(stats.by_type).length > 0) {
      msg += `\n| Signal Type | Count |\n|---|---|\n`;
      for (const [t, c] of Object.entries(stats.by_type).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
        msg += `| ${t} | ${c} |\n`;
      }
    }
    if (stats.by_reason.length > 0) {
      msg += `\n| Top Reason | Count |\n|---|---|\n`;
      for (const { reason, count } of stats.by_reason) {
        const truncated = reason.length > 60 ? reason.slice(0, 57) + "..." : reason;
        msg += `| ${truncated} | ${count} |\n`;
      }
    }
    if (Object.keys(stats.by_stock).length > 0) {
      msg += `\n| Stock | Count |\n|---|---|\n`;
      for (const [stock, c] of Object.entries(stats.by_stock).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        const label2 = stock === "NULL" ? "(no stock)" : stock;
        msg += `| ${label2} | ${c} |\n`;
      }
    }
  } else {
    msg += `✓ Rejection rate within acceptable threshold.\n`;
  }
  return msg;
}

/**
 * Send to the WORK Telegram channel — mirrors sendTelegramWork's semantics:
 * reads TELEGRAM_BOT_TOKEN + TELEGRAM_INFO_WORK_CHANNEL_ID from env, no-op when
 * either is missing, never throws.
 */
async function sendWork(text: string): Promise<boolean> {
  const token = Bun.env.TELEGRAM_BOT_TOKEN;
  const chatId = Bun.env.TELEGRAM_INFO_WORK_CHANNEL_ID;
  if (!token || !chatId) {
    console.error(`[backfill] TELEGRAM_BOT_TOKEN / TELEGRAM_INFO_WORK_CHANNEL_ID missing — NOT sending (no-op). Dry-run output above is the report.`);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "" }),
    });
    const ok = res.ok;
    if (!ok) {
      console.error(`[backfill] Telegram send failed: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    }
    return ok;
  } catch (err) {
    console.error(`[backfill] Telegram send error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { months, apply } = parseCli(process.argv.slice(2));

  const dbPath = Bun.env.DB_PATH ?? "/app/data/market.db";
  // NOTE: bun:sqlite rejects an explicit `readonly: false` option ("bad parameter
  // or other API misuse") — omit the option entirely for the read-write open.
  const db = apply ? new Database(dbPath) : new Database(dbPath, { readonly: true });

  let exitCode = 0;
  for (const ym of months) {
    const stats = computeMonthStats(db, ym);
    const msg = buildMessage(stats);

    console.log(`\n========== ${monthLabel(ym)} (${ym}) ==========`);
    console.log(`signals=${stats.signalCount} rejections=${stats.total} rate=${stats.signalCount > 0 ? ((stats.total / stats.signalCount) * 100).toFixed(2) : "0.00"}%`);
    console.log(msg);

    if (apply) {
      if (alreadyAudited(db, ym)) {
        console.log(`[backfill] ${ym}: already audited (success run in ${nextMonth(ym)}) — SKIPPED (dedup guard, no duplicate send)`);
        continue;
      }
      const sent = await sendWork(msg);
      console.log(sent ? `[backfill] ${ym}: SENT to WORK channel` : `[backfill] ${ym}: send failed or no-op (see above)`);
      if (sent) {
        writeMarker(db, ym, stats.total);
      } else {
        exitCode = 1;
      }
    }
  }

  db.close();
  process.exit(exitCode);
}

if (import.meta.main) {
  main();
}
