---
sprint: S2-DATA-HONESTY
branch: task/MACRO-COMMODITY-DELTA-prev-close
size: M
zone: apps/macro-indicators/
depends_on: []
blocks: []
---

## TLDR

Wire a read-only commodity_prices_history adapter to the Go macro-indicators service to compute 18h-lookback oil/gold/usdVnd day-over-day deltas. 7 files within apps/macro-indicators/ (domain port, infra adapter + tests, app layer + tests, composition root); no shared SSOT touched. Architect design locked (§ BA Spec [Architect] section): 18h lookback / 36h stale bound; usdVnd delta suppressed on SBV override (same-source-only honesty); prevFetchedAt *string ISO for DTO provenance.

## [PM] Planning Context

**Zone:** apps/macro-indicators/ (Go service, single-team, no file conflicts, no shared SSOT)

**Acceptance Criteria (AC-1 through AC-7 from BA spec):**

- [ ] **AC-1 (delta computable):** `call_tool(server="vn-market", tool="get_macro_snapshot")` returns non-null `oilUsdDelta`, `goldUsdDelta`, `usdVndDelta` as signed floats when history is available. Example: `oilUsdDelta: -1.23` (Brent fell ~$1.23 vs prior session close)
- [ ] **AC-2 (direction correct):** `oilUsdDirection`, `goldUsdDirection`, `usdVndDirection` are one of `"up"`, `"down"`, `"flat"` (not `"unknown"`) when prior row exists; direction agrees with delta sign (positive → "up", negative → "down", |delta/current| < 0.1% → "flat")
- [ ] **AC-3 (honesty when no prior):** If `commodity_prices_history` has no row older than 18h (fresh DB or history not yet populated), return `null` / `"unknown"` — NOT a zero-delta; `prevFetchedAt` is null
- [ ] **AC-4 (prevFetchedAt stamped):** When a real prior is found, `prevFetchedAt` is a non-null ISO8601 UTC string matching the `fetched_at` of the row used as baseline (verifiable by querying `commodity_prices_history` directly via named-volume DB)
- [ ] **AC-5 (is_estimate gate for fixture current):** When `oilLive=false` (HTTPCommodityFetcher fixture mode), `oilPrice` is a hardcoded fixture constant; delta computation is blocked (no fabrication), delta=null, direction="unknown"
- [ ] **AC-6 (safe-degrade on absent table):** If `commodity_prices_history` table is absent (pre-migration container), Go service continues serving — no 500, no panic; deltas degrade to null/unknown
- [ ] **AC-7 (no fabrication, is_estimate precision):** The `is_estimate` field on delta-adjacent fields is `true` when prev came from a row > 36h old (weekend/holiday gap scenario); UI can distinguish "confident delta" from "stale-prior delta"

**Files to read first:** `docs/handoffs/BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL.md` (BA spec §§ Functional Requirements + DDD Layer Map) + `docs/handoffs/BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL.md` (Architect § Technical Design § File Map + Domain Port + Infrastructure Adapter + Application Layer + Test Strategy)

**Files to create:** None — all changes are additive/modifying within existing files

**Files to modify:**
1. `apps/macro-indicators/pkg/domain/ports.go` — ADD `CommodityHistoryPort` interface (domain port, Fence-A clean)
2. `apps/macro-indicators/pkg/infrastructure/repositories.go` — ADD `SQLiteCommodityHistoryRepository` struct + `fetchCommodityPrevCloseFromDB()` helper (18h lookback / 36h stale-bound query + RFC3339Nano timestamp guard)
3. `apps/macro-indicators/pkg/infrastructure/repositories_test.go` — ADD `commodity_prices_history` table to `newInMemoryDB()` helper + 7 test cases (T-HIST-1..7: lookback gate, stale gate, boundary, empty table, partial-zero guard, RFC3339Nano precision)
4. `apps/macro-indicators/pkg/application/usecases.go` — MODIFY `Execute()` to wire `CommodityHistoryPort.FetchPrevClose()` + call resolvers; ADD `computeCommodityDelta()` helper (fixture-current gate per RISK-3); ADD `resolveCommodityPrevClose()` resolver (mirrors `resolvePrevSessionVnIndex` pattern); ADD `getFlatThresholdPct()` env exposure (FR-6); ADD SBV-override flag (Q2 decision: suppress usdVnd delta when SBV fires); remove hardcoded `nil` assignments (line ~241-243)
5. `apps/macro-indicators/pkg/application/dtos.go` — MODIFY `MacroSnapshotResponse`: ADD `PrevFetchedAt *string` field (ISO8601 UTC, nullable, provenance stamp); update U4 comment block (remove "always null" annotation on commodity deltas)
6. `apps/macro-indicators/pkg/application/usecases_test.go` — ADD `stubCommodityHistory` port stub (mirrors `stubMarketIndex` pattern) + 7 test cases (T-DELTA-1..7: delta computation, fixture gate, usdVnd SBV-override, safe-degrade, partial-zero guard, FLAT_THRESHOLD_PCT env)
7. `apps/macro-indicators/cmd/server/main.go` — MODIFY `NewComputeMacroUseCase()` call: wire 5th parameter `commodityHistoryRepo`

