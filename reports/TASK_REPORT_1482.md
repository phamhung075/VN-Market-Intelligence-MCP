# Task Report 1482 — compact

changed:
- src/infrastructure/agents/qaResponderSpawner.ts — added `db?: Database` param, `db ?? getDb()` fallback
- src/scheduler/askQueueCheckJob.ts — passes `conn` to `spawnQaResponder(conn)`, adds `postSignal` call
- src/__tests__/1073-telegram-ask-command.test.ts:129 — stale "12 phút" → "Đang xử lý"

bun test: 5597 pass / 30 fail (30 pre-existing, unrelated to task; baseline was 5589 → +8 new passes, exact match)
tsc: 0 errors
ddd: PASS (scheduler/ → infrastructure/ is correct direction; domain/ untouched)
merge_commit: e36daa8

verdict: APPROVED
