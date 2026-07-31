/**
 * Infrastructure — VPS Demand-Driven Queue Depth
 *
 * FIX-VPSHEALTH-DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE (2026-07-30)
 *
 * Some VPS proxy routes are DEMAND-DRIVEN: they push only when their own
 * work queue holds actionable rows, not on a fixed wall-clock cadence (e.g.
 * "bctc" pushes only when bctc_vps_queue has a report awaiting fetch). For
 * those routes a large last-push AGE is completely normal whenever the queue
 * is genuinely empty — that is an observation about the SOURCE queue, not
 * evidence the proxy/VPS itself is unreachable.
 *
 * Root-cause probe (2026-07-29, live): bctc_vps_queue held 0 `pending` rows
 * (328 deferred_infra, 85 done, 128 enrich_failed, 39 url_not_found) while
 * prices/news/sbv were all pushing normally on the SAME proxy in the same
 * window — proving the proxy was up and only the bctc route's own queue was
 * drained. The pre-fix staleness narration blamed the proxy anyway because it
 * derived its verdict from last-push age alone.
 *
 * Generic registry (no route-name/date literal beyond the map's own keys) of
 * demand-driven routes → the SQL used to count "actionable" rows in that
 * route's own queue. A route absent from this map is cadence-driven
 * (unchanged pre-fix behavior — no queue gate applies to it).
 *
 * "Actionable" mirrors the established `pending`-only convention already used
 * by the C-16 auditor check (queryBctcCounts, interface/mcp/routes/
 * fetchStatusHandler.ts): status values that represent live work still
 * awaiting a fresh VPS push. Terminal/parked states (done, deferred_infra,
 * enrich_failed, url_not_found) are deliberately NOT counted here — they are
 * rows the pipeline has already finished or given up on pending a separate
 * policy/gate decision (e.g. ALPHA-S6-OPTIONB-DECISION-GATE), not work the
 * proxy itself could push right now.
 *
 * Split out of vpsPushLogStore.ts (task FIX-CI-SIZELINT-MCPSERVER-SIX-
 * UNCOVERED-OFFENDERS AC-4) to bring that file back under its size-lint
 * baseline tolerance — re-exported from vpsPushLogStore.ts so existing
 * imports of DEMAND_QUEUE_SQL/getDemandQueueDepth from that path are
 * unaffected.
 *
 * Layer: infrastructure/db
 */

import type { Database } from "bun:sqlite";

export const DEMAND_QUEUE_SQL: Readonly<Record<string, string>> = {
  bctc: `SELECT COUNT(*) AS actionable FROM bctc_vps_queue WHERE status = 'pending'`,
};

/**
 * Returns the count of actionable (still-awaiting-push) rows in a
 * demand-driven route's own work queue.
 *
 * @param db      Database instance
 * @param service VPS proxy service name (e.g. "bctc", "prices")
 * @returns
 *   - a number >= 0 when the route is demand-driven (has an entry in
 *     DEMAND_QUEUE_SQL) and the query succeeds
 *   - `null` when the route is NOT demand-driven (cadence-driven routes are
 *     unaffected by design), or when the underlying table is absent
 *     (fail-open — older schema / minimal test fixture — never fabricate a
 *     verdict from a missing table)
 */
export function getDemandQueueDepth(db: Database, service: string): number | null {
  const sql = DEMAND_QUEUE_SQL[service];
  if (!sql) return null;
  try {
    const row = db.prepare(sql).get() as { actionable: number } | undefined;
    return row?.actionable ?? 0;
  } catch {
    return null;
  }
}
