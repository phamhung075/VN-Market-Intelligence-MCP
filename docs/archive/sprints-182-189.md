# Sprint Archive — 182–189

---

## Sprint 182 — fix(test-isolation): batch6 — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1481_a | test(isolation): TDD RED — 1481-db-isolation-batch6.test.ts full-file scan | Done | Dev |
| 1481_b | fix(isolation): GREEN — bulk replace process.env → Bun.env everywhere in __tests__ | Done | Dev |

> Report: `reports/TASK_REPORT_1481.md`

---

## Sprint 183 — fix(qa-spawner): spawnQaResponder DB injection + 1073 assertion drift — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1482_a | test(qa-spawner): TDD RED — assert spawnQaResponder uses injected db, not getDb() | Done | Dev |
| 1482_b | fix(qa-spawner): GREEN — add db? param to spawnQaResponder + pass conn + fix 1073 assertion | Done | Dev |

> Report: `reports/TASK_REPORT_1482.md`

---

## Sprint 184 — fix(test-isolation): 1480 inverted assertion + 1163 missing Bun.env — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1483_a | test(isolation): TDD RED — assert 1480 condition checks banned process.env not correct Bun.env | Done | Dev |
| 1483_b | fix(isolation): GREEN — fix 1480 condition + add Bun.env line to 1163 | Done | Dev |

> Report: `reports/TASK_REPORT_1483.md`

---

## Sprint 185 — fix(test-isolation): 047 mock wrong return type — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1484 | fix(isolation): 047-bctc-orchestrator mock.module returns CoreSendResult instead of boolean — poisons telegram.js cache for 034+1163 | Done | Dev |

> Report: `reports/TASK_REPORT_1484.md`

---

## Sprint 186 — fix(test-isolation): 034+1254+1163+vnstock — 047 mock.module still poisons full suite — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1485_a | TDD RED: write 1485-telegram-mock-isolation.test.ts — simulate 047 stub, assert victims receive wrong type | Done | Dev |
| 1485_b | GREEN: add mock.module override in 034+1254+1163; fix vnstock-3statement closeDb() in beforeEach | Done | Dev |

> Report: `reports/TASK_REPORT_1485.md`

---

## Sprint 187 — fix(db-cleanup): remove test fixture rows leaked into production market.db — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1486 | CLEANUP: delete test VCB fixture rows from production market_prices + market_prices_history | Done | Dev |

---

## Sprint 188 — feat(yahoo-extended): expand commodity fetcher 3 → 12 symbols — COMPLETE (2026-04-19)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1487 | TDD RED + GREEN: yahooFinance 12-symbol fetch + schema +9 cols + MacroContext risk-off wiring | Done | Dev |
| 1488 | (folded into 1487) | Done | Dev |

> Merge: `4cb94ef` — expand Yahoo fetcher 3→12 symbols

---

## Sprint 189 — fix(db-health): tracked_indicators dedup + VPS geo-routing (Reuters/TE/SBV/GSO) + kinhdich throttle — COMPLETE (2026-04-20)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1489 | TDD RED: tracked_indicators dedup | Done | Dev |
| 1490 | GREEN: INSERT OR REPLACE + test-source purge | Done | Dev |
| 1491 | TDD RED: push-foreign-flow parse | Done | Dev |
| 1492 | GREEN: endpoint parse fix + VPS script hardening | Done | Dev |
| 1493 | TDD RED: push-reuters endpoint | Done | Dev |
| 1494 | GREEN: fetch-reuters.sh + push-reuters endpoint | Done | Dev |
| 1495 | GREEN: push-tradingeconomics + schema +9 cols + VPS script | Done | Dev |
| 1497 | TDD RED + GREEN: SBV rates || fix + schema +4 cols | Done | Dev |
| 1498 | (folded into 1497) | Done | Dev |
| 1499 | TDD RED + GREEN: push-gso endpoint + vps script | Done | Dev |
| 1500 | (folded into 1499) | Done | Dev |
| 1501 | TDD RED + GREEN: kinhdich market-hours guard + 15-min cooldown | Done | Dev |
| 1502 | (folded into 1501) | Done | Dev |

> Merges: `5fb5021`(1489) · `ced9651`(1491/1492) · `2715cd4`(1493/1494) · `f3de96a`(1495) · `34f5c17`(1497/1498) · `8d0dd7d`(1499/1500) · `0b713b2`(1501/1502)
