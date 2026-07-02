/**
 * layerBCronRegistry.ts — Layer-B CLI-session cron SSOT parser
 * (DASH-CRON-RECHECK-TABLE Zone 1, TASK-DASH-CRON-1, CN-5)
 *
 * Parses `.claude/commands/crons/*.md` ONLY (13 live files) — architect-resolved
 * (risk flag R2 in docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md §5):
 * the 2 re-arm skill files (`cron-detect-loop/SKILL.md`, `cron-cowork-team/SKILL.md`)
 * verbatim-copy 5 crons already declared in these command files; including them
 * would double-count (AC-12). Do NOT add those skill files as a source here.
 *
 * Two content shapes are handled (R3):
 *   Primary  — `- **cron**: \`<expr>\`` bullet lines (12 of 13 live files; several
 *              multi-cron: cron-market-watcher.md×3, cron-news-scout.md×2,
 *              cron-system-auditor.md×3).
 *   Fallback — `# Schedule: '<expr>'` comment header (only cron-refine-bctc.md;
 *              used only when the primary regex yields 0 matches for a file, so
 *              it never accidentally fires on a file that already matched primary).
 *
 * `cron-fb-market-poster.md` is DEPRECATED as of 2026-06-28 (FB-COWORK-FOLD) — it
 * is a redirect doc pointing at `docs/data/cowork-schedule.json` slots already
 * serviced by the cowork-team 15-min-interval master dispatcher row (cron-cowork-team.md).
 * It carries zero standalone CronCreate registrations. Skipped via an explicit
 * skip-list (not relied on regex-miss alone) so a future content edit to that
 * file's markdown slot-table can't accidentally start matching (R3) — plus a
 * defensive console.warn drift detector for any *other* file that looks
 * deprecated but isn't yet on the skip-list.
 *
 * Filesystem-read at server startup, memoized in-process (CN-5) — matches the
 * EC-5 "restart to reflect changes" contract already accepted for CN-4's static
 * metadata.
 *
 * DDD layer: infrastructure — filesystem read only, no domain/application imports.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildHumanSchedule } from "../../domain/cron/humanScheduleFormatter.js";

export interface CronStatusRowB {
  name: string;
  layer: "cli-session";
  cron_expr: string;
  human_schedule: string;
  expected_last_fire: null;
  expected_next_fire: null;
  last_fire: null;
  last_status: null;
  status: "SESSION_SCOPED";
  reason: string;
}

/**
 * Explicit skip-list — see file header for rationale (R2). Deliberately a
 * data-driven list (not a hardcoded single check) so a future deprecation can
 * append here rather than editing parse logic.
 */
export const DEPRECATED_LAYER_B_FILES: readonly string[] = ["cron-fb-market-poster.md"];

const SESSION_SCOPED_REASON = "Session-scoped: fires only while a live CLI session is active";

const PRIMARY_CRON_RE = /-\s*\*\*cron\*\*:\s*`([^`]+)`/g;
const FALLBACK_SCHEDULE_RE = /Schedule:\s*'([^']+)'/;

function buildRow(name: string, cronExpr: string): CronStatusRowB {
  return {
    name,
    layer: "cli-session",
    cron_expr: cronExpr,
    human_schedule: buildHumanSchedule(cronExpr),
    expected_last_fire: null,
    expected_next_fire: null,
    last_fire: null,
    last_status: null,
    status: "SESSION_SCOPED",
    reason: SESSION_SCOPED_REASON,
  };
}

function extractCronExprs(content: string): string[] {
  const exprs: string[] = [];
  const primaryRe = new RegExp(PRIMARY_CRON_RE.source, PRIMARY_CRON_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = primaryRe.exec(content)) !== null) {
    exprs.push(match[1]!);
  }
  if (exprs.length === 0) {
    const fallback = FALLBACK_SCHEDULE_RE.exec(content);
    if (fallback) {
      exprs.push(fallback[1]!);
    }
  }
  return exprs;
}

/**
 * Parse all Layer-B cron rows from `.md` files in `commandsDir`.
 *
 * Pure w.r.t. its inputs (no memoization here — see `getLayerBCronRows` for the
 * CN-5 memoized singleton used at request time). Exported un-memoized so tests
 * can exercise it directly against fixture directories.
 */
export function parseLayerBCrons(commandsDir: string): CronStatusRowB[] {
  const rows: CronStatusRowB[] = [];
  const files = readdirSync(commandsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  for (const file of files) {
    if (DEPRECATED_LAYER_B_FILES.includes(file)) {
      continue;
    }

    const content = readFileSync(join(commandsDir, file), "utf-8");

    // Drift detector (R2 defensive check): WARN (not throw) if a non-skip-listed
    // file looks deprecated — signals the skip-list may need an update.
    if (/DEPRECATED/i.test(content.slice(0, 500))) {
      console.warn(
        `[layerBCronRegistry] ${file} looks deprecated (DEPRECATED marker in ` +
          `first 500 chars) but is not in DEPRECATED_LAYER_B_FILES — verify the skip-list is current.`,
      );
    }

    const baseName = file.replace(/\.md$/, "");
    const exprs = extractCronExprs(content);

    exprs.forEach((expr, idx) => {
      const name = exprs.length > 1 ? `${baseName}#${idx + 1}` : baseName;
      rows.push(buildRow(name, expr));
    });
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// CN-5 — module-level memoized singleton (server-startup read, process-lifetime cache)
// ─────────────────────────────────────────────────────────────────────────────

let _cachedRows: CronStatusRowB[] | null = null;

/** Memoized production accessor — parses once per process, reused thereafter (CN-5). */
export function getLayerBCronRows(commandsDir: string): CronStatusRowB[] {
  if (_cachedRows === null) {
    _cachedRows = parseLayerBCrons(commandsDir);
  }
  return _cachedRows;
}

/** Test-only hook — clears the memoized cache between test cases. */
export function _resetLayerBCronCacheForTests(): void {
  _cachedRows = null;
}
