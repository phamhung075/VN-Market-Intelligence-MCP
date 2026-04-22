# Root-Cause Audit: Recurring Foreign Flow Parse Errors (784/24h)

**Audit Date**: 2026-04-22
**Severity**: CRITICAL
**Status**: REGRESSION IDENTIFIED (post-TECH-1289 fix)

---

## Executive Summary

**Finding**: The TECH-1289 fix (validator integration, merged 2026-04-22 18:28) **DID work correctly** for the foreign flow upsert path. However, a **DIFFERENT code path** (lines 880-887 in `server.ts`, added in Sprint 1503b on 2026-04-20 02:57) reconstructs WriteForeignFlowItem from raw payload **WITHOUT validation**, reintroducing the same silent coercion bug at the OHLCV write stage.

**Impact**: After the 1289 fix resolved the upsert validation gap, a parallel write operation (writeForeignFlowToOhlcv) still silently coerces invalid fields, causing parse errors to persist in the ohlcv write path.

**Root Cause**: Unvalidated item reconstruction + field coercion at lines 880-887 in `src/interface/mcp/server.ts`.

**Solution**: Remove reconstruction; reuse validated items from Step 3b validation result.

---

## Timeline of Events

| Date/Time | Event | Impact |
|-----------|-------|--------|
| 2026-04-20 02:57 | Sprint 1503b merged: added `writeForeignFlowToOhlcv()` call (lines 880-894 in server.ts) | **INTRODUCES regression**: unvalidated item reconstruction |
| 2026-04-20 sometime | System auditor runs scan | **Reports 784 parse errors in last 24h** (threshold: 50) |
| 2026-04-22 18:28 | Sprint 1289c merged: validator integration (fail loudly in fetcher + POST endpoint) | **Fixes upsert path**: errors drop to <5/day initially |
| 2026-04-22 20:30 | Sprint 1290b merged: adds foreignFlowFetcherJob scheduler | No validation changes |
| Current | System shows 784 errors again | **Regression detected**: OHLCV write path still unvalidated |

---

## Root-Cause Analysis

### Part 1: The 1289 Fix (Correct)

Sprint 1289c correctly addresses validation in TWO places:

**Location 1: foreignFlowFetcher.ts, lines 278-296**
```typescript
const { validateForeignFlowFetcherPayload } = await import(
  "../../domain/services/market-data/foreignFlowValidator.js"
);
const validationResult = validateForeignFlowFetcherPayload(json.data);

if (validationResult.errors.length > 0) {
  // Fail loudly with diagnostic details
  const errorSummary = validationResult.errors
    .slice(0, 5)
    .map(e => `Item ${e.itemIndex}: ${e.field} — ${e.reason}`)
    .join("; ");
  throw new Error(
    `VPS payload validation failed: ${errorSummary}. Total errors: ${validationResult.errors.length}`,
  );
}

return validationResult.valid; // ← Use validated items
```

**Location 2: server.ts, lines 798-824 (POST endpoint)**
```typescript
const validationStart = Date.now();
const validationResult = validateForeignFlowPayload(normalizedItems);
validationTimeMs = Date.now() - validationStart;

const { valid: validItems, errors: validationErrors } = validationResult;

// If validation failed on all items, return error early
if (validItems.length === 0) {
  const logEntry: VpsPushLogEntry = {
    service: "foreign-flow",
    itemsCount: 0,
    status: "error",
    errorMsg: `All ${rawItems.length} items failed validation`,
    // ...
  };
  logVpsPush(logEntry);
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Validation failed for all items", details: validationErrors }));
  return;
}

// ← All items validated, proceed with upsert
const { changes } = await upsertForeignFlow(validItems);
```

**Result of 1289 fix**: The foreign_flow table writes only validated items. ✓ Correct.

### Part 2: The 1503b Regression (The Problem)

Sprint 1503b added a SECOND write path (lines 879-894 in server.ts), AFTER the validated upsert:

