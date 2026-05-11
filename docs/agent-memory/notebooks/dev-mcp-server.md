# dev-mcp-server — Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### Task 1876a-A2 — Emission bridge gap log in scanMarket.ts (2026-05-11, DONE)

**Change:** After `storeAlerts()` returns, loop over each alert and emit:
`[scanMarket] alert_written ticker=X type=Y severity=Z notified_telegram=0 — emission_bridge_to_agent_signals=MISSING (1876a/B1 pending)`
3 LOC. Logging-only. No logic change.

**Result:** TSC clean. Test suite exit 0. Confirms VRE -6.41% class of silent alerts will now be visible in container logs.

**Next:** Sprint 1877 B1 implements the actual bridge (agent_signals emission).

---

### Task 1876a-A3 — FR-5 observability log in taAlertNotifierJob (2026-05-11, DONE)

**Change:** Added startup log at top of `runTaAlertNotifier` emitting `pending=<N>` count of `price_anomaly` signals with `outcome IS NULL`. Wrapped in try/catch (best-effort). `processed_last_run=?` (no stats table). 9 LOC, logging-only.

**Result:** 28 pass / 0 fail. tsc clean. Log confirmed in test output (pending=1 when signals seeded, pending=0 otherwise).

**After Sprint 1877 B1 (bridge):** log will show `pending=N>0` confirming emission bridge is live.

---

### Task 1869b-seed — Watchlist alert_drop_pct migration (2026-05-11, DONE)

**Problem:** All watchlist rows had `alert_drop_pct = -3` (old schema default). 1869b wired per-stock thresholds into `detectSignals` but DB still had stale values.

**Fix:** `migrateWatchlistThresholds(db)` in `seedWatchlist.ts`:
- Standard tier: `UPDATE watchlist SET alert_drop_pct = -7.0 WHERE (alert_drop_pct IS NULL OR alert_drop_pct = -3) AND code NOT IN (high-vol-list)`
- High-vol tier: `UPDATE watchlist SET alert_drop_pct = -9.0 WHERE code IN ('NVL','DPM','REE','VNH','KBC','MWG','TCH')`
- Wired in `schema.ts` post-init migrations section (called after all tables created)
- Idempotent: standard guard `IS NULL OR = -3` skips already-migrated rows

**Key findings:**
- No `migrations/` folder exists. Pattern = TS functions in `seedWatchlist.ts` + post-init block in `schema.ts`
- HIGH_VOL_TICKERS not in WATCHLIST_SEED — they may be in prod DB as custom additions
- `alert_rise_pct` default is already correct (5) — no migration needed
- Negative sign convention confirmed: `-7.0` and `-9.0`

**Tests:** 10 new in `1869b-seed-watchlist-thresholds.test.ts` — AC1-AC6 + full 25+7 scenario. All pass.

**Counts:** 9153 pass / 16 fail (16 pre-existing). SHA 44d5bf2c. 3 files touched.

---

### Task 1869b — Wire watchlistThresholds into scanMarket (2026-05-11, DONE)

**Problem:** `detectSignals(snapshot)` — no second argument. `volatilityCalculator.ts` produced thresholds, `signalDetector.ts` accepted them, but `scanMarket.ts` never passed them. Dead wiring since Task 133.

**Fix:**
1. `IWatchlistRepository`: added `WatchlistThresholds` interface + `getThresholds(): Map<string, WatchlistThresholds>` port method
2. `SqliteWatchlistRepository`: implemented `getThresholds()` — `SELECT code, alert_drop_pct, alert_rise_pct FROM watchlist WHERE alert_drop_pct IS NOT NULL AND alert_rise_pct IS NOT NULL`
3. `scanMarket.ts`: Step 1b loads threshold map; per-stock loop builds `SignalContext` with `watchlistThresholds` when present; calls `detectSignals(snapshot, signalContext)`
4. `1076` test: `addWatchlistEntry` now inserts explicit `alert_drop_pct=-7` — schema DEFAULT was `-3` (not `-7`), which conflicted with the "3% is noise" assertion

**Tests:** 10 new in `1869b-watchlist-threshold-wiring.test.ts` (4 unit, 4 integration)
- NVL (threshold=-9) silent on -7.5% drop
- VCB (threshold=-7) fires on -7.5% drop
- Two-stock selective alerting
- watchlistThresholds priority over volatility

**Counts:** 9148 pass / 11 fail. SHA dbefc47c. 5 files touched.

**Next:** 1869b-seed — DB migration to populate stock-tier defaults (standard=7%, high-vol=9%)

---

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

### Task 1876a-A1 — alertAccuracy precision denominator fix (2026-05-11 UTC, DONE)

**Problem:** Top-level Tổng precision used `hits / totalAlerts`, including UNKNOWN rows in denominator. Understated real precision. Example: 1 HIT, 3 MISS, 10 UNKNOWN → showed 7% instead of 25%.

**Fix:** Changed L340 to `hits / (hits + misses)` with divide-by-zero guard (scoreable=0 → 0%). Matches per-type formula at L369. 4 LOC change.

**Test:** `src/__tests__/1876a-precision-denominator.test.ts` — 2 cases, both pass.

**Commit:** `6d1ad3af`
