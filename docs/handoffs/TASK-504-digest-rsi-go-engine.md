---
sprint: 504
branch: task/504-digest-rsi-go-engine
size: M
zone: apps/mcp-server/
depends_on: [503]
blocks: []
---

## TLDR

Refactor `defaultComputeTa()` in `apps/mcp-server/src/application/usecases/assembleBriefing.ts` to use the Go `computeTAIndicators` service as the sole RSI engine (matching the alert path), align the candle window to the date-based query (no LIMIT 60), raise the min-candle gate to 35, remove the `market_prices_history` synthetic fallback, make the function async, update all callers to await, and add stub-bar guard validation. Tests must verify RSI agreement between alert path and digest path for identical tickers. Rebuild required.

## [PM] Planning Context

**Zone:** `apps/mcp-server/`

**Acceptance Criteria:**
- [ ] `defaultComputeTa()` in `assembleBriefing.ts` refactored to:
  - [ ] Call `computeTAIndicators` (Go service client, same as `taAlertScanJob`) instead of TS-local `computeRSILocal`
  - [ ] Query candles via `daily_ohlcv WHERE date >= date('now', '-60 days') ORDER BY date ASC` (no LIMIT 60)
  - [ ] Also SELECT `volume` in the candle query (currently only `date, close`)
  - [ ] Min-candle gate raised from `< 15` to `< 35` (matching `taAlertScanJob` MIN_CANDLES)
  - [ ] Stub-bar guard added: reject latest candle if `close <= 0 OR volume <= 0` before calling Go service
  - [ ] `market_prices_history` synthetic fallback block REMOVED entirely
  - [ ] Function signature made async: `async (code: string, db: Database) => Promise<TaSignal | null>`
  - [ ] Go service HTTP error handling: fail-closed (return null RSI) — DO NOT fall back to TS-local RSI

- [ ] All callers of `defaultComputeTa` / `computeTaFn` updated to await:
  - [ ] `assembleBriefing.ts` L~1198: update `const taFn = options.computeTaFn ?? defaultComputeTa` to accept async
  - [ ] `assembleBriefing.ts` per-ticker loop: change to `for...of` with `await taFn(code, db)` (NOT forEach)
  - [ ] `assembleEveningSummary.ts` L~594: update caller to `const taFn = options.computeTaFn ?? defaultComputeTa` accepting async
  - [ ] `assembleEveningSummary.ts` L~594–635 loop: change to `for...of` with `await taFn(code, db)`

- [ ] Extract constant (testability):
  - [ ] Extract candle SQL to named constant `BRIEFING_CANDLE_SQL` in `assembleBriefing.ts` (pattern: `daily_ohlcv WHERE date >= date('now', '-60 days') ORDER BY date ASC`)
  - [ ] Reuse `MIN_CANDLES = 35` constant or import from `taAlertScanJob`

- [ ] Keep TS-local implementations as dead-code candidates:
  - [ ] `computeRSILocal` and `computeMALocal` remain in code (do NOT delete) — other callers may reference them
  - [ ] Flag both as candidates for follow-on CLEAN task (PM will mint TASK-505 separately)
  - [ ] MA20 computation unaffected — keep `computeMALocal` wired as-is (MA20 is NOT part of dual-engine divergence)

- [ ] Tests updated:
  - [ ] Unit test: fixture ticker with 41 candles → `defaultComputeTa` returns same RSI to ≤0.1 as `computeTAIndicators` called directly with same closes array
  - [ ] Test fail-closed: ticker with 34 candles → returns `{rsi14: null}` (not a shallow RSI value)
  - [ ] Test synthetic-fallback removal: ticker with 0 daily_ohlcv rows → returns `{rsi14: null}` (no fallback to `market_prices_history`)
  - [ ] Update test mocks in `__tests__/assembleBriefing.test.ts` and `assembleEveningSummary.test.ts` to support async function signature

