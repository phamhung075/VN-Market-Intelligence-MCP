---
task_id: TASK-PROSECEILING-VALUE-SHAPE-MEASURE
parent: FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS
owner: developer
size: M
zone: cross-service/
branch: none — NO BRANCHES, all work on `main`
depends_on: [TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES]
blocks: []
---

# TASK-PROSECEILING-VALUE-SHAPE-MEASURE — measure the ceiling over value-shape, not over a hand-maintained name list

## §1-tldr

`STRUCTURAL_FIELDS` is a **closed name-allowlist over an open name-namespace**. `TaskSchema` is
`.passthrough()`; measured live there are **846 distinct field names** on `task_board` rows, **33**
in the set, **813** counted as prose. Every new machine-written coordination field defaults to the
prose side, so an over-ceiling row becomes permanently unwritable the moment any flow doc invents a
field name.

Replace the *measure*, not the predicate: **a field is PROSE iff its value is a string longer than
`ORCH_PROSE_MIN_STRING_BYTES` (default 200) or a non-empty object/array. Everything else — numbers,
booleans, `null`, ISO timestamps, short scalar strings — is BOUNDED and is not prose.** Exclusion
set = `STRUCTURAL_FIELDS` **∪** bounded-by-value. Union, never substitution.

---

## §2-why-a-fourth-name-list-patch-is-not-the-fix

This is the **third instance of the identical defect in 8 days**, each with the identical proposed
fix shape (add names to the set):

| # | date | family | state |
|---|---|---|---|
| 1 | 2026-08-15 | `secondary_claimed_at/_by`, `secondary_dispatch_target`, `dispatch_target` | **SHIPPED** |
| 2 | 2026-08-15 | `occurrence_count` | minted, unshipped — this row |
| 3 | 2026-08-15 | `po_manual_dispatch_*` ×4 | minted, still `backlog[]` 8 days later |

Instance #1's own AC-5 already ordered the enumeration: *"audit the remaining in-place sweep stamp
families for the same gap in one pass rather than waiting for a third same-day recurrence — this is
now the SECOND instance, which makes the enumeration itself the durable fix."* It was never done.
**A fourth name-list patch is turn #4 of a 3-turn loop.** Same class as
`project_signalrow_type_open_namespace_vs_closed_allowlist_20260813` (four patch-only passes, each
decayed within days), resolved yesterday by *deriving* the allowlist instead of hand-maintaining it.

Measured proof a name-list can never converge: 18 field names on the board whose values are *only
ever* number/boolean/ISO/null (`occurrence_count`×27, `timebox`×15, `ba_spec_complete`×15,
`task_count`×13, `recurring_bug_count`×8, `architect_design_complete`×8, `redispatch_count`×7,
`rebuild_required`×4, `epic_hold`×2, `branch`×2, `po_approved`, `deploy_gated`, `optional`,
`stretch`, `pm_decomposition_complete`, `architect_complete`, `qa_durability_window_ends_at`,
`qa_durability_certified`) are **all** counted as prose today. Add the short coordination strings
(`source`×79, `origin_signal_id`×59, `verification_gate`×54, `dedup_key`×37, `verdict`×21, …) and
the missing-names list is in the hundreds and grows weekly.

---

## §3-design

### §3.1-extract-the-shared-measure-module

**New file `scripts/lib/orch-row-prose-measure.mjs`**, exporting `STRUCTURAL_FIELDS`,
`isProseField(value)`, `proseBytes(row)`, `scalarBytes(row)`. The gate, the future compactor's
selector, and the tests all consume **one** definition — both scripts already carry a "never
duplicate this logic" header constraint, so a second copy is not acceptable.

```js
// scripts/lib/orch-row-prose-measure.mjs
const PROSE_MIN_STRING_BYTES = Number(process.env.ORCH_PROSE_MIN_STRING_BYTES ?? '200');

export function isProseField(v) {
  if (typeof v === 'string')  return Buffer.byteLength(v, 'utf-8') > PROSE_MIN_STRING_BYTES;
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return false;
  if (Array.isArray(v))       return v.length > 0;
  if (typeof v === 'object')  return Object.keys(v).length > 0;
  return false;                       // undefined / function — unreachable via JSON
}
// proseBytes(row):  JSON byte length of { k:v | !STRUCTURAL_FIELDS.has(k) &&  isProseField(v) }
// scalarBytes(row): JSON byte length of { k:v | !STRUCTURAL_FIELDS.has(k) && !isProseField(v) }
```

