# TECH-090: Technical Indicators MCP Tool (`get_technical_indicators`)

```
status: APPROVED_BY_ARCHITECT
req_ref: REQ-090
sprint: 090
```

---

## Brownfield Impact

- Files created:
  - `src/domain/services/technicalIndicators.ts`
  - `src/interface/mcp/tools/technicalIndicatorTools.ts`
  - `src/__tests__/1302-technical-indicators.test.ts`
- Files modified:
  - `src/interface/mcp/tools/registry.ts` — add one import + one array entry
  - `src/interface/mcp/tools/index.ts` — add one export line
  - `docs/data/tool-registry.json` — increment count 97 → 98, add "Technical Analysis" category
- Breaking changes: no

---

## Architecture Decision

All indicator math lives in a pure domain service (`technicalIndicators.ts`) with zero imports from `infrastructure/` — matching the `volatilityCalculator.ts` pattern exactly. The MCP handler (`technicalIndicatorTools.ts`) follows `priceHistoryTools.ts` — it receives an optional `Database` injection for test isolation, resolves the production singleton lazily, executes a single parameterized SQL query, then delegates all computation to the domain service. Registration is added via one line in `registry.ts` (the `toolRegistry` array) so `server.ts` requires no edits.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `computeMA` / `computeRSI` / `computeMACD` / `computeBollingerBands` | domain | `src/domain/services/technicalIndicators.ts` | NEW |
| `registerTechnicalIndicatorTools` | interface | `src/interface/mcp/tools/technicalIndicatorTools.ts` | NEW |
| `toolRegistry` array | interface | `src/interface/mcp/tools/registry.ts` | MODIFY |
| barrel re-export | interface | `src/interface/mcp/tools/index.ts` | MODIFY |
| tool count + category | data | `docs/data/tool-registry.json` | MODIFY |
| TDD test file | test | `src/__tests__/1302-technical-indicators.test.ts` | NEW |

---

## Interface Contracts

### Domain service — `src/domain/services/technicalIndicators.ts`

No imports from `infrastructure/`. No I/O. All functions are pure.

```typescript
/** One daily price candle (output of the DB GROUP BY query). */
export interface DailyCandle {
  day: string;       // "YYYY-MM-DD"
  close: number;     // AVG(price) for that date
}

/** Full indicator result returned to the MCP handler. */
export interface TechnicalIndicatorResult {
  ma5:   number | null;
  ma20:  number | null;
  ma50:  number | null;
  rsi14: number | null;
  macd: {
    line:      number;
    signal:    number;
    histogram: number;
  } | null;
  bb20: {
    upper: number;
    mid:   number;
    lower: number;
  } | null;
}

/**
 * Simple Moving Average over the last `period` values in `prices`.
 * Returns null when prices.length < period.
 */
export function computeMA(prices: number[], period: number): number | null

/**
 * RSI(14) using Wilder smoothing.
 * Requires at least period + 1 prices (15 for default period=14).
 * Returns null when insufficient data.
 * Return range: [0, 100].
 */
export function computeRSI(prices: number[], period?: number): number | null

/**
 * MACD(fast=12, slow=26, signal=9) using EMA.
 * Requires at least slow + signal - 1 = 34 prices minimum.
 * Returns null when insufficient data.
 * histogram = macd - signal (positive = bullish momentum).
 */
export function computeMACD(
  prices: number[],
  fast?: number,
  slow?: number,
  signal?: number
): { macd: number; signal: number; histogram: number } | null

/**
 * Bollinger Bands(20, 2σ).
 * mid = SMA(period), upper = mid + k*σ, lower = mid - k*σ.
 * σ = population std dev of last `period` prices.
 * Returns null when prices.length < period.
 */
export function computeBollingerBands(
  prices: number[],
  period?: number,
  stdDevMultiplier?: number
): { upper: number; mid: number; lower: number } | null

/**
 * Aggregates candles and runs all four indicators.
 * Gracefully returns nulls for indicators that lack sufficient candles.
 */
export function computeAllIndicators(candles: DailyCandle[]): TechnicalIndicatorResult
```

### EMA formula (used by MACD and RSI's Wilder smoothing)

```
k = 2 / (period + 1)
EMA[0] = prices[0]
EMA[i] = prices[i] * k + EMA[i-1] * (1 - k)
```

Note: RSI uses Wilder smoothing which is EMA with `k = 1 / period` (not `2 / (period+1)`). Implement a private `ema(prices, period)` helper and a separate `wilderEma(prices, period)` helper.

### MCP handler — `src/interface/mcp/tools/technicalIndicatorTools.ts`

```typescript
export function registerTechnicalIndicatorTools(
  server: McpServer,
  _db?: Database
): void
```

Zod schema:
```typescript
{
  actionCode: z.string().min(1).max(10).describe("Stock ticker, e.g. VCB"),
  days: z.coerce.number().int().min(35).max(365).optional().default(60)
         .describe("Look-back days (default 60, min 35 for MACD)")
}
```

### DB query (parameterized — no string interpolation)

```sql
SELECT date(fetched_at) AS day, AVG(price) AS close_price
FROM market_prices_history
WHERE code = ?
  AND fetched_at >= datetime('now', ? || ' days')
GROUP BY date(fetched_at)
ORDER BY day ASC
```

Parameters: `[code, `-${lookbackDays}`]` — e.g. `["VCB", "-60 days"]`.

Row type:
```typescript
interface CandleRow {
  day: string;
  close_price: number;
}
```

Map to `DailyCandle[]` before passing to `computeAllIndicators`.

---

## Output Format

