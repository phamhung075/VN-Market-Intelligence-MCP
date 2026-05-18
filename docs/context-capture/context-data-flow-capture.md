# VN Market Intelligence — Data Flow Capture

**Date:** 2026-05-18
**Companion to:** `context-global-capture.md`
**Purpose:** Trace **how data moves** from raw fetch → analysis → user-facing report.

---

## 0. The Big Picture (one screen)

```
┌─────────────────────────── EXTERNAL WORLD ────────────────────────────┐
│  VN geo-blocked sources              Open / international sources       │
│  (SSC, BCTC, HOSE iBoard,            (FRED, Yahoo, Reuters, Trading-    │
│   foreign-flow, SBV-VPS,             Economics, Polymarket, RSS feeds,  │
│   VN news RSS)                       SBV, congbao, weather/hydro, DAV)  │
└─────────┬────────────────────────────────────┬─────────────────────────┘
          │                                    │
          ▼ HTTP push                          ▼ HTTP pull (direct)
  ┌───────────────┐                  ┌─────────────────────────┐
  │  Vinahost VPS │                  │  mcp-server (Bun)       │
  │  Vietnam      │                  │  + per-microservice     │
  │  5 systemd    │ ────POST────►    │  fetchers               │
  │  fetchers     │  /api/push-*     │                         │
  │  → /proxy/*   │                  │                         │
  └───────────────┘                  └────────────┬────────────┘
                                                  │
                                                  ▼
                  ┌────────────────────────────────────────────┐
                  │  STORAGE LAYER (Docker volume market_data) │
                  │  • SQLite × 5 (per service, isolated)      │
                  │  • LanceDB × 1 (rag-service embeddings)    │
                  │  • JSON files (alert verdicts, signals)    │
                  └────────────────┬───────────────────────────┘
                                   │
                                   ▼
   ┌──────────────────────── ANALYSIS LAYER ──────────────────────────┐
   │                                                                   │
   │  ① SERVER CRON (62 jobs in mcp-server + 14 across microservices) │
   │     intelligenceCycle (15m) | taAlertScan | bbAlertScan          │
   │     foreignFlowAlert | insiderCheck | macroIndicatorRefresh      │
   │     evidenceAccumulator | predictionResolution | verdictResolution│
   │                                                                   │
   │  ② COWORK AGENTS (9, cloud-scheduled via claude.ai)              │
   │     news-scout | market-watcher | financial-analyst              │
   │     report-analyzer | alert-commander | digest-predict           │
   │     qa-responder | unified-agent | tran-ngoc-bau                 │
   │     → write docs/signals/*.json + notebooks                      │
   │                                                                   │
   │  ③ DEV TEAM (hourly cron, Claude Code CLI)                       │
   │     drains signals → po→ba→architect→pm→developer→qa             │
   │                                                                   │
   └──────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
       ┌────────────────────────────────────────────────┐
       │  TELEGRAM (3 channels, send_telegram MCP tool) │
       │  • MARKET — user-facing (alerts, digests)      │
       │  • WORK   — agent status, quality reports      │
       │  • BUG    — errors, incidents                  │
       └────────────────────────────────────────────────┘
                              │
                              ▼
                            USER
```

---

## 1. INGESTION LAYER — Where data comes from

### 1.1 VPS Proxy (geo-blocked VN sources)

**Location:** Vinahost Vietnam VPS (`125.212.251.27`, port `8765`).
**Why:** SSC, BCTC discovery, HOSE iBoard, foreign-flow, SBV, VN news, muasamcong are **geo-blocked** to non-VN IPs.
**Mechanism:** 5 systemd services on VPS run lightweight HTTP scrapers (`requests`/`httpx`/`curl_cffi`/`cloudscraper` — **no Chromium**), then **push** to main server endpoints.

