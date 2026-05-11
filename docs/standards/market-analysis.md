# Market Analysis Reference

## Causal Cascade Framework (4 levels)

```
Level 1 (global)   → Macro event (Fed rate, oil price, US tariffs, war)
       ↓
Level 2 (country)  → Vietnamese macro impact (VND/USD, CPI, credit, FDI)
       ↓
Level 3 (domain)   → Sector impact (banking, real estate, steel, retail, pharma)
       ↓
Level 4 (action)   → Specific stock in your watchlist (VCB, HPG, VIC, MWG...)
```

### Impact scoring

- 9-10: Direct, near-certain impact (e.g., rate hike → bank NIM compression)
- 7-8: Strong likely impact (e.g., USD strength → import-heavy sector margins)
- 5-6: Moderate indirect impact
- 3-4: Weak / lagged impact
- 1-2: Very indirect, speculative

## Trade Relationship Analysis

Trade exposure data lives in SQLite `trade_exposures` table. AI agents update via `upsertTradeExposure()`.

### Quy trình phân tích tin vĩ mô (BẮT BUỘC)

Khi gặp tin vĩ mô/địa chính trị, LUÔN thực hiện 3 bước:

1. Xác định SỰ KIỆN → escalation hay de-escalation?
2. Check TRADE MAP → ai bị ảnh hưởng TRỰC TIẾP? (query `trade_exposures` table)
3. Check SECTOR CASCADE → ngành nào bị ảnh hưởng GIÁN TIẾP?

### Reverse Map Pattern

When analyzing a global event, check which watchlist stocks have direct exposure:
- Query `trade_exposures` for country/region match
- Cross-reference with sector cascade rules in `cascadeEngine.ts`
- 16 sectors monitored: banking, tech, real_estate, steel, oil_gas, aviation, retail, securities, utilities, agriculture, insurance, pharma, logistics, gold_mining, automotive, other

## Global-to-Vietnam Macro Cascade Matrix

The cascade engine has **60+ rules** mapping global events to Vietnamese sectors. Data sources: Trading Economics stream (global macro news), Yahoo Finance (commodities), Vietcombank (FX).

### Key relationships

| Category | Global Event | VN Impact |
|----------|-------------|-----------|
| Monetary | Fed rate hike | Banking ↑ NIM, BĐS ↓, EM outflow |
| Monetary | Fed rate cut | BĐS ↑, vốn ngoại quay lại EM |
| Commodity | Oil >$100 | Dầu khí ↑↑, Hàng không ↓↓, Logistics ↓ |
| Commodity | Gold >$4000 | PNJ ↑, risk-off = bán cổ phiếu |
| FX | USD/VND >25,500 | Nông nghiệp ↑ (xuất khẩu), Ô tô ↓ (nhập khẩu) |
| FX | DXY tăng mạnh | Chứng khoán ↓↓, rút vốn ngoại EM |
| Geopolitics | Chiến tranh | Dầu khí ↑, Vàng ↑, Logistics ↓ |
| Trade | US-China trade war | VN hưởng lợi chuyển dịch chuỗi cung ứng |

### Auto-adjusted thresholds (in `macroThresholds.ts`)

| Indicator | Threshold levels |
|-----------|-----------------|
| Brent crude | >$90: oil_gas +0.10 | >$100: aviation -0.12 |
| Gold | >$2000: +0.05 | >$3000: +0.10 | >$4000: +0.08 |
| Refinancing rate | >6%: banking -0.08, BĐS -0.10 |
| USD/VND | >25,500: agriculture +0.06, automotive -0.05 |

## BCTC Analysis Checklist

**Revenue quality**: Doanh thu thuần YoY/QoQ, Gross margin stable/improving?

**Profitability**: EBITDA margin >15%? Net profit margin trend (3-4Q), EPS growth

**Balance sheet**: D/E <2x industrials / <8x banks, Current ratio >1.2, Cash conversion

**Red flags**: AR growing faster than revenue, Inventory pile-up, Short-term debt refinancing, Goodwill impairment

**Investment thesis**: Forward PE vs sector avg, ROE trend (banking >15%, industrial >12%), Dividend yield + payout ratio
