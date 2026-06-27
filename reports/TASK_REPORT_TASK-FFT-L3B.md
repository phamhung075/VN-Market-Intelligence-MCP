## Task Report TASK-FFT-L3B
date: 2026-06-28
outcome: CHANGES_REQUESTED
commit: 9bcb828b

## Test Results
- Unit tests (targeted): n/a (route-wiring task; no new unit tests added in L3B)
- Full suite: 1754 passed / 2 failed (2 pre-existing QUE_DESCRIPTIONS; last-touch d7167c0a, predates 9bcb828b; 9bcb828b touches zero QUE files — confirmed via git show)
- TypeScript: 0 errors (tsc --noEmit clean)
- e2e Playwright: 4/4 PASS

## DDD Compliance: PASS
No domain→infrastructure imports; route files are pure Interface layer.

## Security: PASS
No process.env, no hardcoded credentials, no fabricated data patterns.

## Coverage Verified (33/34 routes)
- 32 routes: FreshnessBadge + useFreshnessRevalidator — WIRED and confirmed
- kinh-dich-reference: STATIC ("Nội dung tĩnh" text, no badge/hook) — CORRECT per FR-5
- bctc-inspect: SKIP (raw HTML proxy, no React component, no default export) — GENUINE

## Spot-Check Results

| Route | Badge Data Source | Verdict |
|---|---|---|
| dashboard.sector-rotation.tsx | loaderData.generatedAt (ISO from endpoint) | PASS — EC-8 complete |
| dashboard.alerts.tsx | loaderData.data_asof + marketHoursOnly=true | PASS |
| dashboard.foreign-flow.tsx | dto.fetchedAt (from endpoint response) + marketHoursOnly=true | PASS |
| dashboard.corporate-events.tsx | loaderData.generatedAt (ISO, not date-only asOf) | PASS |
| dashboard.fed-rates.tsx | loaderData.generatedAt (ISO, asOf preserved as text) | PASS |
| dashboard.financials.tsx | loaderData.generatedAt (ISO, asOf preserved as text) | PASS |
| dashboard.technical.tsx | loaderData.data_asof (from endpoint — real DB timestamp) | PASS |
| **dashboard.analysis.tsx** | fetchedAt = new Date().toISOString() (BAKED loader time) | **FAIL — B-1 + B-2** |

## Issues Found

### Blocking

**B-1** `apps/frontend/app/routes/dashboard.analysis.tsx:255`
`fetchedAt: new Date().toISOString()` — baked server execution timestamp, not real data `generatedAt`.
`KinhDichMarket.timestamp` is available in the `market` object returned by `fetchKinhDichMarket()`.
Badge at line 1756 always reads "now" on page load regardless of how stale the KD data is at source.
Fix: surface `market?.timestamp ?? null` as `kdGeneratedAt` in LoaderData for the KD section badge.

**B-2** `apps/frontend/app/routes/dashboard.analysis.tsx:1746,1756`
ONE badge (intraday) for a two-element page. Coverage map has:
- `"kinh-dich market+readings"` (sla=intraday, asof=generatedAt)
- `"watchlist prices/macro/brief"` (sla=realtime, asof=updatedAt)
DoD: "Analysis pages with multiple elements: each element has its own <FreshnessBadge>".
Dev checked this DoD box but only one badge is implemented.
Also: `useFreshnessRevalidator("intraday")` = 5-min cadence; watchlist prices (realtime) need 1-min cadence.
Fix: add second badge for watchlist section with `slaTierKey="realtime"` + representative watchlist timestamp; call `useFreshnessRevalidator("realtime")` (most aggressive tier wins for the page).

### Non-Blocking

**N-1** `docs/data/frontend-data-coverage-map.json` — `kinh-dich-reference.l3b_status="WIRED"` is incorrect.
Implementation is right (STATIC text per FR-5), but the SSOT documentation is misleading.
Should be `"STATIC_TEXT"` with note "no badge/hook; renders 'Nội dung tĩnh' per FR-5".

**N-2** `apps/frontend/app/routes/dashboard.orchestration.tsx:176` — `fetchedAt = new Date().toISOString()` at loader time.
`state.head.updated_at` available at line 197 as `tsField`. Using it would show actual orch-state age.
Non-blocking (event SLA=60 min; orch data only changes per agent cycle).

## Merge Status
NOT MERGED — CHANGES_REQUESTED. Fix B-1 + B-2 in dashboard.analysis.tsx, then re-submit for QA.
