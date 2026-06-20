---
<!-- size-justification: 160L — single-file canonical contract; all sections are load-bearing for
     TASK-RSIFIX-2 (dev-mcp-server rewire) and cross-checked against Go source at time of writing.
     Every numeric constant is cited to its source file + line. -->

doc_type: canonical-contract
title: Go TA Engine — Pure-Compute Path Contract
service: technical-analysis
port: 5003
source_revision: 2026-06-21
parent_fix: FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE
unblocks: TASK-RSIFIX-2
---

# Go TA Engine — Pure-Compute Path Contract

Single source of truth for the Go technical-analysis service HTTP contract and every numeric parameter used in RSI, Bollinger Bands, MACD, and Moving Averages.

**Accuracy guarantee:** every constant below is derived from the actual Go source files listed in § 8.
A drift between this document and those files is the failure class this contract exists to prevent.

---

## 1. Endpoint

```
POST http://localhost:5003/ta/indicators
Content-Type: application/json
```

Two request paths:

| Path | Required fields | DB access |
|---|---|---|
| Pure-compute | `closes` (non-empty float64 array) | None |
| DB-backed | `symbol` (non-empty string), `closes` absent or empty | Reads market.db |

This contract covers the **pure-compute path only** (non-empty `closes`).
Source: `pkg/interface/http/router.go:47-52`, `pkg/application/usecases.go:43-63`

---

## 2. Request Schema

```jsonc
{
  "closes": [44.34, 44.09, 44.15, ...],  // float64[], oldest-first, required for pure-compute
  "period": 14,                           // int, optional — drives RSI + parameterised MA; default 14
  "symbol": ""                            // string, optional — omit on pure-compute path
}
```

- `closes`: oldest candle first, newest candle last.
- `period`: defaults to `14` when zero or absent (`pkg/application/usecases.go:46-48`).
- `symbol` + empty `closes`: triggers DB-backed path (out of scope for this contract).
- Both `closes` empty AND `symbol` empty: HTTP **400** `{"error":"closes or symbol required"}` (`router.go:47-52`).

---

## 3. Response Schema

```jsonc
{
  "symbol": "",                    // string, empty on pure-compute path
  "rsi":             [62.54, ...], // float64[], omitted when insufficient data
  "macdLine":        [0.12, ...],  // float64[], omitted when insufficient data
  "signalLine":      [0.08, ...],  // float64[], omitted when insufficient data
  "histogram":       [0.04, ...],  // float64[], omitted when insufficient data
  "bollingerUpper":  [47.2, ...],  // float64[], omitted when insufficient data
  "bollingerMiddle": [45.1, ...],  // float64[], omitted when insufficient data
  "bollingerLower":  [43.0, ...],  // float64[], omitted when insufficient data
  "sma":             [44.9, ...],  // float64[], SMA at request `period`; omitted when insufficient
  "ema":             [44.8, ...],  // float64[], EMA at request `period`; omitted when insufficient
  "ma5":             [45.2, ...],  // float64[], SMA(5)  fixed; omitted when closes.length < 5
  "ma20":            [44.7, ...],  // float64[], SMA(20) fixed; omitted when closes.length < 20
  "ma50":            [43.9, ...]   // float64[], SMA(50) fixed; omitted when closes.length < 50
}
```

All indicator fields use `json:",omitempty"`. An absent field means "insufficient data for this indicator" — it is **not** an error.
Source: `pkg/application/dtos.go:15-30`

---

## 4. RSI — Wilder Method (period = 14)

### 4.1 Parameters

| Parameter | Value | Source |
|---|---|---|
| Default period | **14** | `pkg/module/technical_analysis.go:51` |
| Seed method | SMA of first `period` gain/loss values | `pkg/primitive/rsi/rsi.go:33-43` |
| Smoothing | Wilder exponential: `(prevAvg * (period-1) + current) / period` | `pkg/primitive/rsi/rsi.go:56-57` |
| Hard min candles | `period + 1` = **15** | `pkg/primitive/rsi/rsi.go:24-26` |
| Recommended min candles | **35** (see § 4.3) | convergence analysis — not enforced in code |
| Output length | `len(closes) - period` | `pkg/primitive/rsi/rsi.go:45` |
| Output range | `[0, 100]` | `pkg/primitive/rsi/rsi.go:64-72` |

### 4.2 Algorithm (exact Go)

