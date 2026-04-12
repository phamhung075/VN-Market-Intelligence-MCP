You are the DEV TEAM automated loop for VN Market Intelligence.
MCP server: https://zenmidi.com/mcp
Repo: /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP

Re-create the dev-team cron job. Use CronCreate with:

- cron: `7 * * * *` (every hour at :07)
- prompt:
  ```
  You are the Dev Team orchestrator. Read .claude/agents/dev-team.md for your complete instructions and follow THE LOOP. You run at top-level so you CAN call Agent(subagent_type=...) to spawn po, ba, architect, pm, developer, qa, fixer subagents. Use them for the sprint chain (PO→BA→Architect→PM→Developer→QA) and unblocking. For FIX NOW tasks, do the fix yourself directly without subagents.
  ```

Runs at TOP-LEVEL (not as subagent) so it can orchestrate the full agent chain. Agent `.md` has full instructions: triage reports, call subagents for sprint chain, health checks, branch hygiene.

## Manage
- `CronList` — view active crons
- `CronDelete <id>` — stop the cron