**Dependencies:** None — all files within apps/macro-indicators/ single zone. No blockers.

**Knowledge needed:**
- `docs/policies/dev-standards.md` — Go style, DDD layers (Fence-A/B/C), test patterns
- `docs/handoffs/BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL.md` — BA Spec + Architect Design (FR-1..FR-6, design questions Q1..Q4 resolved, DDD layer map, test strategy, edge cases, RISK-1..5)
- Brownfield confirmation (architect): `go 1.24.0` + `modernc.org/sqlite v1.29.9` (pure-Go, no-CGO, already in go.mod); DDD fences intact; test patterns proven
- Named-volume DB: shared `market.db` queried via `DB_PATH` env var (same as all existing adapters); table `commodity_prices_history` (hourly snapshots, 1226 rows, 51-day span, proven writer)

---

## Implementation Detail — From Architect Design

**Key design decisions (Q1..Q4 resolved in BA Spec [Architect] section):**

1. **Lookback boundary (Q1):** 18h rolling window (not calendar-day midnight UTC) — ensures prior row is genuinely from a prior market session across all commodity markets (Brent CME Globex overnight + London + NY; gold 24h; USDVND SBV daily 08:00 VN = 01:00 UTC). 36h upper stale bound handles weekends (still compute, stamp `prevFetchedAt` for UI "vs 2 days ago").

2. **SBV-override conflict (Q2):** **Same-source-only for usdVnd delta.** Skip `computeDelta()` when SBV override fires (S-honesty: cross-source delta would be structurally misleading). Add boolean flag `usdVndSBVOverride` in Execute(); if true, set usdVndDelta=nil, usdVndDirection="unknown". `prevFetchedAt` is still stamped (UI shows when history row is from, even if delta suppressed).

3. **prevFetchedAt precision (Q3):** Raw `*string` ISO8601 UTC in DTO (not `*time.Time`). Avoids ambiguity (zero-time != null in JSON). Service emits raw timestamp; UI computes human-readable relative label.

4. **Table ownership (Q4):** Safe-degrade is sufficient (no own write path). Precedent: `daily_ohlcv` → VNIndex delta. If `commodityTrackerRefreshJob` fails >36h, history row ages out → nil prev → delta = null (honest). Go service read-only by charter (NFR-1).

**Critical risks (architect flagged):**

- **RISK-1 (RFC3339Nano parser):** TypeScript writer uses `new Date().toISOString()` (ms precision → RFC3339Nano). Adapter query must use `time.RFC3339Nano` on `fetched_at` string comparison (SQLite lexicographic sort works only if all timestamps match format).
- **RISK-2 (FetchedAt type mismatch):** Response `FetchedAt` is `time.Time` (zero-time != null), but `PrevFetchedAt` should be `*string` (raw ISO8601) per recommendation — JSON `null` is transparent, avoids ambiguity.
- **RISK-3 (fixture-current delta fabrication):** If `oilLive=false` (fixture mode), `oilPrice` is hardcoded 82.5. Computing `computeDelta(82.5, history_row)` = fabrication. Gate: block `computeDelta()` when `*Live=false`. Return (nil, "unknown"). AC-5 verification gate.
- **RISK-4 (SBV usdVnd post-override):** SBV override replaces Yahoo current but history stores Yahoo prev — cross-source pair. Decision Q2: suppress delta. Document in `prevFetchedAt` comment.
- **RISK-5 (COMMODITY_LIVE_MODE independence):** History port has no COMMODITY_LIVE_MODE gate (always tries to read when table exists). Safe-degrade (nil on empty/error) + RISK-3 fixture-gate covers it.

