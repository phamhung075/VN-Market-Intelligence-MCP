---
brief_id: MAW-2026-06-11
title: Market Analyst Workbench — Frontend Redesign
author: architect
date: 2026-06-11
status: DESIGN_COMPLETE
zones:
  - apps/frontend/
  - apps/mcp-server/
  - apps/api-gateway/
build_standard: lean
---

# Market Analyst Workbench — Frontend Redesign

## 1. Context

The frontend at `apps/frontend/` (port 3001) is a Remix + TypeScript + Tailwind app.
All data flows through the api-gateway (:4000) via Remix server-side loaders and
`app/lib/api/client.ts` typed fetchers. No client-side direct API calls.

User profile: non-technical analyst monitoring 30 tickers / 10 sectors from France (GMT+7
market hours). Wants a real decision-support workbench — not an ops/demo UI.

Tool counts and cron counts must never be hardcoded — derive from:
- `docs/data/system-map.json .project.microservices[0].tools | length`
- `docs/data/system-map.json .project.microservices[0].crons | length`

---

## 2. Page-by-Page Verdict

| Route | Current Content | Analyst Value | Verdict |
|---|---|---|---|
| `_index.tsx` (home `/`) | Landing page: gateway status badge + 5 nav links | None (ops skeleton) | Replace: make this the Market Overview home page (P0) |
| `dashboard.analysis.tsx` | Watchlist tiles + KD reading + TA + signals + price chart per stock | CORE analyst page — already has good bones | Enrich (P0): add AI synthesis, foreign flow, news feed, BCTC summary |
| `dashboard.bctc-eval._index.tsx` | BCTC extraction quality scorecard list | Internal dev tool — not for analyst | Keep-as-ops (move to System group) |
| `dashboard.bctc-eval.$reportId.tsx` | Per-PDF extraction quality detail with 6-stage cards | Internal dev tool | Keep-as-ops (move to System group) |
| `dashboard.bctc-inspect.tsx` | Proxied BCTC inspector HTML (full-page raw tool) | Dev/power-user only | Keep-as-ops (move to System group) |
| `dashboard.db.tsx` | VNINDEX price history + Reuters headlines list | Rudimentary — raw data dump | Replace: fold headlines into new News page (P1); drop standalone DB tab |
| `dashboard.fetch.tsx` | Source freshness table + VPS proxy + BCTC pipeline + macro snapshot | Ops-only pipeline health | Keep-as-ops (move to System group) |
| `dashboard.orchestration.tsx` | Dev team task board + signal queue + sprint state | Dev team ops only | Keep-as-ops (move to System group) |
| `dashboard.quality-audit.tsx` | 240-check quality checklist per capability | Dev team ops only | Keep-as-ops (move to System group) |
| `dashboard.services.tsx` | Container health table (9 services, UP/DOWN/DEGRADED) | Ops-only monitoring | Keep-as-ops (move to System group) |
| `dashboard.vps.tsx` | VPS proxy freshness per source (prices/news/sbv/bctc) | Ops-only | Keep-as-ops (move to System group) |

Summary: 1 page to replace at root, 1 analyst page to enrich (the most important one), 6 pure ops pages to collapse into a System group, 1 raw page (db) to retire and fold into analyst views, 2 BCTC analyst pages (bctc-eval + bctc-inspect) kept but moved to a Financial Reports sub-group.

---

## 3. Analytical Data the System Produces but the UI Does NOT Yet Surface

### 3.1 MCP Tools Available (query system-map.json — never hardcode count)

Source: `docs/data/system-map.json .project.microservices[0].tools`

Key analytical tool categories NOT yet surfaced in the frontend:

**Market Intelligence (served via mcp-server, already reachable via api-gateway):**
- `get_market_snapshot` — VNINDEX level + delta, breadth, regime
- `get_market_summary` / `generate_market_summary` — narrative synthesis
- `get_market_hexagram` / `get_kinhdich_reading` / `get_hexagram_history` — kinh dich per stock and market
- `get_technical_indicators` — RSI, MACD, Bollinger per ticker
- `get_price_history` — OHLCV history (partially surfaced — extend to more tickers)
- `get_foreign_flow` — foreign buy/sell flow per ticker and aggregate
- `get_sector_comparison` / `get_sector_rotation` — sector relative performance
- `get_correlation_matrix` — cross-ticker correlation
- `get_patterns` — detected chart patterns

**AI Agent Outputs (UNTAPPED — currently only on Telegram/docs):**
- `get_agent_signals` — news-scout + market-watcher + alert-commander signals with direction + confidence + accuracy
- `get_alerts` / `list_alert_rules` / `get_alert_accuracy` — live alerts with outcome history
- `get_calibration_report` — weekly Brier score / prediction accuracy per signal type
- `get_prediction_accuracy` / `get_prediction_markets` — forecast accuracy stats
- `get_portfolio_conviction` — unified-agent per-ticker conviction with hexagram
- `get_cascade_metrics` / `get_cascade_outcomes` — macro→sector→stock impact chains
- `get_signal_effectiveness` — per-signal-type accuracy over time
- `get_accuracy_context` / `get_label_accuracy_report` — full accuracy ledger

