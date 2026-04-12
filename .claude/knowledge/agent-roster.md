# Agent Roster

**Load when:** agent coordination, rewriting agent files, understanding team structure.

## Analysis Team (Claude Cowork — 8 agents)

| # | Agent | File | Role | Cycle |
|---|-------|------|------|-------|
| 0 | Setup | `00-setup-watchlist.md` | Seed watchlist | Once |
| — | Unified Coordinator | `unified-agent.md` | Coordinate + quality review + last-mile check | On-demand + Daily 22:00 VN + Sunday 20:00 VN |
| 1 | News Scout | `01-news-scout.md` | News, sentiment, impact chains, legal/crisis detection | 15 min (market) / 60 min (off) |
| 2 | BCTC Collector | `02-bctc-collector.md` | Track BCTC availability | 2x daily (08:00 + 20:00 VN) |
| 3 | Report Analyzer | `03-report-analyzer.md` | Analyze financials, insider signals | 2x daily (09:00 + 21:00 VN) |
| 4 | Market Watcher | `04-market-watcher.md` | Prices, anomalies, supply chain, climate/energy | 5 min (market) / 2h (off) |
| 5 | Alert Commander | `05-alert-commander.md` | ONLY agent → MARKET channel | 10 min (market) / 30 min (off) |
| 6 | Digest Writer | `06-digest-writer.md` | Daily/weekly/monthly summaries | Daily 22:30 VN / Weekly Sunday / Monthly 1st |
| 7 | QA Responder | `07-qa-responder.md` | Answer /ask queue FIFO → MARKET | Every 12 min via askQueueCheck |

Coordinator: `cowork-analysis-vnmarket-team/unified-agent.md`

## Dev Team (Claude Code CLI — local cron)

| Agent | File | Role |
|-------|------|------|
| PO | `po.md` | Vision, approves specs, final sign-off |
| BA | `ba.md` | Requirements, edge cases, blockers |
| Architect | `architect.md` | Brownfield analysis, technical design, risk |
| PM | `pm.md` | Sprint planning, task breakdown, TASKS.md |
| Developer | `developer.md` | TDD implementation, DDD compliance |
| QA / CI-CD | `qa.md` | Test pipeline, merge gate, sprint report |
| Fixer | `fixer.md` | Minimum fixes on changes-requested tasks |
| Market Analyst | `market-analyst.md` | Investment analysis via MCP tools |
| Idea Forge | `idea-forge.md` | Brainstorm, refine, expand ideas |
| Cowork Refactory Expert | `cowork-refactory-expert.md` | Rewrite/update Cowork agent .md files |
| System Auditor | `system-auditor.md` | Health audit: memory, DB, docs sync, anomaly detection |
| Claude Manager Helper | `claude-manager-helper.md` | Context janitor: CLAUDE.md slim, docs sync, memory hygiene |
| Code Janitor | `code-janitor.md` | DRY auditor cron (every 3h): duplicate ticker maps, hard-coded arrays, magic numbers, schema duplication |

| **Dev Team Orchestrator** | `dev-team.md` | **Orchestrator**: triages reports, calls PO/BA/Architect/PM/Developer/QA/Fixer subagents, health checks, branch hygiene |

Dev team cron: launches `dev-team` subagent hourly → orchestrator calls other subagents as needed

## Stock Classification

Full table → `.claude/knowledge/portfolio-schema.md`

## Agent Cooperation Flow

| Signal | From → To |
|--------|-----------|
| `urgent_news` | News Scout → Market Watcher |
| `chain_catalyst` | News Scout → Report Analyzer + Market Watcher |
| `fundamental_validation` | Report Analyzer → Alert Commander |
| `price_confirmation` / `price_anomaly` | Market Watcher → Alert Commander |
| `verified_chain` | Server synthesizes 2+ confirmations → Alert Commander |
| `send_telegram(market)` | Alert Commander (05) / Digest Writer (06) / QA Responder (07) → User |
| `submit_feedback` | All agents → BUG channel → Dev Team |
| `send_telegram(work)` | All agents → WORK channel → Dev Team |

## Two-Team Architecture

```
ANALYSIS TEAM (Cowork, 8 agents, cloud)
  → MARKET (TELEGRAM_INFO_MARKET_GROUP_ID)  = user alerts/answers
  → WORK   (TELEGRAM_INFO_WORK_CHANNEL_ID)  = status
  → BUG    (TELEGRAM_REPORT_BUG_CHANNEL_ID) = bugs
        ↓ WORK + BUG
DEV TEAM (Claude Code CLI, local cron, every 1h)
  Reads BUG → auto-fixes → pushes to main
  → WORK: fix-shipped notices, sprint summaries
  → Restart: launchctl kickstart only (no hot reload)
```
