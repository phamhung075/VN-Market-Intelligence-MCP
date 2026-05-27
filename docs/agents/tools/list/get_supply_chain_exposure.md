---
tool: get_supply_chain_exposure
category: sector
agents: [cowork, market-analyst]
---

# `get_supply_chain_exposure`

**Category:** Sector | **Used by:** cowork, market-analyst

Analyzes supply chain exposure for Vietnamese stocks based on global shipping indices (BDI, FBX) and detected disruption events. Shows which stocks are bullish/bearish based on shipping cost deviations.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `stock` | string | No | — | Optional: filter results to a specific stock code (e.g. 'HPG'). Omit for all watchlist stocks. |

## Returns

Plain-text Vietnamese report showing:
- Current shipping index values and % change (BDI, FBX, SCFI)
- Supply chain disruption events (if detected) with severity and affected routes
- Per-stock impact signals (bullish/bearish/neutral) with confidence
- Summary rating (stable / minor signals / critical)

## Output Example

```
PHÂN TÍCH CHUỖI CUNG ỨNG - 2026-05-05 14:30:15

CHỈ SỐ VẬN TẢI BIỂN:
  BDI: 1.245 (+2.3%) - 2026-05-05
  FBX_ASIA_US: 2.840 (-1.5%) - 2026-05-05
  SCFI: 892 (+0.8%) - 2026-05-05

SỰ KIỆN GIÁN ĐOẠN: Không phát hiện sự kiện bất thường

TÍN HIỆU TÁC ĐỘNG CỔ PHIẾU:

  BDI - +2.5σ (HIGH, tin cay 78%):
  Sai lệch: BDI 2.5 độ lệch chuẩn trên trung bình
    HPG [TĂNG]: High shipping costs boost construction steel demand
    GMD [TĂNG]: Logistics partner to HPG; benefits from supply squeeze
    VNM [GIẢM]: FMCG facing rising transportation costs

TỔNG KẾT: Phát hiện tín hiệu nhẹ — theo dõi thêm
```

## Usage

```json
{
  "tool_name": "get_supply_chain_exposure",
  "input": {
    "stock": "HPG"
  }
}
```

## Data Sources

- `tracked_indicators` — shipping index history (BDI, FBX, SCFI)
- `market_prices` — watchlist stock prices
- `watchlist` — stock list and classifications
- `macroThresholds` — z-score deviation calculations

## Related Tools

- `get_energy_grid_signals` — power generation impact on supply chain
- `get_crisis_early_warning` — detect velocity-based disruptions
- `analyze` — detailed causal analysis of supply chain impacts

---

## Implementation Notes

- **Shipping indices:** BDI (Baltic Dry Index), FBX (Freightos Box Index), SCFI (Shanghai Containerized Freight Index)
- **Deviation scoring:** Z-scores computed from 30-day rolling history
- **Severity levels:** LOW (<1σ), MEDIUM (1-2σ), HIGH (2-3σ), CRITICAL (>3σ)
- **Stock filtering:** Optional parameter allows focusing on single stock or all watchlist

## Vietnamese Notes

- **Chuỗi cung ứng** = Supply chain
- **Chỉ số vận tải** = Shipping indices
- **Sự kiện gián đoạn** = Disruption event
- **Tín hiệu tác động** = Impact signals
- **Độ tin cậy** = Confidence level
