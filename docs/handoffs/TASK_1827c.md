# TASK_1827c — DOCS: Scaffold 19 missing agent notebooks

**Status:** In Progress
**Branch:** main (doc-only, no branch needed)
**Owner:** developer
**Handoff to:** qa

---

## Goal

Create 19 missing agent notebook files at `docs/agent-memory/notebooks/` using the bootstrap template.

## Files to create

| Agent ID | Display Name |
|----------|-------------|
| alert-commander | Alert Commander |
| architect | Architect |
| ba | BA |
| cowork-refactory-expert | Cowork Refactory Expert |
| developer | Developer |
| digest-predict | Digest Predict |
| financial-analyst | Financial Analyst |
| fixer | Fixer |
| idea-forge | Idea Forge |
| market-analyst | Market Analyst |
| market-watcher | Market Watcher |
| news-scout | News Scout |
| ops | Ops |
| pm | PM |
| qa | QA |
| qa-responder | QA Responder |
| report-analyzer | Report Analyzer |
| system-auditor | System Auditor |
| unified-agent | Unified Agent |

## Template

```markdown
# <Agent Display Name> — Notebook

**Last updated:** — | **Sprint:** —

## Current state

(no session recorded)

## Last session summary

(none)

## Known patterns / preferences

(none recorded)
```

## Acceptance criteria

- [ ] 19 new `.md` files created at `docs/agent-memory/notebooks/`
- [ ] Each file has H1 title matching `<Agent Display Name> — Notebook`
- [ ] Each file has bold metadata line: `**Last updated:** — | **Sprint:** —`
- [ ] Each file has 3 H2 sections: `Current state`, `Last session summary`, `Known patterns / preferences`
- [ ] No existing notebooks modified (claude-manager-helper.md, code-janitor.md, main.md, po.md untouched)
- [ ] `git push origin main` clean

## Constraints

- No TypeScript touched
- No tests needed
- No tsc impact
- Baseline pass: 8582

## QA instructions

1. `ls docs/agent-memory/notebooks/ | wc -l` — expect 23 (4 existing + 19 new)
2. Spot-check 3 random files for correct H1, metadata, and 3 H2 sections
3. Verify 4 existing files are unmodified (git diff HEAD -- docs/agent-memory/notebooks/claude-manager-helper.md etc.)
