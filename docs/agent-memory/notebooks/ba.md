# BA — Notebook

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

**Last updated:** 2026-06-23 | **Sprint:** FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION

## FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION · 2026-06-23

Spec complete. REQ file: `docs/handoffs/FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION-BA-spec.md`. Zero PO blockers. Four architect ratification items (ARCH-RATIFY-CONF-1 through CONF-4). NEXT: architect.

Key BA findings: Three distinct `verified_decision` write paths all missing confidence. Path A (dominant, 86% of rows) = `storeAlerts` + `storeAlertsFromCommander` in `alertStore.ts` — co-write INSERT omits `confidence_score` column entirely, falls to column DEFAULT 50. The `Alert` object at call-site already carries `alert.confidence_score` (from alertGenerator.ts:296 when Signal objects carry it) — wire it directly; fallback = severity-to-int map (critical→90, high→75, warning/medium→60, low→40). Path B (minority) = `agentSignalTools.ts` MCP tool post_signal without `finding_data.confidence` → pass `null` not undefined, so DB stores NULL not DEFAULT. Path C = structural enabler = `DEFAULT 50` on `schema-news.ts:104` ALTER TABLE — remove the DEFAULT. Read-path `?? 50` at `stockSignalsHandler.ts:224` is currently dead (DB writes 50, never NULL) but must be hardened to `?? null` so genuine-absence is honest post-fix. No backfill of existing 3316 legacy rows. `assembleBriefing.ts` is NOT a write path for `agent_signals` — topConviction is a briefing struct field, not a DB write; ARCH-RATIFY-CONF-3 flags a possible cowork-agent path that may thread conviction score via `post_signal`.

Decision journal (task_id: FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION):
- what-considered: "(A) Wire conviction from assembleBriefing.topConviction into agent_signals — REJECTED as primary path (assembleBriefing does NOT post agent_signals; the topConviction value is a response field). (B) Severity-map fallback only — rejected as sole approach (ignores the already-computed alert.confidence_score in the Alert object). (C) Wire alert.confidence_score with severity-map fallback — CHOSEN (uses real computed value first, deterministic proxy only when absent). DEFAULT removal: (A) keep DEFAULT 50 and rely on explicit pass — rejected (leaves the mask in place for future callers); (B) remove DEFAULT entirely — chosen (honest: omission becomes NULL, not plausible-fake)."
- why-change: "Three-path root cause; the column DEFAULT is the structural enabler across all paths; removing it + wiring real values + hardening read-path is the minimal correct fix set."

**Last updated:** 2026-06-18 | **Sprint:** FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER

## FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER · 2026-06-18

Spec complete. REQ file: `docs/handoffs/FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER-BA-spec.md`. Zero PO blockers. Three architect ratification items (ARCH-RATIFY-CWKSCH-1 through CWKSCH-3). NEXT: architect.

Key BA findings: Two write paths exist — Writer-A is the cowork-team dispatcher (agent-side file I/O in `last-fired.md` Step 5b; already has single-read + temp-rename). Writer-B (MCP tool) does NOT exist — the write is entirely agent-side (no `apps/mcp-server/` production code change needed). The root fix is FR-4 monotonic guard: in the WON_SLOTS update loop, only write `slot.last_fired = FIRED_AT` when `FIRED_AT > currentLastFired` (ISO-8601 lexicographic compare; null treated as "always allow write"). Test coverage: new T-14 in `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` — two concurrent simulated writers mutating DIFFERENT slots, Writer-A stale base → both slots persist. Scope: (1) `last-fired.md` spec update, (2) T-14 test. Out of scope: any `apps/mcp-server/` production code, `match-slots.md`, `cowork-schedule.json` schema.

Decision journal (task_id: FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER):
- what-considered: "(A) New MCP tool update_slot_last_fired routing through mcp-server — rejected (over-engineering, adds deployment dependency). (B) Monotonic guard in flow spec + T-14 test — chosen (minimal, correct, matches orch-state-cutover precedent). (C) Rely on leader lock alone — insufficient (leader lock prevents concurrent leaders, not the stale-base within one leader's write window)."
- why-change: "Monotonic guard is the minimal correct fix at the write discipline layer; T-14 directly proves the concurrent-writer gate from the verification criteria."

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

**Last updated:** 2026-06-05 | **Sprint:** CYCLE-2026-06-05-THRU-14

## Cycle-2026-06-05-THRU-14 (Archived)

Specs complete, all NEXT: architect. Compressed archive:
- BA-KINHDICH-HOVER-DETAIL: single-file QueName.tsx enrichment from bundle. DONE BAR = :3001 RAW-verify.
- BA-VN-MACRO-TOOLING: 7 tools (5 new + 1 extend + 1 register), multi-zone blueprint, 6 blockers (all VPS probe gated).
- KINHDICH-HOVER-ENRICH-FE-BA: 3-file codegen extension (gen-que-descriptions.ts / regen / QueName hoverSummary fallback), DRY invariant.
- KINHDICH-HOVER-ENRICH-BA: Option C (HoverSummary localized field in queReference struct), 64 VI+EN entries pre-authored.
- QUE-TOOLTIP-DRY-BA: render-sites audit, QueName SSOT, 3 blockers (endpoint vs local-mirror, ID availability, tooltip fields).
- DEEPFETCH-RAG-REDESIGN-BA: LanceDB 8-col add, config 4-key map, 3 callers updated, Q1-Q4 Phase 2/3 gated.
- TOOL-SURFACE-UPGRADE-BA: 162 true tools, system-map 146 (17 missing, 2 ghosts), session cache root cause, 6 blockers.
- WORKFLOW-FLUIDITY-BA: WF-1 (task_release/head-reset), WF-2 (TS write path), WF-3 (binding inheritance), 3 blockers.
- ORCH-TASK-CANON-BA: done[]:66 rows, coalesced task_id/title, 27 status variants, 4 blockers (schema SSOT, migration runner).
- ORCH-DASH-DECISION-DRILLDOWN-BA: 3 architect blockers (full findings in git history).

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
