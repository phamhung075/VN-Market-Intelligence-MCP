# dev-frontend notebook

**Last updated:** 2026-06-28 | **Sprint:** FRONTEND-ANALYSIS-HUB-CONSOLIDATION

---

## Session: 2026-06-28 (FIX-DUPLICATE-CHART-ZONE — analysis page rendered two StockChart instances)

**FIX-DUPLICATE-CHART-ZONE DONE — removed stale bare StockChart from StockDetailPanel**

Root: `dashboard.analysis.tsx` rendered `<StockChart prices={prices} height={560} />` inside `StockDetailPanel` (SSR-loaded data, bare chart, pre-zone-integration copy). `TechnicalZone` mounted separately at the same page level already provides the same 90-day OHLCV chart with richer context (auto-refresh 5min, freshness badge, live badge, period stats row, degraded/stale states).

Fix: Removed the 4-line chart div block from `StockDetailPanel` (pre-`{/* Decision panel */}`) and the now-unused `import { StockChart }` at the top of the file. `TechnicalZone` ("Giá & Kỹ thuật" SectionCard) remains as sole chart zone.

Files changed: `apps/frontend/app/routes/dashboard.analysis.tsx` — 6 deletions.
Commit: `b97bf990` | tsc: 0 errors | Rebuild: frontend-only (single service) — DONE, verified HTTP 200.

---

## Session: 2026-06-28 (FIX-DUPLICATE-TECHNICAL-HEADER — regression from FRONTEND-ANALYSIS-HUB-CONSOLIDATION)

**FIX-DUPLICATE-TECHNICAL-HEADER DONE — removed redundant zone-title text, freshness badge preserved**

Root: `TechnicalZone.tsx` lines 363-366 rendered a `{ticker}` span + `— Giá & Phân Tích Kỹ Thuật` text span inside a flex header — leftover from when TechnicalZone was the standalone `/dashboard/technical` page. Parent `SectionCard title="Giá & Kỹ thuật" subtitle={selectedStock}` at `dashboard.analysis.tsx:1855` already owns both pieces.

Fix: Removed inner `<div className="flex items-center gap-2">` block (ticker + title spans). Changed outer header div from `justify-between` to `justify-end`. `FreshnessBadge` + `ClientTimestamp` retained as sole header content (right-aligned) — satisfies FRONTEND-FRESHNESS-TRANSPARENCY standing requirement.

File: `apps/frontend/app/components/analysis/TechnicalZone.tsx` — net -6 lines (2 insertions, 8 deletions).
Tests: no assertion referenced header text; no test updates needed.

Commit: `843f9cbc` | tsc: 0 errors | Tests: 1856 pass / 2 fail (pre-existing QUE-TOOLTIP/QUE_DESCRIPTIONS) | REBUILD_REQUIRED (ops)

Zone health: TechnicalZone header deduplicated; FreshnessBadge+ClientTimestamp still render; 0 regressions | HEALTHY

---

## Session: 2026-06-28 (FIX-FE-ALERTS-SEVERITY-DEFAULT-500)

**FIX-FE-ALERTS-SEVERITY-DEFAULT-500 DONE — AlertSeverity extended, default branch + normalisation, tsc clean**

Root: `severityColours()` had no `default:` branch; live backend emits `severity:"warning"` → undefined destructure during SSR → 500.
Fix: Extended `AlertSeverity` union to include `"warning"` as first-class value; belt-and-suspenders `default:` branch kept. Data-boundary `normalizeItemSeverity()` coerces unknown values → `"medium"` before switch.
File: `apps/frontend/app/routes/dashboard.alerts.tsx` — 63 insertions, 8 deletions.
Commit: `dda89b1c` | tsc: EXIT 0 | Vitest: 1754/1756 pass | HEALTHY

---

## Session: 2026-06-28 (FE-AHUB-INT-INTEGRATE — serial closer wires 6 zones into analysis hub)

**FE-AHUB-INT-INTEGRATE DONE — 6 zones wired, dashboard.technical.tsx deleted, 1856 tests pass**

`dashboard.analysis.tsx`: imported + placed TechnicalZone, CorporateEventsZone, FinancialsZone, ReputationZone, NewsBuzzZone, ConvictionHistoryZone (each `stock={selectedStock}`). Added Remix `<Link>` buttons for shareholders + officers.
`TopNav.tsx`: removed `"Kỹ Thuật"` nav item (26→25 ANALYST_NAV, 33→32 NAV_ITEMS).
`dashboard.technical.tsx`: deleted via `git rm -f`.
7 test files updated: FE-HEADER-SSOT-top-nav + page14-19 nav tests. page19 fixed ANALYST_NAV[24/25]→[23/24] after index shift.
Commits: `b1b5213a` (code), `9023b481` (docs/board). Tests: 1856/1858 | tsc: 0 | HEALTHY

