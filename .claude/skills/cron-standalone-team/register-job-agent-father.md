**Job 3 — agent-father, daily orphan+roster sweep**

```
CronCreate(
  description : "agent-father daily orphan+roster sweep",
  cron        : "23 14 * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Launch subagent (subagent_type=agent-father). Read and execute docs/agents/agent-father/flow/main.md\nMCP: https://zenmidi.com/vn-market/mcp"
)
```
