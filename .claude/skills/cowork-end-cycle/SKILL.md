---
name: cowork-end-cycle
description: >
  Composable end-of-cycle skill for all cowork agents. Runs session log,
  notebook write, and doc self-heal in sequence.
---

## End of Cycle

Execute these 5 steps in order:

0. **Decision journal flush** → skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry (flush any pending step-rationale entries for this cycle before session log)
1. **Session log** → skill: `.claude/skills/session-log-cowork/SKILL.md`
2. **Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`
3. **Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
4. **Self-critique** → skill: `.claude/skills/self-critique/SKILL.md`
