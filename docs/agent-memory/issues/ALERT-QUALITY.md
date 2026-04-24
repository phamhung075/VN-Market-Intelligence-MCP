---
agents: alert-commander, news-scout, market-watcher
trigger: alert-firing, signal-validation
---

# Alert Quality Issues

## 2026-04-23 02:37 — Chain Catalyst Payload Missing 4-AND Verification Fields

**Issue:** chain_catalyst and price_confirmation signal payloads from News Scout and Market Watcher lack numeric fields needed for Alert Commander to verify watchlist-opportunity (4-AND) firing criteria.

**Symptom:** 5 strong bullish signals (VIC impact 9.5, NVL 8, BSR 7.5) arrived during market open but could NOT be fired because signal payloads contain:
- ✓ impact_score (numeric)
- ✓ confidence_score (numeric)
- ✓ narrative with Kinh Dich reading (text)
- ✗ newsSentiment (numeric -1 to 1) — MISSING
- ✗ kinhDichConfidence (numeric 0-100) — MISSING
- ✓ kinhDichSignal (BUY/HOLD/SELL — inferred from text)
- ? agentSignalsMajority (BUY/SELL/NEUTRAL — MISSING)

**Required fix:** News Scout and Market Watcher must include structured fields in chain_catalyst/price_confirmation payload finding_data:
```json
{
  "title": "...",
  "detail": "...",
  "impact_score": 9.5,
  "newsSentiment": 0.65,           // ADD: -1 (bearish) to +1 (bullish)
  "kinhDichConfidence": 78,         // ADD: 0-100
  "kinhDichSignal": "BUY",          // existing or add as structured field
  "agentSignalsMajority": "BUY"     // ADD: BUY/SELL/NEUTRAL consensus
}
```

**Impact:** Without these fields, Alert Commander cannot verify 4-AND criteria → valid opportunities suppressed. Workaround: Add explicit 4-AND validation call to signal detection (News Scout / Market Watcher pre-flight check before posting).

**Assigned to:** News Scout (01) & Market Watcher (04) payload schema update + Alert Commander signal parser enhancement.


**Issue**: FPT position stop-loss floor (74,679) breached by current price (73,500, -1.58% gap) but intraday drop only -1.08%.

**Observation**: Market Watcher correctly flagged SL approach at 06:18. By 06:22, price crossed below floor. However, 3-AND rule requires `singleDayDrop > 5%` to trigger position-danger alert. Intraday movement (-1.08%) suggests gap-down at session open or multi-day accumulated loss.

**Recommendation**: Future SL breach detection should distinguish:
- Intraday crash (gap, panic sell) → trigger on <5% threshold
- Accumulated loss over 2-3 days → use cumulative % loss, not single-day drop

**Current Action**: Suppressed alert per strict 3-AND rule. Monitor next cycle.

**Tags**: #position-danger, #sl-breach, #threshold-edge-case