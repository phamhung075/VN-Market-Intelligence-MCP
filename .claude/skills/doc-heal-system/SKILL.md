---
name: doc-heal-system
description: >
  Full-subtree audit + auto-fix for ALL agents, skills, flows, knowledge, docs.
  Enforces tree-map.md DAG, SSOT discipline, factory pointers, no-hardcode rule.
  Auto-fixes mechanical drift; escalates semantic drift to architect.
  Differs from `doc-self-heal` (per-agent, end-of-cycle, files touched this cycle only)
  by scanning the entire subtree every run regardless of git diff.
---

## When to invoke

- `claude-manager-helper` cron (Mon/Thu 17:30 UTC) — after the 10-pass git-diff sweep
- User runs `/docheal` or asks to "audit all docs / skills / knowledge"
- After any large sprint close, refactor, or agent-roster change

> **Do not run as part of a normal end-of-cycle.** Use `doc-self-heal` for local fixes.
> This skill is global and writes across the system — only run when authorised.

---

## Rule source — SSOT chain

| Rule | Lives in | Authority |
|------|----------|-----------|
| File DAG, parent→child only | `docs/references/tree-map.md` | Canonical |
| File placement (where new .md goes) | `docs/policies/docs-organization.md` | Canonical |
| Agent file factory template | `docs/AGENT_CREATION_GUIDE.md` → `docs/guides/guide-*.md` | Canonical |
| Skill file factory template | `./reference.md` (Appendix A) | Canonical |
| Flow file factory template | `docs/guides/guide-flows.md` | Canonical |
| Knowledge file rules (no volatile counts) | `tree-map.md` §Rules + §Drift Detection | Canonical |
| Volatile data location | `docs/data/*.json` (never `.claude/`, never inline) | Canonical |
| Size caps | CLAUDE.md ≤120 · `orch-state.json .task_board` task count ≤80 · `.sprint_goal.entries[]` count ≤15 · agent .md ≤200 | `claude-manager-helper/main.md` |

If two SSOTs conflict, **tree-map.md wins** and the other is fixed to match.

---

## Scope — every run, no exceptions

```
.claude/agents/*.md | .claude/skills/*/SKILL.md | docs/agents/*/flow/main.md (+ sub-flows)
docs/{policies,protocols,standards,references,guides}/*.md | docs/references/bundles/*.md
docs/*.md | docs/architecture/**/*.md | docs/data/*.json | CLAUDE.md | memory/MEMORY.md
```

---

## Sections

| Section | Sub-file | Trigger |
|---|---|---|
| Phases 0-7 (discover → report) | `→ see ./phases.md` | running the skill |
| Auto-fix vs Escalate matrix | inline below | any phase decision |
| Forbidden actions | inline below | any phase action |
| Templates + discovery commands | `→ see ./reference.md` | authoring or debugging |

---

## Auto-fix vs Escalate — decision matrix

| Category | Auto-fix | Escalate |
|----------|----------|----------|
| Dead pointer with known rename | rewrite | — |
| Dead pointer, unknown target | — | architect |
| Reversed pointer | delete | — |
| Orphan file with clear parent | add to tree-map | — |
| Orphan file, unclear parent | — | architect |
| Hardcoded count → JSON pointer | rewrite | — |
| Restated SSOT rule | replace with pointer | — |
| Agent missing factory section | — | agent-father |
| Flow missing factory section | — | agent-father |
| Size cap exceeded | trim / archive | — |
| Boilerplate matches existing skill | replace with pointer | — |
| Boilerplate, no existing skill | — | cowork-refactory-expert |
| Memory line stale | remove | — |
| Semantic claim wrong | — | architect or owning agent |

---

## Forbidden actions

- NEVER rewrite prose for style — only mechanical fixes + pointer substitution.
- NEVER delete knowledge files without recording merge target in tree-map §Deleted Files.
- NEVER edit files outside the Scope list. Never touch source code (`apps/`, `src/`).
- NEVER auto-fix semantic drift (wrong claims, stale facts) — always escalate.
- NEVER run without a git working tree on main or an authorised task branch.
