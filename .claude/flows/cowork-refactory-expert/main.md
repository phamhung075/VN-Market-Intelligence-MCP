# Cowork Refactory Expert — Main Flow

**Tools:** `.claude/tools/package/cowork-refactory-expert.md`

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
Cross-check: `.claude/knowledge/mcp-tools.md` | `.claude/knowledge/cron-jobs.md` | `docs/data/project-stats.json`

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
- Tools: [N] (see .claude/knowledge/mcp-tools.md)
- Scheduler: [N jobs] (see .claude/knowledge/cron-jobs.md)
- Watchlist: [N tickers, M sectors]
- Telegram: MARKET (user alerts) | WORK (dev status) | BUG (errors)

Key patterns:
- All Cowork agents → https://zenmidi.com/mcp
- Signal bus inter-agent comms (mcp-tools.md#signal-types)
- Watchlist checks before alerting
- Fail-loud on knowledge Read failures
```

**End-of-cycle notebook write**
→ skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `cowork-refactory-expert`)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

---

## Error Boundary

- Discovery bash commands fail after 1 retry → EXIT. Do NOT guess tool counts from memory.
- Knowledge file unreadable (mcp-tools.md, cron-jobs.md) → EXIT per KNOWLEDGE LOAD FAILURE PROTOCOL.
- Rewrite checklist item fails verification → STOP rewrite, report specific mismatch to WORK channel + EXIT.
- Blocked at any step → report what was completed + EXIT.

## RETURN

```
DONE: Rewrite complete — N cowork agent files updated | Cowork refresh prompt provided
NEXT: user (paste refresh prompt into Cowork)
PIPELINE: complete
QUALITY: full | partial (if checklist items failed)
```
