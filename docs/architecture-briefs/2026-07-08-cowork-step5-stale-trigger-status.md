# Cowork Step 5.0 Backstop Discriminator — Stale `trigger_status` Fix

**Date:** 2026-07-08T21:29:52Z · **Author:** agents-architect · **Type:** FIX, size S, zone `agents`
**Task:** `FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS` (PO triage, dev-team tick 2026-07-08T21:07Z; `docs/agent-memory/notebooks/po.md` line 164)
**Files touched by this brief's recommendation:** `docs/agents/cowork-team/flow/spawn-fanout.md` (Step 5.0) + `docs/data/cowork-schedule.json` (`.slots[].trigger_status`, 9 rows). Both already carry `_maintained_by: "agent-father (via architect brief only)"` — not a standard dev-* zone, hence this brief instead of a direct dev-team dispatch.

---

## 1. Problem (re-verified, not taken on PO's word)

`spawn-fanout.md` Step 5.0 (L14) classifies matched cowork slots during a gateway-blind tick:

```
BACKSTOP_SLOTS    = [s for s in WON_SLOTS if s.trigger_id != null AND s.trigger_status == "active"]
```

Slots landing in `BACKSTOP_SLOTS` are logged `"deferred to cloud backstop"` and **skipped** — the dispatcher trusts that a live cloud RemoteTrigger will independently deliver the dish. `cowork-schedule.json` currently has **9 slots** with `trigger_status: "active"` (chef-morning, chef-eod, chef-evening, digest-sunday, tnb-audit, fb-daily, fb-weekend, alert-commander-market, alert-commander-critical), but **cloud RemoteTrigger Layer A is fully retired** (STANDING `feedback_no_remote_trigger_all_local`, 2026-06-22 directive; all-local cutover confirmed done 2026-06-23T17:22Z per `feedback_local_cowork_subagents_gateway_blind`). `trigger_status` was never resynced after that cutover — it is dead, stale data that Step 5.0 still treats as authoritative.

