# BA — Notebook

**Last updated:** 2026-07-01 | **Sprint:** FIX-BCTC-BANK-SUMMARY-MAPPING

## BA-FIX-BCTC-BANK-SUMMARY-MAPPING · 2026-07-01

Spec complete. REQ file: `docs/handoffs/BA-FIX-BCTC-BANK-SUMMARY-MAPPING.md`. Zero PO blockers. 13 numbered ACs (success_metric a-e carried verbatim as AC-5..AC-9). NEXT: architect — MANDATORY root-cause SPIKE (live gateway) FIRST, zone SPLIT after (3rd re-fire over 15d, feedback_recurring_bug_escalation).

Key BA findings (live-probed named-volume market.db `vn-market-intelligence-mcp_market_data` via docker exec bun:sqlite — 5 decoy volumes confirmed live but unmounted): defect reconfirmed unchanged (CTG total_assets=0, net_margin_pct=229157%, confidence=0.5625, validation_status=low_confidence; VCB clean/passed). **CRITICAL counter-finding contesting the sprint's own defect_raw_evidence claim** ("raw extraction already correct for banks"): CTG `bctc_table_rows` show 20/55 (36%) rows with `code=NULL` and BOTH current+prior period numbers garbled into the `label` string (Roman-numeral/section headers unparsed), vs VCB 0/57 (0%) — clean `code="I"/"II"/"IV"/"VI"` with `value_current` populated. Also found CTG-only section-boundary contamination (IS lines tagged `statement_section='balance_sheet'`, same class as sibling sprint FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT's FM-VCB-1) and code collisions (`code="21"` reused ×4, `code="13"` reused ×2) — `findByCode` unreliable for CTG. This evidence is carried into architect's AC-1 SPIKE as a MUST-RECONCILE input — may mean `dev-pdf-extractor` owns part of the fix, not only `dev-mcp-server` `bctcScalarAggregator`. Grep-confirmed identity-serve-guard (`[CORRUPT DATA — SKIP]`) exists in exactly ONE handler (`get_financial_summary`, reports.ts) — its own test docstring self-scopes to that tool only; `get_bctc_full` (bctcFullTools.ts) and a 3rd path `compare_financials` (reports.ts, independent `fetchRow()`) both re-query `financial_reports` directly with NO guard call — BA classification: never-fired design-time scope gap, not a regression (architect/dev-mcp-server to ratify). Non-regression baselines pinned live: FPT 2026-Q1 already `validation_status=failed` pre-fix (unrelated cause, cross-linked to FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT — no-worse floor, not a fix target here); FPT 2025-Q4 (`passed_with_warnings`) and VNM 2025-Q4 (`passed`, identity holds exactly) are the clean reference rows; VNM 2026-Q1 is a 0-row/`refine_status=PENDING` pipeline gap (FIX-BCTC-ENRICH-SILENT-0ROWS territory, excluded — not a bank ticker either).

Decision journal (task_id: BA-FIX-BCTC-BANK-SUMMARY-MAPPING): see `docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-ba.md`.

**Last updated:** 2026-07-01 | **Sprint:** DASH-CRON-RECHECK-TABLE

## BA-DASH-CRON-RECHECK-TABLE · 2026-07-01

Spec complete. REQ file: `docs/handoffs/BA-DASH-CRON-RECHECK-TABLE.md`. Zero PO blockers. Five ARCH-RATIFY items (non-blocking). NEXT: architect (zone SPLIT: dev-mcp-server status-compute+REST / dev-frontend proxy+table). 29 ACs total covering all 5 sprint success_metric (a)-(e) + 4 standing gates.

Key BA findings (live-verified): CRONS map = 85 Layer-A entries (no hardcode — derived at runtime). Layer-B = 14 `.claude/commands/crons/*.md` command files + 4 cron-detect-loop crons + 1 cron-cowork-team master dispatcher. Critical job-name mismatch: CRONS key (e.g., `ohlcvDailyAggregator`) ≠ cron_job_runs DB name (e.g., `ohlcv-daily-aggregator`) — WATCHDOG_MANIFEST keys ARE the real DB names for 16 jobs; remaining crons need ARCH-RATIFY-CN-1 resolution strategy. `get_cron_health` gap confirmed: emits last_run/last_status but zero expected-vs-actual classify — that IS the sole compute gap. WATCHDOG_MANIFEST cadenceMs × thresholdMultiplier is the PARITY oracle — any job the watchdog would alert on MUST show MISSED/STALE (AC-9 gate). Layer-B SESSION_SCOPED honesty rule is AC-13/AC-14 — enforced as non-red always.

