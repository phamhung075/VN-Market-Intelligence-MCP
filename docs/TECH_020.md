# TECH-020: Prediction Market Intelligence

status: APPROVED_BY_ARCHITECT
req_ref: REQ-020

---

## Brownfield Impact

- **Files created**:
  - `src/infrastructure/fetchers/polymarket.ts` — Polymarket REST fetcher (CLOB + Gamma)
  - `src/domain/services/predictionCascadeMapper.ts` — pure keyword-to-sector/stock mapper
  - `src/domain/services/predictionSignalDetector.ts` — pure signal detector (4 signal types)
  - `src/scheduler/predictionMarketJob.ts` — standalone 30-min job
  - `src/interface/mcp/tools/predictionTools.ts` — `get_prediction_markets` MCP tool
- **Files modified**:
  - `src/domain/services/signalDetector.ts` — extend `SignalType` union (+1 value)
  - `src/infrastructure/db/schema.ts` — add `prediction_markets` + `prediction_signals` tables
  - `src/infrastructure/config.ts` — add `PredictionMarketsConfig` interface + `McpConfig` field
  - `src/scheduler/jobs.ts` — add `CRONS.predictionMarketPoll` + `cron.schedule` call
  - `src/interface/mcp/tools/index.ts` — barrel export for `registerPredictionTools`
  - `src/interface/mcp/server.ts` — call `registerPredictionTools(server)` (toolCount 20 → 21)
  - `mcp.config.json` — add `predictionMarkets` section + `scheduler.predictionMarketPoll`
- **Files deleted**: none
- **Breaking changes**: no. `SignalType` union extension is additive — existing switch statements that do not exhaustively handle `"prediction_market"` will produce a TypeScript error only if they use exhaustive checks. The codebase uses no exhaustive switch on `SignalType` (confirmed by grep below).

---

## Brownfield Findings

### Exhaustiveness check on SignalType

The existing codebase has no exhaustive `switch` on `SignalType` (no `default: assertNever(type)` pattern). Adding `"prediction_market"` to the union is safe without touching any downstream file except `signalDetector.ts` itself.

### Existing `Signal` interface (domain/services/signalDetector.ts)

```typescript
export interface Signal {
  type: SignalType;
  severity: Severity;
  actionCode: string;
  message: string;
  confidence: number;
  detectedAt: string;
}
```

`PredictionSignal` will be a superset of `Signal` with prediction-market–specific metadata. The job layer converts `PredictionSignal` → `Signal` before passing it to `generateAlerts()`, which expects `Signal[]`. This avoids touching `alertGenerator.ts`.

### Config pattern (infrastructure/config.ts)

`McpConfig` is a typed interface that mirrors `mcp.config.json` exactly. All new fields must be added both to the JSON file and the TypeScript interface. The `loadConfig()` function uses `str()` / `num()` / `bool()` helpers and returns a flat merged object. New config fields should use the same helpers inside `loadConfig()`, or be returned as a nested raw object for complex shapes (see how `alerts.newsMention` is handled — it is read as a sub-object via `get(file, "alerts.newsMention")`).

### Scheduler pattern (src/scheduler/jobs.ts + src/interface/scheduler/index.ts)

All cron jobs are registered in `src/scheduler/jobs.ts` via `startScheduler()`. The `src/interface/scheduler/index.ts` file is currently a stub barrel with no exports — it is **not** the entry point. The actual scheduler entry point is `src/scheduler/jobs.ts`. The new job `predictionMarketJob.ts` must be imported and wired in `src/scheduler/jobs.ts`, following the same pattern as `runDailyAudit` / `runWeeklyAudit` (task 157).

### Alert flow

`Signal[]` → `generateAlerts()` (domain, pure) → `Alert[]` → `storeAlerts()` (infrastructure) → `sendTelegram()` (notifier). The prediction job follows this exact sequence, building `Signal` objects from `PredictionSignal` before entering the standard pipeline.

### MCP tool count

Current registered tools: 20 (confirmed in `server.ts`). Adding `registerPredictionTools` makes it 21. The probe-based `toolCount` computation in `server.ts` is automatic — no manual counter to update.

---

## Architecture Decision

Prediction market polling is implemented as a **standalone scheduler job** (`predictionMarketJob.ts`) rather than a new step inside `intelligenceCycleJob.ts`. This isolates the feature from the 15-min intelligence cycle, avoids merge conflicts with Sprint 019 work still in Review, and respects the different cadence (30 min, 24/7 vs 15 min, market-hours-aware). Signal conversion reuses the existing `Signal` interface and `generateAlerts()` path to avoid duplicating the alert persistence and Telegram notification logic.

