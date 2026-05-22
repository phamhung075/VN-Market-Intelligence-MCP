# PO Notebook

## Last updated: 2026-05-22T01:20:05Z · Cycle: c245 — cron-0107Z dev-team triage (BATCH=1 FIX:1960-DAILYDASH)

> Archive: c244 trimmed per L-2 baseline; carry-over below preserves L42..L57.

### c245 trigger
Dispatcher claim `task:po-triage-20260522-0107` held. Prompt said BATCH=NOTHING expected. Drain pile = 5 cowork-team heartbeats / prior self-batch (no actionable). BUT re-audit per L55 caught **3 NEW system-auditor commits** in the 1h post-c244 window (dc5c7170, 7b72bc5d, 16be4332) surfacing **6 NEW anomalies** that the dispatcher prompt did not know about.

### Triage of 6 NEW system-auditor anomalies
- **1960-A-21 + 1960-A-21b** (vnstockFundamentalsRefresh + vnstockTradingStatsRefresh both CRASHED 4d) — **DEDUP**. Already covered by TASKS.md row `1967-06` HIGH (gated 2026-05-22T21:00Z) + `OBSERVE-1955e` DEEP-HOLD (same unlock; payload explicitly names both jobs). System-auditor is re-firing the same root cause on the hour; gate counts down ~20h.
- **1960-A-21c / 1960-DAILYDASH** (dailyDashboardJob ENOENT `/docs/data/project-stats.json` 5d dead) — **NET-NEW + SHIPPABLE**. Located bug: `apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts:455-460` uses local `projectRoot()` helper `path.resolve(import.meta.dir, "../../..")` resolving to `/` in container (Bun import.meta.dir vs Node difference, or 3-vs-4 levels). Host file exists; docker-compose mount line 16 correct (`./docs/data/project-stats.json:/app/docs/data/project-stats.json:ro`). Sibling jobs (agentMemoryTools, trackSessionToolUsageJob) already use canonical `getProjectRoot()` from `infrastructure/projectRoot.js`. Fix: replace local helper + switch 4 callers (lines 469/496/505/519). XS, NOT BCTC-touching, NOT market-hours-contextual. Dispatched.
- **1960-A-29** (bctcReparseJob 84.2% WARN) — **DEFER**. NFR-3 BCTC freeze (1953-G-FAIL); 1954c owns root. No parallel BCTC patches.
- **1960-B-04** (ssc-iboard 16h stale) — **OBSERVE**. Market opens 02:00Z (~40 min). Per L56 (B-02-NEW self-recovery precedent), wait for market-open push.
- **1960-B-08** (bctc-push 65h stale) — **DEFER**. Same NFR-3 freeze logic as A-29.
- **1960-B-12** (foreign-flow 24h stale) — **OBSERVE**. Same market-hours logic as B-04. Suppress-outside-market-hours meta-fix deferred to future maintenance sprint.

### Verdict
**BATCH=1 FIX:1960-DAILYDASH** (dev-mcp-server, XS, no gate). Dispatcher NOTHING hint overridden. 5 of 6 anomalies handled via dedup/defer/observe; 1 net-new shippable.

### Actions completed this cycle
- Emitted `docs/signals/po-c245-cron-0107Z-batch-fix.json` (full rationale + 6-anomaly audit + L57 lesson).
- TASKS.md: appended `1960-DAILYDASH` HIGH FIX row at top of Backlog with AC-1..AC-5.
- DASHBOARD ops housekeep: all 9 system-auditor rows (3 from 00:31Z sweep + 6 from 01:04Z re-fire) annotated DEDUP-GATED / ROUTED / DEFER-FREEZE / OBSERVE. `_Updated:_` header → c245.
- DASHBOARD ## po: added `c245-BATCH` row pointing to signal.
- pipeline-state.json: status + activeTaskId + nextAgent + nextPrompt refreshed; fleet no longer IDLE (1 task dispatched).
- WORK channel notify (post-commit).
- Overwrote this notebook.

### Gates preserved (unchanged from c244)
- `2026-05-22T21:00Z` — OBSERVE-1955e DEEP-HOLD unlock → 1967-06 + 1959-watchdog-4 + A-21/A-21b root investigation unblock.
- `2026-05-22T03:00Z` — tasksMdJanitor cron #2 (1965c soak observation #2).
- `2026-05-23T07:05Z` — OBSERVE-1957d BCTC 72h cadence gate.
- `2026-05-23T18:00Z` — 1965c soak ends.
- BCTC NFR-3 freeze in force (1953-G-FAIL).
- Standing OBSERVE: 1957d, 1955c, 1955e, 1907a-verify, 1941b, 1922g.

### Next dev-team triggers
1. Next cron tick: dev-mcp-server picks up 1960-DAILYDASH from TASKS.md Backlog (or PM slates it depending on routing).
2. `02:00Z` market open → B-04 + B-12 self-recovery probable; system-auditor next sweep verifies.
3. `2026-05-22T21:00Z` OBSERVE-1955e unlock → 1967-06 + watchdog-4 + A-21/A-21b root investigation actionable.
4. 1960-DAILYDASH QA cycle on dev-mcp-server PR.

### Lessons encoded this cycle
- **L57: BATCH=NOTHING dispatcher hints are SUGGESTIONS, not invariants.** Always re-audit DASHBOARD ops + last 5 commits before ratifying NOTHING — system-auditor Tier-1 fires hourly and surfaces real bugs on hour boundaries. c245 caught 3 NEW system-auditor commits in the 1h window post-c244 (dc5c7170 + 7b72bc5d + 16be4332). Dedup logic (cross-check anomalies against existing TASKS.md row IDs + OBSERVE gates) is what makes the BATCH tractable. Without it, dispatching FIX for A-21/A-21b would have collided with 1967-06 + OBSERVE-1955e (recurring-bug-escalation risk per c241 L42-derived rules).

### Carry-over from c244
- L42..L56 retained; L57 added this cycle.
- Sprint 1968 CLOSED 2026-05-21T20:53Z; 1968c CLOSED 2026-05-21T22:52:44Z; Phase 3 cumulative ~50% cowork-cycle token efficiency hit.
- Sprint 1959 OPEN until watchdog-4 ships (~2026-05-22T21:00Z+).
- Sprint 1965 in 1965c soak (through 2026-05-23T18:00Z).
- Sprint 1967 active long-tail: 01/02/03/04/05/12 DONE+QA-APPROVED; 06 gated; 07..11 agent-father MED queue.
- BCTC freeze (NFR-3) in force; 1954c is next structural unlock.
- L55: cowork-lane drain != dev-team backlog (still valid; cowork heartbeats this cycle drained as informational).
- L56: system-auditor data_stale rows can self-resolve via downstream evidence (applied to B-04/B-12 OBSERVE deferral this cycle).
- All standing OBSERVE gates preserved.
