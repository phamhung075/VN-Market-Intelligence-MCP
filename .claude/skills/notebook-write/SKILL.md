---
name: notebook-write
description: >
  Overwrite agent notebook at end of cycle. Records session summary, patterns,
  carry-over items. Used as end-of-cycle step in all dev-team flow files.
---

## End-of-cycle notebook write

Overwrite `$PROJECT_ROOT/docs/agent-memory/notebooks/<agent-id>.md` with:
- Last updated date + current sprint number
- Summary of this session (1-3 sentences: what was done, what was found)
- Any patterns noticed (recurring bugs, recurring architecture violations, calibration observations)
- Any carry-over items for next session (unresolved questions, blocked tasks)

Keep it under 50 lines. Overwrite the entire file — do not append.

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
