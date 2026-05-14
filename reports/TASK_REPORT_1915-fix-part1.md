## Task Report 1915-fix-part1
date: 2026-05-14
outcome: APPROVED

changed: [
  apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts:401-423 (tickerFromFilename helper),
  apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts:461-489 (scanDiskForStrandedPdfs empty-watchlist branch),
  apps/mcp-server/src/scheduler/startScheduler.ts:239-241 (startup catch-up runBctcReparseWithDb),
  apps/mcp-server/src/__tests__/1915-scan-disk-empty-watchlist.test.ts (NEW 8 tests DSE-01..08),
  apps/mcp-server/src/__tests__/1416c-hpg-bctc-disk-scan.test.ts (1 test updated + 1 added)
]
tests: 14 pass / 0 fail (targeted) | full suite: 9281 pass / ~36 fail (pre-existing OOM/unrelated) | tsc: 0 errors | ddd: PASS | security: PASS

### DDD
- bctcReparseJob.ts is interface/scheduler layer — infrastructure imports correct and pre-existing.
- domain/ layer unchanged, zero infrastructure imports confirmed.

### Security
- No process.env (Bun.env used throughout).
- No hardcoded secrets.
- SQL parameterized: `WHERE action_code = ? AND period_year = ? AND period_type = ?`.

### Runtime AC note
Container redeploy required (ops action). After redeploy: VEA+VNM Q4-2025 PDFs on disk processed by next bctcReparseJob cron (09:30 GMT+7) or manual trigger. AC: financial_reports > 0, pdf_extracted_text > 0, bctcReparseJob log entry within last hour.

### Merge Status
Merged: 66275c67 on main. Branch task/1915-fix-part1-scan-disk-empty-watchlist deleted.