```go
// Seed: simple average of first `period` moves.  rsi.go:33-43
var seedGain, seedLoss float64
for i := 1; i <= period; i++ {
    if d := closes[i] - closes[i-1]; d > 0 {
        seedGain += d
    } else {
        seedLoss -= d
    }
}
avgGain := seedGain / float64(period)
avgLoss := seedLoss / float64(period)

// Wilder smoothing for remaining candles.  rsi.go:49-58
avgGain = (avgGain*float64(period-1) + gain) / float64(period)
avgLoss = (avgLoss*float64(period-1) + loss) / float64(period)

// RSI formula.  rsi.go:64-72
RSI = 100 - 100 / (1 + avgGain/avgLoss)
// Special cases: avgLoss==0 → RSI=100; avgGain==0 → RSI=0
```

Note: Wilder smoothing `(prev*(N-1)+cur)/N` is **not** the standard EMA multiplier `2/(N+1)`.
With period=14: Wilder alpha = 1/14 ≈ 0.0714. Standard EMA alpha = 2/15 ≈ 0.1333.
This difference is the root cause of the divergence between the Go engine and any TS code using standard EMA.

### 4.3 Why min-candles=35 is recommended (convergence warmup)

The hard minimum of 15 candles (period+1) produces a first RSI value seeded on exactly 14 price moves. Because the Wilder smoother has a long memory (alpha=1/14), the initial SMA seed introduces a bias that decays slowly. Empirically, it takes approximately 2.5 × period = 35 bars before the SMA-seeded value converges to a stable Wilder-smoothed series.

- At 15 candles: first RSI value, SMA-seeded — high variance, not reliable for signals.
- At 35 candles: Wilder smoother has iterated 21 times past the seed (21 × 1/14 ≈ 1.5 half-lives) — output is stable enough for production signals.

**Rule for callers:** feed at least 35 closes for RSI14. The engine will not error with 15-34 closes, but the value should be marked as warmup-phase and not used for signal generation.

### 4.4 Fixtures

```
// 41 closes → RSI present (41 >= 35 recommended, 41 >= 15 hard minimum)
POST /ta/indicators {"closes": [c1, ..., c41]}
→ 200, rsi field present, len(rsi) = 27

// 34 closes → RSI present at code level (34 >= 15) but in warmup zone (34 < 35)
POST /ta/indicators {"closes": [c1, ..., c34]}
→ 200, rsi field present, len(rsi) = 20, VALUE IN WARMUP — do not use for signals

// 14 closes → RSI absent (14 < 15 hard minimum)
POST /ta/indicators {"closes": [c1, ..., c14]}
→ 200, rsi field ABSENT (omitted)
```

---

## 5. Bollinger Bands (period = 20, multiplier = 2.0)

| Parameter | Value | Source |
|---|---|---|
| Default period | **20** | `pkg/module/technical_analysis.go:54` |
| Default multiplier | **2.0** | `pkg/module/technical_analysis.go:66` |
| Std dev method | **Population** (divisor N, not N-1) | `pkg/primitive/bollinger_bands/bollinger_bands.go:8,86-93` |
| Hard min candles | `period` = **20** | `pkg/primitive/bollinger_bands/bollinger_bands.go:50-52` |
| Output length | `len(closes) - period + 1` | `pkg/primitive/bollinger_bands/bollinger_bands.go:59` |
| Middle band | SMA(closes, 20) | `pkg/primitive/bollinger_bands/bollinger_bands.go:66` |
| Upper band | `middle + 2.0 * populationStdDev` | `pkg/primitive/bollinger_bands/bollinger_bands.go:67` |
| Lower band | `middle - 2.0 * populationStdDev` | `pkg/primitive/bollinger_bands/bollinger_bands.go:68` |

Population std dev (divisor N) follows John Bollinger's original specification.

---

## 6. MACD (fast=12, slow=26, signal=9)

| Parameter | Value | Source |
|---|---|---|
| Fast EMA period | **12** | `pkg/module/technical_analysis.go:53` |
| Slow EMA period | **26** | `pkg/module/technical_analysis.go:56` |
| Signal EMA period | **9** | `pkg/module/technical_analysis.go:59` |
| EMA seed method | SMA of first `period` values | `pkg/primitive/macd/ema.go:24-27` |
| EMA smoothing | Standard: `(value - prev) * k + prev`, k = `2/(period+1)` | `pkg/primitive/macd/ema.go:20,33-35` |
| Hard min candles | `slow + signal` = **35** | `pkg/primitive/macd/macd.go:52-55` |
| MACD line | `fastEMA - slowEMA` (aligned to slow EMA start) | `pkg/primitive/macd/macd.go:76-78` |
| Signal line | EMA(macdLine, 9) | `pkg/primitive/macd/macd.go:81` |
| Histogram | `macdLine - signalLine` | `pkg/primitive/macd/macd.go:90` |
| Output length | `len(closes) - slow - signal + 1` = `len(closes) - 34` | `pkg/primitive/macd/macd.go:86` |

