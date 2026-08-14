Architecture Brief — Ready-Lane Incident Dispatch: Dedicated Budget + Head-Decoupled
Invocation (not a comparator fix)

Date: 2026-08-14T11:xxZ
Task: FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0 (P0, cross-service/,
owner architect, dispatched via Ready-Lane Consumer itself — see §0)
Mode: DESIGN — zero production code/flow-doc changed here; PM to mint 2 implementation
rows per §5.
Author: architect

---

## 0. Do not re-derive — PO already refuted this row's own framing, read first

`po_measurement_20260814` (this row's own field, quoted in full in the dispatch context)
re-measured live 2026-08-14 and found: (1) a row PO had *already severity-expedited to
the FRONT of its priority class* on 2026-08-13T17:28Z still was not dispatched ~7h later;
(2) a separately-BATCH-promoted row sat at eligible-queue position 51/88, 24 days
unactioned. Conclusion: **the binding constraint is THROUGHPUT (RLC claims exactly ONE
`ready[]` row per invocation, and only runs on the ~1-in-6 idle-fallthrough ticks the
6-way Idle-Tick Rotation selects `"rlc"` for), not comparator/ordering.** An
expedite-field-as-sort-key fix (candidate (a) as originally scoped, or age-weighted
tiebreak candidate (b)) would not have helped either measured case, because both rows
were already effectively unbeatable on ordering grounds and still starved.

## 1. Fresh, independent, live re-verification this session — corroborates, does not
merely repeat, PO's finding

Read `docs/data/orch/orch-state.json` directly and replayed RLC's own live candidate
selection (`scripts/devteam-backlog-claim-ready-lane-consumer.jq`'s exact
gate/sort — `sort_by([priority_rank, idx])` over the same
`effective_supervised`/`effective_plan_only`/`is_epic_wrapper`/`deps_satisfied`/
`is_detail_deferred`/resolved-next_agent chain from `scripts/lib/devteam-eligibility.jq`)
against the live board, read-only, never written:

- `.task_board.ready[]` = 97 rows; RLC's own eligible candidate set (after every gate) =
  **68 rows**.
- `po_expedited_at` is a real, live, already-in-use PO convention (NOT proposed here) —
  grep-confirmed 5 live rows carry it today, all stamped by the same PO triage pass
  (`2026-08-13T17:28:37Z`): 2 in `ready[]`
  (`FIX-BCTC-REPARSE-PERIOD-KEY-SYSTEMATICALLY-STALE-100PCT-QUARANTINE`,
  `FIX-DEVTEAM-COLDEVICT-FAILURE-REPORT-SWALLOWS-STDERR`), 1 `in_progress[]` (this row
  itself), 2 `review[]`.
- Replayed RLC's own sort against the live board: **both live `ready[]`-resident
  `po_expedited_at` rows rank #1 and #2 of the 68-row eligible set, right now** — ordering
  is, empirically, already perfect for them. They are STILL sitting undispatched in
  `ready[]`, `updated_at` ~10-11h stale as of this read (`2026-08-14T00:3xZ`), i.e. they
  have already survived at least one, plausibly several, hourly dev-team ticks without
  being claimed despite occupying the best possible queue position. **This is a third,
  independently-measured live data point on top of PO's two — an expedite-as-comparator
  fix provably cannot move these two rows any further forward than they already are, and
  they are still stuck.**
- Root cause confirmed directly from `docs/agents/dev-team/flow/main.md`: dev-team's own
  cron is `7 * * * *` — **hourly, one tick per invocation** (`docs/standards/cron-jobs.md:314`,
  singleton-guarded by `dev-team-cron-singleton`) — not the 15-min cowork cadence. Idle-Tick
  Rotation Selection (§552) picks exactly ONE of 6 candidates
  (`bounded1`/`sls`/`rlc`/`drs`/`qa_drain`/`step1_triage`) per tick, aged-round-robin, with
  an explicit **"No same-tick cascade"** rule (§572): if the selected lane's own turn is a
  no-op, the tick is simply spent, never falls through to the next candidate. So RLC gets a
  turn roughly once every 6 hourly ticks ≈ every 6h at best — and even on its own turn, must
  additionally clear `WIP3 < 2`, a budget it shares with SLS/BOUNDED-1/DRS. Against a 68-row
  eligible queue, single-row-per-turn dispatch at ~1-in-6-hourly cadence is a floor-bound
  latency problem independent of what the comparator does inside that one claim.

## 2. Precedent already proven live in this exact repo — reuse it, don't re-derive

`docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md` +
`docs/architecture-briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md` diagnosed
and fixed the structurally identical problem for the Review-Lane QA-Drain consumer:
single-claim, rotation-gated, starving against a growing queue. The shipped fix combined
three ingredients, NOT a comparator change:

1. **An independent budget outside the shared `WIP≤2` slot** (`qa[] < QA_CAP`, currently
   `QA_CAP=10`) — never competes with BOUNDED-1/SLS/RLC/DRS's concurrency.
2. **Batch-claim N-per-invocation** (`TAKE_BUDGET = QA_CAP - QA_WIP`), not 1-per-tick.
3. **A SECOND, head-decoupled invocation site** at the Session-Gate→Step-1 anchor, running
   UNCONDITIONALLY every tick (idle or busy, rotation-selected or not) — sharing the same
   budget/claim script as the original rotation-gated site, never a divergent shape (brief
   §1b, explicitly rejected shipping two different batching behaviors for the same lane).

**Measured, live, right now, re-verified this session (not trusted from the old brief's own
numbers):** `review[]` PRIMARY (`status==REVIEW && next_agent=="qa"`) count = **56** today,
down from 226 at the 2026-08-06 brief's own baseline (269 peak reported 2026-07-29) — a real
~4x reduction over 8 days despite continuous developer inflow into the same lane the whole
time. This is the closest available in-repo empirical proof that (independent budget +
batch-claim + rotation-independent invocation) is what actually drains a structurally
identical starved lane — a comparator change was never part of that fix's throughput
mechanism (the one comparator change QA-Drain DID make — `sort_by(.age)` →
`sort_by([priority_rank, .age])` — was bundled for a different, narrower reason: same-day P0
rows queuing behind a 13-day P2/P3 FIFO wall *within* an already-fixed-throughput batch; it
was never claimed to fix reachability by itself, and per §0/§1 above, reachability is this
row's actual problem).

## 3. Adjudicating the row's own 3 candidate shapes against the "would this have unblocked
either measured live case" test (mandatory per dispatch context)

- **(a) `expedite_at`/`incident_ref` field sorting ahead of `priority_rank`:** FAILS the
  test. §1 just demonstrated the live equivalent of this (rows already at rank #1/#2 of a
  68-row queue) is STILL undispatched. A field that only changes ordering cannot fix a
  1-in-6-tick-times-1-row-per-tick throughput ceiling — the row was already unbeatable on
  ordering and still starved.
- **(b) age-weighted/arrival-inverted tiebreak inside a priority class:** FAILS the test for
  the identical reason as (a) — it is also purely a comparator change, and comparator
  changes cannot move a rank-#1 row any further forward. Additionally, unlike (a), it
  would generically re-shuffle EVERY P0 row's relative order (not just PO-flagged
  incidents), a strictly larger blast radius for zero measured benefit.
- **(c) a separate low-cardinality incident lane with its own budget, outside the shared
  `WIP≤2` slot and outside the 6-way rotation, mirroring QA-Drain:** PASSES the test by
  construction — this is exactly the shape §2's precedent used, and that precedent is the
  only mechanism in this repository with a measured live drain on a structurally identical
  starvation problem. **Adjudicated: ship (c)**, scoped and hardened per §4 below so it
  cannot itself become "a 4th priority tier" (the row's own scope explicitly warns against
  that failure mode for a naive fix).

## 4. Design — Incident-Lane Consumer (ILC)

### 4a. Selector field — reuse, do not invent

`po_expedited_at` (+ `po_expedited_by`) is already a live PO-authored convention (§1) —
**do not add a new `expedite_at`/`incident_ref` field name.** `TaskSchema` is
`.passthrough()` (`apps/mcp-server/src/infrastructure/orchStateSchema.ts:153-193`), so this
requires zero schema change either way; reusing the existing field is purely an
extend-not-duplicate discipline call (`always_extend_not_duplicate`, architect's own
standing constraint) and keeps PO's existing triage habit (already used on 5 live rows,
0 code consumers today) load-bearing instead of orphaned.

