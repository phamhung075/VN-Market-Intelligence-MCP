Re-create the code-janitor cron job (token-optimized). Use CronCreate with:

- cron: `0 */6 * * *` (every 6h — sufficient for ~5 commits/day)
- prompt:
  ```
  Launch code-janitor subagent (subagent_type=code-janitor). Run full scan per your agent definition.
  ```

Agent `.md` has full instructions + early-exit guard (skips if 0 src/ commits in 6h). Model: haiku.
