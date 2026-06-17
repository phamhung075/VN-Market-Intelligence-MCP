---
id: SUBTASK-OHLCV-WRITER-1-FOREIGN-FLOW-MERGE
task_id: SUBTASK-OHLCV-WRITER-1-FOREIGN-FLOW-MERGE
parent_task: ARCH-OHLCV-WRITER-SSOT-DURABLE
version: "2026-06-17"
zone: apps/mcp-server/
owner: dev-mcp-server
priority: P0
status: READY
type: FIX
size: S
---

# SUBTASK-1: Rewrite writeForeignFlowToOhlcv — merge-only UPDATE (no stub INSERT)

---

## Context

This is the **producer-root fix** for the recurring "single-digit RSI / giá 0 dưới BB" MARKET-spam bug (4th recurrence, escalated to architect). The bug is caused by `writeForeignFlowToOhlcv` in `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` (L57-69), which inserts an all-zero OHLCV stub row when the foreign-flow fetch fires BEFORE the real OHLCV bar arrives.

**Root cause:** The function uses `INSERT INTO daily_ohlcv ... VALUES (..., open=0, high=0, low=0, close=0, volume=0) ON CONFLICT(code, date) DO UPDATE ...`. The stub is created to satisfy the `close REAL NOT NULL` constraint when no OHLCV row exists yet. But `close=0` is semantically corrupt — it claims there is a close price of zero, which is physically impossible on the VN market and poisons every TA consumer (RSI, Bollinger Bands).

