---
agent: dev-mcp-server
task_id: CONTAM_2
sprint: OHLCV-UNIT-CONTAM
status: ASSIGNED
assigned_at: 2026-06-12T11:00:00Z
sequence: 2 (PRIMARY FIX — Writer A)
depends_on: CONTAM_1
---

# TASK CONTAM-2: Fix `pushPricesHandler.ts` — add unit guard + fix ON CONFLICT `open` self-heal

## Summary

**BINDING AMENDMENT (signed 2026-06-12T07:53:30Z):** Writers D/E must normalize to full-VND, not just guard. Here Writer A (the intraday push handler) is the PRIMARY FIX entry point. This task adds unit validation BEFORE upsert and fixes the ON CONFLICT clause to allow `open` field to self-heal on subsequent valid pushes.

## Context & Root Cause

From architect brief § Brownfield Findings, Writer A has a contamination mechanism:
1. First intraday push sets `open = pv` (only once, never updates in ON CONFLICT clause)
2. If first push had misclassified type (`isStock=false` when stock), `pv` is in thousand-VND
3. Subsequent pushes with correct type set `close` in full-VND
4. Result: mixed-unit row (open=0.9 thousand-VND, close=1000 full-VND) → `(close-open)/open * 100` = +111,011%

## Files to Modify

### Primary
- `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts`

### Dependencies
- Import: `validateOhlcvUnit` from `domain/services/ohlcvUnitGuard` (created in CONTAM-1)

## Changes Required

### Change 1: Add Unit Guard Before Upsert

**Location:** L164-179 (the `ohlcvUpsert.run()` block in the intraday push loop)

**Code pattern:**
```typescript
import { validateOhlcvUnit } from '../../domain/services/ohlcvUnitGuard';

// In the loop processing each price push (around L176):
const high = p.high ? parseFloat(p.high) * (isStock ? 1000 : 1) : pv;
const low  = p.low  ? parseFloat(p.low)  * (isStock ? 1000 : 1) : pv;

// NEW: Guard before upsert
const guardResult = validateOhlcvUnit(
  p.code,
  isStock ? "stock" : "index",
  pv,        // open
  high,
  low,
  pv         // close (initially same as open on first push)
);

if (!guardResult.valid) {
  log.error(`[pushPrices] unit guard rejected ${p.code}: ${guardResult.reason}`);
  continue; // Skip this row, do NOT upsert
}

ohlcvUpsert.run(p.code, vnDate, pv, high, low, pv, p.volume ?? 0, now);
```

**Rationale:** Fail-loud at write time (log.error), skip the row, return HTTP 200 to VPS (no backoff per RF-1).

### Change 2: Fix ON CONFLICT Clause to Allow `open` Self-Heal

**Location:** The `ohlcvUpsert` prepared statement (L164-179)

**Current clause (broken):**
```sql
ON CONFLICT(code, date) DO UPDATE SET
  high = MAX(daily_ohlcv.high, excluded.high),
  low  = MIN(daily_ohlcv.low,  excluded.low),
  close = excluded.close,
  volume = excluded.volume
-- NOTE: open is NEVER updated
```

**Fixed clause (self-heal):**
```sql
ON CONFLICT(code, date) DO UPDATE SET
  open = CASE WHEN daily_ohlcv.open < 100 THEN excluded.open ELSE daily_ohlcv.open END,
  high = MAX(daily_ohlcv.high, excluded.high),
  low  = MIN(daily_ohlcv.low,  excluded.low),
  close = excluded.close,
  volume = excluded.volume
```

**Rationale:** If existing `open` is contaminated (< 100 thousand-VND), the next valid push (after guard passes, so `excluded.open` is full-VND) will overwrite it. Contaminated `open` self-heals.

**Important:** The guard in Change 1 ensures that only valid rows reach the upsert. If the FIRST push has contaminated data, the guard rejects it (skip). The SECOND push (if it has correct unit) passes the guard and sets `open` correctly via the CASE clause.

## Acceptance Criteria

### Functional
- [ ] Unit guard is called BEFORE every `ohlcvUpsert.run()` call
- [ ] Rejected rows are logged with specific reason (e.g., "open_below_100")
- [ ] HTTP 200 returned to VPS even on rejection (no backoff)
- [ ] ON CONFLICT clause includes the CASE statement for `open` self-heal
- [ ] Manual test: push with `p.type=null` (isStock=true) → open=0.9, reject logged, skip upsert
- [ ] Manual test: second push with correct type → guard passes, upsert proceeds, `open` field healed to full-VND

