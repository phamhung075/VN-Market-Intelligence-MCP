# Handoff — TASK-FIX-MCP-CRASH-LOOP-BC-1

**Sprint:** FIX-MCP-CRASH-LOOP-WRITEWAL  
**Task ID:** BC-1  
**Owner:** dev-mcp-server  
**Priority:** HIGH (ships first, load-bearing)  
**Size:** S (~2h)

---

## Summary

ROOT FIX: Resolve SQLite WAL accumulation by lowering checkpoint threshold and forcing TRUNCATE mode every 30 minutes. This task is load-bearing; tasks A-1 and D-1 are blocked until BC-1 is merged and deployed.

---

## Root Cause

`wal_autocheckpoint=4000` (16 MB threshold) + FULL-only checkpoint during live hours. Passive autocheckpoint is defeated by 40+ concurrent cron-job read snapshots that pin WAL frames. FULL mode does not reset WAL file size. WAL accumulates to 4000 frames, then wedges (~2h crash cadence).

---

## Design

**Lower threshold:**  
Change `wal_autocheckpoint` from 4000 to 1000 pages (~4 MB) in `schema.ts`. Triggers passive checkpoint 4× more frequently.

**Forced TRUNCATE every 30 min:**  
Add `runForcedTruncateCheckpoint()` to `checkpoint.ts`. Issues `BEGIN IMMEDIATE; COMMIT` (forces reader snapshots to expire) followed by `PRAGMA wal_checkpoint(TRUNCATE)` (resets WAL file to zero length). Call unconditionally every 30 min in the WAL cron, replacing the current FULL/TRUNCATE split logic.

---

## Files to Modify

### `apps/mcp-server/src/infrastructure/db/schema.ts`

**Change:** Line ~107, lower `wal_autocheckpoint` from 4000 to 1000.

```diff
- PRAGMA wal_autocheckpoint = 4000
+ PRAGMA wal_autocheckpoint = 1000
```

**Verification:** Subsequent `PRAGMA wal_autocheckpoint` queries return 1000.

---

### `apps/mcp-server/src/infrastructure/db/checkpoint.ts`

**Add:** New function `runForcedTruncateCheckpoint()`.

**Signature:**
```typescript
export async function runForcedTruncateCheckpoint(deps?: {
  db?: Database;
  log?: (msg: string) => void;
}): Promise<{ walSize: number; checkpointed: boolean }>;
```

**Implementation:**
1. Acquire exclusive lock via `BEGIN IMMEDIATE` (flushes in-flight writers, expires existing reader snapshots).
2. Release via `COMMIT`.
3. Call `PRAGMA wal_checkpoint(TRUNCATE)` — returns `[busy, log, checkpointed]`.
4. Query `PRAGMA wal_checkpoint(INTEGRITY_CHECK)` to verify truncation.
5. Return `{ walSize, checkpointed }`.
6. Errors are logged but non-fatal (checkpoint failure does not throw).

**Reuse:** Accept injectable `deps` for testing (mock db, mock log). No breaking changes to existing `runWalCheckpoint()`.

---

### `apps/mcp-server/src/scheduler/startScheduler.ts`

**Change:** The 30-min WAL cron (lines ~199-212).

**Current logic:**
```typescript
// FULL during 00:00-05:00 UTC, TRUNCATE only during 03:00-05:00 UTC
if (offHours) { /* FULL */ }
else { /* TRUNCATE */ }
```

**New logic:**
```typescript
// Call runForcedTruncateCheckpoint() unconditionally every 30 min
// Keep optional backup call in off-hours block only (for safety)
const result = await runForcedTruncateCheckpoint(deps);
log(`WAL checkpoint complete: size=${result.walSize}, truncated=${result.checkpointed}`);
```

**Cron registration:** Keep existing 30-min schedule (e.g., `'0,30 * * * *'`).

---

## Files to Create

### `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts`

**Test suite:** 5 unit tests.

1. **Test: wal_autocheckpoint is 1000 on fresh connection**
   - Open `:memory:` DB
   - Query `PRAGMA wal_autocheckpoint`
   - Assert returns 1000

