# DJ — Quality-Mismatch Fix-Tasks (Phase 3) — 2026-06-10

System Quality Audit Phase-3. Merge-writer emitted 44 `quality-mismatch` signal rows
(to:"po") after Phase-2 merge (origin/main @ 67312e4c). PO turns each open row into a
tracked `{check_id}-FIX` task in `.task_board.backlog[]`.

## STEP — triage + append (po-quality-fixtasks)

- rows read (open quality-mismatch, to:"po"): **44** (7 critical / 37 high)
- existing `*-FIX` tasks in backlog+in_progress before run: **0**
- duplicates skipped: **0**
- tasks appended to backlog: **44** (priority: 7 high <- critical, 37 normal <- high; size S, type fix)
- signal rows flipped open->acked (kept, not deleted): **44**
- backlog length 83 -> 127; `*-FIX` tasks now: 44

what-considered: only path — atomic jq pass (slurp checklist for question text, dedup by
existing `-FIX` ids, append tasks + flip rows in same pass), temp->rename. Title = imperative
from quality-checklist.json `.question`; status_note carries
`AC: re-check PASS | signal:<id> | <evidence_gist>`.
why-change: no change from plan.

invariants held: single orch-writer (commit-mutex held by po-quality-fixtasks), atomic
temp->rename on the orch-state write, no shell-interpolation of evidence_gist (jq --arg / file).
Committed paths (explicit pathspec from repo ROOT): orch-state.json + this journal — same commit.
NOT pushed (router pushes after raw-verify).

_now (UTC): 2026-06-10T09:27:20Z_
