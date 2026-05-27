# Tool Group: news-analysis (mcp-server)

**Module path:** `src/interface/mcp/tools/news-analysis/`
**Scheduler:** `src/scheduler/news-analysis/` (5 jobs)
**Domain services:** cascadeEngine, sentimentClassifier, newsNormalizer, chainSynthesizer, sourceHealthTracker, sentimentTrend, embeddingTextBuilder

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `fetch_and_analyze` | Fetch news for ticker and run cascade analysis | ticker, query | market.db (news_items) + rag-service |
| `search_similar_context` | Semantic RAG search on stored news/reports | query, limit | rag-service (HTTP) |
| `run_impact_chain` | Run cascade impact chain from a news item | news_id or text | cascadeEngine domain svc |
| `get_sentiment_trend` | Sentiment trend for ticker/market over N days | ticker?, days | market.db (rag_analyses, cascade_*) |
| `get_cascade_metrics` | Cascade engine performance metrics | — | market.db (cascade_*) |
| `get_cascade_outcomes` | Cascade chain outcomes by ticker | ticker? | market.db (cascade_*) |
| `get_open_chain_findings` | Open (unresolved) cascade chain findings | — | market.db (signals, cascade_*) |
| `get_source_health` → `get_system_status` | News source health (merged into system status) | — | market.db |
| `get_broker_credibility` | Broker credibility score from news/sanctions | broker | market.db |

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `intelligenceCycleJob` | Every 15min | Main news cycle: fetch → parse → embed → cascade |
| `dataAuditJob` | Hourly | Audit data freshness, prune stale NULL-outcome signals |
| `evidenceAccumulatorJob` | Every 30min | Accumulate evidence items for open chains |
| `patternWatchJob` | Every 6h | Detect recurring patterns in cascade outcomes |
| `sscCheckerJob` | Daily | Check SSC for new regulatory filings |

---

## Data Flow

```
VPS push (POST /api/push-news, 226 items/15min cycle from 10 sources)
  → newsNormalizer
  → embeddingTextBuilder
  → rag-service (embed + store in LanceDB)
  → SQLite news_items
  → cascadeEngine (impact scoring, chain detection)
  → signalDetector (adaptive thresholds)
  → alertGenerator → alertDedup / alertCooldown → Alert
```

---

---

## Dashboard (NF-LD-4 — served from mcp-server)

**Served URL:** `http://localhost:3000/dashboards/news-fetch/`

mcp-server serves the news-fetch pilot dashboard statically at the route above. The dashboard provides:
- 3 sandbox PASS/FAIL panels (Primitives / Module / Microservice) — rendered from committed `data.js` sidecar
- 1 Live Data panel — fetches `GET /api/news-fetch/live` (relative, same-origin) to show recent `rag_analyses` rows for Reuters/Bloomberg

**Static files location:** `apps/mcp-server/src/interface/news-fetch-dashboard/`
- `index.html` — GENERATED copy (relative ENDPOINT); canonical source: `apps/news-fetch/dashboard/index.html`
- `data.js`, `rerun-handler.js`, `results.json` — verbatim copies

**Sync script:** `apps/mcp-server/sync-news-fetch-dashboard.sh` (also: `bun run sync-news-fetch-dashboard`)
- Copies verbatim assets, rewrites ENDPOINT to relative, injects GENERATED header
- Run after any change to `apps/news-fetch/dashboard/` to keep copies in sync

**Architecture decision (NF-LD-4-design):** Option B — served from mcp-server (same-origin as `rag_analyses` data and the `/api/news-fetch/live` endpoint). No CORS, no Dockerfile change (existing `COPY apps/mcp-server/src/ ./src/` includes the new subdirectory). Handler: `newsFetchDashboardHandler.ts` (DDD interface layer — no db parameter, no getDb(), no credentials).

**Security:** static files contain zero credentials, zero API keys. Live endpoint is SELECT-only (frozen from NF-LD-2a). file:// degrade branch stays as graceful fallback.

---

## Telegram Commands

| Command | Purpose | Source table | Argument | Chunking |
|---------|---------|-------------|----------|----------|
| `/news [N]` | Full-day deduped importance-ranked digest (NEWS-FULLDAY) | `rag_analyses` | Optional count N (no default cap; explicit N max 200) | Multi-message if digest > 4096 chars; each chunk split at story boundaries via `CommandResult.texts[]` loop in `webhookHandler.ts` |
| `/recap` | Day synthesis: VN-Index, movers, news, alerts, portfolio (RECAP-CMD) | In-container DB via `assembleEveningSummary` | None | Multi-message if > 4096 chars |
| `/recapw` | Weekly synthesis: period range, totals, key events, stock moves, alert breakdown (RECAP-CMD) | In-container DB via `generatePeriodicSummary("weekly")` | None | Multi-message if > 4096 chars |
| `/recapm` | Monthly synthesis (same shape as /recapw) (RECAP-CMD) | In-container DB via `generatePeriodicSummary("monthly")` | None | Multi-message if > 4096 chars |

### `/news [N]` — Full-day coverage (NEWS-FULLDAY sprint)

