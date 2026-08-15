# PO Adjudication — FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE

**Date:** 2026-08-15T10:56Z · **Author:** po · **Trigger:** dev-team Review-Lane SECONDARY-Drain, servicing QA's `CHANGES_REQUESTED` (2026-08-06T17:45:22Z) which explicitly deferred two questions to PO.

**Verdict:** NOT `DONE_VERIFIED`. Rework, scope tightened, root cause pinpointed to line level. One sibling row minted.

---

## 0. What QA asked

1. Does SLOT_ID canonicalization belong on this row's own Step 0.5 marker-key derivation, or does it fold into `FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` (P0)?
2. Should a backfill-target-date parameter for `chef.md` retries be minted/routed (architect) before this row can claim `DONE_VERIFIED` against its own AC(3)?

QA was right to hold. Both answers below are backed by artifacts re-derived independently, not by accepting QA's prose.

---

## 1. Evidence

### A — QA's 07-30 pair, confirmed

| File | `cycle_id` | `dish_type` |
|---|---|---|
| `docs/data/unified-agent-synthesis-2026-07-30-evening.json` | `evening-2026-07-30T19:52:43Z` | **`evening_preview`** |
| `docs/data/unified-agent-synthesis-2026-07-30-chef-evening.json` | `evening-2026-07-30T19:59:12Z` | **`evening`** |

Both carry the identical full-dish schema (`causal_chains`, `clusters_summary`, `conviction_calls`, `known_gaps`, `metadata`, `sector_phases`, `tnb_synthesis`). Two independent full dishes, 6m29s apart, same real day. Confirmed.

### B — NEW, beyond `qa_note`: 07-30 double-dished TWICE, and the pattern predates and postdates it

The same `<bare>` vs `<chef->`-prefixed slot-token divergence produced a second pair on a **different slot the same day**, which QA did not count:

- `unified-agent-synthesis-2026-07-30-eod.json` + `unified-agent-synthesis-2026-07-30-chef-eod.json`

And the same pair shape exists on 07-29:

- `unified-agent-synthesis-2026-07-29-evening.json` + `unified-agent-synthesis-2026-07-29-chef-evening.json`

Every `chef-`-prefixed synthesis artifact that has ever existed: `2026-07-29-chef-evening`, `2026-07-30-chef-eod`, `2026-07-30-chef-evening`, `2026-08-13-chef-intraday`. Three of the four have a bare-token twin for the same date. **The token is not stable, and it is still not stable as of 2026-08-13** — two days before this adjudication.

(`2026-08-13-chef-intraday.json` is *not* a duplicate dish — different schema, `dish_type: "convergence_scan"`. It is naming divergence only. Not counted as a double-publish.)

### C — proof the filename token and the mutex-key token are the same variable

`docs/data/unified-agent-synthesis-2026-08-13-chef-intraday.json` records its own marker inline:

```json
"published_marker": { "key": "published:chef-intraday:2026-08-13:10", "ttl_seconds": 3600, "claimed_at": "2026-08-13T03:21:27Z" },
"metadata": { "slot_id": "chef-intraday", ... }
```

The slot token in the filename **is** the slot token in the marker key. Therefore a session that resolves the token to `evening_preview` computes `published:evening_preview:<date>` while a session that resolves it to `chef-evening` computes `published:chef-evening:<date>` — two distinct keys, both claims succeed, both publish. That is exactly the observed 07-30 outcome.

This is the only explanation consistent with the mutex primitive being sound, which is independently established: `FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` § `po_corroboration_20260730` records that under a live race "the ESC guard HELD correctly … the mutex primitive is sound". Same-key double-claim is not a live failure mode. Divergent keys are.

Live probe `task_list_held(kind="cowork-slot")` at 2026-08-15T10:53Z returns canonical keys only (`published:chef-evening:2026-08-14`, `published:chef-eod:2026-08-14`) — but the store holds only unexpired locks, so this **cannot** retroactively falsify 07-30. Artifacts are the only durable evidence, which is why AC(4) below is written against artifacts.

### D — line-level root cause

| Location | Code | Defect |
|---|---|---|
| `docs/agents/unified-agent/flow/chef.md:135` | `SLOT_ID = <slot_id from prompt>` | Bound from free-form invocation text. Never validated against `docs/data/cowork-schedule.json` `.slots[].slot_id`. |
| `chef.md:144` | `SLOT_RECORD = jq --arg s "$SLOT_ID" '.slots[] \| select(.slot_id == $s)' …` | On a miss this returns **empty with no fail-loud**. `CRON_EXPR` → null, `CRON_HOUR_FLD` → null, `IS_MULTI_FIRE` → false, and the flow **silently** falls into the single-fire branch and mints a non-canonical key. |
| `chef.md:164` | `MARKER_KEY = "published:" + SLOT_ID + ":" + CYCLE_DATE_UTC` | This row's fix canonicalized the **DATE** operand. The **SLOT_ID** operand of the same expression was left uncanonicalized. |
| `chef-dish.md:858` | `SLOT_ID = <dish_type> (morning \| intraday \| eod \| evening)` | **Rebinds the same variable name to a different value space** — in the file `chef.md:179-182` explicitly designates as the carrier of Step 0.5 session state. The observed `evening_preview` is not even a member of that enum. |

