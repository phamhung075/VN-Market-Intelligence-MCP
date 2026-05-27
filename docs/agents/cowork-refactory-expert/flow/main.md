# Cowork Refactory Expert — Main Flow

**Tools:** `docs/agents/tools/package/cowork-refactory-expert.md`

## Input
Live system state (tools, crons, Telegram commands)

## Output
Updated cowork agent `.md` files | paste-ready Cowork refresh prompt

---

## Discovery (run EVERY time before rewriting)

```bash
# Tool count
grep -r "registerTool(" apps/mcp-server/src/interface/mcp/ | wc -l

# Exact tool names
grep -r "registerTool(" apps/mcp-server/src/interface/mcp/ | sed 's/.*registerTool("\([^"]*\)".*/\1/' | sort

# Cron jobs
grep -r "scheduler\.add(" apps/mcp-server/src/scheduler/*.ts

# Telegram commands
grep -r "case '" apps/mcp-server/src/interface/
```
Verify removed: `// DEPRECATED:` or `// NO-OP` markers
Cross-check: `docs/standards/mcp-tools.md` | `docs/standards/cron-jobs.md` | `docs/data/project-stats.json`

## Rewrite Checklist
- [ ] Tool count matches live
- [ ] Tool names exact (no aliases)
- [ ] Cron job names match live
- [ ] Signal bus patterns documented
- [ ] Telegram routing correct (MARKET/WORK/BUG)
- [ ] Alert rules match portfolio-schema.md
- [ ] Vietnamese terms per GLOSSARY_VI.md
- [ ] No hardcoded counts (pointers to docs/data/*.json)
- [ ] Fail-loud protocol referenced for knowledge loads
- [ ] Stock classification matches stock-classification.json

## Cowork Refresh Prompt (provide after every update)
```
Agent system updated. Current state:
- Tools: [N] (see docs/standards/mcp-tools.md)
- Scheduler: [N jobs] (see docs/standards/cron-jobs.md)
- Watchlist: [N tickers, M sectors]
- Telegram: MARKET (user alerts) | WORK (dev status) | BUG (errors)

Key patterns:
- All Cowork agents → https://zenmidi.com/vn-market/mcp
- Signal bus inter-agent comms (mcp-tools.md#signal-types)
- Watchlist checks before alerting
- Fail-loud on knowledge Read failures
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**Commit notebook** (mutex-guarded) → skill: `.claude/skills/commit-mutex/SKILL.md`:
```bash
# own_paths: [docs/agent-memory/notebooks/cowork-refactory-expert.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/cowork-refactory-expert.md
git commit -m "chore(memory/cowork-refactory-expert): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: Discovery bash fails → EXIT (never guess from memory). Checklist item fails → STOP, report mismatch to WORK + EXIT.

## RETURN

```
DONE: Rewrite complete — N cowork agent files updated | Cowork refresh prompt provided
NEXT: user (paste refresh prompt into Cowork)
PIPELINE: complete
QUALITY: full | partial (if checklist items failed)
```
