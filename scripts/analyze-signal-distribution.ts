#!/usr/bin/env bun
/**
 * Task 1328k — Signal distribution analysis
 *
 * Read-only script. Queries rag_analyses.impact_score (the canonical column
 * for signal severity). The handoff spec referenced agent_signals.impact_score
 * which does not exist as a column — impact_score lives in rag_analyses only.
 *
 * Usage:
 *   bun apps/mcp-server/scripts/analyze-signal-distribution.ts
 *
 * Safe against production DB: opens read-only, no INSERT/UPDATE/DELETE.
 * Output: stdout report + docs/data/signal-distribution-report.json
 */

import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

// ── DB path (mirrors schema.ts DEFAULT_DB_PATH logic) ───────────────────────
const DB_PATH =
  Bun.env["DB_PATH"] ??
  resolve(import.meta.dir, "..", "data", "market.db");

const db = new Database(DB_PATH, { readonly: true });

// ── Types ────────────────────────────────────────────────────────────────────

interface BucketRow {
  bucket: number;
  cnt: number;
  tickers: string | null;  // JSON array strings joined from affected_actions
  levels: string | null;   // comma-separated level values
}

interface TotalRow {
  total: number;
  date_min: string | null;
  date_max: string | null;
}

interface BucketStats {
  bucket: number;
  count: number;
  pct_of_total: string;
  top_tickers: string[];
  levels: string[];
}

// ── Query 1: total count + date range (7-day window) ────────────────────────
const totalRow = db
  .prepare<TotalRow, []>(
    `SELECT
       COUNT(*)          AS total,
       MIN(created_at)   AS date_min,
       MAX(created_at)   AS date_max
     FROM rag_analyses
     WHERE created_at >= datetime('now', '-7 days')
       AND impact_score IS NOT NULL`
  )
  .get();

const total = totalRow?.total ?? 0;
const dateMin = totalRow?.date_min ?? "n/a";
const dateMax = totalRow?.date_max ?? "n/a";

// ── Query 2: total all-time (for context) ───────────────────────────────────
const allTimeRow = db
  .prepare<{ total: number }, []>(
    `SELECT COUNT(*) AS total FROM rag_analyses WHERE impact_score IS NOT NULL`
  )
  .get();

const allTimeTotal = allTimeRow?.total ?? 0;

// ── Query 3: per-bucket breakdown ───────────────────────────────────────────
// affected_actions is stored as a JSON array e.g. '["VCB","BID"]'.
// We extract distinct tickers via GROUP_CONCAT over json_each for rows that
// have a non-empty array. Falls back to tags for rows without affected_actions.
const bucketRows = db
  .prepare<BucketRow, []>(
    `SELECT
       CAST(ROUND(impact_score) AS INTEGER) AS bucket,
       COUNT(*)                              AS cnt,
       GROUP_CONCAT(DISTINCT
         CASE
           WHEN affected_actions IS NOT NULL
                AND affected_actions != '[]'
                AND affected_actions != ''
           THEN affected_actions
           ELSE NULL
         END
       )                                     AS tickers,
       GROUP_CONCAT(DISTINCT level)          AS levels
     FROM rag_analyses
     WHERE created_at >= datetime('now', '-7 days')
       AND impact_score IS NOT NULL
     GROUP BY bucket
     ORDER BY bucket`
  )
  .all();

// ── Query 4: 7-8 range detail ────────────────────────────────────────────────
interface DetailRow {
  impact_score: number;
  level: string;
  affected_actions: string | null;
  tags: string | null;
  source_title: string | null;
  created_at: string;
}

const range78Rows = db
  .prepare<DetailRow, []>(
    `SELECT impact_score, level, affected_actions, tags, source_title, created_at
     FROM rag_analyses
     WHERE created_at >= datetime('now', '-7 days')
       AND impact_score >= 7 AND impact_score <= 8
     ORDER BY impact_score DESC, created_at DESC`
  )
  .all();

