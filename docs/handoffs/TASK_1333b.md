# TASK 1333b — GREEN: Strip Source Attribution Suffix Before Ticker Match

**Sprint:** 1333 | **Size:** S | **Phase:** GREEN (implementation)
**Branch:** `task/1333b-green-msn-source-suffix-strip`
**Depends on:** 1333a merged (RED test file must exist)

---

## Goal

Make all 8 tests in `1333a-msn-source-suffix.test.ts` pass by:
1. Adding `stripSourceAttributionSuffix()` to `stockAliases.ts` (domain layer, pure function)
2. Calling it in `pollNews.ts` before `tickerWholeWordMatch` / `detectStocksInText`

---

## Implementation

### Step 1 — Add function to `stockAliases.ts`

**File:** `apps/mcp-server/src/domain/services/stockAliases.ts`

Add **after** the `tickerWholeWordMatch` export (around line 792):

```ts
/**
 * Strip news-source attribution suffix from a headline.
 *
 * News aggregators (MSN, Reuters, Bloomberg, etc.) append " - SOURCE" at the
 * end of syndicated headlines. This suffix is a standalone uppercase token
 * that collides with VN stock tickers (e.g. "- MSN" fires Masan Group alert).
 *
 * Rule: strip trailing " - TOKEN" only when TOKEN is 2–5 uppercase/mixed-case
 * alpha characters at the very end of the string.
 *
 * Does NOT strip:
 *   - Tokens longer than 5 chars ("BUSINESS", "MARKETS")
 *   - Tokens containing digits (preserves index names like "VN30")
 *   - " - TOKEN" patterns that appear mid-headline (only last occurrence)
 *
 * @param headline - raw article title as stored (not yet lowercased)
 * @returns headline with attribution suffix removed, trimmed
 */
export function stripSourceAttributionSuffix(headline: string): string {
  if (!headline) return headline;
  // Match: " - " followed by 2-5 alpha-only chars (no digits) at end of string
  return headline.replace(/ - [A-Za-z]{2,5}$/, "").trimEnd();
}
```

**Design notes:**
- `[A-Za-z]{2,5}` — alpha-only: excludes index tickers with digits (VN30, HNX30) which
  are never source attributions. Range 2–5 covers all known attributions (MSN=3, AP=2,
  Reuters=7 → excluded by length cap, Bloomberg=9 → excluded).
- Only strips from `$` (end of string) so mid-headline " - VCB analysis" is untouched.
- `replace` replaces only the **last** match because `$` anchors to string end.

---

### Step 2 — Call in `pollNews.ts`

**File:** `apps/mcp-server/src/application/usecases/pollNews.ts`

**Import** (already imports from stockAliases, add to existing destructure at line 26):
```ts
import { detectStocksInText, tickerWholeWordMatch, stripSourceAttributionSuffix } from "../../domain/services/stockAliases.js";
```

**Change** at line 717 (the `titleAndSummary` construction):
```ts
// Before:
const titleAndSummary = `${entry.sourceTitle} ${entry.summary}`.toLowerCase();

// After (FIX-1333: strip " - SOURCE" suffix before ticker matching):
const strippedTitle = stripSourceAttributionSuffix(entry.sourceTitle);
const titleAndSummary = `${strippedTitle} ${entry.summary}`.toLowerCase();
```

`entry.summary` does not carry the suffix (summaries are body text), so only
`sourceTitle` needs stripping.

---

## Verification

After implementation, run:
```bash
cd /path/to/apps/mcp-server && bun test --filter "1333"
```

Expected: 8 pass / 0 fail for 1333a suite.

Full regression:
```bash
bun test 2>&1 | tail -5
```
Expected: no new failures vs baseline (6872 pass / 5 fail).

---

## Risk Flags

| Risk | Assessment |
|------|------------|
| False negatives: legitimate MSN ticker mention | Extremely rare — an article genuinely about MSN stock from MSN.com would have MSN in the body/summary too, so `aliasMatch` via `detectStocksInText` on summary still fires. Net loss = title-only MSN mention where source = MSN.com. Acceptable. |
| Over-stripping short tickers mid-headline | Protected: `$` anchor means only end-of-string suffix is stripped. |
| Vietnamese headlines with " - " separator | Vietnamese headlines use "—" (em dash) or ":" not ASCII " - " at end. Safe. |
| Digit-containing attributions stripped | `[A-Za-z]` charset (no `\d`) prevents stripping VN30, HNX30. |

---

## DDD Compliance

- `stripSourceAttributionSuffix` lives in `domain/services/stockAliases.ts` — correct (pure text function, zero imports, no I/O)
- Call site is `application/usecases/pollNews.ts` — correct layer for use-case logic
- No new files needed in infrastructure or interface layers

---

## Files to Touch

| Action | Path |
|--------|------|
| Modify | `apps/mcp-server/src/domain/services/stockAliases.ts` — add `stripSourceAttributionSuffix` export |
| Modify | `apps/mcp-server/src/application/usecases/pollNews.ts` — add import + strip call at line 717 |
| Verify exists | `apps/mcp-server/src/__tests__/1333a-msn-source-suffix.test.ts` (from 1333a) |

---

## Commit Message

```
fix(1333): strip source attribution suffix before ticker match

Headlines like "Vietnam stock market gathers pace - MSN" fired a false
MSN (Masan Group) alert because "MSN" is MSN.com's attribution suffix.

Add stripSourceAttributionSuffix() in stockAliases.ts (domain layer).
Apply it to sourceTitle in pollNews.ts before tickerWholeWordMatch.
Pattern stripped: trailing " - [A-Za-z]{2,5}" (alpha-only, 2-5 chars).
```