2. **Test: runForcedTruncateCheckpoint() issues BEGIN IMMEDIATE then TRUNCATE in order**
   - Mock db with ordered call capture
   - Call `runForcedTruncateCheckpoint()`
   - Verify call order: BEGIN IMMEDIATE → COMMIT → PRAGMA wal_checkpoint(TRUNCATE)

3. **Test: runForcedTruncateCheckpoint() returns walSize and checkpointed**
   - Open `:memory:` DB
   - Call `runForcedTruncateCheckpoint()`
   - Assert result.walSize is number ≥ 0
   - Assert result.checkpointed is boolean

4. **Test: 10k-write sustained-load test — WAL frame count stays <1000 between truncate cycles**
   - Open `:memory:` DB with WAL mode
   - Insert 10,000 rows in batches
   - Before each truncate cycle, query `PRAGMA wal_checkpoint(FULL)` → returns `[busy, log, checkpointed]`
   - Assert `log` (frame count) < 1000 after truncate

5. **Test: BEGIN IMMEDIATE does not throw under concurrent readers**
   - Open `:memory:` DB
   - Start async reader task
   - Call `runForcedTruncateCheckpoint()`
   - Assert completes without error
   - Assert checkpointed=true

---

## Acceptance Criteria

| AC | Gate |
|---|---|
| Unit: `:memory:` DB under 10k-write sustained load — WAL frame count never exceeds 1000 between truncate cycles | `bun test FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts` (test 4) passes |
| Unit: `wal_autocheckpoint` PRAGMA returns 1000 on fresh connection | `bun test FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts` (test 1) passes |
| Unit: `runForcedTruncateCheckpoint()` calls BEGIN IMMEDIATE then TRUNCATE in order | `bun test FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts` (test 2) passes |
| Live: mcp-server uptime > 4 h with NO restart-loop AND WAL file size < 5 MB under normal write load | Ops runs: `docker logs vn-market-intelligence-mcp-mcp-server-1 --since 4h \| grep "WAL checkpoint complete"` + `ls -lh /data/market.db-wal` |
| tsc 0 errors | `bun run tsc --noEmit` pre-commit hook passes |

---

## Live-Verify Recipe

After ops deploys (force-recreate):

```bash
# Check WAL file size every 30 min for 4 hours
for i in {1..8}; do
  sleep 30m
  docker exec vn-market-intelligence-mcp-mcp-server-1 ls -lh /data/market.db-wal
done

# Expected: consistently < 5 MB, shrinking after each 30-min cycle

# Check uptime
docker ps --filter name=mcp-server --format "{{.Status}}"
# Expected: Up X hours (healthy)

# Check cron logs
docker logs vn-market-intelligence-mcp-mcp-server-1 --since 4h | grep "WAL checkpoint complete"
# Expected: TRUNCATE entries every 30 min
```

---

## Reuse & Constraints

- **Reuse:** Extend existing `runWalCheckpoint()` signature with injectable deps; do NOT duplicate.
- **Reuse:** Extend existing `checkWalFileSize()` for task D-1; do NOT break its signature.
- **Constraint:** No new MCP tools, no new domain services.
- **Constraint:** Changes are infrastructure layer only (db/connection tier).
- **Constraint:** No breaking changes to public APIs.

---

## Sequence & Dependencies

- **Blocks:** A-1, D-1 (both are guardrails that require BC-1 deployed first).
- **Depends on:** none (head of sequence).

---

## Dev Notes

- `BEGIN IMMEDIATE` may block concurrent writes up to 5 s (bounded by `busy_timeout`). This is acceptable; cron jobs already tolerate retry.
- WAL mode allows concurrent readers during checkpoint; no write freeze expected.
- Unit tests use `:memory:` DB to avoid state leakage; no cleanup needed.
- Off-hours backup call (03:00-05:00 UTC) is optional; keep for safety.

---

## Brief Reference

Full design: `docs/architecture-briefs/2026-06-14-fix-mcp-crash-loop-writewal.md` (§ 3, Fix-Class B/C).