| VPS service | Source | Interval | Push endpoint | What |
|---|---|---|---|---|
| `vn-price-fetch.service` | HOSE/HNX/UPCOM | 60s market hrs | `POST /api/push-prices` | Stock prices |
| `vn-foreign-flow.service` | HSX foreign data | 60s market hrs | `POST /api/push-foreign-flow` | Foreign buy/sell |
| `vn-bctc-fetch.service` | congbothongtin.ssc.gov.vn | 6h | `POST /api/push-bctc-pdf` | BCTC PDF queue |
| `vn-news-fetch.service` | 10 VN RSS (CafeF, VnExpress, …) | 15min | `POST /api/push-news` | 226 items/cycle |
| `vn-sbv-fetch.service` | Vietcombank FX page | 30min | `POST /api/push-sbv` | Official VND/USD/EUR rates |

**Plus proxy GET routes** (`/proxy/ssc-iboard`, `/proxy/bctc-discover/:ticker`, `/proxy/muasamcong`, `/proxy/sbv`, `/proxy/news`, `/proxy/foreign-flow`) — used by `trigger_*_vps_fetch` MCP tools for on-demand pulls.

**BCTC PDF special case (PULL-based, Sprint 2026-04-27):**
1. VPS scrapes SSC portal, saves PDFs to `/bctc-files/` directory.
2. `mcp-server` pulls on cron schedule, copies to `/app/data/pdfs/`.
3. `bctcReparseJob` (09:30 VN daily) re-parses recently added PDFs via `pdf-extractor` service.

### 1.2 Direct fetchers (open / international sources)

Sources without geo-block, fetched directly from main server (or dedicated microservice).

| Source | Category | Used by | Storage |
|---|---|---|---|
| **FRED** (`fetchFedFundsRate`, `fetchFredEffrIorb`, `fetchFredIsmSubcomponents`) | macro | `macroIndicatorRefreshJob` (06:00 UTC) | `tracked_indicators`, `fred_series_daily` |
| **Yahoo Finance** | price, commodities | `fetchMacro()` in intelligenceCycle | `macro_snapshots` |
| **Trading Economics** | macro news stream | cascade engine | `macro_events` |
| **Trading Economics Chromium** | macro (Playwright) | main server only | scraped HTML → parsed |
| **Reuters / NewsAPI** | news | news-fetch service | `news_items` |
| **Polymarket** | sentiment | `predictionMarketPoll` (30m) | `prediction_markets` |
| **SBV direct** | macro | direct fetch | `fx_rates` |
| **congbao** | regulatory | sscCheck (20:00 VN) | `regulatory_filings` |
| **HOSE / HNX direct** | exchange | direct + VPS fallback | `market_prices` |
| **DAV pharmacy** | sector | `davPharmacyCheck` (1st monthly) | `pharma_signals` |
| **weather-vn / hydrological** | climate | `weatherCheck` (6h) | `climate_signals` |
| **shipping-index** | macro | direct | `supply_chain_signals` |
| **vneconomy-rss / vnexpress-rss** | news | news-fetch | `news_items` |

### 1.3 Failure path (fail-loud)

- VPS fetch fails → `/api/vps-error` records → `docs/signals/probe-failed.json` → BUG channel via `cronHealthAlert` when `success_rate < 80%`.
- Direct fetch fails → microservice marks source as **degraded**; 3-tier fallback applies (e.g., stock-price: VPS → direct HOSE → cached snapshot).
- `vpsProxyWatchdog` (every 10min market hrs) reads `MAX(market_prices.updated_at)` — >15min stale → WORK alert with 30min cooldown.

---

## 2. STORAGE LAYER

### 2.1 SQLite × 5 + LanceDB × 1 (Docker named volume `market_data`)

| DB file | Owner service | Tables (key ones) | Purpose |
|---|---|---|---|
| `intelligence.db` | mcp-server | `market_prices`, `news_items`, `agent_signals`, `prediction_claims`, `evidence_fragments`, `trade_exposures`, `cron_job_runs`, `signal_outcomes`, `tracked_indicators`, `fred_series_daily`, `macro_snapshots`, `kinhdich_readings`, `bctc_documents`, `cascade_outcomes` | Main intelligence store |
| `stock_price.db` | stock-price | `intraday_ticks`, `daily_ohlcv` | Price aggregation (CGO sqlite, isolated from intelligence.db to avoid corruption — Sprint 1331) |
| `alert-engine.db` | alert-engine | `alert_rules`, `alert_history`, `cooldown_state` | Multi-source signal dedup + cooldown |
| `pdf-extractor.db` | pdf-extractor | `parse_jobs`, `extraction_results` | BCTC PDF parsing state |
| `rag.db` (LanceDB) | rag-service | embeddings, vector index | Semantic search |

