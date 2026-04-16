# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Current Sprint — 092 (ACTIVE)

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
