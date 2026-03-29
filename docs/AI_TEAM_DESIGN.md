# AI Team Design — VN Market Intelligence

## Overview

This document describes a team of 6 specialized AI agents running on **Claude Cowork / Claude Schedule**. Each agent connects to the same MCP server (`http://localhost:3000/sse`) and uses its 24 tools to gather, analyze, and share data.

The agents cooperate through **shared SQLite database** — one agent writes, others read. No direct agent-to-agent communication needed. The MCP server is the single source of truth.

```
┌─────────────────────────────────────────────────────┐
│                   MCP Server (:3000)                │
│   24 tools • SQLite • LanceDB • Telegram            │
└────────┬──────┬──────┬──────┬──────┬──────┬─────────┘
         │      │      │      │      │      │
     ┌───┴──┐┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐
     │ News ││BCTC ││Anal-││Market││Alert││Digest│
     │ Bot  ││ Bot ││yzer ││ Bot  ││ Bot ││ Bot  │
     └──────┘└─────┘└─────┘└──────┘└─────┘└──────┘
         ↓      ↓      ↓      ↓      ↓      ↓
     rag_    financial  market_  alerts  Telegram
     analyses reports   summaries        messages
```

## Agent Roster

| # | Agent | Schedule | Role |
|---|-------|----------|------|
| 1 | **News Scout** | Every 15 min (market), 60 min (off) | Fetch news, analyze sentiment, save to RAG |
| 2 | **BCTC Collector** | Daily 20:00 GMT+7 | Check SSC for new financial reports, download PDFs |
| 3 | **Report Analyzer** | Daily 21:00 GMT+7 | Read stored reports, validate, summarize, flag issues |
| 4 | **Market Watcher** | Every 5 min (market hours) | Track prices, detect signals, compute volatility |
| 5 | **Alert Commander** | Every 10 min | Review all data, decide what's urgent, send Telegram |
| 6 | **Digest Writer** | Daily 22:30 + Weekly Sunday 23:00 | Compile summaries, write investment thesis updates |

---

## Agent 1: News Scout

**Mission**: Be the first to know. Fetch all news, classify sentiment, store for other agents.

**MCP Tools Used**:
- `fetch_and_analyze` — fetch from all 5 RSS sources
- `run_impact_chain` — trace causal chain for high-impact news
- `search_similar_context` — check if similar event happened before

**Schedule**:
- Market hours (09:00-15:30 GMT+7): every 15 minutes
- Off hours: every 60 minutes

**Output**:
- Stores analyzed news in `rag_analyses` table (via MCP tools)
- Impact chains stored automatically
- Other agents read this data via `get_analysis_history`

**Cooperation**:
- Market Watcher reads its impact chains to understand WHY a price moved
- Alert Commander checks for high-impact news (score ≥ 8)
- Digest Writer includes top stories in daily summary

---

## Agent 2: BCTC Collector

**Mission**: Never miss a financial report. Check SSC portal daily, download everything.

**MCP Tools Used**:
- `fetch_ssc_reports` — search and download BCTC from SSC portal
- `get_watchlist` — get list of stocks to check
- `send_test_telegram` — notify when new report found

**Schedule**:
- Daily at 20:00 GMT+7 (after market close, when SSC publishes)
- Extra check at 08:00 GMT+7 (catch overnight publications)

**Output**:
- New reports stored in `financial_reports` table
- PDF text extracted and stored
- Telegram notification: "📄 New BCTC: VCB Q4 2025 published on SSC"

**Cooperation**:
- Report Analyzer picks up new reports and validates them
- Alert Commander checks for critical findings in reports

---

## Agent 3: Report Analyzer

**Mission**: Read every BCTC, find problems, verify numbers, write a summary.

**MCP Tools Used**:
- `get_financial_summary` — read stored report data
- `compare_financials` — QoQ and YoY comparison
- `generate_market_summary` — save analysis results
- `search_similar_context` — find historical context for this company

**Schedule**:
- Daily at 21:00 GMT+7 (1 hour after BCTC Collector)
- On-demand when BCTC Collector flags a new report

**Output**:
- Validation results (accounting identity check, magnitude issues)
- Plain-language summary per stock
- QoQ/YoY delta analysis
- Flags: "⚠️ VCB: Debt-to-equity ratio jumped from 8.2 to 11.5 — investigate"

**Cooperation**:
- Reads data deposited by BCTC Collector
- Alert Commander reads its flags for urgent issues
- Digest Writer includes its summaries in weekly/monthly reports

---

## Agent 4: Market Watcher

**Mission**: Track every price tick. Detect anomalies before anyone else.

**MCP Tools Used**:
- `get_market_snapshot` — live prices for VNM, FPT, VCB, VEA
- `get_macro_snapshot` — commodity prices, SBV rates
- `get_patterns` — historical precedents for this stock + event
- `get_analysis_history` — recent news context (from News Scout)

**Schedule**:
- Market hours (09:00-15:30 GMT+7): every 5 minutes
- Pre-market (07:00-09:00): every 15 minutes
- Post-market (15:30-18:00): every 30 minutes

**Output**:
- Price snapshots stored in `market_prices` + `market_prices_history`
- Volatility calculations stored
- Signals detected: price_drop, price_surge, volume_spike

