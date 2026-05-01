# Sprint 1813 — Goal

**Status:** IN PROGRESS | **Opened:** 2026-05-01

## Goals
1. **DDD fix** — extract `fetchWithTimeout` and `BROWSER_UA` from `domain/services/bctcDiscovery.ts` to infrastructure
2. **New adapter** — `infrastructure/fetchers/bctcHttpFetcher.ts` provides `bctcHttpFetch: HttpFetchFn`
3. **Scheduler wired** — `bctcQueueEnricherJob.ts` supplies `bctcHttpFetch` as production default for all four strategies
4. **Guard test** — 1813-bctc-ddd.test.ts: throws when no fetch functions supplied

## Success Criteria
- `BROWSER_UA` and `fetchWithTimeout` removed from domain layer
- `bun tsc --noEmit` clean
- `bun test --filter "1813-bctc-ddd"` 1 pass
- zero new regressions (baseline: 8622 pass)

---

## Closed Sprints

| Sprint | Result |
|--------|--------|
| 1812 — JANITOR SSOT audit + DDD violation documented | DONE — 2026-05-01. 8626 pass / 35 fail (all pre-existing). tasks=429 |
| 1811 — DRY: JANITOR-014/015/016/017 | Merged — 8622 pass / 23 fail. tasks=428 |
| 1810 — BCTC fixes (1810a/1810b/1810c) | tasks=428 |
| 1809 — SBV_NORMAL fixture fix | 8501 pass / 23 fail. tasks=427 |
| 1808 — chain_catalyst routing fix | tasks=426 |
| 1807 — Idle | No tasks |
| 1806 — DRY + test fixes | 8672/8592/42 pass. tasks=425 |
| 1805 — chain_catalyst matrix | tasks=421 |
| 1804 — Price validation + VIC/VRE | tasks=415 |
| 1803 — TA candle guard | Merged |
| 1801 — Puppeteer DRY | tasks=404 |
| 1800 — Root cleanup | tasks=403 |