The cascade mapper is a **pure domain function** with an ordered list of `KeywordRule` objects. Keyword matching uses case-insensitive `String.includes()` rather than regex for simplicity — each rule requires all of its `keywords` to match (AND semantics), and the first matching rule per stock code wins for direction, but all matching rules contribute to the union of sectors and stocks (OR across rules). This is consistent with how `cascadeEngine.ts` evaluates `SECTOR_RULES`.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `PredictionMarket` type | infrastructure/fetchers | `src/infrastructure/fetchers/polymarket.ts` | NEW |
| `fetchPolymarkets()` | infrastructure/fetchers | `src/infrastructure/fetchers/polymarket.ts` | NEW |
| `predictionCascadeMapper()` | domain/services | `src/domain/services/predictionCascadeMapper.ts` | NEW |
| `detectPredictionSignals()` | domain/services | `src/domain/services/predictionSignalDetector.ts` | NEW |
| `SignalType` union | domain/services | `src/domain/services/signalDetector.ts` | MODIFY |
| `prediction_markets` table | infrastructure/db | `src/infrastructure/db/schema.ts` | MODIFY |
| `prediction_signals` table | infrastructure/db | `src/infrastructure/db/schema.ts` | MODIFY |
| `PredictionMarketsConfig` | infrastructure/config | `src/infrastructure/config.ts` | MODIFY |
| `predictionMarketJob` | scheduler | `src/scheduler/predictionMarketJob.ts` | NEW |
| cron wiring | scheduler | `src/scheduler/jobs.ts` | MODIFY |
| `registerPredictionTools` | interface/mcp/tools | `src/interface/mcp/tools/predictionTools.ts` | NEW |
| tools barrel | interface/mcp/tools | `src/interface/mcp/tools/index.ts` | MODIFY |
| server tool registration | interface/mcp | `src/interface/mcp/server.ts` | MODIFY |
| `mcp.config.json` | config | `mcp.config.json` | MODIFY |

---

## Interface Contracts

### 1. `PredictionMarket` (infrastructure/fetchers/polymarket.ts)

```typescript
export interface PredictionMarket {
  id: string;               // Polymarket condition_id (stable identifier)
  question: string;         // "Will the Fed cut rates in June 2026?"
  endDate: string;          // ISO 8601 — market expiration
  yesPrice: number;         // 0.0–1.0 (e.g. 0.72 = 72% probability YES)
  noPrice: number;          // 0.0–1.0 (complement of yesPrice in binary markets)
  volume24h: number;        // USD traded in past 24 hours
  volumeTotal: number;      // USD all-time total volume
  liquidity: number;        // current liquidity pool in USD
  lastTradePrice: number;   // most recent trade price
  uniqueWalletsCount: number; // distinct wallet addresses that traded (from Gamma API)
  tags: string[];           // category tags (from Gamma API)
  fetchedAt: string;        // ISO 8601 timestamp of this fetch
}

export async function fetchPolymarkets(
  config: PredictionMarketsConfig,
): Promise<PredictionMarket[]>
```

**Implementation notes for the fetcher:**

The fetcher makes two sequential calls:
1. `GET https://clob.polymarket.com/markets?closed=false&limit=${config.maxMarketsPerPoll}` — primary data source.
2. After `config.rateLimitDelayMs` delay: `GET https://gamma-api.polymarket.com/markets?closed=false&limit=${config.maxMarketsPerPoll}` — enrichment source.

CLOB response shape (per item):
```typescript
interface ClobMarket {
  condition_id: string;
  question: string;
  end_date_iso: string;
  tokens: Array<{ outcome: "Yes" | "No"; price: number }>;  // price = probability
  volume: number;       // total all-time volume
  volume_24h?: number;  // may be absent — default 0
}
```

Gamma response shape (per item):
```typescript
interface GammaMarket {
  id: string;           // matches condition_id from CLOB
  conditionId?: string; // alternative match key
  uniqueWalletsCount?: number;
  tags?: Array<{ id: number; label: string }> | string[];
  liquidity?: number;
  lastTradePrice?: number;
}
```

Enrichment strategy: build a `Map<string, GammaMarket>` keyed by `id` and `conditionId`. For each CLOB market, look up by `condition_id`. Missing Gamma data defaults to `{ uniqueWalletsCount: 0, tags: [], liquidity: 0, lastTradePrice: yesPrice }`.

Relevance filter (applied after enrichment): a market is included if `question.toLowerCase()` contains at least one keyword from `config.relevantKeywords` OR `condition_id` is in `config.curatedMarketIds`. Markets that fail this filter are discarded before returning.

The fetcher must not import from `domain/` — all config types come from `src/infrastructure/config.ts`.

---

### 2. `CascadeMapping` and `predictionCascadeMapper` (domain/services/predictionCascadeMapper.ts)

```typescript
import type { DomainType } from "../../../bctc-schema.js";

export interface KeywordRule {
  /** All keywords must appear (case-insensitive) — AND semantics within one rule. */
  keywords: string[];
  domains: DomainType[];
  /** Specific stock codes this rule applies to directly. Use empty [] to fall back to watchlist. */
  stocks: string[];
  /** Whether YES outcome is good or bad for VN markets. */
  direction: "bullish" | "bearish" | "neutral";
  reasoning: string;
}

export interface CascadeMapping {
  domains: DomainType[];
  stocks: string[];
  direction: "bullish" | "bearish" | "neutral";
  matched: boolean;
  reasoning: string;
}

/**
 * Maps a prediction market question to affected VN sectors and stocks.
 *
 * @param question       - The market question string
 * @param watchlistCodes - All stock codes currently in the user's watchlist (for "all watchlist" rules)
 * @param customRules    - Optional additional rules injected at runtime (for testing / future extension)
 */
export function mapPredictionToCascade(
  question: string,
  watchlistCodes: string[],
  customRules?: KeywordRule[],
): CascadeMapping
```