---

## Dev Handoff — Step-by-Step

**Step 1: Implement domain port** (`pkg/domain/ports.go`)
```
type CommodityHistoryPort interface {
    FetchPrevClose(ctx context.Context) (map[string]float64, string, error)
    // Returns (nil map, "", nil) on safe-degrade (no prior, stale, error)
    // prevFetchedAt string = raw fetched_at ISO8601; empty string = no prior
}
```

**Step 2: Implement infrastructure adapter** (`pkg/infrastructure/repositories.go`)
- Add constants: `commodityHistoryLookbackH = 18 * time.Hour`, `commodityHistoryStaleH = 36 * time.Hour`
- Add struct: `SQLiteCommodityHistoryRepository` (mirrors `SQLiteCommodityRepository` pattern)
- Add helper: `fetchCommodityPrevCloseFromDB()` (test-injectable, pure-func)
- Query: `SELECT brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at FROM commodity_prices_history WHERE fetched_at <= ? AND brent_crude_usd > 0 ORDER BY fetched_at DESC LIMIT 1`
- Cutoff: `now - 18h` (RFC3339Nano format)
- Staleness check: if `time.Since(ts) > 36h`, return nil (safe-degrade)
- Result map keys: `"OIL"`, `"GOLD"`, `"USDVND"` (same as `CommodityFetcherPort`)
- Return values only if > 0 (partial-zero guard)

**Step 3: Update application layer** (`pkg/application/usecases.go`)
- Add 5th field to `ComputeMacroUseCase`: `commodityHistory domain.CommodityHistoryPort`
- Add 5th param to `NewComputeMacroUseCase` constructor
- In `Execute()`:
  - Call `resolveCommodityPrevClose(ctx, uc)` after `resolveMarketPrices` (returns `(map[string]float64, *string)`)
  - Add SBV override tracking: `usdVndSBVOverride := false` in SBV block
  - Replace hardcoded nil block with:
    ```
    oilDelta, oilDirection := computeCommodityDelta("OIL", oilPrice, oilLive, prevCommodity)
    goldDelta, goldDirection := computeCommodityDelta("GOLD", goldPrice, goldLive, prevCommodity)
    if usdVndSBVOverride {
        usdVndDelta, usdVndDirection = nil, "unknown"
    } else {
        usdVndDelta, usdVndDirection = computeCommodityDelta("USDVND", usdVnd, usdVndLive, prevCommodity)
    }
    ```
  - Add `PrevFetchedAt: prevFetchedAt` to response DTO
- Add helper `computeCommodityDelta()` (fixture-current gate + partial-zero guard + existing computeDelta)
- Add resolver `resolveCommodityPrevClose()` (mirrors `resolvePrevSessionVnIndex`)
- Add `getFlatThresholdPct()` (env exposure for FR-6)
- Update `computeDelta()` to call `getFlatThresholdPct()` instead of inline const

**Step 4: Update DTO** (`pkg/application/dtos.go`)
- Add field to `MacroSnapshotResponse`: `PrevFetchedAt *string` (JSON: `"prevFetchedAt"`)
- Update U4 comment: remove "always null (no history)" on commodity deltas

**Step 5: Wire composition root** (`cmd/server/main.go`)
- Create repo: `commodityHistoryRepo := infrastructure.NewSQLiteCommodityHistoryRepository()`
- Pass to constructor: `application.NewComputeMacroUseCase(..., commodityHistoryRepo)`

