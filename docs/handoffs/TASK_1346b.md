# Task 1346b: Fix push-foreign-flow UNIQUE Constraint

**Priority:** HIGH (recurring bug)
**Type:** BUG FIX
**Related Reports:** 1310, 1312
**Size:** M (2-3h)
**Recurrence:** Every ~60s during market hours — automated alerts failing

---

## Problem

**Error:** `UNIQUE constraint failed on vnstock_trading_stats.code`

**Frequency:** Every ~60s during market hours (approximately 9:30–16:00 VN time)

**Impact:**
- `push-foreign-flow` scheduler job crashes on market data updates
- Foreign flow alert signals dropped
- Missing data in real-time market intelligence feed

**Prior Fix:** Commit ef041ea addressed NOT NULL constraint on `.date` column
- Current issue is different: UNIQUE constraint on `.code` column
- This suggests the table allows duplicate `.code` entries in rapid succession

---

## Root Cause Analysis

Most likely: `push-foreign-flow` job tries to INSERT or UPDATE market data by `.code`, but:
1. Multiple records for same `.code` exist from rapid market updates
2. Database constraint logic doesn't handle concurrent writes
3. No UPSERT (INSERT ... ON CONFLICT) strategy in place

---

## Solution

1. **Inspect Schema:**
   - Check `vnstock_trading_stats` table definition (UNIQUE constraints on `.code`)
   - Understand current INSERT/UPDATE pattern

2. **Implement UPSERT:**
   - Replace INSERT with: `INSERT INTO vnstock_trading_stats (...) VALUES (...) ON CONFLICT(code) DO UPDATE SET ... WHERE ...`
   - This allows idempotent updates (no duplicate errors)

3. **Handle Concurrency:**
   - Verify foreign-flow job is not spawning multiple concurrent writes
   - If concurrent: use transaction isolation or SERIALIZABLE mode

4. **Test:**
   - Simulate rapid market updates (e.g., 10 writes in 1s for same ticker)
   - Verify no UNIQUE constraint errors
   - Baseline: all 7371 tests pass

---

## Acceptance Criteria

- [ ] `push-foreign-flow` job runs without UNIQUE constraint errors
- [ ] Can handle concurrent foreign flow updates for same `.code`
- [ ] Job completes in <5s (no performance regression)
- [ ] Logs show zero UNIQUE constraint failures during 1h test run
- [ ] All 7371 baseline tests pass

---

## Related

- Prior fix: commit ef041ea (NOT NULL constraint fix)
- Similar pattern: other scheduler jobs using UPSERT may have same issue
- Recommend: grep codebase for INSERT statements (not using ON CONFLICT) as preventive check

---

## Notes

- Recurring bug signature: exact 60s intervals suggests scheduler cycle time
- If fix doesn't resolve: check job concurrency model (Promise.allSettled? parallel writes?)
