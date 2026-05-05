# get_imf_signals

**Module:** `interface/mcp/tools/macro/imfSignals.ts`

**Category:** Macro (Global Economics)

## Overview

Fetches latest IMF economic indicators and macro sentiment classification for VN market analysis. Returns global growth forecasts, inflation indicators, and sector impact scores derived from IMF DataMapper API data (refreshed every 6 hours via imfIndicatorPollerJob).

## Tool Signature

```typescript
get_imf_signals(
  indicator_code?: string,
  days_back?: number
) → IMFSignalsResponse
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `indicator_code` | string | no | null | Filter by specific IMF indicator code (e.g., "NGDP_RPCH" for GDP growth, "PCPI_ADVEC" for inflation, "POILAPSP" for oil price forecast) |
| `days_back` | number | no | N/A | Not used for filtering (IMF data refreshed every 6h); reserved for future historical queries |

## Output Format

Structured JSON response with indicators + sentiment classification:

```json
{
  "indicators": [
    {
      "code": "NGDP_RPCH",
      "name": "Real GDP growth (annual %)",
      "value": 2.8,
      "published_at": "2026-04-15T00:00:00Z",
      "age_in_days": 20,
      "yoy_change": -0.3,
      "source": "IMF World Economic Outlook",
      "confidence": 0.75
    },
    {
      "code": "PCPI_ADVEC",
      "name": "Inflation, average consumer prices (annual %)",
      "value": 3.2,
      "published_at": "2026-04-20T00:00:00Z",
      "age_in_days": 15,
      "yoy_change": +0.8,
      "source": "IMF World Economic Outlook",
      "confidence": 0.68
    },
    {
      "code": "POILAPSP",
      "name": "Oil prices (USD/barrel)",
      "value": 82.50,
      "published_at": "2026-05-01T00:00:00Z",
      "age_in_days": 4,
      "yoy_change": +12.3,
      "source": "IMF Primary Commodity Database",
      "confidence": 0.85
    }
  ],
  "sentiment": {
    "score": 0.62,
    "classification": "moderately_bullish",
    "confidence": 0.71,
    "reasoning": "Global growth stable (2.8%), inflation contained (3.2%), oil moderately priced. Mixed signals: supportive growth backdrop offset by energy cost pressures.",
    "sector_impacts": {
      "banking": { "impact": "positive", "reasoning": "Lower inflation supports NIM expansion" },
      "energy": { "impact": "positive", "reasoning": "Oil $82.50 supports PVD/GAS margins" },
      "export": { "impact": "neutral", "reasoning": "Global growth steady but no acceleration" },
      "consumer": { "impact": "positive", "reasoning": "Inflation contained, real purchasing power stable" }
    }
  },
  "last_updated": "2026-05-05T12:00:00Z",
  "data_count": 12,
  "note": "12 indicator(s) available. Data refreshed via imfIndicatorPollerJob (6h cycle)."
}
```

## Sentiment Classification

| Score | Label | Meaning |
|-------|-------|---------|
| 0.70–1.0 | `strongly_bullish` | Global growth accelerating, inflation low, easy policy → VN inflows likely |
| 0.55–0.70 | `moderately_bullish` | Growth positive, inflation contained, supportive backdrop |
| 0.45–0.55 | `neutral` | Mixed signals: some headwinds, some tailwinds |
| 0.30–0.45 | `moderately_bearish` | Growth slowing, inflation rising, tightening bias |
| 0.0–0.30 | `strongly_bearish` | Global slowdown/recession, inflation spike, tight policy → risk-off mode |

## Key IMF Indicators

### Growth Indicators

| Code | Metric | Typical Range | Impact on VN |
|------|--------|---|---|
| `NGDP_RPCH` | Global real GDP growth | 2–4% | Demand for VN exports |
| `NGDP_RPCH_USA` | US real GDP growth | 2–3% | FDI flows, consumer demand |
| `NGDP_RPCH_CHN` | China real GDP growth | 4–6% | Supply chain orders, FDI |

### Inflation Indicators

| Code | Metric | Impact |
|------|--------|--------|
| `PCPI_ADVEC` | Global inflation (avg CPI) | Cost pressures on VN manufacturers |
| `FLEXP` | Food price inflation | Consumer demand, wage pressure |

### Commodity Prices

| Code | Metric | Impact |
|------|--------|--------|
| `POILAPSP` | Oil price (USD/bbl) | Energy costs, airline/shipping margins |
| `PAGRY` | Agricultural commodities | Input costs for VN agribusiness |
| `PMETALS` | Metal prices | Export prices, construction costs |

## Data Freshness

- **Refresh cycle:** Every 6 hours via `imfIndicatorPollerJob`
- **Typical age:** Most indicators 1–20 days old (IMF releases monthly)
- **Last update:** Shown in response metadata (timestamp)
- **No-data case:** Returns "No IMF data cached yet — run imfIndicatorPollerJob to populate"

## Sector Impact Mapping

Auto-generated mapping of IMF indicators → VN sectors:

| IMF Signal | Sector | Impact |
|-----------|--------|--------|
| Global growth ↑ | Export, Manufacturing | Positive (more orders) |
| US growth ↑ | Tech, Retail | Positive (FDI, consumer demand) |
| Oil ↑↑ | Energy, Logistics | Positive (margins) / Negative (costs) |
| Inflation ↑ | Retail, Consumer | Negative (margin pressure) |
| China growth ↓ | Manufacturing, Supply Chain | Negative (orders fall) |

## Usage Examples

```
Digest & Predict → get_imf_signals()
Returns full IMF sentiment + sector impacts (no filter)

Macro Analyst → get_imf_signals(indicator_code="NGDP_RPCH")
Returns global GDP growth only

Risk Manager → get_imf_signals(indicator_code="PCPI_ADVEC")
Returns inflation indicators (to assess cost pressures)

Sector Rotator → Checks sentiment, uses sector_impacts for allocation
Bullish energy if oil signal positive, bearish retail if inflation rising
```

## Error Handling

- **No data cached:** Returns empty indicators list with note "No IMF data cached yet..."
- **Invalid indicator code:** Filters to empty list (no error thrown)
- **Database error:** Returns error message
- **API fetch failed:** Cached data used (up to 12 hours old)

## Integration Notes

- Called by: Digest & Predict, Risk Manager, Macro Analyst
- Data source: IMF World Economic Outlook, Primary Commodity Database
- Refresh job: `imfIndicatorPollerJob` (6h cycle, low priority)
- Used to contextualize: Global macro backdrop, sector rotation, valuation regimes

## Related Tools

- **`get_macro_snapshot()`** — Live rates, SBV data, commodity prices
- **`get_carry_trade_signal()`** — Liquidity layer (Fed vs. SBV rates)
- **`get_yield_spread_signal()`** — Valuation layer (earnings vs. deposits)

## IMF Data Sources

| Source | Frequency | Coverage |
|--------|-----------|----------|
| World Economic Outlook | Quarterly | GDP, inflation, employment |
| Primary Commodity Database | Monthly | Oil, metals, food prices |
| International Financial Statistics | Monthly | Exchange rates, interest rates |
| DOTS (Direction of Trade) | Monthly | Trade flows, bilateral balances |

---

**Added:** Task 1296b (get_imf_signals MCP Tool)
**Status:** STABLE
