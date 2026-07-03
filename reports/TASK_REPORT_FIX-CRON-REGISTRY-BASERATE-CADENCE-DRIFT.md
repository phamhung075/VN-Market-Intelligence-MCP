## Task Report FIX-CRON-REGISTRY-BASERATE-CADENCE-DRIFT
changed: docs/data/cron-registry.json:141 (schedule "19:00 UTC daily (02:00 VN)") | docs/data/system-map.json:327-328 (schedule + desc → daily)
tests: 1190-pipeline-watchdog.test.ts 16/16 pass (RAW re-run) | commit 5120100, exactly 2 files (3 ins / 3 del)
verdict: APPROVED

### Evidence
- RAW-extracted live values via `jq`/`grep` (not relayed):
  - `docs/data/cron-registry.json`: `"schedule": "19:00 UTC daily (02:00 VN)"`, `"desc": "Daily Bayesian base-rate recompute from evidence_fragments (baseRateComputationJob.ts)"` for `baseRateComputation`.
  - `docs/data/system-map.json` (`.project.microservices["mcp-server"].crons`): `"name": "baseRateComputation"`, `"schedule": "19:00 UTC daily (02:00 VN)"`, `"desc": "Daily Bayesian base-rate recompute"`.
  - `docs/standards/cron-jobs.md:38` SSOT: `19:00 UTC daily (02:00 VN) | baseRateComputationJob`.
  - All three sources now read **daily** and are textually consistent (`19:00 UTC daily (02:00 VN)`) — the drift is closed.
- `git show 5120100 --stat` confirms scope discipline: exactly the 2 declared files touched, 3 insertions / 3 deletions.
- `bun test src/__tests__/1190-pipeline-watchdog*` fresh RAW re-run → 16/16 pass, 0 fail.
- Pure doc/data-sync — both mirror files are not read by the runtime scheduler (only `docs/standards/cron-jobs.md` + the actual `baseRateComputationJob.ts` cadence constant, already correct since 24d1a4b5). No rebuild/deploy needed.

### Note
No file:line issues found.
