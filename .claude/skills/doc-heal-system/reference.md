> Parent: [./SKILL.md](./SKILL.md)

# Doc-Heal System — Reference: Templates + Discovery Commands

## Appendix A — Skill file factory template

Every `.claude/skills/<name>/SKILL.md` must have:

```markdown
---
name: <kebab-case>
description: >
  <one-paragraph summary; triggers SkillTool match>
---

## Purpose (or When to invoke)
## Rule source / Inputs
## Steps or Phases
## Output / Side effects
## Forbidden actions  (if mutating)
```

Optional: Appendix sections for templates, examples, lessons learned.

---

## Appendix B — Discovery commands cheat sheet

```bash
# All .md/.json in scope
find .claude docs -type f \( -name "*.md" -o -name "*.json" \) \
  -not -path "*/node_modules/*" -not -path "*/_archive/*"

# Files in tree-map vs files on disk
grep -oE '[a-zA-Z0-9./_-]+\.(md|json)' docs/references/tree-map.md | sort -u > /tmp/in_tree.txt
find .claude docs -type f \( -name "*.md" -o -name "*.json" \) | sort -u > /tmp/on_disk.txt
comm -23 /tmp/on_disk.txt /tmp/in_tree.txt    # orphans on disk
comm -13 /tmp/on_disk.txt /tmp/in_tree.txt    # tree-map points to missing files

# Hardcoded count drift
grep -rnE '\b(83|112|123|22|33|29) (tools|cron|agents|jobs)\b' .claude/ docs/

# Size cap check
wc -l CLAUDE.md
jq '[.task_board.active_sprints[].tasks[]] | length' docs/data/orch/orch-state.json
jq '.sprint_goal.entries | length' docs/data/orch/orch-state.json
find .claude/agents .claude/skills -name "*.md" -exec wc -l {} \; | sort -rn | head
```

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
> Companion: `.claude/skills/doc-self-heal/SKILL.md` (per-agent, narrow scope)