**Macro & Regime (partially surfaced — needs enrichment):**
- `get_macro_snapshot` — oil/gold/usdvnd/carry/yield snapshot (currently surfaced, needs direction+delta framing)
- `get_macro_calendar` — upcoming macro events
- `get_investment_clock_phase` — investment clock current phase
- `get_imf_signals` — IMF economic indicators
- `get_fed_liquidity_spread` / `get_yield_spread_signal` — FED/credit signals
- `get_carry_trade_signal` — carry trade indicator
- `get_credit_flow_signal` — credit flow signal
- `get_policy_signals` — government policy signals (SBV rate, fiscal)
- `get_transition_probabilities` — regime transition probabilities
- `get_ism_subcomponents` — ISM manufacturing sub-components

**Financials / BCTC (partially surfaced via bctc-eval, needs analyst integration):**
- `get_financial_summary` / `get_bctc_full` — financial statements per ticker
- `get_cash_flow` / `get_bctc_ocf` — operating cash flow analysis
- `compare_financials` / `compare_stocks` — cross-ticker fundamental comparison
- `get_earnings_calendar` — upcoming earnings dates
- `get_broker_credibility` / `get_insider_signals` / `get_insider_transactions` — insider/broker signals
- `get_bond_maturity_calendar` — bond maturity schedule
- `get_public_contracts` — government procurement signals (via muasamcong VPS source)

**News & Sentiment (NOT surfaced at all):**
- `get_market_message_digest` / `get_unreviewed_market_messages` — CHEF Telegram dish digest
- `get_sentiment_trend` — sentiment trend over time
- `get_open_chain_findings` — open impact chain findings
- `run_impact_chain` — real-time macro→stock impact analysis
- `get_evidence_summary` — Bayesian evidence for prediction claims

### 3.2 AI Agent Outputs — Key Untapped Sources

**Where they live:**
- `docs/analysis-briefs/{TICKER}.md` — per-ticker ledger updated by report-analyzer, market-watcher, news-scout, unified-agent. Contains: fundamentals verdict, price/volume/TA entries, quarterly syntheses, agent signals.
- `docs/agent-memory/notebooks/*.md` — per-agent operational memory (market-watcher, news-scout store their last cycle result with full signal reasoning)
- `orch-state.json` (served at `/api/orchestration`) — dev team state only, not analyst-facing
- Telegram MARKET channel — unified-agent CHEF dishes (3 guaranteed daily: morning 05:23/EOD 08:37/evening 19:37 UTC), alert-commander event alerts

**What needs a NEW mcp-server GET endpoint to surface:**
Following the `docs/data/*.json → mcp-server GET /api/* → frontend api.*.tsx proxy → dashboard.*.tsx loader` serve precedent:

| Data | Source | New Endpoint | Priority |
|---|---|---|---|
| Per-ticker analysis brief | `docs/analysis-briefs/{TICKER}.md` → read file | `GET /api/analysis-brief/:ticker` | P0 |
| CHEF market dish digest (last 3) | `get_market_message_digest` → format | `GET /api/market-digest` | P0 |
| Foreign flow aggregate | `get_foreign_flow` → aggregate | `GET /api/foreign-flow` | P1 |
| Sector rotation signal | `get_sector_rotation` | `GET /api/sector-rotation` | P1 |
| Investment clock phase | `get_investment_clock_phase` | `GET /api/investment-clock` | P1 |
| Upcoming events calendar | `get_earnings_calendar` + `get_macro_calendar` | `GET /api/events-calendar` | P1 |
| Alert intelligence feed | `get_alerts` (analyst-relevant only) | `GET /api/alerts-feed` | P1 |
| Prediction / calibration digest | `get_calibration_report` + `get_prediction_accuracy` | `GET /api/accuracy-digest` (already partial — extend) | P2 |
| Insider + broker signals | `get_insider_signals` + `get_broker_credibility` | `GET /api/insider-feed` | P2 |
| Macro events + regime | `get_policy_signals` + `get_transition_probabilities` | `GET /api/macro-regime` | P2 |

**Note on analysis-briefs serving:** The brief files at `docs/analysis-briefs/{TICKER}.md` already contain agent-synthesized content. A new mcp-server endpoint can read and serve these as structured JSON (parse markdown sections: `## [Report Analyzer]`, `## [News Scout]`, `## [Market Watcher]`, `## [Unified Agent]`). This follows the same serve-a-docs-artifact precedent as orch-state.

---

## 4. Analyst Tool-Needs (VN Market Analyst Lens)

