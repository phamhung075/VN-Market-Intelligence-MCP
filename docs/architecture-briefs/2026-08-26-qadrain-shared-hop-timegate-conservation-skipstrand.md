Architecture Brief — QA-Drain Shared Hop: Time-Gate Blindness, Conservation
Deadlock, and SKIP-Strand (3 P0 rows, one script cluster)

Date: 2026-08-26T04:32Z
Tasks:
  - FIX-DEVTEAM-QADRAIN-SELECTION-BLIND-TO-QA-NOT-BEFORE-TIME-GATE (P0)
  - FIX-QADRAIN-DONE-TO-QA-SCORES-BACKWARD-CONSERVATION-ABORTS-WHOLE-DRAIN (P0)
  - FIX-DEVTEAM-QADRAIN-SKIP-BRANCH-STRANDS-ALREADY-LANEMOVED-ROW-IN-QA (P0)
Mode: DESIGN — no production code changed here (developer's job); brownfield-
verified against live orch-state.json and the actual scripts on disk, not
re-derived from the rows' own prose at face value.
Author: architect
Zone: scripts/ (cross-service — no single apps/<service> owns this; all
three rows' own zone fields agree: cross-service/, scripts/,
docs/agents/dev-team/flow/ — all resolve to the generic `developer`
specialist per zone-detect Tier-2).
BUILD-STANDARD: not-applicable (bug-fix/refactor, in-zone, no new primitives).

---

## 0. Scope note — router already widened Row 1 beyond its po_scope_note

Row 1's `po_scope_note` prescribes a single-predicate fix confined to
`scripts/devteam-review-claim-qa-drain.jq` + the two `main.md` call-site
descriptions. The router's own `router_note_20260826T042009Z` (appended
before this cycle, independently re-verified here) is correct that this is
too narrow on two counts: (1) a SECOND, non-scripted dispatch path (router
hand-dispatch) is equally blind and reproduced the exact defect same-day at
04:07:07Z against a DIFFERENT row/field name; (2) the do-not-pick-before-T
semantic ships under at least THREE field names in the live board today —
`qa_not_before`, `next_recheck_not_before`, `qa_new_window_earliest_d1_close`
— re-verified this cycle (a fourth, `po_timegate_next_recheck_after`, exists
on `RAG-FTS-BUILD-MEMORY-BOUND` but that row is `status=BLOCKED`, already
excluded from this script's candidate set by the existing `status==REVIEW|
DONE` filter, so it is out of scope for THIS gate specifically, but is
further proof the naming is fleet-wide fragmented, noted for future triage).

This brief designs a TWO-LAYER fix for Row 1 (picker-side prevention +
qa-flow-side convergent backstop), not just the one-predicate version.

---

## 1. FIX-DEVTEAM-QADRAIN-SELECTION-BLIND-TO-QA-NOT-BEFORE-TIME-GATE

### 1a. Layer 1 — picker-side (closes both scripted call sites)

New shared predicate in `scripts/lib/devteam-eligibility.jq` (already
`include`-d by `devteam-review-claim-qa-drain.jq` — no new include needed).
Follows the file's own established `effective_*`/named-constant convention
(see e.g. `priority_rank`, `parse_ts`):

```jq
# ---- not-before dispatch gate (FIX-DEVTEAM-QADRAIN-SELECTION-BLIND-TO-QA-
# NOT-BEFORE-TIME-GATE) ----
# KNOWN-LIST, not full field-name normalization -- the do-not-pick-before-T
# semantic ships under multiple ad hoc field names across the fleet
# (grep-verified 2026-08-26: qa_not_before, next_recheck_not_before,
# qa_new_window_earliest_d1_close -- zero code readers existed anywhere
# before this fix). Any NEW gate-field name a future PO/QA ruling invents
# MUST be appended HERE and to the mirrored copy in
# docs/agents/qa/flow/main.md's Step 0d, or it silently reverts to
# unguarded -- same hand-maintained-array drift class the `$routed` guard in
# guard-signal-type-coverage.sh already hit once (see
# feedback_dedup_... / po_regression_recheck_20260807 in the archive).
def gate_not_before_keys: ["qa_not_before", "next_recheck_not_before", "qa_new_window_earliest_d1_close"];

# A row is GATED (not yet dispatchable) if ANY known key holds a value that
# parses (via the existing parse_ts, already null-safe/malformed-safe) to a
# STRICTLY LATER instant than $now. Absent key / null / unparseable value =
# that key does not gate -- mirrors parse_ts's existing convention elsewhere
# in this file (a malformed timestamp reads as absent, never as "gate
# forever" and never as "always gated"). Epoch comparison (not string
# comparison) sidesteps AC-6's lexicographic-boundary concern entirely --
# still worth a fixture proving it (see §1a Testing below).
def is_gated_not_before($now):
  . as $row
  | (parse_ts($now)) as $now_ts
  | ( gate_not_before_keys
      | map( parse_ts($row[.]) )
      | map( select(. != null) )
      | any(. > $now_ts) );
```

Wire into `scripts/devteam-review-claim-qa-drain.jq`'s candidate pipeline —
ONE new conjunct, applied identically to both the `review[]`-origin and
`done[]`-origin arms (it runs on the merged list, so no duplication needed):

```jq
    | map(select((.row | effective_next_agent($detail_items)) == "qa"))
    | map(select((.row | is_gated_not_before($now)) | not))   # NEW
    | map(. + { rank: (.row | priority_rank), age: (.row | age_epoch) })
```

This closes AC-1/AC-2 by construction for BOTH known keys today (extendable
to the third via the same list). AC-3 (byte-identical skip) is automatic —
a gated row never enters `$candidates`, so it is never touched, no lane-move,
no stamp, nothing to revert. AC-5 (absent-key rows unaffected) is automatic —
`any(...)` on an empty post-filter list is `false`. AC-6 (chronological
soundness across month/year boundaries) is satisfied MORE robustly than a
raw string compare would be, because the comparison is on parsed epoch
seconds, not string prefixes — still write the fixture pair the AC asks for,
as a regression proof, not because the epoch approach could fail it.

**Testing:** extend the existing hermetic fixture test
`scripts/test-devteam-donelane-drain.sh` (it already drives this exact
script against synthetic fixtures, per its I1–I8 invariants) with new
invariants: I9 (future `qa_not_before` excludes), I10 (past `qa_not_before`
includes), I11 (`next_recheck_not_before` symmetric proof — AC-2), I12
(absent-gate rows unaffected — AC-5), I13 (month-boundary + year-boundary
fixture pair — AC-6). Do not create a second parallel fixture harness for
the same script.

**AC-7 (call-site prose):** both `main.md` § Review-Lane QA-Drain (idle-tick)
and § Review-Lane QA-Drain — Head-Decoupled Invocation share the identical
`devteam-review-claim-qa-drain.jq` call — a one-line addition to each
section's existing "Claim" bullet suffices (they already say "see its Claim
bullet for full detail" at the head-decoupled site, so the addition need
only land once in the idle-tick site's Claim bullet + a one-clause note at
the head-decoupled site pointing back, mirroring how that site already
defers detail to the idle-tick site today).

**AC-4 — already independently satisfied, verified live this cycle, do
NOT re-do:** `FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-
20-WARNS` is `review[28]`, `status=REVIEW`, `next_agent=po`,
`qa_not_before=2026-08-26T14:59:30Z`, `redispatch_count` unchanged at 1 (qa-30
cycle already performed this exact disposition ad hoc, per its own notebook
entry and decision journal). The companion row `FU-RAG-DEPLOY-MEMORY`
(caught by the SAME premature hand-dispatch, different field name) is
likewise already back in `review[29]` with `next_agent=po`, gate intact,
no redispatch charged. Both confirmed via direct `jq` read against the live
file at 2026-08-26T04:2xZ. Nothing to write for AC-4.

### 1b. Layer 2 — qa-flow convergent backstop (closes the hand-dispatch path)

The picker-side fix above only protects the two paths that go through
`devteam-review-claim-qa-drain.jq`. Router hand-dispatch (and any future ad
hoc picker) bypasses that script entirely — there is no jq predicate that
can intercept a human/router manually calling `task_claim` +
`Agent("qa", ...)`. The one place EVERY dispatch path — scripted or
hand — converges is the spawned `qa` agent's own flow, at its very first
step, before any verify work runs. That is where the actual harm (~290k
tokens burned re-deriving a fact already on the row) is incurred, and it is
the only convergence point that is architecturally guaranteed regardless of
how qa was invoked.

Add to `docs/agents/qa/flow/main.md`, immediately after Step 0c (before
`## Smart-Skip`, before ANY JUMP-TO branch — the file's own "Dispatch —
Fluid JUMP TO" section already states pre-checks run before the jump for
every mode, so this is a natural, zero-risk insertion point):

