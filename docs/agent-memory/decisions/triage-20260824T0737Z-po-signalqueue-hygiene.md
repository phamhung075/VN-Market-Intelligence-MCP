# PO ruling — signal-queue hygiene triage, dev-team tick 2026-08-24T07:37Z

Session `7fd9c60a-9854-4589-9e98-e4c5e7e9168d`. Scope-limited triage of three router-supplied
findings plus one NEW row. No full PO cycle, no channel audit, no Step 0-SIG.

Board/queue mutations landed via
`scripts/po-ruling-20260824T0737Z-signalqueue-hygiene-triage.jq` (13 signal rows, 3 board-row
enrichments, 1 mint; signal count conserved 118→118, backlog 506→507). Full per-row reasoning is
inline on each row (`po_ruling_20260824T0737Z` / `retraction_reason` / `disposition`). This file
records the two rulings that have **no row to live on**: the drain-safety correction owed to the
router, and the cross-finding pattern.

---

## RULING — the router's drain-skip reasoning is WRONG. Drain normally.

**The router wrote:** *"`--count-drainable` returned 2. The router deliberately did NOT run the
drain, because the drain marks to=po rows NEW→READ while PO selects on NEW."*

Both halves are false. Three predicates settle it, all read at source this tick:

**1. `--count-drainable` does not count queue rows at all.** `scripts/agents-flow/drain-signals.js`
lines 115-127 — the subcommand reads `fs.readdirSync(SIG)` where `SIG` is `docs/signals/`, filters
`.endsWith('.json')`, and counts the ones passing `isDrainableShape()`. It never opens
`orch-state.json`. `drainable_count=2` meant **two signal FILES** were waiting in `docs/signals/`.
It carries zero information about the 118 queue rows and can never be a reason to skip a drain on
their account. (Re-measured at 07:5xZ: `drainable_count=1`.)

**2. The script does not touch queue-row status.** `docs/agents/dev-team/flow/drain-signals.md:146`,
verbatim: *"The script does NOT cover §0a-D (queue row READ-marking) or this flow's own §0a-D-PRUNE
commit — those stay in this flow."* Same statement at `drain-signals.js:7`. The script's only
`orch-state.json` writes are the `payload_ref` repoint (FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE) and the
durable-inbox append. Running it could not have hidden `sys-20260824T041052-44c9`.

**3. Even the flow's §0a-D flip is safe, by construction.** `drain-signals.md:30-32` and the jq at
`:97` — the `NEW→READ` flip is *combined into the same `orch-apply.sh` write* as the durable-inbox
append, all-or-nothing (`:108`: on append failure *"rows left NEW"*). A row that leaves `NEW` has
already landed as a full envelope in `.dev_team_idle_chain.pending_triage_inbox`, which PO drains at
`docs/agents/po/flow/triage-signals.md` § Step 0-SIG. Delivery moves from the `NEW` selector to the
inbox; it is not lost.

**Consequence:** the router has been skipping a needed drain. Signal files sat undrained on a
reason that does not apply to the artifact it named.

**The router's underlying worry is real but belongs to a different drain.** The recorded defect
(`feedback_cowork_drain_marks_po_rows_read_but_po_selects_new_and_has_no_slot`) is about the
**cowork** drain — `docs/agents/cowork-team/flow/work-tick.md:16-17`, which says *"route to matching
agent slot at Step 5 or log for PO"* and *"Mark each processed row NEW → READ"* with **no durable
append**, and there is no `po` cowork slot. That drain can strand a `to=po` row. The **dev-team**
drain cannot. Two drains, one name, opposite safety — do not generalise between them.

---

## PATTERN — 2 of the 3 stranded A-29 rows were false positives, and the strand hid that

`sys-20260814T064301-a29s1` (brokerSanctionsSweep) and `sys-20260814T064302-a29s2`
(ragFtsRebuildCron) were both retracted on inspection; only `sys-20260814T064300-a29m`
(monthlySignalQualityAudit, CRITICAL) was real. Both false positives share one shape: **the A-29
detector reads `last_fire` and compares it to a flat threshold without reading the job's own
registration.** One is quarter-guarded in its job body (`schedulerJobTable.ts:868-873`, non-quarter
Fridays record `status='skipped'`); the other is behind an explicit default-OFF safety gate
(`schedulerJobTable.ts:140`, `CRON_RAG_FTS_REBUILD_ENABLED ?? 'false'`). A 36h threshold against a
quarterly cadence over-fires ~60x; a staleness threshold against a deliberately disabled job fires
forever.

This is worth stating because the dead-letter status was not the only cost: it also **hid a 2-in-3
detector false-positive rate for ten days**. Recorded on the `.evidence` of
`FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING` so the architect ruling sees it.

---

## What was NOT done, and why

- **No mint for the status-casing consumer axis.**
  `FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING` (minted 2026-08-23T10:33Z)
  already owns it. Enriched instead — it had no `dedup_key`, no `root_cause`, no `ac` at mint.
- **No mint for the CRITICAL cron gap.** `FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD`
  (2026-07-30) already names `schedulerJobTable.ts:229`. Expedited P2→P1 instead.
- **No mint for the CCATO flood.** `FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID`
  already owns it with 8 ACs. Expedited P1→P0 and re-evidenced instead.
- **No mass prune of the 72 `ntg-*` rows.** Their `ts` is `2026-08-24T00:00:00Z`, so
  `orch-cold-evict.sh`'s `>24h` age gate cannot fire before 2026-08-25T00:00Z. The fix is at the
  producer (that row's AC-6/AC-8), not a hand prune. A hand prune would also destroy the batch
  evidence while the actor is still live.
- **`po-decision-bug5468-…` left at `NEW`, not closed.** Its MITIGATION clause (reset
  `reconcile_attempts` if any of the 21-row cohort reaches 6-7) is a standing, unactuated
  instruction. Closing it would evict the only place that instruction is queued. It stays `NEW`
  until `to:ops` delivery exists (AC-1 on the enriched architect row).
- **`.dev_team_idle_chain.pending_triage_inbox` (70 entries) not drained** — that is Step 0-SIG,
  explicitly out of scope this tick.
- **Nothing pushed.** PUSH-AUTONOMY-1 unsatisfied; pre-push independently red on
  `pushBctcLayoutHandler.ts` (252L vs the 250L size-lint gate), tracked P0 at
  `FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L-BLOCKS-ENTIRE-FLEET-PUSH`.

## Routing note for the router

`FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING` will **never self-promote**.
`next_agent: "architect"` is a non-dev value, so the BOUNDED-1 NON-DEV-NEXT_AGENT GATE
(`docs/agents/dev-team/flow/main.md:640`) holds it out of idle auto-pickup, and it is not
`plan_only`, so the Supervised-Lane Sweep does not see it either — the documented residual gap
(*"a row gated here WITHOUT plan_only is a tracked residual gap (no dedicated sweep lane yet)"*).
It needs deliberate architect dispatch. `plan_only`/`supervised` were deliberately not flipped to
force SLS eligibility: that risks the null-`dispatch_lane`/unspawnable-head failure recorded in
`feedback_sls_primary_claim_null_dispatch_lane_yields_unspawnable_head`, and hiding a routing gap
behind a flag flip is not a fix.
