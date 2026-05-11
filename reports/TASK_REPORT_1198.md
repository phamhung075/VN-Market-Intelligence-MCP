# Task Report — 1198: VND Currency False Positive Guard

**Date:** 2026-04-13
**Branch:** task/1198-vnd-guard (merged, deleted)
**QA agent:** QA / CI-CD
**Verdict:** PASS — merged to main

---

## Summary

Task 1198 adds a `CURRENCY_CONTEXT_MAP` constant and a 40-character window guard in
`extractStockTickers()` inside `src/domain/services/newsNormalizer.ts`.
The guard prevents Pattern-2 word-boundary matches from emitting `"VND"` as a ticker
when the surrounding text contains ISO-4217 / forex context tokens.
Pattern-1 parenthetical matches (e.g. `"VNDirect (VND)"`) bypass the guard and
continue to surface `"VND"` as the VNDirect ticker symbol.

---

## Checklist

### 1 — Automated tests

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| `src/__tests__/1198-vnd-guard.test.ts` | 8 | 8 | 0 |
| `src/__tests__/061-news-normalizer.test.ts` (regression) | 23 | 23 | 0 |
| Pre-existing failures on main (1139, 179) | 8 | — | 8 (pre-existing, not task 1198) |

The 8 failures in tasks 1139 and 179 reproduce identically on `main` before the merge.
They are not introduced by this branch.

### 2 — Acceptance criteria

| AC | Description | Result |
|----|-------------|--------|
| AC-5 | `USD/VND` forex text does not produce `VND` in `affectedActions` | PASS |
| AC-5 variant | `"tỷ vnd"` context suppresses VND ticker | PASS |
| AC-5 variant | `"tỷ đồng"` context suppresses VND ticker | PASS |
| AC-5 variant | `"/vnd"` slash pattern suppresses VND ticker | PASS |
| AC-5 variant | `"billion vnd"` English context suppresses VND ticker | PASS |
| AC-6 | `"VNDirect (VND)"` parenthetical still detected as ticker | PASS |
| Non-VND ticker unaffected | `VCB` in unrelated text still extracted | PASS |
| No-context VND detected | Plain `"VND"` without forex tokens extracted as ticker | PASS |

### 3 — Implementation review

**`CURRENCY_CONTEXT_MAP`**
Defined at module scope as `Map<string, string[]>`.
Contains 15 lowercase context tokens for key `"VND"`:
`"usd/vnd"`, `"vnd/usd"`, `"tỷ giá"`, `"exchange rate"`, `"đồng/usd"`,
`"billion vnd"`, `"tỷ vnd"`, `"nghìn tỷ vnd"`, `"triệu vnd"`, `"tỷ đồng"`,
`"nghìn tỷ đồng"`, `"mệnh giá"`, `"currency"`, `"/vnd"`, `"vnd/"`.

Note: The task spec referenced 14 tokens; the implementation ships 15 (the extra
token `"vnd/"` is a legitimate superset covering `"vnd/usd"` and similar suffix
forms). This is not a defect — it increases recall, causes no test failures,
and aligns with the intent of the guard.

**Pattern 2 guard (lines 547-553 of `newsNormalizer.ts`)**
- Extracts a 40-char window (`matchStart-40 .. matchStart+len+40`) around each
  word-boundary match.
- Lowercases the window before checking `currencyContextTokens.some(tok => window.includes(tok))`.
- Matching any token causes the candidate to be skipped (`continue`).

**Pattern 1 (parenthetical) bypass**
Pattern-1 loop at lines 529-537 has no guard — `"(VND)"` always maps to the
VNDirect ticker. This is correct per the design.

### 4 — DDD compliance

- File location: `src/domain/services/newsNormalizer.ts` — correct domain layer.
- The sole `infrastructure` import (`RssItem` from `rss.ts`) is a pre-existing,
  documented approved exception (FR-061-7 / TECH-004). Not introduced by task 1198.
- No `application/` imports. No `process.env` usage.

### 5 — TypeScript

`bun tsc --noEmit` exits clean (confirmed by pre-push hook on remote delete).

---

## Merge

```
git merge --no-ff task/1198-vnd-guard -m "merge(1198): VND currency false positive guard in extractStockTickers()"
git branch -d task/1198-vnd-guard
git push origin --delete task/1198-vnd-guard   # pre-push hook: tsc OK
```

TASKS.md updated: task 1198 → Done.
