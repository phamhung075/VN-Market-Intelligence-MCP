# Task Report: 1329g — IMF Wire-Up: getImfMacroScoreForConviction at All Conviction Call Sites
date: 2026-04-24
outcome: APPROVED

## Test Results
- Unit tests (1329b file): 17 pass / 0 fail (includes 4 new 1329g tests at lines 84-107)
- Full suite: 6905 pass / 8 fail — all 8 pre-existing (walCheckpointAlert×2, task-026×1, 1294b×3, TASK-1319×1, SPRINT-240×1); 0 new failures; net +4 vs baseline 6901
- TypeScript: 0 errors (`bun tsc --noEmit` clean)

## DDD Compliance: PASS
- `scanMarket.ts` (application/usecases): imports `../services/imfConvictionBridge.js` — application→application, correct
- `assembleBriefing.ts` (application/usecases): dynamic import `../services/imfConvictionBridge.js` — application→application, correct
- `portfolioTools.ts` (interface/mcp/tools): static import `../../../../application/services/imfConvictionBridge.js` — interface→application, inward, correct
- No domain→infrastructure violations in modified files

## Security: PASS
- No `process.env` in any modified file
- No hardcoded credentials

## Critical Checks
1. `getImfMacroScoreForConviction()` hoisted outside per-stock loop in all 3 files: PASS
   - `scanMarket.ts:475-478` — hoisted before `for (const price of prices)` at line 480
   - `assembleBriefing.ts:971-972` — hoisted before `for (const stock of watchlistRows)` at line 976
   - `portfolioTools.ts:316-317` — hoisted before `for (const w of watchlist)` at line 338
2. exactOptionalPropertyTypes spread-conditional: PASS
   - `assembleBriefing.ts:981` uses `...(briefingImfScore !== undefined ? { imfMacroScore: briefingImfScore } : {})`
   - `scanMarket.ts:512-514` uses `if (imfMacroScore !== undefined) { convictionInput.imfMacroScore = imfMacroScore; }` — direct conditional assignment, also valid
   - `portfolioTools.ts:357-359` uses `if (portfolioImfScore !== undefined) { input.imfMacroScore = portfolioImfScore; }` — direct conditional assignment, also valid
3. All 3 patterns produce correct `number | undefined` narrowing to `number` before assignment

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Merged commit 7388f427 to main as e2e88006. Branch `task/1329b-imf-conviction-dimension` deleted.
Sprint 1329 complete: all 7 subtasks (1329a–1329g) Done.
