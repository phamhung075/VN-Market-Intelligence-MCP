---
tool: get_user_positions_for_analysis
category: portfolio
agents: [cowork]
---

# `get_user_positions_for_analysis`

**Category:** Portfolio | **Used by:** cowork

Return enriched position data for Cowork analysis agents. Each position includes: qty, avg_cost, current price (from market_prices), sector classification, and risk tier. Includes conviction/alert score summaries for portfolio-level insights.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| — | — | — | — | No parameters |

## Returns

Machine-readable JSON structure with:
- All open positions with enriched metadata
- Sector grouping for concentration analysis
- Current conviction score per position
- Active alert count per position
- Portfolio-level aggregates (sector weights, conviction avg)
- Risk tier classification (safe/moderate/aggressive)

## Output Format

```json
{
  "timestamp": "2026-05-05T14:30:00Z",
  "positions": [
    {
      "code": "VCB",
      "quantity": 1000,
      "avgCost": 32.000,
      "currentPrice": 32.400,
      "positionValue": 32.400,
      "unrealizedPnL": 0.400,
      "sector": "banking",
      "conviction": 0.78,
      "activeAlerts": 2,
      "riskTier": "moderate",
      "lastUpdate": "2026-05-05T14:30:00Z"
    },
    {
      "code": "HPG",
      "quantity": 500,
      "avgCost": 52.000,
      "currentPrice": 53.100,
      "positionValue": 26.550,
      "unrealizedPnL": 0.550,
      "sector": "steel",
      "conviction": 0.65,
      "activeAlerts": 1,
      "riskTier": "moderate",
      "lastUpdate": "2026-05-05T14:28:00Z"
    }
  ],
  "portfolio": {
    "totalValue": 177.640,
    "avgConviction": 0.72,
    "sectorWeights": {
      "banking": 0.18,
      "steel": 0.15,
      "consumer": 0.40,
      "tech": 0.12,
      "energy": 0.08,
      "other": 0.07
    },
    "totalAlerts": 5,
    "riskProfile": "balanced"
  }
}
```

## Usage

```json
{
  "tool_name": "get_user_positions_for_analysis",
  "input": {}
}
```

## Data Sources

- `positions` table — qty, avg_cost, open status
- `market_prices` — current price for P&L
- `watchlist` — sector classification
- `conviction_history` — latest conviction score per stock
- `alerts` table — active alert count per stock

## Related Tools

- `get_positions` — human-readable position summary
- `get_portfolio_conviction` — conviction dashboard
- `get_alerts` — detailed alerts per stock
- `get_portfolio_risk` — risk metrics

---

## Implementation Notes

- **Enrichment:** Adds sector, conviction, alerts to raw position data
- **Real-time:** Conviction and alerts pulled at query time
- **JSON format:** Machine-readable for downstream analysis agents
- **Risk tiers:** Computed from volatility, conviction, alert count
- **Sector weights:** Normalized to 1.0 (100%)

## Risk Tier Classification

| Tier | Criteria | Example |
|------|----------|---------|
| Safe | conviction 0.8+, alerts 0, vol <20% | VCB, BID |
| Moderate | conviction 0.6-0.8, alerts 1-2, vol 20-35% | HPG, FPT |
| Aggressive | conviction <0.6, alerts 2+, vol 35%+ | VNR, SMC |

## Position Enrichment Example

**Raw position (from positions table):**
```json
{
  "code": "VCB",
  "quantity": 1000,
  "avgCost": 32.000
}
```

**Enriched (with market data + conviction + alerts):**
```json
{
  "code": "VCB",
  "quantity": 1000,
  "avgCost": 32.000,
  "currentPrice": 32.400,
  "positionValue": 32.400,
  "unrealizedPnL": 0.400,
  "sector": "banking",
  "conviction": 0.78,
  "activeAlerts": 2,
  "riskTier": "moderate"
}
```

## Portfolio Aggregation

```json
{
  "totalValue": 177.640,
  "avgConviction": 0.72,
  "sectorWeights": {
    "banking": 32.4 / 177.64 = 0.18,
    "steel": 26.55 / 177.64 = 0.15
  },
  "totalAlerts": 5,
  "riskProfile": "balanced" (if avg conviction 0.6-0.8)
}
```

## Cowork Use Cases

1. **Portfolio Conviction Review:** Check avgConviction to assess overall signal strength
2. **Sector Concentration:** Use sectorWeights to detect over-concentration
3. **Alert Prioritization:** Sort by activeAlerts to identify urgent updates needed
4. **Risk Rebalancing:** Use riskTier to suggest position sizing adjustments
5. **Performance Attribution:** Compare conviction changes to realized returns

## Vietnamese Notes

- **Vị trí danh mục** = Portfolio position
- **Niềm tin** = Conviction
- **Cảnh báo hoạt động** = Active alert
- **Rủi ro** = Risk tier
- **Trọng số ngành** = Sector weight