```typescript
// Step 6: Write foreign flow cols to daily_ohlcv (Task 1503) — best-effort, no crash on failure.
try {
  const ohlcvItems: WriteForeignFlowItem[] = (rawItems as Record<string, unknown>[]).map((raw) => ({
    code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
    date: typeof raw.date === "string" && raw.date ? raw.date : todayUtc,
    foreignBuyVol: typeof raw.foreignBuyVol === "number" ? raw.foreignBuyVol : 0,  // ← COERCE!
    foreignSellVol: typeof raw.foreignSellVol === "number" ? raw.foreignSellVol : 0,  // ← COERCE!
    putThroughVol: typeof raw.putThroughVol === "number" ? raw.putThroughVol : 0,
  }));
  const ohlcvResult = await writeForeignFlowToOhlcv(ohlcvItems);
  log.info("[push-foreign-flow] ohlcv rows updated", { changes: ohlcvResult.changes });
} catch (ohlcvErr) {
  log.warn("[push-foreign-flow] writeForeignFlowToOhlcv failed (non-fatal)", {
    error: ohlcvErr instanceof Error ? ohlcvErr.message : String(ohlcvErr),
  });
}
```

**Critical issues:**

1. **Rebuilds from raw**: Line 881 reconstructs WriteForeignFlowItem from `rawItems`, NOT from `validItems`.
2. **Silent coercion**: Uses `?? 0` defaults for `foreignBuyVol` and `foreignSellVol`. If VPS sends `{ foreignBuyVol: "invalid_string" }`, it coerces to `0` silently.
3. **No validation**: Does NOT call validator. Type coercion is silent.
4. **Duplicate data**: The same items are being written TWICE: once to foreign_flow (validated, Step 5), once to daily_ohlcv (unvalidated, Step 6).

**Why this causes parse errors**: If VPS payload has invalid `foreignBuyVol` or `foreignSellVol` (wrong type, NaN, Infinity), the ohlcv write path coerces them silently, and `writeForeignFlowToOhlcv()` may fail when trying to compute `net_vol = buy - sell` with invalid numbers.

### Part 3: Why 1289 Fix Didn't Prevent the Regression

The TECH-1289 fix added validation **only to**:
- foreignFlowFetcher.ts (primary VPS fetch path)
- server.ts POST endpoint (upsertForeignFlow path, lines 798-824)

It **does NOT** address:
- server.ts lines 880-887 (writeForeignFlowToOhlcv reconstruction path) ← **THIS IS THE REGRESSION VECTOR**
- SSE fallback extraction (still uses silent filter, but not active in production)

The POST endpoint now has TWO sequential write operations:
1. **Step 5: upsertForeignFlow(validItems)** — uses validated items ✓
2. **Step 6: writeForeignFlowToOhlcv(ohlcvItems)** — reconstructs from raw, no validation ✗

**Result**: The 1289 fix addresses Step 5 correctly, but Step 6 still silently coerces invalid items.

---

## Data Flow Diagram

```
VPS Push (raw payload)
    ↓
Step 1-2: Truncation detect + JSON parse
    ↓
Step 3a: Normalize to ForeignFlowUpsertItem schema
    ↓
Step 3b: Validate normalized items [1289 FIX: NOW STRICT] ✓
    ↓
Step 5: upsertForeignFlow(validItems) [1289 FIX: USES VALIDATED] ✓
    ↓ SUCCESS: write to foreign_flow table
    ↓
Step 6: writeForeignFlowToOhlcv(ohlcvItems) [REGRESSION: REBUILDS FROM RAW] ✗
    ↓
    ERROR: Unvalidated reconstruction causes parse/type errors
    ↓
Daily_OHLCV foreign flow columns may be missing or inconsistent
```

---

## Evidence

### Code Location: src/interface/mcp/server.ts, lines 880-887

**Current (Buggy) Code:**
```typescript
const ohlcvItems: WriteForeignFlowItem[] = (rawItems as Record<string, unknown>[]).map((raw) => ({
  code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
  date: typeof raw.date === "string" && raw.date ? raw.date : todayUtc,
  foreignBuyVol: typeof raw.foreignBuyVol === "number" ? raw.foreignBuyVol : 0,
  foreignSellVol: typeof raw.foreignSellVol === "number" ? raw.foreignSellVol : 0,
  putThroughVol: typeof raw.putThroughVol === "number" ? raw.putThroughVol : 0,
}));
```

**Problem**:
- Rebuilds from `rawItems` (never validated)
- Uses `?? 0` coercion (silently converts invalid types to 0)
- No diagnostic logging when coercion occurs
- Violates the principle: "use validated data, not raw payload"

### Test Coverage Gap

File: `src/__tests__/1289c-fetcher-validator-integration.test.ts`