Decision journal (task_id: BA-DASH-CRON-RECHECK-TABLE):
- what-considered: "(A) Status enum: 4-value (watchdog only has healthy/stale) vs 5-value — CHOSEN 5-value (ON_TIME/LATE/MISSED/STALE/NEVER_FIRED) to expose the LATE zone between cadence and threshold, giving the user more signal. (B) Layer-B cron source: read .md files at startup vs static baked list — CHOSEN filesystem read at startup (aligns with 'never bake' mandate + ARCH-RATIFY-CN-5 for architect to ratify). (C) Layer-B last_fire: null vs SESSION_SCOPED label — CHOSEN null + SESSION_SCOPED status + reason field (honest-null, no fabrication)."
- why-change: "No divergence from sprint vision. ARCH-RATIFY items added because cadence derivation for time-window-restricted expressions (EC-2) and job-name resolution (EC-1) are implementation decisions that need architect judgment, not BA scope-change."

**Last updated:** 2026-07-01 | **Sprint:** PREDICTION-EVIDENCE-REVIVAL

## BA-PREDICTION-EVIDENCE-REVIVAL · 2026-07-01

Spec complete. REQ file: `docs/handoffs/BA-PREDICTION-EVIDENCE-REVIVAL.md`. FOUR PO blockers (B1=Sharpe>1.0 hard-gate vs advisory intent, B2=insider_accumulation zero-yield in-scope?, B3=decouple FIX-PREDICTION-SIGNALS-EMPTY?, B4=baseRateComputationJob cadence upgrade in-scope?). NEXT: po (blockers must resolve before architect SPLIT).

Key BA findings (live-probed named-volume market.db via docker exec bun:sqlite, overrides router framing): LR compute job (baseRateComputationJob, Task 1122) ALREADY EXISTS + runs weekly successfully — not missing/broken, input-starved: evidence_fragments=48 rows, 100% foreign_flow_institutional (monoculture CONFIRMED live). 13/14 known evidence_types have 0 live fragments (TTL-expired since ~05-24, no producer since) — their LR rows frozen forever at 05-24 seed. Found 2nd bug independent of sample growth: get_evidence_summary hardcodes LR lookup to (evidence_type,"bullish",10) regardless of fragment's own direction — masks the ONE currently-TRUSTED live row (foreign_flow_institutional/bearish/5d n=18) as UNTRUSTED. Root cause of monoculture: only 2 scheduler cron jobs write fragments (foreignFlowAlertJob live; insiderCheckJob runs daily but 0 insider_accumulation fragments ever — needs honest-zero-vs-bug probe); NO cowork agent (news-scout/bctc-analyst/market-watcher) ever calls record_evidence_fragment — tool exists+granted in SKILL_MANIFEST but absent from their tools_package docs and flow steps entirely (they don't know it exists). "Sharpe>1.0 gate unsatisfiable at n=0" traced to an UNWIRED identity-level workflow block in digest-predict/init.md (never called from daily-predict.md); actual coded P-5 gate only neutralizes LR to 1.0, never blocks create_prediction_claim — backtest_runs table has 45 live rows (not empty). FIX-PREDICTION-SIGNALS-EMPTY traced to predictionMarketJob.ts (Polymarket poll) — code-distinct pipeline from the LR chain, NOT auto-resolved by work-items (a)/(b).

Decision journal (task_id: BA-PREDICTION-EVIDENCE-REVIVAL):
- what-considered: "Accept PO's n=0/missing-job/Sharpe-hard-gate/same-chain framing verbatim — REJECTED all four on live probe; see docs/agent-memory/decisions/sprint-PREDICTION-EVIDENCE-REVIVAL-ba.md."
- why-change: "Same 3 work-items PO named, corrected root-cause (input-starved not missing; lookup bug; unwired identity workflow not code gate) + 4 new PO-only blockers surfaced by evidence."

## BA-IND-P1-MOMENTUM-RS · 2026-06-30

Spec complete. REQ file: `docs/handoffs/BA-IND-P1-MOMENTUM-RS.md`. Zero PO blockers. Five ARCH-RATIFY items (all non-blocking). NEXT: architect (zone-split: 3× apps/technical-analysis + 1× apps/stock-price).