**Architect's decision:** Replace the INSERT-with-stub strategy with a **merge-only UPDATE** that skips the INSERT entirely when no OHLCV row exists. The foreign-flow data will be deferred (dropped) for the ~2–3 hour window before the real OHLCV bar arrives via pushPricesHandler. This is acceptable because:
1. The re-fetch is guaranteed within 60s (CRONS.foreignFlowFetch runs every 60 seconds, confirmed startupHelpers.ts:219 + startScheduler.ts:840)
2. The moment the real OHLCV bar lands (~03:00Z), the next 60s fetch will UPDATE the foreign-flow columns
3. Same-day final-value loss window is ≤ ~60s
4. An honest gap (no row) is better than a fake `close=0` stub (/goal#1)

---

## Files to Modify

### Primary: `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts`

**Current code (L57-69):**
```typescript
// INSERT … ON CONFLICT pattern (STUB INSERT removed)
INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, foreign_buy_vol, ...)
VALUES (?, ?, 0, 0, 0, 0, 0, ?, ...)
ON CONFLICT(code, date) DO UPDATE SET ...
```

**Replace with (L57-69):**
```sql
UPDATE daily_ohlcv
SET
  foreign_buy_vol   = ?,
  foreign_sell_vol  = ?,
  foreign_net_vol   = ?,
  put_through_vol   = ?,
  foreign_buy_value  = COALESCE(?, foreign_buy_value),
  foreign_sell_value = COALESCE(?, foreign_sell_value),
  updated_at = ?
WHERE code = ? AND date = ?
-- changes=0 → no OHLCV row yet → deferred, log debug, no stub INSERT
```

The function signature remains the same: `writeForeignFlowToOhlcv(...)`. The return value is `{ changes: number }`:
- `changes > 0`: Row existed and was updated
- `changes = 0`: No row exists yet (deferred write, log debug, continue)

**No stub INSERT when `changes=0`.**

---

## Caller Verification (Critical)

The architect identified 3 call sites. **You MUST verify that BOTH treat `changes=0` as a non-error path:**

1. **`apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts`**
   - L136-137 (path 1)
   - L219-220 (path 2)
   - Current pattern: `const { changes } = await writeForeignFlowToOhlcv(...)`
   - **Action:** Verify these lines do NOT throw or reject when `changes=0`. Add a log statement if needed (e.g., debug log if changes=0).

2. **`apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts`**
   - L319
   - Current pattern: `const result = await writeForeignFlowToOhlcv(...)`
   - **Action:** Verify this line does NOT throw or reject when `changes=0`.

If ANY caller currently treats `0` as an error (e.g., throws on falsy `changes`), update the caller to treat `changes=0` as a deferred write and continue.

---

## Acceptance Criteria

- [ ] `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` L57-69 replaced: **no INSERT, only UPDATE**
- [ ] `writeForeignFlowToOhlcv` returns `{ changes: number }` where `changes=0` means deferred write (debug log)
- [ ] Both callers (`foreignFlowFetcher.ts` L136-137, L219-220, and `pushForeignFlowHandler.ts` L319) verified to NOT throw/reject on `changes=0`
- [ ] No stub row inserted when OHLCV row absent for `(code, date)` — the unit test SUBTASK-3 T-4 validates this end-to-end
- [ ] Debug log emitted when `changes=0` (e.g., `[ohlcvForeignFlowStore] no OHLCV row yet for {code} {date} — foreign-flow deferred`)
- [ ] Semantic verified: if pushPricesHandler inserts row after foreign-flow fetch, the next fetch's UPDATE populates foreign-flow columns immediately
- [ ] **REBUILD_REQUIRED: YES** — mcp-server image rebuild needed before live gate

---

## Architecture Justification

- **Zone:** `apps/mcp-server/` — single zone, no zone conflicts
- **DDD Layer:** infrastructure/db — correct layer (DB adapter), no layer change
- **Writer Inventory:** This fix addresses **Writer G** from the architect's inventory (brief §Writer Inventory)
- **Durable:** Closes the writer-bypass class for this writer; the broader ESLint rule (LINT-OHLCV-WRITE-BYPASS) is a follow-on (backlog, not P0)

---

## Risk Mitigation

**R-2: changes=0 treated as error by callers** (MEDIUM for this task)
- Mitigation: You MUST verify the 3 call sites do NOT error on `0`. If any do, fix them first.
- Test: Unit tests T-1 (SUBTASK-3) validate the non-error path.

**R-3: Parallel foreign-flow + OHLCV INSERT race** (LOW)
- If pushPricesHandler and foreignFlowFetcher run concurrently at 02:00Z, the UPDATE lands on `changes=0` (no OHLCV row yet). Benign — the UPDATE is a no-op. No new race introduced (was previously: stub INSERT wins, real OHLCV UPSERT repairs later).

---

## Knowledge Load

Read before starting:
- `docs/handoffs/ARCH-OHLCV-WRITER-SSOT-DURABLE-architect-design.md` — full design rationale + schema constraint analysis
- `docs/architecture-briefs/2026-06-17-ohlcv-writer-ssot-durable.md` — brief on writer-bypass class closure
- `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` — current implementation
- `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts` L136-137, L219-220 — caller 1
- `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts` L319 — caller 2

---

## Implementation Notes

1. **SQL rewrite:** Replace the `INSERT … ON CONFLICT` with a pure UPDATE. The UPDATE will return SQLite's `changes()` function result automatically.
2. **Function return type:** Ensure the return is `{ changes: number }`. The callers already expect this shape.
3. **Logging:** Emit a debug log when `changes=0` so future developers understand the deferral behavior.
4. **No behavior change for existing rows:** If the row exists, the UPDATE works exactly as before (merging foreign-flow columns).
5. **Test dependency:** This task BLOCKS SUBTASK-3 (unit tests), which validates the no-stub behavior end-to-end.

---

## Shared Verification Gate

After all 3 subtasks merge + rebuild + ops' rebuild-container step, the **shared verification gate** fires at the NEXT VN market open (2026-06-18, first TA scan 02:15Z):
- RSI matches canonical within 0.1pt, no single-digit/no 100.0, no "giá 0 dưới BB", generic all 30 tickers
- Live `daily_ohlcv` probe 02:00–03:30Z: ZERO rows with `close=0` on the latest bar for any watchlist ticker
- RAW `get_unreviewed_market_messages` confirms no spam

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` — full rewrite: INSERT...ON CONFLICT replaced with UPDATE-only; debug log on changes=0; verified 3 callers non-error on 0
- **Tests written:** T-1 + T-2 + T-4 (REGRESSION PROOF) in `2026-ohlcv-foreign-flow-merge.test.ts` — 7 tests GREEN
- **Git commits:** `41b4344c` fix(mcp-server/ohlcv-writer-ssot-durable): SUBTASK-1+2 writeForeignFlowToOhlcv merge-only UPDATE + SSOT annotation
- **Type check:** clean (bun tsc --noEmit, exit 0)
- **bun test:** 13275 run / 13185 pass / 48 fail (baseline was 51 fail — net improvement -3; 0 new failures from touched files)
- **Tool count:** 165 tools — matches pre-task baseline
- **Scheduler count:** 3 cron.schedule entries — matches pre-task baseline
- **Docs updated:** NONE (SSOT annotation in ohlcvWriteService.ts = SUBTASK-2)
- **Graphify:** skipped (no docs/ files impacted)
- **Callers verified:** foreignFlowFetcher.ts L137, L220; pushForeignFlowHandler.ts L319 — all treat changes=0 as non-error
- **SQL implemented:**
  ```sql
  UPDATE daily_ohlcv
  SET foreign_buy_vol=?, foreign_sell_vol=?, foreign_net_vol=?, put_through_vol=?,
      foreign_buy_value = COALESCE(?, foreign_buy_value),
      foreign_sell_value = COALESCE(?, foreign_sell_value),
      updated_at = ?
  WHERE code = ? AND date = ?
  ```
- **REBUILD_REQUIRED:** YES

Verify AT market open 02:15Z, NOT at 04:30Z (self-heal masks stubs after real OHLCV lands).
