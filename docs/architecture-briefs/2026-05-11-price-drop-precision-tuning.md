# Architecture Brief — price_drop Alert Precision Tuning

**Date:** 2026-05-11
**Author:** architect
**Trigger:** Telegram report 2844 — price_drop precision 50% (8/16) persistent 4 cycles
**Priority:** MEDIUM
**Sprint:** 1868 (candidate task)
**Status:** Research brief — no code shipped

---

## 1. Problem Statement

### Current state

- `get_alert_accuracy()` reports price_drop precision = **50% (8 HIT / 8 MISS out of 16 scored alerts)**
- Quality gate: precision must be ≥ 60% (defined in unified-agent flow step 5)
- Issue is **persistent across 4 dev-team cycles** (2 from unified-agent notebook, 4 from dev-team monitoring)
- Not a bug — code runs correctly. This is a **calibration / threshold problem**

### Target

precision ≥ 60% on a 30-day rolling window with ≥ 10 scored alerts

### Impact

- 8 false-positive price_drop alerts fire per ~16-alert batch → user receives spurious bearish signals
- False positives erode trust in MARKET channel; may cause unnecessary sell decisions
- Recall reduction from tuning is acceptable up to ~20%

---

## 2. Brownfield Scan — Signal Generator Architecture

### Primary generator: `detectSignals()` in `signalDetector.ts`

- Default threshold: **changePct <= -5%** triggers `price_drop`
- Severity ladder: 5–6.9% → medium, 7–14.9% → high, ≥15% → critical
- Confidence formula: `min(0.95, 0.6 + absPct/100)` — a **5% drop yields confidence 0.65**

### Adaptive threshold system: exists but **NOT WIRED** into `scanMarket`

- `volatilityCalculator.ts` computes per-stock adaptive thresholds (2σ of daily log returns)
- `signalDetector.ts` accepts `SignalContext.volatility` and `SignalContext.watchlistThresholds`
- **Critical gap:** `scanMarket.ts` line 283 calls `detectSignals(snapshot)` with NO context — adaptive thresholds and per-watchlist overrides are both silently ignored
- Per-watchlist columns `alert_drop_pct` and `alert_rise_pct` exist in the `watchlist` SQLite table but are never fed into `detectSignals`

### Confidence filter in `scanMarket.ts`

- Step 5c applies a `CONFIDENCE_THRESHOLD = 60` filter before `generateAlerts`
- A -5.0% drop → `confidence = 0.65` → `confidence_score = 65` → passes threshold
- A -5.5% drop → `confidence = 0.655` → score 66 → passes
- Filter does NOT block barely-threshold signals — it accepts anything ≥ 5.01%

### Sector-wide decline (Step 5a)

- Fires a synthetic `price_drop` signal for every watchlist stock in a sector when ≥3 stocks are down ≥0.5%
- **Sector DECLINE threshold is -0.5%**, far below the stock-level -5% threshold
- These sector-wide signals are scored as `price_drop` against individual stock prices → high false-positive rate when sector rotates but individual stocks recover

### Scoring (outcome evaluation)

- `alertAccuracy.ts` scores price_drop as HIT when next-price (1–3 days forward, intraday fallback 1–12h) is negative
- **Intraday fallback** (1–12h window): introduced to avoid 100% UNKNOWN on day 1, but it catches intraday bounces as MISS and short reversals as MISS → structurally inflates MISS count
- No VNINDEX guard in generator or scorer: alerts fire even when the entire market is down (sector-wide move vs stock-specific)

---

## 3. False-Positive Source Analysis

Based on the code structure, the 8 false positives across cycles most likely fall into these pattern buckets. No raw alert data exists in `docs/data/alert-verdicts.json` (file is `[]` — verdicts are in the `alerts` SQLite table scored by `alertOutcomeJob`).

### FP Pattern A — Thin-threshold borderline drops (estimated 3–4 of 8)

Stock drops exactly -5.0% to -5.5% → confidence ~65 → passes filter. Price recovers intraday or next day (VN stocks with circuit breaker at ±7% have natural mean-reversion after hitting -5%). `get_alert_accuracy` intraday fallback catches the recovery within 12h → MISS.

**Mechanism:** Default threshold too low for moderate-volatility stocks. The -5% threshold was calibrated for stable banking stocks (VCB stddev ~1.5%), but the 30-stock watchlist includes higher-volatility names (real estate, construction, materials) where -5% is routine noise.

### FP Pattern B — Sector-wide decline synthetic signals (estimated 2–3 of 8)

