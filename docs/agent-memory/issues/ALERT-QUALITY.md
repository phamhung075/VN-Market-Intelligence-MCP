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