- [ ] **LIVE verification gate** (MUST PASS before DONE_VERIFIED):
  - [ ] Rebuild mcp-server docker image
  - [ ] In a real evening-cycle run, capture RSI value for a same ticker from both paths:
    - [ ] Alert path RSI: via `get_technical_indicators` (Go service call from `taAlertScanJob`)
    - [ ] Digest path RSI: from the evening JSON `taSummary.rsi14` (Go service call from `defaultComputeTa`)
  - [ ] Assert RSI values agree to ≤0.1 difference for ≥3 tickers
  - [ ] Verify candle array sent to Go service contains NO `market_prices_history` synthetic rows
  - [ ] Verify ticker with <35 candles shows `rsi14: null` in taSummary (fail-closed)

**Files to read first:**
- `apps/mcp-server/src/application/usecases/assembleBriefing.ts` (lines ~659–701 defaultComputeTa, ~1190–1210 callers)
- `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` (lines ~594–635 taFn usage)
- `apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts` (CANDLE_SQL pattern, MIN_CANDLES, stub-bar guard lines 199–203)
- `apps/mcp-server/src/infrastructure/microservices/clients.ts` (computeTAIndicators HTTP client)
- `docs/standards/ta-engine-contract.md` (contract doc written in TASK-503)
- `docs/architecture-briefs/2026-06-21-digest-rsi-dual-engine-diverge.md` (§Zone B, Risk Flags, Subtask Decomposition)

**Files to create:**
- None (refactor existing files only)

**Files to modify:**
- `apps/mcp-server/src/application/usecases/assembleBriefing.ts` (lines ~659–701 and callers)
- `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` (lines ~594–635)
- `apps/mcp-server/src/__tests__/assembleBriefing.test.ts` (mock updates)
- `apps/mcp-server/src/__tests__/assembleEveningSummary.test.ts` (mock updates, if exists)

**Dependencies:**
- Blocks: None
- Blocked by: TASK-503 (contract doc must be available before implementation)

**Knowledge needed:**
- `docs/policies/dev-standards.md` — commit discipline, branch naming
- `docs/architecture-briefs/2026-06-21-digest-rsi-dual-engine-diverge.md` — full fix context and risk analysis
- `docs/standards/ta-engine-contract.md` — Go service contract (output of TASK-503)
- Go service client patterns (already in use in taAlertScanJob.ts)

## Risk Flags (from Architect)

1. **RISK-1: Async propagation** — `defaultComputeTa` becomes async; both callers must use `for...of` + `await`, not `forEach`. Check: `assembleEveningSummary.ts` L594–635 loop already uses synchronous `for...of` — just add `await`.

2. **RISK-2: Go service down** — acceptable fail-closed posture (same as alert path). Briefing shows "TA pending" — honest gap, consistent behavior.

3. **RISK-3: Test mocks** — existing mocks inject `computeTaFn` as sync function. Must update to async mocks. Check `__tests__/` files for direct mock injection.

4. **RISK-4: Dead code post-fix** — `computeRSILocal` becomes unused post-fix. Do NOT delete in this task; PM will mint follow-on CLEAN task.

## Notes

**Why Go service as canonical:** The Go service is already the authoritative RSI engine in the alert path, is battle-tested, has explicit `ErrInsufficientData` contract, and eliminates synthetic fallback risk entirely.

**Why no LIMIT 60:** The date-window query is safer than LIMIT for variable-density tickers (illiquid may have <60 rows in 60 days, dense tickers may have >60). Mirrors the already-validated alert path.

**Why min-candle = 35:** Wilder warmup convergence (not 15) and consistency with alert path constant. The 15-candle gate was rationalized as "period + 1"; 35 is 2.5×period and is the defended rationale in the `FIX-ALERT-ENGINE-RSI-SINGLEDIGIT` fix.

**Verification gate rationale:** Unit tests alone are not sufficient. This fix must be verified in LIVE evening-cycle runs with real RSI comparisons between alert and digest paths — the same ticker must produce identical RSI from both engines.

