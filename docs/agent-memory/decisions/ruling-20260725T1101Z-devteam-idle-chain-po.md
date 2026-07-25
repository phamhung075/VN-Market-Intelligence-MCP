# PO Ruling — dev-team head-idle chain fairness · 2026-07-25T11:01Z

**Agent:** po · **Referred by:** router (throughput decision, explicitly PO's call not router's)
**Row:** `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION`
**Journal note:** filed as a standalone ruling record (precedent: `triage-*Z-po.md` in this
directory) rather than appended to `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po.md` — the active
sprint resolved by the decision-journal skill is unrelated to this dev-team-flow ruling, and
folding it in would pollute that sprint's trail.

---

### STEP po-S173 · po · 2026-07-25T11:01:56Z
**task-id:** FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
**what-done:** Raised P1→P0, PRE-SELECTED the design (aged round-robin + durable signal
handoff), extended acceptance to 4 hard ACs, folded+CANCELLED
`FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD` into it.
**what-considered:**
- (a) force Step 1 every Nth idle tick — rejected: special-cases ONE victim; ready[]/review[]
  starve by the identical mechanism and would stay starved
- (b) signal-age escalation ahead of the chain — rejected as primary: bounds one signal class,
  leaves the lane-ordering defect intact
- (c) gate BOUNDED-1 behind a triage budget — rejected: guards 1 of 4 short-circuiting lanes
- (d) accept as-is — rejected: the defect is destructive, not merely slow (see why-decision)
- (e) aged round-robin over all 5 consumers + durable pendingSignals — CHOSEN
**why-decision:** The chain is fixed-priority with a terminal JUMP in every lane, so the first
eligible lane wins every idle tick — measured 7/7 to BOUNDED-1, 0/7 to the other four. That is
lane-generic, so the fix must be lane-generic; (a)/(b)/(c) each patch one victim. Decisive
addition: Step 0a is destructive-before-delivery (moves files to `processed/`, writes the
fingerprint, marks queue rows READ) and hands off via `pendingSignals[]`, an in-memory per-tick
variable with Step 1 as its ONLY consumer — so a short-circuited tick does not defer its
signals, it destroys them. Rotation alone would still lose ~4 of every 5 ticks' signals, hence
durability is a co-required part, not a follow-up.
**why-change:** Row said "PO has NOT pre-selected". Changed: leaving the design open is part of
why it sat since 2026-07-22 — the architect ask had no decidable scope.

---

### STEP po-S174 · po · 2026-07-25T11:01:56Z
**task-id:** FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD
**what-done:** BACKLOG→CANCELLED, moved backlog[]→archive[], `folded_into` parent.
**what-considered:**
- keep as sibling row — rejected: both edit `docs/agents/dev-team/flow/main.md`; parent's own
  `.note` warns against racing that file
- keep as dependency/child — rejected: its remedy (guard BOUNDED-1 only) is strictly subsumed
- fold into parent as hard AC-2 — CHOSEN
**why-decision:** Its remedy covers 1 of 4 lanes and only DEFERS the drop (signal is already
moved+fingerprinted when the guard evaluates); parent's AC-2 requires a durable inbox that
prevents loss. Concern preserved verbatim as AC-2 with an explicit re-open instruction if
architect rejects durability in favour of the narrow guard.
**why-change:** Was P3 "latent hazard, mitigated by router discretion". No longer latent —
363 drained `routed-to-po` signals vs 1 Step-1 triage in the same 7d window.

---

## Evidence (verified live, not inferred)

| Claim | How verified |
|---|---|
| Fixed-priority chain starves 4 of 5 consumers | Control-flow inspection: `main.md` BOUNDED-1 :514 `JUMP TO execute`, SLS :575, RLC :628, QA-Drain :679 all `JUMP TO end`; Step 1 at :695 |
| BOUNDED-1 wins ~every idle tick | 7 claim commits 02:17Z–05:18Z, 0 RLC/QA-Drain (row's own `po_evidence_20260725T0948`) |
| QA-Drain never fires | live `qa[]=0` vs `review[]=106`, 73 rows `next_agent=qa` |
| `pendingSignals[]` never persisted | grep: appears only in `dev-team/flow/main.md` + `drain-signals.md`; in no script, no orch-state key |
| Drain is destructive before delivery | `drain-signals.md` §0a-1: mv to `processed/` + fingerprint INSERT + queue NEW→READ, all before Step 1 |
| Signals drained ≫ signals triaged | `signals.db`: 363 rows, all `result='routed-to-po'`, 2026-07-18..25, across 141 drain commits; exactly 1 Step-1 triage record (`triage-20260725T0948Z-po.md`, itself the out-of-band router workaround; prior is `triage-20260711T0053Z-po.md`, 14d earlier) |
| PO itself is NOT starved | 62 PO notebook commits in the same 7d window — the starved path is specifically dev-team Step 1 |

## Constraint honoured
BOUNDED-1 cap stays **1**. The selected design needs no cap change (it keeps its `WIP<1` gate
and 1-task lane; it simply stops winning every idle tick). Recorded as hard **AC-3**: diff-level
proof the cap is byte-unchanged. User gate of 2026-07-04 not touched.

## Premise correction recorded (not re-litigated)
The ~4-day non-dispatch of P0 `FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` had **two**
independent causes. The tick-plane fault (dead 05:18Z–10:37Z, re-armed ~10:10Z) is REAL and
CLOSED. It does not explain the preceding ~4 days: the row sat in `ready[]`, a lane with no
reachable consumer, and PO's ready→backlog re-route at ~09:51Z is what made it BOUNDED-1
eligible. Both facts stand; the second is why AC-1 must cover `ready[]`, not just Step 1.

## Dispatch blocker (router action required)
The row is `supervised:true` + `plan_only:true` + `owner/next_agent: architect` → it routes to
the **Supervised-Lane Sweep**, which is 2nd in the very chain it describes and therefore
unreachable behind BOUNDED-1. **This P0 cannot self-dispatch.** It needs an out-of-band
architect spawn — the same workaround the starvation itself forces. Classification is correct
(it IS a plan-first architect ask); do not clear the flags to make it auto-pickable.
