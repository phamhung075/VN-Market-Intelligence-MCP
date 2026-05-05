# get_prediction_markets

**Module:** `interface/mcp/tools/macro/predictionTools.ts`

**Category:** Macro

## Overview

Queries prediction markets with optional filters, joined with recent signals (last 1 hour) and enriched with VN cascade mapping via mapPredictionToVn(). Returns structured prediction market data with Vietnam stock implications.

## Tool Signature

```typescript
get_prediction_markets(
  tags?: string,
  market_type?: string,
  days_ahead?: number
) → string
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tags` | string | no | null | Filter by prediction tags (comma-separated, e.g., "inflation,gdp,fed_policy") |
| `market_type` | string | no | null | Filter by market type (e.g., "manifesto", "polymarket", "kalshi") |
| `days_ahead` | number | no | 60 | How many days ahead to look for ending markets (1–365) |

## Output Format

Structured JSON/text with prediction markets and Vietnam impact mapping:

```json
{
  "markets": [
    {
      "id": "pm-fed-rate-2026q2",
      "question": "Will US Fed raise rates in Q2 2026?",
      "end_date": "2026-06-30",
      "yes_price": 0.28,
      "no_price": 0.72,
      "volume_24h": 125000,
      "volume_total": 2500000,
      "liquidity": 450000,
      "unique_wallets": 1250,
      "tags": ["fed_policy", "inflation", "macro"],
      "vn_impact": {
        "signal_types": ["fed_rate_higher_risk", "usd_stronger_pressure"],
        "affected_stocks": ["VCB", "BID", "TCB"],
        "affected_sectors": ["banking", "export"],
        "reasoning": "Higher US rates → stronger USD → VND pressure, banking margin compression"
      }
    },
    {
      "id": "pm-us-recession-2026h2",
      "question": "Will US enter recession in H2 2026?",
      "end_date": "2026-12-31",
      "yes_price": 0.35,
      "no_price": 0.65,
      "volume_24h": 85000,
      "volume_total": 1800000,
      "liquidity": 320000,
      "unique_wallets": 890,
      "tags": ["macro", "gdp"],
      "vn_impact": {
        "signal_types": ["global_growth_risk"],
        "affected_stocks": ["FPT", "BHN", "VHM"],
        "affected_sectors": ["export", "tourism", "real_estate"],
        "reasoning": "US recession → reduced export demand → VN exporters pressured, FDI inflow risk"
      }
    }
  ],
  "metadata": {
    "total_markets": 2,
    "filtered_by": ["tags"],
    "end_date_window": "2026-05-05 to 2026-07-04",
    "last_updated": "2026-05-05T12:30:00Z",
    "data_freshness_hours": 3
  }
}
```

## Data Source

- **Table:** `prediction_markets` (from Manifesto, Polymarket, Kalshi APIs)
- **Signals:** `prediction_market_signals` (1-hour lookback for recent activity)
- **Mapping:** Domain service `mapPredictionToVn()` (enriches with VN stock impacts)

## Vietnam Impact Mapping (mapPredictionToVn)

### Signal Types

| Type | Mechanism | Impact |
|------|-----------|--------|
| `fed_rate_higher_risk` | Tighter global liquidity | VND pressure, banking margin squeeze |
| `usd_stronger_pressure` | Direct USD/VND pressure | Export competitiveness, FX reserves |
| `global_growth_risk` | Recession risk | Export demand, FDI inflow reduction |
| `oil_price_spike_risk` | Energy costs rise | Inflation pressure, airline/shipping costs |
| `china_slowdown_risk` | Supply chain disruption | Manufacturing, logistics impacts |

### Sector Mappings

Auto-populated when prediction tags match:
- **Inflation predictions** → banking, consumer, food processing
- **GDP/growth predictions** → export, tourism, manufacturing
- **Fed policy predictions** → banking, currency, FDI
- **Energy predictions** → energy, logistics, transportation

### Stock Mapping (Auto-Generated)

Based on sector classification:
- Banking rate rises → VCB, BID, TCB, MBB, VPB
- Export demand falls → FPT, SAB, BHN, PHU
- Currency pressures → ETFs, FX-sensitive exporters

## Market Price Interpretation

| Price Level | Interpretation |
|-------------|-----------------|
| YES > 0.70 | Market heavily favors YES (high confidence) |
| YES 0.50–0.70 | Lean YES, but significant uncertainty |
| YES 0.40–0.60 | Very uncertain, 50/50 market |
| YES < 0.30 | Market heavily favors NO (high confidence) |

## Usage Examples

```
Digest & Predict → get_prediction_markets()
Returns all active markets within 60 days with VN impacts

Market Watcher → get_prediction_markets(tags="fed_policy")
Returns Fed policy prediction markets only

Macro analyst → get_prediction_markets(days_ahead=120, market_type="polymarket")
Returns Polymarket predictions for next 4 months
```

## Error Handling

- Returns empty markets list if no matches found
- Returns error message if database query fails
- Graceful fallback: always returns JSON response (never throws)
- Missing VN mapping: shows empty arrays for affected_stocks/sectors

## Integration Notes

- Called by: Digest & Predict, Alert Commander, Macro Analyst
- Feeds into: Portfolio risk modeling, sector rotation decisions
- Related to: `get_calibration_report` (prediction accuracy tracking)
- Used to validate macro thesis before acting on signals

## Recent Signals Join

Prediction markets joined with 1-hour lookback on:
- Market price movements (> 5 percentage point shift)
- New unique wallets entering (sudden interest)
- Volume spikes (> 50% 24h median)

Shows if market has recent activity that might indicate new information.

## Related Tools

- **`get_macro_snapshot()`** — Live rates, commodity prices (macro baseline)
- **`get_calibration_report()`** — Prediction accuracy metrics
- **`create_prediction_claim()`** — Record own market prediction

---

**Added:** Task 168 (Prediction Markets MCP Tool)
**Status:** STABLE
