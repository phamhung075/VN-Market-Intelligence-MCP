---
name: Bug Reporting via MCP (Automatic Deduplication)
description: Agents use send_telegram(channel="bug") MCP tool for reporting; MCP server auto-deduplicates within 4 hours
type: reference
---

# Bug Reporting Via MCP — Automatic System

**Status:** Production — built-in MCP infrastructure, no agent-side deduplication needed

Bug reporting protocol through MCP with automatic 4-hour deduplication window.

---

## Overview

Agents call `send_telegram(channel="bug")` MCP tool on error. MCP server auto-deduplicates, stores in SQLite, and routes to dev team.

| Phase | Owner | File |
|-------|-------|------|
| **Capture** | Cowork agents | → see ./bug-reporting-capture.md |
| **Routing** | MCP server | → see ./bug-reporting-routing.md |
| **Resolution** | Dev team | → see ./bug-reporting-resolution.md |

---

## Key Points

- **Automatic deduplication:** MCP server checks for duplicates within 4h window
- **No agent-side logic needed:** Agent just calls tool, MCP handles dedup
- **SQLite storage:** All reports in `telegram_reports` table for dev team
- **Three priorities:** critical, high, normal, monitor

---

## Implementation Files

| File | Purpose |
|------|---------|
| `apps/mcp-server/src/interface/mcp/tools/briefings/telegramTools.ts` | MCP tool registration, dedup logic (line 110) |
| `apps/mcp-server/src/infrastructure/db/telegramReportStore.ts` | SQLite CRUD for `telegram_reports` table |
| `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts` | MCP tools for dev team (read/process reports) |
| `apps/mcp-server/src/infrastructure/notifiers/telegram.ts` | Actual Telegram API calls, dedup window (4h) |

---

**Last Updated:** 2026-04-26
**Status:** MCP infrastructure verified and operational