Key BA findings: 4 tools decomposed — (1) `get_roc_momentum` (apps/technical-analysis): Jegadeesh-Titman 12-1 skip-month, z-score cross-sectional, decile rank 1–10, factor-return backward-look; needs 273 bars; closes DP backtest/Brier requirement. (2) `get_relative_strength` (apps/technical-analysis): 63/126/252d Mansfield RS + cross-sectional percentile; VN-Index MUST come from daily_ohlcv (no runtime fetch); partial result valid (63d real, 126d/252d null if insufficient). (3) `get_52w_proximity` (apps/technical-analysis): 52w high/low via max/min of 252-bar window; MA50 (50-bar) + MA200 (200-bar, honest-null if <200 bars); net-new-highs aggregate; denominator_ma200 field for sample transparency. (4) `get_foreign_accum_rank` (apps/stock-price): ADTV-normalized 5/20d foreign net-flow z-rank from vnstock_trading_stats; room_exhaustion from foreign_room_events; absent room_event → null NOT false (honest-null overrides default). Hard contracts: no-fake-data standing; honest-NULL + null_reason for all absence cases; null is DESIGNED PASS STATE. Zone split is mandatory — do NOT colocate in one service. Success metric per tool: consumed by >=1 helper agent (same bar as P0). Named scalar per tool for future Fear-Greed composition (momentum_factor_z / market_rs_composite / net_new_highs / foreign_accum_z_market).

Decision journal (task_id: BA-IND-P1-MOMENTUM-RS):
- what-considered: "(A) Foreign-Accum-Rank zone: all-TA vs stock-price — CHOSEN stock-price (data ownership: vnstock_trading_stats + foreign_room_events). (B) VN-Index source for RS: runtime fetch vs daily_ohlcv row — CHOSEN daily_ohlcv only (no cross-service, backfill LIVE). (C) room_exhaustion absent: false vs null — CHOSEN null+null_reason (absence ≠ no-exhaustion). (D) ROC factor-return: persist vs compute-on-read — CHOSEN compute-on-read for P1 (ARCH-RATIFY-ROC-1 to architect)."
- why-change: "no change from roadmap §P1 scope — 4 placeholders faithfully transposed, no new fabrication paths, zone split enforces existing data ownership boundaries."

**Last updated:** 2026-06-29 | **Sprint:** DEFERRED-TASK-SCHEDULER-MVP

## DEFERRED-TASK-SCHEDULER-MVP · 2026-06-29

Spec complete. REQ file: `docs/handoffs/BA-DEFERRED-SCHEDULER.md`. Zero PO blockers (design LOCKED per architect brief 2026-06-29). NEXT: po review then pm→dev-mcp-server→qa.

Key BA findings: 8 STs all owned by dev-mcp-server. Domain entity = ScheduledTask (7-state lifecycle: pending→firing→fired/done/failed/expired/cancelled). Infrastructure = Migration 4 in coordinationStore.ts (coordination.db, same as task_locks — epoch-INTEGER cols, dedup_key UNIQUE in CREATE TABLE per AC-2 scar, 3 indexes). AGENT_TEAM_MAP sourced from system-map.json/agent-roster.md at startup (never hardcoded switch per AC-8). 3 MCP tools: schedule_task (fire_at XOR delay_seconds, idempotent dedup_key, honest Phase-2 caveat in description per AC-9, no orch-state write per AC-12), cancel_scheduled_task, list_scheduled_tasks (full audit fields per AC-10). Internal helpers not MCP-exposed: claim_due_scheduled_tasks, complete/expire/fail_scheduled_task. Cowork-team Step 0b.3 added after fire-election WIN: deadline gate → COWORK PRE-CLAIM spawn (task_kind=intent, deployed enum per AC-5) / DEV orch-apply.sh signal via --argjson bound vars (AC-6). No new task_kind on task_locks (AC-7). 3 advisory Q-non-blocking: Q1=done vs fired terminal (MVP=fired), Q2=claim_due_scheduled_tasks registration scope, Q3=long-prompt companion file threshold. G1/G2/G3 AT outlines mapped to 5 unit test assertions.

Decision journal (task_id: BA-DEFERRED-SCHEDULER):
- what-considered: "(A) claim_due_scheduled_tasks as MCP tool vs internal-only — brief says internal-only BUT Step 0b.3 calls it via call_tool; flagged as Q2 for dev-mcp-server to resolve registration scope. (B) done vs fired terminal state — CHECK enum has both; sweeper sets fired; Q1 flagged non-blocking; MVP uses fired as terminal. (C) All 12 ACs directly traceable to 8 STs — verified no AC is unassigned."
- why-change: "no change from plan — design SSOT is the locked brief; spec faithfully transposes §c–h into FR/NFR/AT layers without deviation."

