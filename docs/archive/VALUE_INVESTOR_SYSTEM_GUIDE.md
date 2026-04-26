# Value Investor Analysis System — Architecture Guide

**For:** User who trades on T+2 settlement (weeks/months/years horizon)
**Replaces:** Previous day-trader system (10-minute alerts, RSI noise)
**Status:** Production-ready, Phase 2 testing complete

---

## The Shift: From Trader to Value Investor

### Old System (Day Trader)
```
Every 10 minutes:
  1. Check: Is RSI > 80? → Alert "OVERBOUGHT — SELL"
  2. Check: Volume spike > 2x? → Alert "VOLUME SPIKE — CHECK PRICE"
  3. Check: Bollinger Band breakout? → Alert "BREAKOUT — BUY"
  4. Send to Telegram MARKET channel immediately

User sees: 50+ alerts per day, noise, whipsaw signals
User trades: Intraday, stop-loss at -5%, take-profit at +2%
Outcome: Fees eat returns, timing miss on swings
```

### New System (Value Investor)
```
Every trading day:
  1. Record: Price, volume, sentiment, insider activity (4 batches)
  2. Accumulate: 90 days of data in ledger file
  3. Every quarter: Synthesize patterns
     - Fundamentals: Revenue growth (QoQ vs YoY)
     - Sentiment: News impact vs prior year
     - Technical: Price strength + volume quality
     - Insider: Are insiders buying or selling?
     - Kinh Dich: Cosmic alignment for timing
  4. Quarterly decision: ADD / HOLD / REDUCE with 9+ months conviction

User sees: 5-30 daily summaries (scan in 3 min), 1 quarterly synthesis per stock
User trades: Quarterly rebalancing, hold for 1-2 years, think in months not minutes
Outcome: Tax-efficient, timing on inflection points, align with fundamentals
```

---

## Core Concepts

### 1. Sectioned Ledger (Per Stock)

Each stock has ONE file (`docs/analysis-briefs/VNM.md`) with 5 sections:

```markdown
## [Report Analyzer] Fundamentals & Valuation
- P/E ratio with QoQ + YoY trend
- Revenue growth rates
- Profit margins, debt levels
- When: Only on earnings release (quarterly)

## [News Scout] Headlines & Sentiment
- Daily sentiment score (-1 to +1)
- Policy impact, competitive news
- YoY sentiment comparison (stronger/weaker than prior year?)
- When: Every day at 05:00 UTC

## [Market Watcher] Price, Volume, Technicals
- Daily close price with volume
- RSI, support/resistance (timing tools, NOT signals)
- YoY price comparison (outperforming or underperforming year-ago?)
- When: Every day at 16:00 UTC

## [Insider Tracker] Management Activity
- Insider buy/sell transactions
- Insider confidence signal (rare buys = high conviction)
- YoY behavior change (buying more/less than last year?)
- When: Every day when activity detected

## [Unified Agent] Quarterly Syntheses
- Ensemble reading (what do all 4 sections say together?)
- Conviction score (1-10, how aligned are all signals?)
- Action plan (BUY/HOLD/SELL, price target, exit condition, timeline)
- When: Every quarter-end (Mar 31, Jun 30, Sep 30, Dec 31)
```

### 2. Daily Batches (Light Compute)

System runs 4 batches per day, each taking 3-5 minutes:

| Batch | Time (UTC) | VN Time | What Happens |
|-------|-----------|---------|--------------|
| 1 | 01:00 | 08:00 | Market opens: pre-open prices + overnight news |
| 2 | 05:00 | 12:00 | Mid-market: price update + sentiment logging |
| 3 | 08:00 | 15:00 | Before close: pre-close strength + insider activity |
| 4 | 16:00 | 23:00 | After close: EOD summary → ledger + MARKET message |

**Cost:** Light (7 core tools per batch) = sustainable daily

### 3. Special Events (Heavy Compute)

When something significant happens, system mobilizes ALL 112 tools:

