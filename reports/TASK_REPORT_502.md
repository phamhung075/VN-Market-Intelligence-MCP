# Task Report: TASK-502-MOMENTUM-FRONTEND
date: 2026-06-30
outcome: APPROVED
sprint: BA-IND-P1-MOMENTUM-FRONTEND
qa-session: e71c7736-a95a-4040-b741-1d48454354f6

## Test Results

- Vitest (full suite): 1967 passed / 2 failed (pre-existing — see ruling below)
- TASK-502 specific tests: 49 passed / 0 failed (10 suites cards + 7 suites nav)
- TypeScript: 0 errors (`tsc --noEmit` exit 0)
- Playwright G12 (3 tests): 3 passed / 0 failed

## DDD Compliance: PASS

- `GaugeCard.tsx` — interface layer, presentational only, no API calls
- `api.momentum-indicators.tsx` — interface layer, proxyUpstream only, no domain logic
- `dashboard.momentum.tsx` — interface layer, loader calls `safeFetch` via `~/lib/api/fetchUtils`
- No imports from `infrastructure/` or `application/` in any TASK-502 file

## Security: PASS

- No hardcoded credentials or API keys
- `process.env` pattern in proxy + dashboard loader matches P0 reference (`api.indicator-gauges.tsx`) exactly — pre-existing codebase pattern, non-blocking
- mock-guard: exit 0 PASS (no fabricated-data patterns in production files)

## Per-AC Verdict

| AC | Description | Result | Evidence |
|---|---|---|---|
| AC-M1 | GaugeCard extraction — atomic, backward-compatible | PASS | `GaugeCard.tsx` 127L created; P0 page imports from `~/components/GaugeCard`; expandContent optional prop added; tsc clean |
| AC-1 | Proxy route `/api/momentum-indicators` | PASS | `api.momentum-indicators.tsx` 52L; uses `proxyUpstream`; label "api.momentum-indicators"; mirrors P0 exactly |
| AC-2 | Dashboard page 4-card render + loader + parser | PASS | `dashboard.momentum.tsx` 480L; honest-NULL per card; FreshnessBadge from `computed_as_of`; useFreshnessRevalidator("daily"); parseMomentumIndicatorsDto exported+never throws; fetchMomentumIndicators exported |
| AC-M2 | `formatRSComposite` helper exported | PASS | Defined and exported from `dashboard.momentum.tsx`; correct logic (null→gray, >0→green/MẠNH, <0→amber/YẾU, 0→amber/TRUNG TÍNH) |
| AC-M4 | `low_sample_warning` as detail row (RS card) | PASS | RS card surfaces `low_sample_warning` via `details` prop (detail row) and `InfoCardExpand.findingData.low_sample_warning` — no second badge layer |
| AC-3 | TopNav entry "Động Lực P1" → /dashboard/momentum | PASS | ANALYST_NAV[26] confirmed; LIVE (no comingSoon flag); 27 total items |
| AC-4 | Coverage-map 4 GAP rows for /dashboard/momentum | PASS | 4 rows present with status="GAP"; correct since upstream tools not yet producing data |
| AC-5 | Vitest 10 suites — parseMomentumIndicatorsDto + formatRSComposite + fetchMomentumIndicators | PASS | 36 assertions in 10 suites; all GREEN |
| AC-6 | TopNav test 7 suites — nav count + position + DOM | PASS | 13 assertions in 7 suites; all GREEN; regression guard for "Chỉ Báo" tab present |
| AC-7 | No real service URLs in test fixtures (mock-guard) | PASS | mock-guard exit 0; all fetch calls use vi.spyOn(globalThis, "fetch") |
| AC-8 | TypeScript clean | PASS | tsc --noEmit exit 0 |

## Vitest Failure Ruling — PRE-EXISTING, UNRELATED TO TASK-502

**Failing tests:**
1. `app/__tests__/QUE-REFERENCE-PAGE-detail.test.ts` — T5: `QUE_DESCRIPTIONS[1]` expects 2 keys, got 3
2. `app/__tests__/QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx` — each entry expects 2 keys, got 3

**Evidence these are NOT caused by TASK-502:**
- Both files last modified in commit `d7167c0a` (2026-06-13, "test(frontend/QUE-REFERENCE-PAGE-TEST)")
- TASK-502 commits (8828a68e, 24de1fe5, f095ad0e, d007602c) dated 2026-06-30 — 17 days later
- Neither file appears in any TASK-502 commit `--stat` diff
- Test subject (`QUE_DESCRIPTIONS`) is the Kinh Dịch hexagram feature — no relationship to momentum dashboard
- Same 2 failures present in prior QA gate for IND-P1-FRONTEND-GAUGE-CARDS (cycle-353, same baseline noted)

**Ruling:** Pre-existing failures, caused by commit d7167c0a before TASK-502 work began. TASK-502 did NOT introduce these failures. Gate is not blocked.

## Issues Found

### Blocking
None.

### Non-Blocking
- `process.env` usage in `api.momentum-indicators.tsx` and `dashboard.momentum.tsx` (mirrors P0 `api.indicator-gauges.tsx` exactly — pre-existing codebase pattern)

## Merge Status

No merge needed — work was performed directly on `main` per CLAUDE.md policy (no branches).
Commits 8828a68e, 24de1fe5, f095ad0e, d007602c are already on main.

## Next

TASK-502-MOMENTUM-FRONTEND: DONE. Dispatcher gate-close: mark done_verified, unblock downstream.
