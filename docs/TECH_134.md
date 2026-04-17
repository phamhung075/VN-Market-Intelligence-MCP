# TECH-134: fix(test-baseline) — skip geo-blocked OCR e2e, reach 0-fail suite

status: APPROVED_BY_ARCHITECT
req_ref: REQ-134

## Brownfield Impact

- Files modified: `src/__tests__/296-ocr-pipeline-e2e.test.ts` (line 68)
- Files created: none
- Files deleted: none
- Breaking changes: no

## Architecture Decision

Single annotation change — `it(...)` → `test.skip(...)` at line 68. No production code path, no DDD boundary, no interface contract altered. `test.skip` is a Bun built-in; no import change needed. The skip fires before body execution, making the inner `isOcrAvailable()` guard irrelevant but harmless.

## DDD Layer Plan

| Component               | Layer     | File                                              | New/Modify |
| ----------------------- | --------- | ------------------------------------------------- | ---------- |
| OCR e2e live-fetch test | interface | `src/__tests__/296-ocr-pipeline-e2e.test.ts:68`   | MODIFY     |

No other layers touched.

## Interface Contracts

No new interfaces. No production signatures changed.

## Exact Change

**File**: `src/__tests__/296-ocr-pipeline-e2e.test.ts`

**Before** (line 68–102):
```typescript
it(
  "extracts VNM PDF via OCR and asserts financial ranges",
  async () => { ... },
  30_000,
);
```

**After**:
```typescript
// geo-blocked from France — requires VPS proxy, run manually on VPS
test.skip(
  "extracts VNM PDF via OCR and asserts financial ranges",
  async () => { ... },
  30_000,
);
```

Rules:
- Comment placed on the line immediately above `test.skip(` (inside describe block).
- Body of the test left **exactly** as-is.
- `beforeAll` / `afterAll` hooks untouched — serve the 3 stubbed tests.
- Tests at lines 109–175 (`reparseSingleWithOcrFallback` stubs) remain `it(...)`.
- Diagnostic test at line 177 remains `it(...)`.

## Task Breakdown

| Task | Title | Dep |
| ---- | ----- | --- |
| 1382 | `test.skip` annotation + comment, verify suite 0 fail | none |

Single atomic task — no subtask split needed.

## Acceptance Gate (for QA / Task 1382)

| Check | Command | Expected |
| ----- | ------- | -------- |
| Suite 0 fail | `bun test` | 0 failures, skip count +1 (21 total) |
| TypeScript clean | `bun tsc --noEmit` | 0 errors |
| Skip comment present | `grep "geo-blocked" src/__tests__/296-ocr-pipeline-e2e.test.ts` | 1 match |
| Stubbed tests pass | inspect bun output for file 296 | 3 pass + 1 diagnostic pass |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| `test.skip` not recognized by Bun version in use | Very Low | Medium | REQ-134 confirms Bun built-in; no import change; tsc clean confirms |
| Other unrelated failures mask 0-fail target | Low | Low | Dev runs full suite before closing task; reports exact counts |

## Security Review

- SQL parameterized? N/A
- File paths validated? N/A
- External HTTP rate-limited? N/A — live fetch removed via skip
- Secrets via Bun.env only? N/A
