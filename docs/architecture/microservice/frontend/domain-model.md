# Frontend — Domain Layer Documentation

> Layer: `apps/frontend/app/domain/`
> Source of truth: zero imports from `app/lib/api/` or `app/components/`.

## Domain Types

### `StockQuote`

A single stock quote snapshot from the stock-price microservice.

```ts
interface StockQuote {
  ticker: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  price: number;        // VND
  priceRef: number;     // reference price (previous close)
  change: number;       // absolute change in VND
  changePct: number;    // percent change, e.g. 2.5 means +2.5%
  direction: "up" | "down" | "flat";
  colour: "up" | "down" | "ceil" | "floor" | "ref";
  volume: number;       // shares
  timestamp: string;    // ISO 8601
}
```

Source: `apps/frontend/app/domain/market.ts:16`

---

### `PricePoint`

Single OHLCV data point from `GET /stock/price/history`.

```ts
interface PricePoint {
  date: string;     // ISO date e.g. "2026-05-17"
  code: string;     // ticker symbol
  open?: number;
  high?: number;
  low?: number;
  close: number;    // closing price (required)
  volume?: number;
}
```

Source: `apps/frontend/app/domain/market.ts:34`

---

### `WatchlistStock`

An entry from the canonical watchlist mirroring `docs/data/system-map.json project.watchlist`.

```ts
interface WatchlistStock {
  ticker: string;
  company: string;
  sector: string;   // e.g. "Banking", "Real estate", "Securities"
  exchange: "HOSE" | "HNX" | "UPCOM" | string;
  active: boolean;
  note?: string;    // e.g. "Removed sprint-054"
}
```

Source: `apps/frontend/app/domain/market.ts` (WatchlistStock section)

---

### `WATCHLIST_STOCKS`

Compiled constant array of 33 entries (30 active + 3 inactive). Mirrors `docs/data/system-map.json project.watchlist` exactly. Must be kept in sync when the watchlist is updated.

Active tickers (30): VNM, FPT, VCB, HPG, BID, SHB, EIB, VHM, VIC, KBC, HUT, DIG, DXG, KDH, PDR, NVL, VRE, MSN, FRT, KDC, SAB, DPM, SSI, VIX, VND, VCI, DGC, VJC, GEX, BSR, DAG, DBC

Source: `apps/frontend/app/domain/market.ts` (WATCHLIST_STOCKS section)

---

### `groupBySector()`

Pure function. Groups a `WatchlistStock[]` by `sector` label. Excludes inactive stocks by default.

```ts
function groupBySector(
  stocks: WatchlistStock[],
  options?: { includeInactive?: boolean },
): Record<string, WatchlistStock[]>
```

- Default: `active = true` only
- `includeInactive: true` → include all entries
- Returns `{}` for empty input
- Keys are the exact `sector` string from each entry

Source: `apps/frontend/app/domain/market.ts` (groupBySector section)

---

### Macro types

```ts
interface MacroSourceEntry {
  status: "ok" | "failed" | string;
  latencyMs?: number;
  data?: Record<string, unknown>;
  error?: string;
}

interface MacroSourceRow {   // flattened for display
  name: string;
  status: "ok" | "failed" | string;
  latencyMs?: number;
  error?: string;
}

interface MacroSummary {
  ok: number;
  failed: number;
  totalLatencyMs?: number;
}

interface MacroData {         // GET /macro/external response envelope
  fetchedAt?: string;
  sources?: Record<string, MacroSourceEntry>;
  summary?: MacroSummary;
  // legacy fields for backward compat:
  source?: string;
  status?: string;
  indicators?: Record<string, unknown>;
}

interface MacroSignal {
  indicator: string;           // "oil_usd" | "gold_usd" | "usd_vnd"
  value: number;
  unit: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | string;
  impact: "HIGH" | "MEDIUM" | "LOW" | string;
}

interface MacroSnapshot {    // POST /macro/snapshot response
  vnIndex: number | null;
  oilUsd: number | null;
  goldUsd: number | null;
  usdVnd: number | null;
  signals: MacroSignal[];
  fetchedAt: string;
}
```

**`parseMacroSources(macro)`** — pure function. Flattens `MacroData.sources` into `MacroSourceRow[]` for the `MacroPanel` display table. Returns `[]` if `macro` is null or has no `sources` key.

Source: `apps/frontend/app/domain/market.ts:44–90`

---

### Kinh Dịch types

```ts
interface KinhDichMarket {
  hexagram: number;     // 1–64
  name: string;         // hexagram name in Vietnamese
  trend: string;        // e.g. "Thuận lợi"
  signal: string;       // e.g. "MUA", "GIỮ", "BÁN", "THẬN TRỌNG"
  confidence: number;   // 0.0–1.0
  timestamp: string;    // ISO 8601
}

interface KinhDichReading extends KinhDichMarket {
  stock: string;        // ticker code
  actionNote?: string;  // actionable advice in Vietnamese
  overallReading?: string;
}
```

Source: `apps/frontend/app/domain/market.ts:95–111`

---

### `SignalAccuracy`

