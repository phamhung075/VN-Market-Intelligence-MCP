# Handoff: hotfix_bctc_parser2 — QA CHANGES_REQUESTED

**From:** qa
**To:** fixer
**Date:** 2026-04-29
**Worktree:** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/worktrees/agent-a1e01646`

---

## Summary

3-bug BCTC parser hotfix (DIG/SHB ticker case, FPT unit scale, DGC/BSR phantom confidence).
Production logic is **correct**. Blocked on **2 TypeScript errors** in test mock files that were inadvertently modified.

---

## Blocking Issues (2 TS errors, bun tsc --noEmit fails)

### Fix 1 — `apps/mcp-server/src/__tests__/1383-macro-alert-dispatch.test.ts` lines 70 + 120

The branch changed `pollNewsFn` mock from the correct shape to an incorrect one.

Current (broken):
```typescript
pollNewsFn: async () => ({ fetched: 0, inserted: 0, alerts: [] }),
```

Required (`PollNewsResult` interface in `src/application/usecases/pollNews.ts:64`):
```typescript
pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
```

Apply the same fix to both line 70 and line 120.

### Fix 2 — `apps/mcp-server/src/__tests__/1397c-vn-index-refresh.test.ts` line 135 + 137

The branch removed `!` non-null assertions on `_storeCalls[0]`, causing `TS18048`/`TS2532`.

Current (broken):
```typescript
const captured = _storeCalls[0];
expect(captured).toHaveLength(1);
expect(captured[0].code).toBe("VNINDEX");
```

Fix option A (restore assertions, matches original):
```typescript
const captured = _storeCalls[0]!;
expect(captured).toHaveLength(1);
expect(captured[0]!.code).toBe("VNINDEX");
```

Fix option B (safe guard):
```typescript
const captured = _storeCalls[0];
if (!captured) throw new Error("no store call captured");
expect(captured).toHaveLength(1);
expect(captured[0]!.code).toBe("VNINDEX");
```

Either option is acceptable.

---

## Verification Steps After Fix

1. `bun tsc --noEmit` in `apps/mcp-server/` — must show 0 errors
2. `bun test src/__tests__/hotfix-bctc-parser2.test.ts` — must show 7 pass
3. Confirm 1383 + 1397c pass: `bun test src/__tests__/1383-macro-alert-dispatch.test.ts src/__tests__/1397c-vn-index-refresh.test.ts`

---

## Files to Modify

- `apps/mcp-server/src/__tests__/1383-macro-alert-dispatch.test.ts` (lines 70, 120)
- `apps/mcp-server/src/__tests__/1397c-vn-index-refresh.test.ts` (lines 135, 137)

Do NOT touch the production files — they are correct:
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts`
- `apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts`
- `apps/mcp-server/src/application/usecases/parseBctcReport.ts`
