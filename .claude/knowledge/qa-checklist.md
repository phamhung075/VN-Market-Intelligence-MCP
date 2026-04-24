# QA Review Checklist

## TDD Compliance

- Test file exists: `src/__tests__/NNN-task-name.test.ts`
- Tests written BEFORE implementation (check `git log --oneline`)
- Every acceptance criterion has a test
- `bun test` passes: 0 failures, 0 errors
- Tests are meaningful (not trivially `expect(true).toBe(true)`)
- Edge cases: empty input, Vietnamese negatives, missing fields

## DDD Compliance

- `src/domain/` has ZERO imports from `infrastructure/` or `application/`
- Repository interfaces in `src/domain/repositories/`
- Infrastructure implements domain interfaces
- MCP tools only call application use cases
- No business logic in `src/interface/`

## TypeScript

- Zero `any` types
- No unguarded `!` non-null assertions
- Import paths end with `.js` (ESM)
- `bun tsc --noEmit` = 0 errors

## Security

- No hardcoded credentials or API keys
- All SQL uses parameterized queries
- PDF file paths validated — no `../` traversal
- HTTP scrapers: rate limiting / exponential backoff on 429/503
- HTTP fetchers: browser User-Agent + multi-tier fallback + `!httpClient` guard
- Telegram: plain text format, Vietnamese language
- All MCP tool inputs validated with Zod schemas
- `Bun.env` only — never `process.env`

## Data Integrity (BCTC)

- Financial values in million VND (documented in JSDoc)
- Negative values: parentheses `(123.456)` handled
- Period: `FiscalPeriod.sortKey` format = `'2024-Q1'` / `'2024-ANNUAL'`
- `computeRatios()` called after parsing
- `extractionConfidence` stored (0.0–1.0)

## MCP Tools

- Every handler wrapped in try/catch
- Returns `{ content: [{ type: 'text' as const, text: '...' }] }`
- Tool description in English
- Zod `.describe()` on every input field

## Alert Format Check

- [ ] All 5 sections present (Tại sao / Xác nhận / Kinh Dịch / Tiếp theo / Rủi ro)
- [ ] Section 5 (Rủi ro) has no `"..."`, no `"và nhiều hơn nữa"` truncation phrases
- [ ] Conviction block did NOT pass through `TelegramMessageFactory.formatAlertMessage()` (100-grapheme limit destroys narrative)
- [ ] Vietnamese text uses full diacritics — no ASCII approximations
- [ ] Conviction block displayed only for HIGH or CRITICAL severity (not LOW/MEDIUM)
- [ ] Minimum 2 risks listed for HIGH; minimum 3 for CRITICAL
- [ ] Alert sent via `formatConvictionBlock()` → `splitMessage()` → `sendTelegramMarket()` path

## Task Report Template

Create `reports/TASK_REPORT_NNN.md`:

```markdown
# Task Report: NNN — [Title]
date: YYYY-MM-DD
outcome: APPROVED | CHANGES_REQUESTED

## Test Results
- Unit tests: X passed / Y failed
- Full suite: X passed / Y failed
- TypeScript: 0 errors

## DDD Compliance: PASS | FAIL
## Security: PASS | FAIL

## Issues Found
### Blocking
### Non-Blocking

## Merge Status
```
