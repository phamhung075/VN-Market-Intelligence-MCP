# Gate Probe RAW Result — FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (2026-06-16)

**Verdict: RED.** Router RAW-verified (LIVE, not relayed badges). Behavioral gate FAILS, and the
RAW evidence overturns the task's presumed owner (dev-alert-engine) — true root cause is in
**dev-mcp-server** (corrupt synthetic daily candle, unit-scale bug). Do **NOT** promote to
done_verified, do **NOT** release FIX-ALERT-OPEN-ZERO-PRICE-RACE, do **NOT** push.

## What the gate checked
Post-rebuild (mcp-server image landed 2026-06-15 08:02Z) the 2026-06-16 morning-briefing (01:00Z)
+ first TA scan (02:15Z) must show majors at REAL mid-band RSI — no single-digit, no 100.0 pegs —
GENERIC across all tickers, matching `get_technical_indicators` within 0.1pt.

## RAW evidence

### 1. Canonical `get_technical_indicators` is ITSELF poisoned (2026-06-16 01:35Z)
| Ticker | Price (VND) | Canonical RSI | BB "Price=" field | Verdict |
|---|---|---|---|---|
| VHM | 136,100 | **8.8** | **136** (Mid 142,962) | single-digit, close truncated ÷1000 |
| VIC | 192,600 | **6.5** | **193** (Mid 195,485) | single-digit, close truncated ÷1000 |
| VRE | 28,550 | 39.9 | 28,550 | correct |
| MBB | 25,200 | 49.8 | 25,200 | correct |
| MWG | 79,400 | 50.3 | 79,400 | correct |
| GAS | 82,600 | 49.2 | 82,600 | correct |
| NVL | 13,250 | 28.0 | full | correct |
| DPM | 23,650 | 28.2 | full | correct |
| DAG | 1,400 | **insufficient (26/35 candles)** | — | briefing still pegs RSI=100.0 |

The two FAIL tickers (VHM, VIC) are exactly the two majors priced ≥100,000 VND. `VHM MA5=113,247`
(vs price 136,100) corroborates a single corrupt ~136 bar dragging the mean down.

### 2. Root cause — corrupt synthetic 2026-06-16 candle in `daily_ohlcv` (named-volume DB)
```
VHM 2026-06-16 | O=H=L=C=136.1  | vol=0 | data_env=NULL   ← corrupt (÷1000)
VHM 2026-06-15 | close=136100.0 | vol=8,140,900           (real)
VIC 2026-06-16 | O=H=L=C=192.6  | vol=0 | data_env=NULL   ← corrupt (÷1000)
VIC 2026-06-15 | close=192600.0 | vol=4,609,900           (real)
```
- **All 1203 tickers** got a synthetic 2026-06-16 row: flat `O=H=L=C`, `volume=0`, `data_env=NULL`
  ("seed today's candle" whole-universe write).
- **77 of 1203** are unit-mis-scaled by a clean ×1000 / ÷1000 factor:
  - **÷1000** (ratio 0.001): **VHM** 136.1·**VIC** 192.6·**VJC** 141.3 (vs 183,700) — 6-figure → RSI single-digit.
  - **×1000** (ratio ~1000): 74 tickers — AAA 7.3M (vs 7,260)·ADS 9.22M·ACM·SDG·ISG·CMK… → RSI pegs 100.0.
- 3 are **watchlist majors**: VHM, VIC, VJC.
- Same corrupt rows produce the "giá 0 dưới BB — bứt phá giảm" false breakout alerts (msg id 759:
  VRE/GAS/MWG/MBB "giá 0") flooding the live MARKET channel daily.

### 3. Owning zone
All `daily_ohlcv` writers live in `apps/mcp-server/`:
- **Prime suspect (writer):** `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts`
  (seeds today's flat candle from current/intraday price — the unit-scale mismatch enters here).
- **Guard that should have caught it:** `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts`
  (existing CONTAM-5 / CONTAM-7 "ohlcv-unit-contam" tests prove this class is already known — the guard
  is not catching the ×1000/÷1000 synthetic rows, or the aggregator writes after the check).
- **Zone owner: `dev-mcp-server`** — NOT dev-alert-engine. The alert-engine MIN_CANDLES=35 fix
  (commit c9892200) is a symptom mitigation; canonical TA is poisoned by the same bad bar, so
  "make alert-engine match canonical" is moot until the data is fixed.

## Recommendation to PO
1. **Keep FIX-ALERT-ENGINE-RSI-SINGLEDIGIT in review[]** — do NOT done_verified. Its MIN_CANDLES=35
   guard is real but does not address the live failure (corrupt data upstream). Either hold as
   "symptom-mitigated, superseded" or fold into the data-fix.
2. **Mint root-cause task** (e.g. `FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0`, zone `apps/mcp-server/`,
   owner `dev-mcp-server`): the daily-seed candle writer must normalize price units to raw VND for
   ALL tickers (generic, /goal#2), and the sanity-check guard must reject/repair any candle whose
   close diverges from prior real close by a ~×1000/÷1000 factor BEFORE it lands in `daily_ohlcv`.
   Standing "no fake/synthetic/placeholder data" goal: a flat zero-volume O=H=L=C seed bar is itself
   a synthetic placeholder — decide whether to stop seeding or to mark+exclude it from RSI/MA/BB.
3. **Backfill/repair** the 77 already-corrupt 2026-06-16 rows (recompute-on-read or corpus re-flow).
4. **Keep FIX-ALERT-OPEN-ZERO-PRICE-RACE on PO-hold** (depends on this gate; gate RED).
5. **Push stays HELD** (PO's deferred call; unrelated tsc-red unblocker is the separate head chain).

## Provenance
Router LIVE RAW 2026-06-16 ~01:35Z: `get_unreviewed_market_messages` (msg 744/745/746/759/760/761),
`get_technical_indicators` (10 tickers via gateway call_tool), named-volume DB
`vn-market-intelligence-mcp_market_data` `/data/market.db` `daily_ohlcv` (sqlite3 sidecar). Not a badge.