Accuracy stats for a single `signal_type`, attached to `AgentSignal` when the Sprint B
outcome feedback loop endpoint is deployed.

```ts
interface SignalAccuracy {
  accuracy_rate: number | null;  // null when sample_count < 3 (insufficient history)
  sample_count: number;          // correct + incorrect outcomes (excludes NEUTRAL signals)
}
```

Source: `apps/frontend/app/domain/market.ts` (SignalAccuracy section)

---

### `AgentSignal`

Per-stock agent signal row from the `agent_signals` DB table.

```ts
interface AgentSignal {
  id: number;
  stockCode: string;
  signalType: string;     // "chain_catalyst" | "urgent_news" | "price_anomaly" | ...
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | string;
  confidence: number;     // normalised 0.0–1.0 (DB stores 0–100 integer)
  reasoning: string;
  createdAt: string;      // ISO or SQLite "YYYY-MM-DD HH:MM:SS" string
  accuracy?: SignalAccuracy;  // present only when Sprint B endpoint is deployed
}
```

`accuracy` is optional and defensive: callers must not assume its presence.
It is populated by `parseAccuracyFromResponse()` in `client.ts` when the endpoint
returns an `accuracy` map keyed by `signal_type`.

Signal type label mapping (for UI display):
- `chain_catalyst` → "cascade" (macro cascade event)
- `urgent_news` → "news"
- `price_anomaly` → "price"
- `cross_validate` → "validate"
- `fundamental_validation` → "BCTC"
- `price_confirmation` → "confirm"
- `verified_chain` → "verified"
- `signal_feedback` → "feedback"

Source: `apps/frontend/app/domain/market.ts` (AgentSignal section)

---

### `TASnapshot`

Single-point Technical Analysis snapshot from `POST /ta/ta/indicators`.

```ts
interface TASnapshot {
  code: string;
  rsi: number | null;                                         // RSI(14)
  macd: { line: number; signal: number; histogram: number } | null;
  movingAverages: { ma5: number | null; ma20: number | null; ma50: number | null };
  bollingerBands: { upper: number; mid: number; lower: number } | null;
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  computedAt: string;
}
```

Source: `apps/frontend/app/domain/market.ts:157–166`

---

## Business Rules

### `computeDecision(ta, reading, prices)` — Scoring

Pure function, moved 2026-07-09 (FACTORY-FRONTEND-extract-computeDecision) from the
`dashboard.analysis.tsx` route (interface layer) into `app/domain/analysis/decision.ts`
(domain layer) — layering fix, no behavior change. Thresholds are named consts
(`TA_TREND_SCORE`, `RSI_SCORE`, `KD_STRONG_SCORE`, `KD_CAUTION_SCORE`, `PRICE_TREND_SCORE`,
`PRICE_TREND_LOOKBACK`, `RSI_OVERSOLD`, `RSI_RECOVERY_CEILING`, `RSI_OVERBOUGHT`,
`STRONG_BUY_SCORE`, `BUY_SCORE`, `HOLD_SCORE`, `SELL_SCORE`) — see source for exact values.
The route imports `computeDecision`/`DecisionResult` from the domain module.

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

| Score | Label | Colors |
|---|---|---|
| ≥ 4 | MUA MẠNH | text-green-400 bg-green-950 |
| 2–3 | MUA | text-green-300 bg-green-900/30 |
| −1–1 | GIỮ | text-yellow-400 bg-yellow-900/20 |
| −2–−3 | BÁN | text-red-300 bg-red-900/30 |
| ≤ −4 | BÁN MẠNH | text-red-400 bg-red-950 |

Source: `apps/frontend/app/domain/analysis/decision.ts`

---

### `dashboard.analysis.tsx` formatters — split to `app/domain/formatters/*`

Moved 2026-07-09 (FACTORY-FRONTEND-split-dashboard-analysis) — 5 small pure helpers that
were inline, unexported functions in the `dashboard.analysis.tsx` route (interface layer):
signal/confidence/indicator label + colour formatters with zero React/API imports. Pure
move, one function per file, no behavior change.

| Function | File | Purpose |
|---|---|---|
| `signalColor(signal)` | `signal-color.ts` | Tailwind text-color class for a KD/market signal string |
| `confidencePct(confidence)` | `confidence-pct.ts` | 0-1 float → rounded `"NN%"` string |
| `confidenceLabel(confidence)` | `confidence-label.ts` | colour-coded confidence display for `AgentSignal.confidence` (null-safe — never fabricates 0%/50%) |
| `indicatorLabel(indicator)` | `indicator-label.ts` | Vietnamese label for a macro indicator key (legacy underscore + canonical keyed-object keys) |
| `directionLabel(direction)` | `signal-direction-label.ts` | English label + colour class for `AgentSignal.direction` (BULLISH/BEARISH/other) — distinct from the unrelated same-named VN-label helpers local to `dashboard.sector-cascade.tsx` / `dashboard.prediction-claims.tsx` |

`confidenceBar()` (returns JSX) moved to `app/components/analysis/ConfidenceBar.tsx` —
interface layer, not domain (it renders markup).

