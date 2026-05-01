# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)

---

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| JANITOR-015 | DRY: detectUnitMultiplier divergence — resolved by JANITOR-014c (canonical 400-line version now used in incomeStatementExtractor). Mark done after JANITOR-014e passes. | medium | fix | developer | — | — |
| JANITOR-016 | DRY: private parseVnNumber copies in sscInsider.ts and muasamcong.ts diverge from canonical vnNumberParser.ts — private copies use simpler dot-replace logic, return 0 on NaN (vs null), and do not handle parentheses-negatives, scientific notation, or format disambiguation; replace both with import of canonical parseVnNumber | low | refactor | developer | — | — |
| JANITOR-017 | DRY: BROWSER_UA string (Mozilla/5.0 Macintosh Chrome/131) hardcoded inline in 18 source files — any UA rotation requires 18 edits; extract to a shared infrastructure constant (e.g. infrastructure/http/browserHeaders.ts) | low | refactor | developer | — | — |

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## Done

| Task ID | Title | Merged | Reports |
|---------|-------|--------|---------|
| JANITOR-014 / 014a–014e | DRY: extract shared extractor helpers — create extractorHelpers.ts (014a), migrate balanceSheet (014b), incomeStatement (014c), cashFlow (014d) extractors; full verification (014e). Zero private copies remain. 46 tests pass, 1 pre-existing fail unchanged. | 2026-05-01 | docs/reports/TASK_REPORT_JANITOR-014.md |
| JANITOR-015 | DRY: detectUnitMultiplier divergence resolved — canonical 400-line version now used in incomeStatementExtractor via extractorHelpers.ts import (JANITOR-014c). | 2026-05-01 | — |
| 1810a | FIX: BCTC income statement — sci-notation guard in vnNumberParser, GUARD_MAX 500T→2T, multi-field magnitude sentinel, HPG short-pattern fallback; FPT Q4 + HPG Q4 fixtures. 33 tests pass. | 2026-05-01 | reports/TASK_REPORT_1810a.md |
| 1810c | VNM Q4-2025 unit scale mismatch fix — detectUnitMismatch() in financialFiguresValidator.ts; unit cross-check in parseBctcReport.ts Step 5b; low_confidence=0.1 when totalAssets/netRevenue ratio >1000×. 5 tests pass. | 2026-05-01 | reports/TASK_REPORT_1810c.md |
| 1810b | VCB Q1-2026: Q1 period year parsing fix — Tier 3 month boundary in bctcReparseJob.ts corrected to publication-window mapping (month ≤ 4 → Q1). 7 new tests pass. | 2026-05-01 | — |
| 1809a | FIX: 089-tool-macro.test.ts SBV_NORMAL fixture — add 4 missing fields (discountRatePct, maxDepositRatePct, maxLendingRatePct, interbankOvernightPct). 16 pass, 0 fail. 23 pre-existing failures unchanged. | 2026-05-01 | — |
| 1808 | FIX: chain_catalyst bypass Step 3 threshold gate — route unconditionally to Step 3c in alert-commander cycle.md | 2026-05-01 | — |
| 1807-open | Open Sprint 1807 — QA final sweep, stats baseline updated (8672/8592/42), SPRINT_GOAL.md advanced | 2026-04-30 | — |
| 1806c | Sync project-stats.json — sprint=1806, testBaseline=8562, testBaselinePass=8527, testBaselineFail=35, totalTasksDone=425 | 2026-05-01 | — |
| 1806b | (resolved pre-existing failures — see currentSprintNotes) | 2026-05-01 | — |
| 1806a | (resolved pre-existing failures — see currentSprintNotes) | 2026-05-01 | — |
| JANITOR-013 | DRY: export SignalTypeSchema from agentSignalStore — remove duplicate z.enum in agentSignalTools | 2026-04-30 | — |
| 1805b-4 | QA: verify chain_catalyst firing matrix — all static checks PASS; 3/3 trace cases correct; 8 pre-existing test failures (1294b/1349c/1347b), 0 regressions from Sprint 1805 | 2026-05-01 | — |
| 1805b-3 | news-scout cycle.md — remove regime/regime_adjusted_score from chain_catalyst finding_data; move to payload.detail | 2026-05-01 | — |
| 1805b-2 | alert-commander.md — add chain_catalyst to signals.consumes + inter_agent.receives_from | 2026-05-01 | — |
| 1805b-1 | alert-commander cycle.md — chain_catalyst thresholds, signal matrix row, Step 3c block, Step 4a caveats, Step 5 log template | 2026-05-01 | — |
| 1805a | Clean up stale testBaselineFail field — zero'd, all pre-existing failures resolved since Sprint 1419 | 2026-05-01 | — |
| 1803 | TA candle guard — "TA: en attente (N/35 bougies)" annotation when history insufficient; candlesAvailable on ComputeTAResponse; taAlertScanJob log line; 5 tests pass | 2026-05-01 | — |
| 1804a–1804d-E | Sprint 1804 — deploy-vinahost.sh fix, priceHistoryTools daily_ohlcv, PriceAnomalyFindingData schema, computeConfidenceBoost(), getPriceAnomalySignals(), market-watcher + alert-commander wiring, 10 tests | 2026-05-01 | docs/handoffs/TASK_1804d-*.md |
| 1777–1802 | Sprints 1777–1802 archived — see docs/TASKS_ARCHIVE.md | 2026-04-30 | — |

---
