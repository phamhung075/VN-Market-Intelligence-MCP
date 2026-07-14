## Task Report ALPHA-S2-TICK-DOWNSAMPLE-5MIN

**Type:** Feature merge-gate (whole-epic verdict, router-orchestrated relay) | **HEAD:** 81ed50626 (CI 29375183688 + rag-service-py-lint 29375183692, both success, event=push) | **Brief:** docs/architecture-briefs/2026-07-14-alpha-s2-tick-downsample-5min.md

### Subtasks (all merged to trunk pre-gate)
- SUB1-DDL `392c17f00` — `intraday_ohlcv_5m` table + `idx_intraday_5m_code_bucket` index in `schema-market-data.ts`
- SUB2-JOB-CRON `de8c49d67` — `intraday5mCompactorJob.ts` + `startScheduler.ts`/`cronConfig.ts`/`schedulerJobTable.ts` wiring
- SUB3-DOCS-CRON `b4224e278` + correction `c60774ef8` — guard-rail count bumps + cron docs sync
- SUB4-TESTS `81ed50626` — `ALPHA-S2-intraday-5m-compactor.test.ts` (6 tests / 48 expect)

### Tests — RAW, independently run
`bun test src/__tests__/ALPHA-S2-intraday-5m-compactor.test.ts src/__tests__/1190-pipeline-watchdog.test.ts src/__tests__/FACTORY-SCHEDULER-job-table-registry.test.ts`:
```
37 pass
0 fail
342 expect() calls
Ran 37 tests across 3 files. [499.00ms]
```
(1190-watchdog's injected "DB offline"/"Telegram timeout"/"rag_analyses empty" log lines are negative-path scenario output, not failures.)

`bun tsc --noEmit` (apps/mcp-server, run standalone, exit code captured directly not through a pipe): **exit 0**, zero errors.

### AC #1-#8 checklist (brief §7/§8)
1. **PASS** — `intraday_ohlcv_5m` + `idx_intraday_5m_code_bucket` created idempotently (`CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS`) in `schema-market-data.ts:96-116`, byte-match to brief §3 DDL.
2. **PASS** — `runIntraday5mCompactor()` aggregates ALL codes (no watchlist filter, `intraday5mCompactorJob.ts:86-131`) into 5-min UTC-aligned bars per open=first/high=max/low=min/close=last/volume=MAX/tick_count rules. Covered by test 1 ("buckets ticks into 5-min UTC-aligned bars...") + test 5 ("compacts EVERY distinct code...").
3. **PASS** — Idempotent: `INSERT OR REPLACE` full-row UPSERT in a `db.transaction`. Covered by test 2 ("AC#3: re-running against unchanged source ticks..." — byte-identical rows, `toEqual` including `compacted_at`).
4. **PASS** — Gap-tolerant, no watermark/state table: full re-scan every run. Covered by test 3 ("AC#4: gap-tolerant..." — 3-bucket gap, single run catches up correctly).
5. **PASS** — Zero market-hours dependence. `grep -n "isVnTradingWindowUtc\|isVnMarketHoursUtc"` on `intraday5mCompactorJob.ts` + `cronConfig.ts` → zero matches. Empty-table no-op covered by test 4 ("AC#5: empty market_prices_history -> natural no-op, no throw...").
6. **PASS** — Startup one-shot wired in `startScheduler.ts:113-117`, fire-and-forget `.then()/.catch()`, non-fatal (matches convention of sibling startup repairs in the same file, e.g. `runOhlcvCandlePresenceGuard`). No dedicated unit test (fire-and-forget void call, same as its siblings) — verified by direct code read.
7. **PASS** — Cron registered `cronConfig.ts:250` (`intraday5mCompactor: Bun.env.CRON_INTRADAY_5M_COMPACTOR ?? '*/5 * * * *'`) + `schedulerJobTable.ts:589-597` (`buildJobTable()` plain `wrapRun` entry). Dual-doc-update confirmed live: `cron-registry.json` `.jobs[]` has `intraday5mCompactor` entry + `.schedulerFileCount=66` (post router-RAW-verify correction `c60774ef8` fixing a scope-creep 67 down to the correct +1 bump — legitimate, well-documented, did not touch unrelated files); `system-map.json` `.project.microservices[id=mcp-server].crons` array length = 67 (66→67 confirmed); `docs/standards/cron-jobs.md` has the new cron row (line 80) + job-file pointer (line 87). `FACTORY-SCHEDULER-job-table-registry.test.ts` guard-rail counts (59 entries Group A/B, 81 total Group D) consistent and passing.
8. **PASS** — Forward-preservation e2e. Covered by test 6 ("AC#8: compacted 5m bars survive the existing rolling-24h purge..." — compacts before purge, applies the SAME `DELETE FROM market_prices_history WHERE fetched_at < ?` SQL as `pushPricesHandler.ts`, confirms the archived bar untouched after purge AND after a subsequent compactor run).
9. **N/A to QA** — Board hygiene (`zone` field correction) is dispatcher/router-side per brief §9; QA does not touch `orch-state.json`/`task_board` per hard constraint — router owns epic close.

### Out-of-scope integrity (`git show 392c17f00 de8c49d67 b4224e278 c60774ef8 81ed50626 --name-only`)
Exactly 9 files touched across all 5 commits, all in `apps/mcp-server/src/{infrastructure/db,scheduler,__tests__}/` + `docs/`. `pushPricesHandler.ts` (§1.1 rolling-24h purge) and `checkDuplicatePriceHistory.ts` (W-3, §1.3) do NOT appear in any of the 5 commits' file lists. Cross-checked via `git log --oneline -- <file>`: the most recent commit touching each is `ac8e28a66`/`7b62f73e7` respectively — both predate and are unrelated to this epic. Confirmed untouched.

### DDD / Security
- `intraday5mCompactorJob.ts` imports: `bun:sqlite` + `../../infrastructure/db/schema.js` only — scheduler job calling infra directly, same layering precedent as `ohlcvDailyAggregatorJob.ts`; no domain-layer file touched by this epic (`git show --name-only` confirms zero `domain/`/`application/` files across all 5 commits).
- SQL: 100% parameterized (`.prepare(...).run(a, b, ...)` / `.all()` with positional `?` placeholders) — zero string concatenation with user input in the new job or DDL.
- DI seam clean: `db?: () => Database`, `nowMsFn?: () => number`, both optional with real-world fallback (`getDb()`, `Date.now()`).
- `grep -n "process\.env"` across all touched/new production files → zero matches (`Bun.env` only, per `cronConfig.ts`).
- `grep -n ": any\|<any>\|as any"` on `intraday5mCompactorJob.ts` → zero matches.
- `INSERT OR REPLACE` idempotency confirmed correct by design (full-row overwrite recomputing the complete bucket every run, not a partial merge) and by test 2.

### Verdict
tests: 37 pass / 0 fail / 342 expect() (RAW, independently run, 3-file scoped suite) | tsc: exit 0, 0 errors | AC #1-#8: 8/8 PASS | AC #9: N/A (router-owned) | out-of-scope integrity: PASS | DDD: PASS | security: PASS

**APPROVE.**

### Blocking issues
None.

### Merge / push / board
QA did not push (already pushed + CI-green pre-gate), did not touch `orch-state.json` (.head/.task_board/.signal_queue) or `task:ALPHA-S2`, did not modify any production/SUT file — router owns epic close + umbrella mutex release per dispatch instruction.
