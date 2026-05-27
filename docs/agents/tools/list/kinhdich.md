# Kinh Dich (I-Ching) MCP Tools

## Summary

**Category:** Kinh-Dich
**Module:** `apps/mcp-server/src/interface/mcp/tools/kinhdich/`
**Tools:** 6

Market divination and trading signal generation via I-Ching hexagrams. Encodes 6 market dimensions (sentiment, fundamentals, price, foreign flow, sector, macro) into 64 possible readings with Vietnamese interpretation and Markov transition probabilities.

---

## Tools

### 1. `get_kinhdich_reading`

**File:** `kinhDichTools.ts`
**Task:** Task 285
**Type:** Stock-specific divination tool

Computes a full Kinh Dich reading for a single watchlist stock by encoding 6 "hao" (market dimensions) into a 64-hexagram reading.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `code` | string | ✓ | Stock ticker code (e.g. "VCB", "FPT"). Case-insensitive. Must be in watchlist. |

#### Return Value

Vietnamese formatted output including:

```
=== KINH DỊCH READING: VCB ===
Quẻ Chính (Primary Hexagram): 29 [Name] [Chinese]
...
Hao Scores [sentiment, fundamentals, price, foreign flow, sector, macro]
Trading Signal: BUY / SELL / HOLD
Confidence: 85%
Action Note: [Vietnamese interpretation]
Markov: Most likely next hexagram
```

#### Hao (Line) Dimensions

| Hao | Signal | Data Source | Range | Meaning |
|-----|--------|-------------|-------|---------|
| 1 | Sentiment | rag_analyses (7d, 20 entries) | [-1, +1] | Bullish (positive) vs bearish (negative) |
| 2 | Fundamentals | vnstock_financials PE vs sector | [-1, +1] | Undervalued (positive) vs overvalued |
| 3 | Price | market_prices change_pct | [-1, +1] | Momentum (scale: ±5% = ±1.0) |
| 4 | Foreign Flow | vnstock_trading_stats | [-1, +1] | Net foreign volume / 2w avg |
| 5 | Sector | getSectorPeers + market_prices | [-1, +1] | Relative strength vs sector peers |
| 6 | Macro | tracked_indicators (Brent, gold, WTI) | [-1, +1] | Commodity stress (z-score / 2) |

#### Jitter Handling

When a hao score is exactly 0.0 (no data):
- **Deterministic jitter** applied: same code → same jitter (stable across cycles)
- **Per-hao seed:** seed=hao_number (1-6) produces different jitter per hao
- **Magnitude:** |jitter| ∈ [0.05, 0.089] (real scores dominate, stocks differentiate)
- **Task:** Task 1007, extended in KI-278

#### Scoring Notes

- All computations are **best-effort**: missing data defaults to 0.0 (neutral)
- **VPS offline, BCTC missing, no rag_analyses** → all raw scores = 0.0 → jitter prevents convergence
- **Non-zero real signals** are never perturbed

#### Output Sections

1. **Quẻ Chính** (Primary Hexagram): 64-hexagram reading, trading signal, confidence
2. **Quẻ Hỏ** (Derived Hexagram): Symbolic context
3. **Biến Quẻ** (Transition Hexagram): Evolution direction
4. **6 Hào** (Six lines): Per-line interpretation
5. **Nhân Hành** (Five Elements): Dynamic pattern
6. **Thương Mại Nhận Định** (Trading Context): Vietnamese action summary
7. **Markov Next** (if transition data exists): Most likely next hexagram + probability

---

### 2. `get_market_hexagram`

**File:** `kinhDichTools.ts`
**Task:** Task 285
**Type:** Market-wide divination tool

Computes a hexagram for the entire Vietnam stock market using VN-Index momentum and macro indicators.

#### Parameters

None.

#### Hao Mapping (Market-Specific)

| Hao | Dimension | Data Source | Scale |
|-----|-----------|-------------|-------|
| 1 | VN-Index 5d momentum | market_prices_history VNINDEX | ±5% = ±1.0 |
| 2 | VN-Index 20d momentum | market_prices_history VNINDEX | ±5% = ±1.0 |
| 3 | VN-Index 60d momentum | market_prices_history VNINDEX | ±5% = ±1.0 |
| 4 | USD/VND | tracked_indicators | z-score / 2.0 |
| 5 | Oil price | tracked_indicators | z-score / 2.0 |
| 6 | Gold price | tracked_indicators | z-score / 2.0 |

#### Return Value

Formatted reading with market context:

```
=== MARKET HEXAGRAM: VNINDEX ===
...
Quẻ Chính: [number] [name]
Hao Scores: [5d momentum, 20d momentum, 60d momentum, USD/VND, oil, gold]
Trading Signal: [market context]
```

#### Use Cases

- Portfolio hedging decisions (macro stress assessment)
- Sector rotation signals
- FX exposure planning

---

### 3. `get_hexagram_history`

**File:** `kinhDichTools.ts`
**Task:** Task 285
**Type:** Timeline tool

