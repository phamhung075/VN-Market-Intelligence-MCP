# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · agent-father

**Sprint goal:** (no description recorded in orch-state for this sprint_id; this entry is ambient
cross-cutting agent-lifecycle work dispatched under the currently-active sprint_id per journal
naming convention, unrelated to the sprint's own scope.)
**Agent:** agent-father
**Started:** 2026-07-28T19:13:14Z

---

### STEP agent-father-S1 · agent-father · 2026-07-28T19:13:14Z
**task-id:** UNBLOCK-AGENT-MODELS-SWITCH-COMMIT-DISPOSITION
**what-done:** Reverted the uncommitted `.claude/switch-agent-models.sh performance` run (21 dirty
files) to HEAD state instead of committing it; git diff on all 21 originally-flagged paths is now
empty.
**what-considered:**
- Commit as-is (performance = intended standing fleet state) — rejected: no sprint/task/journal
  anywhere declares intent to switch fleet to performance; README labels `normal` as
  production/default and `performance` as critical-task-specific/temporary.
- Discard/revert to normal — chosen: last-committed `current_mode` was `normal`; dirty-file mtime
  (18:25:02 CEST) landed ~82min after switch-script fix commit 289a9d8e2 (17:03:21 CEST), whose own
  message claims testing happened only in an isolated sandbox copy never touching real files —
  pattern matches a live post-fix verification run on the real repo that was never reverted, not a
  deliberate mode switch.
**why-decision:** Absence of any declared rationale + timing correlation with the same-day script
fix commit outweighs the "same-day run = intentional" default heuristic; treated as a stale
verification artifact.
**why-change:** Acceptance criteria assumed `switch-agent-models.sh normal` alone would empty the
diff; it did not — 3 agents (ops/po/semble-search) have `modes.normal.agents` preset values that
drift from live committed frontmatter (a98c47ce1 itself flagged ops/po as known-out-of-scope drift;
semble-search is newly found). Supplemented with `git checkout -- <exact 3 paths>` to reach true
HEAD state, then filed `FIX-AGENT-MODELS-NORMAL-PRESET-DRIFT` (P3/XS/backlog) so the underlying
preset-table bug doesn't silently recur next time anyone runs the script in good faith. Board row
flipped `ready[]`→`done[]` (status DONE) + new FIX row minted into `backlog[]`, same
`orch-apply.sh` write (CANONICAL:SSOT-STATUSFLIP-LANEMOVE).
