## Task Report ALPHA-S2-FOREIGN-FLOW-WRITE-RACE

**Type:** Feature merge-gate (whole-epic verdict, router-orchestrated relay) | **HEAD:** 4491a1f2e (CI 29378960352 + rag-service-py-lint 29378960352-lint, both success) | **Brief:** docs/architecture-briefs/2026-07-15-alpha-s2-foreign-flow-write-race-verdict.md

### Subtasks (all merged to trunk pre-gate)
- SUB1-DDL `be8f8b032` — `foreign_flow_history` + `intraday_foreign_flow_5m` tables + `idx_ffh_code_fetched`/`idx_iff5m_code_bucket` indexes in `schema-market-data.ts`
- SUB2-WRITE-PATH `d0da2b89d` — additive raw-tick insert (Step 6b) + rolling-24h purge in `pushForeignFlowHandler.ts`
- SUB3-JOB-CRON `8c67947de` — `intradayForeignFlow5mCompactorJob.ts` (new) + `cronConfig.ts`/`schedulerJobTable.ts`/`startScheduler.ts` wiring
- SUB4-DOCS-SYNC `a1265227e` — `cron-registry.json` + `system-map.json` cron entry + `docs/standards/cron-jobs.md`
- SUB5-TESTS `4491a1f2e` — `ALPHA-S2-FF-intraday-5m-compactor.test.ts` (6 tests / 51 expect)
- SUB6-BUCKETING-HELPER — OPTIONAL/STRETCH, not attempted, stays in backlog per brief §9 (not gated on).

### Tests — RAW, independently run
`bun test src/__tests__/ALPHA-S2-FF-intraday-5m-compactor.test.ts`:
```
6 pass
0 fail
51 expect() calls
Ran 6 tests across 1 file. [72.00ms]
```

Additive-only regression sweep, own 10-file selection (pre-existing foreign-flow write-path tests):
`1132-push-foreign-flow`, `1406b-push-foreign-flow-handler`, `1503-ohlcv-foreign-flow`, `1275-foreign-flow-unique-constraint`, `FIX-1275-foreign-flow-unique`, `1392-foreign-flow-cb-probe-regression`, `1407-foreign-flow-cb-fixes`, `1517-foreign-flow-alert-ohlcv-source`, `1986-foreign-flow-endpoint`, `1491-push-foreign-flow-parse`:
```
97 pass
0 fail
272 expect() calls
Ran 97 tests across 10 files. [3.42s]
```
Zero regressions to `upsertForeignFlow` / `writeForeignFlowToOhlcv` — both existing writers untouched by the diff (confirmed by code read, §"Out-of-scope integrity" below).

Guard-rail cross-checks:
- `1190-pipeline-watchdog.test.ts`: 16 pass / 0 fail / 30 expect() — includes the `schedulerFileCount === 67` assertion (bumped by SUB4).
- `FACTORY-SCHEDULER-job-table-registry.test.ts`: 15 pass / 0 fail / 268 expect().

`bun tsc --noEmit` (apps/mcp-server, standalone, exit code captured directly): **exit 0**, zero errors.

`mock-guard.sh --files <6 modified production files>`: **PASS** — no fabricated-data patterns.

