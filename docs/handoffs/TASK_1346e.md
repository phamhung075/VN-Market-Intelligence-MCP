# Task 1346e: Cascade Gap — DSC + VPBankS/OKX Market-Wide Impact (BACKLOG)

**Priority:** MEDIUM (architecture improvement)
**Type:** FEATURE / BACKLOG
**Related Reports:** 1314, 1315
**Size:** M (3-4h)
**Status:** BACKLOG (queued after 1346a–1346d)

---

## Problems

### 1. DSC CEO Bearish Warning Under-Classified (Report 1314)

**Problem:**
- DSC CEO bearish warning rated impact 4 (too low)
- Actual: should cascade to market-wide implications
- **Root cause:** Cascade engine sees DSC as single-stock alert, not sector-wide catalyst

**Context:**
- DSC = Danang Securities Company (leading broker)
- CEO warning affects: market sentiment, investor risk appetite, sector sentiment
- Current impact 4 = individual stock alert (no cascade)
- Should be: impact 7–8 = market-wide catalyst (cascades to indices + sectors)

---

### 2. VPBankS/OKX Crypto → Banking Sector Gap (Report 1315)

**Problem:**
- VPBankS (banking sector) reported OKX crypto partnership deal
- Missing cascade: OKX deal → banking innovation signal → finance sector bullish
- **Root cause:** No cascade rule connecting crypto partnerships to banking sector sentiment

**Example:**
- Signal: VPBankS + OKX partnership
- Current cascade: VPBankS only (no sector impact)
- Expected cascade: VPBankS → Banking sector → Finance index (VIC index effect)

---

## Why BACKLOG?

1. **Low urgency:** DSC and VPBankS are medium-impact stocks (not major indices)
2. **High design effort:** Requires cascade rule review + re-architecture
3. **Risk:** Changes to cascade logic could cause regressions in current cascade rules
4. **Timeline:** Can be deferred until after 1346a–1346d (critical bugs) are fixed

---

## Solution Design (for future sprint)

### Approach 1: Weighted Cascade by Stock Influence

Add "influence weight" to each stock:
```json
{
  "stock": "DSC",
  "cascadeWeight": 0.8,  // DSC is high-influence broker
  "rules": [
    {
      "trigger": "bearish_warning_from_ceo",
      "cascade_to": ["VIC", "BANKING_SECTOR", "MARKET"]
    }
  ]
}
```

### Approach 2: Sector-Level Cascade Rules

Add sector-level rules (not just stock-level):
```json
{
  "sector": "BANKING",
  "rules": [
    {
      "trigger": "crypto_partnership",
      "cascade_to": ["FINANCE_INDEX"],
      "related_stocks": ["VPB", "VCB", "MB", "ACB"]
    }
  ]
}
```

### Approach 3: Signal Annotation

Let signal builder annotate impact level dynamically:
```
signal.impact = calculateCascadeImpact(
  stock: "DSC",
  event: "CEO_BEARISH_WARNING",
  marketContext: { vixLevel, sentiment, sector }
)
```

---

## Acceptance Criteria

- [ ] BA spec written (before development starts)
- [ ] Cascade rule schema extended (impacts > 6 include sector + market)
- [ ] DSC CEO bearish warning cascades to VIC + BANKING_SECTOR
- [ ] VPBankS OKX partnership cascades to FINANCE_SECTOR
- [ ] Existing cascade rules unaffected (no regressions)
- [ ] All 7371 baseline tests pass

---

## Next Steps

1. **Sprint 1346 (1346a–1346d):** Fix critical + high-priority bugs
2. **Sprint 1347 (future):** BA writes cascade enhancement spec
3. **Sprint 1348 (future):** Architect reviews, developer implements new cascade rules
4. **Test:** Validate DSC + VPBankS now cascade correctly without regressions

---

## Technical Notes

- Cascade engine: likely in `cascadeEngine.ts` or `cascadeRules.ts`
- Stock influence weights: can be stored in `stock-classification.json` (lazy-load)
- Tests: add cases to `cascade.test.ts` validating DSC and VPBankS impacts
- Risk: changes to cascade logic must be isolated (use feature flags if needed)

---

## Knowledge Reference

- Current cascade architecture: `.claude/knowledge/cascadeEngine-integration.md` (if exists)
- Stock classification: `docs/data/stock-classification.json`
- Sector definitions: likely in `src/modules/domain/sectors.ts`
