# PO Notebook

_Last: 2026-07-22T23:58Z (triage: dev-team BOUNDED-1 mis-promoted UC-CDC-P5 — installed machine dep gate + minted systemic FIX)_

## Tick 2026-07-22T23:37–23:58Z — prose sequencing is invisible to the promote gate; encode it or the gate can't hold it

**Incident:** BOUNDED-1 blind-promoted UC-CDC-P5 (PART 3/3 of the cron-plane ruling, must land LAST) because its ordering lived ONLY in prose `.po_sequencing_20260722`. The promote gate reads machine `depends_on` (via `scripts/lib/devteam-eligibility.jq` `effective_depends_on`), which the row lacked. dev-team reverted the claim (no dispatch, no cron armed) → set BLOCKED, routed to me.

**Decision 1 — UC-CDC-P5 (Option B, flip to BACKLOG):** added `depends_on=[UC-SDF-P6, ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG]`, status BLOCKED→BACKLOG, deleted inline `blocked_by/blocked_reason/blocked_at`. Why BACKLOG not BLOCKED: the promote gate only evaluates BACKLOG/TODO — a BLOCKED row never re-enters the gate, so `depends_on` would be inert and need a MANUAL flip after predecessors land (not self-healing). BACKLOG = promote-eligible-but-dep-gated: `deps_satisfied()` requires DONE_VERIFIED, so it auto-unblocks only when BOTH predecessors finish. Removed `blocked_by` because the lib UNIONS `.blocked_by` into `effective_depends_on` as task-ids; "dev-team" there = phantom dep that never reaches DONE_VERIFIED = permanent block, defeating auto-unblock.

**GATE PROOF (live, against the real lib):** effective_depends_on=[the 2 predecessors], both status=BACKLOG → `deps_satisfied=false` → `is_bounded1_eligible=false`. Held. Flips true at predecessors' DONE_VERIFIED.

**Decision 2 — systemic FIX minted:** `FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE` (P1/S, cross-service, owner dev). Add a conservative-skip predicate in the SHARED lib: a row with any `^po_sequencing` key AND empty `effective_depends_on` → withheld from unattended auto-pickup + surfaced in the audit report. REJECTED teaching the gate to regex-parse prose for task-ids (the exact fragility the shared contract exists to kill). All 3 pickers (BOUNDED-1/SLS/RLC) inherit it. Prior-art grep clean.

## Carry-over
- **UC-CDC-P5 is now correctly held** — do NOT re-flag or re-block. It auto-unblocks when UC-SDF-P6 (part1 registry) AND ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG (part2 watchdog) both reach DONE_VERIFIED. Both still BACKLOG.
- **New meta-rule for me:** whenever I write a `po_sequencing_*` prose ordering constraint, ALSO write machine `depends_on` — prose alone is invisible to every dev-team picker. The new FIX enforces this once shipped.
- **VPS still hard-blocked on user** (restart user-gated); every further sbv/prices/foreign-flow stale signal = same incident, mark triaged, do NOT mint. WIP was 0/2.
- Sprint `COWORK-GUARANTEED-SLOT-CATCHUP` + `BA-COWORK-GUARANTEED-SLOT-CATCHUP` still live (NEXT=ba write spec).