**Key invariant** (Sprint 1336): `market_data` is a **named volume**, NOT a bind-mount. macOS Docker VM tears SHM on container stop → 8x SQLite corruption history before fix.

### 2.2 File-based stores

- `data/alert-verdicts.json` — PRIMARY pending-verdict store. `write_alert_verdict` writes; `verdictResolutionJob` derives `agent_signals.outcome`.
- `docs/signals/*.json` — async signal bus between cowork agents and dev-team (drained on next dev-team cycle Step 0a).
- `docs/signals/DASHBOARD.md` — index/SSOT for current signal queue.
- `docs/handoffs/TASK_*.md` — sync handoff chain (po → ba → architect → pm → developer → qa).
- `docs/agent-memory/notebooks/<agent>.md` — agent freeform memory (≤200 lines, overwritten each cycle).

---

## 3. ANALYSIS LAYER — How fetched data becomes signals

### 3.1 ① Server cron pipeline (Bun scheduler in mcp-server)

**intelligenceCycle** (`*/15 min`, the main engine) — 7 steps with 2-min timeout each:

| Step | Function | Hours | What |
|---|---|---|---|
| A | `pollNews()` | 24/7 | 5 sources + commodity prices |
| A2 | `fetchMacro()` | 24/7 | Yahoo Finance + SBV σ history |
| A3b | `syncSectorPeers()` | market | vnstock sector sync |
| B | `listSscDocuments()` | market | SSC check per stock |
| C | `fetchHosePrices()` | market | prices + sector context |
| D | `runImpactChain()` | market | cascade + σ adjustments |
| E | `sendAlerts()` | market | unnotified HIGH/CRITICAL → Telegram |

**Parallel TA scan** (Sprint Phase 3c, Promise.allSettled, ~3-5s cycle):
- `taAlertScanJob` (`*/15 min market`) — RSI(14) overbought/oversold.
- `bbAlertScanJob` (`*/15 min market`) — BB20 upper/lower breakout.
- `taAlertNotifierJob` (`*/15 min market`) — delivers unnotified TA alerts to MARKET.

**Macro indicator refresh** (`0 6 * * *` UTC daily):
- FRED Fed Funds Rate (monthly).
- FRED EFFR + IORB (daily, full history backfill on first run, then idempotent `INSERT OR IGNORE`).
- 3x retry with exponential backoff on HTTP failure.

**Evidence & prediction pipeline:**
- `evidenceAccumulator` (23:00 VN) — aggregates per-stock bullish/bearish evidence fragments.
- `baseRateComputation` (02:00 VN Mon) — weekly recompute of per-signal-type base rates for calibration.
- `predictionResolution` (23:30 VN) — resolves expired prediction claims, computes Brier score.
- `calibrationReportJob` (20:00 VN Sun) — Brier calibration → MARKET + WORK.
- `foreignFlowAlertJob` (16:30 VN M-F) — smart-money detection, fires HIGH alerts + evidence.
- `insiderCheckJob` (08:00 VN daily) — SSC insider transaction check + streak detection.

**Verdict resolution** (`0 * * * *` hourly):
- 24h window guard — signals <24h old skipped.
- 4h price delta: baseline ±15min vs +240..+270 min.
- Flat (<1%) → `confirmed` | bullish + ≥+1% → `confirmed` | bullish + ≤-1% → `false_positive` (symmetric for bearish).
- 30-day TTL pruning on still-pending rows.
- Fail-loud: price fetch error → 1 BUG alert per run.

**Signal outcome feedback loop:**
- `signalOutcomeResolutionJob` (`17 * * * *`) — resolves T+24h / T+48h pending rows.
- `accuracyDigestJob` (07:00 UTC daily) — computes 30-day accuracy, top-3/bottom-3 signal types → WORK.

### 3.2 ② Cowork agents (analysis team, cloud-scheduled via claude.ai)

Each agent **reads MCP tools, produces a signal/digest, writes to `docs/signals/` or directly to MARKET**. All go through `mcp__claude_ai_gateway__call_tool(server="vn-market", tool=..., arguments=...)`.

