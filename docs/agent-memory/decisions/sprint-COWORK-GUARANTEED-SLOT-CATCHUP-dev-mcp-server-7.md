# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-mcp-server (continuation 7)

**Sprint goal:** see sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md header — this file is a byte-cap rollover continuation (dual-axis cap check; -6 capped 2026-08-25 on byte-axis).
**Agent:** dev-mcp-server
**Started:** 2026-08-28T23:44:00Z

---

### STEP dev-mcp-server-S96 · dev-mcp-server · 2026-08-28T23:44:00Z
**task-id:** FIX-BEHAVIORAL-VERIFICATION-GATE-SCHEMA-HARD-REJECT
**what-done:** Landed the last (7/7) of brief §9's files — §8A `checkVerificationGate()` behavior_predicate hard-reject in `orchStateSchema.ts`: `hasValidBehaviorPredicate()` helper + `BEHAVIOR_PREDICATE_CUTOFF('2026-08-26T19:57:54Z')` + `BEHAVIOR_PREDICATE_PRIORITIES{['P0','P1','high','HIGH']}` + reject branch inside the existing DONE_VERIFIED block; added BP-1..BP-7 unit tests (grandfather-by-time AC-6, priority-set AC-3, declared_at fallback, live-board no-wedge probe); refreshed stale size-justification header (1797L→1878L).
**what-considered:**
- Mirror `hasValidRawProbe` verbatim (safeParse VerificationSchema → read nested field) — chosen; `.passthrough()` keeps behavior_predicate schema-legal with zero migration, no new Zod schema needed.
- Add named `BehaviorPredicateSchema` under VerificationSchema (brief §9 optional) — rejected: pure typing nicety, changes parse semantics for a field the gate already reads defensively; AC-1's "schema-legal today via passthrough" is the binding constraint.
- Priority `=== 'P0' || === 'P1'` bare check — rejected: AC-3 measured 82x'high'+1x'HIGH' live; would silently under-scope to 61+317=378 rows and miss the set the brief explicitly names.
- Id-list grandfathering like RC_VERIF — rejected: AC-6 mandates grandfather-by-time (created_at<cutoff passes); id-list would wedge pre-cutoff rows nobody can fix by doing the work right (AC-4 no-wedge).
- Enforce pre-cutoff (no cutoff constant) — rejected outright: every P0/P1 apps/ row on the board predates the mint-time field; bare hard-reject would brick the hot file on next write (the exact deploy-ordering hazard this cycle exists to close).
**why-decision:** the ACs (agent-father flow_actuator_fix 3cf9b17b) are copy-executable and the brief §5c is the design SSOT — mirrored the proven hasValidRawProbe pattern, used the AC's exact priority set and cutoff, and verified zero live-board impact (jq probe: no DONE_VERIFIED P0/P1 apps/ row minted >= cutoff) before shipping so the gate cannot wedge the hot file.
**why-change:** none from plan — 136/136 orchStateSchema tests pass (incl. 14 new BP assertions), tsc clean, size-lint PASS, live orch-validate exit 0, server boot healthy (toolCount 184), PO gate `grep hasValidBehaviorPredicate` → GATE-PRESENT.

### STEP dev-mcp-server-S97 · dev-mcp-server · 2026-08-29T03:05:00Z
**task-id:** FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD
**what-done:** Three-layer recover guard shipped: shouldRunCatchup cadence='month' (per-cadence-period, success-only dedup) + startScheduler startup probe + shouldSkipMonthlyReplay T4 guard in runMonthlySignalQualityJob + registration recoverMissedExecutions false→true; one-shot backfill script executed live for June 2026 (SENT).
**what-considered:**
- Flip recoverMissedExecutions alone — rejected: node-cron re-seeds lastExecution at boot, can never replay a restart-spanning fire (proven no-op, row's own caveat).
- shouldSkipRecoveryReplay recency window (90% cadence) — rejected: a success 2 days before the next fire would wrongly skip a NEW target month; only a month-bound success proves the prior-month target sent.
- Backfill reuse of queryRejectionStats/generateAuditReport — rejected: their queries are all-time/current-month (separate known defect); script computes month-filtered stats itself, marker-row idempotent, no backdated rows.
**why-decision:** catch-up + per-target-month T4 guard + flag flip is exactly the row's mechanism_correction; any fire in a month resolves to the same prior-month target, so month-bound success-only dedup is both safe (no double WORK send) and complete (recovers the most recent miss).
**why-change:** June backfill executed during the fix (dry-run first; July deliberately left to the post-deploy catch-up to avoid a duplicate report); row's stale_action_note's two-month backfill expectation split accordingly.