`scripts/orch-row-prose-ceiling-check.mjs` imports it and deletes its local copies. **Nothing else
changes in the checker's CLI contract, exit codes, or `orch-apply.sh` Stage 2.5 wiring.**

**`STRUCTURAL_FIELDS` is KEPT, not replaced** — it excludes long *structural* strings the shape rule
would otherwise call prose (`title` runs to 290 B+, `verify_note`, `supervised_reason`). Union.

**Safety property that makes this landable against a live fleet: the change is MONOTONE.** The
exclusion set only ever grows (name-set ∪ shape-set ⊇ name-set), so `prose_new(row) ≤ prose_old(row)`
for every row. **No write that passes today can start failing.** Preserve this property; if a design
choice would break it, it is the wrong choice.

**Threshold justification (measured, not chosen):** over-ceiling row count is *flat* at 22 for
`ORCH_PROSE_MIN_STRING_BYTES` ∈ {80, 120, 200}, and only starts eroding at 400 (→20). 200 sits in
the middle of the flat region with 2× margin either side. Keep it env-tunable; do not assert it is
permanently correct.

**The guard is not disarmed — measured:** of the 23 currently-frozen rows, **22 stay over ceiling**
under the new measure. The single dropout, `DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING`, was
205 B over (12205 → 11759 B) — genuinely marginal, not a loophole. Short strings hold **43,875 B**
board-wide versus **1,616,447 B** in strings >200 B: **2.6 %** of prose mass. Short strings are
demonstrably not the bloat channel; the bloat is multi-KB `status_note` / `desc` / `po_*_ruling_*`
blocks, all of which stay classified as prose.

### §3.2-defence-in-depth-scalar-delta-cap

"Prose re-accretes under freshly-invented field names" is a documented pattern, so do not leave the
door fully open. **On an over-ceiling row only**, reject if

```
scalarBytes(cand) - scalarBytes(live) > ORCH_ROW_OVERCEILING_SCALAR_DELTA_BYTES   // default 1024
```

PO's 4-field stamp is 306 B (3.3× headroom); board-wide **max cumulative** scalar on any single row
is 1114 B, so a single write adding >1 KB of scalars to an already-over-ceiling row is anomalous by
construction. **The abort message for this cap must say: tripping it is a signal to investigate the
producer, NOT a reason to raise the number.** Write that sentence into the message.

This is the only new knob. A separate field-*count* cap was considered and dropped as redundant
(8 new fields × 200 B already exceeds the byte cap).

### §3.3-what-this-task-does-NOT-do

- **`docs/agents/po/flow/manual-dispatch-sweep.md` needs NO edit.** The sibling row
  `FIX-PROSECEILING-PO-MANUAL-DISPATCH-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET` lists it
  in `files[]`; under this design PO's Step 2 stamp simply lands unmodified. Do not carry the
  sibling's file list verbatim — that is one fewer agent-doc edit and one fewer agent-father hop.
- **No `orchStateSchema.ts` change.** `.passthrough()` stays. Promoting `TaskSchema` to `.strict()`
  is separately owned (`SSOT-W1-SERVER-ENFORCE`) and gated on zero live unknown-key warnings, which
  is not true today with 846 names. This design is a *precondition* for that promotion, not a
  substitute.
- **No `--list-over-ceiling`, no `scripts/orch-backlog-stub.sh` change, no paydown.** Those are the
  brief's §4 and are deliberately deferred to
  `FOLLOWUP-PROSECEILING-TARGETED-COMPACTION-AND-FROZEN-COHORT-PAYDOWN`. **Do not pull them in.**
  §4's paydown is hard-gated behind `FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION`
  (`review[]`, P0, unverified) — running the compactor before that is verified is a reproduced
  data-destructive path.
- **Do not raise the ceiling, do not add a bypass env var, do not remove `STRUCTURAL_FIELDS`, do not
  special-case integer increments.** All rejected with measured reasons (brief §2.1). On the last
  one: same-length increments **already pass**; see `TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES` §5.

---

## §4-files

- `scripts/lib/orch-row-prose-measure.mjs` — **new**, shared measure module.
- `scripts/orch-row-prose-ceiling-check.mjs` — import the module, delete the local
  `STRUCTURAL_FIELDS`/`proseBytes` copies, add the over-ceiling scalar-delta cap, update the file
  header comment and the abort/remediation message.