**Keyword matching algorithm:**

```
q = question.toLowerCase()
matchingRules = rules where ALL rule.keywords have q.includes(keyword)
if matchingRules.length === 0: return zero-match fallback
domains = union of all matchingRules[*].domains (deduplicated)
stocks  = union of all matchingRules[*].stocks (deduplicated)
         + for rules with stocks=[], add all watchlistCodes
direction = matchingRules[0].direction   // first match wins for direction
reasoning = matchingRules.map(r => r.reasoning).join("; ")
```

**Mandatory keyword rules** (built-in, hard-coded in the module):

| Rule ID | Keywords (all must match) | Domains | Stocks | YES Direction |
|---|---|---|---|---|
| R01 | `["fed"]` + `["rate cut", "cut rates", "interest rate cut", "rate reduction"]` | `["banking"]` | `["VCB","TCB","BID","CTG"]` | bullish |
| R02 | `["fed"]` + `["rate hike", "rate rise", "tighten", "raise rates"]` | `["banking"]` | `["VCB","TCB","BID","CTG"]` | bearish |
| R03 | `["china"]` + `["tariff", "trade war", "trade barrier"]` | `["manufacturing","steel"]` | `["HPG","GAS"]` | bearish |
| R04 | `["us-china"]` OR `["china", "trade war"]` | `["manufacturing","steel"]` | `["HPG","GAS"]` | bearish |
| R05 | `["oil"]` OR `["crude"]` OR `["brent"]` OR `["opec"]` | `["oil_gas"]` | `["GAS","PLX"]` | neutral (direction depends on price direction — default neutral, resolved at runtime from yesPrice trend) |
| R06 | `["vietnam"]` + `["gdp", "growth", "economy"]` | all watchlist | `[]` | bullish |
| R07 | `["asean"]` OR `["southeast asia"]` | all watchlist | `[]` | neutral |
| R08 | `["war"]` OR `["conflict"]` OR `["sanctions"]` OR `["military"]` | all watchlist | `[]` | bearish |
| R09 | `["china"]` + `["gdp", "economy", "slowdown", "recession"]` | `["manufacturing","steel","tech"]` | `["HPG","FPT"]` | bearish |
| R10 | `["dollar"]` OR `["dxy"]` OR `["usd strength"]` | `["banking","retail"]` | `["VCB","VNM"]` | bearish |
| R11 | `["inflation"]` OR `["cpi"]` | `["banking","retail"]` | `["VCB","MWG"]` | bearish |
| R12 | `["tariff"]` OR `["import duty"]` OR `["trade barrier"]` | `["manufacturing"]` | `["HPG","VNM"]` | bearish |
| R13 | `["taiwan"]` OR `["taiwan strait"]` | `["tech","manufacturing"]` | `["FPT","HPG"]` | bearish |
| R14 | `["federal reserve"]` (standalone, catches "Fed" variants) | `["banking"]` | `["VCB","TCB","BID","CTG"]` | neutral |

**Implementation note on multi-keyword AND semantics:** R01 requires BOTH `"fed"` AND one of `["rate cut","cut rates","interest rate cut","rate reduction"]` to appear in the question. Implement as: rule has a `keywords: string[][]` (array of groups), where ALL groups must have at least one match. For backward compatibility with simple rules (R05–R13), a flat `string[]` means any one keyword must match.

**Revised `KeywordRule` interface:**

```typescript
export interface KeywordRule {
  /**
   * Matching semantics: AND across groups, OR within each group.
   * e.g. [["fed"], ["rate cut", "cut rates"]] means:
   *   question must contain "fed" AND ("rate cut" OR "cut rates").
   * For simple single-keyword rules: [["oil"]] or [["oil","crude","brent"]].
   */
  keywordGroups: string[][];
  domains: DomainType[];
  stocks: string[];
  direction: "bullish" | "bearish" | "neutral";
  reasoning: string;
}
```

---

### 3. `PredictionSignal` and `detectPredictionSignals` (domain/services/predictionSignalDetector.ts)

```typescript
import type { PredictionMarket } from "../../infrastructure/fetchers/polymarket.js";
// NOTE: domain importing infrastructure type — this is a deliberate exception.
// PredictionMarket is a data transfer object used as input to pure domain logic.
// Alternative: duplicate a domain-only type. Decision: use the fetcher type directly
// to avoid maintaining two identical structures. This is the same pattern used by
// cascadeEngine.ts importing AnalysisEntry from newsNormalizer.ts (also infrastructure-adjacent).
//
// ARCHITECT OVERRIDE: PredictionMarket should be defined as a domain interface in
// src/domain/services/predictionSignalDetector.ts (or a shared domain types file),
// with the fetcher returning that domain type. See "DDD Compliance Note" below.
```

