# Decision Journal — Sprint DATA-SERVE-INTEGRITY · dev-macro-indicators

**Sprint goal:** (ambient — task picked up via BOUNDED-1 idle-capacity auto-pickup; journal path explicitly designated by dispatching coordination session, distinct from the fleet's own active `sprint_goal.entries[]`)
**Agent:** dev-macro-indicators
**Started:** 2026-07-30T21:52:00Z

---

### STEP dev-macro-indicators-S1 · dev-macro-indicators · 2026-07-30T21:52:04Z
**task-id:** FU-SBV-EFFECTIVE-DATE-COLUMN
**what-done:** Traced the full sbv_rates schema+write path before touching any file; declined to implement — every required change (migration, fetcher population, cron wiring) is outside apps/macro-indicators/; corrected zone/owner in orch-state.json (moved in_progress→backlog) and backlog-detail.json, reset `.head` to idle.
**what-considered:**
- Grep-confirmed `apps/macro-indicators/` (Go pilot) only READS sbv_rates: `pkg/infrastructure/repositories_sbv_rate.go` `SBVRateSQLiteAdapter.GetRate` is a single read-only `SELECT ... LIMIT 1`, safe-degrade (0,nil) on any absence — zero INSERT/UPDATE/ALTER anywhere in the Go tree.
- Grep-confirmed the CREATE TABLE + all ALTER-column migrations for `sbv_rates`/`sbv_rates_history` live in `apps/mcp-server/src/infrastructure/db/schema-macro.ts` (L141-176, incl. the exact try/catch ALTER-column pattern this task should reuse for `effective_date`); the sole writer `storeSbvSnapshot()` + reader `fetchSbvRates()` live in `apps/mcp-server/src/infrastructure/fetchers/sbv.ts`; the 4h cron wiring is `apps/mcp-server/src/scheduler/macro/sbvRatesJob.ts`; the VPS-side push script that would need to source/stamp the decree date is `vps-scripts/fetch-sbv.sh` (repo-root, ops-owned) → `pushSbvRatesHandler.ts`.
- Confirmed via the origin brief (`docs/architecture-briefs/2026-06-04-data-serve-integrity.md` L86) this task's own spec text: "add `effective_date TEXT` to `sbv_rates` and populate it in the SBV VPS fetcher" — that IS the mcp-server/vps-scripts write path, not macro-indicators.
- Considered implementing anyway since the diagnosis was fully in hand — REJECTED: hard `zone_restricted: apps/macro-indicators/` + `not_my_job` clause in my own init.md; this is also the SECOND live occurrence of this exact SBV-zone-mislabel class (1st: FIX-SBV-FETCHER-ZERO-VALUE-EMIT, declined 2026-07-28, same root cause).
- Considered leaving the row silently `in_progress` under my ownership — REJECTED: would strand a dispatchable P3 row behind a dead-end owner; moved to `task_board.backlog` with zone/owner corrected to `apps/mcp-server/`/`dev-mcp-server`, full trace embedded (`root_cause`, `generic_mandate`, `zone_corrected_by/at`, `note` flagging the recurrence for PO), `.head` reset to idle/router via `scripts/orch-apply.sh` (exit 0, conservation OK 727/727 tasks).
**why-decision:** Zone boundary is a hard, spec-internal constraint (CANONICAL AUD-CP-1 precedence rule: a caller/dispatcher instruction that contradicts a documented agent-spec invariant does not override it) — forcing a same-diagnosis fix into a different agent's zone would violate CLAUDE.md zone-restriction discipline and fabricate ownership of code I don't maintain.
**why-change:** BOUNDED-1's task brief inherited the origin backlog row's `zone: apps/macro-indicators` label (mint-time heuristic: macro-indicators CONSUMES sbv_rates for carry/yield, not that it OWNS the write path); live code inspection falsified that. No code touched in either zone. No G12 sandbox run (nothing to verify). No REVIEW flip — task returned to BACKLOG with corrected owner, not DONE. Task lock `task:FU-SBV-EFFECTIVE-DATE-COLUMN` NOT released by this agent — INV-GATEWAY-1 reserves task_claim/task_release to the dev-team dispatcher session that holds it; flagged in notebook for that session to release.
