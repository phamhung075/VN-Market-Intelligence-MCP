# TECH-120: predictionDiag Block + Medium-Severity Fallback in Evening Summary

status: APPROVED_BY_ARCHITECT
req_ref: REQ-120

## Brownfield Impact

- Files modified:
  - `src/application/usecases/assembleEveningSummary.ts` (interfaces + Step 5 logic)
- Files created:
  - `src/__tests__/1354-prediction-signals-fallback.test.ts`
- Files deleted: none
- Breaking changes: yes — `EveningSummary` gains a required `predictionDiag` field. Any consumer that destructures `EveningSummary` without `predictionDiag` will get `undefined` at runtime until Task 1355 ships. TypeScript catches this at compile time (`bun tsc --noEmit`). The evening JSON file schema changes — old report files are unaffected (written once).

## Architecture Decision

All three changes (new type field, medium fallback, function injection) live exclusively in the application layer (`assembleEveningSummary.ts`), which already owns Step 5. No new files, no infrastructure changes, no domain changes. The `getPredictionSignalsFn` injection follows the exact pattern already established by `computeTaFn` and `getNewsCountFn` in `AssembleEveningSummaryOptions` — zero new patterns introduced.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `PredictionDiag` interface | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY |
| `EveningSummary.predictionDiag` field | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY |
| `AssembleEveningSummaryOptions.getPredictionSignalsFn` | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY |
| Step 5 medium fallback + diag block | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY |
| TDD tests | test | `src/__tests__/1354-prediction-signals-fallback.test.ts` | NEW |

## Interface Contracts

### New type (add above `EveningSummary`)

```typescript
export interface PredictionDiag {
  /** Total prediction_signals rows with detected_at >= last 24h, any severity */
  stored: number;
}
```

### EveningSummary — add one field

```typescript
export interface EveningSummary {
  // ... all existing fields unchanged ...
  predictionSignals: BriefingPredictionSignal[];
  /** Diagnostic counts for prediction pipeline observability — JSON report only, NOT sent to Telegram */
  predictionDiag: PredictionDiag;
  taSummary: TaSignal[];
  newsCount: number;
  generatedAt: string;
}
```

### AssembleEveningSummaryOptions — add one optional field

```typescript
export interface AssembleEveningSummaryOptions {
  db?: Database;
  reportsDir?: string;
  computeTaFn?: (code: string, db: Database) => TaSignal | null;
  getNewsCountFn?: (midnight: string) => number;
  /** Override prediction signals fetch for tests — avoids mock.module in unit tests */
  getPredictionSignalsFn?: (db: Database, hoursBack: number) => BriefingPredictionSignal[];
}
```

### Step 5 replacement (lines 335-347 in assembleEveningSummary.ts)

```typescript
// ── Step 5: Prediction market signals — medium fallback + diag ──────────────
let predictionSignals: BriefingPredictionSignal[] = [];
let predictionDiag: PredictionDiag = { stored: 0 };
try {
  const signalsFn =
    options.getPredictionSignalsFn ??
    (await import("../../infrastructure/db/predictionStore.js")).getRecentPredictionSignals;
  const allSignals = signalsFn(db, 24);
  const stored = allSignals.length;
  predictionDiag = { stored };

  const highCritical = allSignals.filter(
    (s) => s.severity === "high" || s.severity === "critical",
  );
  if (highCritical.length > 0) {
    predictionSignals = highCritical;
  } else {
    predictionSignals = allSignals
      .filter((s) => s.severity === "medium")
      .slice(0, 3);
  }
} catch (err) {
  logger.warn("[assembleEveningSummary] prediction signals query failed", {
    error: err instanceof Error ? err.message : String(err),
  });
}
```

### EveningSummary object construction — add predictionDiag

```typescript
const summary: EveningSummary = {
  date,
  topAlerts,
  topStories,
  watchlistMovers,
  predictionSignals,
  predictionDiag,       // NEW
  taSummary,
  newsCount,
  generatedAt,
};
```

## Test Design (Task 1354)

File: `src/__tests__/1354-prediction-signals-fallback.test.ts`
Line 1: `process.env["DB_PATH"] = ":memory:";`

Use `getPredictionSignalsFn` injection — no `mock.module` needed.

| TC | Setup | Assert predictionSignals | Assert predictionDiag.stored |
|----|-------|--------------------------|------------------------------|
| AC-1 | 2 signals: severity high + critical | both returned, length 2 | 2 |
| AC-2 | 4 medium signals, 0 high/critical | 3 medium items (capped) | 4 |
| AC-3 | 0 signals of any kind | [] | 0 |
| AC-4 | 5 signals: 2 high + 2 medium + 1 low | 2 high returned | 5 |
| AC-5 | getPredictionSignalsFn throws | [] | 0 |

AC-5 additionally asserts `logger.warn` called with message containing "prediction".

Pattern reference: `src/__tests__/1318-prediction-signals-evening.test.ts` — use same in-memory DB setup, same `assembleEveningSummary` import, inject via `getPredictionSignalsFn` option instead of `mock.module`.

## Task Breakdown

| Task | Type | Description | Depends on |
|------|------|-------------|------------|
| 1354 | TDD | Write `1354-prediction-signals-fallback.test.ts` — 5 RED tests (AC-1 to AC-5) | none |
| 1355 | Impl | Add `PredictionDiag` type, `predictionDiag` field to `EveningSummary`, `getPredictionSignalsFn` to options, replace Step 5 logic | 1354 |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `EveningSummary` consumers break on new required field | Low | Medium | Only one consumer: `eveningSummaryJob.ts` reads the struct then logs/sends Telegram — `predictionDiag` is JSON-only so Telegram formatter is untouched; `bun tsc --noEmit` will catch missing field at compile time |
| `mock.module` hoist conflict with injection approach | Low | Low | Test uses `getPredictionSignalsFn` injection — no `mock.module` needed at all; existing test 1318 uses `mock.module` for a different scenario and is unaffected |
| `options` param not destructured correctly in Step 5 | Low | Low | `options.getPredictionSignalsFn` — direct property access, no destructure needed |

## Security Review

- SQL parameterized? Yes — no new queries; `getRecentPredictionSignals` already uses parameterized bindings
- File paths validated? Yes — no new file path logic
- External HTTP rate-limited? N/A — no new HTTP calls
- Secrets via Bun.env only? Yes — no new env usage
