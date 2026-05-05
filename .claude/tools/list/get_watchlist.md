---
tool: get_watchlist
category: system
agents: [market-watcher, financial-analyst, all-cowork]
---

# `get_watchlist`

**Category:** system | **Used by:** Market Watcher, Financial Analyst, All Cowork agents
**Description:** Display all stocks in the watchlist with current alert thresholds and last known price.

## Parameters

None

## Returns

Vietnamese-language formatted list showing:
- Stock code, exchange (HOSE/HNX/UPCOM), domain
- Current price (VND) and change percent
- Alert thresholds: drop %, rise %, impact score
- Personal notes (if any)

## Usage

```json
{
  "tool_name": "get_watchlist",
  "input": {}
}
```

Sample output:

```
Watchlist — 30 cổ phiếu
Trading window: 09:00–15:00 VN (Mon–Fri) · NOW CLOSED

  VCB    [HOSE] Ngân hàng
         Giá: 90,250 VND (+2.15%)
         Ngưỡng: giảm -3% | tăng +5% | impact >= 7/10

  FPT    [HOSE] Công nghệ
         Giá: 68,500 VND (-1.30%)
         Ngưỡng: giảm -5% | tăng +8% | impact >= 6/10
         Ghi chú: High volatility stock
```

## Notes

- Sorted by domain and code
- Includes trading window status
- Shows last known price from market_prices table
- Thresholds help Alert Commander decide when to trigger