Rules enforced throughout:
- ALWAYS direction + delta% — never bare snapshots
- Plain Vietnamese labels for user-facing text
- Freshness / SLA badge on every data card (show data age, amber if stale)
- Watchlist from SSOT: `docs/data/system-map.json .project.watchlist`

### 4.1 Proposed Views

| View | Description | Primary Endpoint(s) |
|---|---|---|
| **Tổng Quan Thị Trường** (Market Overview) | VNINDEX direction/delta + breadth + regime + today's CHEF synthesis + macro snapshot | `GET /health` (for fleet status), `get_market_snapshot`, `GET /api/market-digest`, `get_macro_snapshot` |
| **Watchlist** (Danh Mục Theo Dõi) | 30 tickers: price Δ%, signal direction, hexagram, sentiment, foreign flow at a glance | `get_market_snapshot` (batch), `get_agent_signals` (per ticker), `get_kinhdich_reading` (batch), `get_foreign_flow` |
| **Phân Tích Cổ Phiếu** (Per-Stock Deep Dive) | Price+TA+BCTC+news+hexagram+agent brief in one view | `get_price_history`, `get_technical_indicators`, `get_financial_summary`, `get_agent_signals`, `GET /api/analysis-brief/:ticker`, `get_kinhdich_reading`, `get_cascade_metrics` |
| **Tin Tức & Tâm Lý** (News & Sentiment) | Headlines + impact chains + affected tickers + sentiment trend | `get_market_message_digest`, `get_unreviewed_market_messages`, `get_sentiment_trend`, `get_open_chain_findings` |
| **Vĩ Mô & Chu Kỳ** (Macro Regime) | Investment clock, oil/gold/FX with direction+delta, policy signals, upcoming macro events | `get_macro_snapshot`, `get_investment_clock_phase`, `GET /api/macro-regime`, `get_macro_calendar` |
| **Tín Hiệu AI** (AI Agent Intelligence) | CHEF dishes, prediction accuracy, alert-commander events, calibration Brier score, signal accuracy by type | `GET /api/market-digest`, `GET /api/alerts-feed`, `GET /api/accuracy-digest`, `get_portfolio_conviction` |
| **Báo Cáo Tài Chính** (Financial Reports) | BCTC earnings, earnings calendar, insider signals, plan vs actual, sector comparison | `get_financial_summary`, `get_earnings_calendar`, `GET /api/insider-feed`, `compare_financials` |
| **Cơ Hội & Cảnh Báo** (Opportunities & Alerts) | Active alerts with accuracy badges, watchlist RSI extremes, BB breakouts, foreign flow anomalies | `get_alerts`, `get_technical_indicators`, `get_foreign_flow`, `get_alert_accuracy` |

---

## 5. Upgraded Surface Design

### 5.1 New NAV_ITEMS Structure

`app/components/TopNav.tsx` — NAV_ITEMS replacement:

```typescript
// PRIMARY analyst tabs (top level, always visible)
const ANALYST_NAV: NavItem[] = [
  { to: "/dashboard", label: "Tổng Quan" },           // Market Overview (new home)
  { to: "/dashboard/watchlist", label: "Danh Mục" },  // Watchlist (enriched)
  { to: "/dashboard/stock", label: "Cổ Phiếu" },      // Per-stock deep dive (replaces analysis)
  { to: "/dashboard/news", label: "Tin Tức" },         // News & Sentiment (new)
  { to: "/dashboard/macro", label: "Vĩ Mô" },         // Macro Regime (new)
  { to: "/dashboard/ai-intel", label: "AI Intel" },    // AI Agent Intelligence (new)
  { to: "/dashboard/bctc", label: "Tài Chính" },       // Financial Reports (keeps bctc-eval + inspect)
  { to: "/dashboard/alerts", label: "Cảnh Báo" },      // Opportunities & Alerts (new)
];

// SYSTEM group (collapsed dropdown or secondary row)
const SYSTEM_NAV: NavItem[] = [
  { to: "/dashboard/services", label: "Services" },
  { to: "/dashboard/fetch", label: "Fetch Ops" },
  { to: "/dashboard/vps", label: "VPS Proxy" },
  { to: "/dashboard/orchestration", label: "Orchestration" },
  { to: "/dashboard/quality-audit", label: "Quality Audit" },
];
```

Implementation: TopNav needs a `SystemGroup` collapsed section (Radix Collapsible or a "Hệ Thống" dropdown menu item exposing SYSTEM_NAV). The analyst tabs are primary, always shown. System tabs are secondary, collapsed by default.

### 5.2 Page Component Specs

---

#### PAGE 1: Tổng Quan Thị Trường (`/dashboard` — replaces `_index.tsx`)

**Purpose:** Command center. First view opened every morning from France.

**Layout:** 3-column grid on desktop, single column on mobile.

