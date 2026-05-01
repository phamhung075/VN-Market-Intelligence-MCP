# Agent Roster

**Load when:** agent coordination, rewriting agent files, understanding team structure.

## Analysis Team (Claude Cowork — 7 agents)

| # | Agent | File | Role | Cycle |
|---|-------|------|------|-------|
| 0 | Setup | `00-setup-watchlist.md` | Seed watchlist | Once |
| — | Unified Coordinator | `unified-agent.md` | Coordinate + quality review + last-mile check | On-demand + Daily 22:00 VN + Sunday 20:00 VN |
| 1 | News Scout | `01-news-scout.md` | News, sentiment, impact chains, legal/crisis detection | 15 min (market) / 60 min (off) |
| 2 | Financial Analyst | `02-financial-analyst.md` | Collect BCTC status + analyze financials in same cycle | 2x daily (08:00 + 20:00 VN) |
| 4 | Market Watcher | `04-market-watcher.md` | Prices, anomalies, supply chain, climate/energy | 5 min (market) / 2h (off) |
| 5 | Alert Commander | `05-alert-commander.md` | ONLY agent → MARKET channel | 10 min (market) / 30 min (off) |
| 6 | Digest & Predict | `06-digest-predict.md` | Daily/weekly digests + Monday prediction synthesis | Daily 22:30 VN / Monday 07:30 VN / Weekly Sunday / Monthly 1st |
| 7 | QA Responder | `07-qa-responder.md` | Answer /ask queue FIFO → MARKET | Every 12 min via askQueueCheck |

Coordinator: `cowork-workspace-team-claude-desktop/unified-agent.md`

## Dev Team (Claude Code CLI — local cron)

| Agent | File | Role | Model |
|-------|------|------|-------|
| PO | `po.md` | Vision, approves specs, final sign-off | Opus |
| BA | `ba.md` | Requirements, edge cases, blockers | Sonnet |
| Architect | `architect.md` | Brownfield analysis, technical design, risk | Sonnet |
| PM | `pm.md` | Sprint planning, task breakdown, docs/TASKS.md | Sonnet |
| Developer | `developer.md` | TDD implementation, DDD compliance | Sonnet |
| QA / CI-CD | `qa.md` | Test pipeline, merge gate, sprint report | Sonnet |
| Fixer | `fixer.md` | Minimum fixes on changes-requested tasks | Sonnet |
| **Ops** | **`ops.md`** | **VPS health, server restarts, incident response** | **Haiku** |
| Market Analyst | `market-analyst.md` | Investment analysis via MCP tools | Sonnet |
| Idea Forge | `idea-forge.md` | Brainstorm, refine, expand ideas | Sonnet |
| Cowork Refactory Expert | `cowork-refactory-expert.md` | Rewrite/update Cowork agent .md files | Sonnet |
| System Auditor | `system-auditor.md` | Health audit: memory, DB, docs sync, anomaly detection | Sonnet |
| Claude Manager Helper | `claude-manager-helper.md` | Context janitor: CLAUDE.md slim, docs sync, memory hygiene | Sonnet |
| Code Janitor | `code-janitor.md` | DRY auditor cron (every 3h): duplicate ticker maps, hard-coded arrays, magic numbers, schema duplication | Haiku |

Dev team cron workflow:
- **Hourly cycle** (7 min UTC): po → ba → architect → pm → developer → qa → fixer → **ops** (baseline health check, ~30s)
- **Ops invocation:** After QA merge, baseline health check only (observes, does not take action unless escalated)
- **Early exit:** If all systems green + no VPS alerts for 7 days, skip diagnostics (check watchdog log only)

## Stock Classification

Full table → `.claude/knowledge/portfolio-schema.md`

## Agent Cooperation Flow

| Signal | From → To |
|--------|-----------|
| `urgent_news` | News Scout → Market Watcher |
| `chain_catalyst` | News Scout → Financial Analyst + Market Watcher |
| `fundamental_validation` | Financial Analyst → Alert Commander |
| `price_confirmation` / `price_anomaly` | Market Watcher → Alert Commander |
| `verified_chain` | Server synthesizes 2+ confirmations → Alert Commander |
| `send_telegram(market)` | Alert Commander (05) / Digest & Predict (06) / QA Responder (07) → User |
| `submit_feedback` | All agents → BUG channel → Dev Team |
| `send_telegram(work)` | All agents → WORK channel → Dev Team |

## Handoff Protocol (Task Context Files)

Every task has a progressive context file at `docs/handoffs/TASK_NNN.md`. Agents append their section as the task flows through the chain.

| Agent | Action | Section written |
|-------|--------|----------------|
| PM | Creates file when task moves to Todo | `[PM] Planning Context` — file paths, layer, deps, acceptance criteria |
| Architect | Appends after brownfield scan (skip if section exists) | `[Architect] Brownfield Findings` — verified paths, decisions, scan clean flag |
| Developer | Appends before notifying QA | `[Developer] Implementation Record` — files modified, tests written, tsc/suite status |
| QA | Appends after review | `[QA] Review Record` — verdict, blocking issues with file+line, confirmed clean files |
| Fixer | Appends after fix | `[Fixer] Fix Record` — fixes applied with file+line, tests added |

**Rule**: Every agent reads `docs/handoffs/TASK_NNN.md` FIRST on startup. Do not re-discover file paths already listed in the handoff.

**Lifecycle**: File deleted when task is archived to `docs/TASKS_ARCHIVE.md`.

## Two-Team Architecture

```
ANALYSIS TEAM (Cowork, 7 agents, cloud)
  → MARKET (TELEGRAM_INFO_MARKET_GROUP_ID)  = user alerts/answers
  → WORK   (TELEGRAM_INFO_WORK_CHANNEL_ID)  = status
  → BUG    (TELEGRAM_REPORT_BUG_CHANNEL_ID) = bugs
        ↓ WORK + BUG
DEV TEAM (Claude Code CLI, local cron, every 1h)
  Reads BUG → auto-fixes → pushes to main
  → WORK: fix-shipped notices, sprint summaries
  → Restart: docker-compose down && docker-compose up -d (no hot reload, deterministic state)
```