```
[VCB] Chi bao ky thuat — 2026-04-15

MA:   MA5=94,200  MA20=93,500  MA50=91,800  → Xu huong TANG (gia > MA5 > MA20 > MA50)
RSI(14): 62.4 → Trung tinh (vung 40-70, con du room)
MACD:  Line=+180  Signal=+95  Hist=+85  → TANG (histogram duong va tang)
BB(20):  Upper=96,800  Mid=93,500  Lower=90,200
         Price=94,500 → 62% cua dai BB (trung binh-cao)

Ket luan: 3/4 chi bao TANG — co the xem xet MUA khi RSI < 70
```

### Vietnamese signal labels

| Indicator | Condition | Label |
|-----------|-----------|-------|
| MA stack | price > MA5 > MA20 > MA50 | TANG |
| MA stack | price < MA5 < MA20 < MA50 | GIAM |
| MA stack | mixed | TRUNG TINH |
| RSI | > 70 | Qua mua (overbought) |
| RSI | 40–70 | Trung tinh |
| RSI | < 40 | Qua ban (oversold) |
| MACD | histogram > 0 | TANG |
| MACD | histogram < 0 | GIAM |
| MACD | histogram == 0 | TRUNG TINH |
| BB | (price - lower)/(upper - lower) > 50% | TANG |
| BB | (price - lower)/(upper - lower) <= 50% | GIAM |

### Conclusion logic

Count TANG / GIAM verdicts across the 4 indicators. Majority (≥ 3) wins. Tie (2/2) → TRUNG TINH.

```
Ket luan: X/4 chi bao TANG — <verdict phrase>
```

### Insufficient data handling

When fewer than 35 candles are returned by the query:
```
[VCB] Khong du du lieu ky thuat
Tim thay N nen (can toi thieu 35 cho MACD).
Vui long thu lai sau khi co them du lieu lich su.
```

No crash. No unhandled exception. Return as `content[0].text`.

---

## Task Breakdown (for PM)

Dependency-ordered atomic tasks — already reflected in TASKS.md:

| ID | Title | Depends On |
|----|-------|------------|
| 1302 | Domain service `technicalIndicators.ts` + TDD test `1302-technical-indicators.test.ts` | none |
| 1303 | MCP handler `technicalIndicatorTools.ts` + registry + tool-registry.json update | 1302 |

Task 1303 must not start until 1302 is merged to main.

---

## Test Structure (Task 1302)

File: `src/__tests__/1302-technical-indicators.test.ts`

```
process.env["DB_PATH"] = ":memory:";   // line 1 — isolation

describe("technicalIndicators domain service", () => {

  describe("computeMA", () => {
    it("returns correct MA for known array")          // [10,20,30,40,50] period=3 → 40.0
    it("returns null when insufficient data")         // 2 prices, period=3 → null
  })

  describe("computeRSI", () => {
    it("returns 100 on flat rising prices")           // [10,10,10,...,10,11] period=3
    it("returns 0 on flat falling prices")
    it("returns value in [0,100] range")
    it("returns null when fewer than period+1 prices")
  })

  describe("computeMACD", () => {
    it("histogram equals macd - signal")              // arithmetic identity check
    it("returns null when fewer than 34 prices")
    it("returns bullish histogram for uptrending prices")
  })

  describe("computeBollingerBands", () => {
    it("[10,20,30] period=3 → mid=20, upper≈36.33, lower≈3.67")
    it("upper > mid > lower invariant holds")
    it("returns null when fewer than period prices")
  })

  describe("computeAllIndicators", () => {
    it("returns all nulls for fewer than 15 candles")
    it("returns MA5/RSI/BB for 20 candles, null MACD and MA50")
    it("returns all indicators for 55 candles")
  })

  describe("MCP handler integration", () => {
    // Task 1303 adds this block — seeded in-memory DB with 55 rows
    it("formats output with all 4 indicator blocks")
    it("returns insufficient-data message for 10-row DB")
  })
})
```

Reference values the test must assert (deterministic inputs):

| Test | Input | Expected |
|------|-------|---------|
| MA(3) | [10, 20, 30, 40, 50] | 40.0 |
| BB(3) | [10, 20, 30] | mid=20, upper≈36.33, lower≈3.67 |
| MACD histogram | any uptrend array (≥34 prices) | macd - signal (exact equality) |
| RSI flat prices | 16× same price | 100 (no losses) |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| EMA seed value differs from reference implementations | Medium | Medium | Use first price as EMA seed (standard convention); document in code comments with formula citation |
| RSI Wilder smoothing vs standard EMA confusion | High | Medium | Implement `wilderEma` as separate private helper with `k = 1/period`; unit test independently |
| Floating point drift in std dev (BB) | Low | Low | Use population std dev (divide by N, not N-1); test with tolerance `toBeCloseTo(val, 2)` |
| AVG(price) candle aggregation returns wrong closing price | Medium | Medium | REQ-090 specifies AVG per day as the proxy for close price — document this assumption in handler JSDoc |
| `datetime('now', '-60 days')` SQLite syntax vs Bun:sqlite | Low | High | Test in integration test with in-memory DB; confirm parameter binding `[code, "-60 days"]` format works |
| MA50 requires 50 candles — default 60-day window may yield fewer trading days | Medium | Low | Handler detects null MA50 and outputs "N/A" with note; not a crash |

---

## Security Review

- SQL parameterized: yes — `db.query<CandleRow, [string, string]>(sql).all(code, interval)`
- File paths validated (no `../`): N/A — no file I/O in domain service or handler
- External HTTP rate-limited: N/A — reads local SQLite only
- Secrets via Bun.env only: N/A — no secrets required
