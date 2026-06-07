# mcp-server — Infrastructure

## Database Schema (SQLite)

### Core Market Tables
```sql
watchlist (code TEXT PK, company_name, exchange DEFAULT 'HOSE', domain DEFAULT 'other',
  notes, added_at, alert_drop_pct DEFAULT -3, alert_rise_pct DEFAULT 5,
  alert_impact_min DEFAULT 7, alert_report_new DEFAULT 1)

market_prices (code TEXT PK, price REAL, change_amt, change_pct, volume, updated_at, exchange DEFAULT 'HOSE')

market_prices_history (code TEXT, price, volume, fetched_at, exchange, PK(code, fetched_at),
  INDEX idx_mph_code_fetched(code, fetched_at DESC))

daily_ohlcv (code TEXT, date TEXT, open, high, low, close, volume,
  updated_at, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
  PK(code, date), INDEX idx_daily_ohlcv_code_date(code, date DESC))
```

### Alert Tables
```sql
alerts (id TEXT PK, triggered_at, severity, signals_json, affected_actions_json,
  analysis_ids_json, message, read DEFAULT 0, user_note, notified_telegram DEFAULT 0,
  resolved_at, resolution_notes, sent_by DEFAULT 'server', confidence_score, validated_at)

custom_alert_rules (id INTEGER PK, code, predicate, threshold, status DEFAULT 'active',
  created_at, triggered_at, notes)

alert_mutes (code TEXT PK, muted_until, reason)
price_alerts (id INTEGER PK, code, alert_type, threshold, status DEFAULT 'active', ...)
broker_sanctions (id INTEGER PK, broker_name, sanction_start, sanction_end, severity, source, ...)
```

**Additional schema files:** macro, financial-reports, briefings, system, news, portfolio, backtesting (16 total)

## Fetcher Implementations (41 fetchers)

### Price Data
| Fetcher | Source | Timeout | Fallback |
|---------|--------|---------|----------|
| `hose.ts` | VnDirect api-finfo v4 | exponential backoff (1m→30m cap) | legacy finfo-api |
| `foreignFlowFetcher.ts` | VPS :5005 | 5s + circuit breaker (5 fail→open, 30s reset) | cache→SSE→none |

### News & Events
| Fetcher | Source |
|---------|--------|
| `rss.ts` | Cafef, VnExpress, VnEconomy feeds |
| `newsapi.ts` | NewsAPI.org (100 req/day limit) |
| `cafef.ts`, `vnexpress.ts`, `reuters.ts` | Direct scrapers |
| `sscInsider.ts` | SSC insider trading registry |
| `sbvCircular.ts` | Central Bank circulars |

### Macro
| Fetcher | Source | Rate Limit |
|---------|--------|------------|
| `fredApi.ts` | US Federal Reserve (FRED) | 120 calls/60s |
| `tradingEconomics.ts` | TE macro calendars | - |
| `shippingIndex.ts` | BDI, FBX, SCFI | - |
| `weatherVn.ts` | Typhoon/flood forecasts | - |
| `polymarket.ts` | Prediction market odds | - |

### Specialized
| Fetcher | Purpose |
|---------|---------|
| `bctcSourceRouter.ts` | BCTC PDF discovery routing |
| `bctcHttpFetcher.ts` | BCTC PDF download |
| `pdf.ts` + `pdfOcrWorker.ts` | Multi-tier extraction (Tabula→PyMuPDF→OCR) |
| `davPharmacy.ts` | Pharma supply data |
| `hydrologicalData.ts` | Water level forecasts |

## Repositories (6 SQLite implementations)
- `SqliteWatchlistRepository`, `SqliteMarketPriceRepository`
- `SqliteKinhDichScoreRepository`, `SqliteHexagramRepository`
- `SqliteJobRunRepository`, `SqliteVnstockRepository`

## Stores (40+ specialized)
- Alert lifecycle: `alertStore`, `alertMuteStore`, `customAlertRuleStore`
- Backtesting: `backtestPriceRepo`, `backtestSignalRepo`, `backtestResultRepo`
- Portfolio: `positionStore`, `tradeStore`, `pnlSnapshotStore`
- Predictions: `predictionStore`, `predictionClaimStore`
- Signal: `agentSignalStore`, `bctcSignalDebounce`

## Key Infrastructure Patterns
- **Circuit breaker:** `circuitBreakerRegistry.ts` (open/closed/half-open)
- **Rate limiter:** `rateLimiter.ts`
- **Resilient fetcher:** `resilientFetcher.ts` (retry + timeout + fallback)
- **Telegram notifier:** `notifiers/telegram.ts`
- **RAG vector store:** `rag/vectorstore.ts` (LanceDB)

## Telemetry

### Per-Call Counter Store (TSU-DEV-U1)
- **Module:** `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts`
- **Purpose:** Counts tool invocations in-process; survives across gateway SSE cutover (gateway dials per-call, drops connection — no sessionId)
- **API:** `incrementTool(name)` / `getSnapshot(): Record<string,number>` / `resetCounters()` / `getTool(name)`
- **Hook:** Handler proxy installed in `server.ts` after `registerAllTools()` — iterates `server._registeredTools`, wraps each handler with synchronous `Map.set()` increment
- **Flush job:** `scheduler/system/trackSessionToolUsageJob.ts` runs every 8h, writes `docs/agent-memory/modules/tool-usage-stats.json`
- **Schema:** `{ generatedAt, uniqueTools, toolCounts }` — `sessionCount` removed (meaningless post-gateway)

### Session Tool Cache (legacy — effectively dead in gateway model)
- **Module:** `apps/mcp-server/src/infrastructure/cache/sessionToolCache.ts`
- **Status:** Populated only when SSE sessionId is available; never fires in gateway mode. Retained for non-gateway deployments.

## Environment Variables
```
PORT, DB_PATH, VINAHOST_IP, VPS_PUSH_API_KEY,
FRED_API_KEY, NEWSAPI_KEY,
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```
