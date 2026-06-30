# dev-frontend notebook

**Last updated:** 2026-06-30 | **Sprint:** BA-IND-P1-MOMENTUM-FRONTEND

---

## Session: 2026-06-30 (TASK-502-MOMENTUM-FRONTEND — 4 P1 momentum gauge cards)

**TASK-502-MOMENTUM-FRONTEND DONE — GaugeCard extracted, 4 momentum cards wired, nav added, honest-NULL enforced**

Zone health: 81 test files; 1967 pass / 2 fail (pre-existing QUE-TOOLTIP); tsc 0 errors; Playwright 3/3 GREEN | HEALTHY

Task: surface 4 P1 momentum scalars on `/dashboard/momentum`:
  momentum_factor_z (ROC), market_rs_composite (RS), net_new_highs (52W), foreign_accum_z_market (FA).

Files created:
- `components/GaugeCard.tsx` — extracted from dashboard.indicator-gauges (AC-M1); adds expandContent prop
- `routes/api.momentum-indicators.tsx` — transparent proxy (proxyUpstream pattern)
- `routes/dashboard.momentum.tsx` — loader + 4 GaugeCards; parseMomentumIndicatorsDto; formatRSComposite; honest-NULL; InfoCardExpand dropdowns
- `__tests__/ind-p1-momentum-cards.test.ts` — 10 suites, 49 cases GREEN
- `__tests__/ind-p1-momentum-nav.test.tsx` — 7 suites, nav count + position

Files updated:
- `routes/dashboard.indicator-gauges.tsx` — inline GaugeCard removed; import from ~/components/GaugeCard
- `components/TopNav.tsx` — 'Động Lực P1' at ANALYST_NAV[26] (26→27, 33→34 NAV_ITEMS)
- `__tests__/FE-HEADER-SSOT-top-nav.test.tsx` — SSOT counts bumped 26→27, 33→34
- `__tests__/ind-p1-indicator-gauges-nav.test.tsx` — count + position guards updated
- `__tests__/task17-page19-news-buzz-nav.test.tsx` — count + position guards updated
- `docs/data/frontend-data-coverage-map.json` — +4 GAP rows for /dashboard/momentum

Commits: `8828a68e` (AC-M1 atomic extract), `24de1fe5` (feature)
Pre-existing QUE-TOOLTIP failures (2) — unrelated to TASK-502; tracking from prior sessions.

---

## Session: 2026-06-30 (IND-P1-FRONTEND-GAUGE-CARDS — 6 P0 indicator gauge cards)

**IND-P1-FRONTEND-GAUGE-CARDS DONE — 6 gauge cards wired, nav added, honest-NULL enforced**

Task: surface 6 live P0 indicator scalars on `/dashboard/indicator-gauges`:
  rv_20d_percentile, news_sentiment_z, breadth_z_score.value,
  foreign_outflow_z_5d, omo_net_outstanding_bn_vnd, policy_refi_rate_pct.

Files created:
- `routes/dashboard.indicator-gauges.tsx` — loader + 6 GaugeCards; honest-NULL (null → "chưa có dữ liệu" + gray badge)
- `routes/api.indicator-gauges.tsx` — transparent proxy (proxyUpstream) to mcp-server
- `__tests__/ind-p1-frontend-gauge-cards.test.ts` — 12 suites, ~60 cases (parse/format/fetch helpers)
- `__tests__/ind-p1-indicator-gauges-nav.test.tsx` — 7 suites (nav count + position)

Files updated:
- `components/TopNav.tsx` — added 'Chỉ Báo' at ANALYST_NAV[25] (25→26, 32→33 NAV_ITEMS)
- `__tests__/FE-HEADER-SSOT-top-nav.test.tsx` — SSOT counts bumped 25→26, 32→33
- `__tests__/task17-page19-news-buzz-nav.test.tsx` — count + position guards updated
- `docs/data/frontend-data-coverage-map.json` — +5 rows (rows 37-41, all GAP/WIRED)

CRITICAL DEPENDENCY: mcp-server `/api/indicator-gauges` endpoint not yet deployed.
Frontend renders honest-NULL on 404/502 — never fabricates. Backend task: IND-P1-DEV-MCP-SERVER.

tsc: 0 errors | vitest: 79 files (77 pass, 2 pre-existing QUE-TOOLTIP) | Commits: `0c724d58`, `1ce9a777`

---

## Session: 2026-06-29 (TASK-FEAT-NEWS-DR-HOP2 — decision résumé strip + SentimentPill remap)

RESUMED after killed vitest step. Prior edits confirmed on disk and complete; no re-edits needed.

FR-4: `type Sentiment = "bullish"|"bearish"|"neutral"|null`; SentimentPill green/red/grey (fixes live all-grey bug).
FR-5: `decision_resume: string|null` on `NewsSentimentItem`; `NewsCard` renders résumé skim-first above title (null→omit); `impact_summary` wrapped in Collapsible default-collapsed ("Xem thêm"/"Thu gọn"); source link preserved.
Test Suite 8 added: AC-NEW-1, AC-NEW-2, bearish passthrough, ITEM_WITH_CHIPS — 27/27 GREEN.
tsc: 0 errors. Commits: `5dbd9c2c` (feat), `02a2131f` (orch-state). Task TASK-FEAT-NEWS-DR-HOP2: REVIEW.

Zone health: 77+ test files; 27 new tests added this session; tsc 0 errors; Tier 4 news route complete | HEALTHY

---

## Session: 2026-06-28 (FIX-DUPLICATE-CHART-ZONE — analysis page rendered two StockChart instances)

**FIX-DUPLICATE-CHART-ZONE DONE — removed stale bare StockChart from StockDetailPanel**

Root: `dashboard.analysis.tsx` rendered `<StockChart prices={prices} height={560} />` inside `StockDetailPanel` (SSR-loaded data, bare chart, pre-zone-integration copy). `TechnicalZone` mounted separately at the same page level already provides the same 90-day OHLCV chart with richer context (auto-refresh 5min, freshness badge, live badge, period stats row, degraded/stale states).

Fix: Removed the 4-line chart div block from `StockDetailPanel` (pre-`{/* Decision panel */}`) and the now-unused `import { StockChart }` at the top of the file. `TechnicalZone` ("Giá & Kỹ thuật" SectionCard) remains as sole chart zone.

Files changed: `apps/frontend/app/routes/dashboard.analysis.tsx` — 6 deletions.
Commit: `b97bf990` | tsc: 0 errors | Rebuild: frontend-only (single service) — DONE, verified HTTP 200.

---

**Current state:** 79 test files; 1918 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate); DDD layers enforced.
