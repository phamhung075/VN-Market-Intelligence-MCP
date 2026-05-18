## Sprint 1942 — WATCHLIST FUNDAMENTALS COVERAGE (ACTIVE)

**Status:** Active | **Opened:** 2026-05-18 | **Theme:** Lift FA coverage from 3/30 to ≥20/30 watchlist tickers

# Goal

## Vision
Sprint 1941 shipped the OCF guard + accuracy digest + FPT net-profit fix — but the financial-analyst (FA) only has BCTC data for **3/30 watchlist stocks** (VCB, FPT, HPG). The other 27 stocks return "Chưa có dữ liệu" for 5+ FA cycles in a row. The 1941a OCF-guard COALESCE only helps where `operating_cash_flow` (vnstock API bridge) is populated — and 1878a wired the schema column but no scheduler back-fills it for the broader watchlist. Net effect: 90% of the watchlist runs the FA pillar with NULL fundamentals, so PE/PB/ROE peer comparisons fall back to medians, kinh_dich runs without earnings input, and Layer 7 forensic gate is dead-on-arrival. Sprint 1942 fixes the coverage gap so the methodology infrastructure built in Sprints 1878–1941 actually fires across the watchlist.

## Sprint 1942 sub-tasks (priority: highest FA-coverage gain per ticket)

### TIER 1 — Watchlist BCTC + API-bridge back-fill (the analyst blocker)
- **1942a** — Wire `vnstockStore` quarterly fundamentals back-fill into a scheduler that runs against the **full 30-ticker watchlist** (not just whoever happened to be in vnstock cache). Today `vnstockStore.ts` has writers for 7 tables but no cron actually iterates the watchlist. AC: after one cron tick, `vnstock_financials` + `vnstock_balance_sheet` + `vnstock_cash_flow` each have ≥25/30 watchlist rows for the latest quarter present in vnstock upstream. Carry-forwards Sprint 1920a scope but scoped to watchlist breadth, not all tables.
- **1942b** — Extend the 1878a OCF API-bridge back-fill (`operating_cash_flow` column on `financial_reports`) to the full watchlist on a recurring cadence (not one-shot). Today 1941a's COALESCE only helps tickers whose `operating_cash_flow` is populated; the bridge job needs to iterate watchlist + recent N quarters every cron tick. AC: ≥25/30 watchlist tickers have non-null `operating_cash_flow` for at least Q4-2025 after one tick. Companion to 1942a (different storage path: BCTC store vs vnstock store).

### TIER 2 — Sibling-extraction fixes uncovered by 1941d
- **1942c** — `cashFlowTool` HPG case: returns all-zero (net_rev=0, EPS=0, OCF=0) even though VCB/FPT extract non-zero. Same shape as 1941d (net_profit) but on a different ticker + different columns. Spec required from BA on the extraction-vs-bridge fallthrough policy for HPG steel sector BCTC layout. AC: `get_cash_flow("HPG")` returns non-null non-zero values for at least net_revenue + operating_cash_flow on the latest filed quarter.

### TIER 3 — Surface accuracy badges in frontend (consume 1941c output)
- **1942d** — Frontend dashboard page: render the daily `accuracyDigestJob` output (top-3 / bottom-3 signal accuracies) as a card on the dashboard root. Backend digest text now lives in WORK telegram only; user wants visual surface. AC: `apps/frontend/app/routes/_index.tsx` (or new `dashboard.accuracy.tsx`) renders top-3/bottom-3 from a new gateway endpoint that calls `getSystemAccuracyDigestStats`. Wires the closed-loop signal-feedback into user-visible output. Optional if 1942a/b take the whole sprint.

## Scope
IN: 2 scheduler/job wiring tasks (1942a, 1942b), 1 extraction-bug FIX (1942c), 1 frontend rendering task (1942d, optional).
OUT: New BCTC fetchers (use existing infrastructure), new microservices, methodology brief work (1885/1886 still blocked), TNB-critic-gate downstream evolution.

## Success Metric
- **AC-1 (PRIMARY):** financial-analyst next live cycle (post-deploy of 1942a+1942b) reports ≥20/30 watchlist tickers with non-empty BCTC analysis instead of "Chưa có dữ liệu". Baseline = 3/30. Target = 20/30. Stretch = 25/30.
- **AC-2:** Zero Layer-7 OCF anomaly flags fired on tickers that have `operating_cash_flow` populated (the COALESCE path must actually fire). VCB/FPT specifically must no longer flip `earnings_quality_warn=true` on the bridge path.
- **AC-3:** `get_cash_flow("HPG")` returns non-null non-zero net_revenue + OCF for at least the latest filed quarter.
- **AC-4 (if shipped):** Dashboard renders accuracy digest top-3/bottom-3 card with live data from gateway.

## Sequencing
- 1942a + 1942b are independent — parallel-able once architects approve cadence + watchlist source-of-truth (use `docs/data/system-map.json` watchlist key, not hardcoded).
- 1942c depends on the 1942b API-bridge populating HPG's `operating_cash_flow` first to verify the COALESCE path works before chasing the OCR extraction.
- 1942d is independent of all backend tasks — frontend zone, can ship anytime.

## Architect brief required
- **ARCH-1942** — Cadence + ordering policy for watchlist back-fill: quarterly batch vs continuous polling vs on-demand? Output → `docs/architecture-briefs/2026-05-18-watchlist-fundamentals-cadence.md`. Blocks 1942a + 1942b until landed (lightweight — should be a 2-page brief).

## Carry-forwards monitored (not in-scope this sprint)
- 1941b OBSERVE gate 2026-05-25 (signal_outcomes seeding window)
- 1907a USER-ACTION (Claude Desktop restart for digest-predict MCP)
- 1897b USER-ACTION (Docker .git/ exclusion for VirtioFS HEAD.lock)
- alert-precision-488-unknowns MONITORING (HOLD until ≥550)
- **SPIKE-1943** (PO c181 from TNB c68 Finding #2) — Diagnose BCTC Q1-2026 banking cohort 3+ days past 15/05 deadline (calendar stale vs SSC ingestion lag vs filings missing). Architect time-box 120 min. Output: `docs/spikes/SPIKE_1943-bctc-banking-q1-2026-deadline-delay.md`.

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
