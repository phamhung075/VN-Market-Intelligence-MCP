# TASK_1334b — GREEN: signal filter + CEO broadcast implementation

Sprint 1334 | Size S | Depends on: TASK_1334a (RED tests must exist and fail first)

---

## Fix A — Normalize stock_code="unknown" in postSignal

### File
`apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`

### Insertion point
`postSignal()` — destructuring block, lines ~250–270.

### Current code (line ~254)
```typescript
const {
  fromAgent,
  toAgent,
  signalType,
  stockCode = null,
  payload,
  ...
} = input;
```

### Change: add one normalization line immediately after destructuring

```typescript
// 1334: Normalize sentinel values — agents may post "unknown" for market-wide signals.
// "unknown" / "" / undefined all mean "no specific stock" → NULL in agent_signals.
// This prevents chain grouping by getChainFindings() from collecting all market-wide
// signals into a fake "unknown" stock bucket.
const resolvedStockCode: string | null =
  !stockCode || stockCode === "unknown" ? null : stockCode;
```

Then replace every occurrence of `stockCode` in the INSERT parameter lists with `resolvedStockCode`. There are 8 INSERT branches (the nested if-else tree for hasChainColumns / hasCausalRootColumns / hasSignalClassColumn / hasValidationColumns / hasContextColumns). Every branch passes `stockCode` as the 4th positional parameter — replace all with `resolvedStockCode`.

### Exact replacements (replace_all safe — `stockCode,` only appears as INSERT param)

In the INSERT `.run(...)` calls, replace the argument `stockCode,` with `resolvedStockCode,`. Use Edit with `replace_all: true` on the pattern:
```
      stockCode,
```
→
```
      resolvedStockCode,
```

Scope: within `postSignal()` only (all occurrences are in that function).

### Verification
After fix, run:
```bash
cd apps/mcp-server && bun test src/__tests__/1334a-signal-filter.test.ts
```
All 4 tests must pass (including the new "unknown" → null test).

---

## Fix B — Add analyst-warning criterion to isMarketWide()

### File
`apps/mcp-server/src/domain/services/cascadeEngine.ts`

### Insertion point
`isMarketWide()` function, line ~2374 — immediately before `return false;`.

### Current code (end of function)
```typescript
  // (c) Country or global level with sufficient impact
  if ((level === "country" || level === "global") && impactScore >= minImpact) {
    return true;
  }

  return false;
}
```

### Change: insert criterion (d) between (c) and `return false`

```typescript
  // (d) Analyst / CEO bearish market-warning pattern.
  // "điều chỉnh sâu", "rất sâu và đau", "cảnh báo nhà đầu tư" are analyst-sourced
  // bearish market warnings that must broadcast regardless of impactScore threshold.
  // Normalization strips Vietnamese diacritics (same NFD pass as above).
  const ANALYST_WARNING_PATTERNS = [
    "dieu chinh sau",      // điều chỉnh sâu — deep correction
    "rat sau va dau",      // rất sâu và đau — very deep and painful
    "canh bao nha dau tu", // cảnh báo nhà đầu tư — investor warning
  ];
  if (ANALYST_WARNING_PATTERNS.some((p) => normText.includes(p))) return true;

  return false;
}
```

### Why this location
- `normText` is already NFD-normalized and lowercased at this point — no extra work needed.
- Criterion (d) fires independently of impactScore — analyst warnings are quality signals regardless of numeric score.
- Placed after (c) so the cheap VN-Index / broadMarket checks (a, b) still short-circuit first.
- Pure domain function — no I/O, no imports added.

### DDD compliance
- `cascadeEngine.ts` is `domain/services` — no infrastructure imports.
- Change is string-matching logic only — zero DDD violations.

### Verification
```bash
cd apps/mcp-server && bun test src/__tests__/1334b-ceo-broadcast.test.ts
```
All 3 tests must pass.

---

## Full test run after both fixes

```bash
cd apps/mcp-server && bun test
```

Expected baseline: 6874+ pass (adds 7 new tests), 5 fail (existing failures unchanged).

---

## Risk flags

- **Fix A scope:** `resolvedStockCode` replaces `stockCode` in INSERT `.run()` args only. Do NOT replace `stockCode` in the destructuring line itself or in the column name string `"stock_code"`. Use scoped replace to avoid touching unrelated code.
- **Fix B scope:** `ANALYST_WARNING_PATTERNS` array must use NFD-stripped forms (no diacritics) to match `normText`. Verify by checking that `"điều chỉnh sâu".normalize("NFD").replace(/\p{M}/gu,"").toLowerCase()` equals `"dieu chinh sau"`.
- **Regression:** existing tests in `242-agent-signals.test.ts` and `1105-causal-root-tagging.test.ts` must still pass — both use real stock codes, not "unknown".
- **No schema change needed:** `stock_code` column is already nullable TEXT — Fix A normalizes at write time, not schema level.
