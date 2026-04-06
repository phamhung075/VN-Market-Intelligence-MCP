# Claude-Manager-Helper Daily Cron

Starts the `claude-manager-helper` agent once per day. The agent audits `CLAUDE.md` and project context files for bloat, drift, and inconsistencies; verifies tool counts, cron counts, and agent rosters against actual code; slims `CLAUDE.md` if it has grown; syncs `docs/IMPLEMENTATION_STATUS.md`, `docs/ARCHITECTURE.md`, and `docs/CRON_JOBS.md`; and updates `memory/MEMORY.md` index entries if stale. Stays silent if nothing needs changing.

## Paste this into Claude Code to create the cron:

```
CronCreate schedule "30 17 * * *" recurring true run_now false prompt:
Launch the claude-manager-helper subagent (Agent tool, subagent_type=claude-manager-helper). Instruct it to: read .claude/agents/claude-manager-helper.md for its full definition, then perform a full context-hygiene audit — (1) audit CLAUDE.md for bloat, stale sections, and drift vs actual code; (2) verify tool count, cron count, and agent roster in CLAUDE.md against src/interface/mcp/server.ts, src/scheduler/jobs.ts, and .claude/agents/*.md; (3) move any oversized inline sections to the appropriate docs/ file and replace with a one-line pointer; (4) sync docs/IMPLEMENTATION_STATUS.md, docs/ARCHITECTURE.md, and docs/CRON_JOBS.md to reflect the current codebase; (5) update memory/MEMORY.md and any linked memory files that are stale. Never delete information — only relocate. Never touch source code. Stay completely silent if nothing needs changing. At the very end, after all work is done, run `/compact` to compress context before exiting.
```

## Schedule

- `30 17 * * *` UTC = **00:30 Vietnam time (next day)** — low-traffic window, market closed, no collision with system-auditor (`0 1,13 * * *`) or unified-agent (`7 * * * *`)
- Recurring: yes
- Auto-expires after 7 days (re-run this command to renew)

## Manage

- `CronList` — view active crons
- `CronDelete <id>` — stop the cron

## Renewal

Re-paste the `CronCreate` block above at the start of each new Claude Code session or after 7 days.