| Agent | Trigger | Tools called | Output |
|---|---|---|---|
| `news-scout` | cron 15/60min | `fetch_and_analyze`, `run_impact_chain`, `search_similar_context` | `docs/signals/news_impact*.json`, notebook |
| `market-watcher` | cron 5min/2h | `get_market_snapshot`, anomaly tools | `docs/signals/price_anomaly*.json`, MARKET (eod only) |
| `financial-analyst` | cron 2× daily | `get_bctc_full`, `compare_financials` | `docs/signals/bctc_signal*.json`, notebook |
| `report-analyzer` | event/cron | quarterly BCTC parse | `docs/signals/fundamental_*.json`, ledger update |
| `alert-commander` | cron 10-30min | `get_agent_signals`, `get_alerts`, verifies cowork signals | MARKET channel (alerts only) |
| `digest-predict` | daily/weekly/Mon/monthly | aggregated cowork output | MARKET channel (digests) |
| `qa-responder` | cron 12min | `get_pending_ask_questions`, MCP + WebSearch | MARKET channel (replies) |
| `unified-agent` | cron hourly | all cowork outputs + predictions | WORK channel, cross-checks |
| `tran-ngoc-bau` | daily 20:00 VN | MARKET 50msgs + agent notebooks + tnb-methodology | `docs/handoffs/tnb-audit-latest.md`, `docs/signals/tnb-*.json` |

**Kinh Dịch is the default layer** on every stock analysis — every cowork agent MUST call `get_kinhdich_reading(ticker)` before reporting on a ticker.

### 3.3 ③ 4-Level causal cascade (the analytic frame)

This is the **mental model** every cowork agent applies when analyzing macro/news:

```
Level 1 (global)   → Macro event (Fed rate, oil, US tariffs, war)
       ↓
Level 2 (country)  → Vietnamese macro impact (VND/USD, CPI, credit, FDI)
       ↓
Level 3 (domain)   → Sector impact (banking, real estate, steel, retail, pharma)
       ↓
Level 4 (action)   → Specific watchlist stock (VCB, HPG, VIC, MWG, …)
```

**Cascade engine** (in `apps/mcp-server/src/cascade/`): 60+ rules mapping global events → VN sectors. Lives in `cascadeEngine.ts`. 16 sectors monitored. Auto-adjusts thresholds in `macroThresholds.ts` (e.g., Brent >$90 boosts oil_gas by +0.10).

### 3.4 TNB methodology overlay (Trần Ngọc Báu framework, 6 layers)

Applied by `tran-ngoc-bau` agent when auditing MARKET messages & agent quality:
- **Layers 1-3** — Data discipline + US/VN economic stacks.
- **Layers 4-6** — 4-Pillar valuation + 6-step decision tree + gap catalogue.
- **Foundational philosophy:** "To understand a stock, you must understand the business behind it." Bottom-up business understanding anchors everything else.

---

## 4. ALERT FIRING — From signal to user

### 4.1 Two active alert types (alert-policy.md)

Both gated through `alert-commander.md` (only this agent calls `send_telegram(channel="market")` for alerts).

**`position-danger`** — fires when **ALL THREE**:
1. `stopLossHit` — current price ≤ computed stop-loss.
2. `singleDayDrop` >5%.
3. `newsSentiment` < -0.5.

**`watchlist-opportunity`** — fires when **ALL FOUR**:
1. `kinhDichConfidence` ≥ 70.
2. `kinhDichSignal` == BUY.
3. `newsSentiment` ≥ 0.3.
4. `agentSignalsMajority` == BUY.

`alertCooldownMinutes: 0` — every trigger fires exactly 1 alert, no suppression.

### 4.2 Alert split (server vs commander)

- **Server-side alerts** (speed): stop-loss, TA alerts, foreign-flow HIGH — fired directly by cron job via `send_telegram`.
- **Commander-side alerts** (intelligence): verified cascade chains, opportunity alerts — gated through `alert-commander` after cross-verification with multiple cowork signals.

### 4.3 Verdict lifecycle (write → derive → read)

