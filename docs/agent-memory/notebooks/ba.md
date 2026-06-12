# BA — Notebook

**Last updated:** 2026-06-12 | **Sprint:** QUE-TOOLTIP-DRY

## QUE-TOOLTIP-DRY-BA · 2026-06-12

Spec complete. Task: BA-QUE-TOOLTIP-DRY. REQ file: `docs/handoffs/QUE-TOOLTIP-DRY-BA-spec.md`. Zero PO blockers. 3 architect blockers. NEXT: architect.

Key BA findings (raw-read, not relayed):
- Render sites: 2 pages (dashboard.analysis = 5 call sites all GUARDED via QueName; dashboard.kinh-dich-signals SnapshotRow = UNGUARDED plain spans). No quẻ render in conviction-history, market-summaries, index, intel.
- QueName.tsx already exists as SSOT shared component with Radix tooltip. Imports QUE_DESCRIPTIONS from scripts/gen-que-descriptions.ts → que-descriptions.generated.ts.
- FR-1 (easy): SnapshotRow migration — swap plain spans to `<QueName hexagram={item.hexagramNumber} name={item.hexagramName} />`. hexagramNumber already in KinhDichSnapshotItem DTO.
- FR-2 (data pipeline): PO SSOT = kinh-dich-service que-reference.js. Current codegen source = mcp-server hexagramLibrary.ts. Alignment path = BLOCKER-1 (architect decides endpoint vs local-mirror).
- BLOCKER-2: FlipRow renders fromHexagramName/toHexagramName as plain text — needs architect to confirm numeric ids available in KinhDichFlip DTO before scoping QueName migration.
- BLOCKER-3: architect must specify which VI fields to show in tooltip (recommended: coreMeaning.vi + marketTrendLabel.vi only; stateInterpretation.vi too verbose for hover).

**Last updated:** 2026-06-08 | **Sprint:** DEEPFETCH-RAG-REDESIGN

## DEEPFETCH-RAG-REDESIGN-BA · 2026-06-08

Spec complete. Task: DFR-BA-1. REQ file: `docs/handoffs/DEEPFETCH-RAG-REDESIGN-phase1-BA-spec.md`. Zero PO blockers. One dev pre-condition (Q4: verify add_columns() in deployed lancedb version). NEXT: architect.

Key BA findings (raw-read, not relayed):
- LanceDB `rag_entries` confirmed: 8 existing columns, no ticker/sector/source/depth/doc_type/confidence. FR-1 adds 8 cols via add_columns() guarded idempotent try/except.
- `application/dtos.py` `IndexRequest` and `SearchRequest` confirmed: no new fields today. FR-2/FR-3 are additive with defaults — all existing callers compile unchanged.
- `LanceDBVectorStore.search()` filter pattern confirmed: already sanitizes with _validate_level/_validate_action_code + SQL WHERE clause. FR-3 extends the same pattern for 5 new filter dims.
- `mcp.config.json` `rag.decayHalfLifeDays` is absent today (only global `halfLifeDays: 7`). FR-4 adds the 4-key map. Config read-only; no TS hardcode.
- `pollNews.ts` ragIndex call at L604: passes 6 fields. FR-5 adds 8 more from existing computed context (source_url, confidence, impact_score, detected tickers).
- `fetchParseAndStoreBctc.ts` ragIndex call at L465: passes 6 fields. FR-5 adds `doc_type:"filing"` + ticker/sector.
- `schema-news.ts` ALTER TABLE pattern at L57 (data_env) confirmed: try/catch idempotent. FR-6 reuses identical pattern for body_text.
- Phase 2/3 firmly out of scope: DFR-P2-DEEPFETCH (deep-fetch pipeline) and DFR-P3-HYBRID (BM25/FTS) gated pending Q1-Q4 feasibility answers.

**Last updated:** 2026-06-07 | **Sprint:** TOOL-SURFACE-UPGRADE

## TOOL-SURFACE-UPGRADE-BA · 2026-06-07

Spec complete. REQ file: `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md`. Zero PO blockers. 6 architect blockers. NEXT: architect.