**Cards (left column — market pulse):**
- `VNIndex Card` — large: index value, direction arrow, delta Δ points, delta%, freshness badge (age since last tick). Data: `get_market_snapshot`.
- `Regime Badge` — BULLISH / NEUTRAL / BEARISH pill with investment clock phase. Data: `get_investment_clock_phase`, `get_macro_snapshot`.
- `Foreign Flow Card` — net foreign buy/sell today (VND tỷ), direction arrow, 5-day trend sparkline. Data: `GET /api/foreign-flow` → `get_foreign_flow`.

**Cards (center column — AI synthesis):**
- `CHEF Synthesis` — last 3 MARKET channel dishes (morning/EOD/evening), each: timestamp, 2-sentence summary, top-3 affected tickers with direction. Data: `GET /api/market-digest` → `get_market_message_digest`.
- `Top Signals` — last 5 alert-commander events with ticker, direction, confidence, age. Data: `GET /api/alerts-feed`.

**Cards (right column — macro context):**
- `Macro Snapshot` — oil/gold/usdvnd/carry/yield: value, direction arrow, delta%. All 5 items, color-coded by direction. Data: `get_macro_snapshot`.
- `Upcoming Events` — next 3 earnings + macro events (today + next 3 days). Data: `GET /api/events-calendar`.
- `Data Freshness Bar` — inline SLA status strip: 5 icons (price/news/macro/foreign-flow/bctc) green/amber/red. Data: re-uses existing `fetchVpsProxyHealth` + `fetchFetchStatus`.

**Decision-support framing:** Every number shows direction + delta. Never bare snapshot. Freshness badge on each card.

---

#### PAGE 2: Danh Mục (`/dashboard/watchlist` — enriches existing `dashboard.analysis.tsx`)

**Purpose:** 30-ticker at-a-glance — scan the whole watchlist in seconds.

**Layout:** Watchlist grouped by sector, each ticker as a rich tile.

**Ticker Tile (enriched from current WatchlistTile):**
- Row 1: Ticker (bold blue) + Exchange badge + signal direction pill (MUA/GIỮ/BÁN)
- Row 2: Last price + Δ% (colored arrow) + Volume vs avg% badge
- Row 3: KD hexagram name + confidence bar
- Row 4: Foreign flow badge (net buy/sell today, colored)
- Row 5: Last news signal age + signal count badge

Data per tile: `fetchWatchlistPrices` (existing) + `get_agent_signals` (batch) + `get_kinhdich_reading` (batch) + `get_foreign_flow` (batch).

**Sector Summary Row** (above each sector group):
- Sector avg Δ%, sector direction, top mover, worst mover.

**Filtering:** Quick filter buttons — MUA / GIỮ / BÁN / Tất cả. Also RSI Overbought (>70) / Oversold (<30) filter badge.

---

#### PAGE 3: Phân Tích Cổ Phiếu (`/dashboard/stock?ticker=XXX` — replaces `dashboard.analysis.tsx` detail)

**Purpose:** Full per-stock analysis in one page. The analyst opens this when a signal fires.

**Selector:** Reuse existing StockSelector + StockSearchForm components.

**Layout (when ticker selected):**

**Section A — Giá & Kỹ Thuật (Price & Technical)**
- Large OHLCV chart (existing StockChart component, 90 days)
- RSI(14) with overbought/oversold zones colored
- MACD histogram bar chart (new chart, same data)
- BB20 with upper/lower band overlaid on price
- Current values: RSI, MACD histogram, BB position label (above upper / in band / below lower)

Data: `get_price_history` (existing), `get_technical_indicators` (existing TA snapshot + extend with BB)

**Section B — Tín Hiệu AI (AI Signals)**
- Agent synthesis from `GET /api/analysis-brief/:ticker` — render the 4 sections:
  - `[Report Analyzer]` fundamentals verdict card
  - `[News Scout]` last headline + sentiment
  - `[Market Watcher]` last price/RSI/volume entry
  - `[Unified Agent]` last quarterly synthesis
- Last 10 agent signals table (existing StockSignalsPanel — keep)
- Cascade macro impact panel (existing MacroImpactPanel — keep)

**Section C — Kinh Dịch**
- Hexagram card (existing, keep as-is)
- Action note + overall reading text

**Section D — Tin Tức (News)**
- Last 5 news signals for this ticker from `get_agent_signals` filtered by ticker, showing: headline text, source, confidence, direction, impact score, age.

**Section E — Tài Chính (Financials — compact)**
- Last reported quarter: Revenue Δ%, Net Income Δ%, ROE%, P/E
- Link to full BCTC page for this ticker
- Earnings calendar: next expected report date

Data: `get_financial_summary` (new proxy), `GET /api/analysis-brief/:ticker` (new endpoint)

**Section F — Peer Comparison**
- Sector peers bar (existing SectorPeersBar — keep)
- Add: sector avg Δ% vs this ticker Δ%

**Decision Panel (sticky bottom bar on mobile, right panel on desktop):**
- Synthesized signal: MUA MẠNH / MUA / GIỮ / BÁN / BÁN MẠNH (existing computeDecision — extend with foreign flow score)
- Contributing factors: TA + KD + price trend + foreign flow + news sentiment
- AI accuracy badge for this ticker's signal type

