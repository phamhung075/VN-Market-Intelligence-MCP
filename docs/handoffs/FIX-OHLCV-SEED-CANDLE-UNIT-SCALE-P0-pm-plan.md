---
id: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-pm-plan
version: "2026-06-16"
authored_by: pm
status: READY_FOR_DISPATCH
zone: apps/mcp-server/
task_ref: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
architect_design: docs/handoffs/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-architect-design.md
ba_spec: docs/handoffs/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-BA-spec.md
---

# [PM] Atomized Subtasks + Dispatch Plan
# FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0

---

## PLANNING NOTES

**Source:** Architect §9 (Implementation Order for PM) proposes 7 subtasks: skeleton → Writer D → Writer A → sanity job extend → cron config → repair script → regression guard.

**Sequencing constraint:** Subtasks 1→2→3 sequential (ohlcvWriteService SSOT chokepoint dependency). Subtasks 4, 5, 6 can run parallel to 2/3 (disjoint files). Subtask 7 is final gating.

**WIP enforcement:** max 2 coding lanes active. Dispatch follows: SUBTASK-1 (CODING) → wait for first win → SUBTASK-2 (CODING) + one of {4,5,6} (CODING parallel) → continue pattern.

**Urgency note:** SUBTASK-6 (repair script) is a live-corruption mitigation that can ship/run independently ahead of the code fix to self-heal RSI/MARKET today (architect Option D confirmed consumer-safe). Flagged for fast-track decision.

---

## SUBTASK CATALOG

### SUBTASK-1: ohlcvWriteService Skeleton
**Owner:** dev-mcp-server  
**File scope:** `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` (new file)  
**Depends on:** None  
**Parallel with:** None (blocking for 2 and 3)  
**Sequencing:** FIRST  

**Title:** Create ohlcvWriteService application-layer choke-point with prevClose fetch and guards  

**Description:**  
Introduce the single authoritative OHLCV upsert entry point per architect §4.2. This service owns prevClose batch fetch, normalizeOhlcvToVnd call, detectAndNormalizeScaleFromPrevClose with DB-sourced prevClose, seed-bar rejection (FR-S1), validateOhlcvUnit final guard, and atomic SQL upsert.

**Files created:**
- `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` — new

**Implementation checklist:**
- [ ] Export interface `OhlcvWriteRow` (code, date, open, high, low, close, volume, type, dataEnv)
- [ ] Export interface `OhlcvWriteResult` (written, skipped, rejected array)
- [ ] Export async fn `writeOhlcvBatch(rows, db, options?)` signature per architect design
- [ ] Implement prevClose batched fetch query (INNER JOIN max-date pattern per architect §2.2)
- [ ] Implement prevCloseMap indexing (Map<code, number>)
- [ ] Implement per-row pipeline: seed-bar filter (FR-S1) → normalizeOhlcvToVnd → detectAndNormalizeScaleFromPrevClose with prevCloseMap.get → validateOhlcvUnit → collect results
- [ ] Log DEBUG for skipped seed-bars; log ERROR for rejected rows
- [ ] Return OhlcvWriteResult with count totals and rejection details
- [ ] Add `conflictStrategy` parameter ('backfill' vs 'intraday') for Writer-specific SQL behavior
- [ ] Preserve canonical UPSERT SQL from existing writers (no SQL semantics change for this task — just plumbing through the service)

**Tests (in SUBTASK-7):**
- AC-T6: prevCloseMap correctly restores VHM=136100 from DB; input 136.1 normalized to 136100 before upsert
- AC-T4 (unit-level): seed-bar filter rejects flat O=H=L=C + vol=0 + date>=today rows

**Acceptance:**
- [ ] Interface matches architect specification (no API changes later)
- [ ] Service builds cleanly (tsc)
- [ ] All unit-level tests pass (AC-T6, AC-T4 unit subset)
- [ ] No imports from Writers (A/C/D/E) — only domain/services + infrastructure/db