**Cooperation**:
- News Scout's impact chains explain WHY a move happened
- Alert Commander reads its signals to decide alert severity
- Digest Writer uses its data for performance tables

---

## Agent 5: Alert Commander

**Mission**: Be the gatekeeper. Only alert the user for things that truly matter.

**MCP Tools Used**:
- `get_alerts` — review all pending alerts
- `get_error_summary` — check system health before alerting
- `get_analysis_history` — recent context
- `get_market_snapshot` — current prices for alert context
- `send_test_telegram` — send formatted alert to user

**Schedule**:
- Every 10 minutes during market hours
- Every 30 minutes off hours

**Decision Logic**:
```
IF new alert severity = CRITICAL → send immediately
IF new alert severity = HIGH → check context:
   - Is this a duplicate? (cooldown 30 min) → skip
   - Is this confirmed by multiple sources? → send with confidence
   - Is this a single-source signal? → wait 15 min, recheck
IF new alert severity = MEDIUM → include in next digest, don't alert
IF system health has errors → send system alert: "⚠️ MCP tool failing"
```

**Telegram Message Formats**:

Price alert:
```
🔴 VCB -5.2% (90,500 → 85,800 VND)
Volume: 3.2× average (spike)
Context: SBV raised refinancing rate +25bp
Confidence: 85% | 3 sources confirm
```

New report alert:
```
📄 New BCTC: FPT Q4 2025
Revenue: 15,200 tỷ VND (+18% YoY)
Net Profit: 2,100 tỷ VND (+22% YoY)
⚠️ D/E ratio: 1.8 → 2.3 (watch)
```

Opportunity alert:
```
🟢 VNM: Oversold signal
Price: 72,000 VND (-8.5% this week)
RSI-equivalent: below 2σ threshold
Historical: 3 similar drops → +12% avg recovery in 10 days
```

System alert:
```
⚙️ System: SSC scraper circuit breaker OPEN
5 consecutive failures since 20:15
Other sources: all operational
Action: will retry in 5 minutes
```

**Cooperation**:
- Reads ALL data from all other agents
- Is the ONLY agent that sends Telegram (prevents duplicate alerts)
- Checks system health before each cycle

---

## Agent 6: Digest Writer

**Mission**: Compile everything into readable summaries at multiple timeframes.

**MCP Tools Used**:
- `generate_market_summary` — create daily/weekly/monthly/quarterly/yearly summaries
- `get_market_summary` — read previous summaries for trend comparison
- `get_analysis_history` — recent analyses for context
- `get_financial_summary` — BCTC data for stock sections
- `send_test_telegram` — send digest to user

**Schedule**:
- Daily at 22:30 GMT+7
- Weekly on Sunday at 23:00 GMT+7
- Monthly on 1st at 00:30 GMT+7
- Quarterly on 1st of Jan/Apr/Jul/Oct at 01:00 GMT+7

**Telegram Digest Format**:

Daily:
```
📊 VN Market Daily — 29/03/2026

VN-Index: 1,285 (+0.42%)
Brent: $87.50 | Gold: $2,340 | USD/VND: 25,200

Your Stocks:
  VNM  72,000 ▼ -1.2%  (retail weakness)
  FPT  95,500 ▲ +2.1%  (FDI tech news)
  VCB  90,500 ● +0.3%  (stable)
  VEA  18,200 ▼ -0.8%  (oil pressure)

Top Events:
1. Fed signals pause — banking sector positive
2. Xung đột Trung Đông — oil/aviation impact
3. VPBank capital raise — banking sector watch

Alerts: 2 (1 high, 1 medium)
New Reports: FPT Q4 2025 published

Tomorrow Watch: VCB earnings call, SBV rate decision
```

**Cooperation**:
- Reads everything from all agents
- References previous digests for trend context
- Sends via Telegram as the final daily touchpoint

---

## Data Flow Between Agents

```
News Scout  ──→ rag_analyses ──→ Alert Commander ──→ Telegram
                     ↓                   ↑
Market Watcher ──→ market_prices ────────┘
                     ↓                   ↑
BCTC Collector ──→ financial_reports ────┘
                     ↓                   ↑
Report Analyzer ──→ market_summaries ────┘
                     ↓
Digest Writer  ──→ market_summaries ──→ Telegram
```

All agents write to SQLite via MCP tools. No direct agent-to-agent messaging needed.

---

## Error Recovery

| Scenario | Response |
|----------|----------|
| News Scout fails | Alert Commander detects via `get_error_summary`, sends system alert |
| BCTC Collector fails | Report Analyzer has nothing new to process — no harm, retry tomorrow |
| Market Watcher fails | Alert Commander can't detect price signals — sends system alert |
| Alert Commander fails | Other agents keep storing data — alerts delayed but data preserved |
| MCP server down | All agents get connection errors — each has retry logic in prompt |
| Telegram down | Alerts queued in `alerts` table — delivered when reconnected |

---

## Setup Instructions

1. Start MCP server: `bun run src/index.ts`
2. Create each agent in Claude Cowork/Schedule using the prompts in `schedules/` directory
3. Each agent needs MCP connection: `http://localhost:3000/sse`
4. Verify: each agent should be able to call `get_system_health` on first run
