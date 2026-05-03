---
name: notebook-read
description: >
  Read agent notebook at session start. Load carry-over context without acting on it.
  Used as Step 0b in all dev-team flow files.
---

## Step 0b — Read notebook

Read `$PROJECT_ROOT/docs/agent-memory/notebooks/<agent-id>.md`.
Note any carry-over observations, calibration patterns, or unresolved questions from previous sessions.
Do NOT act on them yet — just load them as context.

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