**DDD Compliance Note:** To maintain strict DDD rules, `PredictionMarket` must be defined in `domain/` (or a neutral types file), not in `infrastructure/fetchers/`. The fetcher will import and return that domain type. The correct ownership is:

- `PredictionMarket` interface: defined in `src/domain/services/predictionSignalDetector.ts` (or a new `src/domain/models/predictionMarket.ts`)
- `src/infrastructure/fetchers/polymarket.ts` imports `PredictionMarket` from domain and returns `PredictionMarket[]`

This is the same pattern used by `cascadeEngine.ts` which defines `WatchlistEntry` and `CausalChain` in domain, then the infrastructure layer uses those types.

**Revised ownership:**

```typescript
// src/domain/services/predictionSignalDetector.ts — defines both types + detector function

export type PredictionSignalType =
  | "volume_spike"
  | "probability_shift"
  | "insider_timing"
  | "sentiment_divergence";

export interface PredictionMarket {
  id: string;
  question: string;
  endDate: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  volumeTotal: number;
  liquidity: number;
  lastTradePrice: number;
  uniqueWalletsCount: number;
  tags: string[];
  fetchedAt: string;
}

export interface PredictionSignal {
  marketId: string;
  marketQuestion: string;
  signalType: PredictionSignalType;
  severity: "low" | "medium" | "high" | "critical";
  yesPricePrev: number | null;
  yesPriceCurr: number;
  volume24h: number;
  uniqueWalletsCount: number;
  confidence: number;   // [0.1, 0.95] using formula from REQ-020
  reasoning: string;
  detectedAt: string;
}

export interface PredictionSignalConfig {
  volumeSpikeThresholdUsd: number;  // default 50000
  probabilityShiftPct: number;      // default 5 (= 0.05 as decimal)
  minUniqueWallets: number;         // default 10
}

export interface RecentSentimentEntry {
  actionCode: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
}

/**
 * Detects prediction market signals by comparing current vs previous snapshots.
 *
 * Pure function — zero I/O. The `hasRecentNewsForMarket` and `recentSentiments`
 * parameters are pre-fetched by the application/scheduler layer and injected here.
 *
 * @param current          - Markets fetched in this poll cycle
 * @param previous         - Markets from the previous stored snapshot (may be empty)
 * @param config           - Signal detection thresholds
 * @param hasRecentNews    - Set of market IDs that have a corresponding news entry
 *                           in rag_analyses within the past 2 hours (injected by job)
 * @param recentSentiments - Latest cascade sentiment per stock code (injected by job)
 */
export function detectPredictionSignals(
  current: PredictionMarket[],
  previous: PredictionMarket[],
  config: PredictionSignalConfig,
  hasRecentNews: Set<string>,         // market IDs with recent RAG news
  recentSentiments: RecentSentimentEntry[],
): PredictionSignal[]
```

**Confidence formula** (from REQ-020):
```
walletQuality  = min(1.0, uniqueWalletsCount / 100)
shiftMagnitude = min(1.0, |yesPriceCurr - yesPricePrev| / 0.20)
confidence     = clamp(walletQuality * 0.5 + shiftMagnitude * 0.5, 0.1, 0.95)
```
For `volume_spike` signals with no prev snapshot: `shiftMagnitude = 0`, `confidence = walletQuality * 0.5`.

**Signal severity mapping:**

| Signal type | Base severity | Downgrade condition |
|---|---|---|
| `insider_timing` | `"high"` | uniqueWallets < minUniqueWallets → `"low"` |
| `sentiment_divergence` | `"medium"` if confidence < 0.7, `"high"` if >= 0.7 | uniqueWallets < minUniqueWallets → `"low"` |
| `probability_shift` | `"medium"` | uniqueWallets < minUniqueWallets → `"low"` |
| `volume_spike` | `"low"` | (no downgrade) |

---

### 4. `SignalType` extension (domain/services/signalDetector.ts)

One-line change:

```typescript
// Before:
export type SignalType =
  | "price_drop"
  | "price_surge"
  | "volume_spike"
  | "report_new"
  | "news_mention";

// After:
export type SignalType =
  | "price_drop"
  | "price_surge"
  | "volume_spike"
  | "report_new"
  | "news_mention"
  | "prediction_market";
```

---

### 5. `PredictionMarketsConfig` (infrastructure/config.ts)

```typescript
export interface PredictionMarketsConfig {
  enabled: boolean;
  pollingIntervalMinutes: number;
  volumeSpikeThresholdUsd: number;
  probabilityShiftPct: number;
  minUniqueWallets: number;
  whaleTradeThresholdUsd: number;
  maxMarketsPerPoll: number;
  rateLimitDelayMs: number;
  relevantKeywords: string[];
  curatedMarketIds: string[];
}

// McpConfig — add field:
export interface McpConfig {
  // ... existing fields ...
  predictionMarkets: PredictionMarketsConfig;
}

// SchedulerConfig — add field:
export interface SchedulerConfig {
  // ... existing fields ...
  predictionMarketPoll: string;
}
```

