# TECH-136: fix(evening-news-filler) — omit "Không có tin tức hôm nay" when newsCount=0

status: APPROVED_BY_ARCHITECT
req_ref: REQ-136

## Brownfield Impact

- Files modified: `src/scheduler/eveningSummaryJob.ts` (lines 156-163)
- Files created: `src/__tests__/1385-evening-summary-news-filler.test.ts`
- Files deleted: none
- Breaking changes: no

## Architecture Decision

Single conditional at lines 156-163 of `eveningSummaryJob.ts` unconditionally pushes a blank line then branches on `newsCount`. Fix moves the blank-line push inside the `if (newsCount > 0)` block — identical pattern applied in Sprint 135 for `franceSummaryJob`. No new abstractions needed; change is fully contained in the interface/scheduler layer.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| newsCount filler removal | interface (scheduler) | `src/scheduler/eveningSummaryJob.ts` | MODIFY |
| TDD test suite | test | `src/__tests__/1385-evening-summary-news-filler.test.ts` | NEW |

## Interface Contracts

No new interfaces. No domain/application changes. The `assembleEveningSummary` return type is unchanged — `newsCount` field already exists.

### Target state — lines 156-163 (eveningSummaryJob.ts)

```typescript
// Before (broken)
const newsCount = summary.newsCount ?? 0;
lines.push("");                             // always pushed
if (newsCount > 0) {
  lines.push(`(${newsCount} tin tức hôm nay)`);
} else {
  lines.push("Không có tin tức hôm nay");  // filler — remove
}

// After (fixed)
const newsCount = summary.newsCount ?? 0;
if (newsCount > 0) {
  lines.push("");
  lines.push(`(${newsCount} tin tức hôm nay)`);
}
// else: emit nothing
```

## Task Breakdown

| Task | Title | Depends on |
|---|---|---|
| 1385 | TDD RED: write `1385-evening-summary-news-filler.test.ts` — 4 ACs, all fail | none |
| 1386 | GREEN fix: apply 3-line change in `eveningSummaryJob.ts` | 1385 |

### Test cases required in 1385

| ID | newsCount | Other sections | Assert |
|---|---|---|---|
| T1 | 0 | alerts=2, movers=3 | no "Không có tin tức", no trailing blank from removed block |
| T2 | 5 | any | contains "(5 tin tức hôm nay)" |
| T3 | 0 | all empty | no "Không có tin tức"; silent-skip guard unaffected |
| T4 | 1 | any | contains "(1 tin tức hôm nay)" |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Silent-skip guard breaks if blank lines counted | Low | Medium | Guard tests message.trim().length, not line count — confirmed by reading lines 180-190 |
| Regression in newsCount > 0 path | Low | Low | T2 + T4 cover both 1 and N cases |

## Security Review

- SQL parameterized? n/a — no DB queries in this change
- File paths validated? n/a
- External HTTP rate-limited? n/a
- Secrets via Bun.env only? n/a
