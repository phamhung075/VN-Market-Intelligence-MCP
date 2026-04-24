# Issue: Cascade keyword case sensitivity (findKeyword)

**Discovered**: Task 1315b (2026-04-24)
**Status**: Known — tests must work around it

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

## Prevention

When writing tests that trigger a specific SECTOR_RULE keyword, always verify
the keyword is all-lowercase (or the text is NOT lowercased before findKeyword).

If fixing: lowercase `kw` inside `findKeyword` before `text.includes(kw.toLowerCase())`.
But this is a production change — requires its own task + test.