**Trigger Examples:**
- 📊 **Earnings Release** → Deep BCTC analysis (Q revenues, margins, quality)
- 🏛️ **Policy Change** → Sector rotation analysis (which sectors win/lose?)
- 💰 **Large Insider Buy** (>$5M or >5% stake) → Transaction context (timing? confidence?)
- ⛓️ **Supply Disruption** (monsoon, port strike) → Cost impact (margin pressure?)
- 🌐 **Sector Rotation** (foreign buyers fleeing) → Flow analysis (where is smart money?)
- 🔮 **Kinh Dich Shift** (major cosmic alignment) → Timing window (is this the moment?)

**Cost:** Heavy (all 112 tools) but infrequent (2-3 times per quarter)

**Result:** User gets ONE detailed message with full conviction context, not 50 daily noise alerts

---

## How to Use It

### Daily Routine (16:00 UTC = 23:00 VN)

Every market day at 23:00 VN, you receive 5-30 messages to MARKET channel:

```
VNM — EOD (2026-05-20)
Price: 176,800 VND (+1.3%, YoY +8.6%) | Vol: 3.8M | RSI: 72
Sentiment: +0.3 | Insider: no activity
→ Action: Hold — Strength intact, fair value near
📖 docs/analysis-briefs/VNM.md
```

**What to do:**
1. **Scan:** Take 30 seconds per stock. Look for:
   - **Red flag:** Price down 5%+ on bad sentiment → may drop further
   - **Green flag:** Insider buying on dip → confidence signal
   - **Yellow flag:** RSI 75+ on heavy volume → overbought, wait for dip

2. **Deep dive (if interested):** Open ledger file and read last 90 days of entries
   - See the full context of fundamentals, sentiment, technicals, insider
   - Pattern recognition: "VNM has bought 5 times this quarter vs zero last year = changing signal"

3. **Decide (quarterly):** Every 3 months, when Unified Agent writes synthesis
   - Should I add/reduce/exit this position?
   - What's the conviction (1-10)?
   - What's the exit trigger?
   - Hold timeline (3-12 months minimum)

### Quarterly Review (Q-end)

Every quarter-end (Jun 30, Sep 30, Dec 31, Mar 31), you get formal synthesis:

```
VNM Q2 2026 Synthesis

ENSEMBLE READING (all 4 agents agree):
✓ Revenue: +13.6% QoQ, +8.7% YoY → growth ACCELERATING
✓ Sentiment: +0.6 (stimulus tailwind) → macro support
✓ Price: +7.4% YoY → underperforming growth (VALUE PLAY)
✓ Insider: DAD bought 5x this quarter vs 0x last year → confidence INCREASING

CONVICTION: 9/10 (all signals aligned)

ACTION: ADD 5% to position (target 15% by year-end)
Exit: If price > 190k (fair value 18.5x P/E) OR insider sells
Timeline: Hold through Q3, reassess at next earnings

📖 Full brief: docs/analysis-briefs/VNM.md
```

**What to do:**
1. Read the ensemble reading — this is the "everyone agrees" moment
2. Check conviction score — 8-10 = strong entry, 5-7 = wait for clarity, <5 = avoid
3. Follow the action plan — it includes exit rules and timeline
4. Document your decision — add it to your portfolio tracking

---

## Key Differences from Trader System

### 1. Time Horizons

| Aspect | Trader | Value Investor |
|--------|--------|---|
| Hold period | Hours | Months to years |
| Decision frequency | Every alert | Quarterly |
| Success metric | Win% on trades | Wealth compounding |
| Biggest enemy | FOMO, whipsaw | Boredom, opportunity cost |

### 2. Signal Types

| Signal | Trader Impact | Value Investor Impact |
|--------|---|---|
| RSI 80 (overbought) | SELL NOW (wrong 50% of time) | Time your ADD (dips scarce in trends) |
| Volume spike | Check if crash coming | Institutional interest building |
| Insider buy | Maybe accumulation | MAJOR — rare event, high conviction |
| Sentiment +0.5 | Momentum signal | Tailwind, but temporary |
| Revenue +13% YoY | Maybe earnings beat | Sustainable growth, compound it |

### 3. Data Freshness

| Data | Trader Need | Value Investor Need |
|------|---|---|
| Price | Every 5 min | Once daily (EOD) |
| Volume | Every 5 min | Daily average |
| Sentiment | Hourly | Daily |
| Insider | Real-time | Next business day OK |
| Fundamentals | Quarterly | Quarterly |
| Kinh Dich | Daily monitoring | Major shifts (2-3x/year) |