### AC #1-#9 checklist (brief §8)
1. **PASS** — `foreign_flow_history` + `intraday_foreign_flow_5m` + both indexes created idempotently (`CREATE TABLE/INDEX IF NOT EXISTS`) in `schema-market-data.ts:200-240`, byte-match to brief §4 DDL.
2. **PASS** — `pushForeignFlowHandler.ts` Step 6b (lines 368-405) additively appends every normalized item into `foreign_flow_history` via `INSERT OR IGNORE`, own inner `try/catch` (line 374/401) so a failure here cannot regress the two pre-existing upserts (Step 5 `upsertForeignFlow`, Step 6 `writeForeignFlowToOhlcv`) — both confirmed byte-unchanged aside from the additive block. Rolling ~24h purge (`DELETE FROM foreign_flow_history WHERE fetched_at < ?`) added inline in the same block, mirrors `pushPricesHandler.ts`'s own pattern.
3. **PASS** — `runIntradayForeignFlow5mCompactor()` aggregates ALL codes (no watchlist filter) into 5-min UTC-aligned buckets using a `lastNonNull` COALESCE-style fold over time-ordered rows — confirmed NO min/max/open/high/low logic anywhere in the file (grepped), matching LAST-value-in-bucket semantics (brief §2.3/§6), not OHLC.
4. **PASS** — Idempotent + gap-tolerant: full re-scan every run, `INSERT OR REPLACE` per bucket. Covered by test titles `"AC#4: re-running against unchanged source ticks produces byte-identical..."` and `"AC#4: gap-tolerant — ticks spanning multiple 5-min buckets with an empty gap..."`.
5. **PASS** — Zero market-hours dependence: `grep -n "isVnTradingWindowUtc\|isVnMarketHoursUtc"` on `intradayForeignFlow5mCompactorJob.ts` + `cronConfig.ts` → zero matches. Empty-table no-op covered by `"AC#5: empty foreign_flow_history -> natural no-op, no throw, no market-hours gate"`.
6. **PASS** — Startup one-shot wired in `startScheduler.ts:124-128`, fire-and-forget `.then()/.catch()`, non-fatal (same idiom as the price-plane sibling's own startup call directly above it).
7. **PASS** — Cron + docs registered and mutually consistent: `cronConfig.ts:258` (`intradayForeignFlow5mCompactor`), `schedulerJobTable.ts:609-616` (`buildJobTable()` entry), `cron-registry.json` `.jobs[]` new entry + `system-map.json` `.project.microservices[id=mcp-server].crons` new entry (both arrays now length 68, exact match to each other), `docs/standards/cron-jobs.md` new row + source pointer. `schedulerFileCount` field bumped 66→67 (+1) — traced the full history (`43f4c8a22`→`b4224e278`→`c60774ef8`→`a1265227e`): `jobs[].length − schedulerFileCount = 1` is a STABLE pre-existing baseline invariant that predates both ALPHA-S2 epics (65 vs 66 at baseline, corrected back to 66 vs 67 after the sibling's since-fixed +2 scope-creep) — SUB4's +1 bump correctly preserves it, not a new drift.
8. **PASS** — Forward-preservation e2e, test `"AC#8: compacted 5m buckets survive the existing rolling-24h purge on foreign_flow_history end-to-end"`: pushes 2 ticks (one >24h old), compacts, applies the SAME rolling-24h purge SQL, confirms the old raw tick is gone from `foreign_flow_history` but its archived bucket in `intraday_foreign_flow_5m` is untouched (`toEqual`, byte-identical) both immediately after purge AND after a subsequent compactor run (true forward preservation, not merely "not yet deleted").
9. **N/A to QA** — Board hygiene (`zone` field correction) is router-owned per brief §9 and dispatch instruction; QA does not touch `orch-state.json`/`task_board`.

### Out-of-scope integrity (`git show be8f8b032 d0da2b89d 8c67947de a1265227e 4491a1f2e --name-only`)
Exactly 9 files touched across all 5 commits: `schema-market-data.ts`, `pushForeignFlowHandler.ts`, `intradayForeignFlow5mCompactorJob.ts` (new), `cronConfig.ts`, `schedulerJobTable.ts`, `startScheduler.ts`, `FACTORY-SCHEDULER-job-table-registry.test.ts`, `1190-pipeline-watchdog.test.ts`, `ALPHA-S2-FF-intraday-5m-compactor.test.ts` (new) + the 3 docs files (`cron-registry.json`, `system-map.json`, `cron-jobs.md`). `upsertForeignFlow` (`vnstockStore.ts`) and `writeForeignFlowToOhlcv` (`ohlcvForeignFlowStore.ts`) do NOT appear in any of the 5 commits' file lists — confirmed untouched (FIX-half from commit `3201c86cc` stays DONE, not re-opened).

### DDD / Security
- Zero `domain/`/`application/` files touched by any of the 5 commits (confirmed via `--name-only` grep) — no layering violation.
- `intradayForeignFlow5mCompactorJob.ts` imports `bun:sqlite` + `../../infrastructure/db/schema.js` only — scheduler job calling infra directly, same precedent as the sibling `intraday5mCompactorJob.ts`/`ohlcvDailyAggregatorJob.ts`.
- SQL: 100% parameterized (`.prepare(...).run(...)` positional `?` placeholders) in both the write-path insert and the compactor's select/upsert — zero string concatenation with user input.
- `grep -n "process\.env"` across all 6 modified production files → zero matches (`Bun.env` only).
- `grep -n ": any\|<any>\| as any"` on the new job + schema file → zero matches.
- `grep -n "password\|secret\|token"` → zero new matches (pre-existing `VPS_PUSH_API_KEY` auth header untouched by this diff).
- DI seam clean: `db?: () => Database`, `nowMsFn?: () => number`, both optional with real fallback (`getDb()`, `Date.now()`).

### Verdict
tests: 6 pass / 0 fail / 51 expect() (new feature suite) + 97 pass / 0 fail / 272 expect() (10-file additive-regression sweep) + 31 pass / 0 fail / 298 expect() (guard-rail cross-checks), all RAW independently run | tsc: exit 0, 0 errors | AC #1-#8: 8/8 PASS | AC #9: N/A (router-owned) | out-of-scope integrity: PASS | DDD: PASS | security: PASS | mock-guard: PASS

**APPROVE.**

### Blocking issues
None.

### Non-blocking findings
- Full `bun test` suite does not settle — a pre-existing test-infra interval/timer leak (`[sla-monitor] ... not seeded yet (age=-1)` + `[reaper] periodic reaper armed` flooding, hangs around test 22 in `034-telegram-notifier.test.ts`), unrelated to this epic (not touched by any of the 5 commits). Per dispatch instruction, did NOT run the full suite. Flagging as a separate test-hygiene backlog item for po triage.

### Merge / push / board
QA did not push production code (already CI-green pre-gate), did not touch `orch-state.json` (.head/.task_board/.signal_queue) or `task:ALPHA-S2-FOREIGN-FLOW-WRITE-RACE`, did not modify any production/SUT file — router owns epic close + umbrella mutex release per dispatch instruction.