---

#### PAGE 4: Tin Tức & Tâm Lý (`/dashboard/news` — NEW)

**Purpose:** News feed with impact analysis. Non-technical Vietnamese summary.

**Layout:** Two-column: headlines left, impact analysis right.

**Left column — Feed:**
- Source selector tabs: Tất cả / Cấp bách (urgent_news) / Chain Catalyst / Macro
- Each item: time (relative: "3 giờ trước"), headline, source badge, affected tickers pills (colored by direction), confidence score
- Freshness: age indicator, SLA badge
- Click → opens impact analysis on right

**Right column — Impact Analysis:**
- `run_impact_chain` result for selected news item: macro → sector → affected tickers table
- Affected watchlist tickers with direction arrows
- Evidence strength bar (from `get_evidence_summary`)

**Bottom — Tâm Lý Thị Trường (Sentiment Trend):**
- 7-day sentiment line chart (BULLISH/NEUTRAL/BEARISH ratio over time)
- Cross-source agreement badge: "3/4 sources BULLISH"
- Data: `get_sentiment_trend`

Data: `get_market_message_digest`, `get_unreviewed_market_messages`, `get_sentiment_trend`, `get_open_chain_findings`

New proxies needed:
- `app/routes/api.market-digest.tsx` → `GET /api/market-digest`
- `app/routes/api.sentiment-trend.tsx` → `GET /api/sentiment-trend`

---

#### PAGE 5: Vĩ Mô & Chu Kỳ (`/dashboard/macro` — NEW)

**Purpose:** Macro regime and investment clock for context-setting.

**Top row — Investment Clock:**
- Large dial showing current phase: Expansion / Slowdown / Recession / Recovery
- Phase duration and transition probability
- Data: `get_investment_clock_phase`, `get_transition_probabilities`

**Middle row — Macro Panel (extended from existing MacroSignalPanel):**
- Oil (WTI): value, direction, delta%, source age
- Gold (USD): value, direction, delta%
- USD/VND: value, direction, delta%, vs SBV reference rate
- EFFR / Carry Trade: value, direction, spread vs VN rate
- 10Y US Yield Spread: premium vs VN bond
- ISM Manufacturing: latest reading + trend

Data: `get_macro_snapshot` (existing, richer display), `get_ism_subcomponents`, `get_carry_trade_signal`, `get_yield_spread_signal`, `get_fed_liquidity_spread`

**Bottom row — Policy & Macro Calendar:**
- SBV policy signals (latest rate decision, direction)
- Upcoming macro events (next 5: Fed meeting, SBV rate decision, CPI release, VN GDP)
- Data: `get_policy_signals`, `get_macro_calendar`

New proxy needed:
- `app/routes/api.macro-regime.tsx` → `GET /api/macro-regime`
  (aggregates: investment_clock + macro_snapshot + ism + policy_signals + macro_calendar)

---

#### PAGE 6: AI Intel (`/dashboard/ai-intel` — NEW)

**Purpose:** Transparency layer — what are the AI agents saying and how accurate are they.

**Section A — CHEF Dishes (Phân Tích CHEF):**
- Last 3 MARKET channel dishes rendered as cards: morning / EOD / evening
- Each dish: full text, top 3 tickers mentioned, signal direction, time
- Data: `GET /api/market-digest`

**Section B — Độ Chính Xác (Signal Accuracy — extended from existing AccuracyDigestCard):**
- Per-signal-type accuracy table: signal_type, sample_count, accuracy_rate, bar visualization
- System accuracy overall badge
- Calibration Brier score (weekly) with trend arrow
- Data: `get_accuracy_context`, `get_calibration_report`

**Section C — Portfolio Conviction:**
- Per-ticker conviction table: ticker, hexagram, signal, confidence, direction, last updated
- Sourced from unified-agent weekly synthesis
- Data: `get_portfolio_conviction`

**Section D — Prediction Accuracy:**
- Open prediction claims: claim, target ticker, direction, due date, current probability
- Recent resolved claims: outcome (correct/incorrect), confidence vs actual
- Data: `get_prediction_markets`, `get_prediction_accuracy`

New proxy needed:
- `app/routes/api.ai-intel.tsx` — aggregates all 4 sections in one loader call

---

#### PAGE 7: Tài Chính (`/dashboard/bctc` — replaces BCTC Eval tab, keeps existing bctc-eval + inspect)

**Purpose:** Financial analysis hub (analyst-facing BCTC entry point).

**Top — Earnings Calendar:**
- Table: Ticker | Quarter | Expected date | Status (Released/Pending) | Link to BCTC Eval
- Alert: tickers with overdue reports (badge count)
- Data: `get_earnings_calendar`

