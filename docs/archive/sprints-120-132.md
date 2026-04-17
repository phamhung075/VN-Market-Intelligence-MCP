# Archive — Sprints 120–132

Period: 2026-04-17
Archived from TASKS.md on Sprint 133 start.

---

## Sprint 120 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1354 | fix(prediction-diag): TDD — predictionDiag block | Done |
| 1355 | fix(prediction-diag): medium-severity fallback | Done |

Goal: fix(prediction-diag): predictionDiag + medium-severity fallback (1354, 1355)

---

## Sprint 121 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1356 | test(ta-diag): TDD — taDiag observability block in evening summary | Done |
| 1357 | feat(ta-diag): taDiag observability block in evening summary | Done |

Goal: feat(ta-diag): taDiag observability block in evening summary (1356, 1357)

---

## Sprint 122 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1358 | test(ohlcv-aggregator): TDD 1358-ohlcv-daily-aggregator.test.ts — written FIRST | Done |
| 1359 | feat(ohlcv-aggregator): ohlcvDailyAggregatorJob + wire jobs.ts | Done |

Req: docs/REQ_122.md | Tech: docs/TECH_122.md | PO sign-off: 2026-04-17

---

## Sprint 123 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1360 | test(ohlcv-backfill-queue): TDD — written FIRST, must be RED | Done |
| 1361 | feat(ohlcv-backfill-queue): backfill queue endpoint + VPS poll script | Done |

Req: docs/REQ_123.md | Tech: docs/TECH_123.md | PO sign-off: 2026-04-17

---

## Sprint 124 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1362 | test(vps-deploy-backfill): TDD — deploy script wires ohlcv-backfill-poll.sh | Done |
| 1363 | feat(vps-deploy-backfill): deploy-vinahost.sh — add backfill poller as 6th service | Done |

Goal: Wire ohlcv-backfill-poll.sh into deploy-vinahost.sh so VPS poller installs automatically.
Tech: docs/TECH_124.md | PO sign-off: 2026-04-17

---

## Sprint 125 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1364 | test(france-ta-detail): TDD — franceSummaryJob TA section shows ticker signals not just count | Done |
| 1365 | feat(france-ta-detail): franceSummaryJob — replace taCount with top 3 non-neutral TA signals | Done |

Req: docs/REQ_125.md | Tech: docs/TECH_125.md | PO sign-off: 2026-04-17

---

## Sprint 126 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1366 | test(pipeline-health-tool): TDD — get_pipeline_health MCP tool | Done |
| 1367 | feat(pipeline-health-tool): implement get_pipeline_health MCP tool | Done |

Req: docs/REQ_126.md | Tech: docs/TECH_126.md | PO sign-off: 2026-04-17

---

## Sprint 127 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1368 | test(ohlcv-aggregator-notify): TDD — post WORK-channel summary after aggregation | Done |
| 1369 | feat(ohlcv-aggregator-notify): ohlcvDailyAggregatorJob — WORK-channel health summary | Done |

Req: docs/REQ_127.md | Tech: docs/TECH_127.md | PO sign-off: 2026-04-17

---

## Sprint 128 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1370 | test(france-watchlist-movers): TDD — fetchTopMovers filters by watchlist | Done |
| 1371 | feat(france-watchlist-movers): fetchTopMovers JOIN watchlist, source market_prices_history | Done |

Goal: France morning briefing movers filter to watchlist-only.
Branch: merged to main 2026-04-17 | PO sign-off: 2026-04-17

---

## Sprint 129 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1372 | fix(france-test-fixtures): update stale makeDb() in 5 test files | Done |
| 1373 | fix(cron-registry-count): update schedulerFileCount assertion 32 → 34 | Done |

Goal: Fix 17 pre-existing test failures — stale franceSummaryJob fixtures. Full suite: 4998 pass, 1 fail (intentional OCR), 20 skip.
PO sign-off: 2026-04-17

---

## Sprint 130 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1374 | test(ohlcv-aggregator-cron): TDD — aggregator cron default before 15:30 | Done |
| 1375 | fix(ohlcv-aggregator-cron): shift ohlcvDailyAggregator 16:00 → 15:00 UTC | Done |

Goal: Fix taSummary: [] — aggregator ran after evening summary. Moved to 15:00 UTC (30 min margin).
Branch: merged to main 2026-04-17 | PO sign-off: 2026-04-17

---

## Sprint 131 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1376 | fix(evening-summary-db): add optional db param to runEveningSummary | Done |
| 1377 | fix(evening-summary-test): inject in-memory DB into 1192 test | Done |

Goal: Fix production-DB bleed in 1192-evening-summary-empty-fallback.test.ts.
Branch: merged to main 2026-04-17 | PO sign-off: 2026-04-17

---

## Sprint 132 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1378 | test(vps-auto-deploy): TDD — maybe-deploy-vps.sh detection logic | Done |
| 1379 | feat(vps-auto-deploy): scripts/maybe-deploy-vps.sh + dev-standards.md branch hygiene step | Done |

Goal: Eliminate manual VPS deploy step after merges touching vps-scripts/ or deploy-vinahost.sh.
Req: docs/REQ_132.md | Tech: docs/TECH_132.md | Branch: task/1378-1379-vps-auto-deploy | PO sign-off: 2026-04-17
