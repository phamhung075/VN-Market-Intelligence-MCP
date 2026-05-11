---
tool: get_energy_grid_signals
category: sector
agents: [cowork, market-analyst]
---

# `get_energy_grid_signals`

**Category:** Sector | **Used by:** cowork, market-analyst

Lấy tín hiệu thị trường điện lực VN: mức nước hồ thủy điện, cơ cấu phát điện, nguy cơ thiếu điện. Phân tích ảnh hưởng lên cổ phiếu năng lượng (REE, GEG, PC1) và khu công nghiệp (IDC, KBC).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| — | — | — | — | No parameters |

## Returns

Plain-text Vietnamese report showing:
- Hydroelectric reservoir levels (% capacity, trend)
- Power generation mix (hydro %, coal %, renewable %)
- Grid frequency and demand status
- Electricity price signals
- Impact on energy stocks and industrial zones
- Forecast for next 7-30 days

## Output Example

```
=== TÍN HIỆU THỊ TRƯỜNG ĐIỆN LỰC VN ===
Cập nhật: 2026-05-05 10:30:00 GMT+7

TÌNH TRẠNG THỦY ĐIỆN:
  Mức nước hồ trung bình: 42.5% (tháng trước: 38.2%, bình thường: 52%)
  Xu hướng: Tăng chậm (+4.3pp)
  Cảnh báo: MỨC NƯỚC THẤPNON-CRITICAL

CƠCẤU PHÁT ĐIỆN (24h qua):
  Thủy điện: 28% (năng lực: 16.5 GW)
  Than đá: 55% (năng lực: 33.2 GW)
  Khí đốt: 12% (năng lực: 7.2 GW)
  Tái tạo: 5% (năng lực: 3.0 GW)

TÌNH TRẠNG LƯỚI ĐIỆN:
  Tần số lưới: 50.02 Hz (ổn định)
  Nhu cầu: 185 GWh/ngày (thấp hơn 3% so bình thường)
  Dự trữ: 8.2% dung tích (an toàn)
  Giá điện thị trường: 1.750 triệu VNĐ/MWh (+1.2%)

TÁC ĐỘNG CỔ PHIẾU:

  REE [TRUNG LẬP → GIẢM]: Nước thấp → phát điện thủy giảm
    Tác động: Lợi nhuận 5-8% thấp hơn bình thường nếu nước không tăng
    Độ tin cậy: 85%
    Khuyến cáo: GIỮ

  GEG [TĂNG]: Nước tăng từ từ → cơ hội phát điện tăng
    Tác động: Lợi nhuận dự báo tăng 4-6% nếu mưa tiếp tục
    Độ tin cậy: 72%
    Khuyến cáo: TÍCH CỰC

  PC1 [TRUNG LẬP]: Nhà máy than không bị ảnh hưởng trực tiếp
    Tác động: Giá điện cao (1.75M) có lợi cho lợi nhuận
    Độ tin cậy: 78%
    Khuyến cáo: GIỮ

  IDC, KBC [TRUNG LẬP]: Chi phí điện ổn định (không đột biến)
    Tác động: Margin bền vững nếu không có tăng giá nhân công
    Độ tin cậy: 80%
    Khuyến cáo: GIỮ

DỰ BÁO 7 NGÀY:
  Mức nước dự báo: 45-48% (nếu mưa bình thường)
  Giá điện: Dự báo ổn định ±2%
  Rủi ro: Mưa muộn → nước có thể giảm

DỰ BÁO 1 THÁNG:
  Mưa gió Tây Nam bắt đầu → nước tăng mạnh dự báo tháng 6
  REE lợi nhuận dự báo tăng 15-25% nếu mưa đúng
  Giá điện dự báo giảm 5-8% khi thủy điện tăng

TỔNG KẾT: GEG tích cực ngắn hạn; REE có cơ hội tháng 6+
```

## Usage

```json
{
  "tool_name": "get_energy_grid_signals",
  "input": {}
}
```

## Data Sources

- `tracked_indicators` — reservoir levels, power generation mix, grid frequency
- `market_prices` — electricity price (wholesale market)
- `watchlist` — energy and industrial stocks
- EVN (Electricity Vietnam) reports — daily operational data
- Weather forecasts — rainfall predictions for reservoirs

## Related Tools

- `get_climate_risk_signals` — weather and drought forecasts
- `get_supply_chain_exposure` — power supply to manufacturing
- `compare_stocks` — REE vs GEG vs PC1 comparison

---

## Implementation Notes

- **Data freshness:** EVN updates twice daily; forecast horizon 7-30 days
- **Reservoir calculation:** (Current level / Max capacity) × 100%
- **Generation mix:** Dispatch-weighted average from past 24 hours
- **Grid frequency:** Standard 50 Hz ± 0.1 Hz is normal
- **Price impact:** Forward curve used for longer forecasts

## Energy Stocks by Generation Type

| Stock | Type | Capacity | Climate Sensitivity |
|-------|------|----------|---------------------|
| REE | Hydro | 3.6 GW | Very high (water level) |
| GEG | Hydro | 2.8 GW | Very high (water level) |
| PC1 | Coal | 5.4 GW | Low (dispatch volume) |
| VSH | Gas/Hydro | 3.2 GW | Medium (mixed) |

## Vietnamese Notes

- **Thủy điện** = Hydroelectric power
- **Mức nước hồ** = Reservoir water level
- **Cơ cấu phát điện** = Power generation mix
- **Giá điện** = Electricity price
- **Tần số lưới** = Grid frequency
- **Dự trữ** = Reserve capacity
