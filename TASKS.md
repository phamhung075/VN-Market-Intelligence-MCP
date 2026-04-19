# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`

---

## Sprint 188 — feat(yahoo-extended): expand commodity fetcher 3 → 12 symbols — ACTIVE

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1487 | TDD RED: 1487-yahoo-finance-extended.test.ts — 12-symbol fetch, CommoditySnapshot shape, storeCommoditySnapshot columns, partial-failure resilience, backward compat | Todo | Dev |
| 1488 | GREEN: extend yahooFinance.ts SYMBOLS+type+store; extend schema.ts commodity_prices/history (9 new cols); extend runImpactChain MacroContext with vix/sp500/dxy/hangSeng | Todo | Dev |

---

## Sprint 187 — fix(db-cleanup): remove test fixture rows leaked into production market.db — ACTIVE

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1486 | CLEANUP: delete test VCB fixture rows from production market_prices + market_prices_history | Todo | Dev |

---

## Sprint 186 — fix(test-isolation): 034+1254+1163+vnstock — 047 mock.module still poisons full suite — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1485_a | TDD RED: write 1485-telegram-mock-isolation.test.ts — simulate 047 stub, assert victims receive wrong type | Done | Dev |
| 1485_b | GREEN: add mock.module override in 034+1254+1163; fix vnstock-3statement closeDb() in beforeEach | Done | Dev |

> Report: `reports/TASK_REPORT_1485.md`

---

## Sprint 185 — fix(test-isolation): 047 mock wrong return type — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1484 | fix(isolation): 047-bctc-orchestrator mock.module returns CoreSendResult instead of boolean — poisons telegram.js cache for 034+1163 | Done | Dev |

> Report: `reports/TASK_REPORT_1484.md`

---

## Sprint 184 — fix(test-isolation): 1480 inverted assertion + 1163 missing Bun.env — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1483_a | test(isolation): TDD RED — assert 1480 condition checks banned process.env not correct Bun.env | Done | Dev |
| 1483_b | fix(isolation): GREEN — fix 1480 condition + add Bun.env line to 1163 | Done | Dev |

> Report: `reports/TASK_REPORT_1483.md`

---

## Sprint 183 — fix(qa-spawner): spawnQaResponder DB injection + 1073 assertion drift — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1482_a | test(qa-spawner): TDD RED — assert spawnQaResponder uses injected db, not getDb() | Done | Dev |
| 1482_b | fix(qa-spawner): GREEN — add db? param to spawnQaResponder + pass conn + fix 1073 assertion | Done | Dev |

> Report: `reports/TASK_REPORT_1482.md`

---

## Sprint 182 — fix(test-isolation): batch6 — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1481_a | test(isolation): TDD RED — 1481-db-isolation-batch6.test.ts full-file scan | Done | Dev |
| 1481_b | fix(isolation): GREEN — bulk replace process.env → Bun.env everywhere in __tests__ | Done | Dev |

> Report: `reports/TASK_REPORT_1481.md`

---

---

## Sprint 189 — fix(db-health): tracked_indicators dedup + test contamination purge + VPS routing for Reuters/TradingEconomics/SBV/GSO + kinhdich throttle — UPCOMING

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1489 | TDD RED: 1489-tracked-indicators-dedup.test.ts — storeCommoditySnapshot INSERT OR REPLACE, no unbounded growth, test-source rows purged | Review | Dev |
| 1490 | GREEN: add INSERT OR REPLACE / ON CONFLICT logic to storeCommoditySnapshot in yahooFinance.ts; one-time DELETE of source='test' rows from tracked_indicators; DELETE of system_logs where message IN ('only this appears','error message') | Todo | Dev |
| 1491 | TDD RED: 1491-push-foreign-flow-parse.test.ts — push endpoint rejects malformed payload, returns 400 with error detail; VPS script sends correct shape | Todo | Dev |
| 1492 | GREEN: fix push-foreign-flow MCP endpoint parse validation; fix vps-scripts/push-foreign-flow.sh to match expected schema | Todo | Dev |
| 1493 | TDD RED: 1493-reuters-vps-push.test.ts — push-reuters endpoint inserts RSS items into rag_analyses; dedup by url; rejects malformed payload | Todo | Dev |
| 1494 | GREEN: add vps-scripts/fetch-reuters.sh (VPS cron, fetches Reuters RSS, pushes to MCP /push-reuters); add push-reuters endpoint in MCP server; wire to pollNews source registry | Todo | Dev |
| 1495 | TDD RED: 1495-tradingeconomics-vps-push.test.ts — push-tradingeconomics endpoint upserts all 13 indicator rows into tracked_indicators; rejects bad payload | Todo | Dev |
| 1496 | GREEN: add vps-scripts/fetch-tradingeconomics.sh (VPS cron, scrapes TE via Playwright, pushes 13 indicators); add push-tradingeconomics endpoint in MCP server | Todo | Dev |
| 1497 | TDD RED: 1497-sbv-rates-fix.test.ts — storeSbvRates writes non-zero overnight_rate + refinancing_rate; new columns present: discount_rate_pct, max_deposit_rate_pct, max_lending_rate_pct, interbank_overnight_pct | Review | Dev |
| 1498 | GREEN: fix vn-sbv-fetch.service / sbv.ts fetcher — parse correct fields from SBV portal; extend sbv_rates schema with 4 new columns | Todo | Dev |
| 1499 | TDD RED: 1499-gso-macro-vps-push.test.ts — push-gso endpoint upserts macro_indicators row with non-stale fetched_at; rejects bad payload | Todo | Dev |
| 1500 | GREEN: add vps-scripts/fetch-gso.sh (VPS cron, scrapes GSO macro data, pushes to MCP); add push-gso endpoint; update macro_indicators schema with 9 new columns | Todo | Dev |
| 1501 | TDD RED: 1501-kinhdich-market-hours.test.ts — kinhdich cron skips outside 09:00-15:00 VN; fires at most 24×/stock/day | Todo | Dev |
| 1502 | GREEN: add market-hours guard to kinhdich scheduler job; cap readings to 1/stock/15min during session | Todo | Dev |

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|
| — | Sprint 190: feat(ohlcv-foreign-flow): add foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol columns to daily_ohlcv; wire from VPS vn-foreign-flow.service | MEDIUM | VPS already running; column add + push handler |
| — | Sprint 191: feat(cascade-outcome): add source_rag_id, price_impact_3d, price_impact_7d, outcome_correct, confidence to cascade_rule_hits; add impact_score, price_at_message, price_3d_after to market_messages | MEDIUM | Backtesting / signal quality |

---

