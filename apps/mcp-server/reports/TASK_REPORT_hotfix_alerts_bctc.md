# Task Report: hotfix — Alert Truncation + PDF Extractor Docker Hostname
date: 2026-04-29
outcome: APPROVED

## Summary

Two hotfixes merged to main and pushed to origin:
1. `telegramMessageFactory.ts` — `formatAlertMessage` limit raised 100→400 graphemes
2. `docker-compose.yml` — `PDF_EXTRACTOR_URL=http://pdf-extractor:5001` added to mcp-server env
3. `pdfExtractorClient.ts` — `process.env` corrected to `Bun.env`

Hotfix commit: `c34ab25f`
QA fix commit: `65fd960e` (test file updated for new 400-grapheme limit)

## Test Results

- Unit tests (full suite): 7989 pass / 25 fail / 21 skip
- Pre-existing failures: 25 (unrelated to hotfix — doc drift, DB isolation, stale assertions)
- Hotfix-introduced failures fixed by QA: 8 (test strings in 1300a hard-coded to old 100-grapheme limit)
- telegram factory tests (1300a): 26 pass / 0 fail after QA fix
- TypeScript (production source): 0 errors
- TypeScript (test files): 4 pre-existing errors in `__tests__/` only

## DDD Compliance: PASS

- `telegramMessageFactory.ts` — infrastructure layer, no domain imports
- `pdfExtractorClient.ts` — infrastructure layer, no domain imports

## Security: PASS

- No `process.env` in hotfix files (confirmed `Bun.env` used)
- No hardcoded secrets or API keys
- No SQL queries in changed files

## Issues Found

### Blocking
None.

### Non-Blocking
- 8 tests in `1300a-telegram-message-factory.test.ts` were failing because test
  strings were hard-coded to the old 100-grapheme boundary. Fixed in QA commit `65fd960e`.
  These are QA's responsibility to catch and fix when a limit changes.

## Merge Status

Merged to main. Pushed to origin (`3543786e..65fd960e`).
Pre-push tsc hook passed cleanly.

## Pending (ops)

Docker containers must be rebuilt to pick up `PDF_EXTRACTOR_URL` env var:
```
docker-compose up -d --build mcp-server
```
