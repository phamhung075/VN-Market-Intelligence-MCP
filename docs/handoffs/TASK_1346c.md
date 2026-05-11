# Task 1346c: Alert Quality — Volume Spike + NER/Sentiment Bugs

**Priority:** HIGH (alert quality)
**Type:** BUG FIX — 4 related bugs
**Related Reports:** 1320, 1311, 1321, 1322
**Size:** M (3-4h)

---

## Problems & Solutions

### 1. Volume Spike Calibration Bug (Report 1320)

**Problem:**
- 8+ unrelated stocks fire volume spike alerts at **exactly 5.909090** (= 65/11)
- This ratio is suspiciously uniform across different tickers
- Root cause: average window includes current session T volume
- Ratio collapses to (N+1)/N when N shifts by 1, causing false positives

**Example:** If window is [10, 11, 12, 13, 14] and current T=16:
- Old avg = 12
- New avg (with current) = 13.2 = 66/5
- After session ends: next bar = 15, avg = 13.2
- Next bar = 16, avg = 13.4 = 67/5
- Pattern emerges at exactly 65/11 boundary

**Solution:**
1. Exclude current session T volume from average calculation
2. Use only completed T-1, T-2, ... bars (not current open bar)
3. Test: verify no false 5.909090 alerts

---

### 2. DirectCodeNER Suffix Matching Bug (Report 1311)

**Problem:**
- Matches "MSN" at end of headlines as Masan Group stock (ticker MSN exists)
- But "MSN" is source attribution: "Article title - MSN", "- CNBC", "- Reuters"
- These are NOT stock mentions, just metadata

**Solution:**
1. Add exclusion pattern: Skip ticker matches in final 10 chars of headline if preceded by " - "
2. Pattern: ` - [A-Z]+$` (trailing source attribution)
3. Test: verify "- MSN" does NOT trigger MSN alert, but "MSN up 5%" still does

---

### 3. Sentiment Classifier Bug (Report 1321)

**Problem:**
- VIX Q1 profit -63% classified as BULLISH
- Classifier sees "lợi nhuận" (profit) keyword → positive sentiment
- Ignores "lỗ" (loss) and "giảm 63%" (down 63%)
- **Root cause:** Keyword-only sentiment (no negation handling)

**Example headline:**
```
"VIX Q1 lợi nhuận lỗ 63% giảm"  → wrongly classified BULLISH (sees "lợi nhuận")
```

**Solution:**
1. Add negation detection: "lỗ" + "giảm" + percentage patterns override positive keywords
2. Implement simple negation rule: if headline contains ("lỗ" OR "giảm" OR "-" + number), downgrade sentiment
3. Test cases:
   - "lợi nhuận lỗ 63%" → BEARISH (not BULLISH)
   - "giảm 30% so với" → BEARISH
   - "lợi nhuận tăng 20%" → BULLISH

---

### 4. NER Alias Missing Bug (Report 1322)

**Problem:**
- "Vietjet" article triggers zero VJC alerts
- NER extracts "Vietjet" correctly, but alias lookup fails
- **Root cause:** Missing "Vietjet" → "VJC" mapping

**Solution:**
1. Add to stock alias registry:
   ```
   aliases: {
     "VJC": ["Vietjet", "Vietjet Air", "Vietjet Aviation"]
   }
   ```
2. Update DirectCodeNER.aliases or stock-classification.json
3. Test: "COMAC collaboration with Vietjet" → fires VJC alerts at correct impact level

---

## Implementation Order

1. **Volume spike:** Fix average calculation (highest impact — 8+ false alerts)
2. **NER suffix:** Exclude trailing source attribution (quick win)
3. **Sentiment negation:** Add negation rules (foundational for quality)
4. **NER alias:** Populate Vietjet → VJC (data fix, no code change needed)

---

## Acceptance Criteria

- [ ] Volume spike ratio no longer clusters at 5.909090
- [ ] "- MSN" source attribution does NOT trigger MSN stock alerts
- [ ] "lợi nhuận lỗ 63%" classified as BEARISH (not BULLISH)
- [ ] Vietjet articles trigger VJC alerts (impact 8 for COMAC collaboration)
- [ ] All 7371 baseline tests pass
- [ ] No alert quality regressions in live feed

---

## Test Plan

1. **Unit tests:** Each bug fix has isolated test case
2. **Integration:** Run 100 news headlines through pipeline, verify:
   - Volume spikes at normal ratios (not 5.909090)
   - Sentiment matches business logic
   - NER aliases resolve correctly
3. **Smoke test:** Watch live alerts for 1h, verify no false positives

---

## Technical Notes

- Volume window calculation: likely in `alertFilters.ts` or `volumeAnalyzer.ts`
- NER alias registry: check `directCodeNER.ts` or `stock-classification.json`
- Sentiment rules: likely in `sentimentClassifier.ts` or signal payload
- Tests: add cases to `news.test.ts` or `signals.test.ts`
