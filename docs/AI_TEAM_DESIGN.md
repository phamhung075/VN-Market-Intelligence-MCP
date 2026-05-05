# AI Team Design — VN Market Intelligence

## Two-Team Architecture

```
ANALYSIS TEAM (Claude Cowork — 8 agents, cloud)
  Serves user with investment intelligence
  → MARKET (TELEGRAM_INFO_MARKET_GROUP_ID) = user-facing
  → WORK   (TELEGRAM_INFO_WORK_CHANNEL_ID) = status
  → BUG    (TELEGRAM_REPORT_BUG_CHANNEL_ID) = problems
        ↓ WORK + BUG
DEV TEAM (Claude Code CLI — local cron, every 1h)
  Reads BUG → auto-fixes → pushes to main
  → WORK: fix-shipped notices, sprint summaries
  → Server restarts via docker-compose (hot reload FORBIDDEN, all 9 services restart in lockstep)
```

**Note:** `TELEGRAM_CHAT_ID` / `TELEGRAM_REPORT_ID` are deleted. No legacy aliases, no shims.

## Three-Channel Rules

| Channel | Env Var | Who Writes | Never Write |
|---------|---------|------------|-------------|
| MARKET | `TELEGRAM_INFO_MARKET_GROUP_ID` | Alert Commander (alerts), Digest Writer (digests), QA Responder (/ask answers) | Internal dev reports, agent feedback |
| WORK | `TELEGRAM_INFO_WORK_CHANNEL_ID` | Dev Team, Unified Agent, all agents (status) | User-facing analysis |
| BUG | `TELEGRAM_REPORT_BUG_CHANNEL_ID` | All analysis agents via `submit_feedback` | Anything not a bug |

Dev Team claims BUG reports, processes, deletes (keeps channel clean).

## Analysis Team (Claude Cowork)

8 agents on Claude Cowork cloud. Connect to MCP server via `https://zenmidi.com/vn-market/sse`.

| # | Agent | Schedule | Role | File |
|---|-------|----------|------|------|
| 0 | Setup | Once | Seed watchlist | `00-setup-watchlist.md` |
| — | Unified Coordinator | On-demand + Daily 22:00 VN + Sunday | Coordinate + quality review + last-mile check | `unified-agent.md` |
| 1 | News Scout | 15 min (market) / 60 min (off) | News, sentiment, impact chains, legal/crisis | `01-news-scout.md` |
| 2 | BCTC Collector | 2x daily 08:00+20:00 VN | Track BCTC availability | `02-bctc-collector.md` |
| 3 | Report Analyzer | 2x daily 09:00+21:00 VN | Analyze financials, insider signals | `03-report-analyzer.md` |
| 4 | Market Watcher | 5 min (market) / 2h (off) | Prices, anomalies, supply chain | `04-market-watcher.md` |
| 5 | Alert Commander | 10 min (market) / 30 min (off) | ONLY sender to MARKET for alerts | `05-alert-commander.md` |
| 6 | Digest Writer | Daily 22:30 VN + Sunday | Daily/weekly summaries | `06-digest-writer.md` |
| 7 | QA Responder | Every 12 min (askQueueCheck) | Answer /ask FIFO → MARKET | `07-qa-responder.md` |

Note: System Improver (07 old) merged into Unified Coordinator.

## Problem Reporting Flow

1. Agent calls `submit_feedback(severity, title, detail, agent="{name}")` → BUG channel
2. Dev Team reads within 1h
3. Fix → commit → push → delete report
4. Restart: `docker-compose down && docker-compose up -d && sleep 5`

## Dev Team (Claude Code CLI Cron — hourly)

Loop:
1. Check BUG channel → empty → exit (1 API call)
2. Read unprocessed reports
3. Triage: FIX NOW (<20 lines) or SPRINT TASK
4. FIX NOW: fix → test → commit → push → WORK summary
5. SPRINT TASK: PO → BA → Architect → PM → Dev → QA chain
6. Update docs: CLAUDE.md, TASKS.md, SPRINT_GOAL.md, agent .md files
7. Agent files changed → notify user to refresh Cowork
8. Restart via launchctl kickstart

Git rules: commit each change separately | push to main (auto-merge) | never amend | always send WORK summary.

Cost optimization: exit immediately if no reports | FIX NOW before SPRINT TASK | max 1 sprint per loop.

## MCP Server

9 Docker microservices (TypeScript/Bun + Python/FastAPI). Shared SQLite database. Telegram Bot API. VPS proxy in Vietnam for geo-blocked sources.

- Tool count → `docs/data/tool-registry.json`
- Scheduled jobs → `.claude/knowledge/cron-jobs.md`
- Tool list → `.claude/knowledge/mcp-tools.md`
