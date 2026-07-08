# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · architect

**Sprint goal:** no goal set (sprint_id resolved from orch-state; no matching sprint_goal.entries description found)
**Agent:** architect
**Started:** 2026-07-08T00:00:00Z

---

### STEP architect-S1 · architect · 2026-07-08T00:00:00Z
**task-id:** FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM
**what-done:** Round-2 brownfield probe (live container RAW-query, not local decoy DB) found Writer H (`handlePushOhlcvHistory`, `/api/push-ohlcv-history`) never migrated to `writeOhlcvBatch` — actively re-contaminating up to yesterday, ~15-30min cadence. Appended findings to handoff + brief.
**what-considered:**
- Redesign repair predicate as boundary/discontinuity date-scan — REJECTED: flat cold-start seed bars (volume>0, confirmed live) would corrupt a boundary-scan's "clean data starts here" assumption.
- Keep existing per-row anchor-ratio predicate (order-independent, no boundary needed) — CHOSEN, already safe by construction.
- Fix Writer H locally (duplicate cross-day check inline) vs migrate to writeOhlcvBatch — CHOSEN migrate (DRY, reuses SSOT chokepoint, no new duplicated logic).
**why-decision:** Live evidence (VHM/VIC anchor=flat-seed value, numerically correct per PO) proves ratio-predicate math stays safe without redesign; Writer H migration closes the actual active leak with minimal diff, non-overlapping with stalled P0's narrower Rule-5 coercion fix on the same file.
**why-change:** Original 2026-06-30 design assumed CONTAM-10-WRITER (ohlcvWriteService.ts) alone would close the class — did not account for Writer H bypass; corrected in Round 2 with a new sequential EXEC gate on WRITER-H.

### STEP architect-S2 · architect · 2026-07-08T04:45:00Z
**task-id:** SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE
**what-done:** Ran full curl MCP handshake (initialize→notifications/initialized→tools/call) against live gateway — 100% success, proves server fully healthy. Cross-checked mcp-gateway container's own `call_tool invoked` logs: zero successful calls logged since 2026-07-04T19:10:48Z (~3.5d), surviving a 2026-07-07T16:35Z manual restart unchanged — defect is client-side, not server-side, and is a sustained outage not "some sessions."
**what-considered:**
- Trust the prior dev-team probe's bare stateless tools/list rejection as "server healthy" — REJECTED as incomplete: it never proved initialize itself succeeds, the actual thing the CLI client needs.
- Root-cause the CLI client internals directly — REJECTED: out of repo scope per task directive, can only hypothesize from external evidence.
- Extend mcp-call.sh for the 3 gateway meta-tools now vs defer — CHOSEN defer to a scoped FIX task (architect does not implement); scope proven feasible via the curl replay so the follow-up task carries a working recipe, not a research gap.
**why-decision:** Evidence chain (own-session blind + full live handshake success + 3.5-day container-log silence spanning an ineffective restart) triangulates cleanly on client-side/CLI-harness root cause from three independent angles — strong enough to close the SPIKE conclusively within timebox rather than extend.
**why-change:** Supersedes F1-GATEWAY-TRANSPORT-PROBE/F1-WRITE-MCP-JSON-GATEWAY/F1-AGENT-FATHER-BLIND-GUARD-REMOVE (already CANCELLED by PO pre-dispatch) — this SPIKE's evidence goes further than the CRITICAL bug-escalation that triggered the cancellation, adding the full-handshake proof and the container-log forensics.
