**Job 5 — code-janitor, every 6h DRY-hygiene sweep**

```
CronCreate(
  description : "code-janitor every-6h DRY-hygiene sweep",
  cron        : "0 */6 * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Launch subagent (subagent_type=code-janitor). Read and execute docs/agents/code-janitor/flow/main.md\nMCP: https://zenmidi.com/vn-market/mcp"
)
```
