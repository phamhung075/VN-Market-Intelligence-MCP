# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)

---

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| JANITOR-023 | DRY: extract CLAUDE_BIN shared constant — smartCompactSpawner.ts + qaResponderSpawner.ts each define identical `const CLAUDE_BIN = "/Users/admin/.local/bin/claude"`. Extract to infrastructure/agents/agentConstants.ts and import in both spawners. | low | refactor | developer | — | — |

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|

---

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
| 1828c | SPRINT-S: Reuters RSS + tradingEconomics consecutive-error observability; WORK alert at ≥10 failures; AC-R-1..6 + AC-TE-1..6. 12 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1828c.md |
| 1828d | DOCS: trim docs/SPRINT_GOAL.md to ≤30 lines (keep last 5 closed sprints). | 2026-05-02 | — |
| 1828b | FIX: sync project-stats.json knowledgeFileCount to actual count. | 2026-05-02 | — |
| 1828a | CLEAN: commit orphans, close Sprint 1827, advance to Sprint 1828. | 2026-05-02 | — |
| 1827c | DOCS: scaffold 19 missing agent notebooks in docs/agent-memory/notebooks/. | 2026-05-02 | — |
| 1827b | FIX: sync project-stats.json knowledgeFileCount + tool-registry.json toolCount. | 2026-05-02 | — |
| 1827a | CLEAN: commit orphan files, close Sprint 1826, advance SPRINT_GOAL.md to Sprint 1827. | 2026-05-02 | — |
| 1826b | FIX: GSO HTML parser observability — Variant 1/2 regex + console.error on parse fail; AC-12a/b/c. 15 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1826b.md |
| 1826a | CLEAN: commit orphan files, close Sprint 1825, advance SPRINT_GOAL.md to Sprint 1826. | 2026-05-02 | — |
| 1825b | FIX: GSO HTML parser — parseGsoHtml regex extractor replaces JSON.parse(HTML); AC-11a/11b. 12 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1825b.md |
| 1825a | CLEAN: commit orphan files (agent-memory fixtures, briefing output, notebook, flows). Advance sprint to 1825. totalTasksDone=469. | 2026-05-02 | — |
| 1824f | CLEAN: commit orphan untracked files + delete stale remote branch task/1824a-deploy-market-hours-guard. tsc clean. | 2026-05-02 | — |
| 1824e | FIX: GSO macro — remove VPS_ENDPOINT skip guard, Source 3 fetch attempted natively with graceful fallback. 11 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1824e.md |
| 1824d | FIX: create agent-memory manifest fixtures — ops.md + WAL-checkpoint.md for 1300a tests. 5 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1824d.md |
| 1824c | CHORE: advance SPRINT_GOAL.md to Sprint 1824, sync project-stats.json (currentSprint=1824, previousSprint=1823 DONE). | 2026-05-02 | — |
| 1824b | CLEAN: remove stale apps/mcp-server/docs/agent-memory/ orphan tree (12 files) + apps/mcp-server/reports/ (1 file). Zero source references. tsc clean. | 2026-05-02 | — |
| 1824a | FIX: verify-deploy-price-fetch.sh market-hours guard — skip freshness check off-hours (weekends + outside 09:00–15:15 VT); systemctl is-active only check. Config-only, tsc clean. | 2026-05-02 | — |
| 1823d | FIX: te-chromium crash-loop circuit breaker — 3-strike limit on "Target closed", WORK alert fires once at threshold, auto-recovery on success. 5 new AC tests. 8582 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1823d.md |
| 1823c | FIX: GSO macro skip guard — log skip when GSO_VPS_ENDPOINT unset; eliminates noisy HTML parse errors on macro refresh cycle. 11 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1823c.md |
| 1823b | FIX: vnstock circuit-breaker exponential backoff (2h→4h→8h) + WORK channel notification with open-circuit ticker count and timestamp. 8 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1823b.md |
| 1822g | CLEAN: delete stale task/1822a-news-fetcher-fixes branch (0 unmerged commits); commit orphan session/handoff/report files from today's sprint activity. | 2026-05-02 | — |
| 1822f | FIX: distinguish set-but-empty FAKE_DIFF from unset in maybe-deploy-vps.sh — [ "${FAKE_DIFF+x}" = "x" ] replaces [ -n "${FAKE_DIFF:-}" ]. 7/7 tests pass. | 2026-05-02 | — |
| 1822e | FIX: Align 1321-vps-oom-prevention.test.ts assertions with Sprint 1822b config — StartLimitIntervalSec=0 now in [Unit] section. 9 pass / 0 fail. | 2026-05-02 | — |
| 1822d-b | CHORE: Remove all Playwright/Chromium scripts from VPS — discover-bctc-urls-browser.py deleted, /proxy/bctc-discover/ handler removed from vps-proxy-server.js. Discovery fully migrated to mcp-server Docker. | 2026-05-02 | reports/TASK_REPORT_1822d-b.md |
| 1822d-a | FEAT: Migrate BCTC Playwright discovery from VPS to local mcp-server Docker — chromiumPageFetcher.ts, discoverBctcPdfUrlBrowser defaultBrowserFetcher updated, 2 smoke tests. 8445 pass / 105 fail (all pre-existing). | 2026-05-02 | reports/TASK_REPORT_1822d-a.md |
| 1822c | FIX: Remove Playwright/Chromium from VPS news fetch scripts — fetch-browser.py deleted, fetch_rss fallback for vneconomy, empty-payload fallback for GSO, stale comment updated. | 2026-05-02 | reports/TASK_REPORT_1822c.md |
| 1822b | FIX: VPS systemd StartLimitBurst — set StartLimitIntervalSec=0 in vn-news-fetch.service, vn-reuters-fetch.service, vn-tradingeconomics-fetch.service. Prevents StartLimitHit after 5 Playwright crashes in 5 min. Config-only, tsc clean. Pending VPS deploy via deploy-vps-proxy.sh. | 2026-05-02 | reports/TASK_REPORT_1822b.md |
| 1821b | Wire smartCompactSpawner as MCP tool `smart_compact` (tool #118) — smartCompactTool.ts, barrel export, registry entry, 2 smoke tests. tsc clean, 8565 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1821b.md |
| 1821c | CHORE: advance SPRINT_GOAL.md active header to Sprint 1821, archive Sprint 1820 in closed sprints table. | 2026-05-02 | — |
| 1821a | FIX: pollNews teChromiumNews cold-start retry — sleep 2s + retry once on empty result. 5 new tests (AC-1..5). 8563 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1821a.md |
| JANITOR-020 | DRY: export AnalysisRow/AlertCountRow/LastCycleRow/MACRO_CODES from marketContextBuilder, delete duplicates in marketContextTools. Net -29 lines. DDD compliant. 29 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_JANITOR-020.md |
| 1819a | FIX: advance currentSprint to integer 1820 in project-stats.json + update SPRINT_GOAL.md active header. QA: 1338 test (3 pass / 0 fail / 1 skip). | 2026-05-02 | — |
| JANITOR-019d | DRY: replace remaining `.map(() => "?").join(` in `sectorRotationTools.ts` + `bctcDebugTriggerHandler.ts` with `sqlInClause()`. grep clean. 8556 pass / 2 fail (pre-existing doc invariants, unrelated). | 2026-05-02 | — |
| JANITOR-019 | DRY: `sqlInClause` — architect spec complete; decomposed into 019a/019b/019c | 2026-05-02 | — |
| 1815d | FIX: docker-compose.yml mcp-server healthcheck — replace curl (not in Bun container PATH) with bun fetch. 8647 pass / 19 fail (all pre-existing). | 2026-05-02 | reports/TASK_REPORT_1815d.md |
| 1815c | FIX: tradingEconomicsChromium.ts — retry-on-Target-closed Playwright crash. +9 lines, 2 new tests (AC-17). 8646 pass / 19 fail (all pre-existing). | 2026-05-02 | reports/TASK_REPORT_1815c.md |
| 1815 | FIX: BCTC-VAL-01-POSITION — VNM Q4-2025 false-zero confidence. When assets<equity (ratio<500) AND netRevenue>assets×30, apply soft penalty (−0.2) instead of hard fail. 3 new tests green (8539 pass total). | 2026-05-02 | reports/TASK_REPORT_1815.md |
| JANITOR-018 | DDD fix: bctcDiscovery.ts — extract fetchWithTimeout + BROWSER_UA to infrastructure/fetchers/bctcHttpFetcher.ts; wire bctcHttpFetch at scheduler call site; guard throws when no fetchers supplied. 1813-bctc-ddd.test.ts passes. | 2026-05-01 | — |
| JANITOR-014 / 014a–014e | DRY: extract shared extractor helpers — create extractorHelpers.ts (014a), migrate balanceSheet (014b), incomeStatement (014c), cashFlow (014d) extractors; full verification (014e). Zero private copies remain. 46 tests pass, 1 pre-existing fail unchanged. | 2026-05-01 | docs/reports/TASK_REPORT_JANITOR-014.md |
| JANITOR-017 | DRY: BROWSER_UA string extracted to shared infrastructure/http/browserHeaders.ts — eliminates 18 inline hardcoded UA strings; any UA rotation now requires 1 edit. | 2026-05-01 | — |
| JANITOR-016 | DRY: private parseVnNumber copies in sscInsider.ts and muasamcong.ts replaced with import of canonical vnNumberParser.ts — parentheses-negatives, scientific notation, and format disambiguation now handled uniformly. | 2026-05-01 | — |
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
| JANITOR-013 | DRY: export SignalTypeSchema from agentSignalStore — remove duplicate z.enum in agentSignalTools. verified — SSOT already in place | 2026-05-01 | — |
| JANITOR-009 | DRY: SEVERITY_VI canonical map in severityLabels.ts — no inline copy in alertCheckTools. verified — SSOT already in place | 2026-05-01 | — |
| 1805b-4 | QA: verify chain_catalyst firing matrix — all static checks PASS; 3/3 trace cases correct; 8 pre-existing test failures (1294b/1349c/1347b), 0 regressions from Sprint 1805 | 2026-05-01 | — |
| 1805b-3 | news-scout cycle.md — remove regime/regime_adjusted_score from chain_catalyst finding_data; move to payload.detail | 2026-05-01 | — |
| 1805b-2 | alert-commander.md — add chain_catalyst to signals.consumes + inter_agent.receives_from | 2026-05-01 | — |
| 1805b-1 | alert-commander cycle.md — chain_catalyst thresholds, signal matrix row, Step 3c block, Step 4a caveats, Step 5 log template | 2026-05-01 | — |
| 1805a | Clean up stale testBaselineFail field — zero'd, all pre-existing failures resolved since Sprint 1419 | 2026-05-01 | — |
| 1803 | TA candle guard — "TA: en attente (N/35 bougies)" annotation when history insufficient; candlesAvailable on ComputeTAResponse; taAlertScanJob log line; 5 tests pass | 2026-05-01 | — |
| 1804a–1804d-E | Sprint 1804 — deploy-vinahost.sh fix, priceHistoryTools daily_ohlcv, PriceAnomalyFindingData schema, computeConfidenceBoost(), getPriceAnomalySignals(), market-watcher + alert-commander wiring, 10 tests | 2026-05-01 | docs/handoffs/TASK_1804d-*.md |
| 1777–1802 | Sprints 1777–1802 archived — see docs/TASKS_ARCHIVE.md | 2026-04-30 | — |

---