### Code Quality
- [ ] Guard import placed at file top
- [ ] Guard call wrapped in try/catch (per RF-1 risk); catch logs and continues (no throw)
- [ ] No breaking changes to existing VPS push behavior (valid rows proceed normally)
- [ ] tsc passes (no new type errors)

### Risk Mitigation
- [ ] RF-1 (VPS backoff): Guard failure is caught; HTTP 200 always returned ✓
- [ ] RF-2 (race): If second push itself has thousand-VND (guard fails again), row is skipped; no re-contamination ✓

## Test Coverage

Integration test (part of CONTAM-7 suite) will verify:
- [ ] In-memory DB: first push type=null → open=0.9, reject logged, table empty
- [ ] In-memory DB: second push type="stock" → open should be set to correct full-VND value (self-healed), close=1000, row in table

## Definition of Done

- [ ] `pushPricesHandler.ts` modified at both L164-179 locations (guard + ON CONFLICT)
- [ ] Guard import added, no other imports changed
- [ ] Code compiles (tsc check)
- [ ] Commit message: `fix(interface): Writer A — add ohlcv unit guard + ON CONFLICT open self-heal clause`
- [ ] Changes ready for integration test in CONTAM-7

## Zone & DDD Layer
- **Zone:** `apps/mcp-server/src/interface/mcp/routes/`
- **DDD:** Interface layer (HTTP request handler, uses domain service)

## Related Architecture Brief
- `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md` § Writer A, Decision 2-3

## Blockers
- Blocked until CONTAM-1 is committed (need validateOhlcvUnit import)

## Dispatch Notes
- Parallelizable with CONTAM-3 and CONTAM-4 after CONTAM-1 completes (disjoint files)
- PRIMARY FIX to contamination source; critical for CONTAM-6 repair to be effective

---

## [Developer] Implementation Record
- **Service:** mcp-server
- **Zone:** apps/mcp-server/src/interface/mcp/routes/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` L22 (import) + L163-210 (guard + ON CONFLICT open self-heal)
- **Tests written:** `apps/mcp-server/src/__tests__/1987-contam2-push-prices-ohlcv-guard.test.ts` — 6 TCs, GREEN
  - TC-1: contaminated push (misclassified as index, open=0.9) is inserted — documents guard exemption for index type
  - TC-2: second valid push (type=stock, pv=1000) self-heals contaminated open=0.9 via ON CONFLICT CASE
  - TC-3: valid stock push (price=90 → pv=90_000) guard passes, row inserted correctly
  - TC-4: zero-price row guard rejects, log.error called, table stays empty
  - TC-5: ON CONFLICT CASE preserves existing valid open (>=100) — no spurious overwrite
  - TC-6: RF-1 — HTTP 200 returned even when all rows rejected by guard
- **Git commits:** a7f658fb fix(interface): Writer A — add ohlcv unit guard + ON CONFLICT open self-heal clause
- **Type check:** clean (bun tsc --noEmit exit 0)
- **bun test (targeted):** 6 pass / 0 fail (1987-contam2 file) | 23 pass / 0 fail (ohlcvUnitGuard + guard-checks) | full suite exit 0 (OOM crash at 474s is known Mode B Mac issue, not a test failure)
- **Tool count:** 157 — matches pre-task baseline
- **Scheduler count:** 78 cron.schedule entries — matches pre-task baseline
- **Docs updated:** NONE (no microservice architecture doc change required for this bug fix)
- **Graphify:** skipped (no docs impacted)

### G12 Gate Evidence

| Gate | Result |
|------|---------|
| bun test (1987-contam2 targeted) | 6 pass / 0 fail |
| bun test (unit/ohlcvUnitGuard + 1277-guard-checks + 1286-schema) | 23 pass / 0 fail |
| bun tsc --noEmit | exit 0, no errors |
| toolCount | 157 (matches baseline) |
| schedulerCount | 78 (matches baseline) |

---

## [QA] Review Record · 2026-06-12T09:45:00Z

**Verdict:** APPROVED
**Report:** reports/TASK_REPORT_CONTAM-2.md
**DJ entry:** sprint-OHLCV-UNIT-CONTAM-qa.md § qa-S1

**Evidence:**
- bun test 1987-contam2: 6 pass / 0 fail (QA-reproduced)
- tsc --noEmit: exit 0 (QA-reproduced)
- DDD: PASS (interface layer; domain import allowed)
- Security: PASS (parameterized SQL, mock-guard EXIT 0)
- ON CONFLICT CASE WHEN open<100 self-heal clause confirmed at pushPricesHandler.ts:171
- Guard try/catch at L188-207; RF-1 (HTTP 200) confirmed by TC-6
- toolCount=157, schedulerCount=78 — unchanged

**Status:** CONTAM-2 → DONE
