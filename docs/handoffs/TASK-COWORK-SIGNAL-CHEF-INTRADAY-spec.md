# chef/unified-agent Intraday Filename Extension (FR-3 + EC-2) — Implementation Spec

**Task ID:** TASK-COWORK-SIGNAL-CHEF-INTRADAY (P1, size S, zone `cross-service/unified-agent`,
plan_only, supervised)
**Parent:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (Phase 1, task 3 of 4)
**Sprint:** COWORK-RELIABILITY · **Agent:** developer · **Date:** 2026-08-08
**Status:** SPEC ONLY — `plan_only:true` + `supervised:true` inherited from parent, preserved. **No
code ships from this document.** This is a handoff artifact for a future *unsupervised* developer
dispatch to implement verbatim, after PO re-adjudicates the parent row per its own stated policy
(`supervised_note`: "Child task of plan_only parent; no code ships without parent re-adjudication by
PO").

**This task does NOT depend on `derive_window_key()`.** FR-3 uses `VN_HOUR`, a distinct,
already-existing session variable pinned at `chef.md` Step 0.5 — not `WINDOW_KEY` (that's the
bctc-analyst / task-1-and-2 mechanism). The two are unrelated contracts; this spec neither cites nor
implements `derive_window_key()`.

**Inputs read at source before writing this spec** (all live-verified this cycle, not paraphrased):
- `docs/data/orch/orch-state.json` → `TASK-COWORK-SIGNAL-CHEF-INTRADAY` (full row, found in
  `in_progress[]`) and the parent row `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` (full decision
  history: BA spec, architect brief, PO's `po_architect_signoff_20260807T0545` — Amendment 2 confirms
  the EC-2 Phase-2 split and OVERRIDES the brief's "mint later" timing by minting the follow-on row
  NOW; Amendment 1 descopes FR-4/tnb entirely; Amendment 3 affects `derive_window_key()` branch-2
  internals, task 1's scope, not this task's).
- The already-minted follow-on backlog row `FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION`
  (status `BLOCKED`, `depends_on: ["FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR"]`) — this is the Phase-2 EC-2
  UTC-hour-basis migration; it already exists on the board, so this spec's residual-risk comment
  points at a real row, not a "recommend PO mint one" placeholder.
- `docs/architecture-briefs/2026-08-07-cowork-signal-filename-cycleid-keying.md` §4 (FR-3+EC-2, lines
  151-216, all four subsections) — primary scope source — plus §8 (Design decisions summary, lines
  321-346) and §9 (AC mapping, lines 349-358).
- `docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md` and
  `docs/handoffs/TASK-COWORK-SIGNAL-BCTC-REKEY-spec.md` (tasks 1/2 of this decomposition, already
  delivered) — read for spec-document shape/rigor precedent only (live-verified line anchors, worked
  examples, AC mapping, dangling-`ba_handoff` note). Neither is cited as a dependency of this task's
  content — task 1's `derive_window_key()` contract is explicitly NOT this task's mechanism (see
  above).
- Live source files, re-read this cycle, not from the brief's paraphrase: `docs/agents/unified-agent/
  flow/chef.md` (Step 0.5, lines 38-124) and `docs/agents/unified-agent/flow/chef-dish.md` (Step 7.6,
  lines 539-666).
- `docs/handoffs/TASK-COWORK-SIGNAL-CHEF-INTRADAY.md` — confirmed absent from disk (failed `Read`,
  same dangling-pointer situation tasks 1 and 2 each noted for their own rows; see §7.

---

## 1. `chef-dish.md` Step 7.6 — filename extension (FR-3 core)

**File:** `docs/agents/unified-agent/flow/chef-dish.md`

**Live-verified anchor:** `## Step 7.6 — PERSIST SYNTHESIS (JSON output — machine-queryable store)`
at line 539. The `FILEPATH` derivation block is lines 567-572:

```
567	```
568	CYCLE_DATE = CYCLE_DATE_UTC   # verbatim reuse of Step 0.5's pinned value (UTC calendar date),
569	                               # computed ONCE per cycle. Never recompute/re-derive it in this step.
570	SLOT_ID    = <dish_type> (morning | intraday | eod | evening)
571	FILEPATH   = docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}.json
572	```
573	
574	Example: `docs/data/unified-agent-synthesis-2026-07-03-eod.json`
```

