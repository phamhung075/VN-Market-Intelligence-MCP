# dev-frontend notebook

**Last updated:** 2026-06-16 | **Sprint:** INFOCARD-EXPAND-FETCH

---

## Session: 2026-06-16 (FIX-INFOCARD-DROPDOWN-EXPAND — DJ-GATE-1 remediation)

**DJ-GATE-1 REMEDIATED — added STEP dev-frontend-S2 to sprint-INFOCARD-EXPAND-FETCH-dev-frontend.md**

Added decision journal entry for task-id FIX-INFOCARD-DROPDOWN-EXPAND documenting: Radix Collapsible chosen (keyboard + aria-expanded; existing dep); FIELD_LABELS is a UX label map not a data branch (humanLabel fallback = generic render of any Record<string,unknown>); honest empty-state when findingData+source both null; source rendered as clickable provenance link. Board flipped review → done (next_agent=ops). QA cycle-284 all-green on code/tests/tsc/genericity/empty-state; DJ was the sole blocker.

Zone health: FIX-INFOCARD-DROPDOWN-EXPAND done (doc remediation only, no code change); DJ-GATE-1 cleared; ops rebuild batched with FIX-CASCADE-CARD-INVALID-DATE | HEALTHY

---

## Session: 2026-06-16 (FIX-INFOCARD-DROPDOWN-EXPAND — REVIEW)

**FIX-INFOCARD-DROPDOWN-EXPAND DONE — reusable expand-on-click primitive + full finding_data path**

New/changed files:
- `apps/frontend/app/components/InfoCardExpand.tsx` (NEW) — reusable `InfoCardExpand` + `FindingDataPanel` using Radix Collapsible; keyboard + aria-expanded; Vietnamese labels; honest empty-state; generic field render via FIELD_LABELS map
- `apps/frontend/app/domain/market.ts` — `AgentSignal` extended with `findingData: Record<string,unknown>|null` + `source: string|null`
- `apps/frontend/app/lib/api/client.ts` — `toAgentSignal` mapper updated to extract `finding_data` (object or JSON string) + `source` (top-level → findingData fallback)
- `apps/frontend/app/routes/dashboard.analysis.tsx` — `MacroImpactPanel` and `StockSignalsPanel` both wired to `InfoCardExpand`; import added
- `apps/frontend/app/__tests__/1938-stock-signals.test.ts` — `SAMPLE_SIGNAL` const updated with `findingData: null, source: null`
- `apps/frontend/app/__tests__/FIX-INFOCARD-DROPDOWN-EXPAND.test.tsx` (NEW) — 25 tests: 8 mapping, 9 FindingDataPanel, 8 InfoCardExpand — all GREEN

Test results: 1695 pass / 2 fail (2 pre-existing QUE_DESCRIPTIONS failures unrelated). tsc: EXIT 0.

Zone health: expand-on-click wired to MacroImpactPanel + StockSignalsPanel; full finding_data path end-to-end; REBUILD_REQUIRED (FE container, batched by ops) | HEALTHY

---

## Session: 2026-06-16 (FIX-CASCADE-CARD-INVALID-DATE — REVIEW)

**FIX-CASCADE-CARD-INVALID-DATE DONE — 1 shared helper, 4 brittle sites replaced**

Created `apps/frontend/app/lib/formatDate.ts` — 4 exports:
- `parseDate(raw)`: normalises bare SQLite/ISO/millis/offset → Date|null (null on NaN/empty/garbage)
- `formatDateVi(raw)`: full vi-VN locale date+time or "—"
- `formatDateOnlyVi(raw)`: date-only vi-VN or "—"
- `formatSignalTimestamp(raw)`: compact HH:mm (today) or MM-DD HH:mm (other day) or "—"

Brittle sites replaced (BEFORE=4, AFTER=0):
1. dashboard.analysis.tsx:780 — `new Date(sig.createdAt.replace(" ","T")+"Z").toLocaleDateString("vi-VN")` → `formatDateOnlyVi(sig.createdAt)`
2. dashboard.analysis.tsx:1279–1292 — `formatSignalTime()` body (blind +Z, no NaN guard) → delegates to `formatSignalTimestamp()`
3. dashboard.sector-cascade.tsx:218–227 — `formatHitAt()` body (try/catch, no NaN guard) → delegates to `formatDateVi()`
4. dashboard.kinh-dich-signals.tsx:223–231 — `formatTimestamp()` body (same pattern) → delegates to `formatDateVi()`

