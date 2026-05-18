## Sprint 1944 — VPS BCTC DISCOVERY REPAIR (ACTIVE)

**Status:** Active | **Opened:** 2026-05-18T05:34Z | **Theme:** Restore the BCTC source_url ingestion pipeline so banking Q1-2026 cohort + 27 watchlist tickers stop accumulating `url_not_found`

# Goal

## Vision
Sprint 1942 lifted `get_cash_flow` coverage to 31/33 (94%) via the `vnstock_cash_flow` fallback, and 1943a queue-reset + grace-period auto-retry was wired. But the **upstream BCTC PDF discovery layer is still dead** — diagnosed twice (SPIKE-1916 on 2026-05-14 and SPIKE-1943 on 2026-05-18). `bctcQueueEnricherJob` has never populated `source_url` for any ticker:
- **Strategy 0** (`/proxy/bctc-discover` VPS route): never deployed on `vps-proxy-server.js`; `bctcHttpFetcher.ts` never injects `X-API-Key` → 401/404.
- **Strategy 1** (SSC iboard): `iboard-query.ssc.vn` NXDOMAIN since 2026-04-27.
- **Strategy 2** (cafef FinanceInfo.ashx): migrated 301→404; query params lost.
- **Strategy 3** (vietstock): JS-rendered 404.

The 9 historically-working tickers (VCB/FPT/DIG/BSR/DGC/HPG/SHB/VEA/VNM) got their `source_url` from the **parallel VPS-push pipeline** (`fetch-bctc.sh` + `discover-bctc-urls-browser.py` on Vinahost VPS), not from the enricher. With Q1-2026 deadline 3+ days past (banking cohort 38/38 QUÁ HẠN), the auto-retry shipped in 1943a will fire after grace period and hit the same dead endpoints, then re-park the rows after 6 attempts. The recurring-bug protocol triggered: ≥2 SPIKEs on the same module ⇒ architect root-cause rethink already done; now the FIX must land before any further reparse or backfill work.

## Sprint 1944 sub-tasks (priority: minimum-viable enricher revival first)

### TIER 1 — Make the canonical VPS discovery route real (the minimum viable fix)
- **1944a — VPS `/proxy/bctc-discover` route + `X-API-Key` header injection.**
  Add `GET /proxy/bctc-discover/:ticker?year=&quarter=` to `vps-scripts/vps-proxy-server.js` that shells out to the existing working `discover-bctc-urls-browser.py` script. Extend `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` to inject `X-API-Key: ${Bun.env.VPS_PUSH_API_KEY}` whenever the request URL matches the Vinahost VPS host (`125.212.251.27:8765`). Zones: `multi` (`vps-scripts/` + `apps/mcp-server/`). Architect must split the brief into per-zone tasks before dev pickup.
  **AC:** Live probe `GET http://125.212.251.27:8765/proxy/bctc-discover/DPM?year=2025&quarter=4` with `X-API-Key` returns 200 + array of source URLs. `bctcQueueEnricherJob` next tick populates `source_url` for ≥10 of the 27 currently-`url_not_found` tickers. No new 401s in `tool-bctcqueueenricher.log`.

### TIER 2 — Retire or replace the dead non-canonical strategies
- **1944b — Replace dead cafef Strategy 2 OR delete it.**
  `s.cafef.vn/Candles/FinanceInfo.ashx` is permanently 404 after the cafef.vn migration. Either: (a) replace with `cafef.vn/tai-lieu-tai-chinh/<ticker>/bctc` after probing whether it's static or JS-rendered, or (b) delete the strategy and log a permanent deprecation note. Strategies 1 (SSC iboard NXDOMAIN) and 3 (vietstock JS-rendered) get the same treatment: comment with `DEPRECATED-YYYY-MM-DD` + reason; do not waste cycles re-probing dead endpoints.
  **AC:** `bctcDiscovery.ts` strategy list has zero strategies that throw or return 0 every time. Either the strategy is wired to a live endpoint, or it is removed/no-oped with a deprecation comment. Tests: at least one strategy returns ≥1 URL for VCB and DPM in dev.
  **Sequencing:** Land after 1944a. 1944a is the canonical path; 1944b is hardening / dead-code cleanup.

