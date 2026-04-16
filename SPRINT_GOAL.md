# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Current Sprint — 094 (ACTIVE)

**Goal:** Complete the TA feature lifecycle — add a real-time RSI alert job that fires when a watchlist stock crosses RSI 70 (overbought) or RSI 30 (oversold), giving the user actionable intraday signals beyond the morning briefing snapshot.

**Scope:**
- IN: Task 1307 — feat(ta-alert): implement `taAlertScanJob.ts` — periodic job (every 15min during VN market hours) that calls `computeAllIndicators` per watchlist ticker and writes RSI alerts to the `alerts` table with 4h per-ticker cooldown
- IN: Task 1308 — TDD test `src/__tests__/1307-ta-alert-scan-job.test.ts` covering: alert fires when RSI > 70, alert fires when RSI < 30, cooldown suppresses second fire within 4h, neutral RSI (40-60) fires no alert
- OUT: changes to Alert Commander logic, briefing formatter, VPS proxies, BCTC tools

**Success metric:** `bun test src/__tests__/1307-ta-alert-scan-job.test.ts` passes all cases. Alert Commander picks up TA RSI alerts from the `alerts` table and can forward to market channel. `bun tsc --noEmit` clean.

---

## Sprint 093 — COMPLETE

**Goal:** Fix 2 pre-existing test failures that block a clean full-suite run — tool registry count drift (308) and weekly report DB lock contract mismatch (1221).

**Scope:**
- IN: Task 1305 — fix(test-drift): update test 308 tool count assertion 59→60 (technicalIndicatorTools added sprint 090)
- IN: Task 1306 — fix(scheduler): align test 1221 DB lock check — job uses cron_job_runs, test uses scheduler_locks; fix the contract mismatch
- OUT: new features, Alert Commander changes, VPS changes

**Success metric:** `bun test` full suite passes tests 308 and 1221 with 0 new failures. `bun tsc --noEmit` clean.

---

## Sprint 092 — COMPLETE

**Goal:** Integrate TA signals (RSI/MACD/SMA) from the sprint 090 domain service into the morning briefing — user currently receives price data only; adding overbought/oversold and MA-crossover signals makes the daily briefing actionable.

**Scope:**
- IN: Task 1304 — feat(briefing): add TA signal section to morning briefing (RSI overbought/oversold, price vs SMA20)
- IN: TDD test covering briefing formatter with TA signal section
- OUT: Alert Commander changes, BCTC changes, new MCP tools

**Success metric:** Morning briefing Telegram message includes a "TA Signals" section with RSI and SMA status for each watchlist ticker. Test 1304 passes. `bun tsc --noEmit` clean.

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 091 | fix(cascade): non-watchlist confidence cap (1207) + backlog cleanup (1218, 1248) | COMPLETE 2026-04-15 |
| 090 | feat(ta): technical indicators domain service + MCP handler (1302, 1303) | COMPLETE 2026-04-15 |
| 089 | fix(sector-dedup) + fix(test-isolation) (1300, 1301) + cascade rebase (1207) | PARTIAL — 1207 in Review |
| 088 | fix(test-drift): scheduler count, VPS string, Step E behavior (1297-1299) | COMPLETE 2026-04-15 |
| 087 | fix(ssc) + fix(prediction) schema (1295, 1296) | COMPLETE 2026-04-15 |
| 086 | fix(schema) + fix(kinh-dich) + fix(freshness) (1291-1293) | COMPLETE 2026-04-15 |
| 085 | fix(cascade) + feat(scheduler) franceSummaryJob (1289, 1290) | COMPLETE |
| 084 | fix(cascade/pollNews/schema) (1286-1288) | COMPLETE |
| 083 | Code janitor scan + schema.ts env-access fix | COMPLETE |
| 082 | Config drift fix — alert cooldown config-driven + sector dedup | COMPLETE 2026-04-15 |
| 081 | Domain bug batch — cascade/classification, NER fixes | COMPLETE 2026-04-15 |
| 080 | Domain bug dedup — ticker intelligence, macro cascade gaps | COMPLETE 2026-04-14 |