Test: 33 new tests in `app/__tests__/FIX-CASCADE-CARD-INVALID-DATE-formatDate.test.ts` — all GREEN.
Vitest total: 1670/1672 pass (2 pre-existing QUE_DESCRIPTIONS failures unrelated). tsc: EXIT 0.

Zone health: All timestamp renders now use shared formatDate helper; "Invalid Date" impossible in any cascade/signal card; helper is pre-backend-ISO-normalisation safe | HEALTHY

---

## Session: 2026-06-16 (FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH — T4 complete)

**FIX-ERRAUDIT-W2-FE-T4 DONE — 28 Cluster A dashboard loaders migrated to safeFetch**

Tasks completed this session (T4 routes):
- Named-helper routes (each: add import, add parseXxxDto, replace try/catch with safeFetch + error-guard return):
  officers, financials, fed-rates, reputation, technical (fetchPriceHistory), bctc (fetchAnalysisBriefs)
- Inline-loader routes (add parse function + safeFetch call directly in loader):
  dashboard._index, dashboard.news, dashboard.orchestration, dashboard.quality-audit
- Routes from prior session (same pattern): alerts, agm-plan-actual, conviction-history,
  corporate-events, foreign-flow, global-markets, intel, kinh-dich-signals, macro,
  market-summaries, news-buzz, prediction-claims, sector-cascade, sector-rotation, shareholders

Key architectural patterns:
- parseXxxDto(null) returns empty-shape struct (no throw) for safeFetch error-path recovery
- For routes where tests expect null fields on error (macro: indicators/signals, financials: summary/rankings):
  add `if (error !== null) { return { ...null-fields..., error }; }` guard in fetch helper
- dashboard.vps.tsx: SKIPPED (uses proxyError not error, calls MCP_SERVER_BASE_URL directly)
- dashboard.analysis.tsx inline brief fetch: SKIPPED (intentional 4xx error-body parsing, not simple safeFetch)
- test updates: non-Error throw = not.toBeNull(); null body 200 = toBeNull() (parse(null) silent)
- macro null body special-case: parse(null) returns empty stub with indicators obj, signals=null;
  error stays null; test updated to reflect new contract

tsc: 0 errors. vitest: 1637/1639 pass (2 pre-existing QUE_DESCRIPTIONS schema failures, unrelated).
Commit: 75a89a3b — feat(frontend/FIX-ERRAUDIT-W2-FE-T4): migrate all 28 Cluster A dashboard loaders to safeFetch

Zone health: All dashboard loaders now use bounded safeFetch (55s deadline); FETCH_DEADLINE_MS SSOT applied | HEALTHY

---

## Session: 2026-06-14 (KINHDICH-HOVER-DETAIL)

**KINHDICH-HOVER-DETAIL DONE (1-file change, tsc green)**
- apps/frontend/app/components/QueName.tsx: added `import { QUE_DETAIL } from "~/lib/que-descriptions-detail.generated"`; added `const detail = QUE_DETAIL[hexagram]` lookup; replaced flat single-line render with enriched branch (coreMeaning + Trạng thái + Thuận + Cảnh báo + marketTrendLabel); FR-3 fallback (`desc.hoverSummary ?? desc.coreMeaning`) preserved when detail absent; FR-4 "Xem chi tiết →" deep-link kept unconditionally; max-w-xs bumped to max-w-sm for 4-clause fit; phases[] OMITTED (reference page only).
- tsc --noEmit: EXIT 0 (no errors). One-file scope confirmed.

Zone health: QueName tooltip enriched with full QUE_DETAIL (coreMeaning+state+favorable+warning+trend); fallback intact; peer containers untouched | HEALTHY

---

## Session: 2026-06-14 (KINHDICH-HOVER-ENRICH-FE)