### TIER 3 — Verify the chain end-to-end
- **1944c — End-to-end smoke verification + watchlist coverage report.**
  After 1944a deploys and one `bctcQueueEnricherJob` + one `bctcBatchSweepJob` tick has run, produce a smoke report: how many of the 27 `url_not_found` tickers now have populated `source_url`, how many PDFs were fetched via the VPS pull pipeline (`mcp-server` pulls from `VPS:8765/bctc-files/`), how many entered `bctcReparseJob`, how many ended up in `financial_reports` with Q1-2026 rows. Report into `reports/TASK_REPORT_1944c.md`. Zone: `apps/mcp-server/` (read-only verification + report-only task — ops + dev-mcp-server collaboration).
  **AC:** Smoke report exists with concrete counts. ≥5 of the 7 watchlist banks (ACB/BID/CTG/EIB/MBB/VCB/VPB) have either a Q1-2026 row in `financial_reports` OR a populated `source_url` + `bctc_vps_queue.status='fetched'` row. If 0 banks file Q1-2026 via the upstream feed despite a working enricher, ops files an SSC ingestion lag feedback to PO (separate ticket).

## Scope
IN: 1 VPS route addition + 1 fetcher header tweak (1944a), 1 strategy cleanup task (1944b), 1 verification report (1944c). Architect brief on per-zone task split for 1944a (the only `multi` task).
OUT: New BCTC fetchers beyond the canonical VPS pull pipeline; OCR/extraction work (1942c already covered the steel-sector label gap; net_profit bridge 1941d already shipped); calendar deadline rewrites (SPIKE-1943 confirmed calendar logic is correct); new microservices.

## Success Metric
- **AC-1 (PRIMARY):** `bctc_vps_queue` `source_url IS NOT NULL` count rises by ≥10 within 24h of 1944a deploy. Baseline = 12 (the 9 historically-working VPS-pushed tickers + 3 ad-hoc). Target = ≥22.
- **AC-2:** `tool-bctcqueueenricher.log` shows ≥1 line of `source_url populated` per ticker for the previously-failing 27. Zero new 401 lines from the VPS endpoint.
- **AC-3:** After one full enricher + sweep cycle, ≥5 of 7 watchlist banks have ingested Q1-2026 BCTC (or PO escalates SSC ingestion lag as separate ticket).
- **AC-4:** Strategy list in `bctcDiscovery.ts` no longer contains live strategies hitting permanently-404/NXDOMAIN endpoints.

## Sequencing
- 1944a is the minimum viable fix. Architect brief on per-zone split lands first → ops handles the VPS-side route, dev-mcp-server handles the `bctcHttpFetcher` header injection. Parallel within the same task once split.
- 1944b lands after 1944a (cleanup is meaningless until the canonical path works).
- 1944c is the closing verification — runs ≥1 enricher cycle after 1944a + 1944b deploys.

## Architect brief required
- **ARCH-1944** — Per-zone task split for 1944a (the only `multi` task). Output → `docs/architecture-briefs/2026-05-18-vps-bctc-discover-route-zone-split.md`. ≤2 pages. Blocks 1944a only.

