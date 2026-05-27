# get_yield_spread_signal

**Module:** `interface/mcp/tools/macro/dinhGiaTools.ts`

**Category:** Macro (Báu Framework)

## Overview

Computes the yield spread signal for the Dinh Gia (valuation) layer of the Trần Ngọc Báu macro framework (Phase 2). Reads the market earnings yield from tracked_indicators and the SBV max deposit rate from sbv_rates, then classifies the spread into valuation regimes (CHEAP, FAIRLY_VALUED, EXPENSIVE).

## Tool Signature

```typescript
get_yield_spread_signal(
  _testEarningYield?: number,
  _testDepositRate?: number
) → YieldSpreadSignal
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `_testEarningYield` | number | no | — | Test injection: market earnings yield (e.g., 7.32 = 7.32% p.a.). Bypasses DB read. |
| `_testDepositRate` | number | no | — | Test injection: SBV deposit rate (e.g., 5.50 = 5.50% p.a.). Bypasses DB read. |

## Output Format

```json
{
  "label": "CHEAP",
  "spread": 2.95,
  "earningYield": 7.32,
  "depositRate": 5.50,
  "reasoning": "Market earnings yield (7.32%) exceeds SBV deposit rate (5.50%) by 2.95pp. Equity valuations offer attractive risk-adjusted return vs. bond yields → bullish for stock prices.",
  "computedAt": "2026-05-05T10:30:00Z"
}
```

## Valuation Regimes

| Label | Spread | Interpretation | Implication |
|-------|--------|---|---|
| `CHEAP` | > 2pp | Equities > 2pp above deposits | Buy signal: valuations attractive |
| `FAIRLY_VALUED` | 0 < spread ≤ 2pp | Equities slightly above deposits | Neutral: fair valuation, stable market |
| `EXPENSIVE` | ≤ 0 | Equities ≤ deposits | Sell signal: valuations stretched |
| `UNKNOWN` | N/A | Data unavailable | No signal (fallback) |

## Yield Spread Logic

```
Spread = Earnings Yield (%) - SBV Deposit Rate (%)
```

**Example calculations:**

| Scenario | Earning Yield | Deposit Rate | Spread | Label |
|----------|---|---|---|---|
| Cheap | 8.0% | 4.5% | +3.5pp | CHEAP |
| Fair | 7.0% | 5.5% | +1.5pp | FAIRLY_VALUED |
| Expensive | 5.5% | 5.5% | 0pp | EXPENSIVE |
| Risk-off | 4.0% | 5.5% | -1.5pp | EXPENSIVE |

## Data Sources

| Source | Field | Notes |
|--------|-------|-------|
| `tracked_indicators` | `value` WHERE indicator='market_earning_yield' AND source='bau_phase2' | Market-wide earnings yield (E/P %) computed by bau_phase2 job |
| `sbv_rates` | `max_deposit_rate_pct` | Latest SBV max deposit rate (safe yield benchmark) |

### Market Earnings Yield Calculation

Computed by **marketEarningYieldJob** (Task 1426a):

```
Market Earning Yield = (Sum of Net Income across watchlist) / (Sum of Market Cap) × 100%
```

- **Numerator:** Aggregated net income from BCTC quarterly reports
- **Denominator:** Sum of market capitalizations (price × shares outstanding)
- **Result:** Broad market earnings yield as "fair value" reference

## Key Characteristics

- **Dinh Gia = Valuation (Báu Phase 2)**
  - Dinh = "to price" (Vietnamese)
  - Gia = "value" (Vietnamese)
  - Focuses on: Is the market fairly priced relative to risk-free rates?

- **Spread interpretation:**
  - Positive spread = Equities offer premium over deposits (bullish)
  - Negative spread = Deposits more attractive than equities (bearish)
  - Wider spread = stronger buy signal

- **Benchmark: SBV Deposit Rate**
  - Safe, risk-free alternative to equity investment
  - Used as discount rate in DCF valuation models
  - Changes with monetary policy (key driver of regime shifts)

## Regime Shifts & Market Impact

| Shift | Driver | Market Impact |
|-------|--------|---|
| CHEAP → FAIRLY_VALUED | Earnings drop or rates rise | Profit-taking, consolidation |
| FAIRLY_VALUED → CHEAP | Earnings growth or rates fall | Rally, new highs |
| FAIRLY_VALUED → EXPENSIVE | Sector bubble, PE multiple expansion | Risk of correction |
| EXPENSIVE → FAIRLY_VALUED | Earnings surprise or policy tightening | Shake-out, volatility |

## Usage Examples

```
Digest & Predict → get_yield_spread_signal()
Returns current market valuation regime (CHEAP / FAIRLY_VALUED / EXPENSIVE)

Risk Manager → get_yield_spread_signal(_testDepositRate=6.0, _testEarningYield=7.5)
Scenario: What if rates rise to 6% while earnings stay at 7.5%?
Answer: Spread = 1.5pp → FAIRLY_VALUED (less bullish)

Portfolio Manager → Uses Dinh Gia signal for:
- Asset allocation (higher equity % when CHEAP)
- Rebalancing triggers (shift to bonds when EXPENSIVE)
- Risk management (reduce exposure in EXPENSIVE regime)
```

## Error Handling

- **Missing earnings yield:** Falls back to 0, returns regime=UNKNOWN
- **Missing deposit rate:** Falls back to 0, returns regime=UNKNOWN
- **Both missing:** Returns regime=UNKNOWN with reasoning "Data unavailable"
- **Invalid rates:** Returns error message with details

## Integration Notes

- Called by: Digest & Predict, Risk Manager, Portfolio Manager
- Part of **Báu Framework:** Dinh Gia layer (valuation signal)
- Complements: `get_carry_trade_signal` (Thien Thoi liquidity layer)
- Used to contextualize: Market rallies, corrections, sector rotations

## Báu Framework Layers

| Layer | Tool | Focus |
|-------|------|-------|
| Thien Thoi | `get_carry_trade_signal` | Global liquidity & capital flows |
| Dinh Gia | `get_yield_spread_signal` | Market valuation & asset pricing |
| Kinh Dich | `get_kinhdich_reading` | Market sentiment & cycles |
| Nhân Tố | Various agents | Policy, news, insider behavior |

## Related Tools

- **`get_carry_trade_signal()`** — Liquidity layer (Thien Thoi)
- **`get_macro_snapshot()`** — Live rates + commodity prices
- **`record_evidence_fragment(evidence_type="bctc_pe_ratio")`** — Store valuation evidence

---

**Added:** Task 1426b (Yield Spread Signal MCP Tool)
**Sprint:** 1426 — Báu Phase 2 (Dinh Gia)
**Status:** STABLE
