# Handoff — Task 1898b: RSS degradation display fix + regression guards

**Sprint:** c78
**Zone:** apps/mcp-server/
**Merge SHA:** 0a76cf8d (on main)
**Status:** APPROVED

---

## [Developer] Implementation Record

- Fix 1: sourceHealthTools.ts — added `recordDisabled("Reuters RSS")` + `recordDisabled("Trading Economics")` after seedKnownSources block. Prevents ghost `Ngưng|20` display entries for permanently-disabled sources on fresh process start. Matches existing `newsapi | disabled` pattern.
- Fix 2: new test file `1898b-rss-degradation-regression.test.ts` (176L, split-policy compliant). Suite A (RSS-REG-01..06) guards 5 VPS-push sources via pollNews injected-fetcher pattern. Suite B (RSS-REG-07..08) guards zero-items dark-alert path and partial-recovery path.
- Developer correction: spec AC-02 said assert `source_type contains "nhandan"` but `source_type` = `"news"` (discriminator, newsNormalizer.ts:961). Assertions corrected to `source_url` (from item.url = `https://${source}.vn/...`). Source identity is traceable.

---

## [QA] Review — 2026-05-13

**Verdict: APPROVED**
**Merge SHA:** 0a76cf8d (already on main — direct commit, no branch merge needed)
**Round:** 1

### Pipeline Results

| Check | Result |
|---|---|
| Targeted tests (RSS-REG-01..08) | 8 / 8 pass — 16 expect() calls |
| Baseline regression (1335) | 4 / 4 pass |
| bun tsc --noEmit | 0 errors |
| DDD scan (sourceHealthTools.ts) | PASS — zero infrastructure/application imports |
| Security scan | PASS — no process.env, no hardcoded secrets, no SQL |

### AC Verification

| AC | Status | Evidence |
|---|---|---|
| AC-01 | PASS | File exists at apps/mcp-server/src/__tests__/1898b-rss-degradation-regression.test.ts |
| AC-02 | PASS | RSS-REG-01..05 all pass; developer correction verified — source_url is correct identity field (newsNormalizer.ts:961 sets sourceType="news" for all RSS items, so spec's `source_type contains "nhandan"` would never pass; source_url carries source identity) |
| AC-03 | PASS | RSS-REG-06 — globalSourceTracker status="ok", consecutiveFailures=0 for nhandan after pollNews injection |
| AC-04 | PASS | RSS-REG-07 — onAllSourcesDark callback triggered with message containing "0 items" |
| AC-05 | PASS | RSS-REG-08 — partial recovery: cafef=[], vnbusiness=1 item → rowCount=1 |
| AC-06 | PASS | sourceHealthTools.ts:63-64 — recordDisabled("Reuters RSS") + recordDisabled("Trading Economics") at module load; SourceHealthTracker.recordDisabled() confirmed at sourceHealthTracker.ts:189 |
| AC-07 | PASS | bun tsc --noEmit = 0 errors (clean output) |
| AC-08 | PASS | 1335-news-pipeline-rag-insert.test.ts — 4/4 pass, no regressions |

### DDD Note

Test file imports from `infrastructure/` and `application/` layers — this is expected test-consumer pattern (mirrors `1335-news-pipeline-rag-insert.test.ts`). DDD golden rule applies to `domain/` production code only. Production file `sourceHealthTools.ts` (interface layer) has zero forbidden imports.

### Blocking Issues

None.

### Non-Blocking Issues

None.

### Report

`reports/TASK_REPORT_1898b.md`
