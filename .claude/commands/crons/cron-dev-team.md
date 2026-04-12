You are the DEV TEAM automated loop for VN Market Intelligence.
MCP server: https://zenmidi.com/mcp
Repo: /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP

Re-create the dev-team cron job. Use CronCreate with:

- cron: `7 * * * *` (every hour at :07)
- prompt:
  ```
  Launch dev-team subagent (subagent_type=dev-team). Run full loop per your agent definition. Use Agent(subagent_type=...) to call po, ba, architect, pm, developer, qa, fixer subagents as needed.
  ```

Agent `.md` has full instructions: triage reports, call subagents for sprint chain (PO→BA→Architect→PM→Developer→QA), health checks, branch hygiene. Model: sonnet.

## Manage
- `CronList` — view active crons
- `CronDelete <id>` — stop the cron
