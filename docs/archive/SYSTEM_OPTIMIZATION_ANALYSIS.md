# System Optimization Analysis — VN Market Intelligence MCP

**Date**: 2026-04-02
**Scope**: Communication architecture + MCP tool audit
**Baseline**: Sprint 035b — 64 tools, 7 analysis agents, 1 dev team cron

---

## Table of Contents

1. [Current Communication Architecture](#1-current-communication-architecture)
2. [Communication Gap Analysis](#2-communication-gap-analysis)
3. [MCP Tool Audit](#3-mcp-tool-audit)
4. [Tool Usage Matrix](#4-tool-usage-matrix)
5. [Optimization Proposals](#5-optimization-proposals)
6. [Implementation Roadmap](#6-implementation-roadmap)

---

## 1. Current Communication Architecture

### 1.1 Three Parties

| Party | Platform | Location | Schedule |
|-------|----------|----------|----------|
| **User** | Telegram + Claude Desktop | France (CET/CEST) | On-demand |
| **Analysis Team** | Claude Cowork (cloud) | 7 agents on `zenmidi.com/mcp` | 5min–2h cycles |
| **Dev Team** | Claude Code CLI (local) | Local cron | Every 1 hour |

### 1.2 Communication Channels

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          USER (France, CET)                               │
│                                                                           │
│  RECEIVES (Chat Channel):           SENDS (Chat Channel):                │
│    ← Alerts (Alert Commander)         → /watchlist /price /alerts         │
│    ← Briefings (08:00 VN)            → /briefing /health /pnl /help     │
│    ← Digests (22:30 VN)              → Gets instant SQLite reply         │
│    ← Fix summaries (Dev Team)                                             │
│    ← "Refresh agents" notices        SENDS (Claude Desktop/Cowork):      │
│                                        → All 64 MCP tools                 │
│                                        → Natural language to agents       │
└──────────┬───────────────────────────────────────────┬────────────────────┘
           │ Chat Channel                               │ Report Channel
           │ (TELEGRAM_CHAT_ID)                         │ (TELEGRAM_REPORT_ID)
           ▼                                            ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────────┐
│  ANALYSIS TEAM (7 agents)       │   │  DEV TEAM (Claude Code CLI)          │
│                                 │   │                                      │
│  WRITES Chat Channel:           │   │  READS Report Channel:               │
│    Alert Commander ONLY:        │   │    read_telegram_reports(status=new)  │
│    • Alerts (max 10/day)        │   │    → triage: FIX/SPRINT/MONITOR      │
│    • Digests, briefings         │   │                                      │
│    • System status              │   │  WRITES Chat Channel:                │
│                                 │   │    • Fix summaries                   │
│  WRITES Report Channel:         │   │    • Sprint completions              │
│    All agents via submit_feedback│   │    • Agent file update notices      │
│    • cascade_rule_gap           │   │                                      │
│    • alert_quality              │   │  WRITES Codebase:                    │
│    • threshold_issue            │   │    • src/** (fixes, features)        │
│    • data_extraction_error      │   │    • CLAUDE.md, TASKS.md             │
│    • trade_map_gap              │   │    • cowork-*/*.md (agent prompts)   │
│    • performance_issue          │   │    • git push main                   │
│                                 │   │                                      │
│  READS: SQLite + LanceDB       │   │  READS: telegram_reports table       │
│    via 64 MCP tools             │   │    via 5 MCP tools                   │
└─────────────────────────────────┘   └──────────────────────────────────────┘
```

### 1.3 Channel 3: Shared Database (Silent Backbone)

All parties read/write to the **same SQLite + LanceDB** databases. This is the de facto inter-agent communication layer:

| Writer | What | Reader |
|--------|------|--------|
| Intelligence cycle (cron) | `market_prices`, `rag_analyses` | All analysis agents |
| News Scout (via `fetch_and_analyze`) | `rag_analyses`, LanceDB vectors | Market Watcher, Alert Commander, Digest Writer |
| Alert pipeline | `alerts` table | Alert Commander, Digest Writer, User (/alerts) |
| Dev Team | Code changes (hot-reload) | All agents (behavior changes on next cycle) |
| User (Claude Desktop) | `positions`, `watchlist`, `price_alerts` | All analysis agents |

### 1.4 Telegram Bot Commands (User → Server)

| Command | What it does | Data source |
|---------|-------------|-------------|
| `/watchlist` | List stocks + prices | watchlist + market_prices (SQLite) |
| `/price VCB` | Single stock price | market_prices (SQLite) |
| `/alerts` | Last 5 alerts | alerts (SQLite) |
| `/briefing` | Condensed briefing | rag_analyses + market_prices + alerts (SQLite) |
| `/health` | System status | uptime + row counts (SQLite) |
| `/pnl` | Portfolio P&L | positions + market_prices (SQLite) |
| `/help` | List commands | Static text |

**Key limitation**: All commands return raw SQLite queries — no AI reasoning, no analysis, no recommendations.

---

## 2. Communication Gap Analysis

### Gap 1: User → Analysis Team (Weak — No AI from Telegram)

**Scenario**: User at 14:00 CET (20:00 VN) sends `/briefing`. Gets 10 lines of raw data: 3 news titles, 4 prices, 2 alerts. No reasoning like "HPG dropped 2.1% because China steel demand news was negative." No recommendation on action. To get AI analysis, user must open Claude Desktop or Cowork.

**Root cause**: `handleBriefing()` in `telegramCommands.ts` is a pure SQL function. The webhook handler has no path to AI reasoning — cannot call MCP tools or LLM.

**Impact**: User cannot interact with the intelligence system from mobile Telegram during market hours.

### Gap 2: Dev Team → Analysis Team (Nonexistent)

**Scenario**: News Scout reports "cascade rule gap — no rule for Vietnam steel tariff news." Dev Team reads it, fixes `cascadeEngine.ts`, pushes to main, sends user a Telegram: "Fix applied." But News Scout's Cowork session is still open. On next cycle, same analysis, same gap detected, same feedback submitted — creating a report loop.

**Root cause**: No acknowledgment channel from Dev Team back to analysis agents. Agents only see DB state and MCP tool output — no way to know a code change happened.

**Impact**: Duplicate feedback noise. Dev Team wastes time re-triaging already-fixed issues.

### Gap 3: User → Dev Team (Indirect)

**Scenario**: User notices morning briefing is missing the commodity section — clearly a bug. Options: (a) write a message in Report Channel manually (must know the format), (b) open Cowork, tell an agent, have agent submit_feedback — 3 hops and 5 minutes. No `/report` or `/fix` Telegram command exists.

**Root cause**: `telegramCommands.ts` has no path to `agent_feedback` table or Report Channel.

**Impact**: User-noticed bugs take the longest path to reach the Dev Team.

### Gap 4: Analysis Agents Cannot Talk to Each Other

**Scenario**: News Scout processes "Vietnam imposes anti-dumping duty on Chinese steel" — HIGH impact for HPG. Stores analysis in `rag_analyses`. 10 minutes later, Market Watcher runs its cycle, pulls HPG price (flat). Market Watcher has no context that News Scout already flagged this. Alert Commander fires without cross-validated news + price context. Conviction score has less input than it could.

**Root cause**: Agents share state only through DB reads on their own independent schedules. No signal mechanism to say "something urgent happened — check this stock now."

**Impact**: Multi-signal conviction scoring is weaker than it should be. Agents duplicate analysis effort.

### Gap 5: Unified Agent Overlaps with Dev Team

**Scenario**: Both `unified-agent.md` and `dev-team-cron.md` say "Call `read_telegram_reports` to get unprocessed reports." If both active at 22:00 VN — unified-agent's daily review coincides with Dev Team cron. Both could call `process_telegram_report(id)` on the same report. First one marks it processed, second silently skips it. Worse: unified-agent may classify as "SPRINT TASK" while Dev Team simultaneously starts fixing as "FIX NOW."

**Root cause**: No ownership lock on reports. The boundary "unified-agent triages, dev team acts" is defined only in prompt prose — not enforced by the data model.

**Impact**: Race condition. Reports can be double-processed, or processed with conflicting triage decisions.

---

## 3. MCP Tool Audit

### 3.1 Complete Tool Inventory (64 tools)

#### Watchlist Management (4 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 1 | `add_to_watchlist` | code, exchange, domain?, notes?, thresholds? | User only (Setup agent) |
| 2 | `remove_from_watchlist` | code | User only |
| 3 | `get_watchlist` | — | All 7 agents |
| 4 | `update_thresholds` | code, thresholds | User only |

#### Financial Reports (5 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 5 | `fetch_ssc_reports` | code, year, quarter | **FORBIDDEN** for agents (Puppeteer, heavy) |
| 6 | `get_financial_summary` | code, year?, quarter? | BCTC Collector, Report Analyzer |
| 7 | `compare_financials` | code, period1, period2 | Report Analyzer, Digest Writer |
| 8 | `list_stored_pdfs` | — | BCTC Collector, Report Analyzer (rarely) |
| 9 | `read_bctc_pdf` | filename, maxChars? | Report Analyzer (only if needed) |

#### Alerts — Core (3 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 10 | `get_alerts` | severity?, unreadOnly?, code?, limitDays?, limit? | Market Watcher, Alert Commander, Digest Writer, Unified Agent |
| 11 | `mark_alert_read` | alertId?, note? | Alert Commander |
| 12 | `run_daily_briefing` | — | **No agent calls it** — cron only |

#### Analysis (4 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 13 | `get_analysis_history` | code?, domain?, level?, fromDate?, toDate?, limit? | News Scout, Report Analyzer, Market Watcher, Alert Commander, Digest Writer, Unified Agent |
| 14 | `fetch_and_analyze` | sources[]?, limit? | News Scout |
| 15 | `run_impact_chain` | newsText, includeWatchlist? | News Scout |
| 16 | `search_similar_context` | query, level?, code?, k? | News Scout |

#### Market Data (2 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 17 | `get_market_snapshot` | codes[]? | Market Watcher, Alert Commander, Digest Writer, Unified Agent |
| 18 | `get_patterns` | stockCode, eventKeyword, lookbackHours? | Market Watcher |

#### Macro (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 19 | `get_macro_snapshot` | — | Market Watcher, Digest Writer, Unified Agent |

#### Telegram (4 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 20 | `send_test_telegram` | message? | Alert Commander, BCTC Collector, Digest Writer, Dev Team |
| 21 | `send_telegram_report` | message, to?, from? | Any agent (to Report Channel) |
| 22 | `delete_telegram_report` | message_id | Dev Team only (internal cleanup) |
| 23 | `send_alert_digest` | sendTelegram? | Alert Commander (nightly), cron |

#### Summaries (2 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 24 | `get_market_summary` | period, date? | Report Analyzer, Digest Writer |
| 25 | `generate_market_summary` | period, date? | Report Analyzer, Digest Writer |

#### System Diagnostics (4 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 26 | `get_system_health` | — | Alert Commander, Unified Agent, Dev Team |
| 27 | `get_global_log` | lines? | **No agent uses it** |
| 28 | `get_tool_log` | tool, lines? | Unified Agent (weekly rotation only) |
| 29 | `get_error_summary` | lines? | News Scout, BCTC Collector, Alert Commander, Unified Agent |

#### Portfolio (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 30 | `get_portfolio_conviction` | — | Digest Writer, Unified Agent |

#### Feedback (2 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 31 | `submit_feedback` | agent, category, title, detail?, priority?, to? | All 7 agents |
| 32 | `get_feedback` | status?, limit? | **Deprecated** — returns nothing useful |

#### Prediction Markets (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 33 | `get_prediction_markets` | filter?, limit? | News Scout, Unified Agent |

#### Alert Trigger (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 34 | `trigger_alert_check` | code? | Market Watcher, Alert Commander |

#### Price History (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 35 | `get_price_history` | code, days? | Market Watcher |

#### Positions (3 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 36 | `set_position` | code, shares, avgPrice, notes? | User only |
| 37 | `get_positions` | — | Market Watcher, Unified Agent |
| 38 | `close_position` | code | User only |

#### Portfolio Risk (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 39 | `get_portfolio_risk` | days? | Market Watcher, Digest Writer, Unified Agent |

#### Alert Accuracy (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 40 | `get_alert_accuracy` | code?, days? | Alert Commander (weekly), Digest Writer, Unified Agent |

#### Search (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 41 | `search_stocks` | query, limit? | **No agent references it** |

#### Data Freshness (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 42 | `get_data_freshness` | — | BCTC Collector, Unified Agent |

#### Sector Rotation (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 43 | `get_sector_rotation` | — | Market Watcher, Digest Writer |

#### Earnings Calendar (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 44 | `get_earnings_calendar` | — | BCTC Collector, Digest Writer |

#### Correlation (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 45 | `get_correlation_matrix` | codes?, days? | Market Watcher (weekly), Digest Writer, Unified Agent |

#### Export (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 46 | `export_portfolio_snapshot` | — | Digest Writer (weekly) |

#### Performance (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 47 | `get_performance_attribution` | days?, signalType? | Digest Writer, Unified Agent |

#### Rebalancing (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 48 | `get_rebalancing_signals` | targets? | Market Watcher (weekly), Digest Writer, Unified Agent |

#### Price Alerts (3 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 49 | `set_price_alert` | code, alertType, threshold, notes? | User only |
| 50 | `get_price_alerts` | statusFilter? | Alert Commander |
| 51 | `delete_price_alert` | alertId | Alert Commander (after trigger) |

#### Rate Limit (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 52 | `get_rate_limit_status` | — | News Scout, Unified Agent |

#### Source Health (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 53 | `get_source_health` | — | News Scout, Unified Agent |

#### Compare (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 54 | `compare_stocks` | codes[] | Report Analyzer, Market Watcher, Alert Commander |

#### Custom Alert Rules (3 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 55 | `add_alert_rule` | code, predicate, threshold, notes? | User only (config action) |
| 56 | `list_alert_rules` | — | Alert Commander (read-only) |
| 57 | `delete_alert_rule` | id | User only (config action) |

#### Alert Mute (2 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 58 | `mute_stock_alerts` | code, hours?, reason? | Market Watcher, Alert Commander |
| 59 | `unmute_stock_alerts` | code | Market Watcher, Alert Commander |

#### Target Allocation (2 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 60 | `set_target_allocation` | targets (dict) | User only (config action) |
| 61 | `get_target_allocation` | — | Market Watcher, Unified Agent |

#### Sentiment (1 tool)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 62 | `get_sentiment_trend` | stock_code, window_days? | Report Analyzer, Market Watcher, Alert Commander, Digest Writer, Unified Agent |

#### Telegram Reports (2 tools)
| # | Tool | Params | Used by |
|---|------|--------|---------|
| 63 | `read_telegram_reports` | status?, limit? | Unified Agent, Dev Team |
| 64 | `process_telegram_report` | id, delete_telegram_message? | Dev Team |

### 3.2 Tool Classification Summary

| Category | Count | Notes |
|----------|-------|-------|
| Used by multiple agents | 28 | Core intelligence tools |
| User-only (config/mutation) | 12 | add/remove/set/close/delete actions |
| Single-agent use | 14 | Specialist tools |
| Dead/deprecated/forbidden | 5 | Should not be in MCP |
| Operational triggers | 3 | Should be internal-only |
| Overlapping with other tools | 5+ | Merge candidates |

---

## 4. Tool Usage Matrix

Tools per agent (current state):

| Agent | Tool Count | Cycle Frequency | Tools/Day (est.) |
|-------|-----------|-----------------|-------------------|
| News Scout | 12 | Every 15-60 min | ~100-200 calls |
| BCTC Collector | 10 | 2x daily | ~20 calls |
| Report Analyzer | 13 | 2x daily | ~26 calls |
| Market Watcher | 22 | Every 5-120 min | ~200-400 calls |
| Alert Commander | 23 | Every 10-30 min | ~150-300 calls |
| Digest Writer | 22 | Daily + weekly | ~22-44 calls |
| Unified Agent | 23 | Daily + weekly | ~23-46 calls |
| Dev Team | 5 | Hourly | ~5-120 calls |

**Common opening sequence** (5 tools, every cycle, every agent):
```
get_watchlist → get_market_snapshot → get_macro_snapshot → get_alerts → get_analysis_history
```

**Estimated daily MCP tool calls**: 500-1100 calls across all agents.

---

## 5. Optimization Proposals

### 5.1 Communication Gap Fixes

#### Fix G1: `/ask` Command — AI-Powered Telegram Responses

| Field | Value |
|-------|-------|
| **Gap** | 1 — User → Analysis Team (no AI from Telegram) |
| **Solution** | New `user_requests` SQLite table. New `/ask` and `/why` Telegram commands that queue questions. Intelligence cycle Step F picks them up, runs `runImpactChain` + `searchSimilarContext`, pushes AI answer to Chat Channel within 15 min. |
| **New table** | `user_requests` (id, command, payload, status, response, created_at, answered_at) |
| **Files** | `schema.ts`, `telegramCommands.ts`, `intelligenceCycleJob.ts` |
| **Effort** | Medium (~80 lines) |

#### Fix G2: System Changelog — Dev Team → Analysis Team Feedback Loop

| Field | Value |
|-------|-------|
| **Gap** | 2 — Dev Team → Analysis Team (nonexistent) |
| **Solution** | New `system_changelog` table. New `get_recent_fixes` + `log_fix` MCP tools. Dev Team writes changelog after every fix. All agents read it before reporting to avoid duplicates. |
| **New table** | `system_changelog` (id, fix_type, title, detail, files, commit_hash, fixed_at, related_feedback_id) |
| **New tools** | `get_recent_fixes`, `log_fix` (+2 tools) |
| **Files** | `schema.ts`, new `changelogTools.ts`, `server.ts`, `dev-team-cron.md`, all 6 agent `.md` files |
| **Effort** | Medium (~60 lines code + prompt updates) |

#### Fix G3: `/report` Command — User → Dev Team Direct Path

| Field | Value |
|-------|-------|
| **Gap** | 3 — User → Dev Team (indirect) |
| **Solution** | New `/report` and `/fix` Telegram commands that write directly to `agent_feedback` table with `agent='user-telegram'` and forward to Report Channel. Dev Team auto-escalates `user-telegram` reports to high priority. |
| **New table** | None (uses existing `agent_feedback`) |
| **Files** | `telegramCommands.ts`, `dev-team-cron.md` |
| **Effort** | Low (~40 lines) |

#### Fix G4: Agent Signal Bus — Inter-Agent Communication

| Field | Value |
|-------|-------|
| **Gap** | 4 — Agents can't talk to each other |
| **Solution** | New `agent_signals` table as a lightweight message bus. New `post_agent_signal` + `get_agent_signals` MCP tools. Signal types: `urgent_news`, `price_anomaly`, `cross_validate`, `suppress`. TTL-based expiry. |
| **New table** | `agent_signals` (id, from_agent, to_agent, signal_type, stock_code, payload, status, created_at, expires_at) |
| **New tools** | `post_agent_signal`, `get_agent_signals` (+2 tools) |
| **Files** | `schema.ts`, new `agentSignalTools.ts`, `server.ts`, `01-news-scout.md`, `04-market-watcher.md`, `05-alert-commander.md` |
| **Effort** | Medium (~100 lines code + prompt updates) |

#### Fix G5: Report Ownership — Claim Lock

| Field | Value |
|-------|-------|
| **Gap** | 5 — Unified Agent overlaps with Dev Team |
| **Solution** | Add `claimed_by` + `claimed_at` columns to `telegram_reports`. New `claim_telegram_report` MCP tool with atomic `UPDATE WHERE claimed_by IS NULL`. First to claim wins, other skips. |
| **New columns** | `telegram_reports.claimed_by`, `telegram_reports.claimed_at` |
| **New tool** | `claim_telegram_report` (+1 tool) |
| **Files** | `schema.ts`, `telegramReportTools.ts`, `server.ts`, `unified-agent.md`, `dev-team-cron.md` |
| **Effort** | Low (~50 lines) |

### 5.2 Tool Removals

#### R1: Dead Tools — Remove from MCP (5 tools)

| Tool | Reason |
|------|--------|
| `get_feedback` (#32) | Deprecated, returns nothing useful |
| `get_global_log` (#27) | No agent uses it — developer-only action |
| `get_tool_log` (#28) | Only unified-agent weekly rotation; `get_error_summary` covers the signal |
| `run_daily_briefing` (#12) | No agent calls it — cron calls the function directly in code |
| `search_stocks` (#41) | Zero agent references; `get_watchlist` provides codes |

**Action**: Remove registrations from `server.ts`. Keep underlying functions for internal use.

#### R2: Forbidden/Internal-Only Tools — Remove from MCP (3 tools)

| Tool | Reason |
|------|--------|
| `fetch_ssc_reports` (#5) | Explicitly FORBIDDEN in agent prompts — Puppeteer, blocks server |
| `trigger_alert_check` (#34) | Intelligence cycle already does this every 15 min; redundant when called by agents inside the cycle |
| `export_portfolio_snapshot` (#46) | Weekly file dump to disk — dev/user action, not analysis |

**Action**: Remove from MCP. `fetch_ssc_reports` → add Telegram `/ssc` command instead. `trigger_alert_check` → keep as internal function. `export_portfolio_snapshot` → add Telegram `/export` command.

#### R3: User-Only Mutation Tools — Remove from Agent Surface (4 tools)

| Tool | Reason | Keep for |
|------|--------|----------|
| `add_alert_rule` (#55) | Config action, no agent should create rules | User via Claude Desktop or Telegram `/rule add` |
| `delete_alert_rule` (#57) | Config action | User via Claude Desktop or Telegram `/rule del` |
| `set_target_allocation` (#60) | Portfolio config, human decision | User via Claude Desktop or Telegram `/alloc` |
| `delete_price_alert` (#51) | Cleanup action after trigger | Alert Commander only — consider internalizing |

**Action**: Either remove from MCP entirely (expose via Telegram commands) or implement agent-scoped tool visibility (future).

### 5.3 Tool Merges

#### M1: System Health Consolidation (4 → 1)

| Merge | Into |
|-------|------|
| `get_system_health` (#26) | → `get_system_status` |
| `get_source_health` (#53) | → (sources section) |
| `get_data_freshness` (#42) | → (freshness section) |
| `get_error_summary` (#29) | → (errors section) |

**Output structure**:
```
[DB] WAL size, alert stats, last cycle timestamp, row counts
[SOURCES] per-source: ok/degraded/down, last fetch, fail count
[FRESHNESS] per-source staleness in minutes, stale threshold warnings
[ERRORS] last 5 WARN/ERROR lines
```

**Saves**: 3 tools removed. Agents making 4 calls per cycle → 1 call.

#### M2: Telegram Send Consolidation (3 → 1)

| Merge | Into |
|-------|------|
| `send_test_telegram` (#20) | → `send_telegram(channel: "chat"\|"report", message)` |
| `send_telegram_report` (#21) | → (same, channel="report") |
| `delete_telegram_report` (#22) | → Absorbed into `process_telegram_report` logic |

**Saves**: 2 tools removed. Eliminates 3-way channel routing confusion.

#### M3: Mute Pair Collapse (2 → 1)

| Merge | Into |
|-------|------|
| `mute_stock_alerts` (#58) | → `manage_alert_mute(code, action: "mute"\|"unmute", hours?, reason?)` |
| `unmute_stock_alerts` (#59) | → (same) |

**Saves**: 1 tool removed.

#### M4: Alert Read Merge (2 → 1)

| Merge | Into |
|-------|------|
| `get_alerts` (#10) | → `get_alerts(type: "system"\|"price"\|"all", ...)` |
| `get_price_alerts` (#50) | → (same, type="price") |

**Saves**: 1 tool removed. Alert Commander drops from 5 alert-read tools to 3.

### 5.4 New Compound Tools

#### C1: `get_market_context` — Start-of-Cycle Bundle

**Problem**: Every agent opens with the same 5 calls:
```
get_watchlist → get_market_snapshot → get_macro_snapshot → get_alerts(unresolved) → get_analysis_history(recent)
```

**Solution**: One compound read tool returns all of it:
```json
{
  "watchlist": [{ "code": "VNM", "exchange": "HOSE", ... }],
  "prices": { "VNM": { "price": 72500, "change_pct": -1.2 }, ... },
  "macro": { "brent": 82.5, "gold": 3150, "usd_vnd": 25320 },
  "open_alerts": [{ "id": 42, "severity": "HIGH", ... }],
  "recent_analysis": [{ "title": "...", "impact_score": 8, ... }],
  "system_status": "ok"
}
```

**Impact**: 5 calls → 1 call per agent cycle. At 7 agents × multiple cycles/day = hundreds of saved tool calls daily.

#### C2: `get_bctc_full` — Financial Deep Dive Bundle

**Problem**: Report Analyzer's standard workflow: `get_financial_summary` → `compare_financials` → `get_sentiment_trend` = 3 calls for one stock.

**Solution**: `get_bctc_full(code, period?)` returns summary + comparison + sentiment in one call.

**Impact**: Report Analyzer: 3 calls → 1 per stock. Also useful for Digest Writer monthly reviews.

### 5.5 Agent Prompt Scoping

After all merges/removals, recommended tool visibility per agent:

| Agent | Current | Proposed | Removed from view |
|-------|---------|----------|-------------------|
| **News Scout** | 12 | 8 | Dead tools, health merge, telegram merge |
| **BCTC Collector** | 10 | 7 | Dead tools, health merge |
| **Report Analyzer** | 13 | 9 | Dead tools, BCTC compound replaces 3 |
| **Market Watcher** | 22 | 13 | Remove: portfolio_risk, correlation, rebalancing, set_target_allocation, mute (→ Alert Commander) |
| **Alert Commander** | 23 | 16 | Dead tools, health merge, alert merge, CRUD removal |
| **Digest Writer** | 22 | 16 | Dead tools, health merge, compound tools |
| **Unified Agent** | 23 | 14 | Dead tools, health merge, compound tools |
| **Dev Team** | 5 | 6 | +log_fix (for changelog) |

---

## 6. Implementation Roadmap

### Tier 1 — Zero-Risk Removals (Sprint 036a, 1-2 hours)

| # | Action | Tools affected | Risk |
|---|--------|---------------|------|
| 1 | Remove `get_feedback` from MCP | -1 | None |
| 2 | Remove `get_global_log` from MCP | -1 | None |
| 3 | Remove `get_tool_log` from MCP | -1 | None (keep internal) |
| 4 | Remove `run_daily_briefing` from MCP | -1 | None (cron calls directly) |
| 5 | Remove `search_stocks` from MCP | -1 | None (no agent uses it) |
| 6 | Remove `fetch_ssc_reports` from MCP | -1 | None (already forbidden) |
| 7 | Remove `trigger_alert_check` from MCP | -1 | Low (keep internal function) |
| 8 | Remove `export_portfolio_snapshot` from MCP | -1 | Low (add Telegram cmd later) |

**Result**: 64 → 56 tools. All agent prompts shrink.

### Tier 2 — Communication Fixes + Merges (Sprint 036b, 1 sprint)

| # | Action | Net tool change |
|---|--------|----------------|
| 9 | Fix G5: `claim_telegram_report` + columns | +1 |
| 10 | Fix G3: `/report` + `/fix` Telegram commands | 0 |
| 11 | Fix G2: `system_changelog` + `get_recent_fixes` + `log_fix` | +2 |
| 12 | Merge M1: system health 4→1 (`get_system_status`) | -3 |
| 13 | Merge M2: telegram send 3→1 (`send_telegram`) | -2 |
| 14 | Merge M3: mute 2→1 (`manage_alert_mute`) | -1 |

**Result**: 56 → 53 tools. Communication gaps 2, 3, 5 fixed. Health and telegram tools consolidated.

### Tier 3 — Compound Tools (Sprint 037)

| # | Action | Net tool change |
|---|--------|----------------|
| 15 | Add C1: `get_market_context` compound tool | +1 |
| 16 | Add C2: `get_bctc_full` compound tool | +1 |
| 17 | Fix G1: `/ask` + `/why` + `user_requests` table | 0 |
| 18 | Merge M4: alert read merge (get_alerts absorbs get_price_alerts) | -1 |
| 19 | Remove user-only mutation tools from MCP (add_alert_rule, delete_alert_rule, set_target_allocation) | -3 |

**Result**: 53 → 51 tools. Massive per-cycle call reduction from compound tools.

### Tier 4 — Agent Signal Bus (Sprint 038+)

| # | Action | Net tool change |
|---|--------|----------------|
| 20 | Fix G4: `agent_signals` table + `post_agent_signal` + `get_agent_signals` | +2 |
| 21 | Agent prompt updates for signal reading/writing | 0 |
| 22 | Future: agent-scoped tool visibility (server filters tools per agent) | 0 |

**Result**: 51 → 53 tools. But with agent scoping, each agent sees only 8-16 tools instead of all 53.

### Final State

| Metric | Before (Sprint 035) | After (Sprint 038) | Change |
|--------|---------------------|---------------------|--------|
| **Total MCP tools** | 64 | ~51 | -20% |
| **Tools visible per agent (avg)** | 18 | 12 | -33% |
| **Tool calls per cycle (avg)** | 8-12 | 3-6 | -50% |
| **Communication gaps** | 5 | 0 | Fixed |
| **Dead/deprecated tools** | 5 | 0 | Cleaned |
| **Telegram commands** | 7 | 11 | +4 new |
| **New tables** | 0 | 4 | user_requests, system_changelog, agent_signals, claimed_by cols |

---

## Appendix: New Telegram Commands (after all tiers)

| Command | Tier | What it does |
|---------|------|-------------|
| `/ask <question>` | 3 | Queue AI analysis, response in <15 min |
| `/why <stock>` | 3 | "Why did VCB move today?" — AI-powered |
| `/report <description>` | 2 | Send bug report directly to Dev Team |
| `/fix <description>` | 2 | Same as /report, high priority |

## Appendix: New SQLite Tables (after all tiers)

| Table | Tier | Purpose |
|-------|------|---------|
| `user_requests` | 3 | Queue for `/ask` and `/why` commands |
| `system_changelog` | 2 | Dev Team fix log, read by agents |
| `agent_signals` | 4 | Inter-agent message bus |
| `telegram_reports.claimed_by` | 2 | Ownership lock (column addition) |