- `scripts/test/orch-row-prose-ceiling-check-tests.sh` — new cases per §5.
- `scripts/orch-apply.sh` — **Stage 2.5 header comment only.** Behaviour and exit codes unchanged.
- `docs/policies/dev-standards.md` — document the value-shape measure and both new env vars
  (`ORCH_PROSE_MIN_STRING_BYTES`, `ORCH_ROW_OVERCEILING_SCALAR_DELTA_BYTES`). The "lane-agnostic"
  sentence is `TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES`'s edit — do not re-litigate it, just do
  not contradict it.

---

## §5-acceptance-criteria

Architect replayed AC-1..AC-5 on a live-data prototype this pass; all passed. They are ACs for you
to re-establish in the suite, not claims of shipped code.

- [ ] **AC-1 (brief AC-1) — PO's real block lands.** `manual-dispatch-sweep.md` Step 2's verbatim
      4-field jq stamp applied to `FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE`
      (26552 B) → **exit 0**, WARN only. (Prototype: exit 0, 22 WARN.)
- [ ] **AC-2 (brief AC-2) — LOAD-BEARING NEGATIVE CONTROL.** +1 byte appended to a **>200 B prose
      field** on the same frozen row → **exit 1**, `PROSE-GROWTH live=26219 → cand=26220`. This is
      the proof the fix narrows the gap without disarming the ceiling. **If this test is missing or
      passing-when-it-should-fail, the task is not done.**
- [ ] **AC-3 (brief AC-3).** `occurrence_count` **added** where absent, and **incremented across a
      digit boundary** (`9 → 10`), on a frozen row → **exit 0** in both cases.
- [ ] **AC-4 — scalar-delta cap fires.** On an over-ceiling row, a synthetic write adding >1024 B of
      *bounded* scalars → **exit 1**, with a message that names the producer-investigation guidance
      and does **not** suggest raising the knob. Adding 306 B of scalars (PO's real stamp) → exit 0.
- [ ] **AC-5 — monotonicity.** For a representative sample of live rows, `proseBytes_new(row) ≤
      proseBytes_old(row)` holds for every row. Assert it in the suite, read-only, against a copied
      fixture — this is the property that guarantees no currently-passing write starts failing.
- [ ] **AC-6 — single definition.** `grep` shows exactly one definition of `STRUCTURAL_FIELDS` and
      one of `proseBytes` in the repo (in the new module); the checker imports rather than
      redeclares.
- [ ] **AC-7 (brief AC-8).** `bash scripts/test/orch-row-prose-ceiling-check-tests.sh` — all green,
      **no case removed or weakened**, including everything `TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES`
      added.
- [ ] **AC-8.** `bash scripts/test/orch-apply-wrapper-tests.sh` green — Stage 2.5 exit codes and
      wiring unchanged.
- [ ] **AC-9 — report, do not act.** In your RETURN, tell PO that under this design both name-list
      sibling rows are **superseded by construction**:
      `FIX-PROSECEILING-PO-MANUAL-DISPATCH-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET`
      (`backlog[]`) and this parent row's own `occurrence_count` clause — the rule now derives them
      with no name added. **Do not close either row yourself**; closing is PO's call, and PO must
      record *why* so the closure is not later mistaken for a silent drop (brief §8 step 5).

---

## §6-context

- Architect brief: `docs/architecture-briefs/2026-08-23-orch-row-prose-ceiling-value-shape-measure-and-frozen-cohort-paydown.md`
  — §1 D1/D2 (this defect), §2 (decision + rejected alternatives), §3.1 (this design), §6 (risks),
  §7 (ACs), §8 (sequencing).
- Predecessor brief: `docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md`
  — chose a 3-part plan in dependency order and **only part 3 (the gate) shipped**. The guard has
  run 14 days in exactly the brick-mode its own author ruled out. Do not repeat that: if you cannot
  land all of this task, land nothing and report, rather than landing a half that changes the
  measure without its negative control.
- Concurrency: this task makes **no** orch-state write. The checker is read-only by contract.

## §7-closure

- [ ] All ACs verified with raw command output in the Implementation Record
- [ ] One commit, explicit pathspec
- [ ] Append `## §N-impl` to this file
- [ ] `NEXT: qa`; RETURN carries AC-9's message to PO