| Stage | Actor | Target |
|---|---|---|
| WRITE | alert-commander calls `write_alert_verdict` at alert-fire time | `data/alert-verdicts.json` (PRIMARY) |
| DERIVE | `verdictResolutionJob` hourly | `agent_signals.outcome` (DB column) |
| READ | any consumer | post-resolution: `agent_signals.outcome`; pre: `data/alert-verdicts.json` |

Skipping `write_alert_verdict` → verdict never registered → cron has nothing to resolve.

---

## 5. REPORTING LAYER — How user sees output

### 5.1 Three Telegram channels

| Channel | Senders | Purpose | Rules |
|---|---|---|---|
| **MARKET** | `alert-commander`, `digest-predict`, `market-watcher` (eod only) | User-facing alerts, digests, EOD reports | NEVER errors/heartbeats. Only actionable. |
| **WORK** | all agents | Agent cycle status, heartbeats, quality reports | Format: `[Agent] HH:MM UTC — summary` |
| **BUG** | all agents | Errors, failures, incidents | Check `get_recent_fixes(limit=20)` first — skip duplicates. Format: `[Agent] SEVERITY\nIssue:... | Impact:... | Status:...` |

### 5.2 What hits MARKET when

| Trigger | What lands in MARKET | Sender |
|---|---|---|
| `position-danger` fires | Stop-loss alert per position | alert-commander |
| `watchlist-opportunity` fires | BUY opportunity alert | alert-commander |
| `taAlertNotifierJob` (every 15min market) | RSI/BB breakouts | server |
| `foreignFlowAlertJob` (16:30 VN M-F) | Smart-money signals | server |
| `morningBriefing` (08:00 VN M-F) | Macro + conviction list | digest-predict daily |
| `marketOpen` (09:00 VN M-F) | Open scan + price alerts | server |
| `marketClose` (15:30 VN M-F) | Close snapshot | server |
| `alertDigest` (21:00 VN M-F) | Nightly alert digest | digest-predict daily |
| `eveningSummary` (22:30 VN M-F) | Evening market summary | digest-predict daily |
| `weeklyPortfolioReport` (23:00 VN Sun) | Portfolio + weekly summary | digest-predict weekly |
| `calibrationReportJob` (20:00 VN Sun) | Brier calibration report | server |
| `franceSummaryJob` (`*/30 6-8 UTC M-F`) | France morning VN digest | digest-predict |
| `/ask` user question answered | Reply to user question | qa-responder |
| `patternWatch` (22:30 VN Sun) | Weekly pattern watch | digest-predict |

### 5.3 Synchronous user demands (W1-W4)

