# get_carry_trade_signal & get_macro_calendar

**Module:** `interface/mcp/tools/macro/carryTools.ts`

**Category:** Macro (Báu Framework)

## Overview

Two related tools for macro analysis using the Trần Ngọc Báu framework (Thien Thoi layer):

- `get_carry_trade_signal` — Computes the VND carry trade signal based on SBV deposit rate vs. US Fed Funds rate
- `get_macro_calendar` — Returns upcoming macro events (FOMC, GSO, SBV) with pivot window warnings

## Tool Signatures

```typescript
get_carry_trade_signal(
  _testVndRate?: number,
  _testFedRate?: number
) → CarryTradeSignal

get_macro_calendar(
  days?: number,
  _testReferenceDate?: string
) → MacroCalendarResult
```

## Input Parameters

### get_carry_trade_signal

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `_testVndRate` | number | no | — | Test injection: VND deposit rate (e.g., 5.5 = 5.5% p.a.). Bypasses DB read. |
| `_testFedRate` | number | no | — | Test injection: Fed Funds rate (e.g., 4.33 = 4.33% p.a.). Bypasses DB read. |

### get_macro_calendar

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | number | no | 60 | Calendar days ahead to search (1–365) |
| `_testReferenceDate` | string | no | today | Test injection: ISO date to use as "today" (e.g., "2026-05-15") |

## get_carry_trade_signal Output

```json
{
  "regime": "HOT_MONEY_INFLOW",
  "carrySpread": 2.85,
  "vndDepositRate": 5.50,
  "fedFundsRate": 2.65,
  "reasoning": "VND deposit rate 5.50% >> US Fed Funds 2.65% → attractive VND carry (2.85pp spread). Expect foreign capital inflows and currency strength.",
  "computedAt": "2026-05-05T10:30:00Z"
}
```

### Carry Trade Regimes

| Regime | Spread | Interpretation | Market Impact |
|--------|--------|-----------------|-----------------|
| `HOT_MONEY_INFLOW` | > 2.5% | High VND yield attracts foreign capital | VND strengthens, FDI inflows, equity market buoyant |
| `NEUTRAL` | 0.5–2.5% | Moderate VND advantage | Stable FX, normal FDI flow |
| `FII_OUTFLOW_RISK` | < 0.5% | Low/negative spread | VND depreciation risk, FDI withdrawal pressure |
| `UNKNOWN` | N/A | Data unavailable | No signal (fallback) |

## get_macro_calendar Output

```json
{
  "events": [
    {
      "date": "2026-05-06",
      "event": "FOMC Meeting Announcement",
      "region": "USA",
      "importance": "high",
      "isPivotWindow": false,
      "daysUntil": 1
    },
    {
      "date": "2026-05-20",
      "event": "GSO CPI Release (Apr 2026)",
      "region": "VN",
      "importance": "high",
      "isPivotWindow": false,
      "daysUntil": 15
    },
    {
      "date": "2026-06-02",
      "event": "SBV Policy Board Meeting",
      "region": "VN",
      "importance": "high",
      "isPivotWindow": true,
      "daysUntil": 28,
      "pivotReason": "June is Q2 close, elevated market sensitivity"
    }
  ],
  "currentMonthIsPivotWindow": false,
  "nextPivotWindow": "June 2026 (Q2 close)",
  "pivotWindowWarning": false,
  "summaryText": "No major events within 14 days. Next pivot window: June 2026 (Q2 quarter-end)."
}
```

### Pivot Windows

Pivot windows = months 3, 6, 9, 12 (quarter-ends):
- **March (Q1 close)** — VN market reviews Q1 BCTC, GDP growth data
- **June (Q2 close)** — H1 midyear adjustment, GDP release
- **September (Q3 close)** — Q3 earnings season begins
- **December (Q4 close)** — Year-end portfolio rebalancing, GDP/inflation data

Events in pivot months marked `isPivotWindow: true`.

Alert triggered if macro event within 14 days of pivot month boundary.

## Data Sources

### get_carry_trade_signal

| Source | Field | Notes |
|--------|-------|-------|
| `sbv_rates` | `max_deposit_rate_pct` | Latest SBV deposit rate (% p.a.) |
| `tracked_indicators` | `value` WHERE indicator='fed_funds_rate' | Latest US Fed Funds rate from FRED |

### get_macro_calendar

Hard-coded calendar of:
- FOMC meeting dates (8× per year)
- GSO macro releases (monthly CPI/GDP/inflation)
- SBV policy board meetings (monthly)
- Vietnam PMI releases (monthly)
- Vietnam VN-Index close dates (quarterly)

## Key Characteristics

- **Carry Spread = VND Rate - Fed Rate**
  - Example: 5.50% - 2.65% = 2.85pp spread
  - Wider spread = more attractive VND carry → capital inflows expected

- **Regime signals:**
  - HOT_MONEY_INFLOW → bullish for VND, FDI inflows, equity market strength
  - NEUTRAL → stable, no strong FX/FDI signal
  - FII_OUTFLOW_RISK → bearish for VND, potential FDI outflow pressure

- **Pivot window alerts:**
  - Quarter-end months (3, 6, 9, 12) flagged as high-sensitivity periods
  - Events within 14 days of pivot month trigger warning

## Usage Examples

```
Digest & Predict → get_carry_trade_signal()
Returns current VND carry regime (HOT_MONEY_INFLOW / NEUTRAL / FII_OUTFLOW_RISK)

Macro Analyst → get_macro_calendar(days=90)
Returns next 3 months of macro events with pivot window marking

Market Watcher → get_carry_trade_signal() + get_macro_calendar()
Combined: check carry regime AND upcoming key event dates
```

## Error Handling

- **Database read failure:** Falls back to 0 rate (domain handles gracefully)
- **No rate data in DB:** Returns regime=UNKNOWN with reasoning "Data unavailable"
- **Invalid dates:** Returns error message
- **Calendar not found:** Returns empty events list (never throws)

## Integration Notes

- Called by: Digest & Predict, Macro Analyst, Risk Manager
- Part of **Báu Framework:** Thien Thoi layer (global liquidity signal)
- Complements: `get_yield_spread_signal` (Dinh Gia valuation layer)
- Used to contextualize: FDI flows, currency movements, interest rate expectations

## Báu Framework Context

**Báu = "Treasure" (strategic asset allocation model)**

- **Thien Thoi** (Global Liquidity) → carry trade signal, Fed vs. SBV rates
- **Dinh Gia** (Valuation) → yield spread, earnings yield vs. deposit rates
- **Kinh Dich** (Market Sentiment) → hexagram signals, lunar cycles
- **Nhân Tố** (Human Factors) → policy, insider behavior, news sentiment

---

**Added:** Task 1423c (Carry Trade Signal), Task 1423e (Macro Calendar)
**Status:** STABLE
