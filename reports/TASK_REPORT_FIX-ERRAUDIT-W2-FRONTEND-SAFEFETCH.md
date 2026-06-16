## Task Report FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH
date: 2026-06-16
outcome: APPROVED

## Test Results
- Unit tests (full suite): 1637 passed / 2 failed
- TypeScript (`pnpm exec tsc --noEmit` in `apps/frontend`): 0 errors (exit 0)
- DDD scan: PASS — fetchUtils.ts has zero imports from infrastructure/application layers
- Security scan: PASS — fetchUtils.ts has zero process.env, no hardcoded credentials

## Pre-existing Failures — Disjoint Proof

The 2 failing tests are:
1. `app/__tests__/QUE-REFERENCE-PAGE-detail.test.ts:117` — asserts `QUE_DESCRIPTIONS[1]` has exactly 2 own keys
2. `app/__tests__/QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx:87` — asserts all 64 entries have exactly 2 keys

These test files were introduced in commit `d7167c0a` (2026-06-13 11:42:45 +0200), titled `test(frontend/QUE-REFERENCE-PAGE-TEST): add QUE_DETAIL integrity + QueName deep-link tests`. The fetchUtils work began on 2026-06-16 (T1 at `c1f56334` 08:00:54, T4 at `75a89a3b` 08:40:58). The failing tests predate the changed files by 3 calendar days. Changed files (`fetchUtils.ts`, `dashboard.*.tsx`, `client.ts`) have zero intersection with `QUE_DESCRIPTIONS` or `QUE-TOOLTIP-DRY` test files. Disjoint-set confirmed — no regression.

## Error-Path Verification (RAW read, 4 loaders sampled)

### safeFetch<T> implementation (fetchUtils.ts)
- AbortController + setTimeout(deadlineMs) armed before fetch call (line 45)
- `finally { if (timerId !== undefined) clearTimeout(timerId); }` — timer cleanup on every path (line 86)
- Non-2xx response: `console.error([safeFetch][label] upstream ${status})` + `return { data: parse(null), error: msg }` — NEVER throws (lines 51–55)
- Throws (including AbortError): `console.error([safeFetch][label] AbortError: fetch aborted after ${deadlineMs}ms)` + `return { data: parse(null), error: msg }` — NEVER throws (lines 69–87)
- FETCH_DEADLINE_MS = 55_000ms (single SSOT constant) — bounded fetch deadline present
- parse(null) contract: each loader's parseXxx function handles null by returning empty-shape struct
- Verdict: TRUE graceful degrade — both network error and deadline paths return typed `{ data, error }` without re-throwing

### Loader samples
1. **dashboard.alerts.tsx** — `parseAlertsDto(null)` returns `{ items: [], count: 0, fetchedAt: ISO }`. `fetchAlertsData` returns `{ items: data.items, count, fetchedAt, error }`. Error propagates to component. PASS.
2. **dashboard.foreign-flow.tsx** — `parseForeignFlowDto(null)` returns full empty struct. Error field propagated in return. PASS.
3. **dashboard.macro.tsx** — `parseMacroRegimeDto(null)` returns stub; additional `if (error !== null)` block overrides indicators/signals/calendar to explicit null on error path (lines 136–144). Most explicit error-path handling in the suite. PASS.
4. **dashboard.kinh-dich-signals.tsx** — `parseKinhDichSignalsDto(null)` returns empty struct. `fetchKinhDichSignalsData` propagates `error` field. PASS.

### Cluster C (client.ts) — non-fatal wrappers
- `fetchKinhDichReadingNonFatal` → `safeFetchOrNull` with `deadlineMs: 10_000, label: 'kdReadingNonFatal'`
- `fetchCascadeSignals` → `safeFetchOrNull` with `deadlineMs: 10_000, label: 'cascadeSignals'`; returns `result ?? []`
- `fetchAccuracyDigest` → `safeFetchOrNull` with `deadlineMs: 10_000, label: 'accuracyDigest'`
- `fetchWatchlistPrices` → `safeFetch` (not safeFetchOrNull — {} contract preserved) with `deadlineMs: 10_000, label: 'watchlistPrices'`; returns `data` (empty `{}` on error)
- All 4 have deadline bounds. All 4 log attribution on error. Degrade contracts preserved.

## Intentional Skips — Justified
- **dashboard.vps.tsx**: Uses `proxyError` field pattern + direct `MCP_SERVER_BASE_URL` fetch (bypasses frontend proxy). Has its own error handling (`proxyError = err instanceof Error ? err.message : "Fetch failed"`; rendered in component as `{proxyError && <span>Endpoint error: {proxyError}</span>}`). Adding safeFetch would change the `proxyError` field contract. Skip is JUSTIFIED.
- **dashboard.analysis.tsx inline brief**: The `analysisBrief` fetch at line 217 is a non-fatal optional enrichment with its own try/catch + null degrade. It uses a distinct error shape (`AnalysisBriefResult | null`) that predates this wave and cannot be migrated without changing the component contract. Skip is JUSTIFIED.

## DDD Compliance: PASS
fetchUtils.ts imports nothing from routes/, components/, domain/, or client.ts. Import direction is routes/ → lib/api/fetchUtils.ts (downward). 54 route files import from fetchUtils per grep. client.ts imports `safeFetch, safeFetchOrNull` from `./fetchUtils.js` (line 16).

## Security: PASS
- fetchUtils.ts: zero process.env, zero secrets, no imports
- process.env hits in dashboard loaders (e.g. alerts.tsx:140–141) are pre-existing Remix server pattern (Node runtime, not Bun) and predate T4 commit by at least 1 commit

## Merge Status
No branch — work is on main. No merge step needed.
Task board: FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH qa → done
