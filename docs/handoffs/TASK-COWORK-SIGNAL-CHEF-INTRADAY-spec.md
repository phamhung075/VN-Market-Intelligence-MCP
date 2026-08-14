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

---

## 11. PO ADJUDICATION — DONE_VERIFIED + binding Amendment 6 (2026-08-14T18:01Z)

**Verdict: ACCEPTED.** Row `review[] → done_verified[]`. Mechanism, scope discipline, and the one
flagged design refinement are all correct; the defects below are recorded as binding amendments
rather than a rework bounce. `plan_only` + `supervised` **PRESERVED** — this ratifies the *design*
only. No code ships from this document until the parent row
(`FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING`) is re-adjudicated on the **full** child set; 1 of 4
(`TASK-COWORK-SIGNAL-NAMING-CONTRACT`) is still unreviewed.

Amendment 6 parts (a), (b), (d), (e), (g) are **acceptance-bearing**. Full text also lives on the
board row (`po_amendment_6_20260814T1801Z`); this section is the implementer-facing copy.

### 6(a) — Line anchors have drifted; §1.2's literal edit instruction is now DESTRUCTIVE

Highest-severity item. §1.2 says *"Replace lines 567-574"* of `chef-dish.md`. **Those lines today are
inside Step 7.5's quality-gate verdict block** (`GAP_CATALOGUE_OK` … `# Verdict` … `if L2_OK AND
L3_OK AND L4_PILLARS_OK AND BIZ_CTX_OK AND GAP_CATALOGUE_OK` … `$QUALITY_VERDICT = "full"`).
Following it literally deletes the quality verdict and pastes a `FILEPATH` derivation over it.

Re-anchored live 2026-08-14:

| Element | Spec says | Live now |
|---|---|---|
| `chef-dish.md` Step 7.6 header | 539 | **606** |
| `chef-dish.md` `CYCLE_DATE = CYCLE_DATE_UTC` | 568 | **635** |
| `chef-dish.md` `FILEPATH` | 571 | **638** |
| `chef-dish.md` stale changelog sentence (§1.3) | 555-558 | **622-625** |
| `chef.md` Step 0.5 header | 38 | **65** |
| `chef.md` "no slot name is hardcoded" | 44-48 | **75** |
| `chef.md` `VN_HOUR` | 78 | **105** |
| `chef.md` `IS_MULTI_FIRE` | 91 | **118** |
| `chef.md` multi-fire `MARKER_KEY` | 100 | **127** |
| `chef.md` TE-T16 split note | 15-20 | **27** |

`chef-dish.md` is now 806L, `chef.md` 265L. **The drift is NON-UNIFORM** (+67/+69 vs +27 —
agent-father's `UC-CCA-P2-UNIFIED-AGENT` Step 0-GW insertion added +15L to `chef.md` on 2026-08-14
alone), so no single offset repairs this document. **RULE: every line number here is advisory.**
Anchor every edit on the *quoted text* (still exact in both files) and re-verify before writing.

### 6(b) — §7's absence claim is false; the PM stub exists and is required reading

§7 asserts the PM decomposition *"did not also mint 4 corresponding per-task handoff stub files."*
**False.** `docs/handoffs/TASK-001-derive-windowkey.md`, `TASK-002-bctc-analyst-rekey.md`,
`TASK-003-chef-intraday-filename.md` (9522 B), `TASK-004-naming-contract.md` all exist, dated
2026-08-07 07:59. This task's stub is **`TASK-003-chef-intraday-filename.md`** and it is load-bearing:
it carries AC-1 (intraday-only extension), AC-2 (`HOUR_COMPONENT`/NFR-3 sourcing) and AC-3 (`cycle_id`
non-promotion). The true, narrower fact is that the row's `ba_handoff` **field** points at a wrong
*filename*, not at a missing artifact. **The implementer must read BOTH `TASK-003-chef-intraday-filename.md`
AND this spec.** Fourth occurrence of the inherited-false-absence class on this chain.

### 6(c) — The `IS_MULTI_FIRE` refinement is UPHELD, and it overrides the stub

§1.1's choice of Step 0.5's generic `IS_MULTI_FIRE` flag over a hardcoded `SLOT_ID == "intraday"`
match is **approved**, and flagging it as reviewer-overridable was the right call. Grounds verified at
source: `IS_MULTI_FIRE` derives at `chef.md:118` from the slot's own cron hour field read live from
`cowork-schedule.json` (`chef.md:112-114`), computed unconditionally before the `:120` branch; and
`chef.md:75` already ratifies the convention in words ("Rule is generic — no slot name is
hardcoded"), so a string match would *regress* a convention this file already carries.
**Consequence:** stub `TASK-003` AC-1 says *"Apply to: `if SLOT_ID == "intraday"` branch"* — **this
amendment overrides that line.** Do not "restore" the string match on the stub's authority.

### 6(d) — §3's EC-2 boundedness argument must be re-grounded

The EC-2 *conclusion* (bounded-not-closed, defer to Phase 2) is correct; its *evidence base* is not.
§3 grounds "no live fire pattern can alias…" entirely in the declared cron string. Live artifacts
refute the cron string as a bound on actual fire times:

- `unified-agent-synthesis-2026-08-12-intraday.json` carries `cycle_id: intraday-2026-08-12T15:13Z` —
  **outside the declared 02-08 UTC window altogether**. (Its own mtime, 08:25Z, implies that stamp is
  a VN-local time mislabelled `Z` — a second, fully independent reason §4's `cycle_id` non-promotion
  rule is right, and worth adding to that comment.)
- Run-start drift against the nominal window is real: **+7 to +22 min across 11 live intraday
  artifacts** (worst: 2026-08-07, nominal 04:13Z, cycle start 04:35Z). `VN_HOUR` is a run-start
  `date +%H` read (`chef.md:105`), so the margin before the hour digit flips is **47 min** (`:13`→`:00`)
  and a live fire has already consumed ~47% of it.

Required edits before the §3 comment is embedded: **(i)** re-ground the boundedness sentence on
*observed fire times* plus the 47-minute run-start margin, not the cron shape alone; **(ii)** widen the
TRIPWIRE from "any change to chef-intraday's cron in `cowork-schedule.json`" to "any change to the
cron **OR any observed fire outside the declared window**" — that schedule row now carries
`_superseded_by: "cowork-dispatcher"` and `trigger_status: "deleted"`, so while the cron *field*
remains the live discriminator SSOT `chef.md:114` reads, it is **no longer the actuator** and a
cron-only tripwire is bypassable by a dispatcher-side cadence change.

### 6(e) — Filename key and mutex key disagree on their DATE basis (unnoted)

This is the half of the parent row's binding 2026-07-22 CAUTION the spec never confronts. §4 quotes
the `cycle_id` half accurately and discharges it. The CAUTION's other operative clause reads *"never a
leaf-side `date`/run-start read … so the filename key and the mutex key agree by construction"* — and
`VN_HOUR` **is** exactly a leaf-side run-start read. Verified at source, post-fix the two keys agree
on the HOUR and **disagree on the DATE**:

- filename = `{CYCLE_DATE_UTC}-{SLOT_ID}-{VN_HOUR}` (`chef-dish.md:635` pins `CYCLE_DATE = CYCLE_DATE_UTC`)
- intraday mutex = `published:{SLOT_ID}:{WORK_DATE}:{VN_HOUR}` (`chef.md:104,127`; `WORK_DATE` = VN-local date)

They coincide today only because UTC 02-08 falls inside one VN calendar day — **contingently, not "by
construction"** as stub `TASK-003`'s own AC-2/NFR-3 framing claims. This does **not** block Phase 1
(deferring to the window-anchor migration is right, and the Phase-2 row exists). It must be recorded
in two places: **(i)** the §3 EC-2 comment must state *both* basis mixes — `VN_HOUR`-vs-`CYCLE_DATE_UTC`
inside the filename, **and** `CYCLE_DATE_UTC`-vs-`WORK_DATE` between filename and mutex; **(ii)** the
Phase-2 row `FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION`'s AC-1 today names only the *hour*
component — it must be widened to migrate the **date** component in the same change, or Phase 2 will
close half this defect and certify the whole of it closed.

### 6(f) — §5's worked example does not match the day it names

§5 states outright that it was *"cited verbatim from the architecture brief §4.1 — not independently
re-derived."* Re-derived here: the real 2026-08-07 intraday artifact
(`unified-agent-synthesis-2026-08-07-intraday.json`) has cycle start **04:35Z = VN hour 11**, so its
post-fix path is `-intraday-11.json`, **not** the `-intraday-09.json` cited by this spec, by brief
§4.1, and by stub `TASK-003` AC-1/AC-2. The `-09` value is a sound arithmetic illustration of the
02:13Z window but it is not the day it names, and three documents now repeat it. **Fix:** relabel as a
*synthetic* example, or use the real 04:35Z / VN-11 pair.

### 6(g) — NEW **AC-5**: the slot component is non-deterministic, which defeats AC-1 and AC-4

Added rather than bounced — the spec's own AC-1/AC-4 are not meaningful without it. The synthesis
filename family carries **two live slot-component conventions**: 4 files use the `chef-`-prefixed
`slot_id` (`chef-eod` ×1, `chef-evening` ×2, `chef-intraday` ×1) against 64 using the bare
`dish_type`. **On 2026-08-13 both shapes exist for the intraday slot on the same day**:

- `unified-agent-synthesis-2026-08-13-chef-intraday.json` — metadata `{slot_id: "chef-intraday",
  cycle_utc: "…T03:21:00Z", cycle_vn_hour: 10, dish_type: "convergence_scan"}`
- `unified-agent-synthesis-2026-08-13-intraday.json` — metadata `{cycle_id: "intraday-…T08:13:00Z",
  dish_type: "intraday", quality_verdict: …}`

…with **different metadata schemas** — the same schema-instability harm the parent row's
`po_measurement_20260730T2148` recorded for the bctc family, now demonstrated on the chef family.
Three acceptance-bearing consequences:

1. **§8's AC-1 test can pass spuriously.** Two same-day intraday paths *already* differ today via the
   slot component, with no hour discriminator at all. The test must assert the paths differ **in the
   hour component**, with the slot component held identical — and must additionally assert the slot
   component is stable across the two fires.
2. **AC-4's audit property is unreachable** while an auditor cannot deterministically compute the
   expected path — verbatim the complaint the parent row logged on 2026-07-19.
3. **The hour already exists as a field.** The newer writer emits `cycle_vn_hour: 10` in metadata; bind
   the filename component to that same pinned value rather than introducing a third derivation.

Not hindsight: the 3 pre-existing `chef-`-prefixed files date from 2026-07-29/07-30, so the variance
was observable when this spec was written on 08-08.

> **AC-5 (new, binding):** the slot component of the synthesis filename resolves deterministically to
> ONE convention for a given slot, and an auditor can compute the expected path for any non-silent
> cycle from pinned session values alone.

### Verified-at-source this tick (nothing accepted on the spec's prose)

`chef.md` 27/65/75/104/105/112-114/118/120/127/132 · `chef-dish.md` 567-574 (current content),
606/616/617/622-625/634-639 · `cowork-schedule.json` chef-intraday slot record in full ·
`drain-signals.js` 55/173 (SIG root — **confirms §6's AC-2 out-of-scope claim is correct**) · board
rows `FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION` (exists, BLOCKED — §3 cites a real row)
and `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` (now READY, decomposed into ANCHOR-1..4 on 2026-08-13, so the
Phase-2 dependency is live, not dormant) · `docs/handoffs/TASK-00{1,2,3,4}-*.md` existence + TASK-003
body · 15 live `unified-agent-synthesis-*.json` metadata records + mtimes.
