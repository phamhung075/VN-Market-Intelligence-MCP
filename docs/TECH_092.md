# TECH-092: feat(briefing) — Integrate TA Signals (RSI/SMA) into Morning Briefing

```
status: APPROVED_BY_ARCHITECT
req_ref: REQ-092
task_id: 1304
```

---

## Brownfield Impact

| Category       | Detail                                                                                   |
|----------------|------------------------------------------------------------------------------------------|
| Files modified | `src/application/usecases/assembleBriefing.ts`, `src/scheduler/morningBriefingJob.ts`   |
| Files created  | `src/__tests__/1304-ta-morning-briefing.test.ts`                                         |
| Files deleted  | none                                                                                     |
| Breaking changes | No — `taSummary` is an optional field; all existing briefing JSON files remain valid   |

---

## Architecture Decision

`computeRSI` and `computeMA` already live in `src/domain/services/technicalIndicators.ts` (Task 1302, merged). The design reuses those pure math functions directly — no new domain services, no new infrastructure. Step 17 in `assembleBriefing.ts` mirrors the existing SQLite query pattern from `technicalIndicatorTools.ts` (lines 301–309), keeping data-access consistent. The `computeTaFn` injectable follows the same optional-override pattern already used by `pollNewsFn`, `fetchVnIndexFn`, and `briefingsDir` in `AssembleBriefingOptions`.

---

## DDD Layer Plan

| Component                      | Layer              | File                                                          | Action |
|--------------------------------|--------------------|---------------------------------------------------------------|--------|
| `TaSignal` interface           | application (type) | `src/application/usecases/assembleBriefing.ts`                | ADD    |
| `taSummary?` on `DailyBriefing`| application        | `src/application/usecases/assembleBriefing.ts`                | MODIFY |
| `computeTaFn?` on options      | application        | `src/application/usecases/assembleBriefing.ts`                | MODIFY |
| Step 17 — TA assembly block    | application        | `src/application/usecases/assembleBriefing.ts`                | ADD    |
| "TA Tín hiệu:" formatter block | scheduler          | `src/scheduler/morningBriefingJob.ts`                         | ADD    |
| TDD test                       | test               | `src/__tests__/1304-ta-morning-briefing.test.ts`              | NEW    |

No new files outside of tests. Scheduler file count stays at 29.

---

## Interface Contracts

### `TaSignal` — new export in `assembleBriefing.ts`

```typescript
export interface TaSignal {
  code: string;
  rsi14: number | null;
  rsiStatus: "overbought" | "oversold" | "neutral";
  ma20: number | null;
  priceVsMa20: "above" | "below" | "neutral";
  currentPrice: number | null;
}
```

### `DailyBriefing` — new optional field (after `evidenceTopScores?`)

```typescript
/** TA signals for watchlist tickers with at least one non-neutral signal */
taSummary?: TaSignal[];
```

### `AssembleBriefingOptions` — new optional injectable

```typescript
/**
 * Override TA computation per ticker for test injection.
 * Receives the ticker code and the active DB.
 * Returns null when data is insufficient (< 15 candles).
 */
computeTaFn?: (code: string, db: Database) => TaSignal | null;
```

### Step 17 default implementation (inline in `assembleBriefing.ts`)

```typescript
// Internal row type — not exported
interface CandleRow { day: string; close_price: number; }

function defaultComputeTa(code: string, db: Database): TaSignal | null {
  const rows = db.query<CandleRow, [string, string]>(
    `SELECT date(fetched_at) AS day, AVG(price) AS close_price
       FROM market_prices_history
      WHERE code = ?
        AND fetched_at >= datetime('now', ?)
      GROUP BY date(fetched_at)
      ORDER BY day ASC`,
  ).all(code, "-60 days");

  if (rows.length < 15) return null;         // RSI minimum

  const prices = rows.map(r => r.close_price);
  const currentPrice = prices.at(-1) ?? null;

  const rsi14 = computeRSI(prices, 14);      // from technicalIndicators.ts
  const ma20  = computeMA(prices, 20);        // from technicalIndicators.ts

  const rsiStatus: TaSignal["rsiStatus"] =
    rsi14 === null ? "neutral"
    : rsi14 > 70   ? "overbought"
    : rsi14 < 30   ? "oversold"
    :                "neutral";

  const priceVsMa20: TaSignal["priceVsMa20"] =
    ma20 === null || currentPrice === null ? "neutral"
    : currentPrice > ma20                  ? "above"
    : currentPrice < ma20                  ? "below"
    :                                        "neutral";

  return { code, rsi14, rsiStatus, ma20, priceVsMa20, currentPrice };
}
```

### Step 17 assembly block (after Step 16, before Step 13 persist)

```typescript
// ── Step 17: TA signals (non-neutral only) ─────────────────────────────────
let taSummary: TaSignal[] = [];
try {
  const taFn = options.computeTaFn ?? defaultComputeTa;
  const signals: TaSignal[] = [];
  for (const row of watchlistRows) {
    try {
      const sig = taFn(row.code, db);
      if (sig !== null) signals.push(sig);
    } catch { /* per-ticker failure — skip silently */ }
  }
  taSummary = signals.filter(
    s => s.rsiStatus !== "neutral" || s.priceVsMa20 !== "neutral"
  );
} catch (taErr) {
  logger.warn("[assembleBriefing] taSummary step failed", {
    error: taErr instanceof Error ? taErr.message : String(taErr),
  });
}
```

