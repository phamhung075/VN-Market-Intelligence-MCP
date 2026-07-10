# dev-mcp-server -- Notebook

## 2026-07-09 — FIX-FOREIGN-FLOW-COVERAGE → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (dev-team dispatch)

Root cause (AUDIT-FC-FOREIGN-FLOW-recon.md): CODES sent to `bgapidatafeed.vps.com.vn/getliststockdata/<CODES>` were built only from watchlist DB + `mcp.config.json` referenceStocks (~111 codes) → ~1457 of ~1569 daily_ohlcv traded tickers permanently carried `foreign_net_vol=NULL`. Added `GET /api/ohlcv-codes` (`ohlcvBackfillHandler.ts` new `handleOhlcvCodes` — `SELECT DISTINCT code FROM daily_ohlcv`, no hardcoded list, generic_mandate-compliant) and wired it into `server.ts`. Updated `vps-scripts/fetch-foreign-flow.sh` to source CODES from `/api/ohlcv-codes` first, falling back to `/api/watchlist` — mirrors `fetch-ohlcv-backfill.sh`'s pre-existing R-2 fallback pattern, which had ALREADY been calling `/api/ohlcv-codes` and silently falling back every cycle because the endpoint was never implemented server-side (confirmed dormant 404 in `docs/vps-sources/ohlcv-backfill-pipeline-stall/recon.md`) — this fix closes that gap too, for free.

money_terms_elevated half of the task (fBValue/fSValue → foreign_buy_value/foreign_sell_value columns, VND tỷ đồng served via `get_foreign_flow`) was already shipped 2026-06-16 (commit ddc36452e) — verified live via `docker exec` query against the running mcp-server container (columns present, populated). No new work needed there; `foreign_net_value` is derived on read (buy−sell), not a stored column — matches the "no derived-column duplication" pattern used elsewhere.

Deliberately did NOT widen `/api/watchlist` itself — that endpoint is also consumed by `fetch-prices.sh`'s per-minute price fetch (unrelated pipeline); widening it would have ballooned that CODES list as an unintended side effect. Separate endpoint keeps the fix scoped to the actual bug.

RAW-verified the single-call design against the real API (off-market-hours, non-VPS host): 1459 live distinct daily_ohlcv codes → HTTP 200, 1400 items returned, ~1.2MB, ~7s, ends with `]` (no truncation) — confirms recon's "no pagination" claim at full scale, not just the 111-code sample it was originally checked against. Bumped `PAYLOAD_SIZE_THRESHOLD` 50000→3,000,000 and the bgapidatafeed fetch timeout 60s→90s to match the ~13x larger payload (avoids WARN-log spam on the new normal size).

New `FIX-FOREIGN-FLOW-COVERAGE.test.ts` (5 tests, TDD RED→GREEN): auth guard, empty-DB, full-universe coverage sorted, DISTINCT dedup across dates, and the exact non-watchlist-code scenario this task fixes. Targeted suite (foreign-flow + ohlcv-backfill, 9 files) 78/78 pass. tsc clean. toolCount=183 unchanged (HTTP route, not an MCP tool). Server-boot probe clean (health 200, new route 401-no-auth as expected), `bctc-inspect`/`news-fetch` dashboard circular-dep probes clean. shellcheck clean on all new script lines.

Doc updates: `market-data.md` (Invariant 6 clarified + new Invariant 8 documenting `/api/ohlcv-codes` and the UPDATE-only-write self-healing coverage model).

Commit: pending (this cycle). Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (mcp-server container swap is user-gated — NOT run by this agent, per feedback_container_swaps_user_gated.md). Filed `docs/signals/ops-rebuild-verify-mcp-server-20260709T2332Z.json` — deferred market-hours RAW-verify of live foreign_net_vol coverage growth + VPS script redeploy confirmation.

Zone health: tsc clean, tools=183 unchanged, 78/78 targeted tests pass, live-tested full-universe API call (1459 codes, HTTP 200) | HEALTHY.

## 2026-07-10 — TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (dev-team dispatch, Track 1 of FIX-BCTC-BANK-SUMMARY-MAPPING W5 replacement, AC-14 dedup)

