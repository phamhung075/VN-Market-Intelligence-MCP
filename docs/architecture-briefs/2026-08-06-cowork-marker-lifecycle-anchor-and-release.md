# Cowork Published-Marker Lifecycle — Window-Anchor Propagation + Release Gating

**Task IDs:** FIX-CHEF-PUBLISHED-MARKER-RELEASE (primary, this cycle's assignment) — designed together
with, and cross-referenced onto, **FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR** and **UC-CCA-P3** per PO's explicit
ruling that these are "one lifecycle, one design" and must not ship as point-patches (recurring-bug-
escalation: 9+ events, 4 distinct root-cause mechanisms on this cluster since 2026-07-02).
**Agent:** architect · **Date:** 2026-08-06

---

## 1. What "release" currently is — corrected finding

Exhaustive `grep -rn task_release` across `docs/agents/unified-agent/flow/*.md`,
`docs/agents/cowork-team/flow/*.md`, `.claude/skills/cowork*`, and `docs/protocols/dwf-ops-runbook.md`
finds **zero code paths that call `task_release` on a `published:*` key today.** `chef.md` Step 0.5 only
`task_claim`s (line 102-107); it never releases. `docs/protocols/dwf-ops-runbook.md` § Published Marker
Interaction states plainly: *"owned by the spawned agent, not the dispatcher... During a dark window, no
spawns occur, so no published markers are set"* — no automated release described there either.

**The release that actually happened in the 2026-08-05/06 incident this row was reopened on was a manual
PO action** (`published:chef-evening:2026-08-06` released by PO at 06:53Z, per
`po_occurrence_20260806_retry_date_drift` on the sibling ANCHOR row), performed on a **content-
correctness judgment** ("wrong dish sitting on the slot — degraded, mislabelled, mid-session") rather
than a mechanical delivery-evidence check. This row's original title ("chef.md cleanup releases... post-
publish") describes the PRE-2026-07-03 shape of the bug; no evidence of that automated code path survives
in the current flow docs. Restating this precisely matters because it changes the fix target: there is no
live automated release call to delete or gate — the actual open risk is (a) a KEY-DERIVATION defect that
lets two runs of the *same logical window* claim two *different* keys (already root-caused on the ANCHOR
row) and (b) an **UNGATED HUMAN release path** with no mechanical delivery check standing between
"someone believes no post happened" and `task_release` actually firing.

## 2. Component A — Window-anchor propagation (closes the retry-drift variant + the ANCHOR row's AC1-3)

**Already-computed, unconsumed value.** `scripts/agents-flow/cowork-catchup-predicate.js`
`computeCatchupCandidates()` already emits, per catch-up-eligible slot: `scheduled_utc_time` (ISO8601,
the cron's own nominal fire instant via `mostRecentCronFireBefore`, timezone-free) and
`expected_publish_task_id` (`published:<slot_id>:<scheduled_key_part>`). This is exactly the value chef's
Step 0.5 needs and today does not use — it independently re-reads the wall clock (`date -u
+%Y-%m-%d`) at whatever instant the executing agent happens to run, live OR retry, which is the entire
defect.

**Gap found this cycle:** live, on-time (non-catch-up) matches from `cowork-match-slots.js` do **not**
currently expose an equivalent field — `match-slots.md` documents `{slot_id, agent, flow_path, cron,
trigger_prompt}` only for `MATCHES`, even though the matcher internally already computes a `nominalTick`
(used today only to derive `drift_min`). `TASK-COWORK-CATCHUP-3` (READY, developer-owned, already fully
designed per `docs/handoffs/TASK-COWORK-CATCHUP-3.md`) wires `catchup_raw` into dispatch for the
catch-up path only — it does not touch the live-match path, so consuming it alone would still leave live
fires deriving their key independently of catch-up fires (the exact "two peers, two derivations" shape
that caused the original 07-22 incident).

**Design — one field, symmetric for both paths:**

1. `cowork-match-slots.js`: expose the already-computed `nominalTick` per live-matched slot as
   `scheduled_utc_time` (ISO8601), using the SAME field name `computeCatchupCandidates()` already uses —
   one shared contract, not two. Zero new computation; this value already exists internally for
   `drift_min`.
2. `cowork-team/flow/spawn-fanout.md` Step 5 (the ONE place that builds the `trigger_prompt` string sent
   to `Agent()`, line ~255: `"You are " + slot.agent + ", spawned in the background by cowork-team..."`):
   append `scheduled_utc=<scheduled_utc_time>` to every spawn prompt, live or catch-up-tagged, sourced
   from `slot.scheduled_utc_time`. One code path, no branching on `is_catchup` — this is the reuse
   `DESIGN-COWORK-FANOUT-T1-TICK-SNAPSHOT-WON-SLOTS` gestured at (that row is unrelated in purpose — a
   won-slots visibility snapshot, status TODO, agent-father-owned — and is NOT a prerequisite for this;
   do not block on it).
3. `docs/agents/unified-agent/flow/chef.md` Step 0.5: parse `scheduled_utc=<ISO8601>` from the invocation
   prompt using the SAME technique already used one line above for `SLOT_ID` (`slot=<slot_id>` extraction,
   line 67-70) — purely additive, no new parsing machinery class. If present:
   `CYCLE_DATE_UTC = <date portion of scheduled_utc>`. If absent (genuine ad-hoc/manual/pilot invocation
   with no scheduler tick — the chef equivalent of system-auditor's `AUDIT_TIER=4` manual-only path):
   fall back to `date -u +%Y-%m-%d` exactly as today, unchanged.
4. **Generalize per the ANCHOR row's own AC5**: because every guaranteed slot's Step-0.5-equivalent gate
   already extracts `slot=<slot_id>` from the SAME `trigger_prompt` construction point in
   `spawn-fanout.md`, adding `scheduled_utc=` ONCE at that single site benefits chef-morning/eod/evening,
   digest-daily, digest-sunday, fb-daily, tnb-audit identically — not a chef-only fix. `alert-commander`'s
   tick-scoped variant (`stage-dispatch-log.md`, keyed on `nominal_tick` already, tombstone-only, no
   release) is unaffected — it already anchors on a dispatched tick, not a wall-clock read, and is cited
   here only as an existing correct precedent for "own the window value, don't re-derive it."

**Lateness guard** (ANCHOR-row concern: a retry arriving absurdly late must not silently retarget to
today): already fully specified and READY on `TASK-COWORK-CATCHUP-3` (`catchup_eligible:false,
reason:"freshness_window_exceeded"` → miss record, never reaches dispatch). No new logic needed here —
just confirming this brief does not duplicate it.

### Files (Component A)
- `scripts/agents-flow/cowork-match-slots.js` — expose `scheduled_utc_time` on live `MATCHES` entries.
- `docs/agents/cowork-team/flow/match-slots.md` — document the field on `MATCHES` (currently documented
  only on `catchup_raw`).
- `docs/agents/cowork-team/flow/spawn-fanout.md` — Step 5 `trigger_prompt` template: append
  `scheduled_utc=<ISO8601>`.
- `docs/agents/unified-agent/flow/chef.md` — Step 0.5: parse `scheduled_utc=` token, fallback unchanged.
  (Other guaranteed-slot flows inherit the same token for free via `spawn-fanout.md`; each one's own
  Step-0.5-equivalent should be updated the same way as a fast-follow — flagged for PM to fan out, not
  designed file-by-file here since chef is the row in scope this cycle and the pattern is now
  established.)

## 3. Component B — Release gating (closes THIS row's actual title, corrected per §1)

Since no automated release exists, "release-immunity" (UC-CCA-P3's stated aim) is a **procedural**
gap today, not a code deletion. Fix: make the ONLY thing that may ever release a `published:*` marker —
human instruction, a future automated dead-agent-recovery flow, or `cowork-team`'s own dispatcher — go
through one mechanical, reusable **Published Marker Release Gate**, co-located with the existing
"Published marker gate (FR-P2-7)" block in `spawn-fanout.md` (same file, same section family, not a new
skill silo):

```
Before ANY task_release(task_id="published:<slot_id>:<key>", ...):
  1. task_list_held(task_kind="cowork-slot") — confirm the marker is genuinely held (not already free).
  2. Delivery-evidence check (reuse, do not reinvent — same predicate TASK-COWORK-CATCHUP-3's AC-4
     already specifies for suppressing a catch-up re-fire):
       - synthesis artifact ABSENT: docs/data/unified-agent-synthesis-{key_date}-{slot_base}.json
         does not exist for this key, AND
       - no matching MARKET telegram message was sent for this window (get_unreviewed_market_messages
         or equivalent message-log check for the window).
  3. BOTH absent → release is safe, proceed. EITHER present → REFUSE the release, escalate instead
     (BUG telegram + signal) — a marker with delivered evidence is a CONTENT question (wrong/degraded
     dish), never a LIFECYCLE question, and must not be "fixed" by freeing the mutex.
```

This directly targets the exact ambiguity in the 08-06 incident: PO's manual release was a correctness
judgment ("this dish is wrong for this slot"), not a delivery check ("did anything actually publish") —
under this gate, that release would have been REFUSED (a synthesis artifact DID exist for the key), and
the correct remedy would have been recognized as a content/relabeling problem, routed accordingly,
rather than freeing a mutex that Component A would in any case have prevented from being wrongly keyed in
the first place.

### Files (Component B)
- `docs/agents/cowork-team/flow/spawn-fanout.md` — new "§ Published Marker Release Gate" block, adjacent
  to the existing FR-P2-7 claim-gate documentation.
- `docs/protocols/dwf-ops-runbook.md` § Published Marker Interaction — cross-reference the new gate (this
  is the doc ops/PO would consult before ever hand-releasing a marker).

## 4. Relationship to UC-CCA-P3

UC-CCA-P3 (P0 umbrella: claim-timing + release-immunity) is NOT redesigned here — its own scope (early
read-only probe, late claim immediately before `send_telegram`, tombstone-once-genuinely-published) is
orthogonal to and compatible with both components above. Component A fixes key AGREEMENT; Component B
fixes release DISCIPLINE; UC-CCA-P3 fixes claim TIMING. All three must land together per PO's ruling —
this brief does not change that sequencing, it fills in the two pieces PO asked this row (and its
sibling) to own.

## 5. AC (mirrors and extends the ANCHOR row's own, do not re-litigate)

1. A live on-time fire and a catch-up/retry fire of the SAME missed scheduled window derive
   byte-identical `MARKER_KEY`, sourced from `scheduled_utc_time`, never from a `date` call made by the
   executing agent (ANCHOR AC1/AC2, now achievable — the field exists on both paths).
2. No `task_release` on any `published:*` key proceeds without both delivery-evidence checks in §3
   passing; a release attempt with either check failing is REFUSED and escalated, never silently
   performed.
3. Applies to all guaranteed slots via the single `spawn-fanout.md` injection point (ANCHOR AC5) —
   verify at minimum chef-* and one non-chef slot (e.g. digest-daily) both receive `scheduled_utc=`.
4. RAW-verify per ANCHOR row's own `verification_gate`: two same-window peer runs → exactly one claim
   succeeds, exactly one synthesis artifact, exactly one MARKET post; additionally, a manual release
   attempt against a key with an existing synthesis artifact is REFUSED by the gate in a test harness.

## 6. DDD / zone

Zone: `cross-service/` (multi: `docs/agents/cowork-team/flow/`, `docs/agents/unified-agent/flow/chef.md`,
`scripts/agents-flow/cowork-match-slots.js`). BUILD-STANDARD: not-applicable (bug-fix on existing
services). Not plan_only — PM should decompose into a dev-team task (developer-owned; no new interface,
no new agent).
