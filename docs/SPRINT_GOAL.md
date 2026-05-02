## Sprint 1820 — Active

**Status:** TODO | **Opened:** 2026-05-02

## Goals
1. **DRY completion** — replace the 2 remaining `.map(() => "?").join(` inline patterns in `sectorRotationTools.ts` and `bctcDebugTriggerHandler.ts` with `sqlInClause()` calls
2. **Zero occurrences** — post-merge grep confirms no `.map(() => "?").join(` remains anywhere in `src/`

## Success Criteria
- `sectorRotationTools.ts` and `bctcDebugTriggerHandler.ts` use `sqlInClause()` at all sites
- `grep -r '.map(() => "?").join(' apps/mcp-server/src/` returns empty
- Full test suite passes with no new failures (baseline: 8558 pass / 0 fail)
- `bun tsc --noEmit` clean

---

## Closed Sprints

| Sprint | Result |
|--------|--------|
| JANITOR-019 — sqlInClause DRY (019a+019b+019c) | DONE — 2026-05-02. 8558 pass / 0 fail. tasks=446 |
| 1818a — TS2532 fix in smartCompactSpawner | DONE — 2026-05-02. 8554 pass / 0 fail. tasks=443 |
| 1817a+1817b — test CWD path resolution fixes | DONE — 2026-05-02. 8554 pass / 0 fail. tasks=442 |
| 1816b+1816c — bctcQueueEnricher + Dockerfile python3 | DONE — 2026-05-02. 8554 pass / 6 fail. tasks=440 |
| 1816a — sprint doc invariants + scheduler.md | DONE — 2026-05-02. 8427 pass / 110 fail. tasks=438 |
| 1815d — mcp-server healthcheck curl→bun fetch | DONE — 2026-05-02. 8647 pass / 19 fail. tasks=437 |
| 1815c — tradingEconomicsChromium retry-on-Target-closed | DONE — 2026-05-02. 8646 pass / 19 fail. tasks=436 |
| 1815 — BCTC-VAL-01 VNM Q4-2025 false-zero confidence | DONE — 2026-05-02. tasks=435 |
| JANITOR-018 — bctcDiscovery DDD fix | DONE — 2026-05-01. tasks=434 |
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