RISK-2 pre-check (mandatory before dev effort): latest on-disk signal (`cowork-team-20260710T000000Z`, newer than the architect brief's own citation) confirms gateway still gateway-blind — Track 1 (deterministic migration) stays the correct path; did not silently switch to the original agentic W5 approach.

Built `scripts/migrations/carry-forward-bctc-orphaned-rows.ts` (idempotent, `--source`/`--target`/`--apply`, dry-run default) — INSERT...SELECT copies orphaned `bctc_table_rows` onto the current `report_id`, then reuses the existing `buildBackfillBctcScalarsHandler` (zero duplicated aggregation logic) to reflow scalars. Ran live against the named-volume DB: 451 CTG 2026-Q1 rows carried forward `96e36139-...` → `e497f7d1-...` (RAW pre/post-verified via `docker exec`).

Finding (escalated, not silently claimed as fixed): the 451 carried rows are 208 income_statement + 173 cash_flow + 70 notes — ZERO balance_sheet/general rows. The BEQ-6 section-completeness gate correctly refused to promote to DONE (set `refine_status=PARTIAL`, left `total_assets=0`/`net_revenue=3910`/`net_margin_pct=~229157%` unchanged). AC-TRACK1-2 (row carry-forward) PASSED; AC-TRACK1-3 (scalars plausible) did NOT resolve — the defect is one level deeper than W2's row-repair scope: the balance-sheet page window was apparently never captured in the original agentic-refine pass that produced this orphan. Needs a fresh refine pass targeting that window once gateway-blind resolves.

AC-TRACK1-4/5/6 all PASS: VCB/FPT/VNM unaffected (RAW-verified live + by code inspection — writes scoped to source/target report_id only); CTG/VCB report_ids re-confirmed current (no churn since the architect brief); commit references sprint + AC-14 dedup note + brief path.

New test file 8/8 pass (24 expect()) — `:memory:` SQLite, zero live-DB dependency. tsc clean. Targeted financial-reports suite (BEQ-2/BEQ-SECTION-GUARD/FU-BACKFILL-DE-SYNC/LF-SERVE-REFLOW/TSU-DEV-U3) 39/39 pass. Full `bun test` 14426 pass/40 skip/59 fail/5 errors/1185 files (626s, known Bun 1.3.13 teardown crash after summary) — zero apps/mcp-server/src/ files touched by this task, so pre-existing/unrelated by construction. toolCount=183 unchanged. Live health/dashboard probes clean (no rebuild needed — server code untouched).

Commit: pending (this cycle). Board: `ready`→`review` via orch-apply.sh, `next_agent=qa`.

Zone health: tsc clean, tools=183 unchanged, new script 8/8 + targeted BCTC suite 39/39 pass, zero apps/mcp-server/src/ files touched, live migration RAW-verified (451 rows) with an honest AC-TRACK1-3 escalation (not a false-green) | HEALTHY.

## 2026-07-10 — FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

Root cause (SSH RAW-verify report 3256, 2026-06-19T16:20Z): `freshnessSlaMonitorJob.ts`'s bctc check escalated CRASH/CRITICAL to alert-commander on `financial_reports.parsed_at` age alone, firing a false BCTC P0 every ~2h whenever the queue was legitimately empty (no filings due). Of the 3 BCTC health surfaces in the codebase, this was the only one that never checked live queue-depth/service-state — `vpsHealthPoller.ts` (FIX-BCTC-FRESHNESS-GATE) already gates on `bctc_vps_queue` active-count, and `freshnessSlaChecker.ts` (FIX-BCTC-SLA-THRESHOLD-360) already has calendar-earnings-window awareness — neither of those touches actual runtime state.

Fix: added a generic `PipelineRuntimeState{serviceActive,queueDepth}` gate to `checkSignalSla`/`checkDataFreshnessSla` (`freshnessSlaChecker.ts`, domain/pure) — service-down→CRASH unconditionally; queue-depth=0+service-active→IDLE unconditionally (never a crash, regardless of push-age); queue>0+active→existing age-vs-threshold logic unchanged. New scheduler-side reader `queryBctcPipelineRuntimeState` (`freshnessSlaMonitorJob.ts`) sources queue-depth from `bctc_vps_queue` and service-state from the latest `vps_service_health` row (reuses the existing poll table — no new SSH/systemd probe, matches the task's generic_mandate). Fail-open (`undefined`) on any DB error so environments/tests without the new tables see zero behavior change.

New `FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH.test.ts` (19 tests, 3 groups): Group A/B pure-domain DoD cases (idle→IDLE, service-down→CRASH, queue-backlog+stale→CRASH, ungated signals unaffected); Group C scheduler-wiring end-to-end via `runFreshnessSlaMonitor` (idle→no escalation, service-down→escalates CRITICAL, queue-backlog→escalates as before, missing-tables→fail-open/legacy-unchanged). All 19 pass. Targeted SLA/BCTC-health suite (9 pre-existing files, 129 tests) still 129/129 pass, run twice.

Full `bun test` full-suite is flaky in this environment (two runs: 55 fail/3 err then 62 fail/7 err, non-deterministic counts, both end in the known Bun 1.3.13 teardown panic) — grepped every failing test name across both runs: zero overlap with freshnessSla/bctc/vpsHealth; re-ran 3 sampled full-suite-only failures (1113-vps-proxy-health/1146-get-insider-transactions/RAPID-B2-get-market-cap, 35 tests) in isolation → 35/35 pass, confirming pre-existing resource-contention flake, not a regression from this change. tsc clean. Server-boot probe: health 200, toolCount=183 unchanged, boot log confirms "SLA monitor" still registered among the 85 cron keys, `bctc-inspect`/`news-fetch` dashboard routes clean (no circular-dep break).

Commit: pending (this cycle). Board: `ready`→`in_progress`→`review` via orch-apply.sh, `next_agent=qa`.

Zone health: tsc clean, tools=183 unchanged, new test 19/19 + targeted SLA/BCTC suite 129/129 pass (run twice), full-suite flakiness isolated and confirmed pre-existing/unrelated, live server-boot + dashboard probes clean | HEALTHY.