**`loadConfig()` additions** (follow the `get(file, path)` pattern for nested objects):

```typescript
// In loadConfig(), add:
const predictionMarketsRaw = (get(file, "predictionMarkets") ?? {}) as Record<string, unknown>;

predictionMarkets: {
  enabled: boolVal(predictionMarketsRaw, "enabled", true),
  pollingIntervalMinutes: numVal(predictionMarketsRaw, "pollingIntervalMinutes", 30),
  volumeSpikeThresholdUsd: numVal(predictionMarketsRaw, "volumeSpikeThresholdUsd", 50000),
  probabilityShiftPct: numVal(predictionMarketsRaw, "probabilityShiftPct", 5),
  minUniqueWallets: numVal(predictionMarketsRaw, "minUniqueWallets", 10),
  whaleTradeThresholdUsd: numVal(predictionMarketsRaw, "whaleTradeThresholdUsd", 10000),
  maxMarketsPerPoll: numVal(predictionMarketsRaw, "maxMarketsPerPoll", 50),
  rateLimitDelayMs: numVal(predictionMarketsRaw, "rateLimitDelayMs", 500),
  relevantKeywords: arrVal(predictionMarketsRaw, "relevantKeywords", DEFAULT_PREDICTION_KEYWORDS),
  curatedMarketIds: arrVal(predictionMarketsRaw, "curatedMarketIds", []),
},
```

Note: `boolVal` and `arrVal` are small helpers to add alongside the existing `str()` / `num()` helpers. They follow the same `(obj, path, fallback)` signature.

---

### 6. SQLite schema additions (infrastructure/db/schema.ts)

Add to `initDatabase()` after the existing SBV rates block:

```sql
-- Prediction Markets snapshot (upsert by condition_id)
CREATE TABLE IF NOT EXISTS prediction_markets (
  id               TEXT PRIMARY KEY,   -- Polymarket condition_id
  question         TEXT NOT NULL,
  end_date         TEXT NOT NULL,      -- ISO 8601
  yes_price        REAL NOT NULL,      -- 0.0–1.0
  no_price         REAL NOT NULL,
  volume_24h       REAL NOT NULL DEFAULT 0,
  volume_total     REAL NOT NULL DEFAULT 0,
  liquidity        REAL NOT NULL DEFAULT 0,
  last_trade_price REAL NOT NULL DEFAULT 0,
  unique_wallets   INTEGER NOT NULL DEFAULT 0,
  tags             TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  fetched_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- Prediction Signals (append-only, FK → prediction_markets)
CREATE TABLE IF NOT EXISTS prediction_signals (
  id              TEXT PRIMARY KEY,         -- UUID
  market_id       TEXT NOT NULL,            -- FK → prediction_markets.id
  signal_type     TEXT NOT NULL,            -- volume_spike|probability_shift|insider_timing|sentiment_divergence
  severity        TEXT NOT NULL,            -- low|medium|high|critical
  yes_price_prev  REAL,                     -- NULL for volume_spike signals with no prior snapshot
  yes_price_curr  REAL NOT NULL,
  volume_24h      REAL NOT NULL DEFAULT 0,
  unique_wallets  INTEGER NOT NULL DEFAULT 0,
  confidence      REAL NOT NULL,
  mapped_sectors  TEXT NOT NULL DEFAULT '[]',  -- JSON DomainType[]
  mapped_stocks   TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  reasoning       TEXT NOT NULL,
  detected_at     TEXT NOT NULL,
  FOREIGN KEY (market_id) REFERENCES prediction_markets(id)
);

CREATE INDEX IF NOT EXISTS idx_prediction_signals_detected_at
  ON prediction_signals(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_signals_market
  ON prediction_signals(market_id);
CREATE INDEX IF NOT EXISTS idx_prediction_signals_severity
  ON prediction_signals(severity);
```