**Single-fire slots (morning/eod/evening): confirmed NO change.** `CYCLE_DATE_UTC` already collapses
each to 1 file/window — closed by the sibling row `FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE`
(cited in the block's own comment header, lines 549-566). Touching those three here would be
scope-creep on an already-closed defect.

### 1.1 Discriminator choice: `IS_MULTI_FIRE`, not a hardcoded `"intraday"` string match

The brief's prose says "add `-{VN_HOUR}` for the intraday branch only." I checked whether `chef.md`
Step 0.5 already computes a **generic** multi-fire flag rather than requiring a new hardcoded slot-name
comparison — it does. Live-verified, `chef.md` lines 89-91:

```
89	# A single fixed integer → single-fire (one window/day)
90	# A range (contains "-"), a list (contains ","), or a step (contains "/") → multi-fire
91	IS_MULTI_FIRE = CRON_HOUR_FLD contains "-" OR contains "," OR contains "/"
```

`IS_MULTI_FIRE` is computed **unconditionally**, before the `if IS_MULTI_FIRE:` branch at line 93 —
same pin-once-reuse-verbatim pattern `CYCLE_DATE_UTC` already uses across the `chef.md`/`chef-dish.md`
split (line 568's own comment: "verbatim reuse of Step 0.5's pinned value"). Today `IS_MULTI_FIRE` is
`true` for exactly one slot (`chef-intraday`) — so branching on it is functionally identical to
branching on `SLOT_ID == "intraday"` for the live schedule — but it is the **already-established,
CLAUDE.md-compliant convention** ("no slot name is hardcoded," Step 0.5's own comment at line 44-48)
for exactly this single-fire-vs-multi-fire distinction, and it stays correct without a code change if
a second multi-fire slot is ever added. I chose to reuse it rather than introduce a second, redundant,
hardcoded discriminator. **This is a design refinement over the brief's literal prose, not a scope
change** — the resulting behavior for today's live schedule is identical (only `chef-intraday` gets the
`-{VN_HOUR}` suffix); flagged explicitly here so a reviewer can override to a literal string match if
preferred.

### 1.2 Exact edit

Replace lines 567-574 with:

````
```
CYCLE_DATE = CYCLE_DATE_UTC   # verbatim reuse of Step 0.5's pinned value (UTC calendar date),
                               # computed ONCE per cycle. Never recompute/re-derive it in this step.
SLOT_ID    = <dish_type> (morning | intraday | eod | evening)

<!-- EC-2 RESIDUAL RISK — see §3 of this spec for the verbatim comment text to embed here. -->
VN_HOUR       = Step 0.5's pinned value, verbatim reuse — the SAME value as Step 0.5's multi-fire
                MARKER_KEY VN_HOUR component. Never recomputed here. Read ONLY when IS_MULTI_FIRE
                is true; unused/undefined for single-fire slots.
IS_MULTI_FIRE = Step 0.5's pinned value, verbatim reuse — the SAME generic cron-shape flag that
                already discriminates Step 0.5's own MARKER_KEY branch (true ONLY for
                chef-intraday today, per Step 0.5's own comment: "no slot name is hardcoded").

if IS_MULTI_FIRE:
  FILEPATH = docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}-{VN_HOUR}.json
else:
  FILEPATH = docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}.json

<!-- metadata.cycle_id NON-PROMOTION — see §4 of this spec for the verbatim comment text to embed here. -->
```

Example (single-fire, unchanged): `docs/data/unified-agent-synthesis-2026-07-03-eod.json`
Example (intraday, NEW — §5 worked example): `docs/data/unified-agent-synthesis-2026-08-07-intraday-09.json`
````

### 1.3 Changelog-comment correction (same edit, same file)

The existing comment block immediately above the `FILEPATH` derivation (lines 549-566,
`GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST`) contains a sentence that is now **stale relative to the ratified
architecture brief** and must be corrected in this same edit, per the brief's own §4.4 instruction
("inline changelog comment ... should be updated to reflect landing"):

**Current (line 555-558):**
> Naming stays "date_vn+dish_type" per FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1 backlog,
> ba-owned) — that row's structural follow-on is cycle_id-keying the filename entirely; this fix only
> makes the existing date component deterministic, it does not add cycle_id.

This is inaccurate on two counts: (a) the row is no longer "P1 backlog, ba-owned" — it is
`BLOCKED`/`po`-owned with a ratified architect design and this task's own decomposition; (b) the
ratified design does **not** key on raw `cycle_id` at all — it adds a per-writer `VN_HOUR` hour
discriminator (§1.2 above), and `cycle_id` itself is explicitly excluded (§4 below). Left uncorrected,
a future reader could infer the wrong mechanism landed.

**Replace with:**
> Naming is "date_vn+dish_type[+VN_HOUR for the multi-fire branch]" per
> FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1, plan_only/supervised — see
> TASK-COWORK-SIGNAL-CHEF-INTRADAY) — that row's structural follow-on is a per-writer hour
> discriminator (`VN_HOUR`, §1 above), NOT raw `cycle_id`-keying; see the `metadata.cycle_id`
> non-promotion comment below (§4) for why `cycle_id` itself is explicitly excluded. This fix makes
> the existing date component deterministic AND adds the multi-fire hour discriminator — it does not
> add `cycle_id`.