### 4. Messenger Simplification

**Trader:** Alert Commander sends 50+ daily alerts to MARKET
- "RSI OVERBOUGHT" (noise, user ignores)
- "VOLUME SPIKE" (noise, user ignores)
- "PROFIT TAKING" (noise, user ignores)

**Value Investor:** Only 6 high-conviction alerts to MARKET
1. Earnings release (conviction recalc)
2. Policy change (sector rotation)
3. Large insider transaction (confidence shift)
4. Supply disruption (cost pressure)
5. Sector rotation reversal (foreign flow shift)
6. Kinh Dich hexagram shift (cosmic timing)

Plus: Daily EOD summaries (5-30 messages, not noise, required context)

---

## Conviction Scoring (How to Interpret)

### The Formula

```
CONVICTION = Base(2.0) + Fundamentals(+2) + Sentiment(+1) + Technical(+1) + Insider(+2) + Macro(+0.5) + Kinh_Dich(+2)
Max: 10
```

### Interpretation

| Score | Meaning | User Action |
|-------|---------|-----------|
| 9-10 | All layers aligned, rare alignment | **BUY with confidence**, add allocation |
| 7-8 | Most layers aligned, good setup | **BUY or ADD**, validate thesis |
| 5-6 | Mixed signals, unclear | **HOLD, wait for clarity**, don't chase |
| 3-4 | More negatives than positives | **AVOID or REDUCE**, check exit |
| 1-2 | Only base support, no conviction | **NO ACTION**, seek other opportunities |

### Example: VNM Q2 2026

```
Base: 2.0
+ Revenue +13.6% QoQ: +0.5
+ Revenue +8.7% YoY: +0.5
+ Margin expanding (18% vs 17.5%): +0.5
+ Debt safe (0.4x ratio): +0.5
+ Sentiment positive (stimulus): +0.5
+ Insider DAD buying: +2.0
+ Foreign buyers accumulating: +0.5
+ Kinh Dich hexagram aligned with fundamentals: +2.0
————————————
TOTAL: 2.0 + 0.5 + 0.5 + 0.5 + 0.5 + 0.5 + 2.0 + 0.5 + 2.0 = 9.0

INTERPRETATION: 9/10 = All aligned, rare moment. BUY with confidence.
```

---

## What You Don't See Anymore

✅ **Gone:** Daily RSI alerts ("OVERBOUGHT — SELL" that are wrong 50% of time)

✅ **Gone:** Volume spike alerts ("BUY BUY BUY" on low-volume pop)

✅ **Gone:** TA breakout alerts ("Breaking upper Bollinger Band" on >2% days)

✅ **Gone:** Sentiment swings ("+0.7 sentiment" next day "-0.2", whipsaw noise)

✅ **Gone:** Hourly price checks (noise, you care about quarterly fundamentals)

❌ **You still get:**
- Daily EOD context (price, volume, sentiment, insider for informed decisions)
- Quarterly synthesis (pattern recognition across 90 days, conviction scoring)
- Special events (earnings, policy, disruption, rotation, insider large transactions)

---

## Common Questions

### Q: Why do I get 5-30 daily messages if you said "no daily noise"?

**A:** The messages are NOT noise — they're essential context:
- Price level (is it overbought or dipped 5%?)
- Sentiment (did something bad happen or is it a normal fluctuation?)
- Insider activity (is management accumulating?)
- RSI not as "SELL" signal, but as "price is strong, timing" tool

Example: If you see "VNM price down 5% today, sentiment -0.3, no insider, RSI 35" → this is a DIP, maybe ADD. But if "VNM price down 5%, sentiment -0.7, CEO sold 10M shares, RSI 25" → this is a WARNING, avoid or reduce.

The message gives you context. The old system just said "VOLUME SPIKE" with no context.

### Q: What if I miss a quarterly synthesis?

**A:** Your ledger file has all the data. You can read it anytime:
```
cd docs/analysis-briefs/
grep "2026-06-30" VNM.md  # See full Q2 synthesis

# Or open in editor:
# Look for [Unified Agent] Quarterly Syntheses section
# See conviction score, action plan, exit conditions
```

You can also read the synthesis message history in Telegram MARKET channel search.

