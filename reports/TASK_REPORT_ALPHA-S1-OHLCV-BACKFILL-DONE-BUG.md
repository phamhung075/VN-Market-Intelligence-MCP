## Task Report ALPHA-S1-OHLCV-BACKFILL-DONE-BUG

**Sprint:** FLOW-PRICE-ALPHA-LOOP (wave-1) · **Commit:** `599f4aee0` (already on `main` — no-branch convention)
**Reviewed:** 2026-07-13T05:41:26Z by qa · **Coordination session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3

changed:
- `apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts` (`handleOhlcvBackfillDone`) — inserted-count verification step, mutual-exclusion with existing depth probe
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` — nullable `ohlcv_backfill_queue.bars_inserted` column, idempotent `ALTER TABLE` (same guard idiom as existing `retry_count` migration)
- `apps/mcp-server/src/__tests__/ohlcv-backfill-done-subtask-b.test.ts` — new BT-6/BT-7/BT-8
- `apps/mcp-server/src/__tests__/1360-ohlcv-backfill-queue.test.ts` — TC-6 updated (old assertion asserted the buggy silent-success assumption)

### RAW test results (re-run by qa, not trusted from dev's reported 109/109)
```
bun test src/__tests__/ohlcv-backfill-done-subtask-b.test.ts   →  8 pass / 0 fail (38 expect calls)
bun test src/__tests__/1360-ohlcv-backfill-queue.test.ts       →  9 pass / 0 fail (21 expect calls)
combined run (both files together)                              → 17 pass / 0 fail (59 expect calls)
bun tsc --noEmit (apps/mcp-server)                              → 0 errors (~22s)
```
Full 1199-file suite intentionally NOT run — VN market OPEN at review time (Mon ~05:4x UTC, trading hours 02:00-08:00Z), live container holds :3000; targeted+tsc only per dispatch constraint. Tests use `createBunServer({ port: 0 })` (in-process, random free port) — confirmed no `:3000` bind conflict with the live container.

### DDD / security / mock-guard
- DDD: `grep "from.*infrastructure\|from.*application"` on both modified files → matches are the handler's pre-existing imports (`infrastructure/logger.js`, `infrastructure/notifiers/telegram.js`, `application/usecases/ohlcvWriteService.js`) — interface layer importing infra/application is the allowed direction; diff confirms **zero new import lines** added by this commit. `domain/` untouched — no domain→infrastructure violation.
- Security: `process.env` grep → clean. `password\|secret\|token` grep → clean. All queries parameterized (`.prepare(...).run(barsPushedTotal)`, bound params only) — no string-concatenated SQL.
- mock-guard: `bash scripts/audits/mock-guard.sh --files "..."` → PASS, exit 0.

### Error-path verification (graceful-premise: verified the failure path, not just happy path)
Re-ran BT-6/BT-7/BT-8 myself and read the assertions:
- **BT-6** (`bars_pushed_total:0`): closed row gets `bars_inserted=0` (persisted, not swallowed) + exactly ONE new `done=0, retry_count=1` row inserted; depth-probe correctly did NOT independently re-fire (`pending_after===1`, not 2).
- **BT-7** (empty body / `barsPushedTotal:null`, no shallow watchlist code seeded): re-queues anyway (`bars_inserted=NULL`, new `retry_count=1` row) — proves a full-universe zero-insert failure is caught even when watchlist depth alone looks healthy (the exact gap class this task exists to close).
- **BT-8** (`bars_pushed_total:0`, `retry_count=5` already): cap reached → escalate branch, **no new queue row** (`rows.length===1`), `sendTelegramBug` fires exactly once (confirmed via live log line `insert-count retry cap reached (>=5), escalating to BUG` appearing once per cap event in the RAW run, no duplicate).
- `done` still flips unconditionally on every call (all failure-path tests assert `rows[0].done===1`) — by design, preserves `vn-ohlcv-backfill.timer` poller's documented "regardless of exit code" unblock contract; the fix re-queues via a NEW row instead of gating the original row's `done`.
- Schema ALTER is idempotent (PRAGMA `table_info` column-existence guard, same idiom as the existing `retry_count` migration) — no data loss, nullable column.

tests: 17 pass / 0 fail (targeted, RAW) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS

### Verdict: PASS (code) — **DEPLOY-REQUIRED, not serving-verified**

Code is committed to `main` (`599f4aee0`) and behaviorally green, but the running `mcp-server` container has **not** been rebuilt — the fix is not live. Per dispatch: QA does not deploy (`docker compose up -d --build mcp-server` is user/ops-gated and market-sensitive — VN market is open). Row is held in **REVIEW** (not flipped to `done`/serving-verified) with `qa_code_passed:true` + `deploy_pending:true` + resolution note `CODE_VERIFIED_DEPLOY_PENDING`. Full `DONE_VERIFIED` is deferred to post-deploy serving verification (live `get_price_history`/`ohlcv_backfill_queue.bars_inserted` non-NULL check per `docs/handoffs/ALPHA-S1-architect-design.md` § Shared verification gate).

Board write: `docs/data/orch/orch-state.json` via `scripts/orch-apply.sh` (see commit SHA in RETURN block). `.head` left untouched (dispatcher-owned).