**Estimated size:** 150–180 lines (service + tests in SUBTASK-7 registry)

---

### SUBTASK-2: taOhlcvBackfillJob Migration
**Owner:** dev-mcp-server  
**File scope:** `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts`  
**Depends on:** SUBTASK-1 (ohlcvWriteService must exist)  
**Parallel with:** SUBTASK-4, SUBTASK-5, SUBTASK-6 (after SUBTASK-1 done)  
**Sequencing:** SECOND  

**Title:** Wire Writer D (taOhlcvBackfillJob) to ohlcvWriteService; remove local insertMany; seed prevClose from DB  

**Description:**  
Replace the existing `insertMany` transaction loop with a call to `writeOhlcvBatch(conflictStrategy='backfill')`. Emit prevClose batch query result to seed the service. Remove the local prevClose=0 initialization and insertMany closure.

**Files modified:**
- `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts`

**Implementation checklist:**
- [ ] Import `writeOhlcvBatch` from ohlcvWriteService
- [ ] Locate current `insertMany` transaction (architect notes L247–342)
- [ ] Extract the existing watchlist ticker loop and VNDIRECT fetch into a per-ticker-batch builder
- [ ] Build rows array from VNDIRECT response (no local normalization/guard logic — defer to writeOhlcvBatch)
- [ ] Call `writeOhlcvBatch(rows, db, { vnToday: toDate, conflictStrategy: 'backfill' })`
- [ ] Log the result: `written`, `skipped`, rejected row count
- [ ] Remove old insertMany, TICKER_COVERAGE_SQL skip gate, local prevClose=0 initialization
- [ ] Keep VNDIRECT fetch + response parsing — only the write+guard logic moves to service
- [ ] Ensure FR-S1 seed-bar filter is delegated to writeOhlcvBatch (not replicated here)
- [ ] Add code comment referencing FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 and BA decision FR-W1/FR-S1

**Tests (in SUBTASK-7):**
- AC-T1: Guard rejects ÷1000 corrupt (VHM 136.1 with prior 136100 → rejected or normalized)
- AC-T2: ×1000 group rejection (AAA seed 7.26 skipped by FR-S1)
- AC-T4: Full integration test (mock VNDIRECT response → no row written for today+flat+vol=0)

**Acceptance:**
- [ ] Job still executes cron schedule unchanged (01:30 UTC)
- [ ] Watchlist tickers still processed (no coverage gate regression)
- [ ] Tests AC-T1, AC-T2, AC-T4 pass
- [ ] Existing backfill workflow (real-date historical rows) still works
- [ ] tsc clean; no new type errors

**Estimated size:** 80–120 lines (refactor + cleanup)

---

### SUBTASK-3: pushPricesHandler Migration (Writer A OHLCV path)
**Owner:** dev-mcp-server  
**File scope:** `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts`  
**Depends on:** SUBTASK-1 (ohlcvWriteService must exist); SUBTASK-2 preferred first (for sequential safety)  
**Parallel with:** SUBTASK-4, SUBTASK-5, SUBTASK-6 (after SUBTASK-2 done)  
**Sequencing:** THIRD  

**Title:** Wire Writer A (pushPricesHandler) OHLCV upsert to ohlcvWriteService; preserve intraday conflict semantics  

**Description:**  
Refactor the OHLCV upsert loop in pushPricesHandler to call `writeOhlcvBatch(conflictStrategy='intraday')`. Preserve the three conflict special-cases: accumulate-high / self-heal-open / protected-low (architect R-2 HIGH risk). The service must support a `conflictStrategy` parameter that switches between Writer D's overwrite-all semantics ('backfill') and Writer A's merge/accumulate semantics ('intraday').

**Files modified:**
- `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts`

