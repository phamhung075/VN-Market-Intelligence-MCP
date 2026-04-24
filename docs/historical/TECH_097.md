# TECH-097: TA Close-of-Day Signals in Evening Recap

status: APPROVED_BY_ARCHITECT
req_ref: REQ-097

## Brownfield Impact

- Files modified: 3
  - `src/application/usecases/assembleBriefing.ts` — add `export` keyword to `defaultComputeTa` (line 504)
  - `src/application/usecases/assembleEveningSummary.ts` — extend types + add TA step
  - `src/scheduler/eveningSummaryJob.ts` — append TA section to Telegram formatter
- Files created: 1
  - `src/__tests__/1312-evening-summary-ta.test.ts` — TDD tests (task 1313, same branch)
- Files deleted: none
- Breaking changes: no — `taSummary` is a new required field on `EveningSummary` but the
  only consumer of that struct is `eveningSummaryJob.ts` (same PR). TypeScript will enforce
  the field is populated before the object is returned.

## Architecture Decision

`TaSignal` and `defaultComputeTa` already exist and are fully tested in `assembleBriefing.ts`
(morning briefing path, tasks 1304/1302). The evening summary reuses both via a named export
and the same injectable `computeTaFn` pattern used in the morning briefing — no logic
duplication, no new domain types. The neutral-filter boundary (all non-null in use-case,
non-neutral only in scheduler) mirrors the `predictionSignals` pattern already in place:
the use-case produces a complete data object; the scheduler decides what to surface to users.

## DDD Layer Plan

| Component                        | Layer       | File Path                                                      | New/Modify |
| -------------------------------- | ----------- | -------------------------------------------------------------- | ---------- |
| `export` on `defaultComputeTa`   | application | `src/application/usecases/assembleBriefing.ts`                 | MODIFY     |
| `TaSignal` import + type on `EveningSummary` | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY     |
| `computeTaFn` on options type    | application | `src/application/usecases/assembleEveningSummary.ts`           | MODIFY     |
| TA step in `assembleEveningSummary` | application | `src/application/usecases/assembleEveningSummary.ts`          | MODIFY     |
| TA section in Telegram formatter | scheduler   | `src/scheduler/eveningSummaryJob.ts`                           | MODIFY     |
| TDD test suite                   | test        | `src/__tests__/1312-evening-summary-ta.test.ts`                | NEW        |

## Interface Contracts

### Modified: `EveningSummary` (assembleEveningSummary.ts)

```typescript
import type { TaSignal } from "./assembleBriefing.js";
import { defaultComputeTa } from "./assembleBriefing.js";

export interface EveningSummary {
  date: string;
  topAlerts: BriefingAlert[];
  topStories: TopStory[];
  watchlistMovers: WatchlistMover[];
  predictionSignals: BriefingPredictionSignal[];
  taSummary: TaSignal[];          // NEW — always present, [] when no data
  generatedAt: string;
}
```

### Modified: `AssembleEveningSummaryOptions` (assembleEveningSummary.ts)

```typescript
export interface AssembleEveningSummaryOptions {
  db?: Database;
  reportsDir?: string;
  computeTaFn?: (code: string, db: Database) => TaSignal | null;  // NEW — default: defaultComputeTa
}
```

### Modified: `assembleBriefing.ts` — export change only

```typescript
// Line 504: add export keyword
export function defaultComputeTa(code: string, db: Database): TaSignal | null { ... }
```

### New internal row type (assembleEveningSummary.ts)

```typescript
interface WatchlistCodeRow {
  code: string;
}
```
Needed to iterate all watchlist tickers (not just movers) for the TA step. The movers query
already filters `ABS(change_pct) >= 1.0` so it cannot be reused here — a separate
`SELECT code FROM watchlist` query is required.

## Task Breakdown

Dependency order — developer implements in this sequence:

1. **Task 1313 (TDD first)** — Write `src/__tests__/1312-evening-summary-ta.test.ts` with 6+
   failing tests covering AC-1 through AC-7. Tests use in-memory SQLite and injectable
   `computeTaFn`. All tests must fail before implementation begins.

2. **Task 1312 step A** — Add `export` to `defaultComputeTa` in `assembleBriefing.ts`.
   Verify: `grep "^export function defaultComputeTa"` succeeds.

3. **Task 1312 step B** — Extend `assembleEveningSummary.ts`:
   - Add dual import from `assembleBriefing.js` (type `TaSignal` + value `defaultComputeTa`)
   - Add `taSummary: TaSignal[]` to `EveningSummary`
   - Add `computeTaFn?` to `AssembleEveningSummaryOptions`
   - Add TA step after the movers step (Step 3 in the existing function):
     - Query `SELECT code FROM watchlist` independently (separate from movers query)
     - Iterate rows; per-ticker try/catch; collect non-null `computeTaFn` results
     - Outer try/catch logs warning and defaults `taSummary = []` on table-missing error
   - Include `taSummary` in the `summary` object literal

