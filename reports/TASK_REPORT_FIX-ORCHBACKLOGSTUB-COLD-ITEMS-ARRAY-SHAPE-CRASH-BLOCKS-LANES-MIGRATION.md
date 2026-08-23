## Task Report FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION
changed: scripts/orch-backlog-stub.sh, scripts/orch-backlog-stub.test.sh, docs/policies/dev-standards.md, docs/WORK.md
commits: b1aa63b7a (fix), 6f55a013e (docs)
tests: orch-backlog-stub.test.sh 35/35 pass | shellcheck: clean | mock-guard: PASS (no apps/ src touched) | bun test/tsc: N/A (pure bash/jq)
verdict: APPROVED (direct-commit verify) — DONE_VERIFIED

### Verification method
Direct-Commit Verify (dev-team Review-Lane QA-Drain, branch:null). Both commits confirmed on `main` ancestry via `git merge-base --is-ancestor`; `git show --stat` confirms all 4 claimed files touched. Independently re-ran `bash scripts/orch-backlog-stub.test.sh` (35/35, including T8 array-shaped-cold-input regression and T9 po_goahead survival). Went beyond replaying the row's own AC-4 claim: re-ran the scratch rehearsal myself against TODAY's live `docs/data/orch/orch-state.json` + `docs/data/orch/archive/backlog-detail.json` (`LANES=backlog,ready,review`, byte-identical scratch copy) — exit 0, "Reconciliation PASS" (606 hot stub ids / 910 cold detail items, 0 missing) — confirms the fix still holds against the live ARRAY-shaped cold file as it stands today (761-task board), not just the 2026-08-15 snapshot the developer tested against. Live files confirmed byte-untouched after (`git status --porcelain` empty). Spot-checked the F-5 source fix directly: `^po_goahead` prefix preserved through the `STUB_FIELDS` strip in `build_hot_temp()`. Confirmed `docs/policies/dev-standards.md` and `docs/WORK.md` actually document the F-4/F-5 fix + array-shape decision as claimed. Not OOM-class (bash/jq array-shape crash fix, no memory/durability assertion) — OOM-Class Durability Gate not applicable.

### Board actuation
`.task_board.qa[]` → `.task_board.done_verified[]` in one `orch-apply.sh` write (status `QA`→`DONE_VERIFIED`, `status_note` = QA Review Record, `verification.raw_probe` attached same write per schema gate). Measured: `qa[]` 10→9, `done_verified[]` 30→31. Row confirmed absent from `qa[]`, present in `done_verified[]` post-write.

Decision journal: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-25.md` STEP qa-S45.
