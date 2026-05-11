# dev-mcp-server — Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### Task 1869a — price_drop threshold -5% → -7% (2026-05-11, DONE)

**Problem:** `DEFAULT_DROP_PCT = -5` too low for 30-stock watchlist volatility profile. Precision 50% (8/16) vs 60% gate.

**Fix:** `DEFAULT_DROP_PCT = -7` in `signalDetector.ts`. Aligns with VN circuit breaker significance.

**Test fixture updates:**
- `063`: TC-1 price 95k→93k (−7%)
- `122`: SD-03 boundary −5→−7, SD-04 boundary −4.99→−6.99, SD-14 via watchlistThreshold (medium severity still testable)
- `133`: TC-17/TC-22 comments updated
- `1076`: `FIVE_PCT_DROP` fixture price 95k→93k, changePct −5→−7

**Counts:** 124/124 targeted, 9132/9132+ full suite, 17 pre-existing fails unchanged. SHA d884be66.

**Caveat:** SD-14 severity-medium branch now requires `watchlistThresholds` override to exercise — default -7% means 5-6.9% drops don't fire at default. `priceSeverity()` ladder unchanged.

---

### Task 1850f — Polymarket fixture contamination (2026-05-07, DONE)

**Root cause:** `163-prediction-schema.test.ts` inserts `t163-mkt-*` rows with `fetched_at='2026-04-01T08:00:00Z'` (hardcoded stale date). These rows can reach production `market.db` if tests ever run against a real DB, or the prod DB was seeded with them.

**Fix applied in** `apps/mcp-server/src/interface/mcp/tools/macro/predictionTools.ts`:
1. Tightened `staleCutoff` from 30d to **7d** — entries older than 7 days excluded from prod output
2. Added `AND pm.id NOT LIKE 't___-mkt-%'` to SQL WHERE clause — belt-and-suspenders block for fixture IDs even if they get a recent `fetched_at`

**Pattern precision:** `t___-mkt-%` = `t` + exactly 3 chars + `-mkt-` + anything. Matches `t163-mkt-001`, `t163-mkt-defaults`. Does NOT match `t168-m1`/`t168-m2` (no `-mkt-` segment).

**Pre-existing failures (not introduced):** Task 178 (7), TASK-1549 (1), Sprint 145 (1), Task 1100 (1) = 10 tests. All pre-date this task.

**Files changed:**
- `apps/mcp-server/src/interface/mcp/tools/macro/predictionTools.ts` (staleCutoff + ID filter)
- `apps/mcp-server/src/__tests__/1850f-fixture-contamination.test.ts` (7 new tests, all pass)

**Commit:** `52d63b61`
