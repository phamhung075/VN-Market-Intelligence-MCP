# TASKS Archive — VN Market Intelligence MCP

Index of completed sprints. Full details in `docs/archive/` files — load only when needed.

Active board → `TASKS.md`

---

## Archive — Added 2026-05-18 by PM (c180+ Done rotation)

**Period:** 2026-05-16 → 2026-05-18 | **Rows archived:** 31 (Done entries rotated from active TASKS.md)

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| 1941c | **DONE 2026-05-18 QA** — accuracyDigestJob cron (0 7 * * *) + getSystemAccuracyDigestStats (4-query pattern) + buildAccuracyDigestText. 7/7 tests GREEN (22 assertions). AC-1..12 covered. tsc 0 errors. DDD PASS, Security PASS. No regression (9187 pass, matches main). cron-registry.json updated. Report: reports/TASK_REPORT_1941c.md. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-18 |
| 1941a-l7-ocf-guard-deploy-verify | **DONE 2026-05-18 QA** — cashFlowTool.ts now prefers `operating_cash_flow` (vnstock API bridge, Task 1878a) over `operating_cf` (OCR/PDF) via COALESCE. VCB: corrupted 1.23e15 → 9,947,260 triệu VND, ratio=1.15 (passes guard). FPT OCF fixed to 4,108,450 triệu (ratio still suppressed — NI=20,225 is separate OCR bug, filed separately). 5 new tests + 12 regression tests GREEN (17 total). tsc clean. Report: reports/TASK_REPORT_1941a.md. | HIGH | FIX | dev-mcp-server | 2026-05-18 |
| calendar-source-replacement | **DONE 2026-05-18 c174/QA-c174** — No viable free replacement for VN economic calendar. InvestingCalendarAdapter replaced with NullCalendarAdapter (returns [] immediately). DEFAULT_TIMEOUTS.calendar=0. macroRefresh cycle no longer wastes 5s on dead endpoint. 4 new tests. 103/103 active tests pass, tsc clean on touched files, DDD PASS. NullCalendarAdapter wired. Report: reports/TASK_REPORT_calendar-source-replacement.md. Merged task/calendar-source-replacement to main. | LOW | WONTFIX | dev-macro-indicators | 2026-05-18 |
| 1940a-pc1-legal-risk-tool-gap | **DONE 2026-05-18 c174/QA-c174** — `get_legal_risk_signals` now dual-source: queries both `alerts` AND `agent_signals` (signal_type=legal_risk). Root cause: PC1 chairman arrest signals (#3318/#3343, conf=0.78) were in agent_signals but tool never read there. Fix: `queryAgentSignalsTable()` in legalRiskTools.ts (interface layer, DDD-clean). TC4: null stock_code (broad) signals also returned. 7 new tests GREEN, 61-test regression suite GREEN, tsc 0 errors. QA c174 APPROVED. | HIGH | FIX | dev-mcp-server | 2026-05-18 |
| 1939a-tnb-critic-gate-sprint-a | **DONE 2026-05-17 c172/QA-c142** — TNB Critic Gate Sprint A+B shipped together in commit 21dddcfe: tnbCriticScorer.ts (pure domain scorer, 5 checks × 0.2, threshold 0.6), schema-news 3 new cols (critic_score/critic_notes/retry_count), postSignalWithCriticGate() wrapper, post_agent_signal MCP tool wired. 49 scorer+gate tests GREEN. QA c142 CHANGES_REQUESTED → fix a611d911 (try/catch + cron-registry) → QA c143 APPROVED. | HIGH | SPRINT-S | dev-mcp-server | 2026-05-17 |
| 1939b-tnb-critic-gate-sprint-b | **DONE 2026-05-17 c172/QA-c142** — Shipped together with 1939a in commit 21dddcfe. Sprint B scope complete: postSignalWithCriticGate() + post_agent_signal tool wire + INSERT path extension + 17 gate tests GREEN. See 1939a entry. | HIGH | SPRINT-S | dev-mcp-server | 2026-05-17 |
| 1937a-cowork-scheduler-mcp-gap | **DONE 2026-05-17 c171** — SPIKE CLOSED. Root cause (wrong MCP URL `https://zenmidi.com/mcp`) fixed via 1938a. Condition met: news-scout 2026-05-17 09:21 UTC cycle completed successfully (gateway RESTORED confirmed). All cowork agents reachable via `https://zenmidi.com/vn-market/mcp`. | MEDIUM | SPIKE | architect | 2026-05-17 |
| 1938a-cowork-mcp-url-fix | **DONE 2026-05-17 c170** — Root cause of 1937a cowork scheduler MCP gap: 15 files used wrong URL `https://zenmidi.com/mcp` (no cloudflared route → 404). Fixed to `https://zenmidi.com/vn-market/mcp` across 9 cowork-workspace-team-claude-desktop/*.md + 6 .claude/commands/crons/ + cowork-refactory-expert/main.md. Resolves market-watcher + alert-commander + qa-responder + news-scout MCP unavailable in scheduled context. After Claude Desktop reload, all cowork agents should reach MCP. | HIGH | FIX | developer | 2026-05-17 |
| 1862c-E | **DONE 2026-05-17 c168** — SSE endpoint already returning 200 via cloudflared local config (`~/.cloudflared/config.yml` has correct `/vn-market/sse` rule, PID 377 running). Task was stale — no code change needed. | HIGH | OPS | dev | 2026-05-17 |
| 1936b-hydration-fixes | **DONE 2026-05-17 c168** — Remaining hydration issues identified and fixed: (1) `_index.tsx` timestamp `suppressHydrationWarning`+`toLocaleString` replaced with `ClientTimestamp` import. (2) `dashboard.db.tsx` 5 price/volume `<td>` leaf nodes annotated with `suppressHydrationWarning` (correct leaf-node usage for locale-dependent number formatting). 61/61 tests GREEN, tsc 0 errors. | MEDIUM | FIX | dev-frontend | 2026-05-17 |
| news-bugs-reuters-bloomberg-fix | **DONE 2026-05-17 c167** — Reuters dead URL + Bloomberg 502 fix merged to main via `chore(merge): task/calendar-source-10s-timeout` (3af610a0). reuters-rss.ts → Google News RSS (15 articles confirmed), handlers.ts → 3 warn log points, index.ts → `idleTimeout: 0`. 8 regression tests added, 180/180 pass. Bloomberg RSS fallback (`bloomberg-rss.ts`) added in same merge (replaces stale DOM selector). Docker rebuilt + redeployed. | HIGH | FIX | dev-mcp-server | 2026-05-17 |
| 1936-frontend-hydration-clientimstamp | **DONE 2026-05-17 c167** — Frontend hydration mismatch on timestamp containers. Replaced `suppressHydrationWarning` workaround with proper `ClientTimestamp` component (deferred render until client mount). Test: `1936-client-timestamp.test.tsx`. Commits e945f9ea + 1a463888. | MEDIUM | FIX | dev-frontend | 2026-05-17 |
| macro-calendar-timeout-cap | **DONE 2026-05-17 c167** — Calendar source timeout: 30s → 10s → 5s (endpoint permanently unreachable). Prevents calendar from blocking macroRefresh cycles. Doc refs updated. Commits c8f63afc + 681d0482 + 2198fc16. Follow-up `calendar-source-replacement` queued for source-replacement evaluation. | MEDIUM | FIX | dev-macro-indicators | 2026-05-17 |
| 1934-macropanel-data-shape | **DONE 2026-05-17 c167** — MacroPanel was reading `source/status` fields that don't exist; switched to `sources+summary` per actual gateway response shape. Test: `1934-macro-panel.test.ts`. Commit e4baf96a. | MEDIUM | FIX | dev-frontend | 2026-05-17 |
| 1933b-delete-evaluateAlert-dead-code | **DONE c160** — Deleted `evaluateAlert()`, `AlertEvaluateRequest`, `AlertEvaluateResponse` from `apps/mcp-server/src/infrastructure/microservices/clients.ts`. Zero callers confirmed (grep-verified). SPIKE-1933a WONTFIX: market.db.alerts → Alert Commander is canonical; Go alert-engine reserved for future stop-loss. tsc 0 errors. | MEDIUM | FIX | dev-mcp-server | 2026-05-17 |
| 1928a/1929a/1930a/1930c | **DONE c159** — 1928a extra_hosts fix (virtiofs DNS), 1929a alerts table healthy (516 rows), 1930a verdictResolutionJob rows_written=0 (1926a held), 1930c rag-service healthy (LENC not recurring). | HIGH | OPS | ops | 2026-05-17 |
| 1862c-F | **DONE c156** — SseSessionManager structured 404 + heartbeat eviction. 5/5 tests GREEN. | MEDIUM | FIX | developer | 2026-05-17 |
| 1930b-fa-ocf-extraction-bug | **DONE c157** — `get_cash_flow` OCF/NI ratio guard. `OCF_NI_RATIO_PLAUSIBILITY_LIMIT=20`. FPT (504×) + VCB (1.42e8×) suppressed. 7/7 tests GREEN, tsc 0 errors. | HIGH | FIX | dev-mcp-server | 2026-05-17 |
| 1932a-frontend-dashboard-pages | **DONE 2026-05-17 c156** — 4 dashboard pages shipped: server / fetch / vps / db. Routes under `apps/frontend/app/routes/`. Builds cleanly, fetches from API_GATEWAY_URL via existing client.ts. Commit: 5945475e. Independent of MCP gateway (frontend zone has zero MCP coupling). | HIGH | FIX | dev-frontend | 2026-05-17 |
| 1931a-frontend-scaffold-harden | **DONE 2026-05-17 c155** — All 5 risk flags closed. Dockerfile (Node 20 Alpine multi-stage), docker-compose frontend service (port 3001, depends_on api-gateway), npm install (757 pkgs), components.json + shadcn Button/Card/Input primitives, playwright.config.ts + smoke.spec.ts, API_GATEWAY_URL wired in client.ts + _index.tsx loader. Vitest 3/3 GREEN, tsc 0 errors. Commits: ecda4fc2 + 0e443e03. | HIGH | FIX | dev-frontend | 2026-05-17 |
| 1922f-bond-maturity-source-verify | **DONE 2026-05-17 c149** — AC MET. `bondMaturityPollerJob` cron `30 2 * * 0` fired 02:30 UTC. `get_bond_maturity_calendar` via MCP returned ≥1 row: NVL (Novaland, 5,000 tỷ VND, 2026-09-15, 10.5%/năm). Observational task complete. | LOW | OBSERVE | ops | 2026-05-17 |
| 1927a-manufacturing-pmi-fix | **DONE 2026-05-17 c147** — manufacturing_pmi always null: (1) Bun.serve `idleTimeout` 10s killed `/macro/external` before TE scraper completed (65s budget) — fix: `idleTimeout: 120` in `apps/macro-indicators/src/index.ts`. (2) `macroIndicatorRefreshJob.ts` never extracted PMI from external response — fix: added `parsePmiFromText()` + `parsePmiFromExternal()`, upsert now passes `parsedPmi` instead of `null`. TC6/TC7/TC8 added, 8/8 GREEN, tsc 0 errors. Commit `8d4716b7`. Docker rebuild pending (blocked by Docker DNS deadlock). | HIGH | FIX | dev-mcp-server | 2026-05-17 |
| 1926a-verdict-retry-storm | **DONE 2026-05-17 c146** — verdictResolutionJob retry storm (26 reports, MACRO_GOLD/VNH/WATCHLIST-31 repeated hourly). Fix: when `fetchHistory` or `fetchPrice` returns null, mark verdict `false_positive` with `detail:"price-fetch-failed:unresolvable"` + send ONE BUG telegram. Row excluded from next run by `verdict!=='pending'` filter. 3 new tests (1926a idempotency) + 2 existing tests updated. 19/19 GREEN, tsc 0 errors. Reports 2894-2927 all resolved. | HIGH | FIX | dev-mcp-server | 2026-05-17 |
| 1925a-lancedb-reinit | **DONE 2026-05-17 c145** — LanceDB `rag_entries.lance` corrupt (lance-file-4.0.0 rejected old magic bytes [76,65,78,67]). Fix: `db.drop_table('rag_entries')` from within rag-service container (20,631 rows dropped — embeddings regenerate on next news cycle). Rag-service restarted; `search_similar_context` now returns `{results:[],total:0}` instead of error. Reports 2925+2926 resolved. Resolves news-scout report "LanceDB vĩnh viễn lỗi". | HIGH | OPS | ops | 2026-05-17 |
| 1924a/b/c/d | **DONE 2026-05-17** — Wire live VN CPI into macro_indicators. `parseCpiFromText()` exported from macroIndicatorRefreshJob.ts (regex first-number-before-percent). `getMacroExternal()` added to clients.ts (never throws, returns null on error). Job now calls `/macro/external` after `/macro/snapshot`; parsed CPI upserted via COALESCE. `manufacturing_pmi` slug added to `VN_TE_SLUGS` (both `.ts` + `.py`). 1924b DB patch applied: cpi=5.46 live in Docker container. 5/5 TC GREEN, tsc 0 errors. | HIGH | FIX | dev-mcp-server | 2026-05-17 |
| 1923a | **DONE 2026-05-16 c143** — Investment clock case-mismatch fix. `investmentClockTools.ts`: query param `"Vietnam"` → `"vietnam"` (matches DB SSOT). `macroIndicatorRefreshJob.ts`: upsert country key `"Vietnam"` → `"vietnam"` + expanded ON CONFLICT SET to COALESCE `manufacturing_pmi`, `cpi`, `gdp_growth`, `inflation_rate` (null-safe; snapshot doesn't expose these, existing DB values preserved). 4/4 TC GREEN (TC1-TC4). tsc 0 errors. `get_investment_clock_phase` now returns RECOVERY (gdpGrowth=7.4 UP, CPI=2.84 LOW) instead of insufficient_data. | HIGH | FIX | dev-mcp-server | 2026-05-16 |
| 1909c-reparse-validation | **DONE 2026-05-16 c142 21:35 UTC** — DIG Q4-2025 reparse successful. Triggered `bctcReparseJob` with manual agent_feedback entry. Old values: confidence=62.5%, equity=10,028,528,477 tỷ (absurd). New values: confidence=68.75% ✓, equity=10,028,528.477 VND ✓. AC: confidence ≥ 0.6 PASS, equity < 50,000 tỷ PASS. Unblocks FA Layer 7. Commit: none (ops task). | HIGH | OPS | ops | 2026-05-16 |

---

## Archive Files (lazy-load)

| File | Sprints | Period | Summary |
|------|---------|--------|---------|
| [sprints-c141-c147.md](archive/sprints-c141-c147.md) | c141–c147 | 2026-05-16 → 05-17 | SPRINT-1922 empty-tables sweep (59 tables), 1922a/b/c/d/e/f/h/j, 1923a, 1924a/b/c/d, 1925a LanceDB reinit, 1926a verdict-storm fix, 1927a PMI fix. |
| [sprints-1269-1277.md](archive/sprints-1269-1277.md) | 1269–1277 | 2026-04-22 | Signal pipeline bug fixes: macro direction labels (1269), foreign flow UNIQUE constraint (1275), cooldown bypass (1276), Ops agent formalization (1277). 6171 tests, 0 failures. |
| [sprints-133-162.md](archive/sprints-133-162.md) | 133–162 | 2026-04-17 → 04-18 | test-isolation Bun preload (1380+1381), ocr-e2e skip geo-blocked (1382), france-msg-quality filler+diacritics (1383+1384), evening-news-filler (1385+1386), morning-briefing-filler (1387+1388), weekly-portfolio-filler+diacritics (1389+1390), stale-lock regression (1391), calibration-diacritics (1392+1393), alert-digest-diacritics (1394+1395), db-isolation Bun.env fix + phantom purge (1400+1401), volume-spike-multiplier ATC guard + per-ticker avgVolume (1402+1403), alert-diacritics convictionScorer labels (1404+1405), hut-sector reclassify real_estate→construction + DB migration (1406+1407), tool-diacritics kinhDich+ta+supplyChain helpers (1408+1409), tool-diacritics-sweep 24 files (1410+1411), diacritics-wave3 scheduler+domain+application layers (1412+1413), diacritics-wave4 5 interface/mcp/tools files 13 strings (1414+1415), diacritics-wave5 12 interface tools + 1 domain service 118 strings (1416+1417), diacritics-wave6 6 files (1418+1419), wrap-missing-jobs-recordJobRun cron health coverage (1420), morning-briefing upcomingDeadlines BCTC section (1422+1423), evening-summary sector aggregation from watchlist movers (1424+1425), evening-summary VN-Index close price (1426+1427), evening-ta-filter RSI-only predicate fix (1428+1429), startup-catchup morning-briefing + evening-summary on restart (1430+1431), foreign-flow-sentinel filter 9999999 (1432+1433), morning-briefing commodity values fix (1434+1435), morning-briefing VN-Index point change (1436+1437), morning-briefing portfolio P&L section (1438+1439), portfolio-pnl Vietnamese diacritics fix (1440), evening-summary portfolio P&L at market close (1441+1442), france-summary portfolio P&L block (1444+1445) |
| [sprints-120-132.md](archive/sprints-120-132.md) | 120–132 | 2026-04-17 | prediction-diag medium-severity (1354+1355), ta-diag evening summary (1356+1357), ohlcv-aggregator (1358+1359), ohlcv-backfill-queue (1360+1361), vps-deploy-backfill (1362+1363), france-ta-detail (1364+1365), pipeline-health-tool (1366+1367), ohlcv-aggregator-notify (1368+1369), france-watchlist-movers (1370+1371), france-test-fixtures (1372+1373), ohlcv-aggregator-cron (1374+1375), evening-summary-db (1376+1377), vps-auto-deploy (1378+1379) |
| [sprints-109-119.md](archive/sprints-109-119.md) | 109–119 | 2026-04-16 → 04-17 | france-summary-cron widen window (1348+1349), ta-adaptive lower guard + adaptive RSI/MA (1346+1347), france-summary stale alert 24h filter + dedup (1344+1345), ta-fallback daily_ohlcv < 15 rows (1342+1343), test-crash LanceDB fix (1341), alert-delivery medium severity (1339+1340), test hygiene (1337+1338), news-pipeline rag_analyses fix (1335+1336), chore tasks archive (1334), ohlcv-backfill endpoint + VPS script (1350+1351), ohlcv-startup-probe (1352+1353) |
| [sprints-064-080.md](archive/sprints-064-080.md) | 064–108 | 2026-04-12 → 04-17 | Knowledge sync, prediction resolution, Bun.env purge, briefing enrichment, market message review, calibration labels, per-ticker intelligence, BCTC pipeline fix, evening pipeline fix, RSS Atom support, pipeline health tool, pipeline watchdog, TE RSS fallback chain, evening summary empty-content fallback, domain bug batch (cascade/NER/relevance), push-news all 9 VPS sources, direction-aware macro deviation labels, test isolation (137 Step E 30s timeout fix), fix defaultComputeTa reads daily_ohlcv, pollNews SOURCE_DISPLAY_NAMES map (eliminates 2 test-1227 failures), test hygiene (297 DB_PATH isolation + 296 OCR 30s timeout cap), alert delivery medium severity fix, ta-fallback defaultComputeTa fallback to market_prices_history when daily_ohlcv < 15 rows, france-summary stale alert 24h filter + same-day dedup guard (1344+1345) |
| [sprints-059-063.md](archive/sprints-059-063.md) | 059–063 | 2026-04-12 → 04-13 | Prediction engine B+C+D, foreign flow VPS, cron observability, insider detection |
| [sprints-054-058.md](archive/sprints-054-058.md) | 054–058 | 2026-04-08 → 04-12 | Position ledger, /ask queue, alert narrowing, Kinh Dich default, observability, BCTC fallback, evidence store, OCR fix |
| [sprints-048-053.md](archive/sprints-048-053.md) | 048–053 | 2026-04-06 → 04-07 | OCR pipeline, Kinh Dich differentiation, 3-channel Telegram migration |
| [sprints-025-034.md](archive/sprints-025-034.md) | 025–034 | 2026-04-01 → 04-02 | Sector rotation, correlation, performance attribution, rebalancing, rate limiter, Telegram commands |
| [sprints-004-006.md](archive/sprints-004-006.md) | 004–006 | Foundation | RSS, watchlist, signals, alerts, HOSE/HNX fetchers, pattern matcher, scheduler |
| [standalone-tasks.md](archive/standalone-tasks.md) | — | 2026-04-08 → 04-12 | Bug fixes, janitor cleanups, VPS proxy, cascade rules, DDL dedup |
| inline | 1777–1802 | 2026-04-30 | VPS SSH restart pipeline (1779a/b/c), classifyFilingStatus off-by-one (1781), BCTC enricher Q1-2026 seed (1782), morning bulletin foreign-flow masking (1783), sector alerts dedup (1784), France summary change_pct (1785), earnings conflict detection (1786), GVR sector fix (1787), HCM ticker false positive (1788), getDeadlineForQuarter DST bug (1789), alertDigestJob dedup guard (1790), assembleAlertDigest intra-digest dedup (1791), BCTC conviction signal debounce (1792), pollNews all-sources-dark cooldown (1793), EOD Vol+RSI (1794), JANITOR-011/012, VPS pipeline restored (1777a), Docker rebuild (1795), 1796a–g janitor sweep, 1797 NewsAPI guard, 1798 TE Chromium scraper, te-chromium-fix, te-chromium-news, 1799–1803 stats+docs sync. |
| inline | 1876a-A6, 1896a, 1896c, 1896c-impl | 2026-05-12 | Archived c58 (CLEAN-c57-leftovers): 1876a-A6 high-vol watchlist seed (NVL/DPM/REE/VNH/KBC/MWG/TCH -9.0, c53), 1896c persistent-docker-events arch brief (launchd+newsyslog, c57), 1896c-impl docker events logging deployed (PID 14119, c57), 1896a container-restart RCA (false-alarm-h4, c57). |

---

## Archive — Added 2026-05-13 by dev-team (c60 cap rotation)

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| ARCH-1896-RE-RCA-c58 | ARCH-HIGH **DONE 2026-05-13 c58**: TNB-c43 #1 CRITICAL re-RCA verdict = **monitor** (false alarm). New brief `docs/architecture-briefs/2026-05-13-container-restart-rca-v2.md` (commit `102aa7bc`). All 3 c40/c41/c43 restart signals identified as INTENTIONAL ops deploys (1862c-DE api-gateway stop, 1876a-A5 migration x2, 1876a-A6 up --build). Exit codes 0 (clean) or 137-via-SIGKILL (Docker stop-timeout, NOT OOM). ZERO OOM events, ZERO `health_status:unhealthy` in 30-day docker-events window. c59 fix path = TNB recalibration SPRINT-S (add `# TNB-PLANNED-RESTART` ops-flow tag, ≤20 LOC, defer to c61 OK). H4 cross-link embedded in v2 brief §3+§7. | HIGH | ARCH | architect | 2026-05-13 |
| ARCH-BRIEF-UPDATE-H4-c58 | ARCH-HIGH **DONE 2026-05-13 c58**: Drain h4-confirmed-docker-virtiofs signal. Brief `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md` updated 118L→139L (commit `b31722b9`). H4 CONFIRMED with c57+c58 lsof evidence (PID 51247, VirtioFS mechanism). H1/H2/H3 dispositions recorded REJECTED/ELIMINATED/REJECTED. F-option pick: **F2 primary** (named volumes; F2a docs/data+reports first low-risk, F2b docs/agent-memory after writer-audit) + **F4 secondary** (retry wrapper 2s×3, defense-in-depth). F1 USER-BLOCKED (Docker Desktop file-sharing exclusion). F3 REJECTED (too disruptive). c59 task plan: c59-T1 F2a (developer/ops, docker-compose.yml), c59-T2 F4 retry wrapper (dev-team flow + skills), c60-T1 F2b. Open Qs Q1+Q2 CLOSED. | HIGH | ARCH | architect | 2026-05-13 |
| HEADLOCK-ROOT-CAUSE-CONFIRMED-c57 | ARCH-HIGH **DONE 2026-05-13 c57** (BREAKTHROUGH): Root cause for 6-cycle HEAD.lock pathology CONFIRMED = Docker Desktop's `com.apple.Virtualization.VirtualMachine.xpc` process (Apple Hypervisor) holds read-only fds on `.git/HEAD.lock` (+ `.git/refs/heads`, `.git/objects/...`) while git performs atomic ref-update. Mechanism: Docker Desktop VirtioFS/GRPCFUSE file-sharing layer scans project root because `docker-compose.yml` bind-mounts multiple subdirs (`./docs/agent-memory`, `./reports`, `./docs/data`, `./mcp.config.json`) — opens new files (including transient lock files) for indexing. PID 51247 caught in lsof during c57 merge-gate retry (after concurrent market-watcher cron commit `b9056f34` triggered race window). H1 REJECTED, H2 ELIMINATED, H3 REJECTED, H4 CONFIRMED with refined mechanism. Evidence: `docs/agent-memory/sessions/{indexlock-race-evidence-2026-05-12T224153Z,headlock-h1-live-evidence-2026-05-12T224223Z}.log`. Signal emitted: `docs/signals/2026-05-13T004500Z-h4-confirmed-docker-virtiofs.json` with 4 fix options (F1 Docker Desktop file-sharing exclusion / F2 named volumes / F3 external git-dir / F4 retry wrapper defensive). | HIGH | ARCH | dev-team | 2026-05-13 |
| HEADLOCK-DIAGNOSTIC+WORKTREE-GC-c57 | FIX-HIGH **DONE 2026-05-13 c57**: PREFLIGHT instrumentation bundle (T1+T2+T5+T6 from c56 architect brief). 3 commits `749a0b02` flow edit + `3ff05127` protocol doc + `602a96bc` notebook. Added to Step 0-PREFLIGHT: lock-size logging (`stat -f %z`), `lsof` capture before remove, `git worktree prune -v`, 24h worktree lock-expiry sweep. `.claude/flows/dev-team/main.md` 136L→165L. `docs/protocols/head-lock-self-cure.md` 89L→118L. Dry-run PASS. **Instrumentation paid off immediately:** captured H4 evidence in this very cycle. T3 dropped (no commit hooks). T4+T7 deferred to c58. | HIGH | FIX | agent-father | 2026-05-13 |
| CLEAN-c56-leftovers-c57 | CLEAN-MEDIUM **DONE 2026-05-13 c57**: 6 atomic commits `dd50904f→02906f22`. Bundled c56/c57 boundary leftovers (8 files): notebook drift (news-scout + po), out-of-band sessions (digest-predict), evidence logs (2x — H4 root-cause artifacts), drained signals (c56+c57), TASKS.md 82L→80L archive. Working tree CLEAN post-cycle. 0 HEAD.lock recurrence within session (defensive: no worktrees + slow commit cadence). Evidence files committed in `03a8ea47` for architect c58 brief update. | MEDIUM | CLEAN | agent-father | 2026-05-13 |

---

## Archive — Added 2026-05-13 by PM (c61 cap rotation)

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| HEADLOCK-PREFLIGHT-VALIDATED-c60 | OPS-INFO **DONE 2026-05-13 c60**: 9th HEAD.lock recurrence cured at PREFLIGHT 01:36:13Z (age=1953s, size=0). Same PID 51247 (Docker VM) — 4th consecutive cycle with identical fingerprint. Plus 10th recurrence fired mid-cycle during developer F2a commit, cleared via PREFLIGHT safe-remove. Evidence: `docs/agent-memory/sessions/preflight-lsof-20260513T013613Z.log` (commit `c49fac1f`). H4 mechanism fully stable; F2a Option A now shipped (`d127fb18`) — expected to reduce surface area for c61+. | INFO | OPS | dev-team | 2026-05-13 |
| 1888c-TOOLCOUNT-RECONCILE-c60 | CHORE-SMALL **DONE 2026-05-13 c60**: tool-registry.json toolCount 125→133 per project-stats.json SSOT. Doc-only single field. | HIGH | CHORE | developer | 2026-05-13 |
| F2a-OptionA-PER-FILE-MOUNTS-c60 | FIX-SMALL **DONE 2026-05-13 c60**: Per-file :ro mounts in docker-compose.yml for 3 docs/data JSON files (replaces dir mount of `./docs/data`). Eliminates VirtioFS dir-scan surface (root cause for HEAD.lock recurrences per brief §9). Validated via docker-compose config. ./reports/ untouched (separate F2b-reports task). ./docs/agent-memory/ untouched (F2b-agent-memory pending). | HIGH | FIX | developer | 2026-05-13 |
| SPIKE_006-ALERT-QUALITY-RCA-c60 | SPIKE-S **DONE 2026-05-13 c60**: Alert accuracy 22% RCA verdict methodology-bug. Brief `docs/architecture-briefs/2026-05-13-alert-quality-22pct-spike-006-rca.md` (≤120L). c61 task proposal in §7. Closes telegram report id=2869. | HIGH | SPIKE | architect | 2026-05-13 |
| 1888f-SESSION-LOG-PATHS-c60 | CHORE-SMALL **DONE 2026-05-13 c60**: Canonicalized session_log paths in system-auditor.md + cowork-refactory-expert.md to `docs/agent-memory/notebooks/<id>.md` per tree-map.md SSOT. 2 files. | MEDIUM | CHORE | agent-father | 2026-05-13 |
| HEADLOCK-PREFLIGHT-VALIDATED-c59 | OPS-INFO **DONE 2026-05-13 c59**: 8th HEAD.lock recurrence captured at PREFLIGHT 00:36:12Z (age=1952s, size=0). lsof confirmed SAME PID 51247 (Docker VM) — 3rd consecutive cycle with identical fingerprint. H4 mechanism fully stable. Evidence: `docs/agent-memory/sessions/preflight-lsof-20260513T003620Z.log` (commit `25cfa43a`). | INFO | OPS | dev-team | 2026-05-13 |

---

## Archive — Added 2026-05-13 by PM (c64 close)

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| SPIKE_006-c61-T3-SHIPPED-c63 | FIX-S **DONE 2026-05-13 c63**: Remove intraday fallback gating in `alertAccuracy.ts` (L206-217). Compute `calendarDaysElapsed = Math.floor((now - triggeredAt) / 86_400_000)` before calling domain scorer in Path 2. Updated `183-alert-accuracy.test.ts` (AC-2: same-calendar-day alert must not score intraday). Commits `20bab938` impl + `e4e8efd4` notebook/handoff. Tests 16/16 pass. Type check clean. T-2 wiring (Path 2) deferred per spec. | HIGH | FIX | developer | 2026-05-13 |

---

## Archive — Added 2026-04-29 (Sprint 1409)

- **1296–1302:** IMF classifier, fail-loud injection, token reduction, TelegramMessageFactory, textUtils DDD fix, newsNormalizer fix
- **1303:** 9-bug backlog drain (price/sentiment/cascade/watchdog/VPS/BCTC)
- **1307a–1311a:** Macro alert cooldown, sentiment patterns, cascade rules, schema migration, foreign-flow UNIQUE fix
- **1312–1313:** BCTC skip logic inversion, channel-routing regression guard
- **1315:** Cost-push cascade rules + ClimateImpactMapper
- **1317:** Task308 test regex + project-stats sync
- **1318–1321:** Watchdog foreign_flow staleness, VPS OOM guard
- **1326b:** MARKET channel spam guard
- **DDD Phase 0–3c:** Monorepo scaffold, PDF/RAG Python services, 4 TS microservices, parallel TA+BB scan — all merged
- **1327–1329:** Phase 0 merge + test infra, Cowork overhaul, WAL hardening + IMF 7th conviction dim — Done (6927 pass / 7 fail)
- **fix-1293c / fix-1328e / fix-bctc-ocr / fix-watchdog-recovery / fix/signal-payload-fields:** Signal, bug routing, OCR, null-flow, conviction fields — all merged
- **feat/value-investor-analysis-system (1336):** 30 analysis ledger files, Report Analyzer agent (new), 4 agent mods (News Scout/Market Watcher/Alert Commander/Unified Agent), quarterly conviction synthesis, value_investor mode — MERGED 2026-04-26 (6520 pass / 213 fail baseline maintained)
- **1330a–1330b:** Fix 7 failing test regressions from Sprint 1329 (1289c fallback field, 1476 WAL threshold/msg, 240 AC-4 cooldown reset, 1551 isolation) — DONE 2026-04-25 (26/26 target tests pass)
- **1338:** Retrospective documentation for sprints 1330–1337 (SPRINT_GOAL.md, project-stats.json validation tests, sprint history consolidation) — DONE 2026-04-26
- **1339a:** RED phase — 10 failing tests for PriceConfirmation catalyst correlation fields — APPROVED + merged 2026-04-26 (merge commit: 6f617113)
- **1339b:** GREEN phase — implement PriceConfirmation catalyst correlation fields (signalTypes + signalBuilders) — APPROVED + merged 2026-04-26 (merge commit: 7b9de84c)
- **1342b:** GREEN phase — implement DB integrity check job (runIntegrityCheck + integrityCheckJob.ts + CRONS.integrityCheck) — APPROVED + merged 2026-04-26 (merge commit: e93149fc)
- **1343a–1343e:** BCTC PDF pipeline recovery — watchlist restore (30 tickers), HOSE PDF discovery (multi-source SSC/cafef/vietstock), VPS skip endpoint (no infinite retry), fetch-bctc.sh update, integration test (6/6 pass) — APPROVED + merged 2026-04-27
- **1344a–1344c:** Sprint 1344 — Fix 9 pre-existing test failures (6536→7371 pass, 213→0 fail) — ALL MERGED 2026-04-27
- **1345a–1345e:** Sprint 1345 — News + Analysis Pipeline Hardening + Data Quality — Reuters/TE VPS systemd + newsapi fallback, BCTC financial validation (VNM/VEA), Polymarket 24h staleness guard, VN-Index cascade MARKET broadcast, integration pipeline + TSC fix (B1-B4) — APPROVED + merged 2026-04-27 (7355 pass / 73 pre-existing fail / 0 regression)
- **1347a–1347b:** Sprint 1347 — Test DB isolation (1347a: clean 2537 leaked rows) + stock-classification.json coverage expansion (1347b: 5→30 tickers, all tradeExposure populated, 8/8 tests pass) — APPROVED + merged 2026-04-27 (7423 pass / 73 pre-existing fail / 0 regression) — closes report 1319
- **1348a–1348e:** Sprint 1348 — Cascade brokerage/banking competitive signals (1348a: BA spec + design + implementation + test + QA) — Scope refactored: 1348a single integrated task (BK-1 brokerage sentiment routing + FR-3 competitive threat signals with affected_actions wiring) — APPROVED + merged 2026-04-27 (7371 pass / 0 fail baseline restored)
- **1346a–1346d:** Sprint 1346 — Alert Quality & Reliability Hardening (1346a: remove test stub, 1346b: fix UNIQUE constraint, 1346c-a/c-b: alert quality fixes, 1346d: PDF circuit breaker race fix) — ALL APPROVED + merged 2026-04-27 (7371 pass / 0 fail maintained)
- **1349a:** Remove dead scheduler config block from mcp.config.json — APPROVED + merged 2026-04-27
- **1349b:** Circuit breaker state logging + metrics (circuitBreakerLogger.ts) — 11/11 tests pass, QA TS fix applied (noUncheckedIndexedAccess non-null assertions) — APPROVED + merged 2026-04-27
- **1349d:** BCTC validation edge cases — 7 new tests (VAL-07–VAL-10), hard ratio>5.0 threshold, QA TS fix applied — APPROVED + merged 2026-04-27
- **1349e:** Job cycle timings + ops metrics (jobMetrics.ts) — 10/10 tests pass, 100% coverage, wired into taAlertScanJob/bbAlertScanJob/macroIndicatorRefreshJob — APPROVED + merged 2026-04-27
- **1350a:** Fix 73 failing tests (mock.module schema leak + missing watchdog reader injections + stale sprint assertions) — 5 test files only, 26/26 targeted tests pass, 7568 pass / 0 fail full suite — APPROVED + merged 2026-04-27
- **1351b–1351c:** Sprint 1351 — Scheduler test coverage phase 1: vpsProxyWatchdogJob gap tests (1351b: 8 tests) + weatherCheckJob gap tests (1351c: 8 tests) — 16 new tests total, 7598 pass / 0 new fail full suite — ALL APPROVED + merged 2026-04-27
- **1352–1408:** Scheduler gap-fill wave 2 (1353a–1358b: 6 jobs + 48 gap tests), stale-tickers purge, signal outcome tracking end-to-end (1382b/c/d), foreignFlow CB auto-reset + stuck-OPEN fix (1388/1392), OHLCV volume bug (1390), alert-digest double-send dedup (1377), bbAlertScan stale-candle guard (1391), eveningSummaryJob dedup guard (1401), formatAlertDigest price-drop qualifier (1405), bctcQueueEnricher placeholder URL catch (1405b), DB row cleanup (1401-db/1402/1403/1406), startup-catchup evening guard (1408) — ALL MERGED 2026-04-28 (7926 pass / 17 pre-existing fail / 0 regression)
- **1406a–1406f:** server.ts decomposition — pushPricesHandler.ts + server-startup.ts + pushForeignFlowHandler.ts + webhookHandler.ts extracted; jobs.ts (967 lines) → cronConfig.ts + startupHelpers.ts + startScheduler.ts; server.ts ≤1600 lines achieved. QA sign-off: 8043 tests pass, 0 TS errors — MERGED 2026-04-29
- **1395a:** alertBatchGrouper wired to pushPricesHandler — batch sends replace per-alert loop — MERGED 2026-04-29
- **1413b:** foreignFlow CB self-heal fix — early-return guard removed, CircuitOpenError→503+Retry-After, 15 regression tests — MERGED 2026-04-29
- **1396:** GAS digest (+HH:MM) ICT intraday progression label replaces (+thêm) — 11 tests, 8093 total — MERGED 2026-04-29
- **JANITOR-004/005/007/008:** DRY cleanups — COMPANY_SHORT_NAME→getCompanyName (STOCK_CATALOG SSOT), IMF_HISTORICAL_BASELINE=3.0 extracted to imfIndicators.ts, Vietnamese severity label map→severityLabels.ts, LOG_ROTATE_BYTES constant in vps-lib.sh — MERGED 2026-04-29
- **1409a–1409f:** AUDIT sprint — SPRINT_GOAL.md trimmed ≤30 lines, TASKS.md Done archived, agent-spawn-template.md created, ULTRA/FULL/LITE merged into token-economy SKILL.md, ghost test-module-memory.md deleted, project-stats.json updated — MERGED 2026-04-29
- **hotfix-vcb-parser + hotfix-vcb-parser-fixer:** VCB bank BCTC parser — unit header + year filter, extractNumber fallback year filter, detectUnitMultiplier scan window expanded, B-3a/B-3b real OCR fixtures, banking-label fallback — MERGED 2026-04-29
- **1415b:** VCB BCTC bank page-pair parser — contains-based separator + page-pair merge. 16 hotfix tests + 8053 total pass. total_liabilities Q1=1,904,318,782 Q4=2,214,393,069 confirmed — MERGED 2026-04-29
- **1416a:** VCB total_assets=2,441,928,945 (Q4) + 2,109,260,616 (Q1) confirmed. Banking-label fallback emits key "270". 20 hotfix tests pass. validation_status=passed — MERGED 2026-04-29
- **1416b:** FPT 2025-Q4 total_assets=88,089,621 triệu confirmed. trimToBalanceSheetWindow helper + findValueByCode — MERGED 2026-04-29
- **1416c:** HPG added to WATCHLIST_SEED (26 tickers), disk-scan resolves HPG filenames. 5/5 targeted tests pass. HPG confirmed in live DB — MERGED 2026-04-29
- **1418:** 4 TSC errors fixed in 1383 + 1397c test files. 0 TSC errors. 10 + 5 targeted tests pass — MERGED 2026-04-29
- **1419:** 25 pre-existing test failures resolved → 0. 38 documented skips. 8076 pass, 0 fail — MERGED 2026-04-29
- **1420:** Sprint housekeeping — close 1416, open 1420, sync project-stats.json — MERGED 2026-04-29
- **1421:** QQ1 double-prefix fixed at 2 guard sites (sort_key + period_type) in bctcReparseJob.ts. 20 targeted tests pass. 8090 total pass — MERGED 2026-04-29
- **1422:** BA brownfield check — VCB Mẫu B02a/TCTD-HN total_assets already resolved by 1415b+1416a. DB confirmed total_assets=2,441,928,945 (Q4) + 2,109,260,616 (Q1), validation_status=passed, 0% mismatch. No implementation needed — CLOSED 2026-04-29

---

## Sprint 105–108 — Done Task Details

### 1332 — test(source-health): TDD test pollnews-source-display-name

**Branch:** `task/1332-1333-source-display-name`
**Layer:** test
**Depends on:** none (TDD-first)
**Status:** Done
**Role:** Dev

**Root cause to prove:** `pollNews` calls `globalSourceTracker.recordSuccess("reuters")` using the raw fetcher key. The test (and the health UI) checks `"Reuters RSS"` — a different bucket. The test on line 164-200 of `1227-source-health-empty-result.test.ts` manually seeds failures on `"Reuters RSS"`, then runs `pollNews` with Reuters returning items, then asserts `"Reuters RSS"` status is `"ok"`. But `pollNews` updates the `"reuters"` bucket, not `"Reuters RSS"` — so the assertion fails.

**Files to read first:**
- `src/application/usecases/pollNews.ts` lines 430–475 — the health tracking loop and `recordSuccess`/`recordFailure` call sites
- `src/__tests__/1227-source-health-empty-result.test.ts` lines 124–200 — the two pollNews integration tests

**Files to create:**
- CREATE: `src/__tests__/1332-pollnews-source-display-name.test.ts`

**Test cases (3 required — must FAIL before task 1333 fix):**
1. TC-1: `pollNews` with `reuters: async () => [item]` → `globalSourceTracker.getHealth("Reuters RSS").status === "ok"` (fails: pollNews records under `"reuters"` not `"Reuters RSS"`)
2. TC-2: `pollNews` with `cafef: async () => []` → `globalSourceTracker.getHealth("CafeF RSS").consecutiveFailures > 0` (fails: recorded under `"cafef"`)
3. TC-3: After TC-1, `globalSourceTracker.getHealth("reuters")` is either absent or at default state (confirms old key is no longer used)

**Acceptance Criteria:**

**Given** `src/__tests__/1332-pollnews-source-display-name.test.ts` written before the fix
**When** `bun test src/__tests__/1332-pollnews-source-display-name.test.ts` runs (before task 1333)
**Then** TC-1 and TC-2 FAIL (proving the bug). TC-3 passes.
After task 1333: all 3 pass.
`bun tsc --noEmit` 0 errors.

---

### 1333 — fix(source-health): SOURCE_DISPLAY_NAMES map in pollNews

**Branch:** `task/1332-1333-source-display-name` (same as 1332)
**Layer:** application/usecases
**Depends on:** 1332 (tests written and confirmed failing)
**Status:** Done
**Role:** Dev

**Files to read first:**
- `src/application/usecases/pollNews.ts` lines 430–475 — health tracking loop
- `src/__tests__/1332-pollnews-source-display-name.test.ts` — confirm TC-1 and TC-2 are red

**Files to modify:**
- MODIFY: `src/application/usecases/pollNews.ts`
  - Add constant before the health tracking loop:
    ```ts
    const SOURCE_DISPLAY_NAMES: Record<string, string> = {
      reuters: "Reuters RSS",
      cafef: "CafeF RSS",
      vnexpress: "VnExpress RSS",
      vneconomy: "VnEconomy RSS",
      tradingeconomics: "Trading Economics RSS",
    };
    ```
  - Replace `globalSourceTracker.recordSuccess(name)` with `globalSourceTracker.recordSuccess(SOURCE_DISPLAY_NAMES[name] ?? name)`
  - Replace both `globalSourceTracker.recordFailure(name, ...)` calls with `globalSourceTracker.recordFailure(SOURCE_DISPLAY_NAMES[name] ?? name, ...)`

**Acceptance Criteria:**

**Given** `src/__tests__/1332-pollnews-source-display-name.test.ts` with TC-1+TC-2 failing
**When** fix applied and `bun test src/__tests__/1332-pollnews-source-display-name.test.ts` runs
**Then** all 3 pass.
`bun test src/__tests__/1227-source-health-empty-result.test.ts` — all 8 pass / 0 fail (the 2 pre-existing failures eliminated).
Full suite regression: 0 new failures vs Sprint 107 baseline.
`bun tsc --noEmit` 0 errors.

---

### 1331 — test(ta): TDD test 1330-ta-daily-ohlcv.test.ts

**Branch:** `task/1330-1331-ta-daily-ohlcv`
**Layer:** test
**Depends on:** none (TDD-first)
**Status:** Done
**Role:** Dev

**Files to read first:**
- `src/application/usecases/assembleBriefing.ts` lines 504–535 — current `defaultComputeTa()` signature and return type `TaSignal | null`
- `src/infrastructure/db/schema.ts` lines 134–148 — `daily_ohlcv` schema (code, date, open, high, low, close, volume)

**Files to create:**
- CREATE: `src/__tests__/1330-ta-daily-ohlcv.test.ts`

**Test cases (4 required — written before production change):**
1. TC-1: `daily_ohlcv` has 0 rows for ticker → `defaultComputeTa()` returns null
2. TC-2: `daily_ohlcv` has 14 rows (< 15) → returns null
3. TC-3: `daily_ohlcv` has 20 rows with known close prices → returns non-null `TaSignal` with `code`, `rsi14`, `rsiStatus`, `ma20`, `priceVsMa20`, `currentPrice` all defined
4. TC-4: `daily_ohlcv` has 20 rows where last close > MA20 → `priceVsMa20 === "above"`

**Acceptance Criteria:**

**Given** a fresh `daily_ohlcv` table with synthetic close prices
**When** `bun test src/__tests__/1330-ta-daily-ohlcv.test.ts` runs (before task 1330 fix is applied)
**Then**
- TC-1, TC-2: pass (null return for insufficient data — already correct)
- TC-3, TC-4: FAIL (production code reads `market_prices_history`, not `daily_ohlcv` — proves the bug)
- After task 1330 is applied: all 4 pass
- `bun tsc --noEmit` 0 errors

---

### 1330 — fix(ta): rewrite defaultComputeTa to use daily_ohlcv

**Branch:** `task/1330-1331-ta-daily-ohlcv` (same as 1331)
**Layer:** application/usecases
**Depends on:** 1331 (tests written and confirmed failing)
**Status:** Done
**Role:** Dev

**Files to read first:**
- `src/application/usecases/assembleBriefing.ts` lines 504–535 — full `defaultComputeTa()` function
- `src/__tests__/1330-ta-daily-ohlcv.test.ts` — confirm tests exist and TC-3/TC-4 are red

**Files to modify:**
- MODIFY: `src/application/usecases/assembleBriefing.ts`
  - In `defaultComputeTa()`: replace the `market_prices_history` query with:
    ```sql
    SELECT date, close AS close_price
    FROM daily_ohlcv
    WHERE code = ?
    ORDER BY date ASC
    LIMIT 60
    ```
  - Remove the `GROUP BY date(fetched_at)` grouping and the `AVG(price)` aggregation — `daily_ohlcv` already has one row per day with the official close price
  - Keep the `if (rows.length < 15) return null` guard unchanged
  - Keep all downstream RSI/MA20 computation unchanged — only the data source changes

**Acceptance Criteria:**

**Given** `src/__tests__/1330-ta-daily-ohlcv.test.ts` exists with TC-3/TC-4 failing
**When** fix is applied and `bun test src/__tests__/1330-ta-daily-ohlcv.test.ts` runs
**Then**
- All 4 tests pass / 0 fail
- TC-3: `defaultComputeTa()` returns non-null signal from `daily_ohlcv` data
- TC-4: `priceVsMa20 === "above"` when last close exceeds MA20
- No regression in other TA tests (`bun test` full suite 0 new failures)
- `bun tsc --noEmit` 0 errors

---

### 1329 — fix(test-timeout): 278-cycle-peer-sync DB isolation

**Branch:** `task/1329-test278-timeout`
**Layer:** test (test file only — no production code changes)
**Depends on:** none
**Status:** Done
**Role:** Dev

**Root cause:** `src/__tests__/278-cycle-peer-sync.test.ts` does NOT set `process.env["DB_PATH"] = ":memory:"` at file top. The comment on line 15 incorrectly claims this is impossible; task 1328 (test 137 fix) proved the pattern works — set `:memory:` at line 1 AND inject `getRecentAlertHistoryFn: async () => []` into `buildBaseDeps()`. Without this, the cycle's cooldown `getDb()` calls hit the production SQLite file, causing all 10 tests to timeout at 5s (50s wasted per full suite run).

**Files to read first:**
- `src/__tests__/278-cycle-peer-sync.test.ts` — full file, understand `buildBaseDeps()` and all 10 test call-sites
- `src/__tests__/137-fix-alert-pipeline.test.ts` lines 1–5 — confirm the working pattern for `:memory:` + `getRecentAlertHistoryFn` injection

**Files to modify:**
- MODIFY: `src/__tests__/278-cycle-peer-sync.test.ts`
  - ADD line 1: `process.env["DB_PATH"] = ":memory:";` (before all imports — same pattern as test 1192 and test 137)
  - ADD `getRecentAlertHistoryFn: async () => []` to the `buildBaseDeps()` return object — this automatically covers all 10 tests
  - REMOVE or UPDATE the incorrect comment on line 15 ("We cannot use DB_PATH=:memory: because...") — this comment is wrong; the real reason for past timeout was missing `getRecentAlertHistoryFn`

**Acceptance Criteria:**

**Given** the modified test file
**When** `bun test ./src/__tests__/278-cycle-peer-sync.test.ts` runs
**Then**
- All 10 tests pass / 0 fail
- Total test file runtime under 10s
- `bun tsc --noEmit` 0 errors
- Full suite: 0 new failures vs Sprint 105 baseline (4885 pass, 14 fail pre-existing)

---

### 1327 — test(macro-alert): TDD test 1326-macro-deviation-direction.test.ts

**Branch:** `task/1326-1327-macro-alert-direction`
**Layer:** test
**Depends on:** none (TDD-first — write failing tests before fix)
**Status:** Done
**Role:** Dev

**Files to create:**
- CREATE: `src/__tests__/1326-macro-deviation-direction.test.ts`

**Files to read first:**
- `src/domain/services/macroThresholds.ts` — understand `classifyDeviation()` signature and `MacroStats` type
- `docs/TECH_104.md` — 6 test case input values and assert strings

**Test cases (6 required — all must FAIL before task 1326 is applied):**
1. TC-1 (AC-1): `current=26364, mean=26333, stdDev=12, n=30` → zScore≈+2.6 → summary contains "cao bất thường", not "thấp bất thường"
2. TC-2 (AC-2): `current=26302, mean=26333, stdDev=12, n=30` → zScore≈-2.6 → summary contains "thấp bất thường", not "cao bất thường"
3. TC-3 (AC-3): `current=26375, mean=26333, stdDev=12, n=30` → zScore≈+3.5 → summary contains "cực cao"
4. TC-4 (AC-4): `current=26291, mean=26333, stdDev=12, n=30` → zScore≈-3.5 → summary contains "cực thấp"
5. TC-5 (AC-5): `current=26340, mean=26333, stdDev=12, n=30` → zScore≈+0.6 → summary contains "bình thường"
6. TC-6 (regression): `current=26302, mean=26333.2, stdDev=12, n=30` → summary contains "thấp bất thường", not "cao bất thường"

**Acceptance Criteria:**

**Given** a fresh checkout on `task/1326-1327-macro-alert-direction` before 1326 is applied
**When** `bun test src/__tests__/1326-macro-deviation-direction.test.ts` runs
**Then**
- All 6 tests call `classifyDeviation()` directly — no DB, no HTTP, no Telegram
- TC-2, TC-4, TC-6 fail (proving the bug exists — before-only labels)
- TC-1, TC-3, TC-5 pass (above-mean path already correct)
- After task 1326 is applied: all 6 pass / 0 fail
- `bun tsc --noEmit` 0 errors

---

### 1326 — fix(macro-alert): direction-aware level label in classifyDeviation

**Branch:** `task/1326-1327-macro-alert-direction` (same as 1327)
**Layer:** domain/services
**Depends on:** 1327 (tests written and confirmed failing)
**Status:** Done
**Role:** Dev

**Files to read first:**
- `src/domain/services/macroThresholds.ts` — full file, find `LEVEL_VI` const and line 138
- `src/__tests__/1326-macro-deviation-direction.test.ts` — confirm tests exist and are red

**Files to modify:**
- MODIFY: `src/domain/services/macroThresholds.ts`
  - Add `LEVEL_VI_BELOW: Record<DeviationLevel, string>` with keys `{ normal: "bình thường", elevated: "thấp hơn TB", high: "thấp bất thường", extreme: "cực thấp" }`
  - Rename `LEVEL_VI.extreme` from `"cực đoan"` → `"cực cao"`
  - Replace line 138: `const levelVi = LEVEL_VI[level]` → `const levelVi = direction === "below" ? LEVEL_VI_BELOW[level] : LEVEL_VI[level]`

**Acceptance Criteria:**

**Given** `src/__tests__/1326-macro-deviation-direction.test.ts` exists with 6 failing tests
**When** the fix is applied to `macroThresholds.ts` and `bun test src/__tests__/1326-macro-deviation-direction.test.ts` runs
**Then**
- All 6 tests pass / 0 fail
- AC-2: below-mean high → summary contains "thấp bất thường", not "cao bất thường"
- AC-4: below-mean extreme → summary contains "cực thấp"
- AC-3: above-mean extreme → summary contains "cực cao" (not "cực đoan")
- No other test files regress (`bun test` full suite passes)
- `bun tsc --noEmit` 0 errors

---

### 1328 — fix(test-timeout): 137 Step E tests — DB isolation + missing dep injection

**Branch:** `task/1328-test137-step-e-timeout`
**Layer:** test (test file only — no production code changes)
**Depends on:** none
**Status:** Done
**Role:** Dev

**Root cause:** `src/__tests__/137-fix-alert-pipeline.test.ts` has no `process.env["DB_PATH"] = ":memory:"` at file top. The 4 Step E tests call `runIntelligenceCycle` which internally calls `getDb()` via dynamic imports at multiple points (macro alert step A2.5, step E cooldown, etc.). Without `:memory:` set before module load, these resolve to the real production SQLite file — triggering WAL replay, disk I/O, and potential lock contention. Result: 30s timeout per test × 4 = 120s wasted in every full suite run, masking real regressions.

**Files to read first:**
- `src/__tests__/137-fix-alert-pipeline.test.ts` — full file, identify all 4 Step E test cases
- `src/scheduler/intelligenceCycleJob.ts` lines 585–870 — understand all `getDb()` call sites inside the cycle so we know which deps to inject

**Files to modify:**
- MODIFY: `src/__tests__/137-fix-alert-pipeline.test.ts`
  - ADD line 1: `process.env["DB_PATH"] = ":memory:";` (before all imports — same pattern as test 1192)
  - In all 4 Step E test fixtures (`runIntelligenceCycle` calls), ADD: `getRecentAlertHistoryFn: async () => []` to prevent fallthrough to `getCooldownDb()` real-DB path
  - Verify the 4 existing Step E tests still correctly test their AC (no semantic change — only DB isolation fix)

**Acceptance Criteria:**

**Given** the modified test file
**When** `bun test ./src/__tests__/137-fix-alert-pipeline.test.ts` runs
**Then**
- All Step E tests (4 cases) pass / 0 fail
- Total test file runtime under 10s
- `bun tsc --noEmit` 0 errors
- Full suite: 0 new failures vs baseline (4890 pass baseline from Sprint 104)

---

## Archive — Added 2026-05-13 by dev-team (c59 TASKS.md cap rotation)

**Period:** 2026-05-12/13 c56-c57 | **Rows archived:** 4

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| HEADLOCK-PREFLIGHT-VALIDATED-c57 | OPS-INFO: Step 0-PREFLIGHT fired correctly c57 (6th recurrence, age=1835s, size=0). Self-cure + WORK notify + signal. | INFO | OPS | dev-team | 2026-05-13 |
| ARCH-HEADLOCK-RCA-c56 | ARCH-HIGH: Unified HEAD.lock + worktree RCA brief `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md` (115L). 4 hypotheses ranked. 7 c57 task proposals (T1-T7). Merge SHA `90998723`. | HIGH | ARCH | agents-architect | 2026-05-12 |
| CLEAN-c56-residue+tasks-archive | CLEAN-MEDIUM: 46-file c55 drift bundle + TASKS 202L→79L. 7 atomic commits `702e446f`/`f07e19d7`/`9303e30b`/`816ddcef`/`27bfc2ff`/`e8bb263b`/`1b6baef7`. agent-father session had 3× HEAD.lock recurrence inline (feeds ARCH-HEADLOCK-RCA-c56). | MEDIUM | CLEAN | agent-father | 2026-05-12 |
| HEADLOCK-PREFLIGHT-VALIDATED-c56 | OPS-INFO: Step 0-PREFLIGHT fired correctly c56 (5th recurrence, age=741s, size=0). Self-cure + WORK notify + signal emit `docs/signals/processed/2026-05-12T213640Z-headlock-5th-recurrence.routed-to-po.json`. | INFO | OPS | dev-team | 2026-05-12 |

---

## Archive — Added 2026-05-13 by dev-team (c58 TASKS.md cap rotation)

**Period:** 2026-05-12 c54-c55 | **Rows archived:** 4

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| HEADLOCK-SELFCURE-c55 | FIX-HIGH: HEAD.lock 4th-cycle recurrence RESOLVED via Step 0-PREFLIGHT self-cure guard in `.claude/flows/dev-team/main.md` (age>60s + no live git pid → safe-remove + audit + signal). New protocol `docs/protocols/head-lock-self-cure.md`. Merge SHA `57cbb376`. Phase 5 GREEN. | HIGH | FIX | agent-father | 2026-05-12 |
| WORKTREE-ORPHAN-c55 | FIX-HIGH: SDK worktree auto-cleanup non-fire diagnosed + 2 orphans cleared (`agent-a66e04c8...` + `agent-a4ff5ad5...`). Brief `docs/architecture-briefs/2026-05-12-worktree-orphan-diagnostic.md`. Merge SHA `4cea5eeb`. Escalation: architect needed for SDK lock-timeout + at-exit cleanup guarantee. | HIGH | FIX | ops | 2026-05-12 |
| MCP-DRIFT-list-unresolved-reports | FIX-HIGH: `list_unresolved_reports` 4-cycle drift RESOLVED — interface-layer wiring (35 LOC). 12 TDD tests. toolCount 132→133. Merge SHA `7cf276cf`. mcp-tools.md + project-stats.json updated. | HIGH | FIX | dev-mcp-server | 2026-05-12 |
| WAVE2-RESIDUE-CLEAN-c54 | CLEAN-MEDIUM: c53/c54 boundary residue triage — 18 files, 4 atomic commits (`202c3890`/`fc8a7ac2`/`da9d1a95`/`fccbd163`) + PO bundle (`ccc1f862`) + signals (`8bbf8f3d`). POINTER_INTEGRITY PASS. SPLIT_POLICY FLAG: alert-commander.md 434L→notebook-write skill hard cap 80L. | MEDIUM | CLEAN | agent-father | 2026-05-12 |

---

## Archive — Added 2026-05-12 by agent-father (c56 TASKS.md cap rotation)

Archive of Done tasks. Generated by agent-father at TASKS.md cap rotation. Each entry retains original Sprint/Task ID + completion date. Active TASKS.md is in `docs/TASKS.md`.

**Period:** 2026-05-07 → 2026-05-12 | **Sprints:** 1849–1896 | **Rows archived:** 118

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| 1896b | OPS-RCA (follow-up): c40 02:40 UTC restart RCA — inconclusive-events-expired. Docker retention purged evidence before collection. Sprint 1336 named-volume confirmed intact. No actionable RCA possible. | MEDIUM | RCA | ops | 2026-05-12 |
| 1895b | PHASE-5: Worktree-merge-protocol implementation — Option 2 Structural Sequential Merge Gate. 4 helper scripts (`index-check.sh`, `tree-verify.sh`, `c2-alert.sh`, `recovery-snapshot.sh`). Merge gate inserted at dev-team Step 3 post-tier. `git commit -am` ban codified in 3 docs. AC all pass. | HIGH | IMPL | agent-father | 2026-05-12 |
| 1891a | CHORE: Document SDK-native worktree isolation for parallel Agent spawns — `docs/protocols/agent-chaining-protocol.md` (+18), `docs/policies/dev-standards.md` (+16), `.claude/flows/dev-team/main.md` (+6/-3). Closes TNB c39 finding "parallelism deferral" (6-cycle deferral closed by ARCH-1884 brief). All 6 ACs PASS. Merge SHA 6a7008f0. QA APPROVED 2026-05-12. | MEDIUM | CHORE | developer | 2026-05-12 |
| SPRINT-PARALLEL-ISOLATION | ARCH: Parallel agent dispatch isolation brief — c37 incident, 6-cycle deferral, sequential-only cost. Decision: SDK-native `isolation: "worktree"` per Agent spawn. Output: `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`. 10-section brief, implementation roadmap (5 phases), risk analysis. Unblocks c44+ parallel dispatch. | HIGH | ARCH | architect | 2026-05-12 |
| 1889a | METHODOLOGY-INFRA: financial-analyst flow-edit — Layer 7 (Step 2c) `get_cash_flow` accrual divergence + Layer 8 (Step 3b) `get_investment_clock_phase` + `get_pyramid_tier`. Signal schema ext (cycle_phase + pyramid_tier + earnings_quality_warn). Methodology pointer added. Merge SHA 0031b19d. AC 1-8 PASS. | HIGH | FEATURE | developer | 2026-05-12 |
| NB-HDR-c39 | CHORE: alert-commander/cycle.md Step 5 — replace `<current_sprint>` placeholder with `jq -r '.currentSprint // "idle"' docs/pipeline-state.json` bash expr. Fallback idle on jq failure. ≤5 LOC. Forward-only safe. Merge SHA 5f485e20. AC PASS. | LOW | CHORE | developer | 2026-05-12 |
| 1889a-spec | METHODOLOGY-INFRA: BA spec — financial-analyst flow-edit for Layer 7 (NI vs OCF forensic) + Layer 8 (investment clock phase + pyramid tier). 8 ACs delivered. File edits: `.claude/flows/financial-analyst/cycle.md` (3 new tool invocations + signal schema ext). No production code (flow-doc only). Closes TNB c39 findings #1 + #2. Owner: ba spec. Merge SHA 67b8ecd5. QA APPROVED 2026-05-12. | HIGH | SPEC | ba | 2026-05-12 |
| 1879-spec | METHODOLOGY-INFRA: BA combined spec — EFFR-IORB FRED fetcher (1879a) + `get_fed_liquidity_spread()` tool (1879b). Critical revision: both live in `apps/mcp-server` (NOT macro-indicators). New table `fred_series_daily` with UNIQUE(series, date) idempotency. Scheduler: piggyback `macroIndicatorRefreshJob` (0 6 * * *) — no new cron. 10 ACs + 11 tests total (6 fetcher + 5 tool). Owner: ba spec. Merge SHA d098bb24. QA APPROVED 2026-05-12. | HIGH | SPEC | ba | 2026-05-12 |
| ARCH-1884 | METHODOLOGY-INFRA: Architect brief — forensic-analysis host decision: new microservice vs extend financial-reports module. Output → `docs/architecture-briefs/2026-05-12-forensic-analysis-host.md`. Drives Sprint 1885+1886 placement. Owner: architect. Merge SHA cae59b98. | HIGH | ARCH | architect | 2026-05-12 |
| 1895a | PHASE-5: Worktree-merge-protocol — eliminate index-race in cherry-pick + concurrent agent commits. Design brief APPROVED 2026-05-12. Merge SHA 7bd6b3ed. Follow-up: 1895b implementation task opened (developer or agent-father). | HIGH | ARCH | architect | 2026-05-12 |
| 1878b | METHODOLOGY-INFRA: `compute_accruals(ticker, quarters)` MCP tool — Sloan Accruals Ratio time-series. Pure domain fn (accruals.ts, zero infra imports) + interface tool (computeAccrualsTool.ts). 12/12 tests pass, TSC 0 errors, DDD PASS. toolRegistry #129. Merge SHA ad04be0d. QA APPROVED 2026-05-12. | HIGH | FEATURE | dev-mcp-server | 2026-05-12 |
| signal-T4 | SIGNAL-DEDUP: Doc updates — agent-chaining-protocol.md + tree-map.md (signals.db node). Merge SHA 9bb2d338. QA APPROVED 2026-05-12. | HIGH | CHORE | developer | 2026-05-12 |
| signal-T5 | SIGNAL-DEDUP: QA integration tests for full drain cycle. Depends on signal-T3+T4. QA APPROVED 2026-05-12. | HIGH | FEATURE | qa | 2026-05-12 |
| signal-T6 | SIGNAL-DEDUP: Fallback removal — delete file-scan JSON fallback block. Net -20 LOC. AC 5/5 PASS. Merge SHA f6f57bc5. QA APPROVED 2026-05-12. | HIGH | CHORE | developer | 2026-05-12 |
| 1879a | METHODOLOGY-INFRA: EFFR–IORB FRED fetcher in `apps/mcp-server`. Merge SHA `f7240b5e` + `4756e4f4`. AC 1-6 PASS. QA APPROVED 2026-05-12. | HIGH | FEATURE | dev-mcp-server | 2026-05-12 |
| 1879b | METHODOLOGY-INFRA: `get_fed_liquidity_spread()` MCP tool. DDD PASS, 10/10 it-blocks. QA APPROVED 2026-05-12. Merge SHA mixed into `8bec73d3` (HEAD.lock race incident; forensic evidence for 1895a). | HIGH | FEATURE | dev-mcp-server | 2026-05-12 |
| 1893a | PHASE-4: Sequential-mandate relaxation brief. Merge SHA `10ac3da0`. QA APPROVED 2026-05-12. | HIGH | ARCH | architect | 2026-05-12 |
| 1878a | METHODOLOGY-INFRA: OCF column migration — `operating_cash_flow REAL NULLABLE`. 12/12 tests pass. Merge SHA 1fb5282b. QA APPROVED 2026-05-12. | HIGH | FEATURE | dev-mcp-server | 2026-05-12 |
| 1878a-spec | METHODOLOGY-INFRA: BA spec — `operating_cash_flow` column migration spec. Cherry-pick SHA 5a57f377. QA APPROVED 2026-05-12. | HIGH | SPEC | ba | 2026-05-12 |
| NB-HDR-c38 | CHORE: Notebook header drift bundle — alert-commander/cycle.md + architect/main.md + 3 notebooks. Merge SHA c4e4c1ab. QA APPROVED 2026-05-12. | LOW | CHORE | agent-father | 2026-05-12 |
| 1880b | METHODOLOGY-INFRA: `get_pyramid_tier(asset_class)` MCP tool (#128). DDD PASS, 23/23 tests. Merge SHA cb232b26. QA APPROVED 2026-05-12. | HIGH | FEATURE | dev-mcp-server | 2026-05-12 |
| signal-T3 | SIGNAL-DEDUP: Rewrite dev-team drain Step 0a — SQLite dedup + dual-record write + DELETE-based prune. Merge SHA 2b643ec9. QA APPROVED 2026-05-12. | HIGH | FEATURE | developer | 2026-05-12 |
| signal-T2 | SIGNAL-DEDUP: `scripts/migrations/backfill-signals-db.ts`. 10/10 tests pass. Merge SHA cb232b26. QA APPROVED 2026-05-12. | HIGH | FEATURE | developer | 2026-05-12 |
| 1880a | METHODOLOGY-INFRA: `get_investment_clock_phase()` MCP tool. DDD PASS, 8/8 tests. Merge SHA b6aca505. QA APPROVED 2026-05-12. | HIGH | FEATURE | dev-mcp-server | 2026-05-12 |
| signal-T1 | SIGNAL-DEDUP: `scripts/migrations/create-signals-db.ts` — idempotent schema migration. 7/7 tests pass. QA APPROVED 2026-05-12. | HIGH | FEATURE | developer | 2026-05-12 |
| 1892a-ops | OPS-TRACK: pollNews redeploy — Vinahost vn-news-fetch service. Merge SHA `4439abce`. AC-3 FAILS PUBLICLY (Cloudflare tunnel `/api/*` routing broken, escalated to 1894a). QA: APPROVED. | HIGH | OPS | ops | 2026-05-12 |
| 1892a-dev | DEV-TRACK: pollNews health endpoint + pushNewsHandler extraction + script hardening. Merge SHA `dbed5ba4`. AC: 5-8 PASS. QA: APPROVED. | HIGH | FEATURE | dev-mcp-server | 2026-05-12 |
| 1892b | SPRINT-S: API Gateway `/api/push-*` passthrough routes. Merge SHA `f4141f63`. AC 1-5 PASS. QA: APPROVED. | HIGH | SPRINT-S | dev-api-gateway | 2026-05-12 |
| 1888a | SSOT-CRITICAL: Replace hardcoded "112 tools" in `agents/dev-mcp-server.md` and `flows/ops/cloudflare-mcp.md`. Merge SHA `bb49b82c`. QA: APPROVED. | HIGH | CHORE | developer | 2026-05-12 |
| 1877e-3 | SPRINT-M: `docs/policies/commit-convention.md` — C2-Exempt Commit Categories table. Merge SHA fcef31da. QA APPROVED 2026-05-11. | HIGH | SPRINT-M | developer | 2026-05-11 |
| 1877e-2 | SPRINT-M: Flow tightening — pm/main.md + qa/main.md. Merge SHA f18b359f. QA APPROVED 2026-05-11. | HIGH | SPRINT-M | developer | 2026-05-11 |
| 1877e-1 | SPRINT-M: commit-convention-audit.sh is_c2_exempt guard. QA APPROVED-WITH-DEFERRAL 2026-05-11. | HIGH | SPRINT-M | developer | 2026-05-11 |
| 1877d | SPRINT-S: C3 AC-trailer 77.2% → ≥80%. C3=0.9180. Merge SHA 67fd8a7e. QA APPROVED 2026-05-11. | HIGH | SPRINT-S | developer | 2026-05-11 |
| 1877c | SPRINT-S: C4 scope-vocab remediation — expand canonical vocab 20→52 tokens. C4=0.9826. Merge SHA 9e19cd4b. QA APPROVED 2026-05-11. | HIGH | SPRINT-S | developer | 2026-05-11 |
| 1877b | SPRINT-S: commit-convention-audit.sh signal emission guard. Merge SHA 27e4e0d6. QA APPROVED 2026-05-11. | MEDIUM | SPRINT-S | developer | 2026-05-11 |
| 1877a | SPRINT-S: commit-convention-audit.sh Day-7 Phase B C1/C2 gate. Merge SHA 20005b95. QA APPROVED 2026-05-11. | MEDIUM | SPRINT-S | developer | 2026-05-11 |
| 1872a-2 | SPRINT-S: README.md SSOT pointer updates. Merge SHA fe82b9f9. QA APPROVED 2026-05-11. | MEDIUM | SPRINT-S | developer | 2026-05-11 |
| 1872a-3 | SPRINT-S: docs/ARCHITECTURE.md SSOT pointer updates. Merge SHA fe82b9f9. QA APPROVED 2026-05-11. | MEDIUM | SPRINT-S | developer | 2026-05-11 |
| 1872a-1 | SPRINT-S: tree-map.md — add docs/architecture/ subtree. QA APPROVED 2026-05-11. | MEDIUM | SPRINT-S | developer | 2026-05-11 |
| 1872a-4 | SPRINT-S: mcp-server.md — replace hardcoded '62' scheduler count. Merge SHA a81a1fb4. QA APPROVED 2026-05-11. | LOW | SPRINT-S | dev-mcp-server | 2026-05-11 |
| 1872a-5 | SPRINT-S: api-gateway/domain-model.md — replace hardcoded "all 8 services". Merge SHA 172dfb0e. QA APPROVED 2026-05-11. | LOW | SPRINT-S | developer | 2026-05-11 |
| 1872a-7 | DOCS: README.md:173 heading fix. Merge SHA b43a50d5. QA APPROVED 2026-05-11. SPRINT-S-1872a ALL 8 ACs DONE. | LOW | DOCS | developer | 2026-05-11 |
| 1872a-6 | SPRINT-S: AC8 grep verification. Follow-up 1872a-7 closed gap. DONE 2026-05-11. | LOW | SPRINT-S | developer | 2026-05-11 |
| TNB-c36-6 | SPRINT-S: Architect brief — deploy-verification flow step. Merge SHA `7db7ec0b`. QA APPROVED 2026-05-11. | HIGH | SPRINT-S | architect | 2026-05-11 |
| TNB-c36-4 | FIX: market-watcher cycle.md header-maintenance step. Merge SHA `a35e168c`. QA APPROVED 2026-05-11. | MEDIUM | FIX | agent-father | 2026-05-11 |
| TNB-c36-2 | FIX: agents-architect notebook backfill — 4 missing past briefs. Merge SHA `b8ce2bcf`. QA APPROVED 2026-05-11. | HIGH | FIX | agent-father | 2026-05-11 |
| TNB-c36-3 | CHORE: MEMORY.md broken pointers — 9 stale refs replaced. Merge SHA `43c4a5dd`. QA APPROVED 2026-05-11. | MEDIUM | CHORE | developer | 2026-05-11 |
| 1862c-G | FIX-HIGH: Market-watcher smoke-test probe. Merge SHA `edea59f8`. QA APPROVED 2026-05-11. | HIGH | FIX | developer | 2026-05-11 |
| 1876a-A4 | OPS-LOW: Watchlist threshold diagnostic. VERDICT=FAIL. Triggers 1876a-A5 followup. | LOW | OPS | ops | 2026-05-11 |
| 1876a-A3 | FIX-MEDIUM: Row-count observability in taAlertNotifierJob. SHA `6d1a8db7`. QA APPROVED 2026-05-11. | MEDIUM | FIX | dev-mcp-server | 2026-05-11 |
| 1876a-A2 | FIX-MEDIUM: Bridge-gap warning log in scanMarket. SHA `0a5ffc3f`. QA APPROVED 2026-05-11. | MEDIUM | FIX | dev-mcp-server | 2026-05-11 |
| 1876a-A1 | FIX-HIGH: Fix precision metric denominator (alertAccuracy.ts L340). SHA `6d1ad3af`. QA APPROVED 2026-05-11. | HIGH | FIX | dev-mcp-server | 2026-05-11 |
| 1875c | FIX-HIGH: record_signal_outcome dispatch — defensive observability added. Merge SHA eec8384f. QA APPROVED 2026-05-11. | HIGH | FIX | developer | 2026-05-11 |
| 1873f | FIX-INFRA: Restore pre-push tsc gate. Merge SHA f6501fe3. QA APPROVED 2026-05-11. | HIGH | FIX | developer | 2026-05-11 |
| 1873e | FIX-TS: exactOptionalPropertyTypes strict. Merge SHA eb220ca4. QA APPROVED 2026-05-11. | LOW | FIX | developer | 2026-05-11 |
| 1873c | FIX-TS: noUncheckedIndexedAccess guards. Merge SHA b8758927. QA APPROVED 2026-05-11. | LOW | FIX | developer | 2026-05-11 |
| 1873d | FIX-TS: Narrow RegimeThresholdResult discriminated union. Merge SHA 84d74f4c. QA APPROVED 2026-05-11. | LOW | FIX | developer | 2026-05-11 |
| 1873b | FIX-TS: Add readReuters + readTe to WatchdogPorts options type. Merge SHA 86aa8b81. QA APPROVED 2026-05-11. | LOW | FIX | developer | 2026-05-11 |
| 1871c | SPRINT-S: Add analysis/ and backtesting/ to ARCHITECTURE.md. Merge SHA 22bef183. QA APPROVED 2026-05-11. | MEDIUM | SPRINT-S | developer | 2026-05-11 |
| 1871f | SPRINT-S: Resolve DDD violation — extract vnstock types to domain/models/vnstockTypes.ts. Merge SHA 30030baa. QA APPROVED 2026-05-11. | HIGH | SPRINT-S | dev-mcp-server | 2026-05-11 |
| 1871d | SPRINT-S: Backfill 21 missing jobs in cron-registry.json (41→62 entries). Merge SHA 2bcae2e5. QA APPROVED 2026-05-11. | MEDIUM | SPRINT-S | developer | 2026-05-11 |
| 1871b | SPRINT-S: Expand ARCHITECTURE.md infrastructure/ tree to all 11 subdirs. Merge SHA 6f161a4b. QA APPROVED 2026-05-11. | HIGH | SPRINT-S | developer | 2026-05-11 |
| 1871g | SPRINT-S: Correct alert-policy.md Signal Verdict Lifecycle. Merge SHA 6c939b4b. QA APPROVED 2026-05-11. | HIGH | SPRINT-S | developer | 2026-05-11 |
| 1871e | SPRINT-S: Fix tran-ngoc-bau flow get_agent_signals call. Merge SHA 6c939b4b. QA APPROVED 2026-05-11. | HIGH | SPRINT-S | developer | 2026-05-11 |
| 1871a | SPRINT-S: Reconcile ARCHITECTURE.md + project-stats.json counts. Merge SHA 6c939b4b. QA APPROVED 2026-05-11. | MEDIUM | SPRINT-S | developer | 2026-05-11 |
| 1872b | FIX-MEDIUM: alert_commander skill manifest — add "write_alert_verdict". Merge SHA fb2d6fd2. QA APPROVED 2026-05-11. | MEDIUM | FIX | developer | 2026-05-11 |
| 1872a | FIX-DOC: Add notebook-commit invariant block to 5 cowork flows. Merge SHA cd7fcc09. QA APPROVED 2026-05-11. | LOW | FIX | developer | 2026-05-11 |
| 1870b | FIX-HIGH: Exclude "chưa phân phối" from P_NET_PROFIT regex. SHA b58326e6. | HIGH | FIX | dev-pdf-extractor | 2026-05-11 |
| 1870a | VERIFY-HIGH: FPT BCTC Q4 2025 reparse post-hotfix. FAIL — root cause identified. New task 1870b required. | HIGH | VERIFY | dev-pdf-extractor | 2026-05-11 |
| 1862c | FIX-HIGH: Cowork scheduled-task MCP access RCA. Decomposed into 1862c-D/E/F/G. | HIGH | FIX | architect | 2026-05-11 |
| 1869b-seed | FIX-HIGH: DB migration — populate watchlist alert_drop_pct defaults. SHA 44d5bf2c. | HIGH | FIX | developer | 2026-05-11 |
| 1869b | SPRINT-S: Wire per-watchlist thresholds into scanMarket dispatch. SHA dbefc47c. | HIGH | SPRINT-S | developer | 2026-05-11 |
| 1869a | FIX-HIGH: Raise price_drop threshold -5% → -7%. SHA d884be66. | HIGH | FIX | developer | 2026-05-11 |
| 1865b | FIX-LOW: Extend 1865a/1869c UTC guard to dev-team orchestrator + po flow. SHA daec15ac. | LOW | FIX | agent-father | 2026-05-11 |
| 1869c | FIX-HIGH: Extend 1865a UTC guard to qa-responder + news-scout. | HIGH | FIX | developer | 2026-05-11 |
| 1868d | CHORE-LOW: Cherry-pick handoff sweep (73 archived-task handoffs). Cherry-picked f6483b9d. | LOW | CHORE | code-janitor | 2026-05-11 |
| 1868c | CHORE-LOW: B8-gap — migrate all sessions/ writes to notebook commits across 9 dev-team flow files. QA APPROVED 2026-05-11. | LOW | CHORE | developer | 2026-05-11 |
| 1862i | CHORE-LOW: project-stats.json stale infra status — toolCount 128→132, totalTasksDone 515→555. QA APPROVED 2026-05-11. | LOW | CHORE | ops | 2026-05-11 |
| 1863h | CHORE-M: Migrate stale NULL-outcome agent_signals pruner into dataAuditJob. QA APPROVED 2026-05-10. | MEDIUM | CHORE | developer | 2026-05-10 |
| 1863a | FEATURE-M: Create `infrastructure/fileStore/alertVerdictStore.ts`. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863b | FEATURE-M: Create `scheduler/alerts/verdictResolutionJob.ts` core. QA APPROVED 2026-05-10. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863c | FEATURE-M: Register cron + scheduler wiring. QA APPROVED 2026-05-10. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863d | FEATURE-M: Create `interface/mcp/tools/alerts/alertVerdictTools.ts`. | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1863e | CHORE-M: Update alert-commander flow + tool-package. | MEDIUM | CHORE | developer | 2026-05-10 |
| 1863f | FEATURE-M: Unit tests — verdict logic (10 AC cases). | MEDIUM | FEATURE | dev-mcp-server | 2026-05-10 |
| 1862f | FIX-HIGH: Reuters/TE RSS errors regression — exponential backoff on CircuitBreaker. | HIGH | FIX | developer | 2026-05-10 |
| 1862g | FIX-MEDIUM: urgent_news 4h dedup — postSignal() dedup guard. | MEDIUM | FIX | developer | 2026-05-10 |
| 1862k | OPS-HIGH: vnstock rate limiter deployment — Container rebuilt with RPM 80 + SYNC_DELAY_MS 2500ms. | HIGH | OPS | ops | 2026-05-10 |
| 1862j | FIX-CRITICAL: sigma threshold data safeguard — W-3 dedup aborts if >50% rows would be deleted. | CRITICAL | FIX | developer | 2026-05-10 |
| 1862e | CHORE: Add Error Boundary to 7 pre-standardization dev-team flows. | HIGH | CHORE | agent-father | 2026-05-09 |
| 1862d | FIX-DEPLOY: vnstock_events NOT NULL — verified deployed. No action needed. | MEDIUM | FIX | ops | 2026-05-09 |
| 1862b | FIX-HIGH: report-analyzer enum mismatch — added report_analyzer to SKILL_MANIFEST (13 tools). | HIGH | FIX | dev-mcp-server | 2026-05-09 |
| 1862a | FIX-CRITICAL: vnstock rate limiter tuning — GLOBAL_RATE_LIMIT_RPM 50→80. | CRITICAL | FIX | developer | 2026-05-09 |
| 1860d | SPRINT-S: dev-team flow Step 4.0 — expire_monitoring_reports before Step 4 archive scan. | MEDIUM | SPRINT-S | developer | 2026-05-09 |
| 1860e | SPRINT-S: process_telegram_report delete_success field. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-09 |
| 1860c | SPRINT-S: monitoring report auto-expiry — expireMonitoringReports() 72h TTL. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-09 |
| 1860b | FIX: submit_feedback dedup — insertReportDeduped(), 4h window. | HIGH | FIX | dev-mcp-server | 2026-05-09 |
| 1860a | FIX: process_telegram_report delete guard. | HIGH | FIX | dev-mcp-server | 2026-05-09 |
| 1858c | FIX: logVpsPush() silent failure — safeLogVpsPush wrapper. | HIGH | FIX | developer | 2026-05-08 |
| 1858a | FIX: pollNews all-dark cooldown 4h→24h. | HIGH | FIX | developer | 2026-05-08 |
| 1857a | FIX: vnstock-sync WAL checkpoint (PASSIVE) between stock iterations. | HIGH | FIX | developer | 2026-05-08 |
| 1850c | FIX: HSG price inconsistency — stale change_pct suppressed. Already merged 2aa46a56. | MEDIUM | FIX | developer | 2026-05-08 |
| 1850e | CLEAN: cascade rule gap — chemicals/petrochemicals domain added. | LOW | CLEAN | code-janitor | 2026-05-08 |
| 1856a | FIX: vnstock_events NOT NULL constraint — storeEvents Array.isArray + null-code filter. | HIGH | FIX | dev-mcp-server | 2026-05-08 |
| 1855a | FIX: suppress false pollNews all-sources-dark alert when VPS push pipeline is healthy. | HIGH | FIX | developer | 2026-05-08 |
| 1850d | CLEAN: DBC domain classification — add Dabaco to agriculture sector. | LOW | CLEAN | code-janitor | 2026-05-07 |
| 1851a | FIX: post_agent_signal schema reconciliation. | HIGH | FIX | developer | 2026-05-07 |
| 1851b | FIX: run_impact_chain + post_agent_signal params — news-scout cycle.md. Absorbs 1850b. | HIGH | FIX | developer | 2026-05-07 |
| 1851c | FIX: get_price_history actionCode→code — already fixed in prior sprint. Stale report closed. | MEDIUM | FIX | — | 2026-05-07 |
| 1851d | FIX: market-watcher session append-only — explicit APPEND instruction in cycle.md Step 5. | MEDIUM | FIX | developer | 2026-05-07 |
| 1850g | FIX: PriceAnomalyFindingDataSchema — ref_price/window_days optional. | MEDIUM | FIX | dev-mcp-server | 2026-05-07 |
| 1850a | FIX: vnstock-sync storeShareholders Array.isArray + null-code guards. | HIGH | FIX | dev-mcp-server | 2026-05-07 |
| 1850f | FIX: Polymarket t163-mkt-* test fixtures excluded from prod + staleness tightened 30d→7d. | HIGH | FIX | dev-mcp-server | 2026-05-07 |
| 1849a | SPRINT-S: Schema migration + store functions — resolution tracking on telegram_reports. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-07 |
| 1849b | SPRINT-S: MCP tool + serializeReport upgrade — process_telegram_report resolution param. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-07 |
| 1849c | SPRINT-S: Dev-team flow Step 4 update — monitoring loop guard (C-6). | MEDIUM | SPRINT-S | developer | 2026-05-07 |
| 1849d | SPRINT-S: Tests + regression — telegram report resolution tests. | MEDIUM | SPRINT-S | dev-mcp-server | 2026-05-07 |
| 1850-GAP9 | FIX: get_technical_indicators migrated from market_prices_history to daily_ohlcv. | HIGH | FIX | dev-mcp-server | 2026-05-07 |
| 1876a-A5 | OPS-HIGH **DONE-PARTIAL 2026-05-12 c52**: Re-deploy 1869b-seed migration on prod DB. Standard tier shipped (31 rows -3.0→-7.0 via docker-compose restart mcp-server, commit `7aa5b935`). High-vol gap: 7 tickers (NVL/DPM/REE/VNH/KBC/MWG/TCH) missing from watchlist entirely — seed-data gap, not migration bug. Follow-up: 1876a-A6 DONE c53. | HIGH | OPS | ops | 2026-05-12 |
| 1862c-D | OPS-HIGH: Add `/vn-market/mcp` Cloudflare ingress route — expose StreamableHTTP endpoint to cowork agents. Edit `~/.cloudflared/config.yml`, add ingress rule `path: /vn-market/mcp → http://localhost:3000/mcp` + reload cloudflared. Update cron hints (market-watcher, unified-agent, news-scout flows) from `https://zenmidi.com/mcp` to `https://zenmidi.com/vn-market/mcp`. No Docker rebuild. Tests: `curl -X OPTIONS https://zenmidi.com/vn-market/mcp` → HTTP 204 PASS. Cron hints updated (market-watcher, unified-agent, news-scout). Commit 01c30703. | HIGH | OPS | ops | 2026-05-12 |

---

## c73 archival (2026-05-13) — Backlog compression + Done rotation

### Backlog rows moved from TASKS.md to archive (deferred / queued / low-priority)

| Task ID | Title | Priority | Type | Owner | Archived |
|---------|-------|----------|------|-------|----------|
| 1882a | METHODOLOGY-INFRA: VIRA scraper deploy on Vinahost VPS + `get_vira_snapshot()` MCP tool. SSOT: methodology Layer 2 (VN macro). QUEUED behind 1878-1881. | HIGH | FEATURE | ba → ops + dev-macro-indicators | 2026-05-13 |
| 1883a | METHODOLOGY-INFRA: PMI sub-components fetcher upgrade — break out new orders / employment / prices sub-indices. SSOT: methodology Layer 2.B. QUEUED. | MEDIUM | FEATURE | ba → dev-macro-indicators | 2026-05-13 |
| 1885a | METHODOLOGY-FORENSICS: Beneish M-Score + Piotroski F-Score calculators. BLOCKED on ARCH-1884 (host decision). OCF column (1878a) DONE. | HIGH | FEATURE | ba → host module per ARCH-1884 | 2026-05-13 |
| 1886a | METHODOLOGY-FORENSICS: BTN detectors phase 1 — Cookie Jar Reserve + Big Bath earnings management. BLOCKED on ARCH-1884 + 1885a. | HIGH | FEATURE | ba → host module per ARCH-1884 | 2026-05-13 |
| 1888i | SSOT-LOW: Remove duplicate `max_alerts_per_day: 10` from `agents/alert-commander.md` — point to alert-policy.md SSOT. | LOW | CHORE | agent-father | 2026-05-13 |
| 1888j | SSOT-LOW: Document 9 microservice agents in `docs/references/agent-roster.md`. | LOW | CHORE | developer | 2026-05-13 |
| 1888k | SSOT-LOW: Remove orphaned `AGENT_STARTUP.md` reference in `agents/system-auditor.md` L77. | LOW | CHORE | agent-father | 2026-05-13 |
| 1888m | SSOT-LOW (agent-father c-maintenance): semble-search compliance markers — keep in `.claude/agents/` (auto-switch routing depends on it), append minimal `agent:` YAML stub with version + boundary_rules.scope + KLFL skill ref. | LOW | CHORE | agent-father | 2026-05-13 |
| JANITOR-013 | DRY: SignalTypeEnum re-lists SignalType union in agentSignalTools.ts (2-file change). | LOW | DRY | code-janitor | 2026-05-13 |
| JANITOR-017 | DRY: BROWSER_UA string duplicated in 18 source files across 3 layers. | LOW | DRY | code-janitor | 2026-05-13 |

### Done rows rotated from TASKS.md (c70/c72)

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| 1900-curl-cffi-SHIPPED-c72 | FEATURE-HIGH: Two macro-indicators branches merged in-flight between c71 close (11:40Z) and c72 tick (12:47Z). (1) `1c6a7a01` merge `task/macro-external-allsettled-timeout` (band-aid). (2) `96823f44` merge `task/macro-scrapers-curl-cffi-upgrade` (REAL FIX): yahoo/cnbc/tradingEconomics restored via curl_cffi chrome136 + ThreadPoolExecutor (parallel ~4s, +15MB RAM each). ops rebuild 12:19Z (`39ab15c1`): smoke ok=4/timeout=2/failed=0 vs before ok=1. qa validated. 87 unit tests pass. Calendar still blocked → 1901a FlareSolverr. FRED design-limit → 1901b. | HIGH | FEATURE | dev-mainserver-crawls + ops + qa | 2026-05-13 c72 |
| ops-flow-postrebuild-SHIPPED-c72 | CHORE-INFRA: Mandatory post-rebuild 9-service health check encoded in `.claude/flows/ops/docker.md` § Post-Rebuild Health Verification + back-ref from `flows/ops/main.md` § Docker (commit `212ea95e`, pre-push tsc OK, F4 idiom resolved HEAD.lock mid-commit). Rule: any rebuild/restart MUST run `docker-compose ps` + `docker port 3000` + `/health` curl across all 9 services BEFORE declaring success. Fail → `🚨 POST-REBUILD COLLATERAL` bug-escalation. Lesson from c71 incident (`--force-recreate macro-indicators` knocked port 3000, ~50 min blast radius). c73 follow-up: 1900c-probe-refine. | HIGH | CHORE | dev-team | 2026-05-13 c72 |
| 1894a-CLOSED-c70 | OPS-UNBLOCK (16-cycle blocker FINALLY CLOSED): User added `^/api/*` → `http://localhost:4000` ingress on Cloudflare dashboard between c69/c70. ops verified 12:15Z: https://zenmidi.com/api/push-prices→401 ✓ + push-news→401 ✓ (was 404 for 16 cycles). Lesson: dashboard-managed tunnels require dashboard edits — config.yml is wrong primitive when launchd-plist runs cloudflared in token mode. | CRITICAL | UNBLOCK | user→ops | 2026-05-13 c70 |