**Live evidence this session** (cowork-team's own tick-reports, already processed — `docs/signals/processed/cowork-team-20260708T201500Z.json`, `-20260708T203500Z-correction.json`, `-20260708T210000Z.json`):
- 20:15Z tick trusted `trigger_status=="active"` and deferred tnb-audit as "safe," while independently flagging `fb-daily has trigger_id=null but trigger_status='active' — inconsistent/dangling`.
- 20:35Z **CRITICAL correction** retracted that call: a live `RemoteTrigger(action=list)` call that same session showed **all 6 cloud triggers `enabled:false`**, `last_fired_at`/`next_run_at` frozen at 2026-06-22/23. Revised tally: 6 real guaranteed-slot misses this session alone, none with a working fallback.

I independently re-derived the blast radius from the live file rather than reusing PO's count:

```
jq '.slots[] | select(.trigger_id!=null and .trigger_status=="active") | .slot_id' docs/data/cowork-schedule.json
→ chef-morning, chef-eod, chef-evening, digest-sunday, tnb-audit   (5 — real trigger_id, live consumer's actual blast radius)

jq '.slots[] | select(.trigger_id==null and .trigger_status=="active") | .slot_id' docs/data/cowork-schedule.json
→ fb-daily, fb-weekend, alert-commander-market, alert-commander-critical   (4 — never reach BACKSTOP_SLOTS regardless, per Step 5.0's `trigger_id != null` guard; data-hygiene only, not live-defect blast radius)
```

Full git history scan (`git log --all -- docs/data/cowork-schedule.json`, all 147 revisions) confirms these 4 **never had a real cloud `trig_...` id at any point** — their `trigger_status: "active"` was never accurate, not merely stale-since-retirement. This is a distinct, milder data-hygiene defect from the 5 real-trigger slots (which genuinely had a working cloud backstop until 2026-06-22/23, then went stale).

Grepped the whole live tree for other `trigger_status` readers: `spawn-fanout.md` is the **only live consumer** that branches on it. All other hits (`cowork-master-cron-runbook.md`, historical briefs/decisions, `.claude/commands/crons/cron-cowork-team.md`) are prose/history, not executable logic.

## 2. Relationship to adjacent in-flight items (no duplication)

| Item | Scope | Why this brief doesn't duplicate it |
|---|---|---|
| `F1-CLOUD-TRIGGER-DECOMMISSION` (BACKLOG, owner `po`, `docs/data/orch/orch-state.json` id `F1-CLOUD-TRIGGER-DECOMMISSION`) | Flips the 5 real-trigger slots' `trigger_status` → `"decommissioned"`, gated on **≥2 successful local-launchd fires logged per slot**, plus rewrites `cron-cowork-team/SKILL.md` + `cron-jobs.md`. | Different target value (`"decommissioned"`, evidence-gated, terminal) vs. this brief's interim value (`"superseded"`, ungated — see §3.2). F1 still has real, distinct future work once its evidence gate closes; this brief does not pre-empt it, only stops the field from actively lying in the meantime. `F1-LAUNCHD-COWORK-BACKSTOP` (the local firer F1 is gated on) is already `DONE_VERIFIED` (`orch-state.json` L8985-86), so F1 is unblocked and can proceed independently on its own timeline — not blocked by this brief either way. |
| `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` §5 task #5 | Corrects `docs/protocols/cowork-master-cron-runbook.md` prose + `cowork-schedule.json._notes.layer_a_deletion_locked` (already landed — see `docs(agents): DOC-COWORK-CRON-RUNBOOK-FRESHEN` commit `05a8bffa6`). | Touches `._notes.*` (top-level), never `.slots[].trigger_status` (per-slot) or the Step 5.0 consumer. Disjoint key paths, already done. |

Neither adjacent item touches the Step 5.0 consumer or the per-slot field the way this brief does — the masking defect itself has no owner until this brief.

## 3. Fix design

### 3.1 — Step 5.0 discriminator (`docs/agents/cowork-team/flow/spawn-fanout.md`, L11-15)

Re-key on `_superseded_by` (already-maintained, semantically correct field: `null` = still cloud-trigger-backed, non-null = cloud role retired for this slot) instead of `trigger_status`:

```diff
   # Classify each matched slot by backstop coverage
-  # Source of truth: docs/data/cowork-schedule.json .slots[].trigger_id + .trigger_status
+  # Source of truth: docs/data/cowork-schedule.json .slots[].trigger_id + ._superseded_by
+  # trigger_status is DEPRECATED as a discriminator (FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS,
+  # 2026-07-08): never resynced after the 2026-06-22/23 cloud RemoteTrigger decommission
+  # (STANDING feedback_no_remote_trigger_all_local) — reads "active" on slots with zero live
+  # cloud backstop. _superseded_by is live-maintained: null == still cloud-trigger-backed
+  # (safe to defer); non-null == cloud role already retired for this slot — NOT backstop-covered.
   # DO NOT hardcode slot names — derive from schedule at runtime via jq
-  BACKSTOP_SLOTS    = [s for s in WON_SLOTS if s.trigger_id != null AND s.trigger_status == "active"]
-  NO_BACKSTOP_SLOTS = [s for s in WON_SLOTS if s.trigger_id == null OR s.trigger_status != "active"]
+  BACKSTOP_SLOTS    = [s for s in WON_SLOTS if s.trigger_id != null AND s._superseded_by == null]
+  NO_BACKSTOP_SLOTS = [s for s in WON_SLOTS if s.trigger_id == null OR s._superseded_by != null]
```

Given current data, `BACKSTOP_SLOTS` now correctly evaluates to **empty** (all 5 real-trigger slots carry `_superseded_by:"cowork-dispatcher"`) — every matched guaranteed slot on a gateway-blind tick falls through to `NO_BACKSTOP_SLOTS`, gets logged `"UNDELIVERABLE this tick (no cloud backstop)"`, and is appended to `errors[]` for Step 6 telemetry to pick up. This is exactly the corrected behavior the 20:35Z correction signal already prescribed as the interim rule ("treat ALL matched slots as NO_BACKSTOP_SLOTS... until this data integrity issue is fixed") — this fix makes that the *permanent*, code-level rule instead of a per-session ad-hoc workaround that has to be manually re-derived and re-applied by every cowork-team tick (as literally happened three times today across the 20:15/20:35/21:00Z signals).

No downstream message text needs changing: `"UNDELIVERABLE this tick (no cloud backstop)"` remains literally accurate (there genuinely is no *cloud* backstop) and does not assert the slot is lost forever — `F1-LAUNCHD-COWORK-BACKSTOP` (`DONE_VERIFIED`) is a structurally separate, independent-process backstop that Step 5.0 does not need to model: it fires via its own OS-level launchd cadence regardless of whether this particular dispatcher tick is gateway-blind, so it is unaffected by whatever Step 5.0 logs this tick. Leaving these two branches structurally in place (rather than deleting `BACKSTOP_SLOTS` entirely) costs nothing and stays forward-compatible if a real cloud trigger is ever reinstated for a future slot with `_superseded_by` left `null`.

### 3.2 — Per-slot `trigger_status` correction (`docs/data/cowork-schedule.json`)

Two distinct corrections, by slot class (do NOT collapse into one value — see §2 re: not pre-empting F1):

**(a) 5 real-trigger slots** (chef-morning, chef-eod, chef-evening, digest-sunday, tnb-audit) — these genuinely had a working cloud trigger until 2026-06-22/23:
```diff
-      "trigger_status": "active",
+      "trigger_status": "superseded",
```
`"superseded"` is a new interim value distinct from F1's eventual `"decommissioned"` (which requires F1's own evidence gate — 2 logged local-launchd fires per slot — before it applies). It simply promotes what `_superseded_by` already says into `trigger_status`, so the two fields stop contradicting each other. F1 can still flip `"superseded"` → `"decommissioned"` later once its own DoD is satisfied; this is a safe subset/refinement, not a conflict.