// ── Helper: parse ticker list from affected_actions JSON ────────────────────
function parseTickers(tickerJson: string | null): string[] {
  if (!tickerJson) return [];
  // GROUP_CONCAT of JSON arrays: '["VCB","BID"],["HPG"]' — flatten all
  const parts = tickerJson.split(",");
  const result = new Set<string>();
  for (const part of parts) {
    const trimmed = part.trim();
    // Try JSON parse first
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const t of parsed) if (typeof t === "string" && t.length > 0) result.add(t.toUpperCase());
        continue;
      }
    } catch {
      // not valid JSON — treat as plain text
    }
    // Strip brackets and quotes, add as-is
    const clean = trimmed.replace(/[\[\]"']/g, "").trim();
    if (clean.length > 0) result.add(clean.toUpperCase());
  }
  return [...result].slice(0, 10);
}

// ── Build bucket stats ───────────────────────────────────────────────────────
const buckets: BucketStats[] = bucketRows.map((r) => ({
  bucket: r.bucket,
  count: r.cnt,
  pct_of_total: total > 0 ? ((r.cnt / total) * 100).toFixed(1) : "0.0",
  top_tickers: parseTickers(r.tickers),
  levels: r.levels ? [...new Set(r.levels.split(","))].filter(Boolean) : [],
}));

// ── PO decision stats ────────────────────────────────────────────────────────
const count7 = buckets.find((b) => b.bucket === 7)?.count ?? 0;
const count8 = buckets.find((b) => b.bucket === 8)?.count ?? 0;
const count8plus = buckets.filter((b) => b.bucket >= 8).reduce((s, b) => s + b.count, 0);
const pct7 = total > 0 ? ((count7 / total) * 100).toFixed(1) : "0.0";
const pct8plus = total > 0 ? ((count8plus / total) * 100).toFixed(1) : "0.0";

// Critical tickers to watch in bucket 7
const CRITICAL_TICKERS = ["VNM", "VCB", "BID", "FPT", "HPG", "MBB", "TCB", "VHM", "SSI", "VIC"];
const tickers7 = buckets.find((b) => b.bucket === 7)?.top_tickers ?? [];
const criticalIn7 = tickers7.filter((t) => CRITICAL_TICKERS.includes(t));

// Build critical tickers from full range78 rows for richer analysis
const allTickers78 = new Set<string>();
for (const row of range78Rows) {
  for (const t of parseTickers(row.affected_actions)) allTickers78.add(t);
}
const criticalIn78 = [...allTickers78].filter((t) => CRITICAL_TICKERS.includes(t));

// ── Ticker breakdown for 7-8 range ──────────────────────────────────────────
const tickerCount78 = new Map<string, number>();
for (const row of range78Rows) {
  for (const t of parseTickers(row.affected_actions)) {
    tickerCount78.set(t, (tickerCount78.get(t) ?? 0) + 1);
  }
}
const tickerBreakdown78 = [...tickerCount78.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([ticker, count]) => ({ ticker, count }));

// ── Level breakdown for 7-8 range ───────────────────────────────────────────
const levelCount78 = new Map<string, number>();
for (const row of range78Rows) {
  const lvl = row.level ?? "unknown";
  levelCount78.set(lvl, (levelCount78.get(lvl) ?? 0) + 1);
}
const levelBreakdown78 = [...levelCount78.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([level, count]) => ({ level, count }));

// ── Recommendation ───────────────────────────────────────────────────────────
let recommendation: string;
if (criticalIn7.length > 0) {
  recommendation = `CAUTION: Bucket 7 contains ${criticalIn7.length} critical ticker(s): ${criticalIn7.join(", ")}. Consider threshold=7.5 instead of 8.`;
} else if (count7 === 0) {
  recommendation = "No signals at score=7 in past 7 days. Threshold raise to 8 is low-risk.";
} else if (parseFloat(pct7) < 5) {
  recommendation = `Bucket 7 is ${pct7}% of total (${count7} signals, no critical tickers). Threshold raise to 8 is LOW RISK.`;
} else {
  recommendation = `Bucket 7 is ${pct7}% of total (${count7} signals). No critical tickers found. Threshold raise to 8 is MODERATE — review bucket-7 content before deploying.`;
}