**Last updated:** 2026-06-29 | **Sprint:** MARKET-INDICATOR-DEPTH-P0

## MARKET-INDICATOR-DEPTH-P0 · 2026-06-29

Spec complete. REQ file: `docs/handoffs/BA-MARKET-INDICATOR-DEPTH-P0.md`. 5 PO blockers (B1=Sprint-0 dispatch mode, B2=OMO DB location ARCH-RATIFY-OMO-1, B3=insider free-float ARCH-RATIFY-INS-1, B4=breadth persister scheduler slot, B5=P0-4 baseline adequacy). NEXT: PO review then architect.

Key BA findings: 7 deliverables decomposed — Sprint-0 OHLCV backfill (450-row queue → writeOhlcvBatch path, no bypass writer), P0-1 Volatility (RV10/20/60d+GK+ATR%14+regime+252d-drawdown from daily_ohlcv, gated on Sprint-0 for 60d/252d), P0-2 Foreign-Room (new foreign_room_events table + utilization/velocity/ROOM_LOCKED/FULL_ROOM_SELL/cap-weighted-saturation from vnstock_trading_stats), P0-3 OMO Curve (extend OMOParseResult to capture Lãi suất+Số thành viên per row, new sbv_omo_daily table, net_injection_5d, liquidity_stress_score 0–1; bid-to-cover NOT sourceable → excluded), P0-4 News Z-Score (confidence-weighted daily_score + z vs 60/90d baseline from rag_analyses; z-score blocked when <21d data — honest null, NOT fabricated), P0-5 Insider Sentiment (net buy-sell VND 30/90/180d + free-float normalized + ACCUMULATION/DISTRIBUTION label + large-deal flag from insider_transactions), Breadth (new market_breadth_history table, forward-accruing only, ADL/RANA/McClellan/Zweig/floor-panic/ceiling-fomo). Gauge-readiness: each tool outputs one named scalar for P1 Fear & Greed composition (rv_20d_percentile/foreign_outflow_z_5d/liquidity_stress_score/news_sentiment_z/net_sentiment_score/breadth_z_score). DDD: domain = pure calc services, application = classification/aggregation, infrastructure = new tables + scheduler, interface = MCP handlers.

Decision journal (task_id: BA-INDICATOR-DEPTH-P0):
- what-considered: "(A) OMO DB location: macro-indicators own SQLite (zone-clean) vs shared market.db (cross-zone access) — DEFERRED to architect as ARCH-RATIFY-OMO-1. (B) Insider free-float: market_cap_bn proxy vs actual free-float shares (not in vnstock_trading_stats) — CHOSE market_cap_bn for P0 with ARCH-RATIFY-INS-1 flag. (C) Sprint-0 dispatch: inside PM decomposition vs separate parallel task — RECOMMENDED separate parallel task (P0-2/3/4/5 have no OHLCV dependency, should not wait). (D) Breadth history_quality: numeric day count only vs labelled tiers — CHOSE both (accruing_since + sessions_accrued + SUFFICIENT/WARMUP/INSUFFICIENT labels)."
- why-change: "no change from roadmap §5 scope; spec transposes PO vision into FRs faithfully, no new fabrication paths opened."

**Last updated:** 2026-06-29 | **Sprint:** FEAT-NEWS-DECISION-RESUME

## FEAT-NEWS-DECISION-RESUME · 2026-06-29

Spec complete. REQ file: `docs/handoffs/BA-FEAT-NEWS-DECISION-RESUME.md`. Zero PO blockers. NEXT: architect (zone=multi, 2 hops).

Key BA findings: `rag_analyses.reasoning` is English machine-trace — jargon + language-boundary violation, cannot surface raw. DB sentiment = bullish/bearish/neutral but frontend `SentimentPill` maps only positive/negative → all cards render grey "Trung lập" (confirmed live bug). `impact_summary` = raw HTML excerpt, not a reason. All required signals (bullishMatched/bearishMatched/affectedDomains/affectedActions/sentiment/level) are computed inside `normalizeNews()` — deterministic Vietnamese template can be produced there without LLM. New `decision_resume` field: prefix "Tích cực"/"Tiêu cực" + sector/ticker context + first 2 matched keywords, capped at 120 chars. Neutral → null (no strip shown). Sector translation table (17 DomainType→VN) embedded in spec. 5 FRs across domain/infrastructure/interface layers. Dev chain: Hop1=dev-mcp-server (FR-1 builder + FR-2 DB + FR-3 DTO) → Hop2=dev-frontend (FR-4 pill fix + FR-5 card résumé). Hop2 depends on Hop1.

