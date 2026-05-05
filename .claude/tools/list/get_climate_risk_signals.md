---
tool: get_climate_risk_signals
category: sector
agents: [cowork, market-analyst]
---

# `get_climate_risk_signals`

**Category:** Sector | **Used by:** cowork, market-analyst

Lấy tín hiệu rủi ro khí hậu và thời tiết cho cổ phiếu VN. Phân tích ảnh hưởng bão lũ, hạn hán, El Nino/La Nina, nắng nóng lên các cổ phiếu theo dõi (REE, GEG, BVH, MPC, IDC, v.v.). Bao gồm lịch rủi ro mùa vụ VN.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `stock` | string | No | — | Mã cổ phiếu để lọc kết quả (tùy chọn, ví dụ: REE, GEG, BVH) |

## Returns

Plain-text Vietnamese report showing:
- Current climate indicators (El Niño/La Niña status, typhoon season, drought risk)
- Per-stock impact assessment (bullish/bearish/neutral)
- Seasonal risk calendar (planting, harvest, typhoon seasons)
- Historical precedent (previous similar events and outcomes)
- Confidence scores and monitoring recommendations

## Output Example

```
=== TÍN HIỆU RỦI RO KHÍ HẬU ===

TÌNH TRẠNG TOÀN CẦU:
  El Niño / La Niña: Trung tính (2026-04 to 2026-06)
  Chu kỳ mưa: Mưa gió Tây Nam bắt đầu (có thể muộn 2-3 tuần)
  Rủi ro hạn hán: Trung bình (Tây Nguyên, Đông Nam Bộ)
  Nắng nóng: Dự báo tối đa 35-37°C (bình thường)

TÁC ĐỘNG CỔ PHIẾU:

  REE [GIẢM]: Nước hồ thủy điện dự báo thấp 15% so bình thường (68%)
    Tác động: Lợi nhuận năng lượng tháng 5-8 giảm 12-18%
    Độ tin cậy: 78%

  GEG [TĂNG]: Mưa sắp bắt đầu sớm → nước hồ tăng, cơ hội phát điện tăng
    Tác động: Potential lợi nhuận tăng 8-12% nếu mưa đúng thời hạn
    Độ tin cậy: 65%

  BVH [TRUNG LẬP]: Cây cao su không nhạy cảm với thay đổi 2-3 tuần
    Tác động: Sản xuất ổn định; theo dõi dự báo mưa tháng 6-7
    Độ tin cậy: 82%

LỊCH RỦI RO MÙAVỤ:
  Tháng 5-6: Mưa gió Tây Nam (lũ quét có thể xảy ra)
  Tháng 7-8: Mưa lớn (hạn hán kết thúc)
  Tháng 9-10: Mưa gió Đông Bắc (có bão)

TIÊN LỆ LỊCH SỬ:
  El Niño 2023: Hạn hán 6 tháng → REE giảm 25%, nước hồ -40%
  La Niña 2021: Mưa nhiều → REE tăng 35%, nước hồ +45%

KHUYẾN CÁO: REE rủi ro cao tháng 5-6 — giám sát dự báo thời tiết hàng ngày
```

## Usage

```json
{
  "tool_name": "get_climate_risk_signals",
  "input": {
    "stock": "REE"
  }
}
```

## Data Sources

- `tracked_indicators` — ENSO (El Niño/La Niña) status, rainfall forecasts
- `climate_events` table — historical typhoons, droughts, floods
- External API — NOAA/IMD climate forecasts
- Vietnam-specific calendars — monsoon seasons, harvest schedules
- Watchlist stock climate exposure mapping

## Related Tools

- `get_energy_grid_signals` — power generation and water level impacts
- `get_supply_chain_exposure` — disruption to supply chains via extreme weather
- `analyze` — detailed causal analysis of climate impacts

---

## Implementation Notes

- **ENSO phases:** El Niño (typically dry), La Niña (typically wet), Neutral
- **Seasonal risk calendar:** Hardcoded for Vietnam (monsoon, typhoon, harvest cycles)
- **Affected sectors:** Energy (hydro), Agriculture (crops), Infrastructure (typhoon damage)
- **Historical precedent:** Matches past similar events; shows actual 3-month returns
- **Update frequency:** Weekly (climate data), Daily (forecast updates)

## Affected Stock Categories

| Sector | Stocks | Climate Sensitivity |
|--------|--------|---------------------|
| Energy (Hydro) | REE, GEG, PC1 | Water level, rainfall |
| Agriculture | BT, HAG, SJD | Drought, monsoon timing |
| Real Estate | VNR, DIG, NVL | Typhoon damage risk |
| Infrastructure | IDC, KBC | Flooding, power supply |

## Vietnamese Notes

- **Rủi ro khí hậu** = Climate risk
- **El Niño / La Niña** = El Niño / La Niña climate patterns
- **Hạn hán** = Drought
- **Bão lũ** = Typhoon / flooding
- **Mưa gió Tây Nam** = Southwest monsoon (wet season)
- **Nắng nóng** = Hot weather
- **Nước hồ thủy điện** = Hydroelectric reservoir water level
