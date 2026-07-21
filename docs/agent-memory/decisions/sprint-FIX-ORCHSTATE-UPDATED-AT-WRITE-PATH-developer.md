# Decision Journal — Sprint FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH · developer

**Sprint goal:** scripts/orch-apply.sh (the single mandatory gated write path for orch-state.json) has zero timestamp handling — stamp task_board row `updated_at` diff-based, at the write path, with no backfill of the ~500 existing null rows.
**Agent:** developer
**Started:** 2026-07-21T17:35:00Z

---

### STEP developer-S1 · developer · 2026-07-21T17:47:34Z
**task-id:** FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH
**what-done:** Added `scripts/orch-stamp-updated-at.mjs` (id-keyed, order-independent deep-equal diff of every task_board row, live vs candidate, `updated_at` itself excluded from the comparison) and wired it into `scripts/orch-apply.sh` as a new Stage 1.5, positioned AFTER Stage 0/1 schema validation and BEFORE Stage 2 conservation check / CAS-mtime rename.
**what-considered:**
- Stage ordering: stamp BEFORE vs AFTER Stage 0/1 validation. AFTER won — Stage 0 is a raw-TEXT duplicate-key scanner that must see the caller's untouched stdin bytes; a JSON.parse+stringify roundtrip before that stage would silently collapse a duplicate key before the scanner ever saw it, defeating the exact protection it exists for (confirmed by re-running QA-2 unchanged — dup-key candidate still hard-rejects).
- Diff unit: id-content only vs id+lane(position). Chose lane-agnostic (see S2) — array-index/lane tracking is fragile against jq's normal idiom of rebuilding whole arrays; id-keyed content diff is the standard robust approach and avoids false "changed" noise from incidental array reshaping.
- `updated_by`: the dispatched task text asks only for `updated_at`; the underlying PO board row's acceptance criteria additionally says "+ updated_by". Deliberately NOT implemented — orch-apply.sh has no reliable caller-identity signal at its chokepoint (callers are anonymous `jq | bash orch-apply.sh` pipes with no actor argument), so any `updated_by` value would be fabricated/guessed, which is exactly the falsification hazard the task explicitly bans for timestamps. Flagged as an intentional scope gap in the final report rather than silently deviating or inventing an attribution.
**why-decision:** Reusing the existing validator/conservation scripts (not duplicating logic) and inserting the stamp between them keeps every existing exit-code class and caller contract byte-identical — proven by the full pre-existing 31/31 test suite passing unchanged, plus 11 new STAMP-* cases (42/42 total).
**why-change:** no change from plan.

---

### STEP developer-S2 · developer · 2026-07-21T17:47:34Z
**task-id:** FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH
**what-done:** Chose the diff predicate to be LANE-AGNOSTIC: a row that only moves lane (e.g. backlog[]->ready[]) with byte-identical field content is NOT treated as "changed" and is not re-stamped.
**what-considered:**
- Lane-inclusive diff (position/array membership counts as content) — rejected: would require tracking which lane array each id currently lives in across an arbitrary jq-rebuilt document, and orch-validate.mjs Stage 1b (`checkLaneCoherence`) already hard-fails any candidate where a row's `.status` doesn't match its lane — so in the overwhelming majority of real lane moves `status` itself changes, which IS content, and IS caught by the plain id-content diff with zero extra bookkeeping.
- Accepted residual gap: a status value legal in more than one lane (e.g. `BLOCKED`, valid in both `backlog` and `review`) moved between those two lanes with nothing else touched would not be stamped. Judged acceptable — a pure bookkeeping relocation with zero field change is not, in substance, a change to the task's own content.
**why-decision:** Simplicity + robustness against jq's normal whole-array-rebuild idiom outweighs closing a narrow, low-frequency edge case that the existing coherence gate already covers in the general case.
**why-change:** no change from plan.

---

### STEP developer-S3 · developer · 2026-07-21T17:47:34Z
**task-id:** FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH
**what-done:** Live-verified against the REAL docs/data/orch/orch-state.json (not just fixtures): captured a full {id: updated_at} snapshot of all 577 rows, mutated exactly one archived row (`BPE-ARCH-1`) via a jq filter that mentions no timestamp field anywhere, applied through the real `scripts/orch-apply.sh`, and structurally diffed before/after. Also proved idempotency by re-applying an unchanged candidate and confirming 0 rows stamped, then reverted the probe field (second real write, also timestamp-free filter) restoring all original field content.
**what-considered:**
- Reverting via `git checkout` — rejected: would discard any concurrent live writer's in-flight uncommitted changes elsewhere in the shared hot file (explicit live-danger constraint); used a second gated write through the same safe path instead, which is CAS-protected against concurrent writers like every other legitimate caller.
- Leaving the touched row's `updated_at` reset back to null after the revert — rejected: the mechanism only ever adds a stamp on a real content change, never removes one; forcing it back to null would itself be a fabricated (false) timestamp erasure, the same hazard class the task explicitly bans in the other direction. The row now correctly carries a real, honest timestamp of its last real touch.
**why-decision:** Structural diff (not just aggregate counts) is the only way to actually demonstrate "no row you did not touch changed" rather than assert it.
**why-change:** no change from plan. Full suite 42/42 GREEN; live before/after null counts 524→523 (exactly -1).
