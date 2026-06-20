# TASK-OHLCV-WIC-1 — Writer F Guard Replacement (priceBackfillService.ts)

**Parent Task:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**Zone:** apps/mcp-server/
**Owner:** dev-mcp-server
**Type:** BUG-FIX
**Priority:** P0
**Size:** S (~2h)
**Tick:** 20260620T080911Z

---

## Summary

Replace the local stub `validateOhlcv()` function in Writer F (`priceBackfillService.ts:51-63`) with the canonical `validateOhlcvUnit` guard from `domain/services/market-data/ohlcvUnitGuard.js`. Add `normalizeOhlcvToVnd` normalization BEFORE the guard to align Writer F with the established Writer E pattern (`ohlcvBackfill.ts:L206-218`).

**Root cause:** Writer F has a local stub validator that does NOT enforce Rule 5 (OHLC plausibility: low ≤ open,close ≤ high) and does NOT apply VND unit normalization. The INSERT at L110-128 is live code (not a mock) that bypasses all post-normalization guards, allowing thousand-scale and out-of-range OHLCV rows to be written.

**Design decision:** Writer F is domain-layer code (`domain/services/priceBackfillService.ts`). Importing from `domain/services/market-data/ohlcvUnitGuard.js` (domain→domain) is DDD-safe. Calling `normalizeOhlcvToVnd` + `validateOhlcvUnit` before INSERT OR IGNORE enforces the write-time invariant.

---

## File Targets

**File:** `apps/mcp-server/src/domain/services/priceBackfillService.ts`
**Lines to modify:** L51-63 (validateOhlcv function) + L104-108 (call site in backfillPrices loop)

### Current state (L51-63):
```typescript
function validateOhlcv(data: OhlcvDataPoint): string | null {
  const { high, close, low, volume } = data;

  // Check ordering
  if (high < close) return "high-less-than-close";
  if (close < low) return "close-less-than-low";
  if (low < 0) return "negative-low";

  // Check volume
  if (volume <= 0) return "zero-or-negative-volume";

  return null;
}
```

### Current call site (L104-108):
```typescript
for (const row of ohlcvData) {
  const validationError = validateOhlcv(row);
  if (validationError) {
    errors.push({ ticker, reason: validationError });
    continue;
  }
```

---

## Changes Required

### 1. Add imports (after line 10, with existing imports)

Add to the import block:
```typescript
import {
  normalizeOhlcvToVnd,
  validateOhlcvUnit,
} from "../services/market-data/ohlcvUnitGuard.js";
```

**DDD boundary check:** `domain/services/` → `domain/services/market-data/` is same layer, no violation.

### 2. Replace validateOhlcv function (L51-63)

Delete the entire `validateOhlcv` function. It is now replaced by `validateOhlcvUnit` calls at the write site.

### 3. Update the call site (L103-108 in the backfillPrices loop)

Replace the `validateOhlcv` call with the Writer E pattern:

```typescript
for (const row of ohlcvData) {
  // CONTAM-4: Writer F receives data from resilientFetcher (mock in tests, real in production).
  // Apply VND normalization BEFORE validation — handles thousand-scale input.
  // Never skip sub-100 stock (it's thousand-scale, not garbage).
  let norm: { open: number; high: number; low: number; close: number };
  try {
    norm = normalizeOhlcvToVnd("stock", {
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
    });
  } catch (normErr) {
    errors.push({ 
      ticker, 
      reason: `normalize-error: ${normErr instanceof Error ? normErr.message : String(normErr)}` 
    });
    continue;
  }

  // Guard post-normalize values — out-of-range after normalization is genuinely corrupt.
  // Log + skip, never throw.
  try {
    const guardResult = validateOhlcvUnit(ticker, "stock", norm.open, norm.high, norm.low, norm.close);
    if (!guardResult.valid) {
      errors.push({ ticker, reason: `guard-rejected: ${guardResult.reason}` });
      continue;
    }
  } catch (guardErr) {
    errors.push({ 
      ticker, 
      reason: `guard-error: ${guardErr instanceof Error ? guardErr.message : String(guardErr)}` 
    });
    continue;
  }
```

