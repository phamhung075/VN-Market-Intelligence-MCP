---
agents: market-watcher, developer, qa
trigger: foreign-flow-fetch, data-validation, incident-response
---

# Issue: Foreign Flow Silent Filter Cascade Bug

**Fingerprint:** `db_error_recurring:foreign_flow_parse`
**Severity:** CRITICAL (3,739 total errors since observed, 784 in last 24h)
**Status:** FIXED (Sprint 1288, Task 1288f)
**Recurrence:** 3x (Sprint 228, Sprint 1288, Sprint 1289)
**Prevention Applied:** Task 1288f — Step 6 validation added 2026-04-22

---

## Root Cause

**Silent filtering in foreignFlowFetcher.ts + duplicated validation logic across entry points.**

The `isValidForeignFlowItem()` type guard (lines 344–355) uses `.filter()` to reject invalid items silently:

```typescript
return json.data
  .filter((item: unknown) => isValidForeignFlowItem(item))  // ← SILENT FILTER
  .map((item: any) => ({...}));
```

**Problem:**
1. If VPS sends 30 items but 3 have invalid schema, filter discards them
2. Endpoint returns `changes: 27` (success), caller thinks "all is good"
3. Missing 3 rows in daily_ohlcv accumulates over days
4. No diagnostic logged about why 3 items were dropped
5. Different validator in domain layer (`foreignFlowValidator.ts`, Sprint 1566) is never called by fetcher

**Why it cascades:**
- Sprint 228 added validation to POST endpoint, but fallback fetcher uses different validation path
- Sprint 1288 added fallback strategy, which masks problem (cached data hides schema issue)
- Both fixes treated symptoms; silent filter bug stayed

---

## Impact

**Observable Symptoms:**
- vps_push_log shows `status: "ok"`, `itemsCount: 27` every cycle
- But daily_ohlcv missing rows (27 instead of 30 each day)
- Over 10 days: 30 missing rows total
- Alert latency increases (missing foreign buy signals)
- Circuit breaker NOT triggered (writes succeed, just fewer rows)

**Scale:**
- 3,739 errors observed across sprints 214–227
- Suggests 3-5 items filtered per 20-item payload (~15% loss rate)
- Over 100 days of operation: ~10,000 missing rows

---

## Prevention Checklist

**Before implementing any foreign flow change:**

- [ ] All entry points (POST endpoint, fallback fetcher, tests) use the same validator
- [ ] Validator is domain-pure (zero I/O), reusable across layers
- [ ] Invalid items are rejected with error, not filtered silently
- [ ] Validation errors log: item index, field name, expected type, actual value
- [ ] Test suite includes both valid and invalid payload cases
- [ ] POST endpoint rejects HTTP 400 on validation error (fails loudly)
- [ ] Fallback fetcher logs WARN on validation error, skips to cache/SSE
- [ ] No custom type guards that filter (use validator instead)
- [ ] Circuit breaker tracks validation errors separately from network errors

---

## Fix Procedure

See TECH-1289.md for full design. Summary:

1. **Replace silent filter** in foreignFlowFetcher.ts:
   ```typescript
   // OLD: .filter((item) => isValidForeignFlowItem(item))
   // NEW: const { valid, errors } = validateForeignFlowPayload(json.data);
   //      if (errors.length > 0) throw Error("validation failed");
   //      return valid;
   ```

2. **Unify validation** in server.ts POST endpoint:
   ```typescript
   // Call validateForeignFlowPayload before upsert
   // Reject HTTP 400 if errors
   ```

3. **Log diagnostics** in both paths:
   ```typescript
   // Example: "Item 5: code expected string, got 123"
   ```

---

## Related Patterns

- **Silent filtering anti-pattern:** Use validator with explicit error return, not `.filter()` + type guard
- **Duplicated validation:** Declare validator in domain layer, call from all entry points
- **Error cascading:** When silent filtering occurs, downstream assumes success; problem compounds over time

---

## Example: How It Fails

```typescript
// VPS sends:
const payload = [
  { code: "VNM", date: "2026-04-22", foreignBuyVol: 1000, foreignSellVol: 500, putThroughVol: 0 },  // ✓ valid
  { code: 123, date: "2026-04-22", foreignBuyVol: 1000, foreignSellVol: 500, putThroughVol: 0 },     // ✗ code is number
  { code: "VCB", date: "2026-04-22", foreignBuyVol: 1000, foreignSellVol: 500, putThroughVol: 0 },  // ✓ valid
];

// Current code (with silent filter):
const filtered = payload.filter(item => isValidForeignFlowItem(item));
// Result: [item0, item2] (item1 silently dropped)

// Then:
writeForeignFlowToOhlcv(filtered);
// Updates 2 rows, logs "changes: 2", returns success
// But VPS sent 3 items; 1 was lost

// Example: After 10 days with same payload:
// Sent: 30 items/day × 10 days = 300 items
// Filtered: 20 items/day × 10 days = 200 items
// Missing: 100 rows (33% data loss)
```

---

## Lessons Learned

1. **Avoid `.filter()` for validation** — it hides dropped items. Use explicit validator that reports errors.
2. **Don't duplicate validators across layers** — DRY principle. Validator in domain, call from everywhere.
3. **Fail loudly on schema errors** — silent filtering masks problems. Let errors propagate.
4. **Test invalid inputs** — test suite must include both valid and invalid payloads.
5. **Log diagnostics for debugging** — "item dropped" is not helpful. "Item 5: code expected string, got 123" is.

---

## Metadata

- **Introduced:** Sprint 214 (original foreign flow parser, silent filter pattern)
- **Diagnosed:** Sprint 1289 (root-cause analysis, recurring bug escalation)
- **Fixed:** Sprint 1288, Task 1288f (Step 6 validation added, commit 4116b739, 2026-04-22)
- **Related issues:** None (first time this pattern was identified)
- **Prevention checklist:** COMPLETE (verified in Task 1288f)
- **Author:** Architect (2026-04-22) | **Prevention implementation:** QA (2026-04-22)