```markdown
**Step 0d — Not-Before Gate Check (mandatory, before ANY jump target)**

Read this task's own row directly off `docs/data/orch/orch-state.json` by
`task_id` (wherever it currently lives — do not assume a lane). Check every
key in the known allowlist — SSOT: `gate_not_before_keys` in
`scripts/lib/devteam-eligibility.jq`; keep this list in sync with that one,
never hand-copy a stale snapshot:
  `qa_not_before`, `next_recheck_not_before`, `qa_new_window_earliest_d1_close`

If ANY present key's value is LATER than `date -u +%Y-%m-%dT%H:%M:%SZ` right
now:
  - STOP. Do not run BCTC/OOM/test/DDD/security checks — no further tool
    calls against this row's content.
  - Reverse the dispatch, in one `orch-apply.sh` write: if `drain_source_lane`
    is set, move back to that lane (`review`/`done`) with matching status
    (`REVIEW`/`DONE`); clear `claimed_at`/`claimed_by`/`drain_source_lane`.
    Route `next_agent` to the row's own `owner`/`owner_agent` (fallback
    `"po"`) — same fallback chain as the existing verify-committed-changes
    path.
  - Do NOT increment `redispatch_count` — no verify work happened, nothing to
    charge.
  - Append a short `status_note`: "[QA] HOLD — <key>=<value> not yet elapsed
    (now=<now>). Not dispatched, not charged."
  - Self-verify at HEAD (same discipline as every other lane-move in this
    file).
  - RETURN `UNVERIFIED-BLOCKED`, reason = the gating key + value,
    `PIPELINE: continue` — do NOT jump to `pipeline`/`verify-committed`/etc.

No known key present, or all present keys already elapsed → proceed
unchanged to Smart-Skip / the JUMP-TO table.
```