// ── Stdout report ────────────────────────────────────────────────────────────
console.log("=== Signal Distribution Analysis (7-day window) ===");
console.log(`Table:         rag_analyses`);
console.log(`DB:            ${DB_PATH}`);
console.log(`Date range:    ${dateMin} → ${dateMax}`);
console.log(`Total signals: ${total} (7-day) / ${allTimeTotal} (all-time)`);
console.log(`Config:        mcp.config.json defaultImpactScoreMin = 7 (current)`);
console.log("");
console.log("Bucket | Count | % of 7d total | Levels              | Top tickers");
console.log("-------|-------|---------------|---------------------|-------------------------------------------");

for (const b of buckets) {
  const bucketLabel = String(b.bucket).padStart(6);
  const countLabel = String(b.count).padStart(5);
  const pctLabel = `${b.pct_of_total}%`.padStart(13);
  const levelsLabel = b.levels.join(", ").padEnd(19).slice(0, 19);
  const tickersLabel = b.top_tickers.length > 0 ? b.top_tickers.slice(0, 6).join(", ") : "(none)";
  console.log(`${bucketLabel} | ${countLabel} | ${pctLabel} | ${levelsLabel} | ${tickersLabel}`);
}

console.log("");
console.log("=== 7-8 Range Detail ===");
console.log(`Score=7 signals:  ${count7} (${pct7}% of 7-day total)`);
console.log(`Score=8 signals:  ${count8} (${total > 0 ? ((count8 / total) * 100).toFixed(1) : "0.0"}% of 7-day total)`);
console.log(`Score>=8 signals: ${count8plus} (${pct8plus}% — would REMAIN after threshold raise)`);
console.log(`Score=7 signals:  ${count7} (${pct7}% — would be SUPPRESSED by 1328j)`);

if (tickerBreakdown78.length > 0) {
  console.log("");
  console.log("Ticker breakdown in 7-8 range (signals with explicit stock codes):");
  for (const { ticker, count } of tickerBreakdown78.slice(0, 10)) {
    const flag = CRITICAL_TICKERS.includes(ticker) ? " [CRITICAL]" : "";
    console.log(`  ${ticker.padEnd(6)} : ${count}${flag}`);
  }
} else {
  console.log("\nNo explicit stock codes found in 7-8 range (all country/sector-level signals).");
}

if (levelBreakdown78.length > 0) {
  console.log("");
  console.log("Level breakdown in 7-8 range:");
  for (const { level, count } of levelBreakdown78) {
    console.log(`  ${level.padEnd(12)}: ${count}`);
  }
}

console.log("");
console.log("=== PO Decision Point ===");
console.log(recommendation);
console.log("");
if (criticalIn78.length > 0) {
  console.log(`Critical tickers in full 7-8 range: ${criticalIn78.join(", ")}`);
}
console.log("Task 1328j (threshold raise) should only deploy after PO reviews this report.");

// ── Write JSON report ────────────────────────────────────────────────────────
const report = {
  generated_at: new Date().toISOString(),
  task: "1328k",
  db_path: DB_PATH,
  window: "7 days",
  date_range: { min: dateMin, max: dateMax },
  totals: {
    signals_7day: total,
    signals_all_time: allTimeTotal,
  },
  current_config: {
    defaultImpactScoreMin: 7,
    source: "mcp.config.json",
  },
  buckets,
  range_7_to_8: {
    count_score_7: count7,
    pct_score_7: pct7,
    count_score_8: count8,
    count_score_8plus: count8plus,
    pct_score_8plus: pct8plus,
    ticker_breakdown: tickerBreakdown78,
    level_breakdown: levelBreakdown78,
    critical_tickers_found: criticalIn78,
  },
  po_recommendation: recommendation,
};

// Bun resolves import.meta.dir relative to CWD when running via relative path.
// When invoked as `bun apps/mcp-server/scripts/analyze-signal-distribution.ts`
// from project root, import.meta.dir = project-root/scripts (Bun flattens the path).
// One level up from that reaches project root → docs/data.
const outDir = resolve(import.meta.dir, "..", "docs", "data");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "signal-distribution-report.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nJSON report written: ${outPath}`);

db.close();
