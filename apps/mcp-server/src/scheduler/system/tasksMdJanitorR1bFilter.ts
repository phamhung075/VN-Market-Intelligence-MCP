/**
 * tasksMdJanitorJob — Step R-1b: exclusion whitelist + live-concurrent-session guard
 * (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE — docs/agents/system-auditor/handlers.md
 * §Step R-1b). Filters BEFORE Steps R-2/R-3 evaluate any held lock.
 *
 * Split out of tasksMdJanitorJob.ts (FIX-SIZELINT-TASKSMDJANITORJOB-1012L,
 * 2026-08-24). Holds the per-cycle-refreshed KNOWN_LEGIT_PREFIXES state
 * (module-scope mutable — see refreshKnownLegitPrefixes doc below) alongside
 * its only consumer, isKnownLegitPattern, plus the live-session guard and
 * the applyR1bFilter entry point that combines both.
 */

import type { LockRow } from "../../infrastructure/db/coordinationStore.js";
import { bareTaskId } from "./tasksMdJanitorTaskHelpers.js";
import {
  FALLBACK_KNOWN_LEGIT_PREFIXES,
  DEFAULT_SYSTEM_MAP_PATH,
  loadKnownLegitPrefixesFromSystemMap,
} from "./tasksMdJanitorLegitPrefixes.js";

/**
 * Mutable — deliberately NOT `const` (AC-7, po 2026-08-15, MANDATORY,
 * overrides the original spec draft's module-scope-const proposal):
 * tasksMdJanitorJob runs as a DAILY CRON inside the long-lived scheduler
 * process (cronConfig.ts '0 3 * * *', wired at schedulerJobTable.ts), so a
 * module-scope `const KNOWN_LEGIT_PREFIXES = load...()` would evaluate
 * exactly once at container start — every later system-map.json edit would
 * be silently inert until the next rebuild/restart. refreshKnownLegitPrefixes()
 * re-reads the SSOT and reassigns this binding once per runTasksMdJanitor()
 * invocation (call site in tasksMdJanitorJob.ts) — never at module load.
 * Initialized to the fallback so any direct unit-test call to
 * isKnownLegitPattern()/applyR1bFilter() made before
 * refreshKnownLegitPrefixes() has ever run still sees the known-good
 * baseline set, matching this module's pre-SSOT behavior exactly.
 */
let KNOWN_LEGIT_PREFIXES: readonly string[] = FALLBACK_KNOWN_LEGIT_PREFIXES;

/**
 * Re-reads docs/data/system-map.json and reassigns KNOWN_LEGIT_PREFIXES
 * (AC-7). Called once at the top of every runTasksMdJanitor() invocation.
 * Exported so tests can drive the SSOT-positive-path assertion explicitly
 * (AC-6) without waiting on a full runTasksMdJanitor() cycle.
 */
export function refreshKnownLegitPrefixes(
  path: string = DEFAULT_SYSTEM_MAP_PATH,
): readonly string[] {
  KNOWN_LEGIT_PREFIXES = loadKnownLegitPrefixesFromSystemMap(path);
  return KNOWN_LEGIT_PREFIXES;
}

export function isKnownLegitPattern(bareId: string): boolean {
  if (bareId.endsWith("-singleton")) return true;
  return KNOWN_LEGIT_PREFIXES.some(prefix => bareId.startsWith(prefix));
}

/**
 * Live concurrent-session guard per handlers.md §Step R-1b item 2: a lock owned by
 * a session that is CURRENTLY in the live session-presence roster AND itself
 * unexpired is NOT orphaned — it belongs to a concurrently-running sprint that
 * `.head` (single-slot) does not track by design (N-sprint concurrency).
 */
export function isLiveConcurrentSession(
  lock: LockRow,
  liveSessionIds: ReadonlySet<string>,
  nowEpochSeconds: number,
): boolean {
  if (!lock.owner_client_session) return false;
  if (!liveSessionIds.has(lock.owner_client_session)) return false;
  return lock.expires_at > nowEpochSeconds;
}

export interface R1bFilterResult {
  surviving: LockRow[];
  skipped: Array<{ bareId: string; reason: string }>;
}

/**
 * Apply Step R-1b to a batch of held locks. Locks matching either the known-legit
 * pattern whitelist or the live-concurrent-session guard are filtered OUT — they
 * proceed to neither R-2 nor R-3.
 */
export function applyR1bFilter(
  heldLocks: LockRow[],
  liveSessionIds: ReadonlySet<string>,
  nowEpochSeconds: number,
): R1bFilterResult {
  const surviving: LockRow[] = [];
  const skipped: Array<{ bareId: string; reason: string }> = [];

  for (const lock of heldLocks) {
    const bareId = bareTaskId(lock.task_id);
    if (isKnownLegitPattern(bareId)) {
      skipped.push({ bareId, reason: "known-legit-pattern" });
      continue;
    }
    if (isLiveConcurrentSession(lock, liveSessionIds, nowEpochSeconds)) {
      skipped.push({ bareId, reason: `live-concurrent-session:${lock.owner_client_session}` });
      continue;
    }
    surviving.push(lock);
  }

  return { surviving, skipped };
}
