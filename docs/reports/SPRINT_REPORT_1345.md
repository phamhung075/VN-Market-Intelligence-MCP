# Sprint Report: 1345 — News + Analysis Pipeline Hardening + Data Quality
date: 2026-04-27
qa-agent: QA (claude-sonnet-4-6)
outcome: APPROVED

---

## Sprint Summary

Sprint 1345 delivered 4 tasks targeting news pipeline hardening and data quality. TSC errors introduced by 1345c were resolved by Fixer (commit 3911f73d) before final QA pass.

| Task | Title | Commit | Tests |
|------|-------|--------|-------|
| 1345a | Reuters/TE VPS systemd + staleness guard + newsapi fallback | 8b6b8ec5 | 11 pass |
| 1345b | BCTC financial validation (VNM/VEA pattern) | 6d73167b | 3 pass |
| 1345c | Polymarket staleness guard + 24h alert cooldown | bdc84393 | (no separate test file — covered via 1345e) |
| 1345d | VN-Index cascade MARKET channel broadcast | ebe7cab7 | 7 pass |
| 1345e | Integration pipeline (end-to-end) | 3911f73d | 11 pass |

---

## Test Results

### TypeScript: PASS

`bun tsc --noEmit` exits 0 — zero errors. All 4 TSC blocking issues (B1–B4) resolved by Fixer commit 3911f73d.

### Sprint-specific test suites (isolated runs)

- 1345a (`1345a-reuters-fallback.test.ts`): 11 pass / 0 fail
- 1345b (`1345b-bctc-financial-validation.test.ts`): 3 pass / 0 fail
- 1345d (`1345d-vnindex-cascade-broadcast.test.ts`): 7 pass / 0 fail
- 1345e (`1345e-integration-pipeline.test.ts`): 11 pass / 0 fail
- **Total sprint-specific: 32 pass / 0 fail**

### Full suite (bun test)

- Total: 7449 tests across 642 files
- Pass: 7355
- Fail: 73
- Skip: 21
- Baseline before sprint: 7354 pass / 73 fail
- Net change vs baseline: +1 pass, 0 new failures — no regression introduced

The 73 pre-existing failures are test isolation contamination (shared in-memory DB singleton across test files). Tests pass in isolation. This pattern predates sprint 1345 and is tracked as a separate open issue.

---

## DDD Compliance: PASS

- `src/domain/` has zero imports from `infrastructure/` or `application/`
- `financialFiguresValidator.ts` (1345b): pure domain function, no infrastructure imports
- `vpsProxyWatchdogJob.ts` (1345a): scheduler layer, correctly imports from infrastructure
- `predictionMarketJob.ts` (1345c): scheduler layer, dynamic import of domain service — correct pattern
- `intelligenceCycleJob.ts` (1345d): scheduler layer, `sendMarketFn` injected via DI — correct

---

## Security: PASS

- No `process.env` usage in any 1345-modified production files (all use `Bun.env`)
- No hardcoded API keys or credentials
- No SQL in 1345-modified files (all DB access via existing parameterized stores)
- No path traversal risks introduced
- `fetchNewsApi` correctly short-circuits when `apiKey` is empty or `enabled` is false

---

## Issues Found

### Blocking

None. All blocking issues (B1–B4 from prior QA pass) resolved by Fixer.

### Non-Blocking

**[N1] Pre-existing test isolation contamination (73 failures)**
- Cause: shared in-memory DB singleton across test files in full suite run
- Not caused by sprint 1345 code
- Recommendation: separate task to fix DB singleton contamination

**[N2] No 1345c standalone test file**
- `1345c-polymarket-staleness.test.ts` does not exist; 1345c logic is covered by `1345e-integration-pipeline.test.ts`
- Acceptable for merge — coverage is present, just via the integration suite

---

## Merge Status

APPROVED — merged to main (commit 3911f73d is the final commit on main).

All sprint gates passed:
- `bun tsc --noEmit`: 0 errors
- Sprint tests (a, b, d, e): 32 pass / 0 fail
- Full suite: 7355 pass, no new failures vs baseline
- DDD: PASS
- Security: PASS
