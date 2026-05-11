---
tool: add_to_watchlist
category: system
agents: [market-watcher, financial-analyst]
---

# `add_to_watchlist`

**Category:** system | **Used by:** Market Watcher, Financial Analyst
**Description:** Add a Vietnamese stock to the investment watchlist with optional alert thresholds. If the stock is already present it will be updated (upsert).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| actionCode | string (2-10 chars, uppercase) | ✅ | — | Stock ticker code (e.g. VCB, HPG, GAS) |
| exchange | enum (HOSE, HNX, UPCOM) | ✅ | — | Vietnamese stock exchange |
| domain | enum (oil_gas, banking, real_estate, steel, aviation, retail, tech, utilities, agriculture, insurance, securities, pharma, logistics, gold_mining, automotive, construction, energy, other) | ❌ | — | Business sector / industry |
| notes | string (≤500 chars) | ❌ | — | Personal notes about this position |
| thresholds | object | ❌ | — | Custom alert thresholds (dropPct, risePct, impactScore) |

Thresholds object:
- `dropPct` (number -100 to 0): alert when price drops (e.g. -3)
- `risePct` (number 0 to 100): alert when price rises (e.g. 5)
- `impactScore` (number 0 to 10): minimum AI impact score

## Returns

```
Đã thêm VCB (HOSE) vào danh sách theo dõi.
Cảnh báo: giảm -3% | tăng +5% | impact >= 7/10

Goi y: cung nganh Ngân hàng, ban co the them:
  SHB (Kỹ thương Bank)
  PVB (Public Bank)
  CTG (CTBC Bank)
Dung add_to_watchlist de them.
```

## Usage

```json
{
  "tool_name": "add_to_watchlist",
  "input": {
    "actionCode": "VCB",
    "exchange": "HOSE",
    "domain": "banking",
    "notes": "Major bank, liquidity focus",
    "thresholds": {
      "dropPct": -3,
      "risePct": 5,
      "impactScore": 7
    }
  }
}
```

## Notes

- Upsert: updates existing stock or inserts new
- Default thresholds: drop -3%, rise +5%, impact >= 7/10
- Returns peer suggestions from same sector
- Vietnamese domain names included in response
