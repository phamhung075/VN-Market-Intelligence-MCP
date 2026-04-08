# Agent Roster — Analysis Team + Dev Team

**When to read this file:** When you need to understand which agents exist, their cycles, roles, or how the two-team architecture coordinates. Load only when your task involves agent coordination, rewriting agent files, or understanding the full team structure.

---

## Analysis Team (Claude Cowork — cloud)

| # | Agent | File | Role | Cycle |
|---|-------|------|------|-------|
| 0 | Setup | `00-setup-watchlist.md` | One-time: seed watchlist | Once |
| — | Unified Coordinator | `unified-agent.md` | Coordinate + quality review + last-mile check | On-demand + Daily 22:00 VN + Sunday 20:00 VN |
| 1 | News Scout | `01-news-scout.md` | Fetch news, sentiment, impact chains, legal/crisis detection | 15 min (market) / 60 min (off) |
| 2 | BCTC Collector | `02-bctc-collector.md` | Track BCTC report availability | 2x daily (08:00 VN + 20:00 VN) |
| 3 | Report Analyzer | `03-report-analyzer.md` | Analyze financials, validate data, insider signals | 2x daily (09:00 VN + 21:00 VN) |
| 4 | Market Watcher | `04-market-watcher.md` | Track prices, detect anomalies, supply chain, climate/energy | 5 min (market) / 2h (off) |
| 5 | Alert Commander | `05-alert-commander.md` | ONLY agent that sends to MARKET channel | 10 min (market) / 30 min (off) |
| 6 | Digest Writer | `06-digest-writer.md` | Daily/weekly/monthly summaries | Daily 22:30 VN / Weekly Sunday / Monthly 1st |
| 7 | QA Responder | `07-qa-responder.md` | Answer /ask queue FIFO, post answers to MARKET | Every 12 min via askQueueCheck cron |

Coordinator file: `cowork-analysis-vnmarket-team/unified-agent.md`

---

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
| Code Janitor | `code-janitor.md` | DRY auditor cron (every 3h): detects duplicate ticker maps, hard-coded arrays, magic numbers, schema duplication |

Dev team hourly loop: `cowork-analysis-vnmarket-team/dev-team-cron.md`

---

## Stock Classification

- Full stock classification table → `.claude/knowledge/stock-classification.md`

---

## Agent Cooperation Flow

```
News Scout (01) ──[urgent_news signal]──→ Market Watcher (04)
                ──[chain_catalyst]──────→ Report Analyzer (03) + Market Watcher (04)
                                            ↓
Report Analyzer (03) ──[fundamental_validation]──→ Alert Commander (05)
Market Watcher (04)  ──[price_confirmation]──────→ Alert Commander (05)
                     ──[price_anomaly]────────────→ Alert Commander (05)
                                                        ↓
                                               Server synthesizes verified_chain
                                                        ↓
Alert Commander (05) ──[send_telegram(market)]──→ User (MARKET channel)
Digest Writer (06)   ──[send_telegram(market)]──→ User (MARKET channel)
QA Responder (07)    ──[send_telegram(market)]──→ User (MARKET channel)

All agents ──[submit_feedback]──→ BUG channel → Dev Team
All agents ──[send_telegram(work)]──→ WORK channel → Dev Team / status
```

---

## Two-Team Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ANALYSIS TEAM (Claude Cowork — 7 agents, cloud)         │
│  Serves user with investment intelligence                 │
│  → Market Group  (TELEGRAM_INFO_MARKET_GROUP_ID) = user  │
│  → Work Channel  (TELEGRAM_INFO_WORK_CHANNEL_ID) = status│
│  → Bug Channel   (TELEGRAM_REPORT_BUG_CHANNEL_ID) = bugs │
└──────────┬─────────────────────────┬──────────────────────┘
           │ Work Channel            │ Bug Channel
           ▼                         ▼
┌──────────────────────────────────────────────────────────┐
│  DEV TEAM (Claude Code CLI — local cron, every 1 hour)   │
│  Reads Bug Channel → auto-fixes → pushes to main         │
│  → Work Channel: fix-shipped notices, sprint summaries   │
│  → Server restarts via launchctl kickstart (no hot reload) │
└──────────────────────────────────────────────────────────┘
```
