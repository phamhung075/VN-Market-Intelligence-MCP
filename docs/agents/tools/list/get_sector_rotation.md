---
tool: get_sector_rotation
category: sector
agents: [cowork, market-analyst]
---

# `get_sector_rotation`

**Category:** Sector | **Used by:** cowork, market-analyst

Detect sector rotation on the Vietnamese stock market. Groups stocks by sector and classifies each sector as 'DONG TIEN VAO' (inflow), 'DONG TIEN RA' (outflow), or 'ON DINH' (neutral) based on 5-day and 1-day returns. Sectors are ranked by 5-day return. If a watchlist stock is in an outflow sector, a warning line is appended.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| — | — | — | — | No parameters |

## Returns

Plain-text Vietnamese report showing:
- Sector classification (inflow/outflow/neutral)
- 5-day and 1-day returns per sector
- Watchlist stocks grouped by sector
- Warnings for watchlist stocks in outflow sectors

## Output Example

```
=== PHÂN TÍCH DÒNG TIỀN THEO NGÀNH ===

-- Ngành có dòng tiền vào --
[DÒNG TIỀN VÀO] Ngân hàng (+8.50% / 5d, +1.20% / 1d)  VCB BID CTG

-- Ngành có dòng tiền ra --
[DÒNG TIỀN RA] Bất động sản (-12.30% / 5d, -2.10% / 1d)  VNR DIG

CẢNH BÁO: DIG trong ngành Bất động sản đang bị rút vốn (DÒNG TIỀN RA)

Tổng số ngành phân tích: 12
```

## Usage

```json
{
  "tool_name": "get_sector_rotation",
  "input": {}
}
```

## Data Sources

- `market_prices` — current price and change_pct
- `market_prices_history` — historical prices (1d, 5d ago)
- `watchlist` — stock domains and exchange
- Domain classification layer

## Related Tools

- `get_sector_comparison` — benchmark individual stock vs sector peers
- `get_crisis_early_warning` — detect velocity-based crises
- `get_credit_flow_signal` — track real estate credit flow

---

## Implementation Notes

- **Data freshness:** Uses latest snapshot from market_prices; falls back to live fetch if outside trading window
- **History tolerance:** Accepts historical prices up to 3 trading days old (handles weekends/holidays)
- **Watchlist warnings:** Only displayed if watchlist stock is in outflow sector
- **Trading window:** Detects outside-hours gracefully; reports "Chưa có dữ liệu" if no prices available

## Vietnamese Notes

- **Dòng tiền vào** = Money inflow (bullish sector rotation)
- **Dòng tiền ra** = Money outflow (bearish sector rotation)
- **Ổn định** = Stable (neutral)
- **Cảnh báo** = Warning
