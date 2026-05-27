---
name: doc-self-heal
description: >
  End-of-cycle step: agent reviews the flow/knowledge/skill docs it followed
  during this cycle and auto-fixes anything outdated, unclear, or missing.
---

## Doc Self-Heal (end-of-cycle)

After completing your work, review the documentation you followed this cycle and fix what was wrong.

### What to review

1. **Your flow file** — the `docs/agents/<agent>/flow/*.md` you executed
2. **Knowledge files** — any `docs/{policies,protocols,standards,references}/*.md` you loaded during the cycle
3. **Skill files** — any `.claude/skills/*/SKILL.md` you invoked

### What to fix

Compare what the doc says vs what actually happened. Fix these categories:

| Category | Example |
|----------|---------|
| **Outdated** | Tool name changed, file path moved, step no longer applies |
| **Unclear** | Ambiguous instruction that caused hesitation or wrong action |
| **Missing** | Step you had to improvise that should be documented for next cycle |
| **Wrong order** | Steps that needed reordering to work correctly |

### Rules

- **Minimal edits only** — fix substance, not style. Do not rewrite sentences that work.
- **Skip if nothing was wrong** — no edit for the sake of editing. If docs were accurate, do nothing.
- **Never remove safety checks** — even if you skipped them this cycle, they may apply next cycle.
- **Add context, not verbosity** — if a step was unclear, add a one-line clarification, not a paragraph.
- **Commit doc fixes separately** — `docs: self-heal <agent> flow — <what changed>` so they show in git log.

### Output

If fixes were made, log them in notebook (carry-over section):
```
Doc self-heal: fixed [N] items in [file1, file2]
- [file]: [one-line description of fix]
```

If nothing to fix: skip silently — do not log "nothing to fix".

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
