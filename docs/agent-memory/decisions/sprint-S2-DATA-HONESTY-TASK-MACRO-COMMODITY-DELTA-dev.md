# Decision Journal — Developer · TASK-MACRO-COMMODITY-DELTA · S2-DATA-HONESTY

**Date:** 2026-06-24T00:00Z
**Sprint:** S2-DATA-HONESTY
**Task ID:** TASK-MACRO-COMMODITY-DELTA
**Agent:** dev-macro-indicators
**Verdict:** REVIEW — REBUILD_REQUIRED (done_verified withheld pending ops rebuild + live AC probe)

---

## Entry

**task-id:** TASK-MACRO-COMMODITY-DELTA

**what-considered:**

All 7 files modified per architect frozen design (docs/handoffs/BA-FIX-MACRO-SNAPSHOT-DELTAS-NULL.md § [Architect] Technical Design). Zero new files created. All changes additive.

**Files changed (summary):**

1. `apps/macro-indicators/pkg/domain/ports.go` — ADD `CommodityHistoryPort` interface. Returns `(map[string]float64, string, error)`. Fence-A clean (zero infra imports in domain layer).
2. `apps/macro-indicators/pkg/infrastructure/repositories.go` — ADD `SQLiteCommodityHistoryRepository` struct with `NewSQLiteCommodityHistoryRepository()` and `FetchPrevClose()`. ADD `fetchCommodityPrevCloseFromDB()` pure helper (test-injectable). Constants: `commodityHistoryLookbackH = 18h`, `commodityHistoryStaleH = 36h`. Read-only SQLite (`mode=ro`), `time.RFC3339Nano` parse (RISK-1 covered).
3. `apps/macro-indicators/pkg/infrastructure/repositories_test.go` — ADD `commodity_prices_history` table to `newInMemoryDB()`. ADD T-HIST-1..7 (7 new tests covering: valid window, too-fresh guard, stale bound, boundary inclusive, empty table, partial-zero, RFC3339Nano regression).
4. `apps/macro-indicators/pkg/application/usecases.go` — ADD 5th field `commodityHistory domain.CommodityHistoryPort` to struct; ADD 5th param to constructor. MODIFY `Execute()`: call `resolveCommodityPrevClose()`, capture `usdVndSBVOverride` flag on SBV block, replace nil hardcode with `computeCommodityDelta()` for oil/gold/usdVnd. ADD `computeCommodityDelta()` (RISK-3 fixture gate), `resolveCommodityPrevClose()`, `getFlatThresholdPct()` (FR-6 env) helpers. MODIFY `computeDelta()` to use `getFlatThresholdPct()` instead of const. Added `os` + `strconv` imports (stdlib, no DDD violations).
5. `apps/macro-indicators/pkg/application/dtos.go` — ADD `PrevFetchedAt *string` field with S2-DATA-HONESTY comment. UPDATE U4 comment to remove "always null (no history)" on oil/gold/usdVnd fields.
6. `apps/macro-indicators/pkg/application/usecases_test.go` — ADD `stubCommodityHistory` stub. UPDATE ALL 34 `NewComputeMacroUseCase` call sites from 4→5 args. RENAME `TestU4_OilGoldUsdVndAlwaysNullUnknown` → `TestU4_OilGoldUsdVndNullWhenNoCommodityHistory`. ADD T-DELTA-1..7 (7 new tests covering: delta computed, RISK-3 gate, Q2 SBV suppression, SBV-not-fired, nil-prevmap, partial-zero, FLAT_THRESHOLD_PCT env).
7. `apps/macro-indicators/cmd/server/main.go` — ADD `commodityHistoryRepo := infrastructure.NewSQLiteCommodityHistoryRepository()`. PASS as 5th arg to `NewComputeMacroUseCase`. Composition root is sole file importing infra (Fence-C clean).

**Test suite results:**
```
cd apps/macro-indicators && go test ./...
ok  github.com/vn-market-intelligence/macro-indicators/pkg/application    41.173s
ok  github.com/vn-market-intelligence/macro-indicators/pkg/domain          (cached)
ok  github.com/vn-market-intelligence/macro-indicators/pkg/infrastructure  (cached)
ok  github.com/vn-market-intelligence/macro-indicators/pkg/interface/http   1.543s
[+ 8 primitive/module packages cached]
Total: 253 PASS, 0 FAIL
New tests added: 14 (T-HIST-1..7 + T-DELTA-1..7)
```

```
go vet ./...        → CLEAN
go build ./cmd/...  → CLEAN
```

`depguard` violations visible are ALL pre-existing by design (composition root imports all DDD layers). Zero new violations.

**Risk gate verification:**
- RISK-1 (RFC3339Nano): T-HIST-7 inserts `2026-06-23T10:05:12.456Z` ms-precision timestamp and asserts parse success. PASS.
- RISK-3 (fixture-current gate): T-DELTA-2 asserts `oilLive=false` → `(nil, "unknown")` before accessing prevMap. PASS.
- Q2 (SBV same-source): T-DELTA-3 asserts SBV override → `usdVndDelta=nil, usdVndDirection="unknown"`. PASS. T-DELTA-4 asserts SBV NOT fired → delta computed normally. PASS.
- DDD fences: Fence-A (domain no infra), Fence-B (application no infra), Fence-C (only cmd/server imports infra). ALL CLEAN.

**Commit:** `e55805aa feat(macro-indicators): wire commodity_prices_history prev-close → oil/gold/usdVnd signed deltas (S2-DATA-HONESTY)`

**why-change:** Verdict is REVIEW because REBUILD_REQUIRED:true — the Go binary is COPY-baked into the Docker image; container must be rebuilt and redeployed before live AC-1..AC-7 probes are runnable. done_verified is withheld pending:
1. Ops rebuilds `macro-indicators` container (`docker compose build macro-indicators && docker compose up -d macro-indicators`)
2. QA probes `get_macro_snapshot` live: verifies `oilUsdDelta` non-null, `goldUsdDelta` non-null, `prevFetchedAt` ISO8601 matches commodity_prices_history row

**NOTE (post-session orch-state read):** orch-state updated_at=2026-06-24T04:56:50Z shows live RAW probe already confirmed: `oilDelta -1.02 down, goldDelta -53.40 down both real+plausible, prevFetchedAt populated`. This indicates ops already rebuilt and QA already verified in a prior tick. done_verified status = LIVE VERIFIED by dev-team-cron-router at 04:56:50Z. usdVnd delta null BY-DESIGN (SBV same-source guard Q2) per orch-state note.

**Next action:** QA can verify AC-1..AC-7 via live `get_macro_snapshot` call (rebuild already done per orch-state). No further dev action required.
