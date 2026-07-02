# dev-frontend notebook

**Last updated:** 2026-07-02 | **Sprint:** MERGE-MONEY-RADAR-INTO-MOMENTUM

---

## Session: 2026-07-02 (MERGE-MONEY-RADAR-INTO-MOMENTUM — merge money-radar into momentum)

**WU-1-MERGE-PAGES + WU-2-COVERAGE-MAP DONE — /dashboard/momentum now carries BOTH momentum (Section A) + money-radar (Section B)**

Zone health: 82 test files; 2006 pass / 2 fail (pre-existing QUE-TOOLTIP); tsc 0 errors; Playwright 4/4 GREEN | HEALTHY

Task: merge `/dashboard/money-radar` (MONEY-RADAR-P0) into `/dashboard/momentum` (TASK-502) per `docs/handoffs/BA-MERGE-MONEY-RADAR-INTO-MOMENTUM.md` — one unified page, two distinct DTO/parser/formatter families (do-not-homogenize preserved, AC3/AC10).

Files updated:
- `routes/dashboard.momentum.tsx` — Section B ("Radar Dòng Tiền") ported verbatim, colocated (PM-RATIFY-1, no new `app/lib/moneyRadar/`); merged `loader()` via `Promise.allSettled(fetchMomentumIndicators, fetchMoneyRadarComposite)` — per-feed isolation (AC2); page FreshnessBadge = older(momentum.generated_at, radar.generated_at); h2 headings added per section
- `routes/dashboard.money-radar.tsx` — collapsed to loader-only 302 redirect → `/dashboard/momentum` (AC4, no default export — loader always redirects before render)
- `components/TopNav.tsx` — `ANALYST_NAV[26]` relabeled "Động Lực P1" → "Động Lực & Dòng Tiền" (same position/route; SSOT 27/34 unchanged)
- `__tests__/money-radar-cards.test.ts` — import path only (FR-2.4)
- `__tests__/ind-p1-momentum-nav.test.tsx` — 6 label assertions + DOM assertion relabeled
- `__tests__/ind-p1-indicator-gauges-nav.test.tsx`, `__tests__/task17-page19-news-buzz-nav.test.tsx` — 1 hardcoded "Động Lực P1" regression-guard assertion each (found beyond BA's file-inventory grep, fixed same commit)
- `docs/data/frontend-data-coverage-map.json` — +4 rows for `/dashboard/momentum` radar scalars (score, foreign_accum_z_market, rel_vol_z_20, divergence.flag), status LIVE; rows 45→49, LIVE 35→39

Commit: `ced952ca` | tsc: 0 errors | vitest: 2006 pass / 2 pre-existing fail | Playwright: 4/4 GREEN
Manual RAW-verify: curl /dashboard/momentum → 200, both `aria-label="Chỉ báo..."` sections present; curl /dashboard/money-radar → 302 → /dashboard/momentum.

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

**Current state:** 82 test files; 2006 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate); DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize, e.g. dashboard.momentum.tsx's momentum vs radar families).
