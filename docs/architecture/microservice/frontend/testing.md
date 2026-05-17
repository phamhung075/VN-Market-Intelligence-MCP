# Frontend — Testing Documentation

> Service: `apps/frontend/` | Framework: Remix 2 (Vite) | Test runner: Vitest 1.6

## Test Strategy

| Tier | Tool | Scope |
|---|---|---|
| Unit — pure functions | Vitest | Domain helpers, API response parsers, error formatters |
| Unit — React components | Vitest + @testing-library/react | Client-only components (hooks, useEffect) |
| Unit — loaders | Vitest | Data transform + error handling (mock fetch) |
| e2e | Playwright | Critical user journeys (smoke, nav) |

Run command: `cd apps/frontend && npx vitest run`

## Test Files

### `app/__tests__/001-api-client.test.ts` — 3 tests
Tests the API client (`app/lib/api/client.ts`) fetch wrapper:
- `fetchGatewayHealth` returns typed `GatewayHealthResponse`
- `fetchGatewayHealth` throws `ApiError` on non-ok response
- `fetchGatewayHealth` propagates network errors

### `app/__tests__/1932a-api-health.test.ts` — 7 tests
Tests health-related API functions:
- `fetchServiceHealth` for all 4 VPS services
- Response shape validation (latency, checkedAt, status)

### `app/__tests__/1932b-api-news.test.ts` — 11 tests
Tests news API functions:
- `fetchReutersHeadlines` + `fetchBloombergHeadlines` response mapping
- Empty array on 404, error propagation

### `app/__tests__/1932c-api-market.test.ts` — 12 tests
Tests market API functions:
- `fetchPriceHistory` response shape (PricePoint array)
- `fetchMacroExternal` response shape (MacroData)

### `app/__tests__/1933-bug-fixes.test.ts` — 12 tests
Tests for cycle 1933 bug fixes:
- `toUserFriendlyError`: strips ApiError paths from user-facing messages (5 assertions)
- `fetchServiceHealth` field alias tolerance: `latency`/`latencyMs`/`latency_ms`, `checkedAt`/`checked_at`/`timestamp` (7 assertions)

### `app/__tests__/1934-macro-panel.test.ts` — 10 tests
Tests for `parseMacroSources` domain function (`app/domain/market.ts`):
- Null/empty input returns empty array
- 6-source response maps to 6 rows
- ok/failed status detection
- error field propagation

### `app/__tests__/1936-client-timestamp.test.tsx` — 6 tests
Tests for `ClientTimestamp` and `ClientTimeString` components (`app/components/ClientTimestamp.tsx`):
- Initial render mounts without throwing
- After `act()` flush: renders non-empty formatted string containing digits
- Empty ISO string input does not throw
- `className` prop forwarded to wrapping `<span>`
- `ClientTimeString` renders placeholder or valid time string after mount

## Mocking Approach

- `global.fetch` is mocked via `vi.fn()` in all API layer tests
- Mock reset handled per test via `beforeEach`/`afterEach`
- React hooks tested with `@testing-library/react` `render` + `act` — no Remix context needed for component-level tests
- Remix Vite plugin preamble check patched in `app/__tests__/setup.ts` via `window.__vite_plugin_react_preamble_installed__ = true`

### `app/__tests__/1937-ta-snapshot.test.ts` — 6 tests
Tests `fetchTASnapshot` API function:
- POST request shape and response mapping
- Error propagation on non-ok response

### `app/__tests__/1937-decision-logic.test.ts` — 10 tests
Tests `computeDecision` pure function from `dashboard.analysis.tsx`:
- All 5 score bands (MUA MẠNH / MUA / GIỮ / BÁN / BÁN MẠNH)
- TA trend impact, RSI thresholds, KD signal variants, price trend delta

### `app/__tests__/1938-stock-signals.test.ts` — 12 tests
Tests `fetchStockSignals` API function:
- Response mapping from snake_case DB rows to `AgentSignal` domain objects
- `confidence_score` normalisation 0–100 → 0.0–1.0
- Direction extraction from `finding_data`, `payload`, and fallback
- Empty/null input graceful handling

### `app/__tests__/1939-watchlist.test.ts` — 16 tests
Tests for Task 1939 — watchlist navigation:
- `WATCHLIST_STOCKS` constant: at least 30 active entries, all required fields present, canonical tickers included
- `groupBySector()`: groups by sector key, excludes inactive by default, `includeInactive` option, empty input
- `fetchWatchlistPrices()`: `{ quotes: Record<...> }` envelope shape, flat array shape, HTTP error returns `{}`, empty map on no data
- `fetchCascadeSignals()`: cascade signals mapping, empty array on no signals, empty array on API error
- `WatchlistTileData` type shape: required fields, direction values

## Known Gaps

- No Playwright e2e tests run in CI (requires live dev server on port 3001)
- No loader-level unit tests (loaders tested implicitly through API layer mocks)
- No snapshot tests for route render output

## Coverage Notes

- API service layer (Tier 3): 100% of exported functions covered (105 tests)
- Domain helpers (`parseMacroSources`, `toUserFriendlyError`, `groupBySector`, `WATCHLIST_STOCKS`): covered
- Client-only components (`ClientTimestamp`, `ClientTimeString`): covered
- Route loaders: not directly tested (integration concern)
- `computeDecision` scoring logic: fully covered (5 bands × multiple conditions)
