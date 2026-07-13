# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · agent-father

**Sprint goal:** Drain confirmed proposals from docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
**Agent:** agent-father
**Started:** 2026-07-13T20:15:21Z

---

### STEP agent-father-S1 · agent-father · 2026-07-13T20:15:21Z
**task-id:** UC-RDL-P1
**what-done:** Doc-only correction of the sprint-task chain-mutex `task_id` VALUE prefix in two SKILL.md
files, per architect adjudication `docs/architecture-briefs/2026-07-13-uc-rdl-p1-lock-namespace-adjudication.md`.
`.claude/skills/dispatch-claim/SKILL.md`: Canonical Namespace table row (L39) `sprint-task:<task-id>` →
`task:<task-id>`; §Sprint-Task Outer Wrap (L267-284) intro prose + `task_id` code value + closing rule
all realigned to `task:<task_id>`, explicitly distinguishing id-prefix from `task_kind` (which stays
`sprint-task`). `.claude/skills/task-lock/SKILL.md` Quick Reference example (L29) `"<kind>:<id>" //
e.g. "sprint-task:TASK_1974"` → `"task:<id>" // e.g. "task:TASK_1974"`.
**what-considered:**
- Whether to also reword the L269 intro sentence ("the same principle applies with `sprint-task:`
  prefix") — not explicitly named in the brief's line-level spec, but it sits inside the same
  269-283 section as the two explicitly-named edits and would otherwise directly contradict the
  code block two lines below it. Chosen: fix it too, for section-internal consistency; still zero
  scope creep (same section, same file, same underlying drift).
- Whether to touch the historical handoff `docs/handoffs/TASK_1979-p1-af-4-task-lock-skill-rebind.md`
  (also contains `task_id="sprint-task:TASK_1974"` twice) surfaced by the AC4 regression grep —
  rejected: it is a completed, historical task spec, not a live SKILL/flow file; brief explicitly
  scopes the fix to the two SKILL.md files ("No other file needs to change"); out-of-scope edit
  would violate the hard constraint "Edit ONLY the two `.claude/skills/*.md` files."
- Line 492 (`dispatch-claim/SKILL.md` "LIFTED TO ROUTER SCOPE..." provenance prose) — left as-is per
  brief's explicit instruction; verified unchanged post-edit (historical changelog, not a live rule).
- CLAUDE.md §PRE-CLAIM Phase B `intent:` pattern — NOT touched (Conclusion A of the brief rejected
  merging `intent:`/`task:` as a false positive); verified `git diff CLAUDE.md` empty post-commit.
**verification:** `grep -n 'sprint-task:'` re-run post-edit on both target files returns 0 hits inside
code/table rows (only the explicitly-preserved L492 provenance line remains, which does not contain
the literal string). Repo-wide `grep -rn 'task_id.*"sprint-task:' .claude/ docs/` returns hits only in
(a) audit/adjudication brief prose quoting the old text as evidence, (b) `orch-state.json` next_action
prose describing this exact fix, (c) the historical `TASK_1979` handoff doc — none are live SKILL
files, all expected/out-of-scope per brief. `git diff -- <the 2 files>` shows a clean, minimal diff;
`git status --porcelain` confirms none of the ~89 dirty peer files were staged. Commit `18885ff50`
touches exactly `.claude/skills/dispatch-claim/SKILL.md` + `.claude/skills/task-lock/SKILL.md`.
**owner:** agent-father (sole historical committer of both files per brief's routing rationale).
