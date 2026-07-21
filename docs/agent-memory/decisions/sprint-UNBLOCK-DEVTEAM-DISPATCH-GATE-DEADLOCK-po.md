# Decision Journal — UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK

**task-id:** UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK
**agent:** po
**tick:** 2026-07-21T22:00Z
**trigger:** dev-team signal `board_deadlock_finding` (docs/signals/processed/dev-team-20260721T214221Z-board-drain-deadlock.json) — instance 9 on the count-threshold-gate class.

## The decision the signal asked PO to make (dead-gate ruling)

Verified at source (docs/agents/dev-team/flow/main.md):
- BOUNDED-1 gate L501-502: `(ready+in_progress) < 1`.
- SLS gate L534-535: `(ready+in_progress) < 2`.
Live board: ready=36, in_progress=1 → WIP=37. Both gates evaluate `37 < threshold` = false → **neither auto-pickup lane can EVER fire while ready[] is saturated.** The FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER SLS shipped today (now REVIEW) is therefore inert.

**RULING = BOTH (option c), decomposed:**
1. **WIP gate = `in_progress` ONLY** across BOUNDED-1, SLS, and any future auto-claimer. ready[] is a STAGING queue (enqueued work), not concurrency. The WIP≤2 invariant is a concurrency budget measured by in_progress, never by queue depth. Counting ready[] lets a saturated staging lane permanently starve the pickup machinery — the observed deadlock.
2. **Add a ready-lane consumer.** Gate-fix alone does NOT drain the 36 stranded ready rows: BOUNDED-1/SLS claim scripts only claim rows THEY stamped. 25 of the 36 (CCATO-MCP-T1..8, SYSREMAKE-P2-T1..9, DESIGN-COWORK-FANOUT-T1..8) are PM/architect epic children with a resolved `next_agent` and NO autonomous claimer. Add an idle-head consumer: claim the single top-priority ready row carrying a resolved `next_agent` → in_progress (bounded by in_progress cap, one at a time), set `.head`, direct-dispatch its `next_agent` (mirror SLS direct-dispatch, NOT zone-detect).
3. **review[] gets a QA-drain consumer** — exactly FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN's scope; fold it in.
4. **Acceptance instrument must test gate SATISFIABILITY, not lane resolution.** bounded1-supervised-lane-report.sh checks dispatch-lane!=none (lane resolution) — that is why the inert SLS shows green. New DoD instrument MUST build a live-shaped saturated fixture (ready≈36, in_progress=1) and assert the gate FIRES and drains ready→in_progress→dispatch (behavior, not label).

**what-considered:**
- Option (a) gate=in_progress-only ALONE — REJECTED as sufficient: does not drain the 25 stranded epic children (no claimer stamps them).
- Option (b) ready/review consumers ALONE — REJECTED as sufficient: leaves the gate un-satisfiable, so new backlog auto-pickup stays frozen.
- Mint a fresh SPRINT-S/FIX to backlog or ready — REJECTED: it would land in ready[] and strand in the very deadlock it fixes (vicious circle; empirically confirmed — last tick's architect BATCH rows are all sitting in ready[], "dispatch owed" per po.md carry-over).

**why-decision (dispatch type = UNBLOCK, not SPRINT-S):** UNBLOCK's S4 block is the only router path that does an immediate `task_claim` + direct `spawn route_to` with NO ready-lane promotion. A SPRINT-S/FIX entry is promoted to ready[] by the router, where — until this fix lands — it has no consumer. UNBLOCK→architect guarantees the keystone actually executes and breaks the circle.

**why-change (consolidation over churn):** instance 9 with a point-fix (SLS) shipped today already inert = churn-without-convergence. This single root-cause UNBLOCK SUBSUMES the cluster: reopen FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (REVIEW→ its SLS is inert until gate fixed — do NOT sign off on its lane-resolution instrument), fold FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN (#3), fold SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP (its general "count-threshold gates with structural-floor-≥-threshold" question = secondary sweep DoD), and adopt SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW's "one shared detail-resolution contract vs hole-by-hole" as the guiding design principle.

**Signals #4/#5 disposition (DEDUP, no mint — will drain once keystone lands):**
- #4 A-30 detector retune + signal_queue dedup → covered by existing FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE (backlog/high/architect). Ready-made predicate scripts/audits/verify-a30-mcp-memory-reclamation.sh; fire-only-on OOMKilled/>93%-no-dip/>97%-sustained.
- #5 gold-delivery-gap → SPLIT across existing FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT (delivery path: unified-agent has no inbox READ step; spawn-fanout Step 5 carries no payload — exact match) + FIX-CHEF-L6-GOLD-FALSE-PREDICATE (false gold >$4300 in 5 published dishes). Signal_queue has exactly 1 NEW row = po-20260720T052606 (dark to unified-agent — confirms the delivery-contract root cause).
- #1/#2 cowork telemetry (bctc slot-3 return-verified OK; A-30 12-probe FOLD) — informational, no action.