Decision journal (task_id: BA-FEAT-NEWS-DECISION-RESUME):
- what-considered: "(A) Fix SentimentPill at handler layer (server-side bullish→positive normalize) — REJECTED: domain truth not obscured at interface boundary. (B) Use existing reasoning field — REJECTED: English jargon + language-boundary violation. (C) Build résumé at DTO/handler layer — REJECTED: bullishMatched/bearishMatched/affectedActions only available in normalizeNews(). (D) Deterministic VN template in normalizeNews() — CHOSEN: all inputs present, no LLM, correct DDD layer."
- why-change: "no change from PO scope"

## FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT · 2026-06-28

Spec complete. REQ file: `docs/handoffs/FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT.md` (BA spec appended to PO handoff). 5 PO blockers (B1=0-row-failures-pipeline-gap, B2=FPT non-regression scope, B3=VCB eval on-demand trigger, B4=FACTORY-DOMAIN overlap, B5=FR-4 section-boundary scope). NEXT: architect.

Key BA findings (from live bctc_table_rows probe): VCB 2026Q1 (55 rows all in 'balance_sheet') shows 7 concrete failure modes — section-boundary failure (IS items in BS section), Thuyết minh note refs contaminating labels, Roman numeral OCR misreads ('Il'→'II', 'Ill'→'III') causing wrong code assignment, catastrophic paren-value parse ((1.992.671)→-1.99), missing II/III sections, code 'VI' collision, notes-section items absorbed. HPG 2025Q4 (85 rows: general+cash_flow, 0 income_statement) shows Stage 4 RED (dup_count=2: Hàng tồn kho and Vốn chủ sở hữu duplicated). VNM 2025Q4 (94 rows) Stage 4 RED (dup_count=2). FPT 2025Q4 (127 rows) already Stage 4 RED (dup_count=1) pre-fix — non-regression must be scoped to Stage 6 GREEN not Stage 4. 0-row failures for HPG 2026Q1/VNM 2026Q1/MWG/VHM confirmed as pipeline gaps (refine_status=PENDING, bctc_layout_units=0), NOT column-split bugs. 7 FRs across infrastructure and application DDD layers: FR-1 layout-adaptive col boundary, FR-2 trailing note-ref label strip, FR-3 Roman numeral OCR normalization table, FR-4 section-boundary content detection (application layer), FR-5 same-section dedup, FR-6 paren-VN-number parse, FR-7 notes-section hard stop.

Decision journal (task_id: BA-FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT):
- what-considered: "(A) VCB 2026Q1 bank target — ACCEPTED. (B) HPG 2026Q1 — REJECTED (0 rows pipeline gap); HPG 2025Q4 chosen. (C) FPT non-regression = Stage 4 GREEN — REJECTED (FPT pre-fix already RED); Stage 6 GREEN chosen. (D) FR-4 section-boundary in sprint scope — RECOMMENDED despite application-layer scope; without it VCB acceptance impossible. (E) FR-5 dedup in sprint — ACCEPTED (PO non-negotiable exact_dup_count=0 gate)."
- why-change: "FM-VCB-1 section-boundary failure is as severe as column-split issues; treating as out-of-scope leaves VCB acceptance impossible."

**Last updated:** 2026-06-27 | **Sprint:** FRONTEND-FRESHNESS-TRANSPARENCY

## FRONTEND-FRESHNESS-TRANSPARENCY · 2026-06-27

Spec complete. REQ file: `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md`. Zero PO blockers. Four architect ratification items (ARCH-RATIFY-FFT-1 through FFT-4). NEXT: architect.

