## Task Report FIX-CHEF-MARKER-KEY-ANCHOR-1
changed: scripts/agents-flow/cowork-match-slots.js (+75/-?), scripts/agents-flow/cowork-match-slots.test.js (+133), docs/WORK.md (+3)
commit: e315472b7 (real, ancestor-of-main — row's own `.commit=777ec912f` was the PRE-AMEND hash, corrected in this write; see Issues below)
tests: own suite 90/90 pass | siblings: cowork-catchup-predicate 34/34, cowork-guaranteed-slot-firer 53/53, cowork-tick-preflight 75/75 | tsc: N/A (plain JS/shell zone) | ddd: PASS (0 infra/application import hits) | security: PASS (0 process.env/secret hits) | mock-guard: PASS exit0
verdict: APPROVED (vc-approved, Direct-Commit Verify)

### Notes
- Row's recorded `commit` field (`777ec912f`) FAILED the literal `git merge-base --is-ancestor` check — traced via reflog to a `git commit --amend` 26s later (`e315472b7`), content-identical (empty diff on both touched files), timestamp-cross-checked to the row's own `reviewed_at` within 1s. Not a fabrication; corrected `.commit → e315472b7` in the same `vc-approved` write rather than bouncing a working change.
- Scope claim independently verified on the live board: `FIX-CHEF-MARKER-KEY-ANCHOR-2/3/4` all sit `status=TODO`, `next_agent=agent-father` (their consumer files live under `docs/agents/`, agent-father's exclusive `commit_zone` — correctly not implemented here).
- BCTC Eval Gate: N/A (no `report_id` in scope). OOM-Class Durability Gate: N/A (not a crash/memory-durability row).
- `docs/data/orch/orch-state.json`: `.task_board.qa[]→.task_board.done_verified[]`, status `QA→DONE_VERIFIED`, applied via `orch-apply.sh` (dry-run rehearsed against a fixture first, then live; self-verified persisted). No git commit made this cycle on the hot file/journal/notebook/this report — `commit-mutex:main` unclaimable (no MCP gateway binding in this specialist sub-session, INV-GATEWAY-1); per dispatch fallback this is reported as skipped, not silently dropped.
