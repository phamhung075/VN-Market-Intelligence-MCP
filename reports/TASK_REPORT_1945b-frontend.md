# TASK REPORT — 1945b-frontend

**Task ID:** 1945b-frontend
**Sprint:** 1945 TIER 2b
**Owner:** dev-frontend
**Completed:** 2026-05-18
**Status:** DONE

---

## Summary

Implemented the Accuracy Digest frontend card in the analysis dashboard. All 5 deliverables shipped. 20/20 tests GREEN. 144/144 full suite GREEN. 0 tsc errors.

---

## Deliverables Shipped

### 1. Domain types — `apps/frontend/app/domain/market.ts`

Inserted after `AgentSignal` interface (line 169):
- `SignalTypeAccuracyDigest` — per-signal-type row (signal_type, correct, total, rate)
- `AccuracyDigestStats` — system-level digest (totalResolved, totalCorrect, overallRate|null, bySignalType, newStocksCount, neutralOnlyRows, generatedAt)

### 2. Fetch helpers — `apps/frontend/app/lib/api/client.ts`

Inserted after `fetchCascadeSignals` (before Macro snapshot section):
- `fetchAccuracyDigest(days=30)` — non-fatal, returns null on any error
- `deriveAccuracyDigestState(data)` — pure function, 6 states: loading/empty/all-neutral/insufficient-sample/partial/normal
- `digestRateColor(rate)` — colour helper matching `accuracyBadgeProps()` thresholds, exported for test isolation

### 3. Loader integration — `apps/frontend/app/routes/dashboard.analysis.tsx`

- `ACCURACY_SEEDING_WINDOW_END = "2026-05-25"` constant at module level
- `fetchAccuracyDigest` and `deriveAccuracyDigestState` and `digestRateColor` added to imports
- `AccuracyDigestStats` type added to domain imports
- `accuracyDigest: AccuracyDigestStats | null` field added to `LoaderData` interface
- `fetchAccuracyDigest(30)` added as 3rd leg in `Promise.allSettled` — indices: market=0, snapshot=1, accuracy=2, readings=3+
- `accuracyDigest` resolved with non-fatal fallback and included in `json<LoaderData>()` return

### 4. AccuracyDigestCard component — inline in `dashboard.analysis.tsx`

6-state discriminator pattern:
- `loading` (null data) — skeleton 2-row placeholder
- `empty` (totalResolved=0, neutralOnlyRows=0) — seeding message with `seedingWindowEnd` prop
- `all-neutral` (totalResolved=0, neutralOnlyRows>0) — neutral count message
- `insufficient-sample` (totalResolved>0, bySignalType=[]) — row count message
- `partial` (1-2 rows) — table with available rows + footer
- `normal` (3+ rows) — top-3/bottom-3 two-column grid + footer

Footer: overallRate=null shows "n/a (need 10+ resolved)"; otherwise shows rate% + correct/total + newStocksCount.

### 5. SectionCard insertion — `dashboard.analysis.tsx` JSX

Added after "Kinh Dịch — Cổ phiếu mẫu" SectionCard:

```tsx
<SectionCard title="Signal Accuracy" subtitle="30d · top-3 / bottom-3">
  <AccuracyDigestCard
    data={accuracyDigest}
    seedingWindowEnd={ACCURACY_SEEDING_WINDOW_END}
  />
</SectionCard>
```

`accuracyDigest` destructured from `useLoaderData<typeof loader>()`.

---

## Test Results

**File:** `apps/frontend/app/__tests__/1945b-accuracy-digest-card.test.ts`
**Tests written:** 20 (task required 16 minimum)
**Result:** 20/20 GREEN

Test groups:
1. `fetchAccuracyDigest` — HTTP 200, HTTP 500, network error, null body, non-object body (5 tests)
2. `deriveAccuracyDigestState` — null/empty/all-neutral/insufficient/partial/normal (6 tests)
3. `digestRateColor` — green threshold 0.70, amber zone 0.69, amber threshold 0.40, red zone 0.39 (4 tests)
4. Footer guard — overallRate=null shape verification (1 test)
5. EC-3 — top/bottom overlap with 3 rows (1 test)
6. EC-7 — rate formatting toFixed(1) no locale comma (3 tests)

**Full suite:** 144/144 tests across 13 files, zero regressions.

---

## Acceptance Criteria

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | Normal render: top-3 + bottom-3 columns + footer | PASS |
| AC-2 | Empty state: seeding message with ACCURACY_SEEDING_WINDOW_END | PASS |
| AC-3 | Insufficient-sample state: ≥3 samples message with count | PASS |
| AC-4 | All-neutral state: neutral count message | PASS |
| AC-5 | Non-fatal: HTTP 500 → null → loading state (card doesn't crash page) | PASS |
| AC-6 | Backend already tested in 1945b-backend | N/A (prior task) |
| AC-7 | Colour: ≥0.70 green, 0.40–0.69 amber, <0.40 red | PASS |

---

## Risk Flags Mitigated

- **R-1** — `SignalTypeAccuracyDigest` named distinct from backend `SignalTypeAccuracy`; no import from mcp-server
- **R-2** — `generatedAt` NOT displayed in JSX (no hydration mismatch)
- **R-3** — `Promise.allSettled` index shift verified: market=0, snapshot=1, accuracy=2, readings=3+

---

## Files Changed

| File | Change |
|------|--------|
| `apps/frontend/app/domain/market.ts` | +32 lines — 2 new interfaces |
| `apps/frontend/app/lib/api/client.ts` | +52 lines — fetch helper + state deriver + colour helper |
| `apps/frontend/app/routes/dashboard.analysis.tsx` | +135 lines — constant, types, loader, component, SectionCard |
| `apps/frontend/app/__tests__/1945b-accuracy-digest-card.test.ts` | NEW — 20 test cases |

---

## [QA] Review Record

**date:** 2026-05-18
**round:** 1
**verdict:** APPROVED

### Pipeline
- Zone tests (1945b-frontend): 20/20 GREEN (10ms)
- Full suite: 144/144 GREEN — 13 test files, 0 regressions
- tsc: 0 errors

### DDD: PASS
- `domain/market.ts` has ZERO actual imports from `app/lib/api/` or `app/components/`
- Header comment line 3 references the rule; no import statements present

### Security: PASS
- No `process.env` in route, domain, or test files
- Pre-existing `process.env` in `client.ts:19-21` is guarded with `typeof process !== "undefined"` — predates this task, documented in file header as Remix/Vite SSR necessity
- `ACCURACY_SEEDING_WINDOW_END = "2026-05-25"` is a module-level string constant — NOT fetched from env or backend (confirmed at `dashboard.analysis.tsx:52`)
- No hardcoded credentials, API keys, or secrets in changed files

### AC Matrix
| AC | Result |
|----|--------|
| AC-1: 5/6 UI states render correctly (seeding/empty/insufficient/partial/full + fetch-failure) | PASS |
| AC-2: Fetch failure → null → card shows loading state, page does not crash | PASS |
| AC-3: digestRateColor green ≥0.70, amber 0.40–0.69, red <0.40 | PASS |
| AC-4: accuracy_rate=null (sample_count<3) → insufficient-sample state path | PASS |
| AC-5: ACCURACY_SEEDING_WINDOW_END is module-level constant at tsx:52, not JSX literal | PASS |
| AC-7: 20/20 new tests GREEN | PASS |
