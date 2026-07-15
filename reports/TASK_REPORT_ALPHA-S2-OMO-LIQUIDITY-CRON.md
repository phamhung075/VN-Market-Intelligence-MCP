## Task Report ALPHA-S2-OMO-LIQUIDITY-CRON

**Type:** Single-atomic-FIX merge-gate (final relay hop 4/4, router-orchestrated) | **Impl commit:** ae45fd0e7 (9 files) | **Memory commit:** ee3c79985 | **HEAD after QA flip:** 71f1422ec (origin==local, AHEAD=0) | **Brief:** docs/architecture-briefs/2026-07-15-alpha-s2-omo-liquidity-cron.md

### Delivered
- NEW `apps/mcp-server/src/scheduler/macro/sbvOmoLiquidityCronJob.ts` — `runSbvOmoLiquidityCron(deps?)`, pure trigger+observe cron.
- `cronConfig.ts` — `sbvOmoLiquidityCron: Bun.env.CRON_SBV_OMO_LIQUIDITY ?? '9 9 * * *'`.
- `schedulerJobTable.ts` — `buildJobTable()` entry (`sbvOmoLiquidityCronJob`).
- NEW `apps/mcp-server/src/__tests__/ALPHA-S2-OMO-LIQUIDITY-CRON.test.ts` (5 tests).
- Docs: `docs/data/cron-registry.json`, `docs/data/system-map.json`, `docs/standards/cron-jobs.md`.
- Count-guard bumps: `1190-pipeline-watchdog.test.ts` (`schedulerFileCount` 67→68), `FACTORY-SCHEDULER-job-table-registry.test.ts` (60→61 / 82→83).

### Tests — RAW, independently run
```
bun test src/__tests__/ALPHA-S2-OMO-LIQUIDITY-CRON.test.ts
5 pass / 0 fail / 18 expect() calls [63ms]

bun test src/__tests__/1190-pipeline-watchdog.test.ts
16 pass / 0 fail / 30 expect() calls [206ms]

bun test src/__tests__/FACTORY-SCHEDULER-job-table-registry.test.ts
15 pass / 0 fail / 272 expect() calls [183ms]
```
`bun tsc --noEmit` (apps/mcp-server, standalone): **exit 0**, zero errors.
`bash scripts/audits/mock-guard.sh --files <4 modified production files>`: **PASS**.

### Behavioral gate — branch-by-branch (not just "tests pass")
Read `sbvOmoLiquidityCronJob.ts` in full and cross-checked against brief §3/§4:
- **HARD fail** (`macroFetch` returns `ok:false` — transport/network/deadline): `logger.error` fires, then `notifyBug()` (`sendTelegramBug` by default) is called unconditionally. Test asserts `notifyCallCount===1`, message contains "unreachable" + "sbv_omo_daily did NOT accrue today". Live log line captured during the run: `level:"error" ... macro-indicators /liquidity-state unreachable (network) ...`.
- **SOFT fail** (`omo.is_estimate===true`): `logger.warn` fires (captured: `level:"warn" ... reachable but OMO parse degraded (blocked_reason=...)`), `notifyBug` is **never** called — test asserts `notifyCallCount===0`. Matches DoD #3 exactly (ambiguous no-auction-day case does not manufacture a BUG alert).
- **Success** (`omo.is_estimate===false`): `logger.info` fires (captured: `... sbv_omo_daily row persisted for auction_date=...`), `notifyCallCount===0`, and a structural (non-mock) test greps the compiled source for `getDb`/`.prepare(`/`bun:sqlite`/`schema.js` — zero matches, proving the module has no DB write surface at all, not merely "didn't write in this test run".
- **Extra branch found beyond the 3 brief-mandated ones:** schema-mismatch (payload fails `LiquidityStateResponseSchema.safeParse`) also triggers `logger.error`+`notifyBug` — sensible defensive addition, not scope creep (still inside the HARD-fail-shape family).
- **Bounded deadline:** `deadlineMs ?? 15_000` confirmed — under `withDeadline`'s documented `< 60_000ms` NFR-2 cap, matches `get_vn_liquidity_state`'s own default.

### Reuse verification (no reinvention)
- `macroFetch<T>()` — traced via `git log` to commit `c76a97764` (FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE), pre-dates this task. Not reimplemented.
- `LiquidityStateResponseSchema` — traced to commit `5c2f4f631` (VMT-7), exported from `liquidityStateTools.ts:164`. Not reimplemented, no new DTO.
- `sendTelegramBug()` — imported from `infrastructure/notifiers/telegram.js`, default `notifyBug` wiring, not duplicated.

