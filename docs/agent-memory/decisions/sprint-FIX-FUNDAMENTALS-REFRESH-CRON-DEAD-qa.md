<!-- decision-journal: task FIX-FUNDAMENTALS-REFRESH-CRON-DEAD + FIX-VNSTOCK-FUNDAMENTAL-RATELIMIT QA gate -->
# Decision Journal — FIX-FUNDAMENTALS-REFRESH-CRON-DEAD + FIX-VNSTOCK-FUNDAMENTAL-RATELIMIT QA

**task-id:** FIX-FUNDAMENTALS-REFRESH-CRON-DEAD
**task-id:** FIX-VNSTOCK-FUNDAMENTAL-RATELIMIT
**agent:** qa
**date:** 2026-06-14
**verdict:** APPROVED

## Entry qa-S1

**what-considered:**
- G1 SCRIPT COVERAGE: 11 Python script templates in vnstockBridge.ts. EVENTS_SCRIPT (line 841) had banner suppression pre-existing (Task 1780 pattern). 10 new scripts patched in commit c35db4fc: PRICE_SCRIPT, FINANCE_SCRIPT, TRADING_STATS_SCRIPT, OFFICERS_SCRIPT, SHAREHOLDERS_SCRIPT, INTRADAY_SCRIPT, ORDER_BOOK_SCRIPT, BALANCE_SHEET_SCRIPT, CASH_FLOW_SCRIPT, NEWS_SCRIPT. Each uses `_real_stdout = sys.stdout; sys.stdout = _io.StringIO()` in try/finally before all Vnstock() + API calls. All 11 of 11 templates covered — no script was missed.
- G2a TARGETED TEST: bun test src/__tests__/fix-fundamentals-refresh-cron-dead.test.ts → 12 pass / 0 fail / 23 expect() calls / 122ms.
- G2b FENCE-FALSE-GREEN: TC-1 (VNSTOCK_BANNER → isRateLimitResponse=true) and TC-7 (box-drawing banner → junk=true/isNull=true) directly prove the old broken path. If SUPPRESS_BANNER/RESTORE_STDOUT were no-ops, the banner would still reach runPython stdout, isRateLimitResponse would return true, and all financials would still return null. TC-3 (clean JSON → isRateLimitResponse=false) and TC-6 (clean JSON → junk=false, cleaned=JSON) prove the post-fix happy path. TC-10/11/12 assert SUPPRESS_BANNER contains `_sys.stdout = _io.StringIO()` and RESTORE_STDOUT contains `_sys.stdout = _real_stdout` — injected in every script template. Tests are non-vacuous; they would catch a revert.
- G2c FULL SUITE: bun test (all 1074 test files) → exit code 0. 28-29 (fail) lines observed — ALL pre-existing failures in unrelated test files (1858c, 1892a, 1875c, 1146, 235, 293, 102, TSU-DEV-U5, AC-2b). Commit c35db4fc touches exactly 2 files: vnstockBridge.ts + fix-fundamentals-refresh-cron-dead.test.ts. None of the failing test files were modified by this commit. Pre-existing failures confirmed by git log showing oldest (87368da6 = 2026-05-08, 73d4dd58 = 2026-05-11) precede this fix commit (2026-06-14 01:22:45).
- G3 TSC: bun tsc --noEmit → exit 0, 0 errors.
- G4 LIVE DB: named volume `vn-market-intelligence-mcp_market_data` queried via keinos/sqlite3 sidecar. vnstock_financials rows: VCB fetched_at=2026-06-13 23:19:47 (was 2026-04-15 before), ACB fetched_at=2026-06-13 23:19:08 (was 2026-04-14 before). Max(fetched_at)=2026-06-13 23:39:32, showing cron continued running post-deploy. 92 total rows, oldest 2026-04-08, newest 2026-06-13. Gap from 2026-04-15 to 2026-06-13 is confirmed closed. Live evidence is from the named-volume DB, not the host ./data decoy.
- G5 DDD: vnstockBridge.ts is infrastructure/fetchers layer. It imports from domain/utils/ansiUtils.js and domain/models/ (type imports only — permitted). No domain→infra imports. PASS.
- G6 SECURITY: no process.env usage (empty grep). No hardcoded secrets/passwords/tokens (file is all Python subprocess templates + TS orchestration). No SQL in this file. PASS.
- G7 MOCK-GUARD: bash scripts/audits/mock-guard.sh --files "apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts" → EXIT 0, "no fabricated-data patterns found".
- G8 ROOT CAUSE CLARITY: "rate limit" in FIX-VNSTOCK-FUNDAMENTAL-RATELIMIT was a false positive — vnstock v4 banner (box-drawing chars ╭╮│) was detected by BOX_DRAWING_RE in isRateLimitResponse(). Same root cause as FIX-FUNDAMENTALS-REFRESH-CRON-DEAD. One commit resolves both.
- BCTC eval: not applicable (no BCTC report touch).

**why-change:** "no change from plan — all gates green. Script coverage complete (11/11). Tests non-vacuous (banner-detection path directly tested). Full suite exit 0 (pre-existing failures pre-date this commit). Live DB writes confirmed in named-volume. Root cause correctly identified and fixed."

**decision:** APPROVED — merge both tasks to DONE