---

## Session: 2026-06-28 (FE-AHUB-W1-W4 — TechnicalZone, FinancialsZone, CorporateEventsZone, 3 Social Zones)

**4 sprint tasks DONE — 6 zone components, 102 tests GREEN, tsc clean**

- W1 `TechnicalZone.tsx`: useFetcher → `/api/price-history/${stock}?days=90`; LatestPriceStat+PriceChart+StatsRow; 3 exported helpers; 32 tests. Commit `87871e06`.
- W3 `FinancialsZone.tsx`: client-side filter on `/api/financials` full universe; `findFinancialsRow()`; 7 tests. Commit `df70cb76`.
- W2 `CorporateEventsZone.tsx`: client-side filter `/api/corporate-events?days=90`; `filterStockEvents` + `deriveSortedCategories`; 22 tests. Commit `961ce5f8`.
- W4 `ReputationZone.tsx` + `NewsBuzzZone.tsx` (client-side filter) + `ConvictionHistoryZone.tsx` (native `/api/conviction-history?symbol=${stock}`); 41 tests. Commit `4be9d552`.

All self-fetching via useFetcher + useEffect; no parent pre-fetch required. FreshnessBadge on each. HEALTHY

---

## Session: 2026-06-28 (TASK-FFT-L3B — FreshnessBadge wired into all 34 page routes)

**TASK-FFT-L3B DONE — 32 routes wired, EC-8 done, tsc clean, 4/4 e2e PASS**

32 routes: FreshnessBadge + useFreshnessRevalidator; 1 STATIC (kinh-dich-reference); 1 skip (bctc-inspect raw proxy). Key: use `generatedAt` (ISO) not `asOf` (date-only) to avoid midnight-UTC display. STALE_RISK routes (alerts, foreign-flow) use `marketHoursOnly={true}`. market-summaries: FreshnessBadge in both ListView and DetailView.
Vitest: 2 pre-existing QUE_DESCRIPTIONS failures (unchanged). tsc: EXIT 0. e2e: 4/4 PASS.
Coverage map `l3b_status: "WIRED"` set on all 33 wired rows. HEALTHY

---

## Session: 2026-06-27 (TASK-FFT-L3A — shared FreshnessBadge + useFreshnessRevalidator)

**TASK-FFT-L3A DONE — FreshnessBadge + hook created, 46 tests GREEN, tsc clean**

New: `FreshnessBadge.tsx` (null-guard EC-1, static EC-4, off-hours EC-3, green/amber/red thresholds, `_now?:Date` injectable for test isolation); `useFreshnessRevalidator.ts` (setInterval for realtime/intraday/event; no-op for daily/weekly/static EC-5; cleanup on unmount). 46 new tests.
Commit: `afbb0c99` | Vitest: 1754/1756 | tsc: 0 | HEALTHY

---

## Archive: 2026-06-14 to 2026-06-24 (condensed)

- **TASK-CONF-2** (06-24): `AgentSignal.confidence` widened to `number|null`; null→"—" not "0%"; 14 tests GREEN. Commit `6a962dd6`.
- **FIX-INFOCARD-DROPDOWN-EXPAND** (06-16): `InfoCardExpand` + `FindingDataPanel` (Radix Collapsible); `findingData`+`source` fields in AgentSignal; 25 tests. Commit (DJ-GATE-1 cleared).
- **FIX-CASCADE-CARD-INVALID-DATE** (06-16): `lib/formatDate.ts` (parseDate/formatDateVi/formatDateOnlyVi/formatSignalTimestamp); 4 brittle inline-date sites replaced; 33 tests. tsc: 0.
- **FIX-ERRAUDIT-W2-FE-T4** (06-16): 28 Cluster A loaders migrated to `safeFetch`; `dashboard.vps` + analysis inline brief skipped; tsc: 0; 1637/1639. Commit `75a89a3b`.
- **KINHDICH-HOVER-ENRICH-FE** (06-14): `gen-que-descriptions.ts` adds `hoverSummary`; codegen regen; `QueName.tsx` fallback `desc.hoverSummary ?? desc.coreMeaning`. tsc: 0.
- **KINHDICH-HOVER-DETAIL** (06-14): `QueName.tsx` enriched with `QUE_DETAIL` 4-clause tooltip. tsc: 0.

---

**Current state:** 77 test files; 1856 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; ClientTimestamp SSR-safe; unknown+type-guards (no any); DDD layers enforced.
