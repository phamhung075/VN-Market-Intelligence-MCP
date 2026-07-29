# Frontend — Interface Layer Documentation

> Service: `apps/frontend/` | Layer: Interface (Remix routes + React components)

## Remix Routes

All routes live in `apps/frontend/app/routes/`.

| Route file | URL path | Data sources |
|---|---|---|
| `_index.tsx` | `/` | Gateway health check |
| `dashboard.tsx` | `/dashboard` (layout) | None (shared nav) |
| `dashboard._index.tsx` + `api.market-digest.tsx` | `/dashboard/` (Market Overview / Tổng Quan) | `GET /api/market-digest` (proxied via api.market-digest.tsx → mcp-server :3000). DTO: `{ items: [{id, text, ts, type, from_agent}], count, fetchedAt, data_asof }`. `items[].ts` drives each dish's per-item `ClientTimestamp`; the top-level `data_asof` (bare SQLite `"YYYY-MM-DD HH:MM:SS"`, no offset) drives a page-level `<FreshnessBadge slaTierKey="daily">` (FE-PG-_INDEX-FRESH-FIX) — normalised to ISO8601 UTC via the shared `parseDate` helper (`app/lib/formatDate.ts`) before being handed to the badge, avoiding host-TZ skew (this host resolves Europe/Paris, +2h). `fetchMarketDigestData(origin)` is the named, test-importable loader-body helper (same extraction pattern as `fetchMacroData`/`fetchAlertsData`). |
| `dashboard.server.tsx` | `/dashboard/server` | `GET /health` |
| `dashboard.fetch.tsx` | `/dashboard/fetch` | `GET /news/reuters/headlines`, `GET /news/bloomberg/headlines`, `GET /macro/external` |
| `dashboard.db.tsx` | `/dashboard/db` | `GET /stock/price/history?code=VNINDEX`, `GET /news/reuters/headlines` |
| `dashboard.vps.tsx` | `/dashboard/vps` | `GET /health/<service>` × 4 (news, macro, stock, pdf) |
| `dashboard.analysis.tsx` | `/dashboard/analysis` | SSR loader: `GET /kinh-dich/market`, `POST /macro/snapshot`, `GET /kinh-dich/reading/:code` × 8, `GET /stock/price/batch?tickers=…`, `GET /stock/price/history?code&days=90`, `POST /ta/ta/indicators`, `GET /mcp/api/signals/stock/:code?limit=10`, `GET /mcp/api/signals/stock/:code?limit=5&type=chain_catalyst`. Zone components (client-side useFetcher): `GET /api/price-history/:stock?days=90` (TechnicalZone), `GET /api/corporate-events?days=90` (CorporateEventsZone), `GET /api/financials` (FinancialsZone), `GET /api/reputation` (ReputationZone), `GET /api/news-buzz` (NewsBuzzZone), `GET /api/conviction-history?symbol=:stock` (ConvictionHistoryZone). Links to: `/dashboard/shareholders?code=<stock>`, `/dashboard/officers?code=<stock>`. |
| ~~`dashboard.technical.tsx`~~ | ~~`/dashboard/technical`~~ | DELETED FE-AHUB-INT-INTEGRATE — content merged into `TechnicalZone` component embedded in `/dashboard/analysis`. |
| `dashboard.alerts.tsx` + `api.alerts.tsx` | `/dashboard/alerts` | `GET /api/alerts?limit=100` (proxied via api.alerts.tsx → mcp-server :3000). `AlertSeverity = "low" \| "medium" \| "warning" \| "high" \| "critical"` — `"warning"` is a live backend-emitted value (amber styling). `parseAlertsDto` normalises unknown severities → `"medium"` at the data boundary. `severityColours()` has a `default:` belt-and-suspenders branch. |
| `dashboard.prediction-claims.tsx` + `api.prediction-claims.tsx` | `/dashboard/prediction-claims` | `GET /api/prediction-claims?limit=N&outcome=X` (proxied via api.prediction-claims.tsx → mcp-server :3000). See § Prediction Claims Trust-Surface Context below. |
| `dashboard.quality-audit.tsx` + `api.quality-checklist.tsx` | `/dashboard/quality-audit` | `GET /api/quality-checklist` (proxied via api.quality-checklist.tsx → mcp-server :3000). Each `checks[]` entry carries `last_verified` (type `unknown` at the DTO boundary — `parseQualityChecklistDto` is a pass-through cast, not runtime-validated); rendered per-check with a fresh/stale/unknown badge via `app/domain/formatters/check-verification.ts` (7-day window). See `docs/architecture/microservice/frontend/domain-model.md` § `dashboard.quality-audit.tsx` — per-check `last_verified` + staleness marker. |
| `dashboard.bctc.tsx` + `api.analysis-briefs.tsx` | `/dashboard/bctc` (Financial Reports hub / Báo Cáo Tài Chính) | `GET /api/analysis-briefs` (proxied via api.analysis-briefs.tsx → mcp-server :3000). DTO: `{ generated_at, count, items: [{ticker, exchange, latest_period, released, verdict_label, verdict_summary, confidence, updated_at}] }`. `generated_at` is already a real ISO8601 UTC string server-side (mcp-server's `analysisBriefIndexHandler`/`readAnalysisBriefIndex` — `new Date().toISOString()`, no naive-SQLite normalization needed) and now drives a page-level `<FreshnessBadge slaTierKey="event">` (FE-PG-BCTC-FRESH-FIX) next to the existing `ClientTimestamp` — `fetchAnalysisBriefs(origin)` (pre-existing named loader-body helper) now threads it straight through instead of discarding it for a second, independently-computed frontend-local timestamp. Per-item `updated_at` (file mtime) stays plain text, unchanged. |
| `dashboard.intel.tsx` + `api.market-digest.tsx` | `/dashboard/intel` (AI Bulletin Hub / Bản Tin AI — CHEF Bulletin Hub) | Same endpoint as `dashboard._index.tsx`: `GET /api/market-digest` (proxied via api.market-digest.tsx → mcp-server :3000). DTO: `{ items: [{id, text, ts, type, from_agent}], count, fetchedAt, data_asof }`. `items[].ts` drives each dish's per-item `ClientTimestamp`; the top-level `data_asof` (bare SQLite `"YYYY-MM-DD HH:MM:SS"`, no offset) now also drives a page-level `<FreshnessBadge slaTierKey="daily">` (FE-PG-INTEL-FRESH-FIX) — normalised to ISO8601 UTC via the shared `parseDate` helper (`app/lib/formatDate.ts`), same reuse pattern as the `dashboard._index.tsx` sibling (never forked). `fetchIntelData(origin)` is the named, test-importable loader-body helper (pre-existing extraction, same pattern as `fetchMarketDigestData`/`fetchAnalysisBriefs`). |

### Loader pattern

All loaders follow the same pattern:
1. `Promise.allSettled()` for parallel, per-source error isolation
2. Fulfilled → use value; rejected → push to `errors[]`, use empty/null fallback
3. `fetchedAt: new Date().toISOString()` added to every loader response

### Error response shape

```ts
{ errors: string[] }  // present on all dashboard routes
```

Errors are passed through `toUserFriendlyError()` before display to strip internal API paths.

## Prediction Claims Trust-Surface Context (`dashboard.prediction-claims.tsx`)

FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY (2026-07-25): the calibration banner no
longer renders a bare hit-rate. Full endpoint contract lives in the route
file's own header comment (`apps/frontend/app/routes/dashboard.prediction-claims.tsx:1`)
— this section documents ONLY what the frontend adds around the server figure
(no hitRate recomputation happens client-side):

- **`fetchPredictionClaimsData` double-fetch:** an `?outcome=` filter now
  triggers TWO upstream calls — an always-unfiltered "context" fetch (source
  of `calibration` + `lastScoredAt`) and, only when a filter is active, a
  second filtered fetch for the display list. This keeps the calibration
  banner correct on every filter tab (`Đang chờ`, `Loại trừ`, …), since a
  filtered response alone would lack the correct/wrong rows needed to compute
  the staleness marker. Unfiltered ("Tất cả") view still makes exactly one call.
- **`computeLastScoredAt(claims)`** — max `resolvedAt` among `outcome ∈
  {correct, wrong}` only. `excluded` rows also carry a non-null `resolvedAt`
  (set by `excludeClaim()` server-side) but are NOT a scoring event and are
  explicitly excluded from this computation (regression-guarded by a unit test).
- **`describeStaleness(lastScoredAt, now)`** — `STALE_THRESHOLD_DAYS = 14`
  (see constant doc comment for the reasoning). Returns `null` when no claim
  has ever been scored (nothing to warn about beyond the existing "Chưa có"
  hit-rate state).
- **`formatHitRateDenominator` / `formatDispositionBreakdown`** — pure string
  composition over the given `calibration` fields only (`correct`, `wrong`,
  `resolved`, `total`, `pending`, `excluded`); never derives a new ratio.
- **`resolveExclusionReason(claim)`** — consumes `claim.exclusionReason` when
  present and non-empty (producer: FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE
  deliverable (c), NOT YET SHIPPED as of this change — the field is optional
  and currently absent on every live row); falls back to
  `GENERIC_EXCLUSION_REASON` otherwise. Rendered per-claim on excluded
  `ClaimCard`s and as a `title` tooltip on the aggregate "Loại trừ" chip.

## Shared Components

### `app/components/ClientTimestamp.tsx`

**Purpose:** Eliminates React hydration errors from `toLocaleString("vi-VN", {timeZone: "Asia/Ho_Chi_Minh"})` mismatches between Node SSR and browser ICU.

**Problem solved:** Node SSR and browser produce different locale-formatted strings for Vietnamese timezone. The mismatch propagates to the React root and triggers `"the entire root will switch to client rendering"`. `suppressHydrationWarning` on individual elements does not prevent the root-level cascade.

**Solution:** SSR renders `"..."` placeholder. After mount, `useEffect` sets the locale-formatted string. No mismatch at any tree level.

#### `ClientTimestamp`

```tsx
interface ClientTimestampProps {
  iso: string;      // ISO 8601 date-time string from loader
  className?: string; // Tailwind classes forwarded to <span>
}
```

Renders full date + time via `toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })`.
SSR output: `<span>...</span>`
Client output: `<span>17/05/2026, 16:30:00</span>`

Source: `apps/frontend/app/components/ClientTimestamp.tsx:42`

#### `ClientTimeString`

```tsx
interface ClientTimeStringProps {
  iso: string;
  className?: string;
}
```

Renders time-only via `toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })`.
Used in `dashboard.vps.tsx` for per-row `checkedAt` cells.

Source: `apps/frontend/app/components/ClientTimestamp.tsx:70`

## Analysis Dashboard — Stock Detail Panel (`dashboard.analysis.tsx`)

### Stock Selector (StockSelector)

Always visible at the top of the analysis page. Renders all 30 active watchlist tickers as clickable badges grouped by sector label. Selected ticker is highlighted blue. Clicking navigates to `?stock=XXX`; clicking the selected badge navigates to `.` (deselects).

Sector groups are derived from `groupBySector(WATCHLIST_STOCKS)` — a pure function in `app/domain/market.ts`.

### Watchlist Overview Grid (WatchlistOverviewGrid)

Visible only when no `?stock=` param is present. Shows all 30 active stocks as tile cards grouped by sector. Each tile shows ticker, company, exchange badge, last close price + change %, signal count. Tiles use `WatchlistTileData` from `fetchWatchlistPrices()`. Degrades gracefully: if price fetch fails, tiles show "Không có giá".

### Loader — always-on fetches (both selected and overview modes)

1. `GET /kinh-dich/market` — overall market hexagram
2. `POST /macro/snapshot` — macro signals (oil, gold, FX)
3. `GET /kinh-dich/reading/:code` × 8 (KD_SAMPLE_TICKERS) — sample KD overview table
4. `GET /stock/price/batch?tickers=<all_active_tickers>` — lightweight tiles (non-fatal, returns `{}` on error)

### Loader — selected stock fetches (only when `?stock=CODE`)

5. `GET /kinh-dich/reading/:code` — reading for selected stock (required)
6. `GET /stock/price/history?code&days=90` — 90-day OHLCV (required)
7. `POST /ta/ta/indicators` body `{ code, date: "YYYY-MM-DD" }` — TA snapshot (non-fatal, null on failure)
8. `GET /mcp/api/signals/stock/:code?limit=10` — per-stock agent signals (non-fatal, null on failure)
9. `GET /mcp/api/signals/stock/:code?limit=5&type=chain_catalyst` — cascade macro signals (non-fatal, [] on failure)

Non-fatal fetches set `detail.ta = null`, `detail.signals = null`, or `detail.cascadeSignals = []` respectively; the UI degrades gracefully.

The `/mcp/api/signals/stock/:code` endpoint is served by the mcp-server (routed via api-gateway proxy: `/mcp/*` → `http://mcp-server:3000`). It queries the `agent_signals` table filtered by `stock_code`, ordered by `created_at DESC`.

### Detail panel layout

```
[SectorPeersBar — peer tickers in same sector with direction badges]
[Chart — full width (StockChart, 560px)]
[AnalysisDecision — full width, colored background]
[InfoSourcePanel — full width, 5-row data source table]
[MacroImpactPanel — cascade macro signals for this stock]
[StockSignalsPanel — full width, agent signals table (last 10)]
[Kinh Dịch column | Price table column]
```

### SectorPeersBar

Rendered immediately below the stock detail header. Queries `WATCHLIST_STOCKS` for stocks sharing the same `sector` value as the selected stock. Each peer shows: ticker (blue, clickable to `?stock=PEER`) + direction arrow + changePct%. Uses `WatchlistTileData` from the batch price fetch (already in loader; no extra HTTP call).

### MacroImpactPanel

Shows cascade agent signals (`signal_type = 'chain_catalyst'`) for the selected stock. Format: reasoning text + BULLISH/BEARISH label + confidence % + date. Falls back to "No macro cascade in 24h" when the array is empty.

### `computeDecision` scoring

Pure function exported from the route for testability.

| Condition | Score |
|---|---|
| TA trend BULLISH | +2 |
| TA trend BEARISH | −2 |
| KD signal contains "MUA" | +2 |
| KD signal contains "BÁN" | −2 |
| KD signal contains "THẬN TRỌNG" | −1 |
| RSI 30–50 | +1 |
| RSI > 70 | −1 |
| RSI < 30 | +1 (oversold recovery) |
| close[-1] > close[-5] | +1 |
| close[-1] < close[-5] | −1 |

| Score | Label | Color |
|---|---|---|
| ≥ 4 | MUA MẠNH | text-green-400 bg-green-950 |
| 2–3 | MUA | text-green-300 bg-green-900/30 |
| −1–1 | GIỮ | text-yellow-400 bg-yellow-900/20 |
| −2–−3 | BÁN | text-red-300 bg-red-900/30 |
| ≤ −4 | BÁN MẠNH | text-red-400 bg-red-950 |

### `fetchTASnapshot`

```ts
fetchTASnapshot(code: string): Promise<TASnapshot>
// POST /ta/ta/indicators { code, date: "YYYY-MM-DD" }
```

Located in `app/lib/api/client.ts`. Response shape defined in `app/domain/market.ts` as `TASnapshot`.

### `fetchStockSignals`

```ts
fetchStockSignals(code: string, limit?: number): Promise<AgentSignal[]>
// GET /mcp/api/signals/stock/:code?limit=10
```

Located in `app/lib/api/client.ts`. Calls `parseAccuracyFromResponse()` on the raw envelope.

**Response envelope (Sprint B+):**
```json
{
  "signals": [...],
  "accuracy": {
    "chain_catalyst":  { "accuracy_rate": 0.7, "sample_count": 10 },
    "urgent_news":     { "accuracy_rate": 0.37, "sample_count": 8 }
  },
  "code": "VCB",
  "count": 10
}
```

If `accuracy` key is absent (Sprint B not yet deployed), signals are returned unchanged with `accuracy: undefined`.

Maps raw snake_case DB rows to `AgentSignal` domain objects. Normalises `confidence_score` (0–100 integer) → `confidence` (0.0–1.0 float).

### `parseAccuracyFromResponse` (exported helper)

```ts
parseAccuracyFromResponse(data: Record<string, unknown>): AgentSignal[]
```

Pure-ish function. Parses `data.signals` into `AgentSignal[]`. If `data.accuracy` is a non-null object, attaches the matching `SignalAccuracy` entry to each signal where `signal.signalType === accuracyKey`. Signals with no matching key get `accuracy: undefined`. Exported for unit-testing without mocking fetch.

### `accuracyBadgeProps` (exported helper)

```ts
accuracyBadgeProps(acc: SignalAccuracy): { color: "green" | "amber" | "red" | "grey"; label: string }
```

Badge colour + label derivation rules:

| Condition | Color | Label |
|---|---|---|
| `sample_count < 3` or `accuracy_rate === null` | grey | "New" |
| `accuracy_rate >= 0.70` | green | e.g. "70%" |
| `0.40 <= accuracy_rate < 0.70` | amber | e.g. "55%" |
| `accuracy_rate < 0.40` | red | "Low" |

Exported for unit-testing badge logic independently of React.

`AgentSignal` and `SignalAccuracy` domain types are defined in `app/domain/market.ts`.

### `StockSignalsPanel`

Renders below `InfoSourcePanel` in the stock detail panel. Shows a table of the last 10 agent signals for a stock.

| Column | Content |
|---|---|
| Time | HH:mm if today, MM-DD HH:mm otherwise |
| Source | Signal type badge (human-readable: "cascade", "news", "BCTC", etc.) |
| Direction | BULLISH↑ (green) / BEARISH↓ (red) / NEUTRAL (slate) |
| Confidence | % with colour: ≥70% green, 40–69% amber, <40% slate |
| Accuracy | Badge from `AccuracyBadge` component — absent = "—", green/amber/red/grey per `accuracyBadgeProps` |
| Why | `reasoning` text (truncated with tooltip) |

Accuracy badge colours (Tailwind):
- green: `bg-green-100 text-green-800` — ≥70% accuracy
- amber: `bg-yellow-100 text-yellow-800` — 40–69%
- red: `bg-red-100 text-red-800` — <40%
- grey: `bg-slate-700 text-slate-400` — insufficient samples (New)
- dash: `text-slate-600` — accuracy field absent (Sprint B not deployed)

If `signals === null`: shows "Unavailable" message.
If `signals.length === 0`: shows "No signals recorded for this stock yet."

## UI Components (shadcn/ui primitives)

Located in `apps/frontend/app/components/ui/`:
- `button.tsx` — Radix UI Slot-backed button
- `card.tsx` — card container
- `input.tsx` — form input

## Analysis Hub — Stock-Scoped Zone Components

Located under `apps/frontend/app/components/analysis/`. Each accepts a `stock: string` prop and is self-contained (uses `useFetcher` + `useEffect` to fetch its own data — no parent pre-fetch required).

| Component | File | Filter strategy | API endpoint |
|---|---|---|---|
| `CorporateEventsZone` | `CorporateEventsZone.tsx` | CLIENT-SIDE — `events.filter(e => e.code === stock)` | `GET /api/corporate-events?days=90` (full universe; no per-code param) |
| `ReputationZone` | `ReputationZone.tsx` | CLIENT-SIDE — `leaderboard.find(e => e.code === stock)` | `GET /api/reputation` (full universe) |
| `NewsBuzzZone` | `NewsBuzzZone.tsx` | CLIENT-SIDE — `leaderboard.find(e => e.code === stock)` | `GET /api/news-buzz` (full universe, 7-day window) |
| `ConvictionHistoryZone` | `ConvictionHistoryZone.tsx` | NATIVE — `?symbol=${stock}` passed to API | `GET /api/conviction-history?symbol=${stock}` |
| `FinancialsZone` | `FinancialsZone.tsx` | CLIENT-SIDE — `rows.find(r => r.code === stock)` | `GET /api/financials` (full universe, ~78 rows; no per-code param) |
| `TechnicalZone` | `TechnicalZone.tsx` | NATIVE — per-stock endpoint `GET /api/price-history/${stock}?days=90` | `GET /api/price-history/${stock}?days=90` (90-day OHLCV candles; re-fetches on stock change + 5 min auto-refresh) |

### Exported pure helpers (testable without DOM)

**CorporateEventsZone:** `filterStockEvents(events, stock)` → `CorporateEvent[]`, `deriveSortedCategories(events)` → `string[]`

**ReputationZone:** `filterReputationEntry(leaderboard, stock)`, `filterReputationHistory(history, stock)`

**NewsBuzzZone:** `filterNewsBuzzEntry(leaderboard, stock)`

**ConvictionHistoryZone:** `pickStockConvictionRow(snapshot, stock)`, `pickStockSeries(series, stock)`

**FinancialsZone:** `findFinancialsRow(rows, stockCode)` → `FinancialsRow | null`

**TechnicalZone:** `isPriceHistoryDto(value)` → `boolean`, `derivePeriodStats(candles)` → `PeriodStats | null`, `candlesToPricePoints(candles, ticker)` → `PricePoint[]`

### Loading lifecycle

All zone components show an animated loading placeholder until `useFetcher.state === "idle"` AND `fetcher.data` is defined. The load is triggered once on mount (or when `stock` changes for ConvictionHistoryZone). FinancialsZone loads once on mount only — the full-universe payload is filtered client-side so stock changes do not require re-fetch.

### Data constraints (FinancialsZone)

- `nim` and `npl` fields are NULL for all rows in the dataset (bank-only metrics, unpopulated) — intentionally omitted from the UI.
- `eps = 0` is a legitimate value, rendered as "0" (not "—").
- The `/api/financials` endpoint has NO per-stock query param — always returns all ~78 rows. Scoping is CLIENT-SIDE only via `FinancialsRow.code`.

### Data constraints (TechnicalZone)

- Candles with `close===0 && volume===0` are non-trading-day poison rows; `derivePeriodStats` and `PriceChartSection` filter them before computing high/low/range annotations — same predicate as `sanitizePrices()` in `StockChart/indicators.ts`.
- TA indicators (RSI, MACD, Bollinger Bands) are **client-computed** by `StockChart` from candle data; no server-side TA values are expected or fabricated.
- `stale_served=true` triggers an amber banner (cache fallback). `data_source="unavailable"` or a non-DTO proxy payload triggers the red degraded banner.
- The proxy endpoint `GET /api/price-history/${stock}?days=90` re-fetches on stock prop change and auto-refreshes every 5 minutes (intraday SLA).

### Not-found state

Reputation and NewsBuzz show a "no data for this ticker" message when the client-side filter returns `undefined`. ConvictionHistoryZone shows the same when `snapshot.length === 0`.

---

## Error Handling

All route components render an error banner when `errors.length > 0`:

```tsx
<div role="alert" aria-live="polite" className="...border-red-700...">
  {errors.map((e) => <p>{toUserFriendlyError(e)}</p>)}
</div>
```

The `toUserFriendlyError` function (co-located in fetch and db route files) strips internal API paths:
- Input: `"Reuters: ApiError: GET /news/reuters/headlines failed: 404 Not Found"`
- Output: `"Reuters: data temporarily unavailable"`
