# Decision Journal — Sprint TICK-PREFLIGHT-USAGE-INSTRUMENTATION · ba

**Sprint goal:** Replace the engineering ESTIMATE of silent-tick cost with a MEASURED number — per-invocation, append-only, local-file-only usage telemetry at each cron preflight script's verdict choke point.
**Agent:** ba
**Started:** 2026-08-12T13:14:51Z

---

### STEP ba-S1 · ba · 2026-08-12T13:18:36Z
**task-id:** BA-TICK-PREFLIGHT-USAGE-INSTRUMENTATION
**what-done:** Read PO's sprint_goal entry + full decision journal + backlog row `.desc` (4 findings, AC-1..AC-11, Q1-Q3), then re-read all 4 target scripts end-to-end at source. Wrote `docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md` (FR-1..FR-10, 5 NFRs, edge cases, zero PO blockers). Updated the BA backlog row in place (`ba_spec_complete`, `ba_handoff`, `ba_completed_at`, `next_agent:"architect"`) via `orch-apply.sh` — conservation clean (754→754).
**what-considered:**
- Only restating PO's AC-1..AC-11/Q1-Q3 verbatim vs. adding new source-verified findings.
- only: source re-read surfaced 2 real gaps PO's/router's framing missed — `exit_code` is not producible at the `_emit_verdict()` choke point itself (separate `return N` statement), and `elapsed_ms` hits the documented BSD-date-`%N` landmine with no existing portable pattern in this repo. Both are fault-injection-relevant given AC-4/AC-5's rigor, so surfaced as new FR-6/FR-7 + Q4/Q5 rather than silently assumed-solved.
**why-decision:** Added Q4-Q6 as explicit BA-flagged architect decision points (not decided myself, per the task's "flag it, don't decide it" instruction) — same treatment as PO's own Q1-Q3. Sharpened Q3 with per-call-site stdout-reachability evidence (only 2 of `run_probe()`'s 3 internal jq sites carry real double-log risk when invoked via `run_tiered_probe()`; the 3rd is unreachable in that mode).
**why-change:** No change from PO's scope/ordering/engine/ratio/session-id decisions — those are binding and carried forward unrenumbered. Only additive: 3 new decision points, not present in the PO row, found via source read.
