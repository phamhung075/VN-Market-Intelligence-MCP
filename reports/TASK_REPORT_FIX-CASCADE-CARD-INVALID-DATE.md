## Task Report FIX-CASCADE-CARD-INVALID-DATE

changed: [
  apps/frontend/app/lib/formatDate.ts (new, 107L),
  apps/frontend/app/__tests__/FIX-CASCADE-CARD-INVALID-DATE-formatDate.test.ts (new, 230L),
  apps/frontend/app/routes/dashboard.analysis.tsx (4 brittle inline date parses replaced),
  apps/frontend/app/routes/dashboard.kinh-dich-signals.tsx (1 brittle site replaced),
  apps/frontend/app/routes/dashboard.sector-cascade.tsx (1 brittle site replaced)
]

tests: 1695 pass / 2 fail (2 pre-existing QUE_DESCRIPTIONS failures — disjoint confirmed) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0

disjoint-failure-set: CONFIRMED — QUE-REFERENCE-PAGE-detail.test.ts + QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx introduced at d7167c0a (2026-06-13); zero diff on those files between d7167c0a..60652af3; zero overlap with formatDate.ts / dashboard.analysis.tsx / sector-cascade.tsx / kinh-dich-signals.tsx

genericity: PASS — parseDate has zero date-literal special-cases; zero per-card/ticker hardcode; 4 sites all call the shared helper
no-fake-data: PASS — parseDate returns null on NaN; formatters return "—" on null; "Invalid Date" string impossible in any code path
dj-gate-1: PASS — sprint-INFOCARD-EXPAND-FETCH-dev-frontend.md §dev-frontend-S1 contains task-id: FIX-CASCADE-CARD-INVALID-DATE

verdict: APPROVED