**Implementation checklist:**
- [ ] Locate current OHLCV upsert loop (architect notes references ON CONFLICT clauses)
- [ ] Extract rows from the prices batch into OhlcvWriteRow array
- [ ] Apply `p.price * 1000` unit scaling (keep the existing scaling logic pre-service, as the service receives already-scaled data from this path)
- [ ] Call `writeOhlcvBatch(rows, db, { conflictStrategy: 'intraday' })`
- [ ] In ohlcvWriteService, implement `conflictStrategy='intraday'` branch:
  - high = MAX(existing.high, new.high)
  - low = CASE WHEN existing.low=0 THEN new.low ELSE MIN(existing.low, new.low)
  - open = CASE WHEN existing.open<100 THEN new.open ELSE existing.open
  - close = new.close
  - volume = COALESCE(new.volume, 0)
- [ ] Ensure these conflict clauses are ONLY applied in 'intraday' mode (architect R-2 validation critical)
- [ ] Remove old OHLCV upsert loop code
- [ ] Log result: written, skipped, rejected count
- [ ] Add code comment referencing FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 and Writer A contract (accumulate-high, etc.)

**Tests (in SUBTASK-7):**
- AC-T7: conflictStrategy='intraday' preserves accumulate-high and self-heal-open semantics (e.g., multiple pushes for same ticker/date: high only increases, low protected when 0)
- Regression: existing pushPricesHandler tests remain green

**Acceptance:**
- [ ] VPS push flow unchanged externally (input/output same)
- [ ] AC-T7 passes: conflict semantics verified
- [ ] All existing pushPricesHandler tests pass (regression guard)
- [ ] tsc clean; no new type errors
- [ ] Manual smoke: push 3 prices for VHM on same date, high increases and low protected per intraday rules

**Estimated size:** 100–150 lines (refactor + conflict logic in service + tests in SUBTASK-7)

---

### SUBTASK-4: ohlcvSanityCheckJob Extension
**Owner:** dev-mcp-server  
**File scope:** `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts`  
**Depends on:** None (independent from 1–3)  
**Parallel with:** SUBTASK-2/3 (after SUBTASK-1 done if sequencing enforced)  
**Sequencing:** PARALLEL to 2/3 (can start after SUBTASK-1 complete)  

**Title:** Extend ohlcvSanityCheckJob with FR-G2 (cross-day scale check) and FR-G3 (synthetic seed flag)  

**Description:**  
Add cross-day scale ratio validation (FR-G2) to detect both ÷1000 and ×1000 mismatch classes. Add synthetic seed bar detection (FR-G3) to flag rows where O=H=L=C and volume=0 for dates >= today.

**Files modified:**
- `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts`

**Implementation checklist:**
- [ ] Extend existing scan loop to fetch prevClose for each row (per-row lookup or batch fetch before loop)
- [ ] Add FR-G2 check: `ABS(close / prevClose - 1.0) > 0.5 AND (close/prevClose > 500 OR close/prevClose < 0.002)` → flag scale_mismatch_vs_prior
- [ ] Add FR-G3 check: `open=high AND high=low AND low=close AND volume=0 AND date >= VN_TODAY` → flag synthetic_seed_bar
- [ ] Log both check types at ERROR level (per NFR-1 fail-loud)
- [ ] Append flags to the hit log (existing pattern: hitCount, hits[], etc.)
- [ ] Send BUG telegram with the flagged row details + check type
- [ ] Existing validateOhlcvUnit check (intra-row guard) remains active

**Tests (in SUBTASK-7):**
- AC-T3: Cross-day scale mismatch detection (VHM yesterday=136100, today=136.1, volume=0 → hits scale_mismatch_vs_prior)
- AC-T3 variant: synthetic seed bar detection (VHM today O=H=L=C=whatever, volume=0 → hits synthetic_seed_bar)

**Acceptance:**
- [ ] Cron schedule unchanged (15:05 UTC main run; FR-G4 early run is separate in SUBTASK-5)
- [ ] AC-T3 test passes for both scale and seed checks
- [ ] Existing CONTAM-5/7 tests still pass (regression guard AC-T5)
- [ ] BUG telegram sends correctly for flagged rows
- [ ] tsc clean

