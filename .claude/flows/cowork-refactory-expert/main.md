# Cowork Refactory Expert — Main Flow

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