Key BA findings (raw-read, not relayed):
- True tool count: /health=162, source-grep=161, project-stats=161. Delta=1 unresolved; U2 generator settles it.
- system-map.json: 146 tools — 17 missing (new tools since 2026-05-03), 2 ghosts (get_market_hexagram deregistered by TSH, sequential_market_analysis). system-map is cowork lane scope — BA does NOT touch docs/agents/tools/*.
- tool-usage-stats.json: sessionCount:0/toolCounts:{} since gateway cutover. Root cause = sessionToolCache empty because gateway drops connection per call. U1 fix: per-call counter on server side, independent of session.
- U3: is_trading_day likely called from cowork-match-slots.js (DWF-PHASE1 FR-P1-4) — architect must check .js files, not just .ts.
- U5: VPS fetch-foreign-flow.sh fetches fBVol/fSVolume/fRoom but NO holding_ratio field. vnstockStore.ts:561 falls back to `row.current_holding_ratio ?? 0` = always 0. Dead column rendered as real data — DSI violation.
- U6 new pairs: get_market_summary vs generate_market_summary; get_insider_signals vs get_insider_transactions — both new to U6, not in TSH. Architect diffs both before any merge.

**Last updated:** 2026-06-06 | **Sprint:** WORKFLOW-FLUIDITY

## WORKFLOW-FLUIDITY-BA · 2026-06-06

Spec complete. REQ file: `docs/handoffs/WORKFLOW-FLUIDITY-BA-spec.md`. 1 PO-resolved option (WF-2 dual options presented per PO note). 3 blockers for architect (BLOCKER-WF2-A: locate TS write path; BLOCKER-WF3-A: option A vs B ruling; BLOCKER-WF3-B: gateway binding mechanical test). NEXT: architect.

Key BA findings (raw-read, not relayed):
- WF-1: developer/flow/main.md L70+L71 both STOP without task_release or .head idle-reset. qa/flow/main.md APPROVED path already releases (correct). fixer has no explicit release on Error Boundary. dev-team Step 0b 24h guard fires too late — BLOCKED-task check needed. fail-loud-protocol.md § Error Boundary missing step 0 (release + head reset) — adding here closes the fleet-wide class.
- WF-2: signal-dashboard SKILL WRITE has no mtime-retry — bare temp→rename. Three concurrent writer classes confirmed (dev-team :07, cowork-team */15, auditor 0/*/4) not documented in skill. TS write path location is unconfirmed (BLOCKER-WF2-A). FU-ORCH-HEAD-CAS = same class bug on .head.
- WF-3: binding gap confirmed from memory (ORCH-TASK-CANON: agent-father F1B mutex-less) + BA gateway calls succeed in THIS session. Two ruling surfaces: (1) is binding inherited by Agent() spawns?; (2) which option (single-claim/heartbeat/invariant) is right after confirming (1).
- Sequencing: WF-1 and WF-3 parallel NOW; WF-2 blocked on BLOCKER-WF2-A + architect option ruling.

**Last updated:** 2026-06-06 | **Sprint:** ORCH-TASK-CANON

## ORCH-TASK-CANON-BA · 2026-06-06

Spec complete. REQ file: `docs/handoffs/ORCH-TASK-CANON-BA-spec.md`. Zero PO blockers. 4 architect blockers (schema SSOT location / counts.done rule / F3 rollout order / migration runner). NEXT: architect.

Key BA findings (raw-read, not relayed):
- done[]: 66 rows — 65/66 task_id, 52/66 title, 21/66 owner, 48/66 zone, 2/66 created_at. 27 distinct status strings across all arrays.
- 1 nested container in done[]: `{id: "ORCH-DASH-DECISION-DRILLDOWN", tasks: [6 items]}` — children already canonical. Must flatten.
- orchestrationHandler.ts `buildOrchestrationDto`: projects `active_sprints[].tasks[]` only — done[] never served. `OrchTaskBoardDto` has no `done` field. `decisions.by_task` join starved (done tasks not in `tasks[]`).
- `projectTask()` already coalesces `task_id||id` and `title||resolvedId` — coalesce logic exists, just never called for done[].
- Frontend L339: exact `t.status === "DONE"` misses 15 variants (DONE-LIVE-VERIFIED etc.).
- Decision-journal SKILL resolver: `entries[0].id` should be `entries[].sprint_id | select(active)` — always resolves to date-fallback; sprint-named journals invisible.
- `sprint-2026-06-06.md` lines 1-21: freeform `## STEP —` blocks, not parseable by `RE_STEP_HEADER`. PO entry (lines 22-31) already correct format.
- BLOCKER-1 schema location: orchStateStore.ts interface vs docs/standards/ — recommend orchStateStore.ts.
- BLOCKER-4 migration runner: recommend dev-mcp-server runs the jq migration as part of F2 prep.

**Last updated:** 2026-06-05 | **Sprint:** ORCH-DASH-DECISION-DRILLDOWN

## ORCH-DASH-DECISION-DRILLDOWN-BA · 2026-06-05

Spec complete. REQ file: `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-BA-spec.md`. Three architect-level blockers (not PO blockers). NEXT: architect.

Key BA findings (raw-read source files, not relayed):
- Serving layer: `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` — confirmed live via `api.orchestration.tsx` proxy chain (`:3001 → :3000/api/orchestration`). NOT the undeployed Go api-gateway.
- `buildOrchestrationDto` is a pure function (injectable, testable) — F2 extension goes here + a new `journalStore.ts` infra module for file discovery + markdown parse.
- `OrchTaskDto` currently has `id/title/status/owner/zone` only — no `task_id` field separate from `id`. F2 DTO extension adds `decisions: DecisionsDto` at top level; `OrchTaskDto` itself is unchanged.
- Dashboard route `TaskBoardPanel` → `DoneTaskGroup` already has `expanded` state and a show-all toggle — F3 accordion is additive inside `DoneTaskGroup` rows, not a new panel.
- F1 format change is purely additive (one optional line in STEP block); backward-compat guaranteed if parser uses `null` fallback on missing field.
- Dependency chain: F1 SKILL.md format finalize → F2 parser fixtures → F3 TypeScript types. F1+F2 can deploy independently of F3 (F3 reads `decisions?` optional field).
- BLOCKER-1: architect must formally confirm BOTH join-key strategies before F1 dispatch.
- BLOCKER-2: architect must specify sprint-id discovery scope for F2 journal file loader.
- BLOCKER-3: architect must decide EC-6 latency risk (per-sprint mtime cache vs synchronous parse).

---

**Last updated:** 2026-06-04 | **Sprint:** DATA-SERVE-INTEGRITY

## DATA-SERVE-INTEGRITY-BA · 2026-06-04

Spec complete. REQ file: `docs/handoffs/DSI-BA-spec.md`. Zero PO blockers. NEXT: dev-mcp-server (DSI-S1-SLA, XS, do_first).

Key BA findings (raw-read source files, not relayed):
- `macroIndicatorSla.ts:35,73` both `.get("VN")` — literal string, no constant. Fix = `MACRO_COUNTRY_KEY = "vietnam"` used at both sites.
- `server.ts:1435,1520` push-gso defaults `"VN"` — normalize to `"vietnam"`; R-1: audit `vps-scripts/` before deploy.
- `macroIndicatorFetcher.ts:266,296` dead code writes `'VN'` — comment only (`@deprecated DSI`), do NOT remove.
- `macroTools.ts:245` carry suppress only on `=== 0`, not on `fedFundsRateIsEstimate` — fix gate condition.
- `sbv.ts:53-70` six rates hardcoded with no `is_estimate` column — FR-MAC-2 adds migration + column.
- `macroIndicatorRefreshJob.ts:273-276` commodity `?? 0` — zero-write on fetch failure; fix = skip or mark is_estimate.
- `fetchers.go:183-193` Tier-3 `time.Now()` re-stamp + `Change: 0/ChangePercent: 0` — fix = true DB timestamp + `*float64` nil.
- `usecases.go:19-33` `FetchPriceResponse` no Staleness field — add `Staleness string` + `IsEstimate bool`, wire from `ResolvedQuote`.
- `market.ts:152-159` `MacroSnapshot` no dataSource/is_estimate/source_tier — all new fields optional (additive, no regression).
- `market.ts:~18` `StockQuote.change: number` — must become `number | null` coordinated with DSI-S2-PRICE deploy.
- `bctcFullTools.ts:226-229` `roe/netMarginPct/debtToEquity ?? 0` — change to `?? null`; suppress delta when null.
- `finalizeBctcRefineTool.ts:1037` `extractionConfidence ?? 1` — change to `?? 0` (missing = unknown = low, not max).
- `bondMaturityTracker.ts:42-91` SEED_BONDS — add `static_seed: true` + alert message suffix when DB empty.
- `creditFlowTools.ts:117-131` mortgage/yoyGrowth fabricated defaults — replace with `null + is_estimate:true`.
- `energyTools.ts:65-68` grid dispatch hardcoded — derived signal block must carry `is_estimate:true`.
- DSI-MACRO-INDICATORS-LATENT: Go macro-indicators NOT deployed — backlog only, gate on container entering runtime.
- ProvenanceFields shared interface: define once in `domain/models/provenance.ts`, extend all response types.
- R-3: Change/ChangePercent nullable is a BREAKING API change — Go + TS must deploy together.

**Last updated:** 2026-06-01 | **Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD

## VPS-DEPLOY-PLACEHOLDER-GUARD-BA · 2026-06-01

Spec complete. REQ file: `docs/handoffs/TASK_VPS-PLACEHOLDER-GUARD.md`. Zero PO blockers. NEXT: pm (task decomposition).

Key BA findings (raw-read, not relayed):
- 6 hardcode-no-fallback scripts confirmed by direct grep (fetch-vn-news L7-8, fetch-sbv L7-8, fetch-gso L8-9, fetch-tradingeconomics L7-9, fetch-prices L15-18, enrich-bctc-urls L8-10).
- article-body-fetcher.py confirmed zero placeholder tokens — only imports (requests, bs4 conditional).
- deploy-vps-proxy.sh confirmed: `set -e` L17, TMP_NEWS at L107-116, no existing pre-scp assert.
- GUARD-1 regex: MUST use `[A-Za-z][A-Za-z0-9_]*` not all-caps — architect RISK-GUARD1-REGEX.
- GUARD-2 TE_API_KEY: empty-string fallback ONLY (`${TRADING_ECONOMICS_API_KEY:-}`). Using `__TE_API_KEY__` as fallback would false-block GUARD-1 (no sed rule for that token in deployer). Existing TE guard L13-17 handles empty correctly.
- GUARD-1 post-deploy: use glob `/root/fetch-*.sh /root/*.py` not explicit filenames (RISK-POSTDEPLOY-SCOPE).
- Deliberate-violation test is locally provable without SSH — inject `__GUARD_TEST_TOKEN__` as unknown token; sed does not substitute it; assert fires.
- No Docker rebuild. No new env vars required on VPS for normal operation. 3 services need systemctl restart after redeploy: vn-news-fetch, vn-sbv-fetch, vn-price-fetch.
- 3 scripts out of scope for deployer coverage: fetch-tradingeconomics (TRADING_ECONOMICS_API_KEY may not exist in .env), fetch-gso (browser automation disabled), enrich-bctc-urls (separate systemd timer — BCTC sprint).

**Last updated:** 2026-05-31 | **Sprint:** BRIEF-SECTOR-DRIFT (BSD-3)

## BRIEF-SECTOR-DRIFT-BA · 2026-05-31 (BSD-3)

Sprint BSD-3 spec complete. REQ file: `docs/handoffs/TASK_BSD3.md`. Zero PO blockers.
NEXT: architect not required — design answer is unambiguous (b1 drop, no new abstraction). Route directly to dev-mcp-server (docs change + test only).

Key BA findings (raw-read, not relayed):
- Brief-creation sites: 3 places stamp `**Sector**:` — `docs/references/analysis-ledger-template.md` (canonical), `docs/agents/digest-predict/flow/monthly.md:49` (inline copy), `docs/agents/unified-agent/flow/market-events-log.md:21` (inline copy). All 3 must be patched.
- Seam: b1 (DROP the line). All 7 consumers (chef/news-scout/fb-poster/market-watcher/digest-predict/unified-agent/bctc-analyst) confirmed zero parse of `**Sector**:` header — each derives sector from live tools (`get_watchlist()` domain, `SECTOR_NAME_VI`, `get_sector_comparison()`). The line is human-only display.
- `**Exchange**:` is retained — non-driftable, no live tool alternative without a DB call.
- Drift-fixture test: `apps/mcp-server/src/__tests__/BSD3-brief-sector-drift.test.ts` — 4 assertions including deliberate-drift injection that proves non-false-green.
- Rebuild: BSD-3 test is additive (new file), must batch with TSH-1/EI-P2/BANK rebuild — no standalone rebuild.
- Zone split: docs change commits separately from test file (no mixed `docs/` + `apps/mcp-server/` in one commit).

---

## TOOL-SURFACE-HYGIENE-BA · 2026-05-31

Sprint TOOL-SURFACE-HYGIENE spec complete. REQ file: `docs/REQ_TOOL-SURFACE-HYGIENE.md`. Zero PO blockers. NEXT: architect (ARCH-TSH).

Key source findings (BA raw-read, not relayed):
- FR-1 (`get_market_hexagram`): `kinhDichTools.ts:510` — single registration, no duplicate. Delegation chain: `getMarketHexagram()` → `clients.ts:505` → kinh-dich-service GET /market. 501 is downstream. Split into 1a (wire = kinh-dich zone) / 1b (deregister = apps/mcp-server zone).
- FR-2 (`mark_alert_outcome` vs `write_alert_verdict`): DISTINCT datastores confirmed. `mark_alert_outcome` writes to SQLite `alerts` table (`writeAlertOutcome` from `infrastructure/db/alertStore.ts`). `write_alert_verdict` writes to `docs/data/alert-verdicts.json` (JSON file store via `infrastructure/fileStore/alertVerdictStore.ts`). Different schema, different lifecycle (post-hoc scoring vs fire-time pending write). Diff-before-merge gate required per sprint constraint.
- FR-3 macro accuracy trio: `get_calibration_report` reads `calibration_snapshots` (weekly Brier), `get_label_accuracy_report` reads `market_messages` (human label accuracy), `get_prediction_accuracy` reads Polymarket outcome computations. Three distinct sources.
- FR-4 (`get_patterns` vs `get_technical_indicators`): `get_patterns` queries `rag_analyses` (RAG memory, event/keyword match). `get_technical_indicators` calls Go TA microservice (port 5003) for RSI/MACD/MA/BB. Completely distinct.
- FR-5 (5 trigger tools): all thin SSH-trigger debug tools with same param shape but different VPS scripts. Return schemas slightly diverge (bctc returns `queued`, price returns `service`). Architect-discretion optional.
- FR-6: `project-stats.json` both `toolCount` fields = 146 (stale). Live = 154. Runs last.

---

## Archived sprint specs (condensed)

- **BCTC-TRUST-RED-BA** ✅ 2026-05-30. REQ `docs/REQ_BCTC-TRUST-RED.md`. REJECTED_SANITY enum + ingest gate + publish guard + 4 DT domain validators. SHIPPED.
- **BCTC-HUMAN-CONFIRM-BA** ✅ 2026-05-30. REQ `docs/REQ_BCTC-HUMAN-CONFIRM.md`. bctc_human_corrections table, 3-layer lock, confirm_status column, Option B2 re-anchor key. SHIPPED.
- **BCTC-AGENTIC-REFINE-BA** ✅ 2026-05-30. REQ `docs/REQ_BCTC-AGENTIC-REFINE.md`. 3-zone split. SHIPPED.
- **DATA-PIPELINE-INTEGRITY-BA** ✅ 2026-05-30. REQ `docs/REQ_DATA-PIPELINE-INTEGRITY.md`. DPI-1..4 root causes. SHIPPED.
- **BCTC-TABLE-BOUNDARY-BA** ✅ 2026-05-29. REQ `docs/REQ_BCTC-TABLE-BOUNDARY.md`. 5 FR decisions. SHIPPED.
- **VNH-SECTOR-FIX-BA** ✅ 2026-05-29. REQ `docs/REQ_VNH-SECTOR-FIX.md`. VNH domain fix. SHIPPED.
- **Pre-2026-05-29 specs** — archived to `docs/archive/notebooks/ba-2026-05-21.md`.

## Known patterns / preferences

- Error format all MCP tools: `{ error: '...' }` JSON, never throw.
- apps/macro-indicators is standalone Hono service port 5004, NOT part of mcp-server.
- apps/mcp-server zone = dev-mcp-server; kinh-dich-service zone = separate dev owner (port 5005).
- mark_alert_outcome → SQLite `alerts` table; write_alert_verdict → `docs/data/alert-verdicts.json` file store. DISTINCT.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- TASKS.md cap = 80L; notebook cap = 200L — check wc -l before adding rows.