## Carry-forwards monitored (not in-scope this sprint)
- 1941b OBSERVE gate 2026-05-25 (signal_outcomes seeding window — verify ≥30 resolved rows)
- 1922g OBSERVE gate 2026-06-01 (pharma_events cron tick)
- 1907a USER-ACTION (Claude Desktop restart for digest-predict MCP)
- 1897b USER-ACTION (Docker .git/ exclusion for VirtioFS HEAD.lock)
- alert-precision-488-unknowns MONITORING (HOLD until ≥550)
- BA-1942d DEFERRED (accuracy digest frontend card — LOW; out-of-scope this sprint, can pick up after 1944 if 1944a/b/c finish early)
- **FA coverage post-1942 verification:** financial-analyst next live cycle (~23:00 UTC tonight) should report ≥20/30 BCTC analyses (vs prior 3/38). If post-1942 cycle still reports 3/38 → bug task to dev-mcp-server (Docker rebuild or 1942 deploy gap).

---

## Sprint 1942 — WATCHLIST FUNDAMENTALS COVERAGE (DONE)

**Status:** DONE | **Closed:** 2026-05-18 | **Theme:** Lift FA coverage from 3/30 to ≥20/30 watchlist tickers

**Outcome:** SHIPPED. `get_cash_flow` coverage 31/33 = 94% (sprint goal ≥20/30 EXCEEDED). All 4 tasks QA-approved: 1942a (vnstockStartupProbe), 1942b (cashFlowTool fallback + backfillOCFForWatchlist), 1942c (HPG OCF all-zeros fix — 3-key fallback + MFG steel label + NULL policy), 1943a (BCTC queue reset + grace-period auto-retry). toolCount 140→142. Docker rebuilt and healthy. ARCH-1942 brief in `docs/architecture-briefs/2026-05-18-watchlist-fundamentals-cadence.md`. Reports: `reports/TASK_REPORT_1942a.md`, `reports/TASK_REPORT_1943a.md`. Carry-forward: BA-1942d (accuracy digest frontend card — LOW, deferred to post-1944).

---

## Sprint 1920 — DB PIPELINE COMPLETENESS (COMPLETE)

**Status:** COMPLETE | **Closed:** 2026-05-16 | **Theme:** Every table feeds Cowork analysis

# Goal

## Vision
Cowork agents (financial-analyst, market-watcher, news-scout, unified-agent, alert-commander) need a **complete Vietnam-market picture**. Today ~10 SQLite tables across the 9 microservices are silent zombies — schema exists but no scheduler pushes data, or the writer exists but is wired to nothing. Sprint 1920 makes every defined table active or formally retires it. After this sprint, `freshnessSlaMonitor` covers 100% of declared tables, and the data-audit job has zero "stale" findings on the Cowork-critical surface.

## Sprint 1920 sub-tasks (priority order: Cowork-impact)

### TIER 1 — Financial / fundamentals (highest analyst impact)
- **1920a** — Wire `vnstockStore` upserts into a fundamentals refresh scheduler (quarterly cadence). Today `vnstockStore.ts` has writers for `vnstock_financials` / `vnstock_balance_sheet` / `vnstock_cash_flow` / `vnstock_events` / `vnstock_officers` / `vnstock_shareholders` / `vnstock_trading_stats` (7 tables) but ZERO scheduler invokes them. Financial-analyst PE/PB/ROE peer comparisons silently fall back to NULL today.
- **1920b** — Wire `bondMaturityStore.insertBondMaturity` into a scheduled poller. `bond_maturity` table currently zero-rows; news-scout / unified-agent cannot detect upcoming bond rolls.

### TIER 2 — Macro / external (regime + cycle inputs)
- **1920c** — Wire `commodityTracker` into a scheduler. `commodity_prices` / `commodity_prices_history` have writers (also shared with `shippingIndex.ts`) but no cron — Phase-clock / regime detection in financial-analyst loses commodity input.

### TIER 3 — Cowork analysis surface (alert/intelligence enrichment)
- **1920d** — Wire `broker_sanctions` ingestion into a quarterly SSC sweep. broker-credibility tool returns empty today.
- **1920e** — Wire `BacktestResultRepo.recordRun` into a closed-loop call from `cascadeBacktestJob` (rule-firing → outcome → backtest_runs persisted). Or formally retire backtest_runs if dual-stored elsewhere.

