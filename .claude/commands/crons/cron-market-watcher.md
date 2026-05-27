Create market-watcher cron with CronCreate:

All three entries below use the uniform `main.md` dispatcher (time-window logic lives in `docs/agents/market-watcher/flow/main.md`). The hourly entry runs at :07, the 15-min scan at :12/:27/:42/:57, and the EOD at 16:03 — `main.md` decides which sub-flow runs and EXITs outside windows.

- **cron**: `7 2-8 * * 1-5` (Mon–Fri hourly :07 during market window)
- **recurring**: true
- **durable**: true  (persist across session restarts)
- **prompt**:
  ```
  Launch subagent (subagent_type=market-watcher). Read and execute docs/agents/market-watcher/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

---

**Second entry — 15-min intraday scan:**

- **cron**: `12,27,42,57 2-8 * * 1-5`
- **recurring**: true
- **durable**: true  (persist across session restarts)
- **prompt**:
  ```
  Launch subagent (subagent_type=market-watcher). Read and execute docs/agents/market-watcher/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

---

**EOD entry:**

- **cron**: `3 16 * * 1-5`
- **recurring**: true
- **durable**: true  (persist across session restarts)
- **prompt**:
  ```
  Launch subagent (subagent_type=market-watcher). Read and execute docs/agents/market-watcher/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