**Rationale for two tables:** `prediction_markets` is an upsert target (one row per market, overwritten each poll). `prediction_signals` is append-only (every detected signal is kept for audit and for the MCP tool's `signals_only` filter).

---

### 7. `predictionMarketJob.ts` (scheduler)

```typescript
// src/scheduler/predictionMarketJob.ts

export interface PredictionJobDeps {
  fetchMarketsFn?: (config: PredictionMarketsConfig) => Promise<PredictionMarket[]>;
  detectSignalsFn?: typeof detectPredictionSignals;
  mapCascadeFn?: typeof mapPredictionToCascade;
  sendTelegramFn?: (msg: string) => Promise<void>;
  db?: Database;
}

export async function runPredictionMarketJob(deps?: PredictionJobDeps): Promise<void>
```

**Job execution flow:**

```
1. cfg = loadConfig()
2. if !cfg.predictionMarkets.enabled → logger.debug + return
3. if lock is set → logger.warn("prediction job already running") + return
4. lock = true
5. db = deps.db ?? getDb()
6. watchlistCodes = db.query("SELECT code FROM watchlist").all().map(r => r.code)
7. previous = loadPreviousSnapshots(db)           // SELECT * FROM prediction_markets
8. current = await fetchPolymarkets(cfg.predictionMarkets)
9. if current.length === 0 → logger.warn + lock = false + return
10. upsertMarkets(db, current)                     // INSERT OR REPLACE INTO prediction_markets
11. hasRecentNews = queryRecentNewsMarketIds(db)   // SELECT source_url FROM rag_analyses WHERE created_at > NOW-2h
    // Note: "hasRecentNews" maps market question keywords to RAG entries — use simple keyword overlap check
    // This is a best-effort heuristic, not exact matching
12. recentSentiments = queryRecentSentiments(db)   // SELECT affected_actions, sentiment, confidence FROM rag_analyses ORDER BY created_at DESC LIMIT 50
13. signals = detectPredictionSignals(current, previous, cfg.predictionMarkets, hasRecentNews, recentSentiments)
14. persistSignals(db, signals, mappings)          // INSERT into prediction_signals
15. for each signal:
      mapping = mapPredictionToCascade(market.question, watchlistCodes)
      for each stock in mapping.stocks:
        domainSignal: Signal = {
          type: "prediction_market",
          severity: signal.severity,
          actionCode: stock,
          message: formatPredictionMessage(signal, market, mapping),
          confidence: signal.confidence,
          detectedAt: signal.detectedAt,
        }
        signals_by_stock[stock].push(domainSignal)
16. alerts = generateAlerts(all domainSignals)
17. storeAlerts(db, alerts)
18. for each HIGH/CRITICAL alert → sendTelegram(formatVietnamesePredictionAlert(alert, signals))
19. lock = false
```

**Concurrency guard:** module-level `let _isRunning = false`. Set before step 3 check, released in a `finally` block.

**Helper functions** (all in `predictionMarketJob.ts`, not exported from domain):

- `loadPreviousSnapshots(db)` — returns `PredictionMarket[]` from SQLite
- `upsertMarkets(db, markets)` — `INSERT OR REPLACE` loop
- `queryRecentNewsMarketIds(db)` — returns `Set<string>` of market IDs that have keyword overlap with recent RAG entries (heuristic: check if any rag_analyses `source_title` created within 2h shares 2+ words with market `question`)
- `queryRecentSentiments(db)` — reads last 50 RAG analyses, extracts `affected_actions` + `sentiment` + `confidence`
- `persistSignals(db, signals, mappings)` — inserts into `prediction_signals`
- `formatVietnamesePredictionAlert(alert, signals)` — produces the Vietnamese plain-text format from REQ-020 FR-9

---

### 8. `get_prediction_markets` MCP tool (interface/mcp/tools/predictionTools.ts)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPredictionTools(server: McpServer): void
```

**Tool schema:**
```typescript
server.tool(
  "get_prediction_markets",
  "Returns current Polymarket prediction markets relevant to Vietnamese stocks, with detected probability shift and volume spike signals.",
  {
    filter: z.enum(["all", "signals_only"]).optional().default("all"),
    limit: z.number().int().min(1).max(50).optional().default(20),
  },
  async ({ filter, limit }) => { ... }
)
```

**Query logic:**
```sql
-- All markets (joined with latest signals)
SELECT pm.*,
       GROUP_CONCAT(ps.signal_type) as active_signal_types,
       GROUP_CONCAT(ps.mapped_stocks) as all_mapped_stocks,
       GROUP_CONCAT(ps.mapped_sectors) as all_mapped_sectors
FROM prediction_markets pm
LEFT JOIN prediction_signals ps
  ON ps.market_id = pm.id
  AND ps.detected_at >= datetime('now', '-1 hour')
GROUP BY pm.id
ORDER BY pm.fetched_at DESC
LIMIT ?
```

For `signals_only` filter: add `HAVING active_signal_types IS NOT NULL`.

**Output shape:** matches REQ-020 FR-6 exactly.

---

## Polymarket API Research

### CLOB API

**Endpoint:** `GET https://clob.polymarket.com/markets`

**Parameters:**
- `closed=false` — open markets only
- `limit=100` — max per page (default 20, max 100)
- `next_cursor` — pagination token (not needed for initial implementation — first page is sufficient)

**Authentication:** None required for read-only access (unauthenticated tier).

**Rate limit (documented):** 10 requests/minute for unauthenticated. At 30-min polling with 1 CLOB call per cycle, we use 2 calls/hour = well within limits.

**Response shape:**
```json
{
  "limit": 100,
  "count": 87,
  "next_cursor": "...",
  "data": [
    {
      "condition_id": "0x1234...",
      "question_id": "...",
      "question": "Will the Fed cut rates in June 2026?",
      "description": "...",
      "market_slug": "fed-cut-june-2026",
      "end_date_iso": "2026-06-30T00:00:00Z",
      "game_start_time": null,
      "seconds_delay": 0,
      "fpmm": "0xabc...",
      "maker_base_fee": 0,
      "taker_base_fee": 0,
      "notifications_enabled": true,
      "neg_risk": false,
      "neg_risk_market_id": "",
      "neg_risk_request_id": "",
      "icon": "...",
      "image": "...",
      "rewards": { ... },
      "is_50_50_market": false,
      "tokens": [
        { "token_id": "...", "outcome": "Yes", "price": 0.72, "winner": false },
        { "token_id": "...", "outcome": "No",  "price": 0.28, "winner": false }
      ],
      "tags": [...],
      "volume": "250000.00",
      "volume_24hr": "125000.00",
      "active": true,
      "closed": false,
      "archived": false,
      "accepting_orders": true,
      "accepting_order_timestamp": null,
      "minimum_order_size": 1,
      "minimum_tick_size": 0.01,
      "status": "active"
    }
  ]
}
```

**Key extraction:**
- `condition_id` → `id`
- `tokens[outcome="Yes"].price` → `yesPrice` (float 0–1)
- `tokens[outcome="No"].price` → `noPrice`
- `parseFloat(volume)` → `volumeTotal`
- `parseFloat(volume_24hr ?? "0")` → `volume24h`

### Gamma API

**Endpoint:** `GET https://gamma-api.polymarket.com/markets`

**Parameters:**
- `closed=false`
- `limit=100`

**Authentication:** None required.

**Rate limit:** Not publicly documented; assume same 10 req/min tier. The `rateLimitDelayMs` (default 500ms) between CLOB and Gamma calls provides sufficient spacing.

**Response shape:**
```json
[
  {
    "id": "0x1234...",
    "conditionId": "0x1234...",
    "slug": "fed-cut-june-2026",
    "question": "Will the Fed cut rates in June 2026?",
    "description": "...",
    "startDate": "2026-01-01T00:00:00Z",
    "endDate": "2026-06-30T00:00:00Z",
    "image": "...",
    "icon": "...",
    "active": true,
    "closed": false,
    "archived": false,
    "new": false,
    "featured": false,
    "restricted": false,
    "liquidity": 75000.50,
    "volume": 250000.00,
    "openInterest": 42000.00,
    "lastTradePrice": 0.71,
    "bestBid": 0.70,
    "bestAsk": 0.73,
    "spread": 0.03,
    "outcomePrices": "[0.72, 0.28]",
    "volume24hr": 125000.00,
    "uniqueWalletsCount": 87,
    "tags": [
      { "id": 1, "label": "Economics" },
      { "id": 5, "label": "US Policy" }
    ],
    "cyom": false,
    "competitive": 0.95,
    "pagerDutyNotificationEnabled": true
  }
]
```

**Key extraction for enrichment:**
- Match on `id === condition_id` OR `conditionId === condition_id`
- `uniqueWalletsCount` → `uniqueWalletsCount` (default 0 if missing)
- `tags` may be `Array<{id, label}>` or string array — normalize to `string[]` via `tags.map(t => typeof t === "string" ? t : t.label)`
- `liquidity` → `liquidity`
- `lastTradePrice` → `lastTradePrice`

---

## `mcp.config.json` additions

### `predictionMarkets` section (new top-level key)

```json
"predictionMarkets": {
  "enabled": true,
  "pollingIntervalMinutes": 30,
  "volumeSpikeThresholdUsd": 50000,
  "probabilityShiftPct": 5,
  "minUniqueWallets": 10,
  "whaleTradeThresholdUsd": 10000,
  "maxMarketsPerPoll": 50,
  "rateLimitDelayMs": 500,
  "relevantKeywords": [
    "fed", "federal reserve", "interest rate", "rate cut", "rate hike",
    "china", "us-china", "trade war", "tariff", "sanctions",
    "oil", "crude", "brent", "opec",
    "vietnam", "asean", "southeast asia",
    "war", "conflict", "military",
    "dollar", "dxy", "inflation", "cpi",
    "taiwan", "strait"
  ],
  "curatedMarketIds": []
}
```

### `scheduler` section amendment

Add to existing `scheduler` object:
```json
"predictionMarketPoll": "*/30 * * * *"
```

---

## Task Breakdown (for PM)

Dependency-ordered atomic tasks. All branches from `main`.

| # | Title | Layer | Depends on | Priority |
|---|---|---|---|---|
| 163 | SQLite schema: `prediction_markets` + `prediction_signals` tables | infrastructure/db | TECH-020 | P0 |
| 169 | `mcp.config.json` predictionMarkets section + `config.ts` type extension | infrastructure/config | TECH-020 | P0 |
| 164 | Polymarket REST fetcher (`polymarket.ts`) — CLOB + Gamma, relevance filter | infrastructure/fetchers | 163, 169, TECH-020 | P0 |
| 165 | Prediction cascade mapper (`predictionCascadeMapper.ts`) + 14 built-in rules | domain/services | TECH-020 | P0 |
| 166 | Prediction signal detector (`predictionSignalDetector.ts`) + `SignalType` extension | domain/services | 163, 165, TECH-020 | P0 |
| 167 | Prediction market scheduler job + cron wiring in `jobs.ts` | scheduler | 164, 165, 166 | P0 |
| 168 | `get_prediction_markets` MCP tool + `server.ts` + `index.ts` registration | interface/mcp | 163, 167 | P1 |

**163 and 169 can be developed in parallel** — they have no mutual dependency.
**164 and 165 can be developed in parallel** after 163 and 169 are merged.
**166 depends on 165** (imports `mapPredictionToCascade` types) and **163** (needs schema for test fixtures).
**167 depends on 164, 165, 166** — integrates all three.
**168 depends on 163 and 167** — reads from tables 163 creates, built after job is working.

---

## Test file naming

| Task | Test file |
|---|---|
| 163 | `src/__tests__/163-prediction-schema.test.ts` |
| 164 | `src/__tests__/164-polymarket-fetcher.test.ts` |
| 165 | `src/__tests__/165-prediction-cascade-mapper.test.ts` |
| 166 | `src/__tests__/166-prediction-signal-detector.test.ts` |
| 167 | `src/__tests__/167-prediction-market-job.test.ts` |
| 168 | `src/__tests__/168-prediction-mcp-tool.test.ts` |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Polymarket CLOB API changes response shape | Medium | High | Define internal `ClobMarket` interface with optional fields; guard every access with `??` fallback; unit test with fixture JSON captured today |
| Gamma API returns different `id` format than CLOB `condition_id` | Medium | Medium | Match on both `id` and `conditionId` fields; log mismatches at `debug` level; Gamma enrichment is best-effort — missing enrichment degrades gracefully to `uniqueWalletsCount: 0` |
| Polymarket API blocked by CORS / IP rate-limiting at 30-min cadence | Low | Medium | Return `[]` on any HTTP error; `enabled: false` config flag allows operator to disable immediately; future fallback: add `X-Forwarded-For` header or proxy config |
| Wash trading inflates volume signals | High | Medium | `minUniqueWallets` quality filter downgrades signals from thin markets to `"low"` severity; the `insider_timing` signal requires wallet growth, not just volume |
| `insider_timing` RAG heuristic (keyword overlap) generates false negatives | High | Low | Signal type is informational — false negatives mean fewer `insider_timing` signals, not false alerts. The heuristic is explicitly labeled as best-effort in the code comments |
| TypeScript exhaustiveness error from `SignalType` union extension | Low | Medium | Confirmed by grep: no exhaustive switch on `SignalType` in the codebase. The `alertGenerator.ts` uses `Signal[]` generically. |
| `prediction_signals` table grows unboundedly | Medium | Low | Add a cleanup step in `dataAuditJob.ts` (task 157 existing) to `DELETE FROM prediction_signals WHERE detected_at < datetime('now', '-30 days')` — wire in Sprint 021 |
| Polymarket question language changes (new phrasing for Fed decisions) | Medium | Medium | Keyword rules use short, stable terms ("fed", "rate cut") not long phrases. `curatedMarketIds` in config provides an operator override for high-value markets regardless of question text |

---

## Security Review

- SQL parameterized? **Yes** — all SQLite reads/writes must use `db.prepare("... WHERE id = ?").run(id)` — never string interpolation. Pattern established by tasks 131–137.
- File paths validated (no `../`)? **N/A** — no file paths in this feature. API URLs are hard-coded constants, not user-supplied.
- External HTTP rate-limited? **Yes** — `rateLimitDelayMs` between the two API calls; polling interval enforced by cron (30 min minimum); `maxMarketsPerPoll` caps response size.
- Secrets via Bun.env only? **Yes** — no API keys required for this feature. No new secrets introduced. `mcp.config.json` `enabled` flag does not contain secrets.
- No user-controlled data flows to Polymarket API: the fetcher takes only config-driven URLs. No URL construction from user input.

---

## Telegram Alert Format (Vietnamese)

The `formatVietnamesePredictionAlert()` helper in `predictionMarketJob.ts` produces:

```
[PREDICTION MARKET] THI TRUONG DU BAO - MUC DO: {severity_label}

Cau hoi: {market.question}
Xac suat YES hien tai: {(yesPrice*100).toFixed(0)}% ({direction} tu {(prevYesPrice*100).toFixed(0)}%)
Khoi luong 24h: ${volume24h.toLocaleString()}
Vi thay doi: {shift >= 0 ? "+" : ""}{(shift*100).toFixed(1)} diem phan tram
So vi (chat luong): {uniqueWalletsCount} vi

Anh huong den: {stocks.join(", ")} ({sectors.join(", ")})
Ly do: {mapping.reasoning}

Loai tin hieu: {signalType}
Do tin cay: {confidence.toFixed(2)}
Thoi gian: {localTime} (GMT+7)
```

Where `severity_label` maps: `"high"` → `"QUAN TRONG"`, `"critical"` → `"NGHI𝑀 TRONG"`.

This follows the plain-text, no-Markdown format established by `src/infrastructure/notifiers/telegram.ts` to avoid Telegram Markdown escape errors.
