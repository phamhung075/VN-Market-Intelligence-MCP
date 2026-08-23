---
task_id: TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES
parent: FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS
owner: developer
size: S
zone: cross-service/
branch: none — NO BRANCHES, all work on `main`
depends_on: []
blocks: [TASK-PROSECEILING-VALUE-SHAPE-MEASURE]
---

# TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES — fix D3: a zero-change lane move out of an unguarded lane hard-rejects

## §1-tldr

`scripts/orch-row-prose-ceiling-check.mjs` looks up a row's **live baseline** in only three lanes.
A row arriving in a guarded lane from anywhere else gets `liveBytes = 0` and is treated as a
brand-new >12 KB mint — so a **byte-identical lane move hard-rejects the entire write**, with an
abort message that falsely claims net new growth. `in_progress[] → review[]` is the standard
developer-completion transition. This is a live blocker, not a theory.

Ship this **first and alone**. It is ~10 lines, depends on nothing open, and it unblocks work
that is parked right now.

---

## §2-the-defect-measured

**Live reproduction captured by PO this session**, attempting a by-the-book lane move that changed
only `status` and `blocked_by` — **both members of `STRUCTURAL_FIELDS`, both excluded from
`proseBytes()`. The row grew zero bytes:**

```
[orch-row-prose-ceiling-check] ABORTED — 1 row(s) with net new inline growth past ORCH_ROW_PROSE_CEILING_BYTES=12000:
  id=UC-CDC-P1 live=0B -> candidate=13724B
[orch-apply] ABORTED: row prose ceiling check exit 1 — live file untouched
```

**Independently reproduced read-only by architect** on a different row:

```
$ jq '.task_board.review += [.task_board.in_progress[]|select(.id=="UC-CCA-P3")]
      | .task_board.in_progress |= map(select(.id!="UC-CCA-P3"))' orch-state.json > cand
$ bun scripts/orch-row-prose-ceiling-check.mjs orch-state.json cand
  id=UC-CCA-P3 live=0B -> candidate=12161B          exit 1
```

**Mechanism, confirmed in code:**
- `PROSE_CEILING_LANES = ['backlog','ready','review']` — `scripts/orch-row-prose-ceiling-check.mjs:105`
- `collectRowsById()` iterates that constant for **both** the live and the candidate document — `:195-207`
- live lookup misses → `const liveBytes = liveRow !== undefined ? proseBytes(liveRow) : 0;` — `:267`
- `if (candidateBytes > liveBytes)` → hard reject — `:269`

**Blast radius (architect, measured live):** 15 over-ceiling rows currently sit in unguarded lanes —
3 in `in_progress[]`, 1 in `qa[]`, 3 in `active_sprints[]`, 7 in `done_verified[]`, 1 in `done[]`.
Each detonates on its next lifecycle transition. Two rows are parked `BLOCKED`-in-place today with
a "deferred until this ships" note instead of being lane-moved.

**Why the existing test suite cannot catch it:** `scripts/test/orch-row-prose-ceiling-check-tests.sh`'s
`LANE-AGNOSTIC-MOVE` case only exercises `backlog[] → review[]` — both guarded. The gate was
validated on the one case that works.

**`docs/policies/dev-standards.md` over-claims this today:** *"Row identity is id-keyed and
lane-agnostic (a lane move with unchanged prose bytes is never mistaken for a brand-new row with a
0 baseline)"*. True only within the three guarded lanes. After your fix the sentence becomes true —
your job is to make it true and to document the qualification, not to delete it.

---

## §3-design

**Keep the GATED set exactly as it is: `backlog | ready | review`.** The 2026-08-09 brief's §3
non-goal for `in_progress[]` / `qa[]` / `active_sprints[]` stands — stubbing a row mid-work risks
losing an agent's in-flight note. **Do not widen what is enforced. Widen only what is measured as
the baseline.**

Concretely: introduce a second, wider lane list used **only** for the live-side lookup — every
array-valued lane under `.task_board` — and keep `PROSE_CEILING_LANES` as the candidate-side /
enforcement set. Two guards on the widening:

1. **Duplicate ids across lanes exist today.** Measured live by architect:
   `FIX-ACTIVE-READPATH-LIVENESS-PROBE-NO-DETECTOR`, `FIX-BCTC-BANK-SUMMARY-MAPPING`,
   `FIX-NEWSVPS-OVERNIGHT-PUSH-OUTAGE-663M-SILENT`. The current
   "last-write-in-iteration-order wins" would, once widened, be able to pick the **smaller** copy
   as the baseline and **manufacture a false reject**. Use **`max(proseBytes)` across all live
   occurrences of the id** — conservative in the safe direction, cannot false-reject, one line.
   The existing `collectRowsById()` doc-comment at `:186-192` explicitly says duplicates are "not
   specially guarded against here"; that comment must change with the behaviour.
2. **A genuinely new id must still hard-reject.** Absent from every lane → baseline 0 → reject.
   Do not weaken this; AC-3 is its regression test.

Also update the abort message and the file header comment: today they say the row grew, which is
exactly the falsehood that cost PO a triage tick.

