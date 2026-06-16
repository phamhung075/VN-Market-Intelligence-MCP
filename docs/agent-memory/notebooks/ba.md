# BA — Notebook

**Last updated:** 2026-06-16 | **Sprint:** FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH

## FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH · 2026-06-16

Spec complete. Task: FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH. REQ file: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-BA-spec.md`. Zero PO blockers. Four architect ratification items (ARCH-RATIFY-FE-1 through FE-4). NEXT: architect.

Key BA findings: Three helpers in ONE new file `apps/frontend/app/lib/api/fetchUtils.ts`: (A) `safeFetch<T>` for ~26 dashboard loader helpers — replaces ~40-line inline try/fetch/parse with 4-line call + attribution `console.error`; (B) `proxyUpstream` for ~29 `api.*.tsx` proxy routes — 504 on deadline, 502 on network error; (C) `safeFetchOrNull<T>` for 4 non-fatal `client.ts` wrappers — preserved null/[]/`{}` degrade contract + attribution log + deadline. `FETCH_DEADLINE_MS = 55_000` is the single SSOT (55s < 60s gateway ceiling; > 45s mcp-server inner deadline). Cluster C callers use 10s override (best-effort enrichment). Key boundary: `FE-PAGE-REORG` Wave-1 `loader-utils.ts safeFetch` plan is ABSORBED into `fetchUtils.ts` — no second helper allowed. `apiGet<T>` NOT bounded internally (outer safeFetch covers it). Sequence constraint: AFTER W2-MCP-FETCH-DEADLINE (done_verified), which bounds the inner mcp-server hops first.

Decision journal (task_id: FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH):
- what-considered: "Helper location: (A) `lib/api/fetchUtils.ts` — chosen, mirrors existing `client.ts` location in lib/api/, no upward imports; (B) inline helpers in each route — rejected (same duplication bug at 55 sites); (C) `lib/utils/` top-level — rejected (no precedent in frontend). `safeFetch` vs `proxyUpstream` split: single helper with a mode flag vs two separate exports — separate exports chosen (clear semantic boundary: loader=data-fetch, proxy=relay; prevents misuse). FETCH_DEADLINE_MS=55s: chosen as 55s not 50s to give full clearance above 45s bctcPdfPullJob; below 60s gateway. FE-PAGE-REORG absorption: reuse-fetchUtils vs let FE-PAGE-REORG add its own loader-utils — reuse chosen (eliminates duplicate pattern at root)."
- why-change: "no change from plan — scope matches audit brief frontend-cluster exactly; smallest correct change that closes all 4 sub-findings (01/02/04/06/07) in one shared file"

**Last updated:** 2026-06-16 | **Sprint:** FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367

## FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367 · 2026-06-16

FAST-TRACK tsc-green fix (fleet-push blocker, P2). Single TS2367 error in `apps/mcp-server/src/__tests__/FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts` line 269. Root cause: `const severity: "HIGH" | "CRITICAL" = "HIGH"` — TypeScript const-narrows the literal `"HIGH"` making the branch `severity === "CRITICAL"` have no type overlap. Sibling blocks in same describe (lines 263, 284) assign `"CRITICAL"` — those comparisons do not trigger TS2367 because TS narrows them to `"CRITICAL"` and the conditional is trivially-true, not a non-overlap error. Fix applied: `const severity = "HIGH" as "HIGH" | "CRITICAL"` — cast widens the type to the full union without losing the runtime value. Test intent preserved: HIGH→70, CRITICAL→90, neither→50. tsc --noEmit = 0 errors. 22/22 tests pass. Commit: `fix(test/TS2367): widen severity literal to union type to unblock fleet push`. No architect/PM needed — trivial 1-line test-only change.

Decision journal (task_id: FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367):
- what-considered: "(A) `let severity` instead of `const` — TS still narrows let-with-one-assignment to literal in strict mode; failed on first attempt. (B) `as 'HIGH' | 'CRITICAL'` cast — prevents const-narrowing, retains runtime value, preserves union type for conditional; preferred. (C) delete/rewrite test — weakens coverage; rejected per scope constraint."
- why-change: "cast is minimal; no behavioral change to test assertions; mirrors the as-const tuple pattern already used in the sibling `neither severity is 50` block"

**Last updated:** 2026-06-16 | **Sprint:** FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0

## FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 · 2026-06-16

Spec complete. Task: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0. REQ file: `docs/handoffs/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-BA-spec.md`. 3 PO blockers (all confirmation items, none block architect start). Recurring class (3rd+ touch: FIX-STOCK-PRICE-SCALE-CORRUPT / OHLCV-UNIT-CONTAM / CONTAM-5 / CONTAM-7).

Key BA findings: Primary writer suspect = `taOhlcvBackfillJob` (01:30 UTC, VNDIRECT toDate=today returns flat seed bar). Guard gap = `validateOhlcvUnit` is intra-row only; 77 corrupt rows pass all 5 rules (flat O=H=L=C not zero, in range 100–10M). `detectAndNormalizeScaleFromPrevClose` fails when prevClose=0 (first row in transaction, or no prior real close available). Decision 3 = STOP-EMITTING (skip VNDIRECT rows with date=today AND vol=0 AND flat OHLC). Decision 4 = DELETE synthetic fingerprint (vol=0 AND flat AND data_env=NULL) for 2026-06-16, TA self-heals on next read. New guard FR-G2 adds cross-day scale check to sanity job. New test AC-T1 through AC-T5. Unblocks FIX-ALERT-ENGINE-RSI-SINGLEDIGIT done_verified + FIX-ALERT-OPEN-ZERO-PRICE-RACE on LIVE gate green.

## FIX-ERRAUDIT-W1-PEK-P0 · 2026-06-16

Spec complete. Task: FIX-ERRAUDIT-W1-PEK-P0. REQ file: `docs/handoffs/FIX-ERRAUDIT-W1-PEK-P0-BA-spec.md`. Zero PO blockers. Four architect ratification items (ARCH-RATIFY-PEK-1 through PEK-4).

Key BA findings: Single file `pek_engine_adapter.py`, two adjacent crash-swallow sites + one new helper. (A) Line 668 outer catch in `_run_extraction`: DocLayout-YOLO crash swallowed → `pages_bboxes={}` → `total_pages=0` → clean 0-row result dict. Fix: re-raise OR tag-degraded via `fail_loud_or_tag_degraded`. (B) Lines 342+717+729: PaddleOCR load failure → `paddle_table=None` cached as singleton → `if paddle_table is not None:` guard silently skips table extraction → table units assembled with `row_count=0`, `quarantined=False`. Fix mirrors `extract_layout_first_usecase.py:450` quarantine pattern. Helper `fail_loud_or_tag_degraded` ships as generic by-product (no ticker/date/entity). Critical false-positive guard: genuinely table-less PDF (layout succeeds, no table bboxes) MUST NOT be quarantined. Key DDD concern: ARCH-RATIFY-PEK-3 — HTTP contract between refine orchestrator and pdf-extractor determines Option A (re-raise→500) vs Option B (tag→200+degraded). EC-2 (layout_task=None config path) is NOT a crash and must not be touched.

Decision journal (task_id: FIX-ERRAUDIT-W1-PEK-P0):
- what-considered: "Site A: (A) re-raise — mirrors existing _load_pek_models behavior, cleaner; (B) tag-degraded via helper — preserves 200 contract for caller; BA recommends A, architect decides based on orchestrator HTTP error handling. Site B: same Option A/B choice; re-raise aligns with layout_task load-failure precedent. Helper location: (A) new pek_helpers.py — keeps adapter focused; (B) inline — simpler; architect decides. Scope boundary: parse_or_raise/validate_or_unknown held for Wave-3 (audit brief §Wave-3 pdf-extractor-01/04). EC-2 (config-absent layout_task=None path) explicitly excluded — intentional design."
- why-change: "no change from plan — P0 spec follows PO board row exactly; smallest correct change constraint honored; false-positive guard (table-less PDF) is the critical DoD gate per task brief"

**Last updated:** 2026-06-16 | **Sprint:** ERROR-AUDIT-2026-06-15 Wave-2

## FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE · 2026-06-16

Spec complete. Task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE. REQ file: `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md`. Zero PO blockers. Four architect ratification items (ARCH-RATIFY-W2-1 through W2-4). NEXT: architect.

Key BA findings: ONE new file `infrastructure/fetchers/fetchDeadline.ts` exports `withDeadline<T>` + `macroFetch<T>`. DDD layer = infrastructure (owns AbortController+setTimeout lifecycle, no domain/business logic). Six unbounded-fetch sites migrated: muasamcong:216, sscInsider:134, newsHeadlinesRefreshJob:41, bctcPdfPullJob:165, macroTools:446, server.ts:642. Two inline DRY copies consolidated: taOhlcvBackfillJob:149, deepFetchVpsJob:96. Seven macro sibling tools migrated to macroFetch. Deadline per site < 60s gateway ceiling. console.error Bun global — no import. bctcHttpFetcher.ts negative scope (already correct). Fail-loud mandate: timeout is a real error; no fabricated default permitted. Forced-failure DoD: hang-simulation on target port, gateway receives error before 60s.

Decision journal (task_id: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE):
- what-considered: "DDD layer for withDeadline: (A) infrastructure/fetchers — chosen; (B) application/utils — rejected (I/O lifecycle is not a use-case); (C) new src/shared/ dir — rejected (no precedent, architect approval overhead); bctcHttpFetcher.ts precedent confirms infrastructure/fetchers is correct home for fetch lifecycle utilities"
- why-change: "no change from plan — scope matches PO board row exactly; macroFetch generalizes existing F-MACRO-FETCH-DEADLINE pattern; 12 atomic tasks, critical path T-1→T-7→T-11→T-12"

**Last updated:** 2026-06-15 | **Sprint:** ERROR-AUDIT-2026-06-15 Wave-1

## FIX-ERRAUDIT-W1-MCP-P0 · 2026-06-15

Spec complete. Task: FIX-ERRAUDIT-W1-MCP-P0. REQ file: `docs/handoffs/FIX-ERRAUDIT-W1-MCP-P0-BA-spec.md`. Zero PO blockers. One architect ratification (ARCH-RATIFY-1: confirm console.error in domain layer is acceptable). NEXT: architect.

Key BA findings: Two files, two distinct fix shapes. (A) `marketContextBuilder.ts:417` — domain layer, sync function, zero imports needed; fix is 3 boolean flags + `status` derivation + `pendingCount` sentinel `"?"` on catch; caller contract unchanged. (B) `tickerIntelligenceTools.ts` — interface layer; 6 inline catch blocks each get one `console.error` + `return "(lỗi truy vấn)"`. S5 inner catch (JSON.parse, line 263) correctly already tagged — must NOT touch. Forced-failure DoD: DB-lock probe on named-volume `vn-market-intelligence-mcp_market_data`, container rebuild mandatory before QA. Generic-mandate: single constant `(lỗi truy vấn)` string, no per-ticker logic.

Decision journal (task_id: FIX-ERRAUDIT-W1-MCP-P0):
- what-considered: "two shapes for two sites: (A) inline boolean tracking for domain sync function with no import change; (B) inline console.error + tagged return for 6 interface catches; rejected: early Wave-2 helper (runSection/failLoud) — PO scope boundary is firm; rejected: caller contract change (buildSystemStatusText signature) — NFR-A2 forbids"
- why-change: "no change from plan — P0 spec follows PO board row exactly; smallest correct change constraint honored"

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

Spec complete. REQ file: `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-BA-spec.md`. Three architect blockers. NEXT: architect. (Full findings archived in git history.)

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
