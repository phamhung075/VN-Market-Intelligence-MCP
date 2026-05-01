## Task Report 1346c-b
date: 2026-04-27
outcome: APPROVED

## Test Results
- Targeted (24 new tests): 24 pass / 0 fail
- Full suite: 7382 pass / 73 fail (73 = pre-existing baseline, sprint 1345)
- TypeScript: 0 errors (TS6053 on test files only — known Bun path-resolution quirk, not a real type error)

## DDD Compliance: PASS
- newsNormalizer.ts (domain/services): zero imports from infrastructure/ or application/
- feedbackTools.ts (interface layer): no domain or infra cross-layer violations
- agentSignalStore.ts (infrastructure): no layer violations

## Security: PASS
- No process.env in any modified file
- No hardcoded credentials or secrets
- SQL in getChainFindings uses parameterized query (?)
- migrateUnknownStockCodes uses parameterized prepare().run()

## Changes
- apps/mcp-server/src/domain/services/newsNormalizer.ts: lines 786-788 — Bug 1311: stripSourceAttributionSuffix called on title before extractStockTickers
- apps/mcp-server/src/interface/mcp/tools/system/feedbackTools.ts: lines 35-67 — Bug 1317: retryOnTransient exported + wired; line 132 — sendTelegramBug wrapped
- apps/mcp-server/src/infrastructure/db/agentSignalStore.ts: lines 809-810 — Bug 1313: AND stock_code IS NOT NULL AND stock_code != 'unknown' added; lines 1032-1043 — migrateUnknownStockCodes() exported

## Issues Found
### Blocking
(none)
### Non-Blocking
(none)

## Merge Status
Merged to main. Branch task/1346c-b-ner-feedback-stockcode deleted.
Reports 1311, 1317, 1313 ready for closure.
