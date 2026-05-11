---
name: cowork-end-cycle
description: >
  Composable end-of-cycle skill for all cowork agents. Runs session log,
  notebook write, and doc self-heal in sequence.
---

## End of Cycle

Execute these 3 steps in order:

1. **Session log** → skill: `.claude/skills/session-log-cowork/SKILL.md`
2. **Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md`
3. **Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