Add `taSummary` to the `briefing` object literal (alongside `evidenceTopScores`).

### Formatter section in `formatBriefingMessage` (after "Tích Lũy Bằng Chứng" block)

```typescript
// ── TA Tín hiệu ──────────────────────────────────────────────────────────────
if (briefing.taSummary && briefing.taSummary.length > 0) {
  lines.push("");
  lines.push("📡 TA Tín hiệu:");
  for (const sig of briefing.taSummary) {
    const rsiPart =
      sig.rsiStatus === "overbought" ? `RSI=${sig.rsi14!.toFixed(1)} (quá mua)` :
      sig.rsiStatus === "oversold"   ? `RSI=${sig.rsi14!.toFixed(1)} (quá bán)` :
      "";
    const maPart =
      sig.priceVsMa20 === "above" ? "| giá trên MA20" :
      sig.priceVsMa20 === "below" ? "| giá dưới MA20" :
      "";
    const parts = [rsiPart, maPart].filter(Boolean).join(" ");
    lines.push(`  ${sig.code}: ${parts}`);
  }
}
```

Import `TaSignal` in `morningBriefingJob.ts` (extend the existing import from `assembleBriefing.js`).

---

## Import changes

### `assembleBriefing.ts` — add at top of imports

```typescript
import {
  computeRSI,
  computeMA,
} from "../../domain/services/technicalIndicators.js";
```

No new infrastructure imports. No new npm packages.

### `morningBriefingJob.ts` — extend existing import

```typescript
import type {
  DailyBriefing,
  InsiderBriefingRow,
  ForeignFlowBriefingRow,
  EvidenceScoreBriefingRow,
  TaSignal,                    // ADD
} from "../application/usecases/assembleBriefing.js";
```

---

## Test Plan (`src/__tests__/1304-ta-morning-briefing.test.ts`)

| AC | Test description | Technique |
|----|------------------|-----------|
| AC-1 | File compiles + tests fail before production changes | TDD red phase |
| AC-2 | `formatBriefingMessage` includes section when `taSummary` has overbought entry | stub `DailyBriefing` |
| AC-3 | `formatBriefingMessage` omits section when `taSummary === []` or absent | stub |
| AC-4 | `assembleBriefing` with injectable `computeTaFn` returns 1 entry (VCB oversold, HPG neutral excluded) | inject mock db + mock fn |
| AC-5 | `assembleBriefing` with throwing `computeTaFn` does not reject; `taSummary === []` | inject thrower |
| AC-6 | `bun tsc --noEmit` exits 0 | CI gate |
| AC-7 | RSI = 70.0 with `rsiStatus: "neutral"` → no RSI part rendered, ticker excluded if MA also neutral | stub |

Test file uses `resetMorningBriefingGuard()` for isolation (already exported from `morningBriefingJob.ts`). Tests that call `assembleBriefing` inject both `db` (in-memory SQLite) and `computeTaFn` to avoid all real I/O.

---

## Task Breakdown

Single atomic task (no sub-dependencies unresolved):

| ID   | Title                                              | Depends on |
|------|----------------------------------------------------|------------|
| 1304 | feat(briefing): integrate TA signals into briefing | 1302 (done) |

The REQ spec maps all four FRs to the same two files. No prerequisite infrastructure work remains. Developer implements in a single branch: `task/1304-ta-signals-morning-briefing`.

**Implementation order within the task:**
1. Write `src/__tests__/1304-ta-morning-briefing.test.ts` (TDD red phase — confirm compile-pass, assertion-fail).
2. Add `TaSignal` interface + `taSummary?` to `DailyBriefing` + `computeTaFn?` to `AssembleBriefingOptions` in `assembleBriefing.ts`.
3. Add `CandleRow` internal type + `defaultComputeTa` helper + Step 17 block in `assembleBriefing.ts`.
4. Add `computeRSI` / `computeMA` imports to `assembleBriefing.ts`.
5. Add `TaSignal` to the import in `morningBriefingJob.ts` + append formatter block.
6. Run `bun test src/__tests__/1304-ta-morning-briefing.test.ts` — all green.
7. Run `bun tsc --noEmit` — 0 errors.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `market_prices_history` table absent on older DBs | Low | Low | `historyTableExists` guard already in Step 5; Step 17 try/catch handles the same SQLite throw |
| `computeTaFn` per-ticker loop adds latency | Very Low | Very Low | 30 tickers × 1 SQLite SELECT each ≈ 5–15 ms total; REQ cap is 50 ms |
| `rsi14!` non-null assertion in formatter when `rsiStatus !== "neutral"` | Very Low | Low | Assertion is safe: `rsiStatus` is only set to `"overbought"/"oversold"` when `rsi14 !== null` by construction |
| Briefing JSON grows slightly with new field | Very Low | None | `taSummary` is optional; absent in legacy files |

---

## Security Review

- [ ] SQL parameterized? **Yes** — `db.query(...).all(code, "-60 days")` uses positional bindings, mirroring existing patterns
- [ ] File paths validated? **N/A** — no new file I/O
- [ ] External HTTP? **No** — pure SQLite + math
- [ ] Secrets via `Bun.env` only? **N/A** — no new env vars