**Query logic (updated NEWS-FULLDAY):**
- Primary (no-arg): `created_at >= midnight-Vietnam-today (UTC+7)` ordered `impact_score DESC, created_at DESC` — **NO LIMIT** (full-day coverage).
- Explicit `/news N`: clamps to `MIN(MAX_LIMIT_EXPLICIT=200, N)`, applies LIMIT.
- Fallback (zero today-rows): most-recent `FALLBACK_LIMIT=20` rows, no date filter. Header changes to `Tin tức gần đây (N bài):`.
- Empty DB: returns `Chưa có tin hôm nay.`

**Dedup (NEWS-FULLDAY):**
- Same-story duplicates from multiple feeds (cafef / vnexpress / reuters) collapsed to one block.
- Key: normalized `source_title` (stripHtml → trim → lowercase → collapse whitespace → strip trailing punctuation).
- Tie-break: highest `impact_score` wins (SQL order guarantees this — first occurrence kept).
- Null/empty-after-normalize titles treated as unique (each kept individually).
- Header count reflects post-dedup story count.

**HTML strip (NEWS-FULLDAY):**
- `stripHtml()` applied to `source_title` and `summary` before render.
- Void elements (img, br, hr, etc.) discarded entirely. Anchor inner text preserved.
- `summary` truncated at 200 plain-text chars (after strip) with `…` if longer.

**Output constraints (NFR-1 / feedback_market_report_plain_vietnamese):**
- `sentiment` column mapped to Vietnamese label: positive → `tích cực`, negative → `tiêu cực`, neutral/null → `trung tính`.
- `impact_score` numeric value never surfaces in output.
- `source_url` not shown in story blocks.
- No raw HTML tags (`<`, `>`) in any output string.

### `/recap` `/recapw` `/recapm` — Recap commands (RECAP-CMD sprint)

**Data source:** 100% in-container DB — no filesystem volume, no network call in render path.
- `/recap` → `assembleEveningSummary({ db })` → typed `EveningSummary`.
- `/recapw` → `generatePeriodicSummary("weekly", undefined, db)` → typed `PeriodicSummary`.
- `/recapm` → `generatePeriodicSummary("monthly", undefined, db)` → typed `PeriodicSummary`.

**Section layout `/recap`:**
1. Header: `Tổng kết ngày {date}`
2. VN-Index (if available): `VN-Index: {close} điểm (tăng/giảm {|change|} điểm, tăng/giảm {|changePct|}%)`
3. Cổ phiếu nổi bật (always present; empty → `Không có cổ phiếu nào biến động đáng kể hôm nay.`)
4. Tin tức nổi bật (if topStories non-empty): stripped titles only
5. Cảnh báo (if topAlerts non-empty): `[SeverityLabel] message`
6. Danh mục (if portfolioPnl non-null): per-position + aggregate P/L
7. Khối ngoại (if foreignFlowMovers non-empty): net flow per stock

**Section layout `/recapw` and `/recapm`:**
1. Header: `Tổng kết tuần/tháng {periodStart} đến {periodEnd}`
2. Tổng quan (always present): news/alert/report counts
3. Sự kiện nổi bật (if keyEvents non-empty, up to 5): `{date} — {direction} — {title}`
4. Biến động cổ phiếu (if any non-null changePct): sorted by |changePct| DESC
5. Phân loại cảnh báo (if alertCount > 0): by severity + top alert messages

**Error/empty-state strings:**
- `/recap` error: `Lỗi khi tổng kết ngày. Vui lòng thử lại sau.`
- `/recapw` error: `Lỗi khi tổng kết tuần. Vui lòng thử lại sau.`
- `/recapm` error: `Lỗi khi tổng kết tháng. Vui lòng thử lại sau.`

**Constraints (NFR-1):**
- No `summaryText` / `buildSummaryText()` in render path (banned — English prose).
- No `recommendation`, `confidence`, `macroContext` shown.
- No `impact_score` numeric value shown.
- All direction shown as `tăng`/`giảm`/`mua ròng`/`bán ròng`/`lãi`/`lỗ`.
- `fmtNum` used for all VND amounts (vi-VN locale).
- `stripHtml` applied to all fields that may contain HTML (topStories titles, keyEvents titles).

**DDD layer:** handlers `handleNews`, `handleRecap`, `handleRecapWeek`, `handleRecapMonth` live in `src/infrastructure/notifiers/telegramCommands.ts`. Handlers call `application/usecases/assembleEveningSummary.ts` and `application/usecases/generatePeriodicSummary.ts` (infra → application = legal DDD direction). Chunking loop in `src/interface/mcp/routes/webhookHandler.ts` (unchanged).

**Shared helper:** `export function stripHtml(raw: string | null | undefined): string` — module-level in `telegramCommands.ts`. Used by `/news` (dedup normalization + render) and `/recap*` (story/event title render).

---

## Invariants

1. 10 news sources: CafeF (2), VnExpress, VnEconomy, Vietstock (3), VietnamBiz, VnBusiness, TuoiTre, NhanDan (2), NLD. BaoDauTu: INVESTIGATE (0 items — parsing issue task 1185).
2. Cascade engine: causal cascade framework from `docs/standards/market-analysis.md`.
3. `search_similar_context` uses multilingual-MiniLM embeddings (384-dim, local ONNX via rag-service).
4. `dataAuditJob` prunes stale NULL-outcome `agent_signals` (moved to dataAuditJob from separate pruner — 1863h).