**Estimated size:** 90–130 lines (new check logic + tests in SUBTASK-7)

---

### SUBTASK-5: cronConfig FR-G4 (Early Sanity Check Cron)
**Owner:** dev-mcp-server  
**File scope:** `apps/mcp-server/src/scheduler/cronConfig.ts`  
**Depends on:** None (independent; can run parallel to 2/3)  
**Parallel with:** SUBTASK-4/6 (after SUBTASK-1 complete if sequencing enforced)  
**Sequencing:** PARALLEL to 2/3 (disjoint file scope)  

**Title:** Add FR-G4 early ohlcvSanityCheck cron at 00:45 UTC (pre-briefing catch)  

**Description:**  
Add a second ohlcvSanityCheck cron trigger at 00:45 UTC (15 minutes before taOhlcvBackfillJob at 01:30 UTC, and before morning briefing at 01:00 UTC). This is a config-only change (one new key, one env var). No new job class needed — reuse existing runOhlcvSanityCheck.

**Files modified:**
- `apps/mcp-server/src/scheduler/cronConfig.ts`

**Implementation checklist:**
- [ ] Add new key to cronConfig object: `ohlcvSanityCheckEarly: Bun.env.CRON_OHLCV_SANITY_CHECK_EARLY ?? '45 0 * * 1-5'`
- [ ] Add inline comment: `/** ohlcvSanityCheckEarly — pre-briefing scan at 00:45 UTC Mon-Fri (FR-G4, FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0). Catches synthetic seed bars before morning briefing. */`
- [ ] Wire scheduler to handle this key (wherever CRONS is consumed to register job handlers): add handler pointing to runOhlcvSanityCheck
- [ ] Verify no cron collision at 00:45 UTC (architect confirms R-5 safe)
- [ ] Add env var to `.env.example`: `CRON_OHLCV_SANITY_CHECK_EARLY='45 0 * * 1-5'`

**Tests:** None required (config-only change; integration tested in SUBTASK-4 via cron execution)

**Acceptance:**
- [ ] cronConfig builds cleanly (tsc)
- [ ] Env var loading works (Bun.env.CRON_OHLCV_SANITY_CHECK_EARLY reads correctly)
- [ ] Scheduler wire-up is verified (cron job executes at 00:45 UTC in live container)
- [ ] No cron collision or duplicate execution

**Estimated size:** 10–20 lines (config + comment)

---

### SUBTASK-6: Repair Script (Live Corruption Mitigation)
**Owner:** dev-mcp-server  
**File scope:** `scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts` (new file)  
**Depends on:** None (independent; can ship standalone)  
**Parallel with:** SUBTASK-4/5 (after SUBTASK-1 complete if sequencing enforced)  
**Sequencing:** PARALLEL to 2/3; **INDEPENDENTLY SHIPPABLE** (can run NOW before code fix)  

**Title:** Idempotent repair script: DELETE synthetic seed rows for 2026-06-16  

**Description:**  
One-shot cleanup script targeting the known corrupt date. Fingerprint-scoped WHERE clause per BA spec (architect §3.2). No per-ticker hardcode; safe against future real data writes for today. Can be executed immediately via `docker exec mcp-server bun scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts` to self-heal live RSI/MARKET channel today (architect Option D consumer-safe verdict).

**Files created:**
- `scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts` (new file)

**Implementation checklist:**
- [ ] Import sqlite driver (same as infrastructure/db)
- [ ] Open named-volume DB (path from env or hardcoded pattern: `/data/market.db` or equivalent)
- [ ] Execute DELETE with exact WHERE clause per BA spec:
  ```sql
  DELETE FROM daily_ohlcv
  WHERE date = '2026-06-16'
    AND volume = 0
    AND open = high
    AND high = low
    AND low = close
    AND data_env IS NULL;
  ```
