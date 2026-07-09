# dev-mcp-server -- Notebook

## 2026-07-09 — FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (dispatched from ci-red-554bb302 signal, dev-team)

1294-macro-spam-fix.test.ts's AC-1/AC-2 `CycleDeps` objects omitted `macroFetchFn`/`vnstockSyncFn` (both already exist on `CycleDeps`, added by CI-RED-8081e584-FIX round 2 / commit 8a2ef7255 for the sibling 1285-macro-alert-cooldown test) — step A2 defaulted to REAL Yahoo Finance/SBV HTTP calls on every run, confirmed live via `[yahooFinance] fetched commodity prices`/`[sbv] macro snapshot fetched` log lines that vanished after the fix. Fix: injected `async () => {}` no-op stubs for both fields, mirroring the 1285 precedent (no new DI convention).

RAW-verified: target test green x4 local runs, no live-fetch log lines, duration ~1050ms→~150ms proves no network I/O. tsc clean. `git stash` A/B on a monolithic `bun test` run's 12-file failure list confirmed those 65 fails pre-exist independent of this diff. CI-equivalent `ci-per-file-isolation.sh`: 1294 not among the (unrelated) failed files. Pushed 76acfb4e4 → CI initially red on FU-LOCKSTORE-EXPIRED-GC.test.ts (unrelated, zero code overlap, confirmed 3/3 local isolated pass — a NEW unrelated flake, not this fix) → re-ran same commit's CI job (GH run 29025427212) → green.

Scope note: 8 other test files (106-intelligence-cycle/1228/1255/137/1383/1501/278/311) call `runIntelligenceCycle` without stubbing `macroFetchFn`/`vnstockSyncFn` — same exposure class, currently passing (network reachable), flagged for a follow-up sweep rather than folded into this S-size targeted fix.

Doc updates: NONE (test-only fix, no architecture/behavior change).

Commit: 76acfb4e4. Board: `in_progress`→`review` (orch-apply.sh, commit 531af9a11), `next_agent=qa`.

Zone health: tsc clean, tools=183 unchanged, target test green x4 no live-fetch, CI green on re-run | HEALTHY.

## 2026-07-09 — FACTORY-NEWS-extract-rss-parse → misroute, NOT implemented (zone violation)

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

BOUNDED-1 dispatched this task (files: `apps/news-fetch/src/infrastructure/scrapers/{reuters,bloomberg}-rss.ts` + new `rss-parse.ts`) to dev-mcp-server. Zone=news-fetch, entirely outside dev-mcp-server's hard `zone_restricted: apps/mcp-server/` boundary — refused to implement. Root cause: `backlog-detail.json` `dev_agent` field was wrong (`dev-mcp-server`) for ALL 6 `FACTORY-NEWS-*` rows since the 2026-06-15 audit-sprint data-entry pass; `.claude/skills/zone-detect/SKILL.md` Tier-1 (`zone:` field) correctly resolves `news-fetch` → `dev-news-fetch` per `system-map.json`, but the dispatch used the stale `dev_agent` field instead.

Fixed: `backlog-detail.json` `dev_agent` → `dev-news-fetch` for all 6 news-fetch FACTORY rows. Board row `FACTORY-NEWS-extract-rss-parse` reverted `in_progress`→`backlog` (status `BACKLOG`, `reroute_note` added) via `orch-apply.sh`. Top-level `.head` (NOT `.task_board.head`, which is a deprecated do-not-write stub) reset to idle/`next_agent=router`. Released intent lock. `send_telegram(bug)` flagged the router-side gap for the dispatcher to prefer zone-detect Tier-1 over `dev_agent` field on future BOUNDED-1 picks.

Zero apps/news-fetch/ files touched. Commit covers: `docs/data/orch/archive/backlog-detail.json`, `docs/data/orch/orch-state.json`, decision journal, this notebook.

Zone health: apps/mcp-server/ untouched (out-of-zone task correctly declined), board self-corrected, WIP freed | HEALTHY.

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
