# Archived Sprints 221–225

---

## Sprint 221 — fix(watchdog): extend VPS staleness coverage to news + OHLCV — COMPLETE 2026-04-21

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1549_a | TDD RED: `1549-watchdog-news-staleness.test.ts` — 6 failing assertions for news + OHLCV staleness checks | Done | Dev |
| 1549_b | GREEN: extend runVpsProxyWatchdog to check rag_analyses + daily_ohlcv freshness; off-hours guard unchanged | Done | Dev |

---

## Sprint 222 — fix(watchdog): also alert MARKET channel when VPS data pipeline goes stale — COMPLETE 2026-04-21

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1550_a | TDD RED: `1550-watchdog-market-alert.test.ts` — 3 failing assertions: MARKET alert sent when stale, skipped in cooldown, WORK still fires | Done | Dev |
| 1550_b | GREEN: add `notifyUser?` to options + `sendTelegramMarket` import; send user-friendly MARKET alert after WORK alert succeeds | Done | Dev |

---

## Sprint 223 — fix(pipelineWatchdog): also alert MARKET channel when news pipeline goes stale — COMPLETE 2026-04-20

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1551 | Add notifyUser? + sendTelegramMarket to pipelineWatchdogJob; human-friendly MARKET message, best-effort | Done | Dev |

---

## Sprint 224 — fix(pipelineWatchdog): treat empty rag_analyses as stale — COMPLETE 2026-04-20

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1552 | Wire isVnIndexFresh into formatEveningSummaryLines: stale VN-Index shows "(cũ)" suffix | Done | Dev |
| 1555 | Remove early `no-data` return; null staleMins treated as infinitely stale → fires alert | Done | Dev |

---

## Sprint 225 — fix(briefings): add "(cũ)" staleness label to VN-Index in morning + france digest formatters — COMPLETE 2026-04-20

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1553 | Add isVnIndexFresh "(cũ)" suffix to morningBriefingJob:86 + franceSummaryJob:374 | Done | Dev |
