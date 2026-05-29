Create fb-market-poster cron with CronCreate:

Runs ONCE daily, Monday-Friday, after the EOD CHEF dish (published 08:37 UTC). Time chosen: **13:07 UTC = 20:07 VN** — after market close wrap + EOD synthesis, before prime-time evening Facebook reading. Avoids :00/:30 minute marks. Agent's `main.md` reads its own clock and exits gracefully on weekends or if data is unavailable.

- **cron**: `7 13 * * 1-5`
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=fb-market-poster). Read and execute docs/agents/fb-market-poster/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Rationale

| Constraint | Value | Why |
|---|---|---|
| EOD CHEF dish | 08:37 UTC | Must run after this |
| Evening CHEF dish | 19:37 UTC (conditional) | Run before to avoid duplicate synthesis |
| Facebook prime-time VN | 19:00-22:00 VN | Post at 20:07 VN hits peak reading window |
| Avoid :00/:30 | yes | System convention |
| Weekdays only | M-F (1-5) | VN market runs M-F only |

## Manage

`CronList` | `CronDelete <id>`
