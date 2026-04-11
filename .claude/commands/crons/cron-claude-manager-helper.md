Re-create the claude-manager-helper cron job (token-optimized). Use CronCreate with:

- cron: `30 17 * * 1,4` (2x/week Mon+Thu = 00:30 VN)
- prompt:
  ```
  Launch claude-manager-helper subagent (subagent_type=claude-manager-helper). Run full audit per your agent definition. /compact when done.
  ```

Agent `.md` has full instructions + early-exit guard (skips if 0 context file changes in 3 days). Model: sonnet.