**Step 6: Test infrastructure** (`pkg/infrastructure/repositories_test.go`)
- Add to `newInMemoryDB()`: CREATE TABLE commodity_prices_history (id PK AUTOINCREMENT, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at TEXT NOT NULL)
- Test cases (in-package, use `fetchCommodityPrevCloseFromDB` directly):
  - T-HIST-1: Row at now-20h → within 18-36h window → all three values returned
  - T-HIST-2: Row at now-5h (< 18h, too fresh) → nil map
  - T-HIST-3: Row at now-40h (> 36h stale) → nil map
  - T-HIST-4: Row at exactly now-18h boundary (inclusive `<=`) → row returned
  - T-HIST-5: Empty table → nil map, no error
  - T-HIST-6: Row with gold_usd_per_oz=0, others non-zero → GOLD absent, OIL+USDVND present
  - T-HIST-7: RFC3339Nano ms-precision timestamp → parses correctly

**Step 7: Test application** (`pkg/application/usecases_test.go`)
- Add `stubCommodityHistory` port (mirrors `stubMarketIndex` pattern)
- Test cases (use stub in `ComputeMacroUseCase` constructor):
  - T-DELTA-1: oilLive=true, prev available → delta non-nil, direction up/down/flat
  - T-DELTA-2: oilLive=false (fixture) → delta nil, direction "unknown" (RISK-3 gate)
  - T-DELTA-3: usdVndSBVOverride=true → usdVnd delta nil, direction "unknown" (Q2 decision)
  - T-DELTA-4: usdVndSBVOverride=false, usdVndLive=true, prev available → delta computed
  - T-DELTA-5: prevCommodity nil (safe-degrade) → all three deltas nil, directions "unknown"
  - T-DELTA-6: gold prev=0 → goldDelta nil (partial-zero guard)
  - T-DELTA-7: FLAT_THRESHOLD_PCT env="0.005" → threshold respected in computeDelta

---

## DoD (Developer Verify Before Submitting)

- [ ] `cd apps/macro-indicators && go test ./...` — all tests green, no test removal
- [ ] Live probe: `mcp__gateway__call_tool(server="vn-market", tool="get_macro_snapshot")` returns `oilUsdDelta`, `goldUsdDelta` as signed floats (non-null when history exists)
- [ ] Live verify `prevFetchedAt` matches: `SELECT fetched_at FROM commodity_prices_history WHERE fetched_at <= datetime('now','-18 hours') ORDER BY fetched_at DESC LIMIT 1` via named-volume DB (keinos/sqlite3 sidecar)
- [ ] Named-volume `commodity_prices_history` table probed: ≥10 rows within 18-36h window (live fixture data available for AC-1..4 verification)
- [ ] RFC3339Nano timestamp parsing verified (test T-HIST-7 green)
- [ ] Fixture-current gate (RISK-3) verified: when COMMODITY_LIVE_MODE unset or false, deltas all nil/unknown (test T-DELTA-2 green)
- [ ] SBV-override suppression (Q2 decision) verified: when SBV fires AND usdVndLive=true, usdVnd delta is nil (test T-DELTA-3 green)
- [ ] **Container rebuild required** after code change (ops to rebuild + deploy `macro-indicators`)

---

## Resources

- **BA Spec (complete):** `docs/handoffs/BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL.md`
- **Architect design (locked):** `docs/handoffs/BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL.md` § [Architect] section
- **Reference implementations:** 
  - `globalMarketsHandler.ts` (mcp-server) — proven 18h-lookback pattern on `commodity_prices_history`
  - `fetchPrevSessionVnIndexFromDB()` (Go macro-indicators) — canonical "prior row" adapter pattern
  - `fetchCommodityPricesFromDB()` (Go macro-indicators) — canonical commodity-read adapter pattern
- **Go style / DDD fences:** `docs/policies/dev-standards.md`
- **Test patterns:** existing `repositories_test.go` + `usecases_test.go` (in-package stubs, `newInMemoryDB()` pattern)

---

## Questions Before You Start?

**Zone routing (dev-team Step 3):** Zone is `apps/macro-indicators/` — dev-macro-indicators specialist picks this up.

**Rebuild requirement:** Container rebuild required post-code-change (ops team, not developer responsibility during coding).

**Live verification:** AC-1..AC-7 gates require live named-volume DB queries (not green build). After code merge, developer (or ops during deployment verification) runs live probes per DoD checklist.
