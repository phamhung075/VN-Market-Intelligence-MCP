# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Current Sprint — 100 (COMPLETE)

**Goal:** Diagnose and fix `predictionSignals: []` in evening reports — the field has been empty across every daily report for weeks, meaning users never see prediction-based signals at close even when the prediction pipeline is running.

**Scope:**
- IN: Investigate why `assembleEveningSummary` returns `predictionSignals: []` — check DB query, prediction_signals table population, and evidence fragment flow
- IN: Fix root cause (query gap, missing table population, or schema mismatch)
- IN: TDD test covering `predictionSignals` populated correctly in evening summary
- OUT: Changes to alert pipeline, TA scan jobs, BCTC tools, VPS proxies

**Success metric:** Evening report `predictionSignals` field contains at least the currently active prediction claims when they exist. `bun tsc --noEmit` clean. Test passes.

**Status:** COMPLETE 2026-04-15. Tasks 1318+1319 merged. All 10 test cases pass.

---

## Current Sprint — 101 (COMPLETE)
**Status:** COMPLETE 2026-04-15. Tasks 1320+1321 merged. DDD boundary: 0 infra imports in domain/. All 4 tests pass.

---

## Current Sprint — 102 (PLANNING)

**Goal:** Add a `newsCount` diagnostic field to the evening summary report — the `topStories: []` gap in production is invisible to the user and hard to debug. Surfacing how many raw news items were ingested since midnight gives immediate observability into whether the VPS news push is working and whether the intelligence cycle is writing analyses.

**Scope:**
- IN: Add `newsCount: number` field to `EveningSummary` type (count of `rag_analyses` rows since midnight Vietnam)
- IN: Populate `newsCount` in `assembleEveningSummary.ts` — single COUNT query alongside existing ragRows query
- IN: Include `newsCount` in the Telegram evening message: show "(N tin tức hôm nay)" beside the top stories section header; if `newsCount === 0` show "Không có tin tức hôm nay" instead of empty list
- IN: TDD test (4 cases): newsCount populated correctly, zero case shows fallback label, positive case shows count, `bun tsc --noEmit` clean
- OUT: Intelligence cycle changes, VPS proxy changes, alert pipeline

**Success metric:** Evening Telegram message shows news count. User can tell at a glance if the news pipeline is active. `bun tsc --noEmit` clean. 4+ TDD cases pass.

---

## Sprint 099 — COMPLETE

**Goal:** Rewrite `franceSummaryJob` — the France morning digest sent to MARKET channel was using a legacy format. New version sends top 3 movers, top 3 alerts, TA signal count in Vietnamese. Silent skip when all sources empty.

**Scope:**
- IN: Task 1316 — feat(france-summary): rewrite `franceSummaryJob.ts`
- IN: Task 1317 — TDD test `1316-france-summary-rewrite.test.ts`
- OUT: Alert Commander, evening summary, VPS proxies

**Success metric:** `franceSummaryJob` sends correctly formatted Vietnamese digest at 07:00 UTC M-F. Silent skip when no data. 12/12 TDD cases pass.

---

## Sprint 098 — COMPLETE

**Goal:** Deliver unnotified TA alerts (RSI overbought/oversold, BB breakout) from `alerts` table to Telegram MARKET channel intraday — previously TA alerts were never forwarded because `readUnnotifiedAlerts` only picks up `severity IN ('high','critical')`.

**Scope:**
- IN: Task 1314 — feat(ta-notifier): `taAlertNotifierJob.ts`
- IN: Task 1315 — TDD test `1314-ta-alert-notifier.test.ts`
- OUT: Alert Commander, scan jobs, schema changes

**Success metric:** TA alerts reach user within 15 minutes of trigger during market hours. 23/23 TDD cases pass.

---

## Sprint 097 — COMPLETE

**Goal:** Add TA close-of-day signals (RSI/MA20) to evening summary — user currently receives no TA context at market close.

**Scope:**
- IN: Task 1312 — `taSummary: TaSignal[]` added to `EveningSummary` + Telegram formatter
- IN: Task 1313 — TDD test

**Success metric:** Evening Telegram message includes "TA tín hiệu đóng cửa" section when non-neutral signals exist.

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 102 | feat(evening-summary): newsCount diagnostic field + Telegram formatter (1322, 1323) | PLANNING |
| 101 | refactor(ddd): shared-types.ts — zero infra imports in domain/ (1320, 1321) | COMPLETE 2026-04-15 |
| 100 | fix(prediction): predictionSignals always empty in evening summary (1318, 1319) | COMPLETE 2026-04-15 |
| 099 | feat(france-summary): rewrite franceSummaryJob — Vietnamese digest | COMPLETE 2026-04-15 |
| 098 | feat(ta-notifier): deliver TA alerts to Telegram market channel | COMPLETE 2026-04-15 |
| 097 | feat(evening-summary): add taSummary to EveningSummary + Telegram | COMPLETE 2026-04-15 |
| 096 | fix(ta-alert): cooldown query wall-clock vs nowFn (1311) | COMPLETE 2026-04-15 |
| 095 | feat(ta-alert): bbAlertScanJob BB breakout (1309, 1310) | COMPLETE 2026-04-15 |
| 094 | feat(ta-alert): taAlertScanJob RSI overbought/oversold (1307, 1308) | COMPLETE 2026-04-15 |
| 093 | fix(test-drift): tool count + scheduler lock contract (1305, 1306) | COMPLETE 2026-04-15 |
| 092 | feat(briefing): TA signals in morning briefing (1304) | COMPLETE 2026-04-15 |
| 091 | fix(cascade) + BCTC backlog (1207, 1218, 1248) | COMPLETE 2026-04-15 |
| 090 | feat(ta): technical indicators domain service + MCP handler (1302, 1303) | COMPLETE 2026-04-15 |
| 089 | fix(sector-dedup) + fix(test-isolation) (1300, 1301) | COMPLETE 2026-04-15 |
| 088 | fix(test-drift): scheduler count, VPS string, Step E behavior (1297-1299) | COMPLETE 2026-04-15 |
| 087 | fix(ssc) + fix(prediction) schema (1295, 1296) | COMPLETE 2026-04-15 |
| 086 | fix(schema) + fix(kinh-dich) + fix(freshness) (1291-1293) | COMPLETE 2026-04-15 |
| 085 | fix(cascade) + feat(scheduler) franceSummaryJob (1289, 1290) | COMPLETE |
| 084 | fix(cascade/pollNews/schema) (1286-1288) | COMPLETE |
| 083 | Code janitor scan + schema.ts env-access fix | COMPLETE |
| 082 | Config drift fix — alert cooldown config-driven + sector dedup | COMPLETE 2026-04-15 |
| 081 | Domain bug batch — cascade/classification, NER fixes | COMPLETE 2026-04-15 |
| 080 | Domain bug dedup — ticker intelligence, macro cascade gaps | COMPLETE 2026-04-14 |