### DDD / Security
- File imports `../../infrastructure/{fetchers,notifiers,logger}` directly — confirmed this is the established scheduler-layer composition-root convention (byte-matched against sibling `macroIndicatorRefreshJob.ts`, which does the same), not a domain→infrastructure violation (this file is not in `domain/`).
- `grep -n "process\.env"` on the 3 modified production files → zero matches (`Bun.env` only, in `cronConfig.ts`).
- `grep -n "password\|secret\|token"` → zero matches.
- Zero new DDL/tables/schema in either `apps/mcp-server/` or `apps/macro-indicators/` — confirmed via source read + `git show --stat` (no `.go` file, no `CREATE TABLE`).

### DoD 1-9 verification
1. **PASS** — `runSbvOmoLiquidityCron()` calls `macroFetch(baseUrl, "/liquidity-state", {}, {deadlineMs:15_000})`, reused not reimplemented.
2. **PASS** — HARD fail → `sendTelegramBug()`+`logger.error`, every occurrence (test-proven).
3. **PASS** — SOFT fail → `logger.warn` only, `notifyBug` NOT called (test-proven, exact DoD wording match).
4. **PASS** — Success → `logger.info`, no alert, zero local DB write (test-proven by structural source-inspection, not just a passing mock).
5. **PASS** — Zero new tables/DDL in either service.
6. **PASS** — Cron+docs registered in all 3 places (cron-registry.json/system-map.json/cron-jobs.md), `schedulerFileCount` 67→68 consistent in cron-registry.json and both count-guard tests.
7. **PASS** — `1190-pipeline-watchdog.test.ts` bumped 67→68 with dated BUMP comment (16/16 green). Non-blocking nit: the `it("schedulerFileCount === 67", ...)` title string itself was not renamed to 68 — pre-existing codebase pattern (title has never tracked the value since inception at 43, confirmed via `git log -S`), not introduced by this task, does not affect pass/fail.
8. **PASS** — `docs/data/project-stats.json` not in the 9-file commit (git-confirmed); `bun scripts/gen-project-stats.ts --dry-run` shows `toolCount=183`/`cronJobCount=2` unchanged from the committed file. Note: that file's own `schedulerFileCount` field (64) is a dead/uncomputed carry-over — the generator script never recomputes it; it is a distinct field from `cron-registry.json`'s own `schedulerFileCount` (68, the one actually asserted by the test suite).
9. **PASS** — Board `zone` already `"apps/mcp-server/"` (confirmed live in orch-state.json), not `"multi"`.

### Non-blocking observation (pre-existing, not introduced by this task)
`docs/data/system-map.json`'s `.project.microservices[id=mcp-server].crons` array length (69) carries a stable +1 offset vs `cron-registry.json`'s `schedulerFileCount` (68) — this offset already existed before this commit (68 vs 67) per `git show ae45fd0e7~1`, so this task's +1/+1 bump correctly preserves a pre-existing SSOT drift rather than introducing a new one (same invariant flagged by qa cycle-455 on the sibling epic).

### Verdict
tests: 5+16+15 = 36 pass / 0 fail / 320 expect() (own RAW run) | tsc: exit 0 | mock-guard: PASS | DDD: PASS | security: PASS | DoD 1-9: 9/9 PASS

**APPROVED, DONE_VERIFIED.**

### Board flip
Row `ALPHA-S2-OMO-LIQUIDITY-CRON` moved `task_board.in_progress[]` → `task_board.done_verified[]` via `jq`+`scripts/orch-apply.sh` (`orch-conservation-check` PASS, `task_total=577` both sides, `in_progress` 1→0, `done_verified` 42→43). Fields set: `status:"DONE_VERIFIED"`, `verified_at`, `verified_by:"qa"`, `commit:"ae45fd0e7"`, `merge_gate:"APPROVED"`. `.head`/`.task_board.head` set to idle (`active_task_id`/`next_agent`→null) — this task was the active head. Committed `71f1422ec` (explicit pathspec: `docs/data/orch/orch-state.json` only) and pushed — pre-push `tsc` gate green, `origin/main==71f1422ec` (AHEAD=0).

Did NOT claim/heartbeat/release the umbrella chain-mutex `task:ALPHA-S2-OMO-LIQUIDITY-CRON` — router-owned, releases after this relay confirmation. Unblocks `ALPHA-S4-REGIME-GATE-V1`.