### Q: Can I change the filter (top-5 stocks instead of 30)?

**A:** Yes, ask to filter by:
- **Top-5 holdings only** (VNM, FPT, VCB, KDC, VJC)
- **Sector filtered** (e.g., Banking only: VCB, BID, MBB)
- **Custom watchlist** (e.g., only growth stocks >10% YoY)

Current default: All 30 stocks (comprehensive, but you can scan 5-10 in 3 min, others in background)

### Q: What if special event triggers (earnings, insider buy)?

**A:** System immediately runs full 112-tool analysis and sends you:
1. A message to MARKET channel with high-conviction synthesis
2. Detailed breakdown in ledger file
3. Conviction score update

You get ONE rich message (not 50 alerts) with everything: fundamentals, sentiment, insider, macro, Kinh Dich, everything aligned or not.

### Q: Can I trust the Kinh Dich cosmic alignment layer?

**A:** It's optional conviction multiplier:
- If hexagram aligns + fundamentals align = conviction boost (+2.0)
- If hexagram neutral = no impact
- If hexagram warns caution = conviction penalty (-1.0)

You can ignore it if you prefer pure fundamentals. Many value investors skip this layer entirely. It's an extra layer for pattern recognition across years (cosmic cycles do repeat).

### Q: How long should I hold?

**A:** Depends on conviction and thesis:
- **High conviction (8-10):** Hold 12 months, reassess quarterly
- **Medium conviction (5-7):** Hold 6 months, reassess every 2 months
- **Low conviction (<5):** Don't hold, seek better opportunities

Exit rules are in quarterly synthesis: "Exit if price > 190k OR insider sells OR growth decelerates"

---

## Transition Checklist

When you start using the new system:

- [ ] Read docs/analysis-briefs/VNM.md to see the ledger format
- [ ] Set Telegram filter to your preference (top-5, sector, or all 30)
- [ ] Scan first daily EOD message at 16:00 UTC on next trading day
- [ ] Open ledger file to understand YoY/QoQ comparison format
- [ ] Wait for first quarterly synthesis (Q2 ends 2026-06-30)
- [ ] Make first portfolio decision based on conviction score + action plan
- [ ] Track outcome: did conviction score predict accuracy?

---

## Architecture Summary

```
VALUE INVESTOR ANALYSIS SYSTEM
├── 30 Ledger Files (VNM, FPT, VCB, ... VJC)
│   ├── [Report Analyzer] — Earnings analysis (quarterly)
│   ├── [News Scout] — Sentiment + macro (daily)
│   ├── [Market Watcher] — Price + volume + technicals (daily)
│   ├── [Insider Tracker] — Insider transactions (daily)
│   └── [Unified Agent] — Quarterly synthesis + conviction
│
├── Daily Batches (4x, light compute)
│   ├── 01:00 UTC: Pre-open data
│   ├── 05:00 UTC: Sentiment logging
│   ├── 08:00 UTC: Pre-close analysis
│   └── 16:00 UTC: EOD summary (→ MARKET channel)
│
├── Special Events (when triggered, heavy compute)
│   ├── Earnings release → 112 tools
│   ├── Policy change → 112 tools
│   ├── Large insider → 112 tools
│   ├── Supply disruption → 112 tools
│   ├── Sector rotation → 112 tools
│   └── Kinh Dich shift → 112 tools
│
└── User Outputs
    ├── Daily: 5-30 EOD messages (scan 3 min)
    └── Quarterly: 30 synthesis messages + conviction scores
```

---

## What's Next

**Phase 3:** Full 30-stock rollout (week of 2026-04-29)
- Monitor for 5 trading days
- Check ledger growth
- Verify MARKET message delivery

**Phase 4:** Quarterly archives (2026-06-30)
- Automatic rotation of old quarters
- Keep active file lean (~120 KB)

**Phase 5:** Unified Agent syntheses (every quarter)
- Get conviction scores for all 30 stocks
- Make quarterly rebalancing decisions
- Track which signals predicted accuracy

---

**Status:** ✅ System ready for deployment
**First daily messages:** 2026-04-29 (Monday)
**First quarterly synthesis:** 2026-06-30 (Q2 end)
**Last updated:** 2026-04-26
