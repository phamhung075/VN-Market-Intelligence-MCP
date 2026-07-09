# Decision Journal — FIX-CI-240-PRICE-PIPELINE-RNG-GUARD-STRADDLE · dev-mcp-server

**Note:** no wrapping "sprint" board entry exists for this task (it is a standalone
FIX dispatched directly by po off a recurring CI-red signal, not a multi-unit
sprint) — this is an ad-hoc single-task decision journal, filed under the
`sprint-*` naming convention per the same DJ-GATE-1 fallback rule used by
`sprint-FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.md`.

**Task goal:** Eliminate a ~5% probabilistic CI flake in
`240-price-pipeline-recovery.test.ts` AC-1 caused by the synthetic-fixture
`fetchOhlcvData` stub (production file
`apps/mcp-server/src/domain/services/priceBackfillService.ts:217`) generating
`basePrice = 100 + Math.random()*20`, `low = basePrice - 1` — ~5% of runs land
`low` in `[99,100)`, below `STOCK_MIN_VND=100`, so `validateOhlcvUnit` Rule 2
guard-rejects the row via `continue` BEFORE the `INSERT OR IGNORE`. When the
rejected row is the pre-seeded 2026-03-27 duplicate fixture, `rowsSkipped`
drops below 1 and `expect(result.rowsSkipped).toBeGreaterThanOrEqual(1)` flakes.
**Agent:** dev-mcp-server
**Started:** 2026-07-09T12:00Z (router/po dispatch, 2nd confirmed CI-red
recurrence this session — f61f78475, 6dc8a9421)

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-09

**task-id:** FIX-CI-240-PRICE-PIPELINE-RNG-GUARD-STRADDLE

**what-done:**
- Changed `basePrice = 100 + Math.random() * 20` → `basePrice = 200 +
  Math.random() * 20` in the private `fetchOhlcvData` stub
  (`priceBackfillService.ts:217`). `low = basePrice - 1` now ranges
  `[199, 219)` — always >= 199, permanently clear of `STOCK_MIN_VND=100` with
  ~2x margin. No other field (`open`, `high`, `close`) or code path changed.
  Added an inline comment recording the root cause and fix rationale so a
  future reader does not reintroduce the straddle.
- Verified `normalizeOhlcvToVnd("stock", …)` is still a no-op at the new
  range (`mag` = 200-240, well above the `mag < STOCK_MIN_VND` thousand-scale
  trigger) — unchanged behaviour vs. the old 100-140 range, just shifted
  safely away from the floor. HILO ratio (`high/low` ≈ 1.06) and plausibility
  (`low <= open/close <= high`) rules also unaffected — same shape,
  different absolute magnitude.
- Updated two stale comments in the sibling test file
  `TASK-OHLCV-WIC-1-writer-f-guard.test.ts` that explicitly documented the
  now-fixed 100-120 straddle-prone range (one even said "BUT basePrice can be
  100.0 exactly and low = basePrice-1 = 99.0 < STOCK_MIN_VND=100" — a
  landmine if left in place describing a bug that no longer exists). No
  assertions in this file depend on the specific numeric range (all checks
  are on `errors`/`tickersProcessed`/`typeof rowsInserted` etc.), so this was
  a comment-only edit, verified by grep before touching.

**what-considered:**
1. (Chosen) `basePrice = 200 + Math.random()*20` — minimal, single-line
   production-code diff, `low` floor moves from 99 (unsafe) to 199 (safe with
   ~2x margin). Zero behavioural change to any guard/normalize path since
   both old and new ranges are already `>= STOCK_MIN_VND` in the common case
   — only the crash-adjacent edge (`basePrice` landing in `[100,101)`) is
   eliminated.
2. Seed the RNG deterministically (e.g. `mulberry32` fixed seed) — rejected
   as unnecessary extra surface area for a fixture whose only job is "produce
   plausible, always-valid OHLCV"; a wider base range achieves the same
   determinism-of-outcome (never straddles the floor) with a 1-line diff
   instead of introducing a new PRNG dependency.
