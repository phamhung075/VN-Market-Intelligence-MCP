## Task Report ALPHA-S1-STARTUP-CANDLE-GUARD

**Sprint:** FLOW-PRICE-ALPHA-LOOP (wave-1) · **Commit:** `1bbc8cead` (already on `main` — no-branch convention)
**Reviewed:** 2026-07-13T06:1xZ by qa · **Coordination session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3

changed:
- `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` — additive exports `shiftDateDays()`, `mostRecentTradingDayOnOrBefore()` (bounded 14-day backward walk over existing `isVnTradingDay`)
- `apps/mcp-server/src/application/usecases/recoverMissingOhlcvSession.ts` (NEW) — idempotent no-op guard → tick-survival probe → re-aggregate (via existing aggregator's injectable `nowMsFn`) OR trigger VPS-relay (`ohlcv_backfill_queue` insert, dedup on pending row)
- `apps/mcp-server/src/scheduler/market-data/ohlcvCandleGuard.ts` (NEW) — `runOhlcvCandlePresenceGuard()`, calendar-aware presence check + fail-loud catch-up trigger
- `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` (edited) — trailing self-heal call via dynamic import (breaks static 3-node cycle)
- `apps/mcp-server/src/scheduler/startScheduler.ts` (edited) — startup call site (static import, same phase as existing `runOhlcvStartupProbe`)
- `apps/mcp-server/src/__tests__/ALPHA-S1-STARTUP-CANDLE-GUARD.test.ts` (NEW, 14 cases)

Notebook/journal commit `9cb981eec` is separate — not part of this code gate.

### RAW test results (re-run by qa, not trusted from dev's reported 14/0 + 93/93)
```
bun test ALPHA-S1-STARTUP-CANDLE-GUARD.test.ts                          →  14 pass / 0 fail (39 expect calls) — matches dev claim
bun test 1358/1368/1374-ohlcv-aggregator*.test.ts (mandated regression)  →  11 pass / 0 fail (per-file: 5+4+2)
bun test FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0.test.ts                →   6 pass / 0 fail
bun test DWF-is-trading-day.test.ts                                     →  13 pass / 0 fail
bun test ohlcv-backfill-done-subtask-b.test.ts                          →   8 pass / 0 fail
  mandated-scope subtotal                                               →  38 pass / 0 fail
extra corroboration (5 more dev-cited suites, not in mandate, run anyway):
  CONTAM-7 / PRED-RESOLVER-GAP-FIX / 1277+1551-guard-checks /
  1390-volume-unit / 1421-diacritics                                    →  91 pass / 0 fail
TOTAL (12 files, RAW)                                                   → 143 pass / 0 fail
bun tsc --noEmit (apps/mcp-server)                                      →  0 errors (~22s)
```
Full 1199-file suite intentionally NOT run — VN market OPEN at review time; targeted+regression+tsc only, per dispatch constraint. Test file uses its own in-memory `bun:sqlite` DB per group (no `createBunServer`/HTTP server needed — neither function under test is a route).

### DDD / security / mock-guard
- `domain/services/vnTradingCalendar.ts`: grep confirms **zero** imports from `infrastructure/`/`application/` — golden rule intact, pure additive functions.
- mock-guard: `bash scripts/audits/mock-guard.sh --files "<5 changed files>"` → PASS, exit 0.
- Security: no `process.env`, no hardcoded secrets in the changed files. Bound-param SQL only (`.prepare(...).get(date)` / `.run(...)`) — no string-concatenated queries.

### Item (a) — DDD deviation: application → scheduler import
`recoverMissingOhlcvSession.ts` (application/usecases) imports `runOhlcvDailyAggregator` from `ohlcvDailyAggregatorJob.ts` (scheduler layer). Read `docs/handoffs/ALPHA-S1-architect-design.md` §1 — the architect's own illustrative code block (lines 145-153 of the design doc) does exactly this: `const aggregatorResult = await runOhlcvDailyAggregator({ db: () => db, nowMsFn: () => midSessionMs, sendWorkFn: async () => {} });` inside the architect-authored `recoverMissingOhlcvSession` snippet. **CONFIRMED SANCTIONED** — matches the design verbatim, not a new unsanctioned coupling. **VERDICT: ACCEPT as approved deviation**, noted (not blocking).

### Item (b) — dynamic import / residual runtime cycle
Static-import graph: `ohlcvCandleGuard.ts` → `recoverMissingOhlcvSession.ts` → `ohlcvDailyAggregatorJob.ts`. The only would-be back-edge (`ohlcvDailyAggregatorJob.ts` → `ohlcvCandleGuard.ts`) is `import type { OhlcvCandlePresenceGuardResult }` — type-only, erased at compile time, zero runtime module reference (confirmed via grep — literal `import type` keyword used). The runtime edge is deferred via `await import("./ohlcvCandleGuard.js")` inside the trailing-call closure, executed only at call-time, well after module instantiation.
Independently verified with a standalone script importing all 3 modules in **both** orders (aggregator-first, and guard-first) — all three exported functions resolved to `typeof "function"` in both cases (no TDZ/`undefined` symptomatic of a real circular-require break). **VERDICT: CONFIRMED — no residual runtime import cycle.**

### Item (c) — architect-snippet arithmetic bug fix
Traced `ohlcvDailyAggregatorJob.ts`'s own window: `windowStart = vnMidnightUtcMs(nowMs)`, `windowEnd = nowMs` (i.e. `[vnMidnight, nowMs)`). The architect's illustrative `nowMs = vnMidnightUtcMs + 5h` resolves to VN-local 05:00 — **before** the 09:00 ICT market open, meaning `windowEnd` would fall entirely within the pre-market dead period; in the worst case (no ticks before market open) this yields a **zero-tick window**, not merely a truncated one — worse than the dev's own characterization, same practical conclusion. Dev's fix uses `windowEndMs = vnNextMidnightUtcMs - 1` (last ms of the VN day), giving the aggregator the full `[vnMidnight, nextVnMidnight)` window.
Test **REC-2** seeds 3 ticks including one at `2026-07-10T08:30:00.000Z` (VN local ~15:30 ICT, i.e. genuinely late-session/near-close) and asserts `row.close === 83000` (the value of that late tick). Under the architect's original snippet this tick would fall outside the (buggy) window and never be captured. **VERDICT: CONFIRMED — REC-2 asserts the full-day window, and the fix is correct.**

### Item (d) — pre-existing `getVpsProxyHealth` SyntaxError
Ran the guard's own suite (14/14) and all mandated + extra regression suites (129 more tests, 12 files total, 143/0) — **the flake never surfaced in any combination I ran**. Independently corroborated as a pre-existing, previously-documented flake unrelated to this task via two prior, unrelated decision journals: `docs/agent-memory/decisions/sprint-FIX-CI-240-PRICE-PIPELINE-RNG-GUARD-STRADDLE.md` and `docs/agent-memory/decisions/sprint-FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0-qa.md` (the latter a QA journal from an earlier, unrelated sprint, already flagging this exact `getVpsProxyHealth` export SyntaxError as pre-existing/disjoint). **VERDICT: CONFIRMED pre-existing — not attributable to this task; the guard's own scope is clean of it.**

### Fail-loud verification (not swallowed) — test G-5
`recoverFn` throws → `runOhlcvCandlePresenceGuard` rejects with the **same** error message (`"boom: DB unreachable"`), confirmed via `expect(...).rejects.toThrow(...)`. Code-path confirms `sendTelegramBug(...)` is called unconditionally inside the `catch` block **before** `throw err;` (not conditionally skipped). `sendTelegramBug` itself never throws (verified in `telegram.ts` — dedup-check wrapped in its own try/catch, `coreSend` failure returns `0` rather than throwing), so awaiting it cannot mask the re-throw. **No swallowing — this would have been a BLOCKER if found; it was not.**

Separately: the trailing call site inside `ohlcvDailyAggregatorJob.ts` **deliberately** swallows the guard's rejection (`try { await candleGuardFn(...) } catch (err) { console.error(...) }`) — this is an intentional, different, and documented contract (avoid mis-recording a successful aggregation run as `cron_job_runs` error; the guard already escalated via Telegram BUG internally before rethrowing). Confirmed via the 6 aggregator/regression test files — each run logs `[ohlcv-aggregator] trailing candle-guard error (non-fatal to aggregator): no such table: ohlcv_backfill_queue` (their fixture DBs lack the new-to-them `ohlcv_backfill_queue` table) but every test still passes — the trailing hook's own contract of "never break the caller" holds even against a genuine missing-table error, and this table exists via production schema migration so this is a test-fixture-only artifact, not a production risk.

tests: 143 pass / 0 fail (RAW, targeted+regression, 12 files) | tsc: 0 errors | ddd: PASS (1 approved deviation, see item a) | security: PASS | mock-guard: PASS

### Verdict: PASS (code) — **DEPLOY-REQUIRED, not serving-verified**

Code is committed to `main` (`1bbc8cead`) and behaviorally green (calendar-skip weekend+holiday confirmed via CAL-1/CAL-2/G-1/G-4; genuine-gap catch-up confirmed via G-2 — recoverFn called exactly once, `expectedDate` always a real trading day; fail-loud confirmed via G-5), but the running `mcp-server` container has **not** been rebuilt. Per dispatch: QA does not deploy (`docker compose up -d --build mcp-server` is user/ops-gated and market-sensitive — VN market is open). Row held in **REVIEW** (not flipped to `done`/serving-verified) with `qa_code_passed:true` + `deploy_pending:true` + resolution note `CODE_VERIFIED_DEPLOY_PENDING`. Dispatcher should batch this with sibling `599f4aee0` (`ALPHA-S1-OHLCV-BACKFILL-DONE-BUG`, already `CODE_VERIFIED_DEPLOY_PENDING`) into one off-market rebuild.

Board write: `docs/data/orch/orch-state.json` via `scripts/orch-apply.sh` (task_total conservation verified: live=505, candidate=505). `.head` left untouched (dispatcher-owned).