### TIER 4 — Internal observability (system health for Cowork debugging)
- **1920f** — Activate `signal_quality_audit` writer in `signalValidator` (currently only commented "future"). Helps QA agent + report-analyzer flag systematic agent-prompt regressions.
- **1920g** — Activate the `prediction_claims` auto-population path (today only written from manual evidenceTools MCP call). Wire from intelligenceCycleJob output so claims accumulate without user input.

### TIER 5 — Formal retirement (no analyst value)
- **1920h** — Drop or document-as-deprecated: `skips`, `user_requests` (replaced by `ask_queue` per docs) — zero writers anywhere. Update `schema-system.ts` with explicit DEPRECATED comment block or DROP if no read path.

## Scope
IN: scheduler wiring for 10 zombie tables (or formal retirement decision), `freshnessSlaMonitor` extension, 1 architect brief on shared cadence vs per-source-tier cadence.
OUT: rewriting fetchers (use existing infrastructure); UI changes; new microservices; backtest engine work beyond hooking the existing repo.

## Success Metric
- AC-1: Every Sprint-1920 task either ships a scheduler entry in `cronConfig.ts` OR a formal deprecation note in `schema-system.ts`.
- AC-2: `freshnessSlaMonitor` reports `coverage_pct >= 95%` of declared tables.
- AC-3: cowork agents financial-analyst + market-watcher each successfully query at least one of the newly-wired tables in a daily-review cycle with non-empty result.
- AC-4: Zero "Cheerio-selector-broken-style" surprises — for every wired source, runbook + circuit-breaker + WORK channel alert on fetch failure.

## Sequencing
- 1920a / 1920c are independent (TIER 1 & 2, parallel-able).
- 1920b / 1920d follow 1920a (share the `vpsProxyWatchdog` infrastructure).
- 1920e / 1920f / 1920g are pure code wiring (no external HTTP) — can ship any order after Docker DNS unblocks.
- 1920h is doc-only, can ship anytime.

## Docker dependency
Some sub-tasks (1920a/b/c/d) require redeploy to take effect. Tasks themselves can be coded today on `main`; deploy queued for next Docker restart (post-1919).

## Architect brief required
- **ARCH-1920** — Cadence policy: per-source-tier (T1/T2/T3) cadence vs per-domain (fundamentals quarterly / macro daily / news 15-min). Output → `docs/architecture-briefs/2026-05-15-db-pipeline-cadence-policy.md`. Blocks 1920a/b/c until landed.

---

## Sprints 1878–1881 + ARCH-1884 — ACTIVE

**Status:** Active | **Scheduled:** 2026-05-11 | **Theme:** TNB methodology infrastructure foundations

# Goal

## Vision
Stand up the missing data and tool surface that the TNB methodology layers (Cash-Flow Reality, Liquidity, Regime, Source-Tier) require, so forensic analysis sprints (1885, 1886) and the deferred Virtual Capital sprint (1887) have ground truth to compute against.

## In-Flight Sprints
- **1878** — OCF column migration (`schema-financial-reports.ts`) + vnstock cash-flow sync wiring + `compute_accruals(ticker, quarters)` MCP tool. Layer 7.
- **1879** — EFFR–IORB FRED fetcher (`apps/macro-indicators`) + `get_fed_liquidity_spread()` MCP tool. Layer 2.D.
- **1880** — `get_investment_clock_phase()` + `get_pyramid_tier(asset_class)` MCP tools (pure functions over existing macro snapshot). Layer 8.
- **1881** — Source-tier `1|2|3` tag retrofit on ~15 macro/news tool outputs. Layer 9.
- **ARCH-1884** — Architect brief: forensic-analysis host (new microservice vs extend financial-reports). Output → `docs/architecture-briefs/2026-05-12-forensic-analysis-host.md`. Parallel to 1878.