Note: MACD EMA uses **standard EMA** (k=2/(N+1)), not Wilder smoothing.

---

## 7. Moving Averages

### 7.1 Fixed standard MAs (always computed independently of request `period`)

| Field | Type | Period | Hard min candles | Source |
|---|---|---|---|---|
| `ma5` | SMA | **5** | 5 | `pkg/module/technical_analysis.go:118` |
| `ma20` | SMA | **20** | 20 | `pkg/module/technical_analysis.go:122` |
| `ma50` | SMA | **50** | 50 | `pkg/module/technical_analysis.go:126` |

All three are computed unconditionally. If closes is too short, the field is absent (non-fatal, omitempty).

### 7.2 Parameterised MA (driven by request `period`)

| Field | Type | Period | Default | Source |
|---|---|---|---|---|
| `sma` | SMA | request `period` | 14 | `pkg/module/technical_analysis.go:62,109` |
| `ema` | EMA | request `period` | 14 | `pkg/module/technical_analysis.go:62,113` |

SMA: rolling mean, output length `len(closes) - period + 1`. Source: `pkg/primitive/moving_average/moving_average.go:29-55`

EMA: SMA-seeded, alpha = `2/(period+1)` (standard EMA, NOT Wilder). Source: `pkg/primitive/moving_average/moving_average.go:62-94`

---

## 8. Error Contract

| Condition | HTTP status | Body | Field behaviour |
|---|---|---|---|
| Sufficient data for indicator | 200 | JSON object | Field present with computed values |
| Insufficient data for indicator | 200 | JSON object | **Field absent** (omitempty) |
| Both `closes` empty AND `symbol` empty | **400** | `{"error":"closes or symbol required"}` | N/A |
| Invalid request JSON | **400** | `{"error":"invalid request body"}` | N/A |
| Internal/DB error | **500** | `{"error":"internal error"}` | N/A |

Source: `pkg/interface/http/router.go:40-66`, `pkg/module/technical_analysis.go:80-138`

Key non-fatal policy: `pkg/module/technical_analysis.go:94-95` —
> "Each block is non-fatal: error means insufficient data, fields stay nil."

**Callers must treat a missing field as "not enough data", never as an error.**

---

## 9. Output Series Alignment

All output series are shortest-first (oldest output value first, matching input close ordering).
Multiple indicators in the same response have different lengths; callers must align by index offset:

| Indicator | Output starts at input index | Min input length |
|---|---|---|
| RSI14 | 14 | 15 |
| BB20 | 19 | 20 |
| MACD(12,26,9) | 34 | 35 |
| MA5 | 4 | 5 |
| MA20 | 19 | 20 |
| MA50 | 49 | 50 |

The last element of every series corresponds to the most recent close (rightmost input value).

---

## 10. Source Files

All constants in this document were verified against these files at commit `d7b14545`:

| File | Role |
|---|---|
| `apps/technical-analysis/pkg/primitive/rsi/rsi.go` | Wilder RSI math, hard min gate (period+1), smoothing formula |
| `apps/technical-analysis/pkg/primitive/bollinger_bands/bollinger_bands.go` | BB math, population std dev, period=20 default wired via module |
| `apps/technical-analysis/pkg/primitive/macd/macd.go` | MACD composition, output alignment, min-candle gate |
| `apps/technical-analysis/pkg/primitive/macd/ema.go` | EMA helper: SMA seed, standard alpha k=2/(N+1) |
| `apps/technical-analysis/pkg/primitive/moving_average/moving_average.go` | SMA + EMA implementations, alpha formula |
| `apps/technical-analysis/pkg/module/technical_analysis.go` | Default params (RSI=14, MACD=12/26/9, BB=20/2.0, MA=14), non-fatal policy, fixed MA5/MA20/MA50 |
| `apps/technical-analysis/pkg/application/dtos.go` | JSON field names, omitempty tags |
| `apps/technical-analysis/pkg/application/usecases.go` | Two-path dispatch, period default=14 |
| `apps/technical-analysis/pkg/interface/http/router.go` | HTTP error contracts (400/500), endpoint path POST /ta/indicators |
| `apps/technical-analysis/cmd/server/main.go` | Port 5003, composition root wiring |
