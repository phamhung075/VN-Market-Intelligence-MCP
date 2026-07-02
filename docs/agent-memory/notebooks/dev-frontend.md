# dev-frontend notebook

**Last updated:** 2026-07-02 | **Sprint:** DASH-CRON-RECHECK-TABLE

---

## Session: 2026-07-02 (TASK-DASH-CRON-2 — Cron Recheck Table UI, Zone 2)

**TASK-DASH-CRON-2 DONE (implementation) — CronRecheckTable added to /dashboard/orchestration**

Zone health: 83 test files; 2047 pass / 2 fail (pre-existing QUE-TOOLTIP); tsc 0 errors; Playwright 4/4 GREEN (verified against a fresh isolated local dev server — see GOTCHA below) | HEALTHY

Task: build `GET /api/cron-status` proxy + `CronRecheckTable` UI section per `docs/handoffs/TASK-DASH-CRON-2.md` — Zone 2 of DASH-CRON-RECHECK-TABLE sprint, depends on TASK-DASH-CRON-1 (dev-mcp-server, APPROVED r3 commit `82907e5d`).

Files created:
- `routes/api.cron-status.tsx` — proxy, byte-for-byte mirror of `api.orchestration.tsx` (FR-4.1)
- `__tests__/TASK-DASH-CRON-2-cron-recheck-table.test.ts` — 41 assertions: `parseCronStatusDto`, `normalizeCronStatusA/B`, `normalizeCronRowA/B`, `cronStatusBadgeClasses`, `CRON_STATUS_LABELS`, `cronLayerLabel`

Files updated:
- `routes/dashboard.orchestration.tsx` — CronStatusDto types + `parseCronStatusDto` (mirrors `parseOrchStateDto`); loader `Promise.all`'s `/api/cron-status` alongside `/api/orchestration` (CN-4, parallel, no added latency); `CronRecheckTable`/`CronLayerTable`/`CronStatusBadge` components, rendered OUTSIDE the `state ? (...) : (...)` conditional (independent surface, AC-16/AC-25); RECHECK reuses existing `revalidator`; 2nd `FreshnessBadge` (slaTierKey=realtime); Layer-A/B visually distinct sub-sections; Layer-B `status` unconditionally forced `SESSION_SCOPED` (stronger than spec minimum — defends AC-14/NFR-7 even under malformed upstream); "Chưa từng chạy" for null `last_fire` (AC-20); all VN copy (AC-28)
- `docs/data/frontend-data-coverage-map.json` — +1 row incl. `route` field (BA's own FR-6 example omitted it; architect-flagged), rows 49→50, LIVE 39→40

GOTCHA (load-bearing for future Playwright runs): port 3001 is bound by the LIVE `frontend` Docker container (stale image, un-rebuilt) — Playwright's `webServer.reuseExistingServer: !CI` silently piggybacks on it instead of spawning a fresh dev server, which would false-green the G12 gate against OLD code with zero signal on the actual diff. Fix: `PLAYWRIGHT_PORT=<unused> npm run test:e2e` forces a genuinely fresh local Vite server on an unused port. No Docker container touched/rebuilt/restarted.

Container note: mcp-server rebuild for Zone 1 still user-gated — `GET /api/cron-status` 404s live today; proxy relays as-is, loader degrades to empty-shape DTO, table shows "Không có dữ liệu." until the rebuild ships (expected, not a defect).

Commit: `b563c0d2` (code+tests+docs), `3a29d352` (orch-state board) | tsc: 0 errors | vitest: 2047 pass / 2 pre-existing fail | Playwright: 4/4 GREEN (isolated port)

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

**Current state:** 83 test files; 2047 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate); DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize); Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001 (reuseExistingServer piggybacks on it otherwise, false-greening against stale code).
