# TECH-108: fix(source-health): pollNews SOURCE_DISPLAY_NAMES

status: APPROVED_BY_ARCHITECT
req_ref: REQ-108

## Blocker Resolution — B1 (Trading Economics display name)

**Finding**: `src/interface/mcp/tools/sourceHealthTools.ts` line 54 seeds `"Trading Economics"` (no "RSS" suffix).
**REQ-108 table** listed `"Trading Economics RSS"` — this is incorrect.
**Authoritative source**: `seedKnownSources` in `sourceHealthTools.ts`.
**Decision**: `SOURCE_DISPLAY_NAMES["tradingeconomics"]` must be `"Trading Economics"` (no "RSS").

Rationale: The display name written by `pollNews` must exactly match the bucket key pre-seeded by `globalSourceTracker.seedKnownSources`. Using `"Trading Economics RSS"` would create a second orphan bucket and leave the seeded `"Trading Economics"` bucket permanently stale — the same bug class as the one being fixed.

## Brownfield Impact

- Files modified: `src/application/usecases/pollNews.ts`
- Files created: `src/__tests__/1332-pollnews-source-display-name.test.ts`
- Files deleted: none
- Breaking changes: no

## Architecture Decision

`pollNews` iterates raw fetcher keys from `resolvedFetchers` and must translate them to display names before calling `globalSourceTracker`. The translation belongs at the application layer, co-located with the health-tracking loop, as a local `const` — not in the domain or infrastructure layers. A `Record<string, string>` with `?? name` fallback is the simplest forward-compatible approach: zero allocations per poll cycle, zero new dependencies.

## DDD Layer Plan

| Component            | Layer       | File Path                                                              | New/Modify |
|----------------------|-------------|------------------------------------------------------------------------|------------|
| SOURCE_DISPLAY_NAMES | application | `src/application/usecases/pollNews.ts`                                | MODIFY     |
| 3 call-site updates  | application | `src/application/usecases/pollNews.ts`                                | MODIFY     |
| TDD test 1332        | test        | `src/__tests__/1332-pollnews-source-display-name.test.ts`             | NEW        |

## Interface Contracts

### SOURCE_DISPLAY_NAMES — exact values

Add this constant immediately before the health-tracking loop (before `for (const { name, result } of sourceResults)`):

```typescript
const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  reuters:          "Reuters RSS",
  cafef:            "CafeF RSS",
  vnexpress:        "VnExpress RSS",
  vneconomy:        "VnEconomy RSS",
  tradingeconomics: "Trading Economics",   // matches seedKnownSources exactly — no "RSS" suffix
};
```

These values are derived directly from `globalSourceTracker.seedKnownSources(...)` in `sourceHealthTools.ts` lines 49–55:

| Raw fetcher key    | seedKnownSources value   |
|--------------------|--------------------------|
| `reuters`          | `"Reuters RSS"`          |
| `cafef`            | `"CafeF RSS"`            |
| `vnexpress`        | `"VnExpress RSS"`        |
| `vneconomy`        | `"VnEconomy RSS"`        |
| `tradingeconomics` | `"Trading Economics"`    |

### Updated call sites (pollNews.ts lines ~455, ~464, ~472)

```typescript
// Before each call site, resolve the display name:
const displayName = SOURCE_DISPLAY_NAMES[name] ?? name;

// Line ~455 — success path
globalSourceTracker.recordSuccess(displayName);

// Line ~464 — empty-result path
globalSourceTracker.recordFailure(displayName, "empty result — no items returned");

// Line ~472 — exception path
globalSourceTracker.recordFailure(displayName, errorMsg);
```

`displayName` can be declared once at the top of the `for` loop body, before the `if/else` branches.

### TDD test structure (1332-pollnews-source-display-name.test.ts)

Pattern mirrors `1227-source-health-empty-result.test.ts`:
- `process.env["DB_PATH"] = ":memory:"` at top
- `buildPollNewsTestDb()` helper (identical schema — copy from 1227)
- Dynamic imports for `pollNews` and `globalSourceTracker`
- Snapshot `failuresBefore` / `successBefore` before each poll call
- Delta assertions (not absolute counts) to survive singleton state leakage

Test cases:

| TC   | Fetcher input                                 | Assert                                                                 | State before fix |
|------|-----------------------------------------------|------------------------------------------------------------------------|-----------------|
| TC-1 | `reuters: async () => [item]`, rest empty     | `globalSourceTracker.getHealth("Reuters RSS").status === "ok"`         | FAIL            |
| TC-2 | `cafef: async () => []`, rest empty           | `globalSourceTracker.getHealth("CafeF RSS").consecutiveFailures` incremented vs before | FAIL |
| TC-3 | same as TC-1 run first                        | `globalSourceTracker.getHealth("reuters")` is absent OR `.consecutiveFailures === 0` (default) | PASS |

TC-3 verifies the raw key bucket is NOT written to after the fix. Use `globalSourceTracker.getHealth("reuters")` — if the tracker returns a default/zero-state object for unknown keys, assert `consecutiveFailures === 0` and `status === "ok"` (the tracker's zero-state), confirming no data was written under the raw key.

## Task Breakdown

Dependency order (both tasks on same branch `task/1332-1333-source-display-name`):

| Task | Action                                                                              | Depends on     |
|------|-------------------------------------------------------------------------------------|----------------|
| 1332 | CREATE `src/__tests__/1332-pollnews-source-display-name.test.ts` — TC-1 and TC-2 must be red | none |
| 1333 | MODIFY `src/application/usecases/pollNews.ts` — add `SOURCE_DISPLAY_NAMES`, update 3 call sites | 1332 red |

After task 1333:
- `bun test src/__tests__/1332-pollnews-source-display-name.test.ts` — all 3 pass
- `bun test src/__tests__/1227-source-health-empty-result.test.ts` — all 8 pass (2 pre-existing failures gone)
- `bun tsc --noEmit` — 0 errors

## Risk Assessment

| Risk                                                     | Probability | Impact | Mitigation                                                                                 |
|----------------------------------------------------------|-------------|--------|--------------------------------------------------------------------------------------------|
| TC-3 assertion unclear — tracker may not expose raw key | Low         | Low    | Read `SourceHealthTracker.getHealth` return for unknown keys before writing TC-3; assert default state |
| Singleton state leakage makes TC-2 delta unreliable      | Medium      | Medium | Capture `failuresBefore` snapshot before the poll call, assert `> failuresBefore` not a fixed number |
| Future VPS fetcher key not in map                        | Low         | Low    | `?? name` fallback in `SOURCE_DISPLAY_NAMES` lookup — forward-compatible by design        |
| Test file accidentally imports globalSourceTracker before process.env set | Low | Medium | Keep `process.env["DB_PATH"] = ":memory:"` as line 1 of the test file, before all imports |

## Security Review

- SQL parameterized? Yes — no SQL changes in this task
- File paths validated? N/A — no file I/O
- External HTTP rate-limited? N/A — fetchers are injected mocks in tests
- Secrets via Bun.env only? Yes — no secrets involved
