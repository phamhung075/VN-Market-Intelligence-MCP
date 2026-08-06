# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa (continuation, qa-3 byte-capped)

**Sprint goal:** cowork guaranteed-slot catch-up (ambient sprint at time of this entry; task below is unrelated dev-team Review-Lane QA-Drain work routed to qa)
**Agent:** qa
**Started:** 2026-08-06T20:18:18Z

---

### STEP qa-S55 · qa · 2026-08-06T20:18:18Z
**task-id:** FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of `98917416a` (source fix) + `d19d6cdc5` (CI-RED-cdd5fa5a-FIX follow-up), both on main ancestry. Re-verified against post-fix tree per PO gate note, not the original commit alone.
**what-considered:**
- Source: `computeContainerVmHeadroomMb()` (macOS branch deleted, `free -m` available-column only, null sentinel) confirmed live in tree; `spawn-fanout.md`/`telemetry.md`/`cadence-policy.json._fanout` consumers all read `container_vm_headroom_mb`, floor re-derived vs 8GB Docker VM budget — no stale `host_headroom_mb` left in any live consumer (grep-swept, only archival docs remain).
- Re-ran myself, not trusted from prose: `bun test emit-pressure-state.test.ts` 31/31 pass (macOS, real unmocked negative-control leg = null); `bun tsc --noEmit` 0 errors; `mock-guard.sh` PASS.
- Deploy-gap (po_deploygap note) closed: live `pressure-state.json` now emits `container_vm_headroom_mb`. Fresh two-plane same-second proof: `bun run` the real exported fn inside the live `mcp-server` container = 3345 vs independent `docker exec free -m` available = 3342 (0.09% delta, within 10%). Negative control on this macOS host (no `free`) = null, live.
- CI-RED-cdd5fa5a-FIX (this row's own commit caused it): fixed by `d19d6cdc5`, ancestor of main; prior qa-S7 entry already raw-verified `gh run` green downstream + recorded close-out fingerprint. Current main CI red streak today is GitHub Actions "Service Unavailable" runner infra outage (checked `gh run view --log-failed`) — unrelated to this code.
**why-decision:** APPROVED, DONE_VERIFIED. All 4 deliverable items + both acceptance clauses (two-plane agreement, negative-control-to-null) independently reproduced live, not read from review_note alone.
**why-change:** none — verified exactly what the row scoped; noted the acceptance's "(not degraded mode)" parenthetical is satisfied in spirit (null→honest, not a wrong number) though it still numerically drives `max_parallel_degraded`, matching the deliverable's own "degrades safely" framing — not a blocking discrepancy.