---

## 2. `chef.md` Step 0.5 — cross-reference-only confirmation (no derivation change)

**File:** `docs/agents/unified-agent/flow/chef.md`

**Live-verified:** `VN_HOUR` and `IS_MULTI_FIRE` are already computed at Step 0.5, lines 78 and 91
respectively — both **unconditionally**, before any branch, and both already reused verbatim by the
multi-fire `MARKER_KEY` at line 100 (`MARKER_KEY = "published:" + SLOT_ID + ":" + WORK_DATE + ":" +
VN_HOUR`). No new variable, no new derivation, no change to `CYCLE_DATE_UTC`/`MARKER_KEY` logic — that
remains owned by the sibling `FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE` row and is not reopened
here, exactly as the brief's §4.4 instructs.

**Exact edit — append a cross-reference clause to each of the two existing inline comments** (purely
additive, comment-only, zero logic change):

Line 78, current:
```
VN_HOUR        = TZ="Asia/Ho_Chi_Minh" date +%H          # VN hour (00-23) — intraday multi-fire keying ONLY
```

New:
```
VN_HOUR        = TZ="Asia/Ho_Chi_Minh" date +%H          # VN hour (00-23) — intraday multi-fire keying ONLY.
                                                           # ALSO reused verbatim (never recomputed) by
                                                           # chef-dish.md Step 7.6's FILEPATH hour component
                                                           # (TASK-COWORK-SIGNAL-CHEF-INTRADAY) — same value
                                                           # as this step's own MARKER_KEY VN_HOUR component;
                                                           # the two must never independently diverge.
```

Line 91, current:
```
IS_MULTI_FIRE = CRON_HOUR_FLD contains "-" OR contains "," OR contains "/"
```

New:
```
IS_MULTI_FIRE = CRON_HOUR_FLD contains "-" OR contains "," OR contains "/"
                # ALSO reused verbatim by chef-dish.md Step 7.6's FILEPATH branch (TASK-COWORK-
                # SIGNAL-CHEF-INTRADAY) — same flag, not recomputed there. See §1.1 of that task's
                # spec for why the filename discriminator reuses this generic flag instead of a
                # hardcoded slot-name string match.
```

