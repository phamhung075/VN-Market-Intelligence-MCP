---
session_id: 5a45feda-431e-46c8-941d-a6539a0eca77
task_id: ARCH-DAILY-FOREIGN-FLOW-TABLE
agent: pm
timestamp: 2026-07-10T19:30:00Z
---

# DJ Entry: ARCH-DAILY-FOREIGN-FLOW-TABLE PM Atomization

## What Was Decided
Atomized architect design (ARCH-DAILY-FOREIGN-FLOW-TABLE) into 7 subtasks per architect's explicit 7-subtask plan in handoff doc (§5 PM Task Atomization). No re-derivation of decomposition — applied architect's analysis directly to task_board.

## Why This Decision
- **Per PM flow contract:** "do not re-derive the decomposition from scratch — the architect already did that analysis; your job is to instantiate it as board rows"
- **Architect's doc already specified:** explicit dependency ordering, risk flags (R-6/R-7/R-8/R-9), and critical ordering constraint (backfill -2 MUST land before writer cutover -3 per R-6)
- **Execution order:** follows architect's suggested execution (§5 note): -1 → -2 → -3 (strict, R-6). -4 and -5 can run any time after -1, in parallel with -2/-3 or with each other. -6 needs -3 and -4 both landed. -7 is optional backlog.

## Decomposition Details

### Primary tier (critical path: R-1 elimination)
| Subtask | Size | Depends | Blocks | Notes |
|---------|------|---------|--------|-------|
| TASK_2000 (SUBTASK-DAILY-FF-1: DDL + index + view) | M | none | -1/-3/-4 | Schema addition, additive only |
| TASK_2001 (SUBTASK-DAILY-FF-2: backfill) | M | -0 | -2 | **R-6 CRITICAL:** backfill MUST land before writer goes live |
| TASK_2002 (SUBTASK-DAILY-FF-3: writer cutover) | L | -1 | -5 | Closes R-1 structurally (unconditional write, unit tests T-1/T-2/T-4/T-5) |

### Parallel tier (safe with primary)
| Subtask | Size | Depends | Notes |
|---------|------|---------|-------|
| TASK_2003 (SUBTASK-DAILY-FF-4: Class-A reads) | M | -0 | 5 files, one-line rename each; safe in parallel with -2/-3 (view COALESCEs) |
| TASK_2004 (SUBTASK-DAILY-FF-5: Class-B probes) | S | -0 | Direct table queries for clean freshness signal (not through view) |

### Integration & follow-on
| Subtask | Size | Depends | Notes |
|---------|------|---------|-------|
| TASK_2005 (SUBTASK-DAILY-FF-6: integration test) | M | -2/-3 | Behavioral gate: R-1 elimination proof (falsifies "chưa trả số từng mã" symptom) |
| TASK_2006 (SUBTASK-DAILY-FF-7: deprecation comment, optional) | S | -2 | Annotation-only, no DROP COLUMN per live DB risk |

## Why Not Alternative Approaches
1. **Skip -4/-5 in this cycle?** No — they are small (M + S), unblock health monitoring clarity, and should not be deferred.
2. **Big-bang rip-and-replace instead of additive table + view?** Architect decided against this in parent doc (9 read sites + ~15 tests coupled to `daily_ohlcv.foreign_*`). Additive approach makes migration safe without synchronized flag-day cutover across all 9 files.
3. **Defer -7?** Correct — it is marked optional and lower-priority. Kept in backlog as follow-on.

## Zone Assignment
All 7 tasks: **zone: apps/mcp-server/** (single zone per architect design).

## Risk Mitigations
- **R-6 (critical):** Explicit task dependency enforces backfill → writer sequencing. Test will verify idempotency.
- **R-7 (SSOT freeze):** SSOT-freeze annotation added to TASK_2002's writer function JSDoc (same pattern as parent design).
- **R-8 (view join performance):** Both tables PK-indexed on `(code, date)` — negligible cost at this scale.
- **R-9 (Class-B freshness probes):** If -4/-5 deferred, probes keep working (reading frozen legacy columns). Only decoupling improvement deferred, not correctness.

## Handoff Files Created
- `docs/handoffs/TASK_2000-daily-ff-schema.md` (DDL + view)
- `docs/handoffs/TASK_2001-daily-ff-backfill.md` (backfill migration)
- `docs/handoffs/TASK_2002-daily-ff-writer-cutover.md` (writer rewrite + tests)
- `docs/handoffs/TASK_2003-daily-ff-class-a-reads.md` (5 read-site migrations)
- `docs/handoffs/TASK_2004-daily-ff-class-b-probes.md` (4 probe rewires)
- `docs/handoffs/TASK_2005-daily-ff-integration-test.md` (behavioral gate)
- `docs/handoffs/TASK_2006-daily-ff-deprecation-comment.md` (optional follow-on)

## Board Status
- Parent task (ARCH-DAILY-FOREIGN-FLOW-TABLE): moved from review[] → done_verified[] with status=DONE
- 6 primary + parallel subtasks (TASK_2000-2005): added to backlog with proper depends_on wiring
- 1 optional follow-on (TASK_2006): added to backlog, priority=P2

## No Change From Plan
Only path: architect's explicit 7-subtask decomposition in handoff doc. Applied directly per PM contract.
