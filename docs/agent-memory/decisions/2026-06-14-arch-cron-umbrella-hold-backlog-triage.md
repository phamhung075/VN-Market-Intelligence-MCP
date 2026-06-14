# Decision Journal — ARCH-CRON umbrella HOLD-OPEN + backlog triage (S50)

**Session:** PO cycle S50 — umbrella close decision + accumulated-backlog triage on a FREE dev-mcp-server zone
**Task ID:** ARCH-CRON-SCHEDULER-RELIABILITY
**Timestamp:** 2026-06-14T14:45:14Z
**Zone:** apps/mcp-server/ (umbrella) + cross-service (triage)
**Commit:** 2be44824 (explicit-path: docs/data/orch/orch-state.json + scripts/po-s50-cron-umbrella-hold-backlog-triage.jq)

---

## Summary

T3-ARCH-CRON-WATCHDOG reached done_verified (router RAW-confirmed LIVE: watchdog fires, the 3
false "never ran" alerts eliminated, genuine-stale alerts correct). All 3 umbrella children
(T1 dedup-guards, T2 recover-jitter, T3 watchdog) are done_verified; dev-mcp-server zone now FREE.

**DECISION 1 — umbrella HOLD-OPEN, NOT closed.** Added a `MARKET-DAY-2026-06-15` re-verification gate.

**DECISION 2 — drained the signal backlog into the sprint** under WIP<=2 with the apps/mcp-server
zone serialized to ONE in-flight task.

---

## What Was Considered

### Decision 1 — close now vs hold open
- **Option A (close now on mechanism-complete + LIVE-watchdog self-monitoring):** all fix MECHANISMS
  are LIVE (T2 recover-jitter, T3 watchdog self-heal/alert); the watchdog itself now monitors the
  silent-miss blind spot. Faster idle.
- **Option B (HOLD-OPEN with a Monday market-day G1/G2/G3 LIVE re-verify gate) — CHOSEN.**

**Why B:** The umbrella's own success_metric is explicit — *"Prove the cluster auto-fires DURABLY,
not just that one manual run works; ship completion across the whole cluster, not one job."* G4
(dropped-tick regression test) and G5 (missed-fire watchdog) are MET by the done_verified children
and the watchdog is LIVE-confirmed. But G1/G2/G3 require LIVE VN-market-day auto-fire evidence
(ohlcvDailyAggregatorJob advances + 16 sectors leave N/A; vnstockFundamentalsRefresh repopulates
VCB/ACB/CTG; reputationComputeJob fires 08:30 under peer contention). **2026-06-14 is Sunday — VN
market CLOSED — so that evidence physically cannot be observed yet.** Closing on mechanism today
would repeat the EXACT anti-pattern that spawned this umbrella: the prior per-job
recoverMissedExecutions patch (53d00955) was marked done on a MANUAL trigger and RECURRED on
reputationComputeJob. Standing /goal = "ship the outcome not the mechanism." The risk window is
itself monitored by the now-LIVE watchdog (G5), so holding open one calendar day costs nothing.

Also corrected the record: QA cycle-269 mis-stated this umbrella as CLOSED — it is IN_PROGRESS,
held open on the Monday gate. Marked 5 stale BLOCKED duplicate sub-tasks
(TASK-ARCH-CRON-1A/1A-TEST/1B/1C/2) as SUPERSEDED by the shipped children.

### Decision 2 — triage priority
Priority order per standing /goal ("recheck/fix/improve last ship" + "generic fix on ALL
instances, never per-instance hardcode") and WIP<=2 same-zone serialization:
1. **FIX-REFINE-LOCK-TTL-RECLAIM** (P1, NEXT dev-mcp-server) — recurring + unblocks the refine
   pipeline. Generic TTL-steal of any expired lock (CAS on expires_at<now), not a per-instance
   manual clear. The [Lock orphaned by rebuild] LET-EXPIRE remedy has demonstrably FAILED (acquire
   refused 11.5h past expiry) → root-cause fix in the lock primitive itself.
2. **FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP** (high) — sequenced BEHIND #1 (same apps/mcp-server zone,
   one in-flight). Recurrence-prevention only; the double-post was already delivered to MARKET.
3. P2/P3 (base-rate, weekday-watchdog, context-bloat, bctc-route) stay in backlog — do NOT consume
   the single dev-mcp-server impl slot ahead of the HIGH/P1 pair.

Closed two already-resolved signals (workflow-protocol-coherence-audit IMPLEMENTED 85935da3;
dev-team-tool-contract-cron-overlap resolved by the live SF-1 single-flight). Distinguished the
digest-predict 13:47 "gateway not reachable in subagent" as the per-session init-miss
(False-infra-failure) class — NOT a dev bug — so it was not queued.

## Why Change From Plan

No change from the dispatched plan. Context pre-specified the priority (refine-lock-wedge first)
and the WIP/zone discipline; this cycle executed it and recorded the rigorous umbrella outcome-gate.

## Commit / Verification

- Explicit-path commit only. `coverage-state.json` + `cowork-schedule.json` were left dirty and
  unstaged (concurrent agent holds them) — verified NOT staged before commit.
- Script `scripts/po-s50-cron-umbrella-hold-backlog-triage.jq` is id-guarded idempotent
  (every append skips if id already on the board) + atomic temp→`[ -s ]`→rename.
- Post-run verification: umbrella po_decision=HOLD-OPEN; 2 ready[] tasks; 4 backlog tasks;
  5 SUPERSEDED; 0 signal_queue NEW remaining; board stamped po-S50.