The contrast is the whole finding. The date operand is pinned with explicit *"never recomputed"* comments at `chef.md:138-141` and again at `chef-dish.md:837`, `:856`, `:929`, `:988`, `:994`. The slot operand has **zero** such discipline and is actively shadowed. This row fixed one operand of a two-operand key and closed the ticket.

Ordering note: the Phase-2 claim (`chef-dish.md:483-489`) consumes `MARKER_KEY` verbatim and runs at Step 7, *before* the Step 7.6 rebind, so within a single well-behaved session the rebind does not corrupt the claim. The defect is that **nothing forces two sessions to agree on the token in the first place**, and the flow doc offers two contradictory bindings of the same name for a reader to pick from.

---

## 2. Ruling (i) — SLOT_ID canonicalization belongs on THIS row

Three reasons, in order of force:

1. **Same orthogonality test this row already applied.** `po_escalation_20260728` states: "this row owns key DERIVATION only", with `UC-CCA-P3` owning release/immunity and the P0 owning why two sessions spawn. `SLOT_ID` is literally the other operand of the same `published:<SLOT_ID>:<DATE>` expression this row rewrote. Splitting one expression across two rows by operand is not a scope boundary.

2. **It is a PREREQUISITE for the P0, not a subset of it.** The architect's ratified Step 2.4 design (`docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md`) is a client-side **prefix match on `published:<slot_id>:`**, with `slot_id` read from `cowork-schedule.json`. If `chef.md` can still emit `published:evening_preview:…`, that probe misses and **the P0's own fix false-greens**. Folding SLOT_ID into the P0 would make the P0 depend on itself.

3. **The P0 cannot absorb it on schedule.** That row is an epic wrapper with `children: [TASK-COWORK-MUTEX-001..003]` already decomposed by pm, and carries a deliberate `supervised: true` hold PO has twice declined to clear. New scope added there inherits the hold.

**Not folded. Stays here.**

## 3. Ruling (ii) — backfill-target-date is NOT this row

A backfill-target-date parameter **adds a second date input** to `chef.md`. That directly contradicts this row's own AC(1) — *"single UTC date-derivation point in chef.md"* — which is a ratified design decision. Reversing a ratified AC is an architect call, not a rework item folded silently into the row it would reverse.

**Minted as a sibling row.** Independent reason this could not wait: the originating signal `cowork-20260806T064440Z-chef-evening-retry-date-drift` has **aged out of `.signal_queue.rows[]`** (rolling window) and appears on **no board row anywhere**. This row's `qa_note` was its only surviving record. Signing this row off without minting would have destroyed the last copy.

---

## 4. Revised acceptance criteria

- **AC(1) — HELD.** QA-confirmed across 9 post-fix dishes. Unchanged.
- **AC(2) — HELD.** Unchanged.
- **AC(3) — RESTATED** (the old wording is unverifiable retroactively; see §1C): `chef.md` Step 0.5 MUST resolve `SLOT_ID` to a canonical `.slots[].slot_id` from `docs/data/cowork-schedule.json`, and MUST **fail loud** — EXIT, no claim, no dish — when it cannot. The silent empty-`SLOT_RECORD` fall-through at `chef.md:144` is itself a defect.
- **AC(3b) — NEW:** `chef-dish.md` MUST NOT rebind the name `SLOT_ID`. Rename the Step 7.6 filename token (e.g. `DISH_TYPE`) and state once, explicitly, which of the two the filename derives from.
- **AC(4) — NEW, artifact-verifiable:** no two synthesis artifacts for the same slot and same UTC date may differ only by slot-token spelling. RAW-verify: `ls docs/data/unified-agent-synthesis-*` shows zero bare/`chef-`-prefixed twin pairs for any date after the fix lands.

## 5. Routing

`next_agent: agent-father` — `docs/agents/**` is its zone, and it authored the previous fix on this row (`review_note` 2026-07-28T23:57:07Z). After it lands, `next_agent → qa` for AC(3)/(3b)/(4).

`agent-father` is **off** the ratified DRS allowlist `{architect, ba, pm, po, agents-architect}` by policy (fleet-wide blast radius — `dev-team/flow/main.md:779`). Row is therefore placed in `ready[]`, where the Ready-Lane Consumer has **no agent-identity filter** and can claim it. Deliberate PO/router dispatch is also authorized. It is deliberately **not** put in `backlog[]`, which would strand it as `DRS-STRANDED-OFF-ALLOWLIST` — the exact stranding this row already suffered once (`status_note`, router 2026-07-29T00:03:46Z).

## 6. Residual, explicitly not closed here

Fixing `SLOT_ID` makes the marker **able** to arbitrate two concurrent sessions. It does not stop two sessions from being dispatched — `FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` (P0) still owns that, and its `occurrence_count` remains understated (this row's own `po_escalation_20260728` calls the 07-28 event occurrence 4 while the P0 row still reads 3; the 07-30 double-pair in §1B is further uncounted evidence). Both rows are required. Neither subsumes the other. Do not close the double-dispatch class on this row alone.