- [ ] Capture DELETE count from stmt.changes or equivalent
- [ ] Log to stdout: `[REPAIR] Deleted <count> synthetic seed rows from daily_ohlcv for 2026-06-16`
- [ ] Idempotent guarantee: running twice deletes 0 rows on second run (WHERE matches 0 rows), no error
- [ ] Exit code 0 on success; handle errors gracefully (log, exit 1 if DB inaccessible)
- [ ] Add script to `docs/agents/dev-mcp-server/flow/main.md` as a pointer reference (per dev-standards.md § Script Persistence)

**Tests (in SUBTASK-7):**
- AC-T8: Idempotent execution (run twice on same DB state → first deletes N rows, second deletes 0 rows, both exit 0)
- Manual smoke: run on live named-volume DB, verify COUNT before/after

**Acceptance:**
- [ ] Script executes without error
- [ ] Correct rows deleted (fingerprint match)
- [ ] Safe against false positives (only matches the synthetic seed class)
- [ ] Idempotent; safe to re-run
- [ ] Documented in flow doc with pointer

**Estimated size:** 40–60 lines (script + error handling)

**FAST-TRACK DECISION:**  
**YES — SUBTASK-6 can ship independently NOW, before SUBTASK-1–5 complete.** Architect confirmed Option D is consumer-safe (no hard dependency on today's row). Running this repair script immediately:
1. Removes all 1203 synthetic seed rows (exact fingerprint match)
2. Allows RSI/TA to self-heal via prior real close (AC-L2/L3 verified)
3. Stops the false "giá 0 dưới BB" alerts from poisoning MARKET channel today
4. Requires zero coordination with code changes (repair is standalone idempotent DELETE)

**Recommendation:** Route SUBTASK-6 to dev-mcp-server for immediate execution (can run within 15 min), while SUBTASK-1–5 proceed in parallel coding lanes. Router can dispatch this as urgent/fast-track after PM plan approval.

---

### SUBTASK-7: Regression Guard Test Suite
**Owner:** dev-mcp-server  
**File scope:** `apps/mcp-server/src/__tests__/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts` (new file)  
**Depends on:** SUBTASK-1/2/3/4 (all code changes must land before final tests)  
**Parallel with:** None (final gating step)  
**Sequencing:** LAST (after all code subtasks complete)  

**Title:** Regression guard: AC-T1–T8 test suite verifying fix completeness  

**Description:**  
Implement all acceptance-criteria tests (AC-T1 through AC-T8 per BA spec §5.2 and architect §8). Uses in-memory SQLite per existing CONTAM-5/7 pattern. All five BA-spec tests (AC-T1–T5) plus three architect-required tests (AC-T6–T8).

**Files created:**
- `apps/mcp-server/src/__tests__/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts` (new file)

**Implementation checklist:**
- [ ] Seed in-memory DB with schema matching production daily_ohlcv
- [ ] **AC-T1:** Guard rejects ÷1000 corrupt candle (VHM seed 136.1 with prior close 136100 → rejected or normalized to 136100)
- [ ] **AC-T2:** Guard rejects ×1000 corrupt candle (AAA seed 7.26 with prior close 7260 → skipped by FR-S1 or normalized)
- [ ] **AC-T3:** Sanity check flags cross-day scale mismatch (VHM yesterday=136100, today=136.1 vol=0 → detected by FR-G2 OR seed-bar flag by FR-G3)
- [ ] **AC-T4:** taOhlcvBackfillJob skips synthetic seed (VNDIRECT mock with today+flat+vol=0 → no row in DB post-call)
- [ ] **AC-T5:** Existing CONTAM-5/7 tests remain GREEN (regression guard for existing contamination checks)
- [ ] **AC-T6:** writeOhlcvBatch with prevCloseMap correctly normalizes (prevClose=136100 in map; input 136.1 → normalized to 136100 before upsert)
- [ ] **AC-T7:** conflictStrategy='intraday' preserves accumulate-high and self-heal-open semantics (multiple pushes same ticker/date: high only increases, low protected when 0)
- [ ] **AC-T8:** Repair script is idempotent (run twice → first deletes N, second deletes 0, both succeed)

**Integration checklist:**
- [ ] All tests use setup.ts preload pattern (no named-volume, no network)
- [ ] Mock VNDIRECT responses as needed
- [ ] Mock VPS push inputs as needed
- [ ] Verify DB state post-operation via direct query (not badge)
- [ ] Log test names and results clearly

**Acceptance:**
- [ ] All AC-T1–T8 tests pass
- [ ] tsc clean (no type errors)
- [ ] CI/CD full suite passes (regression on existing tests confirmed via AC-T5)
- [ ] Code coverage ≥ 85% for new writeOhlcvBatch paths

**Estimated size:** 280–350 lines (8 tests with setup, mocks, assertions)

---

## DISPATCH STRATEGY (WIP ≤ 2)

### Wave 1: Foundation + First Parallel (WIP = 2 active)
1. **DISPATCH → dev-mcp-server:** SUBTASK-1 (ohlcvWriteService skeleton) [CODING]
2. **Immediate:** DISPATCH → dev-mcp-server: SUBTASK-6 (repair script) [FAST-TRACK, can execute independently] [CODING]

**Wait for:** SUBTASK-1 completion (or at least ohlcvWriteService interface stable).

### Wave 2: Writer Migrations Sequential (WIP = 2 active)
3. **After SUBTASK-1 done:** DISPATCH → dev-mcp-server: SUBTASK-2 (Writer D migration) [CODING]
4. **After SUBTASK-2 done:** DISPATCH → dev-mcp-server: SUBTASK-3 (Writer A migration) [CODING]

### Wave 3: Guard + Config Parallel (WIP = 2 active)
5. **After SUBTASK-1 done:** DISPATCH → dev-mcp-server: SUBTASK-4 (sanity job extend) [CODING]
   **AND DISPATCH → dev-mcp-server:** SUBTASK-5 (cron config) [CODING]

**Wait for:** SUBTASK-4 + SUBTASK-5 complete (+ SUBTASK-2/3).

### Wave 4: Final Gating (WIP = 1)
6. **After SUBTASK-1/2/3/4/5 done:** DISPATCH → dev-mcp-server: SUBTASK-7 (test suite) [TESTING + VERIFICATION]

**Gating:** All AC-T1–T8 must pass before PO marks task done_verified.

---

## DEPENDENCY GRAPH

```
SUBTASK-1 (ohlcvWriteService)
  ├─ SUBTASK-2 (Writer D migration) → SUBTASK-3 (Writer A migration)
  ├─ SUBTASK-4 (sanity job extend) [parallel]
  ├─ SUBTASK-5 (cron config) [parallel]
  └─ SUBTASK-6 (repair script) [parallel, fast-track]

After all 1–6 complete:
  └─ SUBTASK-7 (regression test suite)
```

---

## SUBTASK SUMMARY TABLE

| ID | Title | Owner | Files | Depends | Parallel | Size | Fast-Track? |
|---|---|---|---|---|---|---|---|
| 1 | ohlcvWriteService skeleton | dev-mcp-server | usecases/ohlcvWriteService.ts | None | — | 150–180L | No |
| 2 | taOhlcvBackfillJob migration | dev-mcp-server | scheduler/.../taOhlcvBackfillJob.ts | SUBTASK-1 | — | 80–120L | No |
| 3 | pushPricesHandler migration | dev-mcp-server | interface/.../pushPricesHandler.ts | SUBTASK-1; prefer 2 first | — | 100–150L | No |
| 4 | ohlcvSanityCheckJob extension | dev-mcp-server | scheduler/.../ohlcvSanityCheckJob.ts | None (after 1) | 2/3 | 90–130L | No |
| 5 | cronConfig FR-G4 | dev-mcp-server | scheduler/cronConfig.ts | None (after 1) | 2/3 | 10–20L | No |
| 6 | Repair script | dev-mcp-server | scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts | None | 2/3 | 40–60L | **YES** |
| 7 | Regression test suite | dev-mcp-server | __tests__/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts | 1/2/3/4 | — | 280–350L | No |

---

## RISKS & MITIGATIONS

### R1: SUBTASK-1 Interface Churn
**Risk:** ohlcvWriteService interface unstable; SUBTASK-2/3 must iterate.  
**Mitigation:** Architect design §4.2 specifies interface signature in detail. PM will verify signature is frozen before dispatching SUBTASK-2. Dev must NOT refactor service once Writers A/D migrate.

### R2: Writer A Conflict Semantics Lost
**Risk:** pushPricesHandler's accumulate-high / self-heal-open / protected-low semantics incorrectly ported into conflictStrategy='intraday'.  
**Mitigation:** Architect R-2 (HIGH risk) flags this explicitly. PM includes explicit SQL verification step in SUBTASK-3 AC: each conflict rule manually tested (AC-T7 covers this).

### R3: Repair Script Over-Deletes
**Risk:** WHERE clause fingerprint too broad; deletes real intraday rows (volume > 0).  
**Mitigation:** BA spec §4.2 / architect §3.2 confirms WHERE clause is safe (volume=0 + flat OHLC is synthetic-only). Repair script test AC-T8 verifies idempotency; manual smoke test on live DB before execution.

### R4: prevCloseMap Same-Day Seed Writes
**Risk:** If taOhlcvBackfillJob re-runs AFTER a seed row is written (before fix deploys), prevCloseMap batch query excludes today's flat row (volume=0) and returns yesterday's close — self-consistent but hidden dependency.  
**Mitigation:** Architect R-3 (MEDIUM) confirms this is safe. The fix is self-consistent; no action needed. Document as code comment in SUBTASK-2.

### R5: Cron Collision at 00:45 UTC
**Risk:** SUBTASK-5 adds ohlcvSanityCheckEarly at 00:45 UTC; collision with existing job.  
**Mitigation:** Architect R-5 confirms no occupied slot. cronConfig.ts scan + manual verification in SUBTASK-5 AC.

### R6: data_env IS NULL Fingerprint Stability
**Risk:** Future writer sets data_env on rows; repair script WHERE clause becomes Writer D only, and is no longer generic.  
**Mitigation:** Architect R-6 confirms stable for repair's one-shot use. Follow-on cleanup (Writer D sets data_env) is out of P0 scope.

---

## ACCEPTANCE GATES

### Gate 1: SUBTASK-1 Complete
- [ ] ohlcvWriteService interface matches architect spec (no changes later)
- [ ] Service builds (tsc clean)
- [ ] Unit tests AC-T6, AC-T4 (unit-level) pass

### Gate 2: SUBTASK-2 Complete
- [ ] taOhlcvBackfillJob refactored; insertMany removed
- [ ] Cron schedule unchanged (01:30 UTC)
- [ ] Integration tests AC-T1, AC-T2, AC-T4 pass
- [ ] Existing tests pass (regression)

### Gate 3: SUBTASK-3 Complete
- [ ] pushPricesHandler refactored; conflict semantics verified
- [ ] AC-T7 passes (intraday conflict rules preserved)
- [ ] Existing tests pass (regression)

### Gate 4: SUBTASK-4 Complete
- [ ] ohlcvSanityCheckJob extended with FR-G2/G3
- [ ] AC-T3 passes (scale mismatch + seed flag detection)
- [ ] BUG telegram sends correctly
- [ ] Existing tests pass (AC-T5 CONTAM-5/7 regression guard)

### Gate 5: SUBTASK-5 Complete
- [ ] cronConfig has ohlcvSanityCheckEarly key
- [ ] Env var loads; scheduler wire-up verified
- [ ] Cron executes at 00:45 UTC in live container

### Gate 6: SUBTASK-6 Complete (FAST-TRACK)
- [ ] Repair script executes on live DB
- [ ] Correct row count deleted (fingerprint match)
- [ ] Idempotent (AC-T8 verified)
- [ ] Documented in flow doc

### Gate 7 (FINAL): SUBTASK-7 Complete
- [ ] All AC-T1–T8 tests pass
- [ ] tsc clean
- [ ] Full CI suite passes (no regressions)
- [ ] Code coverage ≥ 85% for new paths

### LIVE Gate (before done_verified)
- [ ] AC-L1 through AC-L6 verified on live container (BA spec §5.1)
  - No synthetic seed rows remain (AC-L1)
  - RSI restored for ÷1000 group (AC-L2)
  - RSI restored for ×1000 group (AC-L3)
  - No false "giá 0 dưới BB" alerts (AC-L4)
  - No new synthetic seeds written post-fix (AC-L5/L6)

---

## RETURN

**PLAN_DOC:** docs/handoffs/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-pm-plan.md (this file)

**SUBTASKS:** 7 atomic tasks, architect-proposed sequencing (1→2→3 sequential; 4/5/6 parallel to 2/3; 7 final gating)

**DISPATCH_ORDER (WIP ≤ 2):**
1. SUBTASK-1 [CODING] + SUBTASK-6 fast-track [CODING]
2. SUBTASK-2 [CODING] (after SUBTASK-1 done)
3. SUBTASK-3 [CODING] (after SUBTASK-2 done)
4. SUBTASK-4 [CODING] + SUBTASK-5 [CODING] (after SUBTASK-1 done, parallel to 2/3)
5. SUBTASK-7 [TESTING] (after all code subtasks 1–5 complete)

**FASTTRACK:** SUBTASK-6 (repair script) is **independently shippable NOW** — can execute immediately via `docker exec mcp-server bun scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts` to self-heal live RSI/MARKET today (zero coordination with code fix). Architect confirmed Option D consumer-safe. **Recommend:** dispatch as urgent/fast-track alongside SUBTASK-1 for immediate live mitigation.

**FIRST_DEV_SUBTASK:** SUBTASK-1 (ohlcvWriteService skeleton) must deploy first (blocking dependency for Writers A and D). Then SUBTASK-6 can execute independently for immediate repair.

**RISKS:**
- R1 (SUBTASK-1 interface churn): mitigate via frozen spec + no refactor after SUBTASK-2 dispatch
- R2 (Writer A conflict semantics): architect R-2 HIGH; explicit AC-T7 verification required
- R3 (repair script over-deletes): fingerprint safe; idempotent test AC-T8 confirms
- R4 (same-day seed re-run): self-consistent per architect R-3; document in code
- R5 (cron collision): architect confirms safe; SUBTASK-5 AC verifies no collision
- R6 (data_env NULL stability): stable for one-shot repair; follow-on cleanup out of scope

---

## COMPLETION CRITERIA (for PO done_verified gate)

1. All 7 SUBTASK acceptance gates pass ✓
2. All AC-L1–L6 LIVE gates verified on live container ✓
3. tsc clean; no new type errors ✓
4. Full CI suite passes (no regressions) ✓
5. Code coverage ≥ 85% for new paths ✓
6. SUBTASK-6 repair has deleted synthetic seed rows + RSI healed ✓
7. No false "giá 0 dưới BB" alerts in MARKET post-repair ✓
8. dev-mcp-server can mark task DONE (flow doc pointer added for repair script) ✓

---

## Scan Clean: true
All 7 subtasks fit within `apps/mcp-server/` zone. No cross-zone conflicts. No SSOT writes. Dev-mcp-server is sole owner. Sequencing enforces WIP ≤ 2. Ready for dispatch.

---

**STATUS:** READY_FOR_DISPATCH

**NEXT:** Router → PO approval → dispatch Wave 1 (SUBTASK-1 + SUBTASK-6 fast-track) to dev-mcp-server.
