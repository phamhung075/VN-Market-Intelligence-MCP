# Developer — Notebook

**Last updated:** 2026-07-09 | **Cycle:** FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE

## Session 2026-07-09 — FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT (qa CHANGES_REQUESTED bounce, one-line-class doc fix)

**Task:** qa PASSED the script (`scripts/ops-closegate-handoff.jq`, 4/4 DoD + 3 scratch scenarios + `orch-validate` clean) but CHANGES_REQUESTED the doc: runbook `docs/protocols/docker-deployment-runbook.md:124` embedded the Step-4b invocation in a GFM table cell with the shell pipe escaped `\|` — valid table markup, but as RAW TEXT (what `Read`/any text-consuming agent sees) that backslash-pipe is not a real shell pipe; copy-pasted, `jq` gets `|` and `bash` as extra file args, exit 2.

**Fix:** moved the invocation out of the table cell into a fenced ```bash block directly below the table (real unescaped `|`); cell prose now just points at the block. Verified GFM table-cell pipe-escaping is a real spec requirement (not renderer-tolerant) before picking this over de-escaping in place — confirmed via all 9 raw table lines needing exactly 4 pipe-delimited columns each.

**Self-caught bug:** first draft referenced the pipe character in the cell's own prose as an inline code span, which reintroduced an unescaped pipe in that same cell (5 pipes instead of 4) — caught by a raw pipe-count check across all table lines before calling it done.

**Board:** status stays REVIEW, `next_agent` developer→qa, `qa_verdict` CHANGES_REQUESTED→null (repo precedent: commit `975465911`), `.head.next_agent` synced to qa in the same atomic `orch-apply.sh` write.

## Session 2026-07-09 — FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX (router-dispatched, RAW-verified crash)

**Task:** `devteam-backlog-promote-bounded1.jq` L150 bound `$detail_items` as `($detail[0].items // {})`, assuming an object shape, but live `docs/data/orch/archive/backlog-detail.json` `.items` is a plain ARRAY of 437 id-bearing objects. `effective_depends_on`'s `$detail_items[.id]` object-index then crashed (`Cannot index array with string`) on the first `detail_ref`'d row scanned — silently promoting NOTHING via BOUNDED-1 on every dev-team tick since 2026-07-08 (`orch-apply.sh` correctly aborted the empty candidate, zero corruption). **Zone:** `cross-service/` → developer direct, no dispatch.

**Fix:** id-key the array at ingest (`map(select(.id!=null)|{key:.id,value:.})|from_entries`); object input still passes through unchanged. No `depends_on` semantic change, zero hardcoded task-id literals added.

**Test:** existing `test-devteam-bounded1-depends-on.sh` fixtures were ALL object-shaped `.items` — that's WHY 17/17 passed while prod crashed. Added RED Case 1c (array-shaped `.items`, live-data shape) — reproduced the crash pre-fix, 18/18 GREEN post-fix.

**Live-verified beyond fixtures:** ran the exact reproducer from the bug report (`TASK17-FOREIGN-FLOW` against the real live `backlog-detail.json`) — exit 5 crash pre-fix, exit 0 post-fix. End-to-end scratch-copy run through `orch-apply.sh` (`ORCH_APPLY_LIVE_FILE_OVERRIDE`, WIP forced to 0 on a copy — never the live file, since live WIP was 2): exactly one row promoted, no "empty candidate" abort.

**Scope discipline:** inspected companion `devteam-backlog-claim-bounded1.jq` — never touches `backlog-detail.json` (only claims whatever `ready[]` row promote already stamped), no equivalent bug, left unchanged. Diff confined to the one shape-defensive binding + the new test case (2 files). Board flipped IN_PROGRESS→REVIEW, `next_agent`→qa via `orch-apply.sh`.

## Session 2026-07-09 — FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE (4th BOUNDED-1 eligibility-gate defect in ~5 days)

**Task:** `devteam-backlog-promote-bounded1.jq`'s eligibility filter read `supervised` ONLY off the thin `task_board.backlog[]` row, but `supervised:true` is authoritative in `docs/data/orch/archive/backlog-detail.json` `.items[<id>].supervised` for `detail_ref`'d rows — every detail_ref'd supervised row silently evaluated false. Caused a LIVE near-miss (2026-07-09T15:48Z): auto-promoted+claimed `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` (P0, explicitly "NOT a BOUNDED-1 auto-pickup target", supervised since 07-04) into `in_progress`. Router reverted the claim + hand-stamped `supervised:true` onto all 8 Phase-1 rows — a data-hygiene patch, not the fix. **Zone:** `cross-service/` → developer direct, no dispatch.

**Fix:** added `def effective_supervised($detail_items): (.supervised==true) or ($detail_items[.id].supervised//false)==true` mirroring the shipped `effective_depends_on` precedence pattern (from `FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE`); swapped the candidate-selection filter to call it. Deliberately no `.detail_ref != null` precondition (unlike depends_on) — PO's mint spec had none, and id-keyed `$detail_items` makes the lookup a safe no-op for rows lacking a matching id. Absent/null in both locations = promotable (baseline preserved). No new call-site change — `--slurpfile detail` already threaded for the depends_on gate.

**Test:** new `test-devteam-bounded1-supervised-flag.sh` — 15/15 GREEN, covering detail-only (exact 07-09 repro), board-only (router-stamp shape), neither, both, absent-key, and ARRAY-shaped `backlog-detail.json .items`.

**Live-verified beyond fixtures:** scratch-only (live `orch-state.json`/`backlog-detail.json` never touched) — re-ran the OLD script (via `git show HEAD:...`) against a WIP-0 fixture with `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD`'s inline `supervised` stripped (its real pre-router-patch shape) + real `backlog-detail.json`: OLD promoted it (bug reproduced), NEW skipped it. End-to-end `orch-apply.sh` run (`ORCH_APPLY_LIVE_FILE_OVERRIDE`, coherent WIP-0 fixture): exactly one row promoted; re-run on the resulting WIP-1 state = no-op, no abort (124 pre-existing SHG warnings, non-blocking).

**Self-caught regression:** sibling `test-devteam-bounded1-depends-on.sh`'s static grep-count assertion broke (my first comment draft pushed `--slurpfile detail` occurrences 2→3) — reworded to drop the literal substring; both suites GREEN (18/18 + 15/15). Updated `docs/agents/dev-team/flow/main.md` + `docs/policies/dev-standards.md` prose pointers. graphify skipped — no LLM API key in this sandbox. Board flipped IN_PROGRESS→REVIEW, `next_agent`→qa via `orch-apply.sh`.
