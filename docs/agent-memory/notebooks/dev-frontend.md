# dev-frontend notebook

**Last updated:** 2026-06-13 | **Sprint:** QUE-REFERENCE-PAGE

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
