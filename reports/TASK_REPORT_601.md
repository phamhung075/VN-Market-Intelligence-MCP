## Task Report 601
changed: apps/mcp-server/src/infrastructure/db/coordinationStore.ts:449-458 (block comment), 512-517 (inline comment), 532 (WHERE clause)
tests: 54 pass / 0 fail (163 expect) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS
verdict: APPROVED — direct-commit verify (951ddfdba, already on main)

### Verification notes
- Phase-1 SELECT scan gains `AND task_id NOT LIKE 'cron-registration:%'`; Phase-2 DELETE (lines 590-601) confirmed unfiltered — expired `cron-registration:*` rows still GC, just silently.
- Doc comments updated at both ORPHAN_EMIT_ALLOW_LIST block and inline Phase-1 comment.
- No unrelated changes (1 file, 11 insertions, 0 deletions).
- `docs/agents/system-auditor/handlers.md` / `audit-dimensions.md` confirmed untouched (agent-father's zone, out of scope).
- AC-3a regression test (expired cron-registration row → no orphan-signal + still deleted) correctly deferred to TASK_603 per this task's declared scope — no test exists yet, verified by reading the code path directly instead.
