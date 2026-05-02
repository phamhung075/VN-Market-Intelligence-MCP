## Sprint 1826 — Active

**Status:** TODO | **Opened:** 2026-05-02

## Goals

- GSO HTML parser observability — log raw excerpt on parse fail
- Regex coverage for alternate GSO table layouts

## Success Criteria

- GSO parse failures emit raw excerpt to logs for diagnosis
- Regex handles at least 2 alternate GSO table layout variants
- `bun tsc --noEmit` clean

---

## Closed Sprints

| Sprint | Result |
|--------|--------|
| 1825 — GSO HTML parser + vnstock backoff | DONE — 2026-05-02. 8582 pass / 0 fail. totalTasksDone=470 |
| 1824 — agent-memory manifests, GSO native fetch, deploy market-hours guard, orphan cleanup | DONE — 2026-05-02. 8582 pass / 0 fail. totalTasksDone=468 |
| 1823 — vnstock backoff + te-chromium circuit breaker + GSO skip guard | DONE — 2026-05-02. 1823b+1823c+1823d merged. 8582 pass / 0 fail. totalTasksDone=462 |
| 1822 — VPS Playwright removal + BCTC migration to Docker + test fixes | DONE — 2026-05-02. 1822a–1822g merged. 8565 pass / 0 fail. totalTasksDone=458 |
| 1821 — pollNews cold-start retry + smart_compact MCP tool | DONE — 2026-05-02. 1821a + 1821b + 1821c merged. 8565 pass / 0 fail. totalTasksDone=450 |
| 1820 — JANITOR-020 sqlInClause DRY completion | DONE — 2026-05-02. 1819a + JANITOR-020 merged. 8558 pass / 0 fail. totalTasksDone=448 |
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