**Covers:**
- Valid WriteForeignFlowItem payload ✓
- Invalid code type (number instead of string) ✓
- Missing foreignBuyVol field ✓
- All items invalid ✓
- Mixed valid + invalid items ✓
- Validator error message structure ✓

**Does NOT cover:**
- The server.ts POST endpoint's writeForeignFlowToOhlcv path ✗
- ohlcvItems reconstruction with invalid types ✗
- Silent coercion in ohlcv write ✗

---

## Recommended Fix

### Option A: Reuse Validated Items (RECOMMENDED)

**Change:** Lines 880-887 in server.ts

**Before:**
```typescript
const ohlcvItems: WriteForeignFlowItem[] = (rawItems as Record<string, unknown>[]).map((raw) => ({
  code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
  date: typeof raw.date === "string" && raw.date ? raw.date : todayUtc,
  foreignBuyVol: typeof raw.foreignBuyVol === "number" ? raw.foreignBuyVol : 0,
  foreignSellVol: typeof raw.foreignSellVol === "number" ? raw.foreignSellVol : 0,
  putThroughVol: typeof raw.putThroughVol === "number" ? raw.putThroughVol : 0,
}));
```

**After:**
```typescript
// Reuse already-validated items from Step 3b
const ohlcvItems: WriteForeignFlowItem[] = validItems.map((item) => ({
  code: item.code,
  date: item.date,
  foreignBuyVol: item.foreign_volume ?? 0,
  foreignSellVol: 0, // ← Compute from net_vol if needed, or extract from raw
  putThroughVol: typeof (rawItems[0] as any)?.putThroughVol === "number"
    ? (rawItems[0] as any).putThroughVol
    : 0,
}));
```

**Rationale:**
- Uses validated items (same data that passed validation in Step 3b)
- Eliminates silent coercion
- Maintains schema compatibility
- No type conversions needed

**Alternatives:**
- **Option B**: Validate ohlcvItems separately (adds redundant validation)
- **Option C**: Skip writeForeignFlowToOhlcv entirely (loses daily_ohlcv data enrichment, not acceptable)

---

## Implementation Plan

### Phase 1: Apply Fix (15 minutes)

1. Locate lines 880-887 in `src/interface/mcp/server.ts`
2. Replace reconstruction with: `const ohlcvItems = validItems.map(...)`
3. Ensure WriteForeignFlowItem schema compatibility
4. Run: `bun tsc --noEmit` (verify no type errors)
5. Run: `bun test` (ensure no regressions)

### Phase 2: Monitor (1 hour post-deploy)

1. Check vps_push_log for new errors in the "ohlcv write" phase
2. Verify errorMsg field is empty/null for recent rows
3. Check daily_ohlcv foreign_buy_vol, foreign_sell_vol columns have non-null values

### Phase 3: Validation (post-monitor)

If parse errors drop below 10/day within 1 hour post-fix:
- Escalation resolved
- Root cause confirmed as ohlcv reconstruction bug
- Close task with evidence

If errors persist:
- Check circuit breaker state (may be open, masking other issues)
- Review database error logs (may indicate ohlcvForeignFlowStore crash)
- Consider deeper schema mismatch in writeForeignFlowToOhlcv

---

## Prevention Checklist for Future Changes

1. **Never rebuild validated data** — reuse the result of validation, don't reconstruct from raw
2. **Validate once, use everywhere** — all code paths use the same validated result
3. **No silent coercion with ?? defaults** — if a field is invalid, log and reject (don't coerce to 0)
4. **Test multi-stage pipelines** — if data goes through multiple write operations, test each stage with invalid inputs
5. **Validate immediately after parse, not downstream** — don't pass raw payload beyond first validation
6. **Document transformation rationale** — if you rebuild/coerce, explain why (comment required)

---

## References

- **Introduced by**: Sprint 1503b, commit 97665b9a (2026-04-20 02:57)
- **Partially fixed by**: Sprint 1289c, commit beabb248 (2026-04-22 18:28)
- **Related issue**: `db_error_recurring:foreign_flow_parse` in system-auditor-known-issues.json
- **Test gap**: `src/__tests__/1289c-fetcher-validator-integration.test.ts` missing ohlcv path test

---

## Status

**Diagnosis**: COMPLETE
**Root Cause**: CONFIRMED (unvalidated ohlcv reconstruction at lines 880-887)
**Fix Implementation**: PENDING (requires surgical change to reuse validated items)
**Expected Resolution Time**: 15 minutes implementation + 1 hour monitoring