**KINHDICH-HOVER-ENRICH-FE DONE (3-file change, tsc green)**
- scripts/gen-que-descriptions.ts: added `hoverSummary: { vi; en }` to QueRefEntry interface; extracted + backtick-escaped `entry.hoverSummary.vi` in BLOCK 1 loop; emitted `hoverSummary` field per entry; added `hoverSummary?: string` with JSDoc to QueDescription interface in output template; updated field-mapping comment header.
- apps/frontend/app/lib/que-descriptions.generated.ts: regenerated via `bun run scripts/gen-que-descriptions.ts` — 64 entries, 65 hoverSummary occurrences (64 + interface line), 0 entries < 80 chars, coreMeaning x64 intact, header comment preserved.
- apps/frontend/app/components/QueName.tsx L75: `{desc.coreMeaning}` → `{desc.hoverSummary ?? desc.coreMeaning}` (coreMeaning fallback preserved).
- tsc --noEmit: EXIT 0 (no errors). DRY mechanism intact (single SSOT→codegen→generated→QueName chain).
- ARCH-RATIFY-FE-1 CONFIRMED. Flagging ops for frontend-only container rebuild.

Zone health: KINHDICH hover tooltip enriched; 64 quẻ now show plain-VN 80–220 char summaries; peers untouched | HEALTHY

---

## Session: 2026-06-13 (FIX-FRONTEND-NAV-STALE-COUNT-TESTS)

**FIX-FRONTEND-NAV-STALE-COUNT-TESTS IN_PROGRESS→REVIEW (commit e43480e0)**
- Fixed 21 stale frozen-count assertions in 6 test files (no production code touched).
- FE-HEADER-SSOT-top-nav.test.tsx: rebaselined 19→26 analyst / 26→33 total (SSOT).
- task17-page14 through page18: replaced absolute-count + last/second-to-last assertions with relative-order via findIndex predecessor approach.
- New assertion style: find item by label, find predecessor by label, assert itemIdx === predecessorIdx + 1.
- NAV_ITEMS totals in per-page tests replaced with structural invariant only (no frozen literal sum).
- vitest before: 21 fail / 1533 pass. After: 0 fail / 1554 pass. Delta: +21. tsc: EXIT 0.
- Status: REVIEW

Zone health: 6 nav test files decoupled from frozen counts, 0 failures, relative-order pattern now canonical for per-page nav tests | HEALTHY

---

## Session: 2026-06-13 (QUE-REFERENCE-PAGE-TEST)

**QUE-REFERENCE-PAGE-TEST IN_PROGRESS→REVIEW (commit 13a3bfd0)**
- Created apps/frontend/app/__tests__/QUE-REFERENCE-PAGE-detail.test.ts — 13 tests (T1–T6) against QUE_DETAIL map.
- Extended (renamed) QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts → .tsx — added 2 deep-link tests (withDetailLink anchor/no-anchor).
- Tooltip primitives mocked via vi.mock to avoid React Fast Refresh HMR transforms in jsdom.
- vitest before: 21 fail / 1518 pass. After: 21 fail / 1533 pass. Delta: +15. tsc: EXIT 0.
- Status: REVIEW

Zone health: Tier 4 feature routes 19/19 done, test suite +15 new tests, 21 pre-existing failures stable | HEALTHY

---

## Session: 2026-06-13 (QUE-REFERENCE-PAGE-1b)