Retrieves the history of Kinh Dich readings for a stock over N days (default 30).

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `code` | string | ✓ | Stock ticker (e.g. "VCB") |
| `days` | number | | Time window (1-365, default 30) |

#### Return Value

Timeline table:

```
=== LỊCH SỬ KINH DỊCH: VCB (30 ngày) ===
Tổng số lần đọc: 15

2025-05-04 10:30 | Quẻ 29 [Name] [Chinese] | Tín hiệu: BUY | Độ tin cậy: 85%
2025-05-03 10:30 | Quẻ 30 [Name] [Chinese] | Tín hiệu: HOLD | Độ tin cậy: 72%
...

Quẻ phổ biến nhất: Quẻ 29 [Name] (5 lần)
Cập nhật: 2025-05-05 14:22 UTC
```

#### Data Source

Reads from `kinhdich_readings` table (stored by `get_kinhdich_reading`).

---

### 4. `get_transition_probabilities`

**File:** `kinhDichTools.ts`
**Task:** Task 285
**Type:** Markov transition tool

Analyzes historical hexagram transitions: given hexagram N, which hexagrams are most likely to follow?

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `hexagram_number` | number | ✓ | 1-64 |
| `code` | string | | Stock code (optional, default "VNINDEX" for market-wide) |

#### Return Value

Top 10 transitions with probabilities and win rates:

```
=== XÁC SUẤT CHUYỂN QUẺ: Từ Quẻ 29 (Kh Sâu) ===
Cổ phiếu: VCB

Xác suất chuyển sang (top 10):
  → Que 30 [Name]: 35% (7 lan) | Thay đổi TB: +2.3% | Tỷ lệ thắng: 86%
  → Que 29 [Name]: 28% (5 lan) | Thay đổi TB: +1.1% | Tỷ lệ thắng: 80%
  ...
```

#### Metrics Per Transition

| Field | Meaning |
|-------|---------|
| Probability | % of observations that followed this path |
| Count | Number of times this transition occurred |
| Avg Price Change | Average 5-day return after transition |
| Win Rate | % of transitions that were profitable |

#### Use Cases

- Confidence building: "Hexagram 29 has transitioned to 30 before, win rate 86%"
- Portfolio rebalancing triggers
- Risk management (if next hex is bearish-biased)

---

### 5. `run_hexagram_backtest`

**File:** `kinhDichTools.ts`
**Task:** Task 285
**Type:** Backtesting tool

Measures accuracy of hexagram trading signals against actual price outcomes over N days.

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `code` | string | | Stock code (default "VNINDEX" for market) |
| `days` | number | | Time window to analyze (7-365, default 30) |

#### Return Value

Performance report:

```
=== BACKTEST KINH DỊCH: VCB (30 ngày) ===

Tổng số lần đọc: 15
Độ chính xác (BUY/SELL): 73%
Lợi nhuận TB 5 phiên: +1.23%

Quẻ tốt nhất: 29 [Name] (tỷ lệ thắng: 86%, 7 lần)
Quẻ xấu nhất: 31 [Name] (tỷ lệ thắng: 44%, 3 lần)

Lưu ý: Backtest chỉ mang tính tham khảo. Kinh Dịch là công cụ hỗ trợ — không phải cam kết lợi nhuận.
```

#### Metrics

| Metric | Definition |
|--------|-----------|
| Accuracy | % of BUY signals followed by price increase, % of SELL signals followed by decrease |
| Avg Return 5d | Average 5-day return after each trading signal |
| Best Hexagram | Highest win rate (and frequency) |
| Worst Hexagram | Lowest win rate |

#### Data Source

- **Readings:** `kinhdich_readings` (timestamp, hexagram_number, trading_signal)
- **Prices:** `market_prices_history` (fetched_at, price)

#### Important Notes

- Backtest is **advisory only**
- Kinh Dich is a **supporting tool**, not a guarantee
- Requires prior stored readings to compute

---

### 6. `explain_hexagram`

**File:** `kinhDichTools.ts`
**Task:** Task 285
**Type:** Reference/education tool

Provides full Vietnamese explanation for any hexagram (1-64).

#### Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `number` | number | ✓ | Hexagram number (1-64) |

#### Return Value

Comprehensive Vietnamese documentation:

```
=== QUE 29: Khăn Sâu 坎
Thượng quán (trên): Khăn | Hạ quán (dưới): Khăn

Ý nghĩa chính: Nguy hiểm, sự khó khăn, thử thách
[Full judgment, image, trend, career warning, 6 lines with interpretations]

Nhận định giao dịch: Bất lợi cho giao dịch — cẩn thận
```

#### Sections Per Hexagram

1. **Name & Chinese character**
2. **Trigrams (upper + lower)**
3. **Core meaning**
4. **Hào từ (Judgment)** — formal interpretation
5. **Tượng truyện (Image)** — symbolic action
6. **Tình trạng quẻ** — trend, career, warning
7. **6 Hào (Six lines)** — per-line meaning + outcome + action
8. **Trading context** — "Thuận lợi" (favorable) vs "Bất lợi" (unfavorable)

#### Data Source

`QUE_META` and `QUE_DATA` (hexagramLibrary.ts) — hardcoded Vietnamese translations.

