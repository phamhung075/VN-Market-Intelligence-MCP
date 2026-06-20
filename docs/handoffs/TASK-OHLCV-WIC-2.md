# TASK-OHLCV-WIC-2 — Writer H High/Low Coercion Fix (server.ts push-ohlcv-history)

**Parent Task:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**Zone:** apps/mcp-server/
**Owner:** dev-mcp-server
**Type:** BUG-FIX
**Priority:** P0
**Size:** S (~2h)
**Tick:** 20260620T080911Z

---

## Summary

Fix the silent high/low type coercion in Writer H (`server.ts:1262-1267` in the push-ohlcv-history route) that maps string-typed high/low to `open` on type mismatch. This silently bypasses the `validateOhlcvUnit` guard by presenting `high=open, low=open` (which passes Rule 5 trivially as all-equal) instead of rejecting the malformed input.

**Root cause:** When VPS backfill script sends `high`/`low` as string types (not number), the coerce-to-open pattern masks the real values, allowing the guard to validate a false plausible bar (high=open, low=open). The UPSERT then writes the wrong values, potentially clobbering a prior intraday push with higher `high` values.

**Design decision:** Harden coercion to parse-and-reject: accept number or numeric string; reject the entire bar (skip, not default to open) if parse yields NaN or ≤ 0. The guard then receives the REAL high/low values and enforces Rule 5.

---

## File Targets

**File:** `apps/mcp-server/src/interface/mcp/server.ts`
**Lines to modify:** L1262-1268 (high/low coercion pattern)

### Current state (L1262-1268):
```typescript
const open  = typeof bar.open  === "number" ? bar.open  : 0;
const close = typeof bar.close === "number" ? bar.close : 0;
if (open <= 0 || close <= 0) continue;
const date   = typeof bar.date   === "string" ? bar.date   : "";
const high   = typeof bar.high   === "number" ? bar.high   : open;
const low    = typeof bar.low    === "number" ? bar.low    : open;
const volume = typeof bar.volume === "number" ? bar.volume : 0;
```

**Problem:** Lines 1266-1267 coerce string `high`/`low` to `open`, which passes the guard at L1274 trivially because high=low=open passes Rule 5.

---

## Changes Required

### Replace lines 1262-1268 with parse-and-reject pattern

```typescript
// Parse open, close with validation — reject row if NaN or ≤ 0
const open  = typeof bar.open  === "number" ? bar.open  : (typeof bar.open === "string" ? parseFloat(bar.open) : NaN);
const close = typeof bar.close === "number" ? bar.close : (typeof bar.close === "string" ? parseFloat(bar.close) : NaN);
if (Number.isNaN(open) || open <= 0 || Number.isNaN(close) || close <= 0) continue;

const date = typeof bar.date === "string" ? bar.date : "";

// Parse high, low with validation — REJECT ROW if NaN or ≤ 0 (do NOT default to open).
// Accept number or numeric string; reject the entire bar on parse failure.
const high_parsed = typeof bar.high === "number" ? bar.high : (typeof bar.high === "string" ? parseFloat(bar.high) : NaN);
const low_parsed  = typeof bar.low  === "number" ? bar.low  : (typeof bar.low === "string" ? parseFloat(bar.low) : NaN);
if (Number.isNaN(high_parsed) || high_parsed <= 0 || Number.isNaN(low_parsed) || low_parsed <= 0) continue;

const high   = high_parsed;
const low    = low_parsed;
const volume = typeof bar.volume === "number" ? bar.volume : 0;
```

**Rationale:**
1. **open/close:** Accept number or numeric string via parseFloat; reject row if NaN or ≤ 0 (same as before, now handles string input)
2. **high/low:** Accept number or numeric string via parseFloat; **REJECT THE ENTIRE BAR** (continue loop) if NaN or ≤ 0. Do NOT default to open.
3. **Guard receives real values:** The validateOhlcvUnit call at L1274 now receives the actual high/low values (or the bar is skipped before guard sees it).

---

## Acceptance Criteria

1. **String parsing:** Both `bar.high` and `bar.low` accept numeric strings via parseFloat.
2. **NaN rejection:** If parseFloat returns NaN for high or low, skip the bar (increment skipped counter, continue loop).
3. **Zero/negative rejection:** If high ≤ 0 or low ≤ 0 after parsing, skip the bar (increment skipped counter, continue loop).
4. **No default-to-open fallback:** Remove the `? open : open` coercion; high/low are rejected, never silently replaced.
5. **Guard receives real values:** The validateOhlcvUnit call at L1274 receives the actual high/low values; the guard enforces Rule 5 (low ≤ open,close ≤ high).
6. **Skipped counter increment:** Each rejected bar increments `skipped` before continuing loop.
7. **HTTP 200 preserved:** No throw; continue loop on parse failure; HTTP 200 returned at L1294 with updated inserted/skipped counts.

---

## Tests

**File:** Extend or create `apps/mcp-server/src/interface/mcp/__tests__/server.push-ohlcv-history.test.ts`

**Test cases** (minimum):
1. **String high/low parsing:** bar.high="100.5", bar.low="99.2" (valid numeric strings) → parse OK → guard called with 100.5 and 99.2 → accept
2. **String high/low NaN rejection:** bar.high="abc", bar.low="99.2" → parseFloat("abc") = NaN → skip bar, skipped++ (do NOT write)
3. **String high/low zero rejection:** bar.high="0", bar.low="-5" → parse OK but values ≤ 0 → skip bar, skipped++ (do NOT write)
4. **Number high/low still works:** bar.high=100.5 (number type) → accept, guard called with 100.5
5. **Mixed type:** bar.high=100 (number), bar.low="99.2" (string) → both parse OK → guard called with 100 and 99.2 → accept
6. **Guard still rejects Rule 5 violation:** after parsing, bar.high=100, bar.low=101 (high < low) → pass parse, guard rejects at L1274 → skip bar, skipped++

**Coverage:** Verify 200 HTTP response includes correct inserted/skipped counts and all malformed high/low bars are skipped before INSERT.

---

## Reference Patterns

- **Writer H guard location:** `apps/mcp-server/src/interface/mcp/server.ts:L1274` — validateOhlcvUnit call (APPROVED + verified)
- **Guard rule 5:** `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts:L148-154` — enforces low ≤ open,close ≤ high (APPROVED)

---

## Risk Flags

- **RISK-1 (MEDIUM):** VPS backfill script (`vps-scripts/` zone) may need updating to send numeric `high`/`low` fields instead of strings. This fix will now REJECT bars with string high/low values that parse to NaN or ≤ 0. Coordinate with ops to verify VPS script sends valid numeric types or valid numeric strings.
- **RISK-2 (LOW):** The parse-and-reject behavior changes the write behavior: bars that previously wrote `high=open, low=open` will now be SKIPPED. This is correct behavior (reject malformed input), but monitoring should watch for unexpected skipped count spikes in logs.

---

## Dependency

- **Blocks on:** none
- **Blocked by:** none
- **Paired with:** TASK-OHLCV-WIC-1 (independent, parallel work OK)

---

## Done Criteria (Developer)

- [ ] Code compiles: `pnpm tsc` clean
- [ ] All 6 test cases green
- [ ] No new tsc errors introduced
- [ ] Parse failures logged correctly (skipped counter incremented)
- [ ] Guard receives real high/low values (verify via test inspection or log)
- [ ] HTTP 200 response includes updated inserted/skipped counts
- [ ] Handoff signed by developer in this .md before commit

---

## Sign-off

**Developer:** _________________________ (sign when complete)

**QA:** _________________________ (sign after approval)