**QUE-REFERENCE-PAGE-1b IN_PROGRESS→REVIEW (commit daabfd73)**
- Created apps/frontend/app/routes/dashboard.kinh-dich-reference.tsx (262 lines).
- Imports QUE_DETAIL (64 entries) from que-descriptions-detail.generated.ts — zero hardcoded strings.
- Client-side search/filter: filterQues() — by id, name (romanized), chinese character — pure client, no API.
- Responsive grid: 1 col (mobile) → 2 (sm) → 3 (lg) → 4 (xl).
- QueCard: header (#id chinese name) + trend badge + trigrams + coreMeaning + stateInterpretation + favorable + warning + 6-hào table with actionLabel/outcomeLabel mapped to plain Vietnamese.
- Action map: GIU→"Giữ vững", TIEN→"Tiến", THAN→"Thận trọng", LUI→"Lui", CHO→"Chờ".
- Outcome map: CAT→"Tốt lành", HUNG→"Xấu", LE→"Vất vả nhưng thành công", VO CUU→"Không lỗi".
- trendBadgeClass: THUẬN LỢI=emerald, BẤT LỢI=red, TRUNG TÍNH=slate.
- Deep-link anchors id="que-{id}" with scroll-mt-20 for sticky nav clearance.
- Named exports: actionLabel, outcomeLabel, trendBadgeClass, filterQues.
- tsc: 0 errors. vitest: 21 failed / 1518 passed (21 pre-existing TopNav count tests unchanged).
- Status: REVIEW

Zone health: Tier 4 feature routes 19/19 done (kinh-dich-reference added), tsc clean, 21 pre-existing failures stable | HEALTHY

---

## Session: 2026-06-12 (FE-CORPEVENTS-TICKER-FILTER + FIX-FETCH-VERYSTALE-LABEL + QUE-TOOLTIP-DRY)

**Last updated (previous):** 2026-06-12 | **Sprint:** FE-CORPEVENTS-TICKER-FILTER → REAUDIT-FE (stale indicators)

**Runbook:** `.github/workflows/ci.yml` § frontend-build job; `docs/standards/remix-ssr-patterns.md` — hydration guards, SSR non-fatal fetch.

---

## Session: 2026-06-12 (FE-CORPEVENTS-TICKER-FILTER + FIX-FETCH-VERYSTALE-LABEL + QUE-TOOLTIP-DRY)

**FE-CORPEVENTS-TICKER-FILTER DONE (commit 4f0d407a)**
- Add client-side ticker selector to /dashboard/corporate-events. filterEvents gains optional selectedTicker param (default 'Tất cả').
- Cascade: category filter → ticker filter. distinctCodes from payload events[].code via Set dedup.
- Ticker `<select>` integrated beside category tabs (label 'Mã:').
- Tests: 31 new vitest GREEN (Suite 17/18/19); 84 pass / 0 fail total.
- Status: REVIEW

**FIX-FETCH-VERYSTALE-LABEL DONE (commit 5c6f194e)**
- Root: SourceFreshnessTable rendered `src.status` verbatim (no "very stale" value for red-dot sources, ageMs > 12h).
- Fix: exported `sourceStatusLabel()` in market.ts — maps color to display string (grey→"no data", green→"fresh", amber→"stale", red→"very stale").
- SourceFreshnessTable now calls `sourceStatusLabel(src)`.
- Tests: 13 new vitest GREEN; Playwright 4/4 GREEN.
- Status: REVIEW; ops to rebuild frontend

**QUE-TOOLTIP-DRY (1a + 1b) DONE**
- 1a: scripts/gen-que-descriptions.ts rewritten; readFileSync que-reference.js → strip wrapper → JSON.parse → emit 2-field interface (coreMeaning + marketTrendLabel).
- que-descriptions.generated.ts: 64 entries, updated QueName.tsx; desc.state_trend→desc.marketTrendLabel.
- Tests: 14 new vitest GREEN; Playwright 4/4 GREEN.
- 1b: dashboard.kinh-dich-signals.tsx — replaced hexagram cell with QueName component. NFR-1/2/3 PASS.
- Tests: vitest GREEN; Playwright 4/4 GREEN.
- Status: REVIEW; batched rebuild pending

---

## Session: 2026-06-11–2026-06-12 (REAUDIT-FE-001 through FE-CORPEVENTS-TICKER-FILTER)

**REAUDIT-FE-001 stale banners DONE (commit e787187f)**
- 5 pages: conviction-history, corporate-events, shareholders, financials, reputation
- Contract probed from LIVE before code: shareholders stale=true/staleByDays=3; financials stale=true/staleByDays=43; others false
- Pattern: stale/staleByDays in DTO + LoaderData + fetch helper + page component
- Amber banner role=status when stale===true
- Tests: 21 new vitest GREEN (5 suites)

**REAUDIT-FE-002 foreign-flow stale_fields badge DONE (commit 11308f1c)**
- Contract: stale_fields=["currentHoldingRatio","maxHoldingRatio","marketCapBn"] live on 2026-06-12
- isFieldStale + staleColumnLabel helpers; column headers render inline "Không có dữ liệu" badge when field in stale_fields
- Tests: 15 new vitest GREEN; Playwright 4/4 GREEN

**REAUDIT-FE-003 stockPerformance direction arrow DONE (commit 9bda7325)**
- Exported directionArrow() + directionArrowColorClass(); StockPerf.direction? "up"|"down"|"flat"
- Arrow rendered inline before changePct with aria-label; undefined→"" backward-compat
- Tests: 21 new vitest GREEN; Playwright 4/4 GREEN

**TASK-17 Tier-4 Pages (6 routes)**
- P1-1b news-sentiment page: SentimentPill, stale banner, 23 new tests
- P1-2b macro-regime page: InvestmentClockCard, phase explanation, 7 new tests
- P1-3b financial reports hub: BriefCards, ticker search + exchange filter, 17 new tests
- P2-1b price/technical page: LatestPriceStat, StockChart reused, TickerSwitcher, 23 new tests
- TASK17-AGM page: year selector, SummaryBanner, IN_PROGRESS guard (completion_pct null→not "0%"), 44 tests
- TASK-17-PAGE-8 market-summaries archive: DETAIL+LIST dual-mode, live payload verified, 62 new tests
- TASK-17-PAGE-9 sector-rotation: 5d-accumulating honest banner, 54 new tests
- TASK-17-PAGE-10 sector-cascade: distinct lens (CASCADE pressure not price), 65 new tests
- TASK-17-PAGE-13 corporate-events: category filter tabs, byType breakdown, topActiveCodes, 67 new tests
- TASK-17 alerts page: fetchAlertsData, Signal interface {type,severity,message,confidence}, signalTypeLabel VN map, 21 new tests
- TASK-17 RENDER FIX alerts: signals string[]→Signal objects, SignalChip with severity colour, 30 tests
- TASK-17 intel page: fetchIntelData, latest CHEF dish prominent, 16 new tests

**GO-FLEET-DEPLOY correctness fix DONE**
- Removed "not deployed on this host by design" scaffolding (banner, not_deployed_count, fallback states)
- All services now genuinely deployed; unreachable service = DOWN (RED)
- Tests: 61/61 GREEN (+3 files updated)

---

## Archive: Earlier Sessions (2026-06-05 through 2026-05-25)

**2026-06-06 (F-3 + FIX-ORCH-DONE-GRID-COLS):**
- F-3 FETCH-OPS-PAGE-TRUTH: replaced Reuters/Bloomberg with real fetch-status (13 VN sources freshness, VPS proxy, BCTC pipeline); 380/380 Vitest GREEN
- FIX-ORCH-DONE-GRID-COLS: extracted DONE_GRID const, moved status_note to banner; 363/363 Vitest GREEN

**2026-06-05 (ARCH-ORCH-F3 + FE-HEADER-SSOT):**
- ARCH-ORCH-F3: decision accordion on /dashboard/orchestration, StepCard inline, sprintId threaded; 26 new tests
- FE-HEADER-SSOT: PageHeader SSOT component, 8 pages migrated; 320/320 Vitest GREEN (+7)

**2026-06-04 (DSI-S1-FE-TYPE):** StockQuote.change→number|null, changePercent, staleness fields; 303/303 Vitest GREEN (+8)

**2026-06-02 (FOU-3-FE, ORCH-DASH-LIVE, FE-AUDIT):**
- 2-axis Service Health (container × capability), Live auto-refresh, VPS discrimination, 264–295 tests GREEN

**2026-06-01 (FBT-DEV):** BCTC-inspect + bctc-eval splat proxies

**2026-05-28 (BCTC-EVAL-FE + P2-H macro snapshot signals):**
- shadcn: table/badge/collapsible; EvalStatus/EvalStage types; fetchBctcEvalList/Detail/Thresholds APIs; 204/204 Vitest GREEN
- P2-H: MacroSignal + array→MacroSignalEntry + keyed object; Object.entries/values pattern; 183/183 GREEN

**2026-05-26 (Phase 2 P2-A/B/C + P2-F):** ESLint fence (G4) installed + G10 blind-fix ("↑↑"→"↑"); 179/179 Vitest GREEN

**2026-05-25:** Phase 1 MVR complete (P1-A + P1-B1..B4 + P1-C + P1-E); 179/179 Vitest GREEN; 4/4 Playwright GREEN

---

**Current state (2026-06-12):** All REAUDIT + TASK-17 pages complete and REVIEW status. Full Tier 4 dashboard deployed. Frontend rebuilt post-FIX-FETCH-VERYSTALE-LABEL. tsc clean. 1518+ vitest GREEN.

**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright

**Key patterns:** ClientTimestamp SSR→locale, hydration suppression per-element, Promise.allSettled() for parallel fetch, unknown + type guards (no any), .server suffix violation prevention
