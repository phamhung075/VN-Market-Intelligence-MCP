# Bundle: QA

One call, all always-needed rules. Load this instead of qa-checklist.md + fail-loud-protocol.md + dev-standards.md separately.

---

## QA Review Checklist

### TDD Compliance

- Test file exists: `src/__tests__/NNN-task-name.test.ts`
- Tests written BEFORE implementation (check `git log --oneline`)
- Every acceptance criterion has a test
- `bun test` passes: 0 failures, 0 errors
- Tests are meaningful (not trivially `expect(true).toBe(true)`)
- Edge cases: empty input, Vietnamese negatives, missing fields

### DDD Compliance

- `src/domain/` has ZERO imports from `infrastructure/` or `application/`
- Repository interfaces in `src/domain/repositories/`
- Infrastructure implements domain interfaces
- MCP tools only call application use cases
- No business logic in `src/interface/`

### TypeScript

- Zero `any` types
- No unguarded `!` non-null assertions
- Import paths end with `.js` (ESM)
- `bun tsc --noEmit` = 0 errors

### Security

- No hardcoded credentials or API keys
- All SQL uses parameterized queries
- PDF file paths validated — no `../` traversal
- HTTP scrapers: rate limiting / exponential backoff on 429/503
- HTTP fetchers: browser User-Agent + multi-tier fallback + `!httpClient` guard
- Telegram: plain text format, Vietnamese language
- All MCP tool inputs validated with Zod schemas
- `Bun.env` only — never `process.env`

### Data Integrity (BCTC)

- Financial values in million VND (documented in JSDoc)
- Negative values: parentheses `(123.456)` handled
- Period: `FiscalPeriod.sortKey` format = `'2024-Q1'` / `'2024-ANNUAL'`
- `computeRatios()` called after parsing
- `extractionConfidence` stored (0.0–1.0)

### MCP Tools

- Every handler wrapped in try/catch
- Returns `{ content: [{ type: 'text' as const, text: '...' }] }`
- Tool description in English
- Zod `.describe()` on every input field

---

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

---

## Branch Delete Commands (after merge)

```bash
git branch -d task/NNN-branch-name
git push origin --delete task/NNN-branch-name
```

---

## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[qa] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="qa")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once

---

## Lazy-Load (read ONLY when task touches that area)

- Feature schemas for acceptance criteria → `.claude/knowledge/portfolio-schema.md`, `.claude/knowledge/alert-policy.md`, `.claude/knowledge/ask-queue-protocol.md`
- MCP tool surface → `.claude/knowledge/mcp-tools.md`
- Agent roster (for agent-related reviews) → `.claude/knowledge/agent-roster.md`
