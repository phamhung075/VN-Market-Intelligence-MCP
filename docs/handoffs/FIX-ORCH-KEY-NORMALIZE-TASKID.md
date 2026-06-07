# Handoff: FIX-ORCH-KEY-NORMALIZE-TASKID

**Task:** Normalize task_board row key `task_id` -> `id` repo-wide  
**Owner:** dev-mcp-server  
**Status:** REVIEW  
**Date:** 2026-06-07T01:21:41Z  

---

## Before/After Key Counts

| Section | Total rows | `task_id` keys BEFORE | `task_id` keys AFTER | `id` keys AFTER |
|---|---|---|---|---|
| active_sprints | 159 | 159 | 0 | 159 |
| backlog | 38 | 28 | 0 | 38 |
| done | 84 | 2 | 0 | 84 |
| **TOTAL** | **281** | **189** | **0** | **281** |

Special case: 1 backlog row (`BA-ORCH-TASK-CANON`) had BOTH `id` and `task_id`. Kept `id`, dropped `task_id`.

---

## Row Count Assertion (AC2)

| Section | Pre-migration | Post-migration | Match |
|---|---|---|---|
| active_sprints | 159 | 159 | PASS |
| backlog | 38 | 38 | PASS |
| done | 84 | 84 | PASS |

---

## Method

- Python3 one-pass migration script
- Read full `orch-state.json` into memory
- For each task in `active_sprints[].tasks[]`, `backlog[]`, `done[]`:
  - If only `task_id`: rename key to `id` (188 rows)
  - If both `id` + `task_id`: keep `id`, drop `task_id` (1 row: `BA-ORCH-TASK-CANON`)
  - If only `id`: no change
- Structural guard (round-trip JSON parse, require head/task_board/signal_queue) before any fs write
- Atomic temp-file then `os.rename()` (POSIX atomic)
- Re-read verify: post-migration count confirms `task_id=0` across all sections

---

## AC4: signal_queue Verification

signal_queue serialized bytes compared before and after migration: **byte-identical**.  
3 rows present: 2 DONE, 1 READ — none modified.

---

## Files Changed

| File | Change |
|---|---|
| `docs/data/orch/orch-state.json` | One-shot migration: `task_id` -> `id` on 189 rows; own task flipped to REVIEW |
| `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` | Read-path coalesce: `t.id \|\| t.task_id \|\| ""` in both `parseTasksFromOrchState` and `parseTasksFromOrchStateJson` |
| `docs/standards/task-schema.md` | Added "Write Rules" section: write `id` never `task_id`; timestamps via real `date -u` |

---

## AC5: Test Results

- `bun test src/__tests__/orchStateStore-atomic-write.test.ts`: **6 pass / 0 fail**
- `bun tsc --noEmit`: **3 errors** (all pre-existing in `1980-f2-canon-schema.test.ts`; 0 new errors introduced)

---

## AC6: Standards Line

Added to `docs/standards/task-schema.md` under new "Write Rules" section:
> Write `id`, **never** `task_id`. The `task_id` field is legacy read-only; no new code may emit it.  
> `_updated_at` and `created_at` MUST be set via real `date -u +"%Y-%m-%dT%H:%M:%SZ"` output. Never hand-type timestamps.

---

## Compiled Code Changed

YES — `tasksMdJanitorJob.ts` updated (read-path coalesce added). No new tsc errors vs pre-task baseline of 3.

---

## [Developer] Implementation Record

- **Service:** mcp-server (data migration + code)
- **Zone:** apps/mcp-server/ + docs/data/orch/ + docs/standards/
- **Files modified:**
  - `docs/data/orch/orch-state.json` — 189-row key migration + own task REVIEW flip
  - `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` — read-path coalesce `id||task_id||""`
  - `docs/standards/task-schema.md` — Write Rules section added
- **Tests written:** none new (AC5 scoped run on existing suite)
- **Git commits:** [see RETURN block]
- **Type check:** 3 pre-existing errors only (1980-f2-canon-schema.test.ts); 0 new
- **bun test:** 6 pass / 0 fail (orchStateStore-atomic-write.test.ts scoped)
- **Tool count:** unchanged (no barrel/tool changes)
- **Scheduler count:** unchanged (no scheduler changes)
- **Docs updated:** docs/standards/task-schema.md — Write Rules added
- **Graphify:** skipped (data migration, no architectural docs changed)

---

## [QA] Review Record

**Verdict:** APPROVED  
**Date:** 2026-06-07T04:10Z  
**Report:** reports/TASK_REPORT_310.md

| AC | Result | Evidence |
|---|---|---|
| AC1: task_id=0 deep-walk | PASS | jq active_sprints/backlog/done → 0/0/0 |
| AC2: row counts 159/38/84 | PASS | jq length → 159/38/84 unchanged |
| AC3: parse + envelope keys | PASS | jq -e . OK; 11 top-level keys identical to f0db4387^ |
| AC4: signal_queue byte-identical | PASS | diff /tmp/sq_before.json /tmp/sq_after.json = empty |
| AC5: 6 tests pass / tsc 3 errors | PASS | 6/0; tsc 3 errors only in 1980-f2-canon-schema.test.ts; 0 new; 2 tasksMdJanitorJob.ts errors CLEARED |
| AC6: Write Rules in task-schema.md | PASS | Lines 82-85 confirmed |
| Special case BA-ORCH-TASK-CANON | PASS | Pre: both id+task_id; Post: only id retained, no data loss |
| Commit hygiene: 4 files, index-only | PASS | git show --name-only → exactly 4 files, no stray content |

**tsc confirm/refute:** CONFIRMED. Pre-fix baseline = 5 errors (3×1980-f2-canon-schema + 2×tasksMdJanitorJob.ts). Post-fix = 3 errors (3×1980-f2-canon-schema only). The 2 tasksMdJanitorJob.ts errors were real type violations (t.task_id typed string|undefined assigned to taskId:string field); coalesce `t.id || t.task_id || ""` resolves to string and clears them.

**DDD:** interface/scheduler layer importing infrastructure — explicitly annotated as permitted in file header. PASS.  
**Security:** No process.env, no secrets, no hardcoded tokens in diff. PASS.  
**BCTC Eval Gate:** N/A — no BCTC report in scope.