3. Inject a fetcher so tests can supply fixed OHLCV data — rejected as
   scope-creep per po's triage note (task explicitly flagged this as
   out-of-scope); `fetchOhlcvData` is a non-exported stub and
   `240-price-pipeline-recovery.test.ts` only imports `backfillPrices` with
   no injection seam — building one is a larger structural change than this
   FIX ticket calls for.

**why-decision:** Option 1 directly targets the confirmed root cause (RNG
range straddling a hard floor) with the smallest possible diff, no new
dependencies, and no behavioural change outside the eliminated edge case.
Matches po's own "recommended minimal fix" in the backlog row's status_note.

**verification:**
- `bun tsc --noEmit` (apps/mcp-server): clean, 0 errors.
- Target file alone, 20 consecutive `bun test` runs
  (`src/__tests__/240-price-pipeline-recovery.test.ts`): 13 pass / 0 fail on
  every single run (0/20 failures) — vs. the pre-fix ~5%-per-run flake this
  is a strong signal the straddle is eliminated (not just "got lucky once").
- Target file + sibling `TASK-OHLCV-WIC-1-writer-f-guard.test.ts` (the only
  other test importing `priceBackfillService`), 20 consecutive runs: 21 pass
  / 0 fail every run.
- Broader targeted-domain suite (all tests referencing `backfillPrices` or
  `STOCK_MIN_VND`: `240-price-pipeline-recovery`,
  `TASK-OHLCV-WIC-1-writer-f-guard`, `CONTAM-5-ohlcv-sanity-check`,
  `CONTAM-7-ohlcv-unit-contam-integration`,
  `FIX-OHLCV-SEED-CANDLE-UNIT-SCALE`, `OHLCV-WHOLEROW-LT1000-sanity-pass4`,
  `TASK-VNINDEX-RS-B-durability`, `unit/ohlcvUnitGuard`) run together:
  144 pass / 1 fail / 1 error / 408 expect() calls. Confirmed via `git
  stash`/`stash pop` A-B comparison that this EXACT 1-fail/1-error signature
  is byte-identical with and without this change — the single error is a
  pre-existing, unrelated `SyntaxError: Export named 'getVpsProxyHealth' not
  found in module vpsPushLogStore.ts` cross-file module-loading issue in
  `TASK-VNINDEX-RS-B-durability.test.ts` (which passes 9/9 clean when run
  standalone) — not caused by and not related to `priceBackfillService.ts`.
  Zero regression attributable to this change.
- Full repo `bun test` (entire suite) attempted for extra corroboration
  beyond AC-3's required scope ("the broader targeted suite this area
  touches", already fully covered above): 1st invocation hit an unrelated
  Bun 1.3.13 runtime panic (`panic(main thread): A C++ exception occurred`)
  mid-run. 2nd invocation completed cleanly: **14419 pass / 40 skip / 61
  fail / 6 errors / 45345 expect() calls across 1184 files** (586s), well
  under the documented `testBaselineFail=348` ceiling referenced by prior
  commits — then hit the SAME post-run Bun panic on process exit/cleanup
  (after the results were already printed; a known Bun 1.3.13 stability
  issue on this machine, unrelated to any test outcome). Enumerated all 61
  `(fail)` test names: zero reference `240-price-pipeline-recovery`,
  `TASK-OHLCV-WIC-1-writer-f-guard`, or `priceBackfillService` — every
  failure is elsewhere (several map to the same pre-existing
  `vpsPushLogStore.ts`/`getVpsProxyHealth` export issue identified above:
  `VPS Proxy Health`, `FIX 2 — logVpsPush`, `Task 1858c — logVpsPush`, `Task
  1193 — push-prices upsert`, `1892a — handlePushNews`; the rest are
  pre-existing 5000ms-timeout flakes in unrelated MCP-tool/news-poller
  suites). Confirms zero regression from this change across the entire
  suite, not just the targeted domain.

**push verification:** commit pushed to origin/main; `git rev-parse HEAD` ==
`git rev-parse origin/main` confirmed post-push (see commit trailer/report
for exact SHA).