`scanMarket` Step 5a fires a `price_drop` signal for every watchlist stock in a sector with ≥3 stocks down -0.5%. These carry lower confidence (declining.length/5, max 0.9). The sector decline may be a one-day rotation; individual stocks bounce next session → scored MISS.

**Mechanism:** Sector-wide signals are tagged as `price_drop` but represent sector rotation, not individual stock danger. The scorer evaluates individual stock price change, not sector.

### FP Pattern C — Weekend / market-closed price stale reads (estimated 1–2 of 8)

Alerts fire from stale prices during weekend scanner cycles. `previousPrice` equals last-session close; if a weekend news event affects opening price, the "change" reflects a gap that immediately reverses → MISS.

**Mechanism:** No market-hours guard on the price_drop path (only volume_spike has the ATC window guard).

### FP Pattern D — Ex-dividend or rights issue price adjustments (estimated 1 of 8)

Mechanical -3% to -7% drops on ex-dividend date (VN stocks pay annual dividends June–August). These drops are not bearish signals but structural adjustments.

**Mechanism:** No ex-dividend calendar check in `detectSignals`.

---

## 4. Tuning Options — Ranked

### Option A — Raise default threshold to -7% (easy, high impact)

**What:** Change `DEFAULT_DROP_PCT` from `-5` to `-7` in `signalDetector.ts`.

**Why -7%:** VN circuit breaker fires at ±7% on HOSE. A -7% drop is market-significant and cannot easily be dismissed as noise. At -5%, borderline drops dominate the false-positive pool.

**Estimated precision gain:** +10–15 pp (eliminates FP Pattern A). A -7% event triggers much less frequently → precision rises; the remaining alerts are more extreme.

**Recall impact:** ~30% fewer alerts overall. Borderline -5% to -6.9% drops will no longer alert.

**Risk:** May miss early-stage breakdowns that accumulate -5.5% before reaching -7%. Mitigated by sector-wide decline signal which still catches coordinated declines.

**Effort:** 1 atomic task. Change 1 constant. Update 3 test fixtures that use -5%.

**Recommendation priority: 1 (ship first)**

---

### Option B — Wire per-watchlist thresholds into `scanMarket` (medium effort, highest long-term value)

**What:** Feed `alert_drop_pct` from the `watchlist` table into `detectSignals(snapshot, { watchlistThresholds: { dropPct, risePct, impactScore } })`. The infrastructure already exists — the `watchlist` table has the columns and `detectSignals` accepts `SignalContext.watchlistThresholds`. `scanMarket` line 283 just calls `detectSignals(snapshot)` with no context.

**Why:** Banking stocks (VCB, BID) have low volatility → -3% is a real signal. Real estate stocks (VHM, NVL) have high volatility → -7% is baseline noise. One fixed threshold is wrong for both.

**Estimated precision gain:** +8–12 pp once watchlist thresholds are calibrated per stock (removes both FP Pattern A and portions of Pattern B for high-volatility stocks).

**Recall impact:** Sector-dependent. Banking stocks will alert more frequently (lower threshold); materials/real-estate less frequently (higher threshold). Net neutral or slight decrease.

**Effort:** 2 atomic tasks — (1) wire context into `scanMarket`, (2) populate `alert_drop_pct` defaults in migration/seed.

**Recommendation priority: 2 (follow-on sprint)**

---

### Option C — Add VNINDEX market-state guard (medium effort, targeted)

**What:** Before emitting a `price_drop` signal, check if VNINDEX changePct is below a guard threshold (e.g., VNINDEX < -1.5%). If VNINDEX is broadly down, suppress individual stock price_drop alerts (they are market-wide, not stock-specific) OR downgrade to lower severity with a "market-wide decline" annotation.

**Why:** When VNINDEX drops -1.5%+, individual stock drops are correlated. An alert saying "VCB dropped -5%" during a -2% VNINDEX day carries zero alpha — the market moved, not VCB specifically. The scorer still marks these MISS when VCB reverses next day.

**Estimated precision gain:** +6–10 pp for market-wide decline days. Highly effective on days when VNINDEX carries stocks down uniformly.

**Recall impact:** Alerts suppressed on down-market days. May miss genuine stock-specific drops during broad sell-offs — the most important edge case.

**Implementation notes:**
- VNINDEX is already fetched and stored in `market_prices` as ticker `VNINDEX` (inferred from existing schema)
- `scanMarket` already computes `sectorAverages` — VNINDEX context is one additional DB read per scan cycle
- Guard logic: if `vnindexChangePct < -1.5`, set `price_drop.severity = min(severity, medium)` and append `"(thị trường chung giảm)"` to message; suppress alerts with severity < medium

