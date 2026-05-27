---
tool: get_sector_comparison
category: sector
agents: [cowork, market-analyst]
---

# `get_sector_comparison`

**Category:** Sector | **Used by:** cowork, market-analyst

Compare a watchlist stock against its sector peers: PE/PB/ROE vs sector median, price performance, and foreign flow. Stock must be on the watchlist.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `code` | string | Yes | — | Stock ticker code to benchmark against its sector (e.g. "VCB", "FPT") |

## Returns

Plain-text Vietnamese comparison table showing:
- Stock vs sector median PE, PB, ROE
- Valuation tier (undervalued/fair/overvalued)
- Price performance (1d, 5d, 1m)
- Foreign flow comparison

## Output Example

```
=== SO SÁNH VCB THEO NGÀNH NGÂN HÀNG ===

ĐỊNH GIÁ:
  VCB PE: 12.1 (Sector trung bình: 13.5) [ỤNG NHÂN]
  VCB PB: 1.2 (Sector trung bình: 1.5)  [ỤNG NHÂN]
  VCB ROE: 15.8% (Sector trung bình: 14.2%)

HIỆU SUẤT GIÁ:
  1 ngày: +0.5% (Sector: +1.2%)
  5 ngày: +2.1% (Sector: +3.8%)
  1 tháng: +5.3% (Sector: +4.2%)

DÒNG NGOẠI TỀ:
  VCB: +450 tỷ đ (Sector: +1.2 tỷ USD)

KẾT LUẬN: VCB định giá hợp lý vs sector
```

## Usage

```json
{
  "tool_name": "get_sector_comparison",
  "input": {
    "code": "VCB"
  }
}
```

## Data Sources

- `watchlist` — target stock's sector classification
- `vnstock_financials` — PE, PB, ROE for stock and peers
- `market_prices` — latest price and change_pct
- `vnstock_trading_stats` — foreign flow volume

## Related Tools

- `get_sector_rotation` — detect sector inflow/outflow
- `compare_stocks` — direct stock-to-stock comparison
- `get_ticker_intelligence` — detailed single-stock analysis

---

## Implementation Notes

- **Validation:** Stock must exist on watchlist; returns error if not found
- **Valuation tiers:** Computed using sector median as baseline
- **Performance periods:** 1d, 5d, 1m relative to sector average
- **Foreign flow:** Shows total volume in VND billion for context

## Vietnamese Notes

- **Định giá** = Valuation
- **ỤNG NHÂN** = Undervalued (potential upside)
- **Công bằng** = Fair value
- **Quá mức** = Overvalued
- **Dòng ngoại tệ** = Foreign flow / FDI
