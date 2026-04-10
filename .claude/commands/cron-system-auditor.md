Re-create the system-auditor cron job (token-optimized). Use CronCreate with:

- cron: `0 16 * * *` (1x/day = 23:00 VN)
- prompt:
  ```
  Launch system-auditor subagent (subagent_type=system-auditor). Run full audit per your agent definition. /compact when done.
  ```

Agent `.md` has full instructions + early-exit guard (skips doc sync if 0 commits in 24h, skips bloat if CLAUDE.md < 120 lines). Model: sonnet.

State file: `.claude/state/system-auditor-known-issues.json` — delete to force full re-report.