**Middle — Per-Ticker Financial Snapshot:**
- Selector: pick ticker from watchlist
- Revenue Δ% (QoQ + YoY), Net Income Δ%, ROE, P/E vs sector median
- Cash Flow from Operations (positive/negative badge)
- Plan vs Actual (AGM targets vs results) — from `vietstock-agm-plan` VPS source
- Data: `get_financial_summary`, `get_bctc_full`, `get_bctc_ocf`

**Bottom — BCTC Eval Scorecard (existing, keep):**
- EvalTable component kept
- Link to bctc-inspect

---

#### PAGE 8: Cảnh Báo (`/dashboard/alerts` — NEW)

**Purpose:** All active alerts + opportunities in one place.

**Active Alerts feed:**
- Each alert: ticker, type (TA / foreign-flow / news / KD), direction, confidence, accuracy badge, age, SLA (resolved/unresolved)
- Filter: by type, by ticker, by direction
- Data: `get_alerts`

**Technical Extremes:**
- RSI < 30 (oversold) — recovery opportunity candidates
- RSI > 70 (overbought) — exit candidates
- BB lower touch / upper touch events
- Data: `get_technical_indicators` (batch for watchlist)

**Foreign Flow Anomalies:**
- Net foreign buy/sell > threshold today
- Tickers with consecutive net foreign buy (3+ days)
- Data: `get_foreign_flow`

**Alert Accuracy Summary:**
- Per-alert-type accuracy over last 30d
- Data: `get_alert_accuracy`

New proxy needed:
- `app/routes/api.alerts-feed.tsx` → `GET /api/alerts-feed`
  (wraps `get_alerts` with analyst-relevant filter: excludes system/heartbeat alerts)

---

### 5.3 New API Proxy Routes (frontend only, `app/routes/api.*.tsx`)

These are resource routes that proxy mcp-server responses. Pattern from `api.orchestration.tsx`:

| File | Proxies | Notes |
|---|---|---|
| `api.market-digest.tsx` | `GET /api/market-digest` (mcp-server) | Aggregates `get_market_message_digest` via gateway |
| `api.foreign-flow.tsx` | `GET /api/foreign-flow` (mcp-server) | `get_foreign_flow` aggregate |
| `api.analysis-brief.$.tsx` | `GET /api/analysis-brief/:ticker` (mcp-server) | New mcp-server endpoint required |
| `api.investment-clock.tsx` | `GET /api/investment-clock` (mcp-server) | `get_investment_clock_phase` |
| `api.macro-regime.tsx` | `GET /api/macro-regime` (mcp-server) | Aggregates macro + policy + calendar |
| `api.ai-intel.tsx` | `GET /api/ai-intel` (mcp-server) | Aggregates CHEF + accuracy + conviction |
| `api.alerts-feed.tsx` | `GET /api/alerts-feed` (mcp-server) | `get_alerts` analyst-filtered |
| `api.events-calendar.tsx` | `GET /api/events-calendar` (mcp-server) | `get_earnings_calendar` + `get_macro_calendar` merged |
| `api.sector-rotation.tsx` | `GET /api/sector-rotation` (mcp-server) | `get_sector_rotation` |

---

### 5.4 New mcp-server GET Endpoints Required

These require new code in `apps/mcp-server/src/interface/mcp/` (or a new HTTP handler file):

| Endpoint | Backing Tool(s) | Implementation Notes |
|---|---|---|
| `GET /api/analysis-brief/:ticker` | File read from `docs/analysis-briefs/{TICKER}.md` | Parse 4 markdown sections into JSON: `{ticker, fundamentals, news, price, synthesis, updatedAt}` |
| `GET /api/market-digest` | `get_market_message_digest` tool | Returns last N MARKET channel messages, formatted as `{items: [{text, ts, type}]}` |
| `GET /api/foreign-flow` | `get_foreign_flow` | Returns aggregate + per-ticker array |
| `GET /api/investment-clock` | `get_investment_clock_phase` | Direct passthrough |
| `GET /api/macro-regime` | `get_macro_snapshot` + `get_policy_signals` + `get_macro_calendar` + `get_transition_probabilities` | Aggregate JSON response |
| `GET /api/ai-intel` | `get_portfolio_conviction` + `get_calibration_report` + `get_prediction_markets` + `get_market_message_digest` | Aggregate JSON response |
| `GET /api/alerts-feed` | `get_alerts` with analyst filter | Filter out system/heartbeat; add accuracy badge data |
| `GET /api/events-calendar` | `get_earnings_calendar` + `get_macro_calendar` | Merged + sorted by date |
| `GET /api/sector-rotation` | `get_sector_rotation` | Direct passthrough |

All endpoints follow the same pattern as existing mcp-server HTTP handlers (e.g. `bctcInspectHandler.ts`, `vpsProxyHealth.ts`). Route registration in the api-gateway module-route table.

---

## 6. Priority Phases

### P0 — Highest Analyst Value, Lowest Build Cost

