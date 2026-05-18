## Task Report 1945d
date: 2026-05-18
outcome: APPROVED

changed:
- apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts — disk scan unconditional + pdfDir injectable
- apps/mcp-server/src/interface/mcp/server.ts — push-bctc-pdf setImmediate now calls triggerPushBctcExtraction
- apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts (new) — injectable extraction module
- apps/mcp-server/src/__tests__/1945d-reparse-pipeline-gap.test.ts (new) — 12 tests

tests: 12 pass / 0 fail (1945d zone) | full suite: 9682 pass / 350 fail (pre-existing baseline) | tsc: 0 errors | ddd: PASS | security: PASS

### Notes
- 1196 pre-existing failure (1 test, watchlist-only guard broken by task 1915-fix-part2) — not introduced by 1945d, confirmed pre-existing
- process.env at server.ts:195 (CLOUDFLARE_PATH_PREFIX) is pre-existing, not in 1945d diff scope
- DDD: scheduler/ and interface/ importing infrastructure/ is correct per DDD layer rules; domain/ has zero infra imports
- AC-3 met: 12 new tests cover filename parse, disk scan stranded PDFs, unconditional scan, push extraction injection contract
