## Task Report FIX-ORCH-KEY-NORMALIZE-TASKID

changed: [apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts:112-114+130-132, docs/data/orch/orch-state.json (189-row migration), docs/standards/task-schema.md:82-85, docs/handoffs/FIX-ORCH-KEY-NORMALIZE-TASKID.md (new)]
tests: 6 pass / 0 fail (orchStateStore-atomic-write.test.ts) | tsc: 3 errors (pre-existing in 1980-f2-canon-schema.test.ts only; 0 new; 2 tasksMdJanitorJob.ts errors CLEARED) | ddd: PASS | security: PASS
verdict: APPROVED

### Evidence Summary

- AC1: task_id keys in active_sprints/backlog/done = 0/0/0 (jq deep-walk confirmed)
- AC2: row counts 159/38/84 unchanged pre->post (jq length verified)
- AC3: jq -e . PARSE OK; top-level keys identical to f0db4387^ (11 keys, no change)
- AC4: signal_queue diff vs f0db4387^ = BYTE-IDENTICAL
- AC5: 6/0 pass/fail; tsc 3 errors all in 1980-f2-canon-schema.test.ts; 2 tasksMdJanitorJob.ts errors CLEARED (string|undefined->string assignment resolved by coalesce ||"")
- AC6: Write Rules at docs/standards/task-schema.md:82-85; "write id never task_id; timestamps via date -u" confirmed
- Special case BA-ORCH-TASK-CANON: pre-migration had both id+task_id; post-migration only id="BA-ORCH-TASK-CANON" retained; row present in backlog, no data loss
- Commit hygiene: f0db4387 touches exactly 4 files (tasksMdJanitorJob.ts, orch-state.json, handoff, task-schema.md); no stray staged content; all 4 expected, none extra
- tsc confirm/refute: CONFIRMED — pre-fix 5 errors (3×1980-f2 + 2×tasksMdJanitorJob); post-fix 3 errors (3×1980-f2 only); tasksMdJanitorJob.ts errors were real (t.task_id typed string|undefined assigned to taskId:string) and are now resolved