**Goal:** Transform the home page and the existing Analysis page into real analyst tools.

| Task | Scope | Owner | What Changes |
|---|---|---|---|
| P0-1: Market Overview home page | Replace `_index.tsx` | dev-frontend | New home at `/dashboard`: VNINDEX card, CHEF digest card, macro snapshot card (reuse MacroSignalPanel), data freshness strip. No new backend. Uses existing `fetchMacroSnapshot`, `fetchGatewayHealth`, adds `api.market-digest.tsx` proxy. |
| P0-2: market-digest mcp-server endpoint | New `GET /api/market-digest` | dev-mcp-server | Read `market_messages` table or call `get_market_message_digest`. Return last 3 MARKET channel messages as JSON. |
| P0-3: analysis-brief mcp-server endpoint | New `GET /api/analysis-brief/:ticker` | dev-mcp-server | Read `docs/analysis-briefs/{TICKER}.md`, parse markdown sections → JSON. |
| P0-4: Per-stock deep dive enrichment | Enrich `dashboard.analysis.tsx` detail panel | dev-frontend | Add analysis-brief section (4 cards), add news signal mini-feed from existing `fetchStockSignals`, extend InfoSourcePanel with brief data. Add `api.analysis-brief.$.tsx` proxy. |
| P0-5: NAV_ITEMS restructure + System group | `app/components/TopNav.tsx` | dev-frontend | New ANALYST_NAV + SYSTEM_NAV groups. Radix Collapsible for System group. No backend. |
| P0-6: Watchlist tile enrichment | `WatchlistTile` in `dashboard.analysis.tsx` | dev-frontend | Add KD signal pill + foreign flow badge. Data already fetched (`fetchWatchlistPrices` + `fetchStockSignals`). Only component-level change. |

**P0 is pure frontend + 2 new mcp-server GET endpoints. Zero blocked.**

---

### P1 — Analyst Views That Need New API Proxies

| Task | Scope | Owner | Blocked By |
|---|---|---|---|
| P1-1: News & Sentiment page | New `dashboard.news.tsx` + `api.market-digest.tsx` | dev-frontend | P0-2 (market-digest endpoint) |
| P1-2: Macro & Regime page | New `dashboard.macro.tsx` + `api.macro-regime.tsx` (proxy only) | dev-frontend + dev-mcp-server | New `GET /api/macro-regime` endpoint |
| P1-3: Alerts & Opportunities page | New `dashboard.alerts.tsx` + `api.alerts-feed.tsx` | dev-frontend + dev-mcp-server | New `GET /api/alerts-feed` endpoint |
| P1-4: Foreign flow tile badge | `WatchlistTile` + `api.foreign-flow.tsx` | dev-frontend + dev-mcp-server | New `GET /api/foreign-flow` endpoint |
| P1-5: Events calendar widget | Home page + stock deep dive | dev-frontend + dev-mcp-server | New `GET /api/events-calendar` endpoint |

---

### P2 — Full Analyst Workbench Completion

| Task | Scope | Owner | Blocked By |
|---|---|---|---|
| P2-1: AI Intel page | New `dashboard.ai-intel.tsx` + `api.ai-intel.tsx` | dev-frontend + dev-mcp-server | New `GET /api/ai-intel` aggregate endpoint |
| P2-2: Financial Reports page (Tài Chính) | New `dashboard.bctc.tsx` wrapping existing bctc-eval | dev-frontend | `get_financial_summary` already reachable; `get_earnings_calendar` endpoint |
| P2-3: Sector rotation widget | Watchlist page sector rows | dev-frontend + dev-mcp-server | `GET /api/sector-rotation` endpoint |
| P2-4: BB + extended TA chart | Stock deep dive chart panel | dev-frontend | TA service already has BB data; extend `fetchTASnapshot` |
| P2-5: RSI/BB extremes scan | Alerts page Technical Extremes section | dev-frontend | Uses existing `get_technical_indicators` batch |
| P2-6: Investment clock dial | Macro page | dev-frontend + dev-mcp-server | `GET /api/investment-clock` endpoint |

---

### P3 — Blocked / Future (data sources not fully wired)

| Task | Owner | Blocker |
|---|---|---|
| Plan vs Actual (AGM) chart | dev-frontend + dev-mcp-server | `vietstock-agm-plan` VPS source not yet surfaced as mcp-server tool |
| Insider + broker signal feed | dev-frontend | `get_insider_signals` + `get_broker_credibility` endpoint wiring to be verified |
| Prediction claim tracker | dev-frontend | `get_prediction_markets` needs accuracy join endpoint |
| CHEF dish full-text archive | dev-frontend | Requires market_messages DB query endpoint |

---

## 7. Risk Flags

**R1 — Stale analysis-brief files:** `docs/analysis-briefs/{TICKER}.md` are updated by agents asynchronously. The `GET /api/analysis-brief/:ticker` endpoint MUST return a freshness timestamp and the frontend MUST show a staleness badge (amber if > 24h). Never present as live without age disclosure.

