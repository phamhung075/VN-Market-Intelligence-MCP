/**
 * tasksMdJanitorJob — Step R-1b known-legit lock-prefix SSOT reader (stateless).
 *
 * Split out of tasksMdJanitorJob.ts (FIX-SIZELINT-TASKSMDJANITORJOB-1012L,
 * 2026-08-24). Pure file-read + parse — no module-scope mutable state (that
 * lives in tasksMdJanitorR1bFilter.ts alongside its only consumer,
 * isKnownLegitPattern/refreshKnownLegitPrefixes, per Step R-1b's own AC-7
 * per-cycle-refresh contract).
 */

import { readFileSync } from "node:fs";

/**
 * Known-legit kind/pattern list per handlers.md §Step R-1b item 1: persistent /
 * guard / escalation locks that are board-row-less OR held concurrently with any
 * active task BY DESIGN. Prefix-matched (glob) except the "-singleton" suffix.
 *
 * FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX (2026-08-24): SSOT moved
 * to docs/data/system-map.json `.project.coordination.known_legit_lock_prefixes`
 * (CLAUDE.md "System Data — Never Hardcode"). A hardcoded TS array duplicated
 * verbatim across this file + handlers.md + audit-dimensions.md is the root
 * cause of this fix — authored once (2026-07-08), never revisited when
 * bctc-analyst minted new escalation-lock kinds later, including a prefix
 * rename (`data-quality-anomaly:` -> `bctc-dataquality:`) some time before
 * 2026-08-08. FALLBACK_KNOWN_LEGIT_PREFIXES below is a defense-in-depth
 * safety net ONLY (mirrors this subsystem's own "never suppress LESS on this
 * path's absence" philosophy); it is NOT the source of truth — add new
 * prefixes to system-map.json, not here.
 */
export const FALLBACK_KNOWN_LEGIT_PREFIXES: readonly string[] = [
  "cron:",
  "cron-registration:",
  "po-triage-",
  "esc-datacov:",
  "esc-deepdive:",
  "data-quality-anomaly:",
  "bctc-dataquality:",
  "session-presence",
  "commit-mutex",
  "intent:",
];

export const DEFAULT_SYSTEM_MAP_PATH = "docs/data/system-map.json";

/**
 * Loads the known-legit lock-prefix whitelist from docs/data/system-map.json
 * (SSOT) — `.project.coordination.known_legit_lock_prefixes`, a BARE
 * `string[]` (AC-5, po 2026-08-15: an earlier spec draft's verbatim "After"
 * JSON block nested the list one level deeper at
 * `...known_legit_lock_prefixes.prefixes`; copy-pasting that shape trips
 * `!Array.isArray(list)` below and silently degrades to
 * FALLBACK_KNOWN_LEGIT_PREFIXES behind a console.warn while every test still
 * passes green — see FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX-spec.md
 * §8.2. Code and data must agree on the bare-array shape; this reader is the
 * one that's authoritative).
 *
 * Mirrors loadWatchlistSeedFromSystemMap() (infrastructure/db/seedWatchlist.ts)
 * — identical relative-to-cwd path resolution (works in-container via the
 * docs/data volume mount, and in local `bun test` via the
 * apps/mcp-server/docs -> ../../docs symlink).
 *
 * On any failure (missing file, malformed JSON, missing/empty/non-array key)
 * returns FALLBACK_KNOWN_LEGIT_PREFIXES — deliberately NOT an empty array
 * (unlike loadWatchlistSeedFromSystemMap's fail-open-to-[] contract): an
 * empty whitelist here would un-suppress every currently-known
 * persistent/guard lock kind and flood signal_queue — the exact regression
 * this subsystem exists to prevent. Exported for direct unit testing
 * (fallback-path AND SSOT-positive-path coverage — AC-6).
 */
export function loadKnownLegitPrefixesFromSystemMap(
  path: string = DEFAULT_SYSTEM_MAP_PATH,
): readonly string[] {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as {
      project?: { coordination?: { known_legit_lock_prefixes?: string[] } };
    };
    const list = parsed.project?.coordination?.known_legit_lock_prefixes;
    if (!Array.isArray(list) || list.length === 0) {
      console.warn(
        `[tasks-md-janitor] WARN: ${path} .project.coordination.known_legit_lock_prefixes ` +
        `missing/empty — using FALLBACK_KNOWN_LEGIT_PREFIXES`,
      );
      return FALLBACK_KNOWN_LEGIT_PREFIXES;
    }
    return list;
  } catch (err) {
    console.warn(
      `[tasks-md-janitor] WARN: could not load ${path} (${(err as Error).message}) — ` +
      `using FALLBACK_KNOWN_LEGIT_PREFIXES`,
    );
    return FALLBACK_KNOWN_LEGIT_PREFIXES;
  }
}