**Explicitly NOT in this task:** the value-shape measure (`TASK-PROSECEILING-VALUE-SHAPE-MEASURE`),
`--list-over-ceiling`, `scripts/orch-backlog-stub.sh`, any hot-file paydown.

**Explicitly NOT the fix:** raising `ORCH_ROW_PROSE_CEILING_BYTES`, adding a bypass env var,
splitting the write, or special-casing integer increments. All four were considered and rejected
with reasons in the brief; the last one is the important one — see §5.

---

## §4-files

- `scripts/orch-row-prose-ceiling-check.mjs` — widened live-side lookup + `max()` dedup + header
  comment + abort message wording.
- `scripts/test/orch-row-prose-ceiling-check-tests.sh` — new cases per §6. 341 L today; extend the
  COVERS header block at the top the same way existing cases did.
- `docs/policies/dev-standards.md` — qualify/correct the "lane-agnostic" sentence to state that the
  live baseline is now looked up across **all** `task_board` lanes while enforcement stays on the
  three guarded lanes, and note the `max()` rule for duplicate ids.

---

## §5-correction-to-carry-do-not-design-against-the-wrong-premise

The parent row's title and an earlier dispatch note both say *"a numeric occurrence bump isn't
recognised as non-growth."* **That framing is wrong and architect measured it.**
`occurrence_count: 1 → 2` **already passes today** — same digit count, zero byte delta. The
predicate is byte-exact. What actually rejects is:

(a) *adding* the field where it is absent (+21 B, PO's 2026-08-15 trace)
(b) a digit-boundary crossing `9 → 10` (+1 B)
(c) any timestamp/status value of a different length
(d) a multi-field coordination stamp (PO's 4-field `po_manual_dispatch_*`, +306 B)
(e) **the zero-live-bytes cross-lane case in §2 — which is this task**

A fix scoped to `typeof === 'number' && delta > 0` would fix **none** of the live blocks. If you
find yourself writing one, you are solving the row's title instead of the row's defect.

---

## §6-acceptance-criteria

- [ ] **AC-1 (brief AC-4).** `UC-CCA-P3` moved `in_progress[] → review[]` with a byte-identical row
      → **exit 0**. (Today: exit 1, `live=0B → candidate=12161B`.) Reproduce architect's exact jq
      from §2 against the live file, read-only, before and after.
- [ ] **AC-2.** The same move for a row that is **under** ceiling → exit 0, no WARN, no change.
- [ ] **AC-3 (brief AC-5).** A brand-new id minted into `backlog[]` with a 20 KB `desc` → **exit 1**
      (`l=0 c=20011`). The new-row case must not be weakened by the widening.
- [ ] **AC-4 (brief AC-6).** Duplicate-id fixture: same id present in a guarded lane **and** an
      unguarded lane, both copies unchanged, one larger than the other → **exit 0**. Then flip
      which copy is larger and confirm it still exits 0. This is the `max()` rule; a `last-wins`
      implementation fails the second half.
- [ ] **AC-5.** Real lane move out of `qa[]`, `done[]` and `active_sprints[]` (fixtures) each exit 0
      when byte-identical — the widening covers every array lane, not just `in_progress[]`.
- [ ] **AC-6 (brief AC-8).** `bash scripts/test/orch-row-prose-ceiling-check-tests.sh` — **all
      green, no pre-existing case removed or weakened**, including `LANE-AGNOSTIC-MOVE`,
      `NEWROW-VIOLATION` and `SECONDARY-DRAIN-STAMP`.
- [ ] **AC-7.** `bash scripts/test/orch-apply-wrapper-tests.sh` green — Stage 2.5 wiring, exit codes
      and CLI contract are unchanged by this task.
- [ ] **AC-8.** Abort message no longer asserts growth in the cross-lane case, and the file header +
      `collectRowsById()` doc-comment describe the two-list (gated vs. baseline) split accurately.

**All fixtures use throwaway `mktemp` files. Never run the checker's tests against the live
`docs/data/orch/orch-state.json` in write mode, and never write to it from this task.** The checker
is read-only by contract; keep it that way.

---

## §7-context

- Architect brief: `docs/architecture-briefs/2026-08-23-orch-row-prose-ceiling-value-shape-measure-and-frozen-cohort-paydown.md`
  — §0 (premise, all figures measured live), §1 D3 (this defect), §2.1 (rejected alternatives),
  §3.2 (this design), §6 (risk register), §7 (ACs), §8 (sequencing).
- Predecessor brief (the guard this row is about):
  `docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md`.
- Concurrency: three writers touch `orch-state.json` in this window. This task makes **no**
  orch-state write at all — it is a pure predicate change in a read-only check, and
  `orch-apply.sh`'s CAS-mtime guard is untouched. That is what makes it safe to land now.

## §8-closure

- [ ] All ACs verified with raw command output in the Implementation Record
- [ ] One commit, explicit pathspec (`git add -A` / `git add .` forbidden)
- [ ] Append `## §N-impl` to this file
- [ ] `NEXT: qa`, then `TASK-PROSECEILING-VALUE-SHAPE-MEASURE` unblocks