---

## Database Tables

### `kinhdich_readings`

Stores all computed readings.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | UUID |
| `stock_code` | TEXT | "VCB", "VNINDEX", etc. |
| `hexagram_number` | INTEGER | 1-64 |
| `ho_que_number` | INTEGER | Derived hexagram |
| `bien_que_number` | INTEGER | Transition hexagram |
| `hao_states` | TEXT | JSON array of 6 hao states (YANG/YIN/old) |
| `raw_scores` | TEXT | JSON array of 6 hao scores [-1, +1] |
| `ngu_hanh_dynamic` | TEXT | Five-element pattern |
| `trading_signal` | TEXT | "BUY", "SELL", "HOLD" |
| `confidence` | REAL | 0.0 … 1.0 |
| `action_note` | TEXT | Vietnamese interpretation |
| `created_at` | TEXT | ISO datetime (UTC) |

### `kinhdich_transitions`

Markov transition frequency table.

| Column | Type | Notes |
|--------|------|-------|
| `from_hexagram` | INTEGER | Source hexagram (1-64) |
| `to_hexagram` | INTEGER | Destination hexagram (1-64) |
| `stock_code` | TEXT | Specific stock or "VNINDEX" |
| `count` | INTEGER | Number of observations |
| `probability` | REAL | count / total transitions for from_hexagram |
| `avg_price_change_pct` | REAL | Average 5-day return after transition |
| `win_rate` | REAL | % of transitions with positive return |

---

## Hexagram Library

`QUE_META` (64 entries) contains metadata:

```typescript
{
  id: 29,
  name: "Khăn Sâu",
  chinese: "坎",
  upper: "Khăn",
  lower: "Khăn",
  tradingSignal: "SELL",
  confidence: 0.85
}
```

`QUE_DATA` maps hexagram number → full Vietnamese explanation (judgment, image, 6 lines).

---

## Scoring Notes

### Sentiment Score (Hao 1)

- Counts `rag_analyses` entries (7d window, max 20)
- Bullish keywords: "BULLISH", "TĂNG", "MUA", "TÍCH CỰC"
- Bearish keywords: "BEARISH", "GIẢM", "BÁN", "TIÊU CỰC"
- Formula: (bullish - bearish) / total

### Fundamentals Score (Hao 2)

- Compares stock PE vs sector average
- PE below sector avg → positive (undervalued)
- PE above sector avg → negative (overvalued)
- Formula: (avgPE - targetPE) / avgPE, clamped [-1, +1]

### Price Score (Hao 3)

- Latest `market_prices.change_pct`
- Scale: ±5% change = ±1.0 score
- Formula: change_pct / 5.0, clamped [-1, +1]

### Foreign Flow Score (Hao 4)

- `vnstock_trading_stats` foreign_volume / avg_volume_2w
- Formula: clamped [-1, +1]

### Sector Score (Hao 5)

- Stock change_pct vs sector peer average
- Outperformance by +3% → +1.0 score
- Underperformance by -3% → -1.0 score
- Formula: (myChange - sectorAvg) / 3.0, clamped [-1, +1]

### Macro Score (Hao 6)

- Commodities: Brent, WTI, gold (3 latest readings)
- Per-indicator: derive z-score from rolling 20-period window
- Negative z (commodities falling) → positive for stocks
- Formula: -avgZ / 2.0, clamped [-1, +1]

---

## Error Handling

### Stock Not in Watchlist

```
Lỗi: VCB không có trong watchlist. Thêm cổ phiếu trước khi đọc Kinh Dịch.
```

### No History Data

```
Chưa có lịch sử quẻ Kinh Dịch cho VCB trong 30 ngày qua. Chạy get_kinhdich_reading trước.
```

### Invalid Hexagram Number

```
Lỗi: Quẻ 99 không tồn tại. Quẻ Kinh Dịch chỉ có số từ 1 đến 64.
```

---

## Vietnamese / Cultural Notes

- **Kinh Dịch** = "I-Ching" / "Book of Changes" (易經)
- **Quẻ** = hexagram
- **Hào** = line (6 per hexagram)
- **Quẻ Chính** = primary hexagram (current situation)
- **Quẻ Hỏ** = derived hexagram (underlying forces)
- **Biến Quẻ** = transition hexagram (evolution)
- **Nhân Hành** = Five Elements (metal, wood, water, fire, earth)
- **Thượng quán** = upper trigram
- **Hạ quán** = lower trigram

---

## Related Tools

- `run_hexagram_backtest` — Backtest accuracy of signals (embedded in same module)
- `get_transition_probabilities` — Markov analysis (embedded)
- `ta_alert_scan` — TA confirmation signals (for combined-high-confidence strategy)

---

## Implementation Notes

- **Best-effort scoring:** All hao computations have try/catch; missing data → 0.0
- **Deterministic jitter:** Same code always produces same jitter (reproducibility)
- **No network calls:** All data from local SQLite
- **Vietnamese-first:** All output labels and explanations in Vietnamese
- **Confidence clamping:** All scores clamped to [-1, +1]