4. **Task 1312 step C** — Extend `eveningSummaryJob.ts` Telegram formatter:
   - After the `predictionSignals` block, add the TA section conditional on non-neutral signals
   - Cap at 5 tickers; apply Vietnamese labels per FR-6 business rules
   - Update `hasContent` to include `(summary.taSummary?.some(...) ?? false)` as a fourth
     condition — only include if at least one non-neutral signal exists

5. **Verify** — `bun tsc --noEmit` 0 errors; `bun test src/__tests__/1312-*` all pass;
   regression tests 1304, 1307, 1309 pass unchanged.

## Implementation Notes

### TA step placement in `assembleEveningSummary`

Insert after the existing Step 3 (movers) block and before Step 5 (persist). Label it
"Step 4: TA signals" and shift the existing prediction-signals step to "Step 5", persist
to "Step 6".

```typescript
// ── Step 4: TA signals ────────────────────────────────────────────────────
const taFn = options.computeTaFn ?? defaultComputeTa;
let taSummary: TaSignal[] = [];
try {
  const watchlistRows = db
    .prepare<WatchlistCodeRow, []>("SELECT code FROM watchlist")
    .all();
  const signals: TaSignal[] = [];
  for (const { code } of watchlistRows) {
    try {
      const sig = taFn(code, db);
      if (sig !== null) signals.push(sig);
    } catch {
      /* per-ticker: swallow, continue */
    }
  }
  taSummary = signals;
} catch (err) {
  logger.warn("[assembleEveningSummary] TA step failed", {
    error: err instanceof Error ? err.message : String(err),
  });
}
```

### Telegram formatter addition (eveningSummaryJob.ts)

After the `predictionSignals` block, before the `doSend` call:

```typescript
const nonNeutralTa = (summary.taSummary ?? []).filter(
  (s) => s.rsiStatus !== "neutral" || s.priceVsMa20 !== "neutral",
);
if (nonNeutralTa.length > 0) {
  lines.push("");
  lines.push("TA tín hiệu đóng cửa:");
  for (const s of nonNeutralTa.slice(0, 5)) {
    let line = `  ${s.code}:`;
    if (s.rsi14 !== null) {
      line += ` RSI=${s.rsi14.toFixed(1)}`;
      if (s.rsiStatus === "overbought") line += " (quá mua)";
      else if (s.rsiStatus === "oversold") line += " (quá bán)";
    }
    if (s.priceVsMa20 === "above") line += ", giá trên MA20";
    else if (s.priceVsMa20 === "below") line += ", giá dưới MA20";
    lines.push(line);
  }
}
```

`hasContent` update — add the TA condition so a session with only TA signals still triggers
the Telegram send:

```typescript
const hasContent =
  summary.topStories.length > 0 ||
  summary.topAlerts.length > 0 ||
  summary.watchlistMovers.length > 0 ||
  summary.predictionSignals.length > 0 ||
  (summary.taSummary ?? []).some(
    (s) => s.rsiStatus !== "neutral" || s.priceVsMa20 !== "neutral",
  );
```

### Test file naming

REQ-097 specifies test file as `1312-evening-summary-ta.test.ts` (note: task number 1312,
not 1313). The task number in the filename is the feature task, not the test task — this
matches the existing pattern (`1304-ta-morning-briefing.test.ts` for task 1304).

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| `assembleBriefing.ts` consumers break when `defaultComputeTa` gains `export` | Low | Low | `export` on a function is backward-compatible; existing callers unaffected |
| `watchlist` table empty / missing at TA step | Medium | Low | Outer try/catch sets `taSummary = []`; job proceeds normally |
| `market_prices_history` has no rows (cold DB) | Medium | Low | `defaultComputeTa` returns null for each ticker; `taSummary = []` silently |
| `EveningSummary` serialization breaks existing JSON consumers | Low | Medium | New field is additive; JSON.parse consumers treat unknown fields as pass-through |
| Movers query reused for TA iteration (wrong) | Medium | High | Mitigation: use separate `SELECT code FROM watchlist` — movers query filters by `change_pct >= 1.0` and would miss flat tickers |

## Security Review

- SQL parameterized? Yes — `defaultComputeTa` uses `.query<>().all(code, ...)` (existing); new `SELECT code FROM watchlist` is parameter-free (no user input)
- File paths validated (no `../`)? Yes — `reportsDir` is controlled by caller, same as existing behavior
- External HTTP rate-limited? N/A — TA computation is pure in-process SQLite; no network I/O
- Secrets via Bun.env only? Yes — no new secrets introduced