Key BA findings: Surface reconciliation clean — all 35 live page routes match coverage-map rows; no surface missing. 8 `rows_no_asof` confirmed: 5 need L2 handler fix (marketDigest/alerts/qualityChecklist/priceHistory/vpsProxyHealth), 1 is STATIC (kinh-dich-reference, no fix needed), 1 is GAP (cheb-synthesis, out of scope). `ClientTimestamp`/`ClientTimeString` already exist for hydration-safe display. `useRevalidator` used in 3 files but not abstracted — `useFreshnessRevalidator` hook is new. No `FreshnessBadge` component exists. `sector-rotation` has inline time render (lines 453-454) — ONLY non-DRY surface to refactor. `freshnessSlaMonitorJob.ts` monitors 12 DB tables by raw SQL; L4 extension adds coverage-map reader as second pass (additive, non-destructive). 4 architect open items: FreshnessBadge file location, hook location, L4 domain service placement, canonical `data_asof` key.

Decision journal (task_id: BA-FRONTEND-FRESHNESS-TRANSPARENCY):
- what-considered: "(A) Re-mint per-handler tasks — REJECTED (FIX-L2 anchor covers all 5, same zone+pattern). (B) kinh-dich-reference as L2 fix — REJECTED (STATIC hardcoded, no writer, no data_asof possible). (C) Combine L3A+L3B — REJECTED (shared primitives vs 34-route wiring = distinct concerns). (D) FreshnessBadge as generic ui/ primitive — REJECTED (product component with business logic, mirrors InfoCardExpand.tsx not badge.tsx)."
- why-change: "no change from plan — anchor set validated; chain is dependency-minimal (L2 unblocks L3A and L4 simultaneously)."

## FIX-MACRO-SNAPSHOT-DELTAS-NULL · 2026-06-24

Spec complete. REQ file: `docs/handoffs/BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL.md`. Zero PO blockers. Four architect open items. NEXT: architect.

Key BA findings: Persistence grep conclusive — `commodity_prices_history` table EXISTS in the shared `market.db` named volume (1226 rows probed 2026-06-11, ~35/day, 51-day span, 100% brent/gold/usd_vnd coverage). The Go macro-indicators service reads `commodity_prices` (single-row upsert, no history), never `commodity_prices_history`. The fix is a new `CommodityHistoryPort` + `SQLiteCommodityHistoryRepository` that reads the history table with an 18h lookback cutoff (prior-session definition). Six FRs mapped across domain/infrastructure/application/interface layers. The `computeDelta` function already exists and handles nil-prev → (nil, "unknown"); only the "get a real prev" call is missing. `globalMarketsHandler.ts` already proves the exact query pattern (getBaselineRow). Main architect question: SBV-rate-override conflict (current usdVnd may be SBV-sourced, prev is Yahoo-sourced — same-source-only or cross-source delta?).

Decision journal (task_id: BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL):
- what-considered: "(A) Backfill commodity_prices with a prev-day column — REJECTED (would require a new write from the Go service, breaking read-only contract). (B) Cross-service HTTP call to /api/global-markets endpoint to get delta — REJECTED (service-to-service coupling, wrong layer). (C) New read-only adapter against commodity_prices_history (same named volume) — CHOSEN (read-only, same pattern as all existing adapters, table already fully populated). For 'prior' definition: (A) calendar-day-aligned midnight UTC — deferred to architect (timezone edge cases). (B) Fixed 18h lookback — RECOMMENDED to architect as the simplest correct initial rule (avoids timezone math)."
- why-change: "commodity_prices_history is the only history table for these values; the fix is purely a new read path against an existing populated table, no schema change and no new writes."

## Archive

Pre-2026-06-24 specs (FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION, FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER, FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH, FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367, FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0, FIX-ERRAUDIT-W1-PEK-P0, FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE, FIX-ERRAUDIT-W1-MCP-P0, Cycle-2026-06-05-THRU-14): See `docs/archive/notebooks/ba-2026-05-21.md` and git history (commits 4b13a23–9a1e5e8; prior notebook revisions pre-2026-07-01).

## Known patterns / preferences

- Error format all MCP tools: `{ error: '...' }` JSON, never throw.
- apps/macro-indicators is standalone Hono service port 5004, NOT part of mcp-server.
- apps/mcp-server zone = dev-mcp-server; kinh-dich-service zone = separate dev owner (port 5005).
- mark_alert_outcome → SQLite `alerts` table; write_alert_verdict → `docs/data/alert-verdicts.json` file store. DISTINCT.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- TASKS.md cap = 80L; notebook cap = 200L — check wc -l before adding rows.
- Live DB probe pattern: `docker exec <mcp-server-container> bun -e "import {Database} from 'bun:sqlite'; ..."` against `/app/data/market.db` (named volume) — no sqlite3 CLI in container; sqlite3 CLI not installed, use bun:sqlite inline.
