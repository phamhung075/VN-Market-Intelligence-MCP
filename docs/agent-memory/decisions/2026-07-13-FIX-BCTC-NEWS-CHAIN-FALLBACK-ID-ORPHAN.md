# Decision Journal — FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN

**task-id:** FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN
**date:** 2026-07-13 (dev-team cron tick 08:37Z closeout)
**dispatcher:** dev-team router → BOUNDED-1 auto-pickup → dev-mcp-server (code) → qa (merge gate)
**status:** REVIEW / qa_code_passed=true / deploy_pending=true (rides the user-gated mcp-server rebuild batch; NOT done_verified until ops post-verify)

## Context
S/high, zone `apps/mcp-server/`, owner `dev-mcp-server`, `next_agent=null`, dep-free, no `backlog-detail.json` entry. BOUNDED-1 dry-run picked it on the 08:37Z idle-head tick; **withhold-gate cleared** — clean dev-owned pick (owner=dev-mcp-server; zone→correct specialist via zone-detect despite null next_agent; committed base; no board/detail divergence). This is the "lane working as designed" case, contrasted with the prior tick's non-dev-owner mis-route that was correctly withheld. Promote+claim (backlog→ready→in_progress, head active, commit `e45589363`, conservation 507→507), then hand-dispatched dev-mcp-server.

## The bug
`tryNewsChainFallback()` (`apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts`) — the SECOND `financial_reports` write call-site — used `INSERT OR REPLACE` with a fresh `randomUUID()` each run. `financial_reports` has `UNIQUE(action_code, sort_key)`; `INSERT OR REPLACE` resolves the conflict by DELETE-then-INSERT, minting a NEW `id` and orphaning child FK rows (`bctc_layout_units`, `bctc_page_zones`) on any re-run. Same class D1 already fixed in `parseBctcReport.ts::storeReport()`.

## Decision
Code fix, faithful D1 replication (commit `727648e6a`, 3 files):
1. **id-preserving pre-check** — `SELECT id FROM financial_reports WHERE action_code=? AND sort_key=?`; `const reportId = existingReportRow?.id ?? randomUUID()`; `id: randomUUID()` → `id: reportId`.
2. **SQL upsert** — `INSERT OR REPLACE INTO financial_reports` → `INSERT … ON CONFLICT(action_code, sort_key) DO UPDATE SET <all 64 non-key columns>` with `id` deliberately ABSENT from the SET clause, so the existing row id survives.
3. New behavioral test `FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.test.ts` (id stability across two runs; seeded child `bctc_layout_units` row stays joinable; exactly-one row; distinct sort_key → own id). Doc note in `usecases.md`.

## Verification
**Router RAW pre-gate** (not badge-trusted): commit `727648e6a` on HEAD above the claim `e45589363`; exactly 3 files (`newsChainFallback.ts` +97/-3, new test +169, `usecases.md` +15); no code/DB/orch/peer beyond those; diff-confirmed `INSERT OR REPLACE` removed and `ON CONFLICT … DO UPDATE` with id absent from SET.

**QA merge gate** (own re-run, verdict PASS — `reports/TASK_REPORT_FIX-BCTC-NEWS-CHAIN-FALLBACK-ID-ORPHAN.md`):
- Targeted + sibling suites: 13 pass / 0 fail (62 expect, 3 files). Wider sweep of all 20 suites importing `newsChainFallback`/`fetchParseAndStoreBctc`: 170 pass / 2 skip / 0 fail (446 expect).
- `bun tsc --noEmit`: exit 0. mock-guard: PASS. DDD golden-rule: PASS (only `application/usecases/bctc/` touched, no new domain imports). Security: PASS.
- Upsert correctness read directly from `git show`: `INSERT OR REPLACE` 0 occurrences; `ON CONFLICT(action_code, sort_key) DO UPDATE SET` enumerates all 64 non-key columns, `id` absent.
- Full-suite disposition (MODIFY-not-additive, so new-failure check mandatory): partial capture 21,461 lines / 234 files, 31 `(fail)` lines ALL in the known pre-existing/unrelated set (pollNews, News Polling Job, telegram routing, push-news VPS/`logVpsPush`, insider transactions, get_company_profile, record_signal_outcome, daily-foreign-flow view); `grep -aiE "newschainfallback|financial_reports"` on fail/error lines → 0 hits. Zero changed-domain regression.

## Deploy
CODE fix in mcp-server → takes effect ONLY on rebuild. Becomes the **4th member** of the existing user-gated off-market `docker compose up -d --build mcp-server` batch, joining `599f4aee0` (OHLCV-backfill-done), `1bbc8cead` (startup-candle-guard), `252f8ffd1` (FIX-MCP-BOOTSTRAP projectRoot). Do NOT self-deploy. On rebuild → ops post-verify → REVIEW→done_verified for all four. Deploy remains user-gated per standing policy.

## Follow-up
- Sibling `SPIKE-BCTC-REPARSE-CADENCE-GUARD-ROOTCAUSE-VERIFY` (dev-mcp-server) still parked in backlog for a later BOUNDED-1 tick.
- Class note: this is the 2nd `INSERT OR REPLACE` id-orphan call-site fixed (D1 was `parseBctcReport.ts`, this is `newsChainFallback.ts`). If a 3rd call-site surfaces, consider a shared id-preserving `upsertFinancialReport()` helper rather than a 3rd point-fix.
