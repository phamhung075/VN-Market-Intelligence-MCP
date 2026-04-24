# Issue: Cascade keyword case sensitivity (findKeyword)

**Discovered**: Task 1315b (2026-04-24)
**Status**: FIXED — Task 1316b (2026-04-24) lowercased 4 LNG keywords in SECTOR_RULES directly

## Root cause

`findKeyword(text, keywords)` in `cascadeEngine.ts` (line 2256) runs on `summaryLower`
(lowercased text) but does NOT lowercase the keywords before comparison.

```typescript
function findKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;  // kw may have uppercase chars
  }
  return null;
}
```

## Affected rules

Any SECTOR_RULE keyword with uppercase letters fails silently on lowercased text:
- `"giá LNG tăng"` → fails (LNG uppercase), use `"giá khí đốt tăng"` instead
- `"LNG price rise"` → fails, use `"gas price rise"` instead

## Fix Applied (Task 1316b, 2026-04-24)

Lowercased 4 LNG keyword strings in SECTOR_RULES (cascadeEngine.ts:1676,1680,1706,1707).
Prevention going forward: all SECTOR_RULE keywords must be all-lowercase strings.
`findKeyword` operates on `summaryLower` — uppercase keywords silently never match.