**(b) 4 never-had-a-real-trigger slots** (fb-daily, fb-weekend, alert-commander-market, alert-commander-critical) — `trigger_id` is `null` and always has been (confirmed by full-history git scan, §1); `trigger_status:"active"` was never accurate for these, it's pure debt:
```diff
-      "trigger_id": null,
-      "_superseded_by": "cowork-dispatcher",
-      "trigger_status": "active",
-      "last_reactivated_at": null
+      "trigger_id": null,
+      "_superseded_by": "cowork-dispatcher",
+      "last_reactivated_at": null
```
Remove `trigger_status` entirely for these 4 — `trigger_id: null` + `_superseded_by` already fully and correctly describe the slot's state without a meaningless enum value. Not in F1's scope (F1's `files`/`desc` list only the 5 real-trigger slots) and not part of the Step 5.0 blast radius either (§1) — pure data hygiene, zero behavior change.

**Sequencing:** the two edits (3.1 code, 3.2 data) are safe in either order or the same commit — under the *old* discriminator, flipping `trigger_status` away from `"active"` already fails toward visibility (more slots become `NO_BACKSTOP_SLOTS`, never fewer); under the *new* discriminator, `trigger_status`'s value is simply inert. No dangerous intermediate state exists. Recommend landing both in one commit since this is a single S-sized task.

## 4. Explicitly not in scope

- `F1-CLOUD-TRIGGER-DECOMMISSION`'s own `"decommissioned"` flip + its evidence-gathering (2 logged launchd fires/slot) + its two doc rewrites (`cron-cowork-team/SKILL.md`, `cron-jobs.md`) — PO/owner's own gated action, untouched here (§2).
- `cowork-schedule.json._notes.*` — already corrected by the 2026-07-07 durability brief's task #5 (commit `05a8bffa6`), untouched here (§2).
- Redesigning Step 5.0's overall blind-guard shape (e.g., filtering by `guaranteed` instead of `trigger_id`) — out of scope for an S-sized data-consistency fix; the existing shape works correctly once fed a non-stale discriminator, no redesign needed.
- The recurring "ad-hoc methodology re-derivation" pattern visible in the 20:15/20:35/21:00Z signal sequence (three different sessions each reasoning about backstop coverage from scratch) — this brief's fix removes the need for that reasoning going forward (Step 5.0 itself now gets it right, nothing left to re-derive), so no separate process fix is needed.

## 5. DoD / verification (for `agent-father` to confirm before closing)

1. `spawn-fanout.md` L14-15 read `s._superseded_by == null` / `s._superseded_by != null`, not `trigger_status`.
2. `jq '.slots[] | select(.trigger_status=="active")' docs/data/cowork-schedule.json` → empty (no slot left claiming a live cloud trigger).
3. `jq '.slots[] | select(.slot_id=="chef-morning" or .slot_id=="chef-eod" or .slot_id=="chef-evening" or .slot_id=="digest-sunday" or .slot_id=="tnb-audit") | .trigger_status' docs/data/cowork-schedule.json` → all `"superseded"`.
4. `jq '.slots[] | select(.slot_id=="fb-daily" or .slot_id=="fb-weekend" or .slot_id=="alert-commander-market" or .slot_id=="alert-commander-critical") | has("trigger_status")' docs/data/cowork-schedule.json` → all `false`.
5. `jq empty docs/data/cowork-schedule.json` — still valid JSON after edits.
6. Grep confirms no other live flow file reads `.trigger_status` (already true today, §1 — regression check only).

## 6. RETURN

DONE: Brief authored — Step 5.0 discriminator re-keyed to `_superseded_by`, per-slot `trigger_status` data correction split into two non-overlapping classes (5 real-trigger → `"superseded"` interim value; 4 never-had-one → field removed), reconciled against both adjacent in-flight items with no scope overlap.
NEXT: agent-father — apply §3.1 + §3.2 edits to `docs/agents/cowork-team/flow/spawn-fanout.md` + `docs/data/cowork-schedule.json`, verify against §5, commit.
HANDOFF: `docs/architecture-briefs/2026-07-08-cowork-step5-stale-trigger-status.md`
PIPELINE: continue
