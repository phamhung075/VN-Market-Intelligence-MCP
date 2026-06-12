---
agent: dev-mcp-server
task_id: CONTAM_3
sprint: OHLCV-UNIT-CONTAM
status: ASSIGNED
assigned_at: 2026-06-12T11:00:00Z
sequence: 3 (parallel after CONTAM-1)
depends_on: CONTAM_1
---

# TASK CONTAM-3: Add unit guard to `/api/push-ohlcv-history` in `server.ts`

## Summary

Writer B (`/api/push-ohlcv-history` endpoint in server.ts) handles TCBS one-time backfill. Add unit validation on each bar before INSERT to defensively reject any thousand-scale data that might slip in.

## Context

From architect brief § Writer B:
- Receives bars from VPS fetch-ohlcv-backfill.sh (TCBS API, full-VND)
- Inserts directly with `ON CONFLICT DO UPDATE SET` (full overwrite)
- Unlikely source of contamination but defensive guard needed
- TCBS data should be full-VND; guard ensures format safety

## Files to Modify

### Primary
- `apps/mcp-server/src/interface/mcp/server.ts` (lines L1144-1169 approx)

### Dependencies
- Import: `validateOhlcvUnit` from `domain/services/ohlcvUnitGuard` (CONTAM-1)

## Changes Required

### Add Unit Guard on Each Bar

**Location:** Inside the `/api/push-ohlcv-history` handler loop that processes bars

**Code pattern:**
```typescript
import { validateOhlcvUnit } from '../../../domain/services/ohlcvUnitGuard';

// In the loop over bars array (around L1150-1160):
for (const bar of req.body.bars) {
  // NEW: Guard before insert
  const guardResult = validateOhlcvUnit(
    req.body.code,
    isTicker(req.body.code) ? "stock" : "index",  // Helper function to classify
    bar.open,
    bar.high,
    bar.low,
    bar.close
  );

  if (!guardResult.valid) {
    log.error(`[push-ohlcv-history] unit guard rejected ${req.body.code} ${bar.date}: ${guardResult.reason}`);
    continue; // Skip this bar
  }

  stmt.run(req.body.code, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume, now);
}
```

**Considerations:**
- Determine stock vs index: check against watchlist or a simple helper (e.g., code matches ^VN or doesn't contain special chars → index)
- If code classification uncertain, default to `"stock"` (stricter guard)
- Log rejection with date to help audit which TCBS bars were filtered

## Acceptance Criteria

### Functional
- [x] Guard is called for each bar in the request
- [x] Rejected bars are logged with code + date + reason
- [x] Rejected bars are skipped (continue loop, no insert)
- [x] Valid bars proceed to `stmt.run()` normally
- [x] HTTP 200 returned regardless of guard outcome (don't error the endpoint)

### Code Quality
- [x] Guard import added at file top
- [x] Guard call wrapped in try/catch (defensive; guard itself shouldn't throw)
- [x] No breaking changes to endpoint signature or response
- [x] tsc passes

### Test Coverage
- [ ] Integration test (CONTAM-7) will include a TCBS bar with open=0.9 (thousand-VND) and verify rejection + log

## Definition of Done

- [x] `server.ts` modified: guard added in loop, import statement present
- [x] Code compiles (tsc check)
- [x] Commit message: `fix(interface): Writer B — add ohlcv unit guard on TCBS bars`
- [x] Ready for integration test

## Zone & DDD Layer
- **Zone:** `apps/mcp-server/src/interface/mcp/`
- **DDD:** Interface layer (HTTP endpoint handler, uses domain service)

## Related Architecture Brief
- `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md` § Writer B, Decision 2

## Blockers
- Blocked until CONTAM-1 is committed

## Dispatch Notes
- XS (extra small) task, quick change
- Parallelizable with CONTAM-2 and CONTAM-4 after CONTAM-1

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/server.ts` L44 (import), L1158 (skipped var), L1168-1184 (guard block), L1190 (log+response) — unit guard on each bar in /api/push-ohlcv-history loop
- **Tests written:** none (XS task; CONTAM-7 integration test covers Writer B per handoff AC)
- **Git commits:** d1379fa4 fix(interface): Writer B — add ohlcv unit guard on TCBS bars
- **Type check:** clean (bun tsc --noEmit exit 0)
- **bun test:** 37 pass / 0 fail (targeted: unit/ + CONTAM-4 + REAUDIT-003); full suite 12694 pass, pre-existing 40 fail (lint discipline on CONTAM-2 test file — not introduced by this task)
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 79 cron.schedule entries (78 baseline + 1 added by sibling CONTAM-5 task; this task adds 0)
- **Docs updated:** NONE
- **Graphify:** skipped (no docs impacted)

### G12 Gate Evidence

| Gate | Result |
|------|--------|
| bun tsc --noEmit | exit 0 — clean |
| bun test (targeted) | 37 pass / 0 fail |
| Tool count | 157 — matches baseline |
| Scheduler count | 79 (baseline 78+1 from sibling CONTAM-5; this task: 0 added) |

Zone health: tsc clean, 157 tools intact, targeted tests 37 pass / 0 fail | HEALTHY

---

## [QA] Review Record · 2026-06-12T09:45:00Z

**Verdict:** APPROVED
**Report:** reports/TASK_REPORT_CONTAM-3.md
**DJ entry:** sprint-OHLCV-UNIT-CONTAM-qa.md § qa-S2

**Evidence:**
- Targeted tests 37 pass / 0 fail (QA-reproduced; no dedicated test file per XS scope)
- tsc --noEmit: exit 0 (QA-reproduced)
- DDD: PASS (interface layer; domain import allowed)
- Security: PASS (mock-guard EXIT 0)
- server.ts L1169-1183: guard in bar loop with try/catch; HTTP 200 preserved (L1192); skipped count in response
- toolCount=157, schedulerCount=79 — unchanged (CONTAM-5 added the +1)

**Status:** CONTAM-3 → DONE
