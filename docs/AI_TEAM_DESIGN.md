# AI Team Design — VN Market Intelligence

## Two-Team Architecture

→ See `docs/references/agent-roster.md` § Two-Team Architecture for full team roster, member count, and cooperation protocol.

## Three-Channel Rules

→ See `docs/references/agent-roster.md` § Three-Channel Rules for channel assignments and write restrictions.

## Analysis Team (Claude Cowork)

→ See `docs/references/agent-roster.md` § Analysis Team for roster, scheduling, roles, and file references.

## Problem Reporting Flow

1. Agent calls `submit_feedback(severity, title, detail, agent="{name}")` → BUG channel
2. Dev Team reads within 1h
3. Fix → commit → push → delete report
4. Restart: `docker-compose down && docker-compose up -d && sleep 5`

## Dev Team (Claude Code CLI Cron — hourly)

→ See `docs/references/agent-roster.md` § Dev Team for roster, responsibilities, and hourly cron workflow.

Cycle flow:
1. Check BUG channel → empty → exit (1 API call)
2. Read unprocessed reports
3. Triage: FIX NOW (<20 lines) or SPRINT TASK
4. FIX NOW: fix → test → commit → push → WORK summary
5. SPRINT TASK: PO → BA → Architect → PM → Dev → QA chain
6. Update docs: CLAUDE.md, TASKS.md, SPRINT_GOAL.md, agent .md files
7. Agent files changed → notify user to refresh Cowork

Cost optimization: exit immediately if no reports | FIX NOW before SPRINT TASK | max 1 sprint per loop.

## MCP Server

9 Docker microservices (TypeScript/Bun + Python/FastAPI). Shared SQLite database. Telegram Bot API. VPS proxy in Vietnam for geo-blocked sources.

- Tool count → `docs/data/project-stats.json`
- Scheduled jobs → `docs/standards/cron-jobs.md`
- Tool list → `docs/standards/mcp-tools.md`