**Verification this cross-reference is accurate:** confirmed both variables are pinned once per cycle
at Step 0.5 (lines 76-91) and that `chef-dish.md`'s Step 1.5-8 body (including Step 7.6) executes in
the same agent session after the TE-T16 split (chef.md's own header, lines 15-20: "Steps 1.5-8 ...
live in chef-dish.md, entered ONLY when the Step 1 gate fires ... No logic changed by this split —
pure relocation"), the same cross-file verbatim-reuse pattern `CYCLE_DATE_UTC` already relies on
(chef-dish.md line 568's own comment).

---

## 3. EC-2 residual-risk comment — verbatim content

Per the architecture brief §4.2: the hazard is real (basis-mixing a UTC calendar date with a VN-local
hour) but currently bounded by the live cron shape, not structurally closed. Embed the following
comment at the point marked in §1.2 above (immediately before the `VN_HOUR`/`IS_MULTI_FIRE`/`FILEPATH`
block):

```
<!-- EC-2 RESIDUAL RISK (FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING Phase 1, TASK-COWORK-SIGNAL-CHEF-INTRADAY,
     2026-08-08): {VN_HOUR} above is a VN-LOCAL hour appended next to {CYCLE_DATE}, a UTC calendar date —
     two different timezone bases in one filename. This is the SAME class of basis-mixing bug
     FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE closed at daily granularity (see Step 0.5's own fix
     comment in chef.md). BOUNDED, NOT CLOSED, today: chef-intraday's live cron (13 2-8 * * 1-5) maps UTC
     hours 2-8 1:1 monotonically onto VN hours 9-15, entirely inside one VN calendar day, nowhere near the
     VN-midnight boundary (17:00 UTC) — so no live fire pattern can alias two different UTC windows onto
     the same (CYCLE_DATE, VN_HOUR) pair today. If chef-intraday's cron is EVER widened to span 17:00 UTC,
     this reproduces the exact daily-straddle defect at hourly grain. Principled fix (Phase 2, tracked
     separately, NOT this comment's job to implement): FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION
     (backlog, BLOCKED, depends_on=FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR landing scheduled_utc_time on chef's
     live-match path) — migrates BOTH this filename's hour component AND Step 0.5's multi-fire MARKER_KEY
     to a UTC-hour basis together, in one change, so the filename and the mutex key never disagree on their
     timezone basis. Do NOT migrate one without the other. TRIPWIRE (per that row's own note): any change
     to chef-intraday's cron in docs/data/cowork-schedule.json must unblock and dispatch that row FIRST. -->
```

---

## 4. `metadata.cycle_id` non-promotion comment — verbatim content

Per the architecture brief §4.3 and the parent row's own 2026-07-22 CAUTION. Embed the following
comment at the point marked in §1.2 above (immediately after the `FILEPATH` `if`/`else` block, before
the JSON schema section):

```
<!-- metadata.cycle_id NON-PROMOTION (FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING Phase 1,
     TASK-COWORK-SIGNAL-CHEF-INTRADAY, 2026-08-08): metadata.cycle_id (<DISH_TYPE>-<CYCLE_START_UTC>,
     schema below) stays INFORMATIONAL/AUDIT-ONLY. Do NOT promote it into FILEPATH or any mutex key —
     this is the 2026-07-22 PO CAUTION restated: cycle_id is RUN-START-keyed, so two peers of the SAME
     scheduled window get two DIFFERENT cycle_id values, and re-keying on it would re-ship the exact
     collision this row exists to close (it would stop overwrites but silently permit duplicate
     co-existing artifacts for one window — confirmed live 2026-07-22, two synthesis files for one
     chef-evening window, cycle_id evening-2026-07-22T19:56:00Z vs evening-2026-07-22T20:00:37Z). The
     filename's cycle discriminator is {VN_HOUR} (§1 above), NOT cycle_id — if a future pass "fixes"
     this back to cycle_id-keying, it is reintroducing a known-bad design, not fixing a gap. -->
```

---

## 5. Worked example

`docs/data/unified-agent-synthesis-2026-08-07-intraday-09.json` — `chef-intraday` slot, `VN_HOUR=09`,
cron fire at `02:13Z` (`13 2-8 * * 1-5`, first window of the day: UTC 02:13 → VN 09:13, `VN_HOUR`
rounds to the zero-padded hour field, `%H` = `"09"`). Cited verbatim from the architecture brief §4.1
— not independently re-derived, since the brief's arithmetic (UTC+7, 02:13Z → VN 09:13) is
straightforward and matches `chef.md` Step 0.5's own `date +%H` derivation with no ambiguity to
re-check.

A same-VN-day later fire (e.g. the `08:13Z`/VN `15:13` window) resolves to
`docs/data/unified-agent-synthesis-2026-08-07-intraday-15.json` — a **distinct path** from the `09:13`
example, which is the entire point of §1's edit (AC-1/AC-4, §6 below).

---

## 6. AC mapping (per architecture brief §9, carried forward not redesigned)

| Board AC | Satisfied by (this task's scope) |
|---|---|
| AC-1 (two same-day cycles never share a path) | §1 (chef-dish.md `FILEPATH` gains `-{VN_HOUR}` for the multi-fire branch — two different-hour intraday fires on the same VN/UTC day resolve to two distinct paths) |
| AC-2 (a between-cycles write can't silently destroy an unrouted signal) | §1 — same distinct-path property. Note: `unified-agent-synthesis-*.json` lives under `docs/data/`, not `docs/signals/` (brief §6), so it is outside `drain-signals.js`'s scope entirely — the mechanism protecting it is the same "distinct path per cycle" property, not the drain reader's fingerprint logic (that's AC-3/FR-6, a bctc-analyst-only concern per brief §7). |
| AC-4 / tnb-c112 (every non-silent intraday cycle surfaces on disk) | §1 directly — distinct path per `VN_HOUR` means no first-write-wins (the tnb-c112 symptom: a later same-day intraday cycle's write silently failing to land) and no last-write-clobber (the original chef-synthesis incident this row was minted from) are structurally possible once each hour owns its own path. |

AC-3 (drain-reader change, if any, preserves routing) is not this task's concern — it maps to FR-6
(bctc-analyst-family filenames only, confirmed NO-OP per brief §7); `unified-agent-synthesis-*` files
are never drained by `drain-signals.js` in the first place.

---

## 7. Note on the dangling `ba_handoff` pointer

The row's own `ba_handoff` field (`docs/handoffs/TASK-COWORK-SIGNAL-CHEF-INTRADAY.md`) does not exist
on disk — confirmed by an actual failed `Read` this cycle, not inferred. Same precedent both sibling
tasks noted for their own rows: the parent row's PM-decomposition step minted 4 board rows but did not
also mint 4 corresponding per-task handoff stub files, leaving each child row's `ba_handoff` field
pointing at a path that only this spec document (once written) fills in substance (not filename). Not
treated as a blocker.

---

## 8. Test strategy (integration-level, for a future unsupervised developer dispatch)

Per architecture brief §8's developer-handoff test strategy, restated for this task's own scope:

- **AC-1 / AC-4 (two same-day intraday fires get distinct paths, every non-silent cycle surfaces):**
  fire `chef.md`→`chef-dish.md` twice for `slot=chef-intraday` on the same VN calendar day at two
  different `VN_HOUR` values (e.g. the live cron's `02:13Z`/VN `09` and `05:13Z`/VN `12` windows, both
  with ≥1 qualifying cluster so Step 1's silent-exit gate does not short-circuit either run). Assert:
  (a) `docs/data/unified-agent-synthesis-{CYCLE_DATE}-intraday-09.json` and
  `...-intraday-12.json` are BOTH present on disk after both runs; (b) neither file's content was
  overwritten by the other run (byte-for-byte check against each run's own expected
  `conviction_calls`/`sector_phases` content); (c) a THIRD run at the SAME `VN_HOUR` as an earlier run
  (a legitimate re-fire within the same hour window) resolves to the SAME path — this is the accepted
  EC-1-style collision, protected by Step 0.5's `published:` mutex (`MARKER_KEY` including `VN_HOUR`),
  not by filename uniqueness; assert the mutex, not the filename, is what blocks the duplicate publish
  in that case.
- **Silent-exit non-interference:** fire an intraday cycle with 0 qualifying clusters at a THIRD
  `VN_HOUR` in the same VN day; assert NO file is written for that hour (Step 1's silent-exit gate,
  unchanged by this task) and that the two non-silent files from the first bullet remain untouched.
- **Single-fire regression guard:** fire `chef-morning`/`chef-eod`/`chef-evening` and assert their
  `FILEPATH` is unchanged (`docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}.json`, no
  `-{HH}` suffix) — proves `IS_MULTI_FIRE`-gated branching correctly leaves the closed single-fire
  defect closed and does not regress it.
- **EC-2 boundary (explicitly OUT of scope for this task's own test suite):** a synthetic cross-VN-midnight
  cron case is NOT this task's test to write — it belongs to the Phase-2 follow-on
  (`FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION`, its own `status_note` already specifies
  AC-2 as "a cron widening ... provably cannot alias two different UTC windows onto one pair —
  regression test with a synthetic widened cron"). Not duplicated here.

---

## 9. Files summary table (per architecture brief §4.4)

| File | Change |
|---|---|
| `docs/agents/unified-agent/flow/chef-dish.md` | Step 7.6 (lines 567-574): `FILEPATH` gains an `IS_MULTI_FIRE`-gated `-{VN_HOUR}` branch (§1.2); stale changelog-comment sentence corrected (§1.3); EC-2 residual-risk comment embedded (§3); `metadata.cycle_id` non-promotion comment embedded (§4); new worked example line added (§5) |
| `docs/agents/unified-agent/flow/chef.md` | Step 0.5 (lines 78, 91): cross-reference-only comment additions confirming `VN_HOUR`/`IS_MULTI_FIRE` are shared verbatim with `chef-dish.md` Step 7.6 (§2) — **no derivation or logic change** |

**Neither file was edited by this task** — this table specifies the edits for a future unsupervised
developer dispatch, per the plan_only constraint.

---

## 10. Non-goals (plan_only reminder)

- No file inside `docs/agents/unified-agent/flow/` was edited by this task — §1 and §2 above are edit
  *specifications* for a future unsupervised developer dispatch, the same posture tasks 1 and 2 took
  for their own scopes.
- `derive_window_key()` is neither implemented nor referenced as a dependency — FR-3 uses `VN_HOUR`, a
  distinct, already-existing variable; conflating the two would be a scope/mechanism error.
- No file inside `docs/agents/bctc-analyst/flow/` (tasks 1/2's already-delivered territory) or
  `docs/agents/tran-ngoc-bau/flow/main.md` (task 4, not yet dispatched) was touched or attempted.
- The Phase-2 EC-2 UTC-hour-basis migration is explicitly NOT implemented or designed here — it is
  tracked at `FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION` (backlog, `BLOCKED`), cited (§3)
  not re-litigated.
- No further agent was spawned.

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-RELIABILITY-developer.md`, task_id
`TASK-COWORK-SIGNAL-CHEF-INTRADAY`.

## RETURN
```
DONE: Spec complete for chef/unified-agent FR-3 (intraday-only filename extension, {CYCLE_DATE}-
      {SLOT_ID}-{VN_HOUR}.json gated on Step 0.5's already-computed IS_MULTI_FIRE flag, not a
      hardcoded "intraday" string match) + EC-2 residual-risk comment (bounded-not-closed, cites the
      already-minted Phase-2 follow-on row) + metadata.cycle_id explicit non-promotion comment (2026-
      07-22 CAUTION restated) + chef.md Step 0.5 cross-reference-only confirmation (VN_HOUR/
      IS_MULTI_FIRE shared verbatim, zero derivation change) + stale changelog-comment correction
      (chef-dish.md's own GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST block no longer claims a cycle_id-keying
      follow-on). Both target files' exact edits specified with live-verified line anchors; neither
      edited by this task. derive_window_key() NOT cited — this task's mechanism (VN_HOUR) is
      unrelated to tasks 1/2's WINDOW_KEY contract. plan_only+supervised preserved — no code shipped,
      no writer files touched.
ZONE: cross-service/unified-agent
NEXT: po | review spec (this row moves to review[], next_agent=po per dispatch instruction)
HANDOFF: docs/handoffs/TASK-COWORK-SIGNAL-CHEF-INTRADAY-spec.md
PIPELINE: hold — supervised row, no auto-continue; task 4/4 (TASK-COWORK-SIGNAL-NAMING-CONTRACT)
          remains a separate dispatch, not attempted here
```
