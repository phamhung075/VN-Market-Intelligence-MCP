# BA — Notebook

**Last updated:** 2026-06-14 | **Sprint:** KINHDICH-HOVER-DETAIL

## BA-KINHDICH-HOVER-DETAIL · 2026-06-14

Spec complete. Task: BA-KINHDICH-HOVER-DETAIL. REQ file: `docs/handoffs/KINHDICH-HOVER-DETAIL-BA-spec.md`. Zero PO blockers. Recommended chain: developer (frontend) → ops (frontend-only rebuild) → qa.

Key BA findings: Single-file change — `QueName.tsx` adds import of `QUE_DETAIL` from `~/lib/que-descriptions-detail.generated` (already in bundle, all 64 entries, all 5 required fields: coreMeaning/stateInterpretation/favorable/warning/marketTrendLabel). Renders 4 enriched VN clauses inside existing Radix `TooltipContent` (`max-w-xs text-xs`). Omits `phases[]` (tabular, stays on reference page per PO). Fallback to existing `QUE_DESCRIPTIONS` render if `QUE_DETAIL[hexagram]` absent. DONE BAR = served-chunk RAW-verify on `:3001` (curl grep confirms VN strings in live bundle, not just source). No architect needed for a one-file interface layer change.

Decision journal (task_id: BA-KINHDICH-HOVER-DETAIL):
- what-considered: "only path: single-file QueName.tsx enrichment using already-bundled QUE_DETAIL; PO decision locks Option (a); zero alternatives"
- why-change: "no change from plan"

**Last updated:** 2026-06-14 | **Sprint:** VN-MACRO-TOOLING

## BA-VN-MACRO-TOOLING · 2026-06-14

**Decision journal** (task_id: BA-VN-MACRO-TOOLING):
- what-considered: "only path: decompose 7 VMT tasks from existing io_contracts in orch-state + brief; no re-invention; skill switch-on schema as acceptance boundary"
- why-change: "no change from plan"

Spec complete. REQ file: `docs/REQ_VN-MACRO-TOOLING.md`. 12 sections, 7 tools (5 new + 1 extend + 1 register). Zero PO blockers (sprint is PO-approved). Six architect blockers (BLOCKER-1 to BLOCKER-6) — all require live VPS source probe before parser is written; BLOCKER-1/BLOCKER-2 also require architect design decisions (FDI-bloc derivation strategy; BOP PDF-vs-Excel parse path). Recommended zone split: Zone A = macro-indicators Go service (new endpoints + domain logic + VPS wrapper); Zone B = mcp-server TS (new tool handlers + VMT-7 registration); Zone C = creditFlowTools.ts in-place extend; Zone D = shared VPS proxy wrapper in macro-indicators infra. NEXT: architect (multi-zone blueprint).

**Last updated:** 2026-06-14 | **Sprint:** KINHDICH-HOVER-ENRICH-FE

## KINHDICH-HOVER-ENRICH-FE-BA · 2026-06-14

Spec complete. Task: BA-KINHDICH-HOVER-ENRICH-FE. REQ file: `docs/handoffs/KINHDICH-HOVER-ENRICH-FE-BA-spec.md`. Zero PO blockers. One architect ratification (ARCH-RATIFY-FE-1: confirm DRY-preserving codegen extension — PO already overruled BLOCKER-3 field choice; architect ratifies mechanism only). NEXT: architect.

Key BA findings: Real user hover = Remix :3001 `QueName.tsx` L75 renders `desc.coreMeaning` from `QUE_DESCRIPTIONS` (`que-descriptions.generated.ts`). SSOT groundwork already done (commit 47fe36e8) — `que-reference.js` has `hoverSummary` x64 confirmed. Fix is 3-file change: (A) extend `scripts/gen-que-descriptions.ts` to add `hoverSummary?: string` to `QueDescription` interface + emit `entry.hoverSummary.vi` in BLOCK 1; (B) regen `que-descriptions.generated.ts` via `bun run gen:que`; (C) update `QueName.tsx` L75 to `{desc.hoverSummary ?? desc.coreMeaning}` — fallback preserves terse coreMeaning for any entry lacking hoverSummary. DRY invariant held: same SSOT, same codegen, same component. `que-descriptions-detail.generated.ts` and `QUE_DETAIL` untouched. kinh-dich-service zone untouched. Ops rebuilds frontend :3001 only (NOT full stack — destroy-peers guard). QA verifies LIVE :3001 hover on quẻ 29/47 + favorable/neutral/unfavorable samples.

**Last updated:** 2026-06-14 | **Sprint:** KINHDICH-HOVER-ENRICH

## KINHDICH-HOVER-ENRICH-BA · 2026-06-14

Spec complete. Task: BA-KINHDICH-HOVER-ENRICH. REQ file: `docs/handoffs/KINHDICH-HOVER-ENRICH-BA-spec.md`. Zero PO blockers. One architect ratification (RATIFY-1: confirm Option C). NEXT: architect.

Key BA findings (raw-read): qref panel in kinh-dich-service dashboard renders `loc(q.coreMeaning)` inline in `.qref-meaning` span (L2501) — avg 36 chars, min 17 (quẻ 47 = "Kiệt sức và giam cầm"). Richer fields exist but click-gated. Decision: Option C (new `HoverSummary localized` field in queReference struct) — keeps coreMeaning semantics clean (QUE-TOOLTIP-DRY PO-Q3 ruling locks it as terse), avoids dumping 3 verbose fields into an already-crowded row (warning already rendered there). Pre-authored all 64 VI+EN hoverSummary strings in spec (not just exemplars) to ensure quality and remove language-authoring burden from dev. Single-zone: dev-kinh-dich owns hexagram_reference.go + dashboard/index.html + que-reference.js regen. Zero cross-zone impact on React frontend or MCP tools.

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

---

## Archive

Pre-2026-06-10 specs: See `docs/archive/notebooks/ba-2026-05-21.md` and git history (commits 4b13a23–9a1e5e8, 2026-05-29 to 2026-06-04).

## Known patterns / preferences

- Error format all MCP tools: `{ error: '...' }` JSON, never throw.
- apps/macro-indicators is standalone Hono service port 5004, NOT part of mcp-server.
- apps/mcp-server zone = dev-mcp-server; kinh-dich-service zone = separate dev owner (port 5005).
- mark_alert_outcome → SQLite `alerts` table; write_alert_verdict → `docs/data/alert-verdicts.json` file store. DISTINCT.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- TASKS.md cap = 80L; notebook cap = 200L — check wc -l before adding rows.