| Workflow | User says | Path |
|---|---|---|
| **W1** | Question | USER → MAIN → market-analyst → MCP tools → notebook → reply |
| **W2** | Feature demand | USER → MAIN → po → ba → architect → pm → developer (±dev-* zone) → qa → reply |
| **W3** | Bug report | USER → MAIN → po (channel audit) → opens FIX task → dev-team cycle |
| **W3'** | One-shot patch | USER → MAIN → developer (single file) → reply |
| **W4** | Infra incident | USER → MAIN → ops → SSH/Docker/VPS → BUG (if can't recover) → reply |

---

## 6. CONTROL PLANE — How analysis triggers

### 6.1 Two scheduling regimes

| Regime | Where | Mechanism | Examples |
|---|---|---|---|
| **Server cron** (76 jobs total) | inside Docker containers (Bun scheduler in mcp-server, Go in alert-engine, Python in pdf-extractor) | OS-level cron / process scheduler / `setInterval` | `intelligenceCycle`, `taAlertScan`, `predictionResolution` |
| **Claude.ai schedule** | claude.ai cloud | RemoteTrigger | 9 cowork agents (news-scout, market-watcher, …) on weekday/weekend cadence |
| **Claude Code CLI cron** | local Mac terminal | shell cron + `claude` CLI | dev-team hourly, code-janitor 6h, system-auditor daily, TNB daily |

### 6.2 Two signaling mechanisms between agents

1. **Synchronous (RETURN.NEXT)** — agent's flow returns a block with `PIPELINE: continue | NEXT: <agent>`. Main terminal reads it, spawns next agent immediately.
2. **Asynchronous (signal files)** — agent writes `docs/signals/<slug>.json`. Drained on next dev-team cycle Step 0a. Used for cross-cycle handoffs (e.g., news-scout → po, TNB → po).

### 6.3 Closed-loop auto-improvement (Sprint 1948, shadow-mode)

Currently QUEUED, gate-blocked until 2026-05-20T07:22Z. When live:
- Server detects signal verdict patterns (`false_positive` clusters).
- Auto-generates fix tasks → drained to dev-team → fixed → verified → deployed.
- Closed-loop without manual intervention.

---

## 7. FOUR-LAYER ARCHITECTURE (zoomed out)

```
LAYER 4 — User-facing reports         → Telegram MARKET, /ask answers
   ↑
LAYER 3 — Analysis & synthesis        → 9 cowork agents + dev-team chain
   ↑
LAYER 2 — Server cron + microservices → 76 cron jobs, 142 MCP tools
   ↑
LAYER 1 — Ingestion                   → VPS proxy + direct fetchers
```

Cross-cutting:
- **Knowledge DAG** — `docs/references/tree-map.md` enforces strict parent→child.
- **Token economy** — 3-tier compression (ULTRA / FULL / LITE), ~75% reduction agent-to-agent.
- **DDD pattern** — every microservice has `domain/`, `application/`, `infrastructure/`, `interface/`.
- **Zone enforcement** — dev specialists scoped to one `apps/<service>/` zone only.
- **Fail-loud protocol** — every fetcher/job emits to BUG channel on failure (dedup via `get_recent_fixes`).

---

## 8. WHAT'S CURRENTLY MOVING (live, 2026-05-18)

- **VPS proxy:** HEALTHY (vpsProxyWatchdog clean).
- **intelligenceCycle:** running every 15 min.
- **News pipeline:** active (`vn-news-fetch.service`, 226 items/cycle, 15min).
- **BCTC pipeline:** PARTIALLY BLOCKED — TNB c71 flagged BCTC FAIL in audit handoff sitting in PO queue.
- **digest-predict:** SILENT ~8 days (1907a — user needs to restart Claude Desktop to load new MCP config).
- **dev-team cycle:** WIP=0 (Sprint 1948 gate-blocked until 2026-05-20T07:22Z).
- **Headlock recurring:** Docker `.git/` VirtioFS issue (1897b unresolved — user action needed).

---

## 9. KEY SSOT POINTERS

| Topic | File |
|---|---|
| Services, agents, channels, sources, watchlist | `docs/data/system-map.json` |
| Live stats (tools, crons, tests) | `docs/data/project-stats.json` |
| Stock classification + sector mapping | `docs/data/stock-classification.json` |
| MCP server config | `mcp.config.json` |
| Knowledge tree | `docs/references/tree-map.md` |
| Workflow chart | `docs/references/workflow-map.md` + `workflow-map-cycles.md` |
| Cron job catalog | `docs/standards/cron-jobs.md` |
| MCP tool catalog | `docs/standards/mcp-tools.md` |
| Alert firing rules | `docs/policies/alert-policy.md` |
| TNB methodology | `docs/standards/tnb-methodology.md` (+layers, valuation) |
| Cascade framework | `docs/standards/market-analysis.md` |
| Kinh Dịch logic | `docs/references/kinh-dich-layer.md` |
| VPS setup | `docs/references/vps-setup.md` (+ deployment, services, endpoints) |
| BCTC runbook | `docs/protocols/bctc-extraction-runbook.md` |
| Fail-loud | `docs/protocols/fail-loud-protocol.md` |
| Dispatch (intent → agent) | `.claude/skills/dispatch/SKILL.md` |
| Zone detection | `.claude/skills/zone-detect/SKILL.md` |

---

## 10. ONE-LINE SUMMARY OF THE DATA JOURNEY

> **VPS scrapes geo-blocked VN data + main server fetches open sources → all writes land in 5 SQLite + LanceDB → 76 cron jobs and 9 cloud-scheduled cowork agents transform raw data into signals (cascade chains + TA + BCTC + Kinh Dịch + macro) → alert-commander gates verified signals → MARKET channel reaches user. WORK = status. BUG = errors. Dev-team cron drains signals into fixes hourly.**
