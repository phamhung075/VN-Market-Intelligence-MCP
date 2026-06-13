## Task Report CI-RED-b7b84d9b-FIX

changed: [apps/mcp-server/src/__tests__/160-stock-aliases.test.ts:315]
tests: 34 pass / 0 fail (standard) | 34 pass / 0 fail (per-file-isolation) | tsc: 0 errors | ddd: SKIP (test-only) | security: SKIP (test-only)
verdict: APPROVED

### Evidence

- Standard mode: `bun test src/__tests__/160-stock-aliases.test.ts` → 34 pass / 0 fail / 235 expect() calls
- Per-file-isolation mode: `bun test --isolation=per-file src/__tests__/160-stock-aliases.test.ts` → 34 pass / 0 fail / 235 expect() calls
- `bun tsc --noEmit` in apps/mcp-server → exit 0
- CI run 27461707296, HEAD b556afbb795a93775f3a7b4f9eea52cb3dff2ba0, conclusion: success, 12782 pass / 53 skip / 0 fail
- Fix is generic: threshold constant at line 315 (500ms), 20-stock watchlist, no per-ticker logic, no .skip/.todo