## Queued Behind
- **1882** — VIRA scraper deploy + `get_vira_snapshot()`.
- **1883** — PMI sub-components fetcher upgrade.

## Blocked
- **1885** — Beneish M-Score + Piotroski F-Score (needs ARCH-1884 + 1878).
- **1886** — BTN detectors phase 1: Cookie Jar + Big Bath (needs ARCH-1884 + 1885).

## Deferred
- **1887** — Virtual Capital / related-party graph detector. Separate architect brief required first (see Deferred table in TASKS.md).

## Scope
IN: schema migration, FRED fetcher, 5 new MCP tools, source-tier metadata retrofit, 1 architect brief.
OUT: forensic score computation (1885), BTN detectors (1886), graph analysis (1887), any UI/Cowork agent changes, BCTC reparse work.

## Success Metric
- 1878a: `operating_cash_flow` column present in `financial_reports` schema; vnstock cash-flow sync writes verified end-to-end.
- 1878b: `compute_accruals(ticker, quarters)` returns numeric series for VCB and FPT non-null.
- 1879a/b: EFFR + IORB ingested; `get_fed_liquidity_spread()` returns spread + 30d trend.
- 1880a/b: `get_investment_clock_phase()` returns enum from {Recovery, Overheat, Stagflation, Reflation}; `get_pyramid_tier()` returns valid tier.
- 1881a: ~15 macro/news tool outputs carry `source_tier ∈ {1,2,3}`.
- ARCH-1884: brief committed at `docs/architecture-briefs/2026-05-12-forensic-analysis-host.md` with explicit host pick + rationale.

---

## Sprint 1888 — BACKLOG (renumbered from 1878 SSOT)

**Status:** Backlog | **Scheduled:** TBD post 1878–1881

# Sprint 1888 Goal

## Vision
Eliminate all SSOT conflicts across agent definitions, knowledge files, and registry data so every count and reference resolves to a single authoritative source.

## Scope
11 SSOT anomalies — hardcoded tool/agent/scheduler counts in agent definitions and flows, stale tool-registry.json, agent-roster self-contradiction, wrong session_log paths, inlined task size rules, orphaned AGENT_STARTUP.md reference, undocumented microservice agents. (Originally numbered 1878a–k; renumbered to 1888a–k when 1878 was reassigned to the methodology-infra OCF sprint on 2026-05-11.)

## Success Metric
- Zero hardcoded tool/agent/scheduler counts in agent .md or flow .md files.
- tool-registry.json toolCount matches project-stats.json (132).
- agent-roster.md analysis team count consistent.
- analysisAgentCount in project-stats.json matches agent-roster.md.
- session_log paths resolve to real filenames.
- No orphaned file references.

---

## Sprint 1862 — ACTIVE (carry)

**Status:** Active (4 carry tasks: 1862c-D/E/F/G) | **Last touched:** 2026-05-11

Stabilize data pipeline reliability (vnstock + RSS), eliminate signal noise (dedup), and correct stale system metadata. TNB audit cycles 21-22. **Carry items:** 1862c-D/E (ops-gated, Cloudflare config), 1862c-F (rebuild-gated), 1862c-G (observation-gated post D+E).

---

## Sprint 1860 — DONE

**Status:** DONE | **Closed:** 2026-05-09

BUG channel hygiene: 3 root causes making BUG channel unusable (old messages never deleted, monitoring reports accumulate forever, identical reports filed every cycle). 5 tasks: 2 FIX (recurring bugs) + 3 SPRINT-S.

---

## Sprint 1858 — DONE

**Status:** DONE | **Closed:** 2026-05-08

2 FIX: pollNews all-dark cooldown 4h->24h (1858a) + logVpsPush silent failure fixed with safeLogVpsPush wrapper (1858c).

---

## Historical

Full history: `docs/TASKS_ARCHIVE.md` (Sprints 1777–1848)

---