Same task also extracted ~24 presentational components out of the route into
`app/components/analysis/*.tsx` (one cluster per file, each <=120L): `StockSelector`,
`WatchlistTile`/`WatchlistOverviewGrid`, `SectorPeersBar`, `MacroImpactPanel`,
`KinhDichMarketPanel`, `MacroSignalPanel`, `StockTable`/`StockSearchForm`,
`AnalysisDecision`, `InfoSourcePanel` (+ `buildInfoSourceRows`/`buildInfoSourcePriceTaRows`
row builders), `StockSignalsPanel`, `MiniPriceTable`, `StockDetailPanel` (+
`StockDetailBottomGrid`), `AiDeepDivePanel` (+ `BriefSection`), `AccuracyDigestCard`,
`SectionShell` (`SectionCard`/`Row`). The route (`dashboard.analysis.tsx`) dropped from
1836L to 457L; only the loader, default export, and `AnalysisBriefDto`/
`AnalysisBriefResult`/`StockDetail` type contracts remain — those types are now exported
so the moved components can import them via a type-only import (same pattern already
used by `FinancialsZone`/`NewsBuzzZone`). Behavior-preserving; verified via a fresh
isolated dev-server curl + Playwright G12 render-gate (4/4 pass) against the split code.

### `dashboard.market-summaries.tsx` — split to `app/domain/market-summaries/format.ts` + `app/components/market-summaries/*`

Moved 2026-07-24 (FACTORY-FRONTEND-split-market-summaries) — same pattern as the
`dashboard.analysis.tsx` split above. 9 pure helpers, verbatim logic, one module:

| Function/const | Purpose |
|---|---|
| `PERIOD_LABELS` | VN labels for the 5 `PeriodType` values |
| `formatDateRange(start, end)` | `"start"` or `"start → end"` display string |
| `formatChangePct(pct)` | signed 1-decimal `"%"` string (bare string, NOT the canonical `app/domain/formatters/change-pct.ts` object) |
| `changePctColorClass(pct)` | Tailwind class, emerald/red/slate family (distinct color family from the canonical `text-green-400` formatter) |
| `directionArrow(direction)` | bare glyph string ↑/↓/—/"" (NOT the canonical `app/domain/formatters/direction-arrow.ts` object) |
| `directionArrowColorClass(direction)` | Tailwind class, emerald/red/slate/"" |
| `outlookLabel(outlook)` | VN label for recommendation outlook |
| `outlookColorClass(outlook)` | Tailwind badge class for recommendation outlook |
| `filterTickers(stocks, query)` | case-insensitive symbol filter, generic over `{symbol: string}` |

**Load-bearing caution honored:** `app/domain/formatters/change-pct.ts` and
`direction-arrow.ts` already exist and look same-purpose, but return OBJECTS
(`{formatted, symbol, cls}` / `{symbol, cls}`) with a different color family
(`text-green-400`) and always emit a symbol. This route's helpers return BARE
STRINGS with a different color family (`text-emerald-400`) and the symbol is a
separate opt-in call. Reusing the canonical versions would have changed the
rendered output, so `format.ts` keeps its own independent, verbatim exports —
same function names are safe since they live in a different module path with no
import collision at any call-site.

Presentational split into `app/components/market-summaries/*.tsx` (12 files, each
<=120L, no exceptions this time — the large `DetailView` was split once more into
`DetailView` (shell) + `DetailContent` (chips/narrative/tables) to stay under the
cap): `PeriodBadge`, `CountChip`, `PeriodPicker`, `SummaryCard`,
`TickerFilteredTable` (generic, houses `filterTickers`), `KeyEventsSection`,
`SectionHeader`, `ListView`, `StockPerformanceTable`, `RecommendationsTable`,
`DetailView`, `DetailContent`. The route (`dashboard.market-summaries.tsx`) dropped
from 955L to 324L; types, `fetchSummaries` (I/O — not a pure helper, stays put per
task scope), and the `loader`/default-export composition remain. The 9 domain
helpers are re-exported from the route module for backward-compat call-sites (the
loader test itself was re-pointed to import directly from `app/domain/market-summaries/format.ts`).
Components import route-file types via `import type` only (erased at compile —
zero runtime circular dependency between `routes/` and `components/`).
Behavior-preserving; verified via reference-identity + golden-value equivalence
tests (moved helpers are literally the same function objects the route re-exports)
plus `tsc --noEmit` clean + full Vitest suite unchanged vs baseline (2047/2049,
the 2 pre-existing failures are an unrelated Kinh Dịch `QUE_DESCRIPTIONS` map
issue, confirmed still red with this change stashed out). Live rebuild + Playwright
G12 render-gate is DEFERRED (user-gated rebuild, out of scope for this task).

---

## Service Health types

```ts
type ServiceStatus = "ok" | "degraded" | "down";

interface ServiceHealth {     // GET /health/:service
  service: string;
  status: ServiceStatus;
  latency?: number;          // ms; accepts latencyMs / latency_ms / latency aliases
  checkedAt?: string;        // accepts checkedAt / checked_at / timestamp aliases
  error?: string;
}
```

Source: `apps/frontend/app/domain/health.ts`
