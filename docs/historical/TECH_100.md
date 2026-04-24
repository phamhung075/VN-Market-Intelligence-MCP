# TECH-100: fix predictionSignals always empty in evening reports

status: APPROVED_BY_ARCHITECT
req_ref: REQ-100

---

## Brownfield Impact

- Files modified:
  - `src/scheduler/predictionMarketJob.ts` — FR-4: replace bare `return` with cached-snapshot fallback
  - `src/application/usecases/assembleEveningSummary.ts` — FR-2: replace bare `catch` with `logger.warn`
- Files created:
  - `src/__tests__/1318-prediction-signals-evening.test.ts` — FR-3: TDD tests
- Files deleted: none
- Breaking changes: no

**No proxy infrastructure changes.** The BA implementation note for FR-1 confirms that `fetchPolymarkets` already externalises both API URLs through `PredictionMarketsConfig` (`clobApiUrl`, `gammaApiUrl`). The fix for the geo-block problem is FR-4 (fallback to cached snapshot), not a new VPS service. A separate ops task can update `mcp.config.json` URLs to route through VPS if live data refresh is ever required; that is out of scope here because the 83 cached rows are sufficient for signal detection right now.

---

## Architecture Decision

Three independent root causes converge on the same symptom. Each fix is surgical — no new modules, no new DB tables. The scheduler-layer fix (FR-4) decouples signal detection from fetch success so the job never exits the hot path empty-handed. The application-layer fix (FR-2) restores observability. The TDD file (FR-3) pins the contract end-to-end so regression is caught at test time, not in production reports.

The `loadPreviousSnapshot` helper already exists in `predictionMarketJob.ts` (lines 70–120). FR-4 re-uses it on the catch path — zero new infrastructure, zero new helpers.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| predictionMarketJob fallback | interface/scheduler | `src/scheduler/predictionMarketJob.ts` | MODIFY |
| assembleEveningSummary logger | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY |
| TDD test suite | application (test) | `src/__tests__/1318-prediction-signals-evening.test.ts` | NEW |

---

## Interface Contracts

No new interfaces. All contracts already exist.

### Change 1 — `predictionMarketJob.ts` lines 330–350 (Step 3: fetch current markets)

Replace:
```typescript
} catch (err) {
  logger.error("[prediction-market-job] fetchPolymarkets failed", {
    error: String(err),
  });
  return;   // BUG: exits here, never reaches detectPredictionSignals
}
```

With:
```typescript
} catch (err) {
  logger.warn("[prediction-market-job] fetchPolymarkets failed — falling back to cached snapshot", {
    error: String(err),
  });
  currentMarkets = loadPreviousSnapshot(db);
  // fallthrough: signal detection continues against cached data
}
```

Semantics: when `currentMarkets === previousMarkets` (same cached rows), `detectPredictionSignals` produces 0 volume-spike signals (correct — no new volume change detected) but still emits probability-shift signals for any unresolved high-probability positions in the cached data. Zero signals is a valid and safe outcome.

The `storeSnapshot` call at Step 5 is guarded by `markets.length === 0` and the subsequent early-return already exists there. With the fallback, `currentMarkets` is the cached snapshot (non-empty if 83 rows exist), so `storeSnapshot` runs a no-op upsert of the same data — idempotent, no side effects.

### Change 2 — `assembleEveningSummary.ts` lines 313–319 (Step 5: prediction signals)

Replace:
```typescript
} catch { /* best-effort */ }
```

With:
```typescript
} catch (err) {
  logger.warn("[assembleEveningSummary] prediction signals query failed", {
    error: err instanceof Error ? err.message : String(err),
  });
}
```

Graceful degradation is preserved: `predictionSignals` remains `[]` on failure. The change only adds visibility.

### TDD test file — `src/__tests__/1318-prediction-signals-evening.test.ts`

Four test cases required by AC-1 through AC-4. Seeding pattern mirrors `src/__tests__/1312-evening-summary-ta.test.ts` (in-memory SQLite, schema init, direct DB inserts).

```typescript
// Test case shape (developer fills in full implementation)

// TC-1 (AC-1): HIGH signal within 24h → assembleEveningSummary returns length >= 1
//   Seed: prediction_markets row + prediction_signals row with detected_at = now()
//         severity = 'high'
//   Assert: predictionSignals.length >= 1
//           predictionSignals[0].severity === 'high'
//           predictionSignals[0].question populated

// TC-2 (AC-2): signal older than 24h → predictionSignals === []
//   Seed: prediction_signals row with detected_at = 25h ago
//   Assert: predictionSignals.length === 0

// TC-3 (AC-3): getRecentPredictionSignals throws (drop table mid-run)
//   Seed: real db, then drop prediction_signals table before calling assembleEveningSummary
//   Assert: no exception propagates; predictionSignals === []
//   Assert: logger.warn was called (spy or mock)

// TC-4 (AC-4): predictionMarketJob fallback when fetchFn throws
//   Seed: db with 2 prediction_markets rows (cached snapshot)
//   Call: runPredictionMarketPoll({ db, enabled: true, fetchFn: async () => { throw new Error('geo-block') } })
//   Assert: no unhandled throw
//   Assert: storePredictionSignals path reached (verify via prediction_signals row count
//           OR verify detectPredictionSignals was called by injecting a spy signalConfig)
```

The test for TC-3 must spy on `logger.warn`. Use the same pattern as existing tests in this project (import `logger` and wrap with `jest.spyOn` / Bun mock equivalent).

---

## Task Breakdown (for PM)

Tasks already exist in TASKS.md as 1318 and 1319. Recommend splitting into three atomic commits on the shared branch `task/1318-1319-prediction-signals-evening`:

| Order | Task | File | Depends on |
|---|---|---|---|
| 1 | Write failing TDD tests (TC-1 to TC-4) | `1318-prediction-signals-evening.test.ts` | schema (exists) |
| 2 | Fix `assembleEveningSummary` catch block (FR-2) | `assembleEveningSummary.ts` | TC-3 test (order 1) |
| 3 | Fix `predictionMarketJob` fetch fallback (FR-4) | `predictionMarketJob.ts` | TC-4 test (order 1) |

Run order: write tests first (all fail) → apply fix 2 (TC-1, TC-2, TC-3 pass) → apply fix 3 (TC-4 passes).

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `loadPreviousSnapshot` returns empty list (DB has 0 rows) | Low | Low | `storeSnapshot` guards on `markets.length === 0`; `detectPredictionSignals` with empty inputs returns `[]` — safe no-op |
| `currentMarkets === previousMarkets` triggers duplicate signal IDs | Low | Low | `storePredictionSignals` uses `INSERT OR IGNORE`; deterministic ID includes minute-bucket so same cached data on same minute = no new insert |
| TC-3 logger spy fragile across Bun test versions | Medium | Low | Fall back to asserting `predictionSignals === []` only if spy setup is too complex; core safety guarantee is the no-throw behaviour |
| Fallback signals have stale `fetchedAt` timestamps | None | None | `fetchedAt` is display-only metadata; signal detection uses `yes_price`, `volume_24h` columns — staleness does not affect correctness |

---

## Security Review

- [ ] SQL parameterized? Yes — `loadPreviousSnapshot` and `storePredictionSignals` use `db.prepare` with `?` binding; no change to this pattern
- [ ] File paths validated (no `../`)? Yes — no new file I/O
- [ ] External HTTP rate-limited? Yes — `fetchPolymarkets` already uses `breakers.polymarket` circuit breaker; fallback path bypasses HTTP entirely
- [ ] Secrets via `Bun.env` only? Yes — no new secrets introduced