**R2 — Market-digest latency:** MARKET channel messages are polled from the `market_messages` SQLite table. The endpoint should cache with a short TTL (60s) to avoid hammering the DB on page load. Serve stale-if-available pattern.

**R3 — Batch TA calls performance:** Fetching `get_technical_indicators` for 30 watchlist tickers in one page load is costly. The Watchlist tile only needs RSI + direction; implement a lightweight `GET /api/watchlist-ta` that returns `{ticker, rsi, direction, bbPosition}` for all 30 tickers in one DB query — NOT 30 individual tool calls.

**R4 — DDD violation risk:** All new mcp-server HTTP handlers must sit in `apps/mcp-server/src/interface/` (HTTP handler layer), not in domain or application. File reads for analysis-brief are infrastructure-layer (filesystem adapter). Never import domain from infrastructure.

**R5 — VEA exclusion:** The watchlist SSOT includes VEA (active: false). All batch queries over the watchlist MUST filter `active: true` only. Use `WATCHLIST_STOCKS.filter(s => s.active)` — never a hardcoded count.

**R6 — Direction+delta contract:** Every numeric data value displayed to the user MUST include a direction indicator (arrow or color) and a delta percentage or absolute change. Bare current values without context are forbidden on any analyst-facing page. This applies to: price, RSI, macro values, foreign flow totals.

**R7 — Foreign flow circuit breaker:** The `get_foreign_flow` tool has a circuit-breaker (`diagnose_foreign_flow_circuit_breaker` tool). The `GET /api/foreign-flow` endpoint must check the circuit-breaker state and return a `{status: "circuit_open", reason: "..."}` field that the frontend renders as an amber degraded badge rather than showing stale/zero data as valid.

---

## 8. Standard Detection

**BUILD-STANDARD: lean** — `apps/frontend/` already exists. All changes are new feature additions within the zone. No new microservice. Multiple dev-zone owners (dev-frontend + dev-mcp-server) for multi-zone tasks.

Multi-zone split required for P0-2, P0-3, P1-2, P1-3, P1-4, P1-5, P2-1, P2-2, P2-3, P2-6:
- dev-frontend task: new route/proxy/component
- dev-mcp-server task: new GET endpoint

Single-zone (dev-frontend only) for P0-1, P0-4, P0-5, P0-6, P2-4, P2-5.

---

## 9. Zone

**Primary:** `apps/frontend/`
**Secondary:** `apps/mcp-server/` (new GET endpoints)

Multi-zone: PM must split P1+ tasks into per-zone subtasks.

---

## [Architect] Brownfield Findings

- **Zone:** apps/frontend/ (primary), apps/mcp-server/ (secondary)
- **Verified paths:**
  - `apps/frontend/app/components/TopNav.tsx:19-32` — NAV_ITEMS SSOT, safe to restructure
  - `apps/frontend/app/routes/dashboard.analysis.tsx:134-173` — loader pattern, reuse for new pages
  - `apps/frontend/app/lib/api/client.ts:38-54` — `apiGet<T>` base pattern, extend not duplicate
  - `apps/frontend/app/routes/api.orchestration.tsx` — proxy resource route pattern (source for all new `api.*.tsx`)
  - `apps/frontend/app/routes/_index.tsx:44-50` — DASHBOARD_LINKS hardcoded list, replace with ANALYST_NAV
  - `apps/frontend/app/components/charts/StockChart.tsx` — reusable chart, extend for RSI/MACD panels
- **Reuse patterns:**
  - `WatchlistTile` component — extend in-place, do not fork
  - `SectionCard`, `PageHeader`, `ClientTimestamp` — reuse everywhere
  - `computeDecision()` function — extend with foreign flow score, do not duplicate
  - `AccuracyDigestCard` — reuse on AI Intel page
  - `MacroSignalPanel` — reuse on Market Overview and Macro Regime page
  - `StockSignalsPanel` — reuse on per-stock deep dive
  - Loader `Promise.allSettled` pattern — mandatory for all new loaders (non-fatal degraded data)
- **Design decisions:**
  - New pages follow the existing `dashboard.analysis.tsx` loader pattern: all data fetched server-side in loader, passed to client via `useLoaderData`, no client-side fetching
  - All new API proxies in `app/routes/api.*.tsx` follow `api.orchestration.tsx` pattern: server-side fetch → json() → no transformation (transformation in domain/ files)
  - New mcp-server GET endpoints follow `vpsProxyHealth.ts` / `bctcInspectHandler.ts` handler pattern
  - Analysis brief endpoint reads filesystem: infrastructure-layer concern, adapter in `apps/mcp-server/src/infrastructure/files/analysisBriefReader.ts`
  - `dashboard.db.tsx` page — retire (content folded into new news/watchlist pages); remove `Database` from NAV_ITEMS once P0 routes are live
- **Scan clean:** true