**Effort:** 2 atomic tasks — (1) VNINDEX read in scanMarket, (2) guard logic in signal enrichment step.

**Recommendation priority: 3 (after B)**

---

### Option D — Add volume confirmation filter (low impact for price_drop)

**What:** Require `volume >= 1.5× avgVolume` to confirm a price_drop signal. A drop on thin volume is more likely to be a stale quote or a single large sell order that reverses.

**Why:** Volume confirmation is already a best practice. FP Pattern A borderline drops (-5% to -6%) on thin volume are often data artifacts.

**Estimated precision gain:** +4–8 pp, mainly for low-conviction drops.

**Recall impact:** ~15% fewer alerts on thin-volume days.

**Risk:** May suppress valid drop signals on holiday-thinned sessions. VN market has many thin-volume tickers legitimately.

**Effort:** 1 atomic task. Add volume check in `detectSignals` for `price_drop` (not `price_surge` — volume confirmation is asymmetric).

**Recommendation priority: 4 (add with B or C)**

---

## 5. Recommendation

**Ship plan: 3 tasks, ordered**

| Task | Change | AC |
|------|--------|----|
| A — threshold raise | `DEFAULT_DROP_PCT` -5 → -7 in `signalDetector.ts` | precision ≥60% on next 30-day backtest window |
| B — wire per-watchlist thresholds | `scanMarket` passes `watchlistThresholds` from DB | unit test: custom threshold overrides default |
| B-seed — populate watchlist thresholds | DB migration sets `alert_drop_pct=7.0` as new default; high-volatility stocks (NVL, DPM) set to 9.0 | all watchlist rows have non-null `alert_drop_pct` |

Option C (VNINDEX guard) is a separate follow-on — valuable but requires VNINDEX live read per cycle and guard logic testing. Do not bundle with A+B.

Option D (volume confirmation) is additive to A. Can be bundled or shipped separately.

---

## 6. Measurement Methodology

### Post-ship verification

1. Run `get_alert_accuracy(days=30)` after 7 calendar days (≥5 trading days post-deploy)
2. Filter by `signal_type = price_drop` in the breakdown output
3. Target: precision ≥60% on ≥10 scored alerts
4. Compare alert volume (count): expect ~30% reduction from -5%→-7% threshold raise

### Backtest window

- Use existing `runBacktest` use case (`backtestEngine.ts`) with signal_type filter `price_drop`
- Window: 2026-02-01 to 2026-05-11 (70 calendar days, ~50 trading days)
- Entry rule: T+1 open, exit: 5 trading days
- Expected HIT rate pre-ship: ~50%; target post-ship: ≥60%

### Monitoring

- unified-agent step 5 already monitors `get_alert_accuracy()` precision per cycle
- Report 2844 auto-resolves when precision ≥60% for 2 consecutive cycles

---

## 7. Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Recall drops >30% (miss real events) | Medium | Monitor alert volume; if alert count drops >40%, revert to -6% |
| -7% threshold misses early breakdowns | Low | Sector-wide decline (Step 5a) catches coordinated -0.5%+ moves → early warning preserved |
| Watchlist threshold seed uses wrong defaults | Low | Migration must default to -7 (same as new global), not -5 (old) |
| Backtest uses old signals (pre-fix) | High | Backtest measures historical data — only forward measurement counts post-ship |
| Ex-dividend FP not addressed | Medium | Out of scope for this brief; requires corporate actions calendar integration (future sprint) |

---

## 8. DDD Layer Impact

| File | Layer | Change type |
|------|-------|-------------|
| `domain/services/signalDetector.ts` | domain | Constant change (DEFAULT_DROP_PCT) |
| `application/usecases/scanMarket.ts` | application | Wire watchlistThresholds context (Option B) |
| `infrastructure/db/schema.ts` or migration | infrastructure | Seed `alert_drop_pct` defaults (Option B-seed) |
| `domain/services/marketContextBuilder.ts` | domain | VNINDEX read + guard (Option C — future) |

No new interfaces required. All ports already exist. No DDD violations.

---

## 9. Out of Scope

- Ex-dividend calendar integration — requires corporate actions data source (not yet in system)
- Alert Commander verdict loop changes — the scorer is not the problem; the generator is
- `alertVerdictStore.ts` — already correct; not involved
- Intraday fallback change in `alertAccuracy.ts` — the 1–12h window is a separate calibration issue (report #673 context); do not touch in this sprint