This generalizes what qa-30 already did ad hoc for one row's prose clause
(`po_ruling_ac3_scope_20260825`) into a durable, mandatory, FIRST step —
future rows carrying any of the known gate fields get this protection
without an agent needing to re-derive it from the row's own prose, and it
is immune to which dispatcher (script or human) put the row in front of qa.

**Residual, not closed here:** the field-name fragmentation itself (3+ ad
hoc names, no normalization) is contained by a known-list, not eliminated.
If a 5th name appears, both lists must be updated by hand. Flagging as a
recommendation, not a new AC: a lightweight periodic grep-audit (mirrors
`guard-signal-type-coverage.sh`'s own `$routed`-drift class) that scans the
live board for `*_not_before`/`*_earliest*` field names NOT in either known
list would catch drift instead of silently reverting to unguarded — left for
PO/architect triage to decide whether it is worth a dedicated row.

---

## 2. FIX-QADRAIN-DONE-TO-QA-SCORES-BACKWARD-CONSERVATION-ABORTS-WHOLE-DRAIN

**Decision: fix direction (1) from the row's own ranked list — teach the
rank MODEL, not a bigger tolerance and not a self-declared bypass.**

Read `scripts/orch-conservation-check.mjs` directly (lines 216, 369–378,
416–432). `LANE_RANK` is currently `Object.fromEntries(FLAT_TASK_LANES.map((lane,
i) => [lane, i]))` — i.e. it blindly reuses `FLAT_TASK_LANES`'s array
POSITION as the pipeline rank. `FLAT_TASK_LANES` is
`['backlog','ready','in_progress','review','qa','done','done_verified']` — an
order that was chosen for `task_total()`'s iteration (where order is
irrelevant, it's a sum), not for rank semantics. Under that order, `done`
(index 5) ranks ABOVE `qa` (index 4) — encoding "done is a stage that comes
after qa", which is FALSE for this board: `done[]` = developer-complete
*awaiting* QA sign-off (per the file's own `FIX-DONELANE-NO-DONEVERIFIED-
PRODUCER-DEP-STARVATION` history and the qa-drain script's own header,
`done[]` is a SECOND pre-QA staging lane feeding `qa[]`, exactly like
`review[]`) — only `done_verified[]` is the true post-QA terminal.

The file's own header comment (LANE-PLACEMENT DIMENSION section) already
states the invariant it relies on: "batch multi-row claim scripts ... always
move FORWARD, never backward, so this floor does not affect them" — that
claim is FALSE today for the done-origin half of the QA-Drain batch, which
is exactly the deadlock. Fixing the rank model makes this documented
invariant TRUE again, rather than merely working around its violation.

**Change (single file, ~10 lines):**

```js
// was:
// const LANE_RANK = Object.fromEntries(FLAT_TASK_LANES.map((lane, i) => [lane, i]));

// FIX-QADRAIN-DONE-TO-QA-SCORES-BACKWARD-CONSERVATION-ABORTS-WHOLE-DRAIN:
// LANE_RANK is now an explicit TIER map, decoupled from FLAT_TASK_LANES'
// array position (that array's order still governs task_total()'s
// iteration only, unaffected by this change). `done` shares review's tier —
// both are pre-QA staging lanes that feed qa[] via
// scripts/devteam-review-claim-qa-drain.jq's own review[] UNION done[]
// selector; done[] is NOT the post-qa stage its FLAT_TASK_LANES position
// implied. Only done_verified is the true terminal counterpart to qa[]
// sign-off.
const LANE_RANK = {
  backlog: 0,
  ready: 1,
  in_progress: 2,
  review: 3,
  done: 3,
  qa: 4,
  done_verified: 5,
};
```

**Why this over the row's own alternatives:**
- vs. (1)-as-literally-worded "exempt exactly next_agent=='qa' transitions":
  the tier fix subsumes it with LESS code — no need to thread each row's
  `next_agent` value into a currently lane-only/id-only rank comparison
  (`undeclaredBackwardLaneMoves` only sees `{id, from-lane, to-lane}` pairs
  today; adding a field-value condition would need it to also carry row
  content, a bigger diff for the same outcome).
- vs. (2) self-declaring in the claim script: rejected — it re-introduces a
  trust-the-writer bypass for an INDEPENDENT guard whose entire purpose is
  to catch a WRITER being wrong (stale full-doc candidate). A buggy or
  compromised script could self-declare falsely and never be caught; the
  guard should stay armed against its own producer, not exempted by it.
- vs. (3) "split the lane vocabulary" read as a schema/rename change: NOT
  needed — the JSON lane keys stay exactly as-is (`done[]` remains
  `done[]`); only this file's LOCAL derived rank map changes, and `LANE_RANK`
  is used in exactly ONE place in the whole repo (verified: `grep -rn
  LANE_RANK` outside this file returns zero hits) — the "widest blast
  radius" concern the row itself raised does not apply to this
  implementation of the idea.

**Verify the guard stays armed for the real hazard:** a genuine stale
revert of `qa[] -> done[]` (candidate lane `done`=3, live lane `qa`=4) is
still `3 < 4` → correctly flagged as backward. A genuine two-or-more-row
stale full-doc revert (the reproduced incident this guard exists for) is
untouched by this change — only the `done`↔`qa` forward direction is
affected.

**AC mapping:** (1) two-or-more done-origin `next_agent=="qa"` rows claimable
in one write with no `ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES` and no raised
tolerance — satisfied by construction (`done->qa` is no longer `<`). (2)
negative control, a genuine >=2-row stale revert still aborts — unaffected,
still `<`. (3) fixture replaying the 03:22Z shape (2 review + 2 done
eligible) lands all 4 — satisfied.

**Testing:** no dedicated test file exists today for
`orch-conservation-check.mjs` (grep-confirmed). Recommend a new
`scripts/test-orch-conservation-lane-rank.sh`, same hermetic-fixture
discipline as `scripts/test-devteam-donelane-drain.sh` (synthetic live/
candidate doc pairs, no live-file writes), covering the 3 ACs above plus a
same-tier lateral case (`review`↔`done`, should never flag) as a documented
non-goal, not a silent gap.

**Doc-sync (not a new AC, matches this codebase's existing self-consistency
convention):** the file's own header "LANE-PLACEMENT DIMENSION" prose
currently asserts batch claims "always move FORWARD" as an unqualified fact
— update it to name the done/review tier-equivalence explicitly, so the
comment matches the corrected model instead of silently going stale again.

---

## 3. FIX-DEVTEAM-QADRAIN-SKIP-BRANCH-STRANDS-ALREADY-LANEMOVED-ROW-IN-QA

**Decision: fix direction (b) from the row's own AC-1 menu — the SKIP
branch reverses its own lane-move for exactly that one row, immediately,
same tick.**

Rejected alternatives, and why:
- (a) script stops lane-moving until the caller confirms the outer claim:
  would require N separate per-row `orch-apply.sh` writes (claim-then-move,
  one row at a time) instead of the current single atomic N-row batch write
  — reverses the exact throughput-cap design
  (`FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP`, 2026-08-06) that exists because
  one-row-per-tick could not keep pace with the backlog. Most invasive,
  rejected.
- (c) a dedicated qa[]-stranded-row re-picker (watchdog): this is materially
  the SAME shape as the sibling backlog row
  `FIX-DEVTEAM-QA-LANE-STALE-AGE-WATCHDOG-BLIND` — doing it here would
  encroach on that row's scope and, worse, only detects a strand AFTER some
  age threshold elapses (the 12-day/3-day/7-hour strands this row's own
  router-note measured). (b) prevents the strand from ever existing, zero
  window of invisibility, no heuristic threshold needed.

**Mechanism:** the batch mutation already stamps `drain_source_lane:
"review"|"done"` on every row it moves into `qa[]` (see
`devteam-review-claim-qa-drain.jq` line ~210) — this field is the exact
routing information the reversal needs, already present, no new field to
mint. New small script `scripts/devteam-qadrain-skip-revert.jq`
(`--arg id`, `--arg now`), invoked identically from BOTH SKIP branches
(idle-tick + head-decoupled — they already share identical pseudocode, per
direct read of both sections):

```jq
# scripts/devteam-qadrain-skip-revert.jq
# FIX-DEVTEAM-QADRAIN-SKIP-BRANCH-STRANDS-ALREADY-LANEMOVED-ROW-IN-QA
# Reverses ONE row's qa[] lane-move when the caller's per-row outer_claim
# (task_claim) failed after the batch script already moved it. Defensive:
# no-op if the row is no longer present in qa[] or no longer status==QA
# (a peer already progressed it further — never clobber that).
(.task_board.qa // []) as $q
| ([$q[] | select(.id == $id)][0]) as $t
| if $t == null then .
  elif ($t.status // null) != "QA" then .
  else
    ($t.drain_source_lane // "review") as $src_lane
    | ($src_lane | ascii_upcase) as $src_status
    | .task_board.qa = [$q[] | select(.id != $id)]
    | .task_board[$src_lane] = ((.task_board[$src_lane] // []) + [
        ($t + { status: $src_status, status_note: (($t.status_note // "") +
            "\n[dev-team] QA-DRAIN SKIP-REVERT: outer_claim failed (peer-held); "
            + "returned " + $src_lane + "[] unchanged, not charged.") }
          | del(.claimed_at, .claimed_by, .drain_source_lane))
      ])
  end
```

Wire at BOTH call sites' existing SKIP branch:
```
if not outer_claim.claimed:
  log "[dev-team] QA-DRAIN SKIP " + row.id + " -- held by peer session, reverting lane-move"
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg id "<row.id>" --arg now "$NOW" -f scripts/devteam-qadrain-skip-revert.jq \
    docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
  # do NOT `|| true` this -- see constraint below
  continue
```

**No `redispatch_count` charge** — no qa work happened, nothing to penalize
(same "not charged" convention row 1's AC-4 already established for the
premature-dispatch case).

**Constraint — do not reintroduce the sibling pipe-swallow defect:** the
sibling row `FIX-DEVTEAM-QADRAIN-PIPE-SWALLOWS-CAS-ABORT-NO-RETRY`
(agent-father-owned, not in this scope) exists BECAUSE the batch claim's own
`orch-apply.sh` pipe ends in `|| true` with no retry. Do not copy that shape
onto this NEW revert pipe — leave it bare (or retry-once-on-exit-2), and log
loudly on any nonzero exit rather than silently discarding it, so this new
call site does not ship as a fresh instance of the exact defect that sibling
row is chartered to fix elsewhere in the same file.

**Interaction with `FIX-QADRAIN-NO-TASKID-LEVEL-CLAIM-DUPLICATE-QA-SPAWN`
(developer-owned, not in this scope):** that row's requested fix (task_claim
per candidate row BEFORE the batch board-move, wrapping the selection) would,
if it lands, make this SKIP branch structurally unreachable for its
originating cause (a failed claim would never have been board-moved to begin
with). This revert code does not conflict with that future state — it
becomes a harmless dead branch, not a competing mechanism. Build order is
irrelevant; land in either order.

**AC-3 fixture proof:** a synthetic fixture where `outer_claim.claimed ==
false` for a row already in `qa[]` (status QA, drain_source_lane set) —
assert after invoking the revert script the row is back in the correct
source lane with matching status, `claimed_at`/`claimed_by`/
`drain_source_lane` cleared, and reappears in the ordinary claim script's
own candidate set on a subsequent invocation (proves "picked up on a
subsequent tick" without needing a live tick to elapse).

**AC-5 — live sweep, performed this cycle, one disposition only:**
`.task_board.qa[]` holds exactly ONE row today:
`FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED`
(`claimed_at=2026-08-14T08:32:49Z`, `blocked_by=FU-RAG-DEPLOY-MEMORY`). This
is NOT an instance of this row's defect — `FU-RAG-DEPLOY-MEMORY` is still
genuinely unresolved (`review[29]`, `status=REVIEW`, gated by
`qa_new_window_earliest_d1_close=2026-08-26T14:59:30Z`, not yet elapsed),
so the block is a live, correct dependency wait, not an invisibility/strand
artifact. The router's own same-day note already traced this and states the
unblock is instructed to happen on the FU row's own terminal write on PASS —
do not touch this row as part of landing this fix. The two rows that WERE
genuinely stranded by this exact defect (`FU-RAG-DEPLOY-MEMORY`,
`FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-20-WARNS`)
have already been returned to `review[]` by today's qa cycles (verified
live, same evidence as §1a's AC-4 note) — zero remaining stranded rows as of
this cycle.

---

## 4. Sequencing recommendation for the implementer

All three land in one developer hop, per the rows' own `po_scope_note`
precedent ("same-file siblings ... can share one hop"). Suggested order,
each independently testable and independently safe to land alone:
1. §2 (conservation rank fix) first — it is the narrowest, most isolated
   change (one file, one map), and currently-latent (re-arms at 2 done-origin
   `next_agent=="qa"` rows) — landing it removes a live time-bomb before
   touching the picker it protects.
2. §1a (picker-side gate predicate) — depends on nothing above, but should
   land before §1b so the cheaper prevention layer is live first.
3. §1b (qa-flow convergent backstop) — independent of §1a's exact
   implementation, but designed as its complement, not a substitute.
4. §3 (SKIP-branch revert) — independent of 1–3, touches a different code
   path in the same call sites §1a's AC-7 also touches; do both edits to
   each call site in the same pass to avoid two round-trips through the
   same file section.

None of the four introduces a schema change, a new field, or a new lane —
all four are internal to already-existing mechanisms (`scripts/lib/
devteam-eligibility.jq`, `devteam-review-claim-qa-drain.jq`,
`orch-conservation-check.mjs`, `docs/agents/qa/flow/main.md`,
`docs/agents/dev-team/flow/main.md`).
