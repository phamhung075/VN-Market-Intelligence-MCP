# System-Auditor Twice-Daily Cron

Starts the `system-auditor` agent on a 2x/day schedule. The agent inspects the auto-memory directory and the SQLite/LanceDB database, detects NEW problems, and reports them to the Telegram Report Channel for the Dev Team. Strict deduplication via `.claude/state/system-auditor-known-issues.json` — same problem is never reported twice.

## Paste this into Claude Code to create the cron:

```
CronCreate schedule "0 1,13 * * *" recurring true run_now true prompt:
Launch the system-auditor subagent (Agent tool, subagent_type=system-auditor). Instruct it to: read its full agent definition at .claude/agents/system-auditor.md, audit the auto-memory directory and the live database (use get_system_status + get_recent_fixes MCP tools), apply strict deduplication via .claude/state/system-auditor-known-issues.json, and send ONE batched message to the Telegram Report Channel ONLY if new problems are found. Silence on zero findings. At the very end, after reporting (or determining silence), run `/compact` to compress context before exiting.
```

## Schedule

- `0 1,13 * * *` UTC = **08:00 and 20:00 Vietnam time** (twice daily)
- Recurring: yes
- Auto-expires after 7 days (re-run this command to renew)

## Manage

- `CronList` — view active crons
- `CronDelete <id>` — stop the cron

## State file

- `.claude/state/system-auditor-known-issues.json` — fingerprints of already-reported problems, 14-day TTL. Delete this file to force a full re-report on the next run.
