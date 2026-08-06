**Job 4 — claude-manager-helper, Mon+Thu repo drift heal**

> ⚠️ CronCreate fires at MACHINE-LOCAL time (France), NOT UTC — see
> `cron-claude-manager-helper.md`'s own DST note. `30 19 * * 1,4` is the CEST (summer) expression;
> switch to `30 18 * * 1,4` for CET (winter) per that doc.

```
CronCreate(
  description : "claude-manager-helper Mon+Thu repo drift heal",
  cron        : "30 19 * * 1,4",
  recurring   : true,
  durable     : true,
  prompt      : "Launch subagent (subagent_type=claude-manager-helper). Read and execute docs/agents/claude-manager-helper/flow/main.md\nMCP: https://zenmidi.com/vn-market/mcp"
)
```