New predicate, `scripts/lib/devteam-eligibility.jq`:
```jq
def is_po_expedited:
  ((.po_expedited_at // "") | tostring) != "";
```
Board-only (no `$detail_items` fallback) — all 5 live examples are board-inline; no
detail_ref'd `po_expedited_at` has ever been observed. Documented simplification, not a
silent gap — extend to a detail-first/board-fallback shape (mirrors every other
`effective_*` predicate) only if a detail-authored expedite is observed live.

### 4b. Independent budget — genuinely separate from `WIP≤2`, hard-bounded

New predicate, same file, positioned near `wip_in_progress` (needs
`is_terminal_task_status`/`normalize_task_status` already in scope there):
```jq
def incident_wip_in_progress:
  [ (.task_board.in_progress // [])[]
    | select( (is_terminal_task_status(.status) or (normalize_task_status(.status) == "BLOCKED")) | not )
    | select( (.claimed_by // "") == "dev-team (incident-lane consumer)" )
  ] | length;
```
Rows land in the SAME `in_progress[]` lane RLC/SLS/BOUNDED-1/DRS already use (no new
`TaskBoardSchema` lane — `.strict()` on exactly 9 enumerated lanes, same "real schema
change, avoid unless forced" constraint SECONDARY-Drain's own header already documents) —
but are excluded from `wip_in_progress` by the `claimed_by` marker, so they consume
**neither** the shared `WIP≤2` slot **nor** compete with BOUNDED-1/SLS/RLC/DRS for it.
`INCIDENT_CAP=2` (named constant, main.md-local, same `QA_CAP` convention) is the ENTIRE
answer to the scope's "must not saturate like a 4th priority tier" requirement: regardless
of how many rows PO ever marks `po_expedited_at`, at most 2 are ever in flight through this
lane at once — the rest queue, capped, inside the incident pool's own (small) ordering,
never inside the shared `ready[]` P0 class.

### 4c. Claim shape — batch, priority-then-oldest-expedite-first, same conditional-`.head`
idiom as every sibling

New script, `scripts/devteam-backlog-claim-incident-lane-consumer.jq` — same file shape as
`scripts/devteam-backlog-claim-ready-lane-consumer.jq` (no promote half; candidates already
in `ready[]`), differences only:
- Candidate filter ADDS `select(.value | is_po_expedited)` to RLC's own exact eligibility
  chain (not supervised, not plan_only, not epic-wrapper, `deps_satisfied`, not
  detail-deferred, resolved next_agent/owner) — **deliberately does NOT relax the
  supervised/plan_only gate for incidents.** Severity changes throughput priority, never
  safety gating — a `supervised:true` row still needs deliberate dispatch regardless of
  urgency; PO's own existing manual-dispatch escape hatch remains the correct path for
  that (rare) intersection, unchanged by this design.
- Sort: `sort_by([.rank, .po_expedited_at, .idx])` — priority first (a stray P1-expedited
  row never jumps a P0-expedited one), then OLDEST-expedited-first (so a freshly-marked
  incident cannot perpetually cut ahead of one already waiting inside this small pool —
  candidate (b)'s fairness idea, correctly scoped to the bounded incident pool only,
  never the whole `ready[]` queue), array-index as the final tiebreak.
- Takes `$candidates[0:$take]`, `$take = [$take_budget, ($candidates|length)] | min`
  (`$take_budget` passed by the caller as `INCIDENT_CAP - incident_wip_in_progress`, same
  `TAKE_BUDGET` idiom QA-Drain already uses) — batch, not single-row.
- Stamps `claimed_by: "dev-team (incident-lane consumer)"` — a DISTINCT marker from RLC's
  own `"dev-team (ready-lane consumer)"` (auditability + the §4b budget-exclusion filter
  keys off exactly this string, same distinct-stamp convention SLS-PRIMARY-vs-FALLBACK and
  QA-Drain-vs-SECONDARY-Drain already use elsewhere in this file).
- `po_expedited_at`/`po_expedited_by` carried through UNCHANGED (provenance preserved, same
  "additive lane assignment, never a gate-clear" convention SLS/DRS already use for
  `supervised`/`plan_only`).
- `.head` write: the SAME `$head_free` conditional guard RLC/SLS/DRS/QA-Drain already use
  (never an unconditional replace) — narrates only the batch's top row, cosmetic only,
  never load-bearing (dispatch always correlates via `claimed_at`/`claimed_by`, never
  `.head.next_action`, identical idiom to every sibling batch consumer). **This is what
  keeps the single-linear head-writer collision-freedom proof intact** — no new write
  pattern is introduced, only a new caller of the already-proven-safe one.

`scripts/devteam-backlog-claim-ready-lane-consumer.jq` itself needs no logic change (its own
eligibility filter has no reason to special-case `po_expedited_at` — see §4e for why the
harmless overlap between the two consumers is safe by construction) — only a header-comment
cross-reference addition pointing to the new ILC section, so a future reader does not
mistake RLC as still the sole `ready[]` consumer.

### 4d. Invocation — ONE site, head-decoupled, unconditional, placed FIRST among the
existing unconditional blocks

Unlike QA-Drain (which kept BOTH its original rotation-gated site AND added a
head-decoupled one, because the rotation-gated site still usefully claims on idle ticks the
head-decoupled site's own placement — after Session Gate — would also reach anyway), ILC
needs only the head-decoupled site: it strictly dominates a rotation-gated one (fires on
every tick, idle or busy, `$SELECTED` irrelevant), so adding a second rotation-competing
site would only reintroduce a smaller-scope version of the same 1-in-N throttle this design
exists to remove.

**Placement:** new section `### Incident-Lane Consumer (ILC) — Head-Decoupled Invocation
(severity/incident expedite path)`, inserted immediately after the Session Gate paragraph
(`<!-- jump:session-gate -->`, content-anchored — this file changes frequently, never
line-number-anchored per its own established discipline) and **BEFORE** § Review-Lane
SECONDARY-Drain — i.e. FIRST of the three unconditional Session-Gate→Step-1 blocks
(ILC → SECONDARY-Drain → QA-Drain Head-Decoupled → Step 1). Deliberate ordering: P0
incident dispatch outranks review/QA-sign-off triage for the shared `.head` slot each tick
when both would otherwise be free; SECONDARY-Drain's own intro sentence ("Runs immediately
after the Session Gate above") needs a one-clause update to say "after the Incident-Lane
Consumer above" (or reference the anchor generically) since it is no longer physically
first.

```bash
INCIDENT_CAP=2   # named constant; retune together with the DoD trend below if 5-tick measurement under/over-shoots
INCIDENT_WIP=$(jq 'include "scripts/lib/devteam-eligibility"; incident_wip_in_progress' docs/data/orch/orch-state.json)
if [ "$INCIDENT_WIP" -lt "$INCIDENT_CAP" ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  TAKE_BUDGET=$((INCIDENT_CAP - INCIDENT_WIP))
  jq --arg now "$NOW" --argjson take_budget "$TAKE_BUDGET" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    --slurpfile archive <(bash "$PROJECT_ROOT/scripts/lib/archive-glob-cat.sh") \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-claim-incident-lane-consumer.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  picked_batch=$(jq -c --arg t "$NOW" --arg by "dev-team (incident-lane consumer)" \
    '[.task_board.in_progress[] | select(.claimed_at == $t and .claimed_by == $by)]' \
    docs/data/orch/orch-state.json)
fi
# INCIDENT_WIP>=INCIDENT_CAP, or nothing po_expedited_at-eligible in ready[] -> $picked_batch
# stays empty/unset -> fall through unchanged, continue to Review-Lane SECONDARY-Drain
```

If `$picked_batch` non-empty: same BGFAN-1 per-row `task_claim` → `Agent(row.next_agent, ...,
run_in_background=true)` → on failure `task_release` → fan-out loop QA-Drain's
head-decoupled site already uses verbatim (spawn built DIRECTLY from `row.id`/`row.next_agent`
— never `head.next_action`, same reason RLC/SLS/DRS already give: the row's dispatch lane is
already resolved, no zone-detect indirection), then `JUMP TO end` (do not also fall through
to SECONDARY-Drain/QA-Drain/Step-1 the same tick — same throttle-by-successful-claim
convention every sibling consumer already uses).

### 4e. Overlap with RLC — flagged and proven safe, not silently absorbed

On a tick where rotation happens to select `"rlc"` AND `WIP3<2`, RLC's own (unmodified)
eligibility filter has no reason to skip a `po_expedited_at` row — it could claim one first,
via the SHARED `WIP≤2` budget rather than the independent `INCIDENT_CAP` budget. This is
**benign, not a collision**: RLC runs strictly earlier in the tick's control flow (Idle-Tick
Rotation Selection, §552, precedes Session Gate, §909) and `JUMP TO end`s on a successful
claim, so ILC's later section is either never reached that tick (row already dispatched) or,
if RLC's own turn found nothing, ILC still gets its unconditional shot moments later in the
same tick. No double-claim is possible by the same "already removed from `ready[]` by a
predecessor in the same sequential `orch-apply.sh` write" argument every existing consumer's
own header comment already relies on (RLC's, SLS's, DRS's). The only externally-visible
effect of this overlap is which of the two named budgets (`WIP≤2` vs `INCIDENT_CAP`)
happened to carry that one pick — never a correctness or `.head`-collision risk. **This is
exactly why the two consumers dominate in complementary windows**: ILC is strictly better on
the ~5/6 of ticks rotation does NOT select `"rlc"`, and on any tick where `WIP3` is already
saturated — precisely the windows PO's own measurement showed RLC alone cannot reach.

### 4f. Scope boundary — `ready[]` only, matches the row's own `files` list

`backlog[]`-resident `po_expedited_at` rows are out of scope here (not silently ignored):
they must already be promoted into `ready[]` by BOUNDED-1/SLS/DRS's existing promote
scripts, or placed there directly by PO/PM/architect (same "arrived via deliberate
placement, not through a promote script" class SLS-claim's own FALLBACK path already
handles for the supervised+plan_only pair) before ILC's own claim script becomes reachable.
Matches this row's own `files` list (`scripts/devteam-backlog-claim-ready-lane-consumer.jq`,
`scripts/lib/devteam-eligibility.jq`, `docs/agents/dev-team/flow/main.md` — RLC's own
territory, never `backlog[]`-promote scripts).

## 5. Unified action plan — zone-split, mirrors the QA-Drain 2026-08-06 precedent exactly
(§1c of that brief: same file family hit the identical developer-vs-agent-father zone split)

**`FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS`** (developer, size M, no `depends_on`):
1. `scripts/lib/devteam-eligibility.jq` — add `is_po_expedited` (§4a) and
   `incident_wip_in_progress` (§4b), positioned near `wip_in_progress`/
   `is_terminal_task_status` per this file's own documented def-order constraint.
2. NEW `scripts/devteam-backlog-claim-incident-lane-consumer.jq` (§4c), full header comment
   mirroring `scripts/devteam-backlog-claim-ready-lane-consumer.jq`'s own documentation
   style (Problem/Selection/Dispatch/Concurrency/Mutation/Usage sections).
3. `scripts/devteam-backlog-claim-ready-lane-consumer.jq` — header-comment-ONLY addition
   (no logic change) cross-referencing ILC, per §4c's closing note.
4. Extend `scripts/audits/devteam-dispatch-gate-satisfiability.sh` with an ILC fixture
   section (shared instrument with BOUNDED-1/SLS/RLC/DRS/QA-Drain): positive (a
   `po_expedited_at` row buried deep in `ready[]` index is still claimed first within the
   incident pool), negative (a non-expedited P0 row untouched by ILC, still RLC's own
   territory), `INCIDENT_CAP` boundary (a 3rd simultaneously-expedited row is NOT claimed
   while 2 are already in flight), WIP-independence (`INCIDENT_WIP<2` claim succeeds even
   when the SHARED `WIP≤2` is already saturated — the core throughput property this design
   exists to prove), head-busy negative control (`.head` byte-identical when genuinely
   busy — mirrors the 07-29 brief's own §6 DoD list verbatim for this new consumer).

**`FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW`** (agent-father, size M,
`depends_on: ["FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS"]` — **a hard technical
dependency here, not merely coordination hygiene** (contrast the 2026-08-06 QA-Drain
brief's own "not strictly necessary" ruling on ITS analogous dependency, §1a of that
brief): this row's own `-f
scripts/devteam-backlog-claim-incident-lane-consumer.jq` call site references a file that
does not exist at all until the SCRIPTS row ships — unlike QA-Drain's case, there is no
backward-compatible old call site to fall back to):
1. Insert § Incident-Lane Consumer — Head-Decoupled Invocation per §4d, at the specified
   anchor (content-anchored, re-read the live file immediately before editing — same
   discipline `docs/architecture-briefs/2026-08-14-devteam-head-nextagent-write-coherence.md`
   §1/§9 already documents for this same file, given its high edit frequency).
2. Update § Review-Lane SECONDARY-Drain's own intro sentence (§4d).
3. New Reusable Scripts bullet for the new claim script (mirrors every existing bullet's
   format).
4. § Invariants gains one clause naming `INCIDENT_CAP` as a second independent budget,
   alongside the existing `WIP≤2` and (already-named-elsewhere) `qa[]<QA_CAP` — so a future
   reader auditing concurrency budgets in one place sees all three, not two.
5. Regression coverage per the SCRIPTS row's §4 above (shared instrument, no separate
   file needed on this side).

**Sequencing:** strict — SCRIPTS before MAINFLOW (§ above), unlike QA-Drain's own optional
ordering. No dependency on `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` (already
`DONE_VERIFIED`, live-confirmed §1) or on either PENDING head-pin-family row — ILC's own
insertion point (Session-Gate→Step-1 anchor) is the SAME anchor QA-Drain's Part 2 and
SECONDARY-Drain already occupy without incident, zero byte overlap with the Idle-Tick
Rotation Selection block or the WF-1/1b/1c/1d/WF-2/WF-3/WF-4 chain earlier in Step 0b.

## 6. Why not fold this row's own implementation into itself (architect boundary)

Per this flow's own constraint (architect designs, never implements) and the established
"architect does not mint implementation rows itself" convention (task-breakdown is PM's
job) — this row hands off to `pm` to mint the 2 rows in §5 with the exact
`files`/`owner`/`depends_on` specified, mirroring the QA-Drain precedent's own split
verbatim (same zone-routing ruling, `po_routing_ruling_20260721`: `docs/agents/**` prose
routes to `agent-father`, plain `scripts/` routes to `developer`, never mixed onto one
`next_agent`).

## 7. Dedup check

Not a duplicate of `FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED`/
`FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` (those are `review[]`/`qa[]`-lane rows, DONE_VERIFIED
already-shipped precedent this brief explicitly reuses, never re-touched here) nor of
`FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION`/`FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION`
(rotation FAIRNESS among the 6 existing candidates, never throughput/reachability — ILC
deliberately sits OUTSIDE rotation, not as a 7th candidate, precisely to avoid inheriting
its 1-in-N throttle) nor of
`FIX-DEVTEAM-READYLANE-DISPATCH-GUARD-NO-REGRESSION-TEST` (named in this row's own
`dedup_checked` field as test-coverage-only, still true — this brief's §5 SCRIPTS row
extends the SAME shared satisfiability instrument that regression-coverage row targets, not
a competing one). Grepped `docs/architecture-briefs/` for
`INCIDENT|EXPEDITE|po_expedited|ready.*throughput` — no other brief covers a `ready[]`-lane
dedicated-budget mechanism.

## RETURN
DONE: Technical design complete — dedicated-budget/head-decoupled Incident-Lane Consumer
adjudicated over comparator-only candidates (a)/(b), backed by 3 independent live
measurements (PO's 2 + this session's 1) showing perfect ordering alone does not unblock
either measured starvation case; QA-Drain's own measured 226→56 PRIMARY drain reused as the
proof-of-mechanism precedent. `docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md`
ZONE: cross-service/ (developer: `scripts/`; agent-father: `docs/agents/dev-team/flow/main.md`)
NEXT: pm | mint `FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS` (developer) and
`FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW` (agent-father, `depends_on` the first) per §5
HANDOFF: this row's own `architect_review_note` field (direct PO mint, no `docs/handoffs/`
file — per this flow's own Step 5 convention)
PIPELINE: continue