Then update the INSERT at L110-128 to use `norm` values:
```typescript
const stmt = db.prepare(`
  INSERT OR IGNORE INTO daily_ohlcv
  (code, date, open, high, low, close, volume, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const now = new Date().toISOString();
const result = stmt.run(
  ticker,
  row.date,
  norm.open,       // ← use normalized values
  norm.high,       // ← use normalized values
  norm.low,        // ← use normalized values
  norm.close,      // ← use normalized values
  row.volume,
  now
);
```

---

## Acceptance Criteria

1. **Code change:** Local `validateOhlcv()` stub REMOVED; all validation routed through `validateOhlcvUnit` from ohlcvUnitGuard.
2. **Normalization:** `normalizeOhlcvToVnd("stock", { open, high, low, close })` applied BEFORE guard for every row.
3. **Error handling:** Guard rejection and normalize errors both logged via error objects pushed to the `errors` array (fail-closed, no throw).
4. **Import path:** Verifies domain→domain import direction (ohlcvUnitGuard.js in same domain/services/market-data/ scope).
5. **No breaking change to signature:** `backfillPrices()` async function returns same BackfillResult type; error messages expanded to carry guard reason.

---

## Tests

**File:** Create or extend `apps/mcp-server/src/domain/services/__tests__/priceBackfillService.test.ts`

**Test cases** (minimum):
1. **Rule 5 rejection:** close > high → guard rejects, error logged, row NOT inserted
2. **Rule 5 rejection:** high = low = 0 (sentinel) → guard rejects, error logged, row NOT inserted
3. **1000x scale rejection:** close=500000, high=500000 (post-normalize HILO_RATIO_MAX violated) → guard rejects, error logged, row NOT inserted
4. **Normalize → accept:** row open=0.5, high=5, low=0.5, close=5 (thousand-scale input) → normalize ×1000 → open=500, high=5000, low=500, close=5000 → guard accepts (within ratio) → row inserted
5. **Normalize error propagation:** malformed data (NaN) → normalize throws → error logged in BackfillResult.errors array

**Coverage:** Verify that the modified backfillPrices loop rejects all 5 scenarios via the guard; no stub-validation bypass path remains.

---

## Reference Patterns

- **Writer E:** `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts:L206-218` — normalize + validate pattern (APPROVED + verified)
- **Guard:** `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts:L148-154` — validateOhlcvUnit Rule 5 (APPROVED + verified)
- **Normalize:** `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts:L60-120` — normalizeOhlcvToVnd (APPROVED + verified)

---

## Risk Flags

- **RISK-1 (HIGH):** Verify import path is domain→domain (ohlcvUnitGuard.js is at `domain/services/market-data/ohlcvUnitGuard.js`). Any import from application/ or interface/ would be a DDD violation. Before merge, confirm `tsc` clean and import chain correct.
- **RISK-2 (MEDIUM):** Error message shape in BackfillResult.errors changes (now includes guard reason, not just validation key). Any caller parsing errors array must be updated to handle new format.
- **RISK-3 (LOW):** The INSERT at L110-128 is live code; ensure norm values are used, not raw row values.

---

## Dependency

- **Blocks on:** none
- **Blocked by:** none
- **Paired with:** TASK-OHLCV-WIC-2 (independent, parallel work OK)

---

## Done Criteria (Developer)

- [ ] Code compiles: `pnpm tsc` clean
- [ ] All 5 test cases green
- [ ] No new tsc errors introduced by import changes
- [ ] Guard rejection logged correctly (errors array carries guardResult.reason)
- [ ] INSERT OR IGNORE uses norm values, not raw row values
- [ ] Handoff signed by developer in this .md before commit

---

## Sign-off

**Developer:** dev-mcp-server — 2026-06-20T08:41Z — TASK-OHLCV-WIC-1 complete. Local stub `validateOhlcv()` removed, replaced with `normalizeOhlcvToVnd` + `validateOhlcvUnit` (Writer E pattern). INSERT uses norm values. 8 tests green. tsc clean. Claude-Session: https://claude.ai/code/session_01JdVqWyt2s6zx9wA14JM2XD

**QA:** qa — 2026-06-20T08:55Z — APPROVED. 8/8 tests pass. tsc 0 errors. DDD PASS (domain→domain only). Security PASS (mock-guard EXIT 0). Test realness PASS (production guard exercised via real :memory: DB + BAD ticker path). Child task TASK-OHLCV-WIC-1 status: DONE (code-done). Parent FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 awaiting Monday live cron-db-data-integrity re-sweep for done_verified. Claude-Session: https://claude.ai/code/session_01JdVqWyt2s6zx9wA14JM2XD

## [QA] Review Record

**Verdict:** APPROVED
**Cycle:** 304
**Commit reviewed:** aeacdb25

**Pipeline checks:**
- bun test TASK-OHLCV-WIC-1-writer-f-guard.test.ts: 8 pass / 0 fail (30 expect() calls)
- bun test 240-price-pipeline-recovery.test.ts: 13 pass / 0 fail (AC-2 reason-string guard-rejected: prefix confirmed)
- tsc --noEmit: 0 errors
- DDD scan (grep from.*infrastructure / from.*application on priceBackfillService.ts): PASS (no hits)
- Security scan (process.env, secrets): PASS (no hits in production file)
- mock-guard.sh: EXIT 0 — no fabricated-data patterns

**Test realness audit:**
- TC-1: backfillPrices BAD ticker → guard-rejected: prefix in errors (not old stub reason); 0 rows in DB — REAL path exercised
- TC-2: validateOhlcvUnit directly on high=0,low=0 → zero_ohlc rejection via Rule 1 — REAL guard
- TC-3: HILO ratio 1000x (500/500000) → hilo_ratio_too_wide — REAL Rule 4
- TC-4: thousand-scale normalize ×1000 + guard accept — normalizeOhlcvToVnd production function
- TC-5: old stub reason strings (high-less-than-close etc.) confirmed absent from errors array — stub removal verified

**Guard correctness:**
- close > high → Rule 5 implausible ohlc → rejected
- h=l=0 sentinel → Rule 1 zero_ohlc → rejected
- HILO ratio >5 → Rule 4 hilo_ratio_too_wide → rejected
- INSERT uses norm.open/norm.high/norm.low/norm.close (verified at priceBackfillService.ts:140-145)

**DDD:** domain/services/priceBackfillService.ts imports from ./market-data/ohlcvUnitGuard.js (domain→domain — SAFE per architect D-2)
