---
sprint: TOOL-SURFACE-UPGRADE
branch: task/TSU-U4-direction-delta-sweep
size: M
zone: apps/macro-indicators/pkg/
depends_on: []
blocks: []
---

# U4: Direction+Delta Sweep — Market-Data get_* Tools

## TLDR

Architect sweep (lines 394–417 of spec) identifies only `get_macro_snapshot` requires direction+delta changes this sprint. Add prev_session_delta + direction fields for all 4 headline values (vnIndex, oilUsd, goldUsd, usdVnd). VnIndex can serve real delta (daily_ohlcv history exists); oil/gold/usd all delta=null + direction="unknown" (no prev-session history persisted). Change is in Go macro-indicators service (dtos.go + usecases.go), not in TS tool layer (TS tool is thin proxy).

---

## [PM] Planning Context

**Sprint:** TOOL-SURFACE-UPGRADE  
**Unit:** U4 — Direction+delta sweep (market-data level tools)  
**Zone:** `apps/macro-indicators/pkg/application/` + `apps/macro-indicators/pkg/infrastructure/`  
**Priority:** P2  
**Type:** Enhancement (data model)  
**Effort:** ~2h  
**Independent:** Can proceed in parallel with U3/U5

### Acceptance Criteria

- [x] AC-U4-1: `get_macro_snapshot` response DTO (dtos.go SnapshotDTO) includes new fields for all 4 headline values: `prev_session_delta` (float64 | null) + `direction` (string enum: "up", "down", "flat", "unknown")
- [x] AC-U4-2: VnIndex delta: query daily_ohlcv `ORDER BY date DESC LIMIT 2`, compute current_close - prev_close, return delta + "up"/"down"/"flat" (flat if |delta| < 0.1% threshold)
- [x] AC-U4-3: Oil (brent_crude_usd): commodity_prices has single row (no history) → prev_session_delta: null, direction: "unknown" (never fabricated)
- [x] AC-U4-4: Gold (gold_usd_per_oz): same as oil → null, "unknown"
- [x] AC-U4-5: UsdVnd: sbv_rates single row (no history) → null, "unknown"
- [x] AC-U4-6: usecases.go Execute() method updated to compute deltas + directions before building response DTO
- [x] AC-U4-7: No existing field renamed or removed (additive change only); new fields appended to JSON response
- [x] AC-U4-8: API response schema documents direction as string enum (not boolean)

### Files to Read First

- `apps/macro-indicators/pkg/application/dtos.go` — SnapshotDTO current structure
- `apps/macro-indicators/pkg/application/usecases.go` — Execute() method that builds response
- `apps/macro-indicators/pkg/infrastructure/repositories.go` lines 154–197 (FetchVNIndex), 260–319 (FetchPrices) — understand current data fetching
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` lines 84–115 — daily_ohlcv schema (code, date, close)
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U4 Sweep Verdict (lines 402–414) — sweep table with required changes

### Files to Modify

- `apps/macro-indicators/pkg/application/dtos.go` — add prev_session_delta + direction fields to SnapshotDTO
- `apps/macro-indicators/pkg/application/usecases.go` — add delta computation logic before DTO build
- `apps/macro-indicators/pkg/infrastructure/repositories.go` — add helper method to fetch prev_session close for VnIndex (if not already present)

### Dependencies

None (independent zone, no sprint dependencies).

### Knowledge Needed

- `docs/project-memory/feedback_market_data_direction.md` — "show direction+delta %, never snapshot only"
- `docs/ARCHITECTURE.md` — macro-indicators service architecture
- `docs/policies/dev-standards.md` — commit convention

### Related Documentation

- Architect sweep table: `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` lines 402–414
- ARCH-U4-1 resolution: prev-session data availability confirmed (only VnIndex has history; oil/gold/usd permanent null/unknown this sprint)

---

## Implementation Guidance

### dtos.go Updates

```go
// Before:
type SnapshotDTO struct {
  VnIndex float64 `json:"vnIndex"`
  OilUsd  float64 `json:"oilUsd"`
  // ...
}

// After:
type SnapshotDTO struct {
  VnIndex               float64       `json:"vnIndex"`
  VnIndexDelta          *float64      `json:"vnIndexDelta"`         // null or number
  VnIndexDirection      string        `json:"vnIndexDirection"`      // "up"/"down"/"flat"/"unknown"
  
  OilUsd                float64       `json:"oilUsd"`
  OilUsdDelta           *float64      `json:"oilUsdDelta"`          // always null
  OilUsdDirection       string        `json:"oilUsdDirection"`      // always "unknown"
  
  GoldUsd               float64       `json:"goldUsd"`
  GoldUsdDelta          *float64      `json:"goldUsdDelta"`         // always null
  GoldUsdDirection      string        `json:"goldUsdDirection"`     // always "unknown"
  
  UsdVnd                float64       `json:"usdVnd"`
  UsdVndDelta           *float64      `json:"usdVndDelta"`          // always null
  UsdVndDirection       string        `json:"usdVndDirection"`      // always "unknown"
}
```

**Direction enum validation:** Add type guard or comment documenting "up" | "down" | "flat" | "unknown".

### usecases.go Updates

In Execute() method, before building SnapshotDTO:

```go
func (uc *SnapshotUsecase) Execute(ctx context.Context) (*dtos.SnapshotDTO, error) {
  // Fetch current snapshot (existing logic)
  vnIndex, oil, gold, usdVnd := /* ...fetch current values... */
  
  // NEW: Fetch prev-session data
  prevVnIndex, err := uc.repo.FetchPrevSessionVnIndex(ctx)
  if err != nil {
    // Log error, continue with null/unknown (fail-graceful)
    prevVnIndex = nil
  }
  
  // NEW: Compute deltas + directions
  vnIndexDelta, vnIndexDir := computeDelta(vnIndex, prevVnIndex)
  oilDelta, oilDir := nil, "unknown"       // oil has no history
  goldDelta, goldDir := nil, "unknown"     // gold has no history
  usdVndDelta, usdVndDir := nil, "unknown" // usd has no history
  
  // Build DTO (existing fields + new delta/direction fields)
  return &dtos.SnapshotDTO{
    VnIndex: vnIndex,
    VnIndexDelta: vnIndexDelta,
    VnIndexDirection: vnIndexDir,
    OilUsd: oil,
    OilUsdDelta: oilDelta,
    OilUsdDirection: oilDir,
    // ... etc
  }, nil
}

// Helper
func computeDelta(current float64, prev *float64) (*float64, string) {
  if prev == nil {
    return nil, "unknown"
  }
  delta := current - *prev
  direction := "flat"
  if delta > 0.001 {         // threshold: 0.1% = 0.001
    direction = "up"
  } else if delta < -0.001 {
    direction = "down"
  }
  return &delta, direction
}
```

### repositories.go Updates (if needed)

If FetchPrevSessionVnIndex() helper doesn't exist, add it:

```go
func (r *YourRepository) FetchPrevSessionVnIndex(ctx context.Context) (*float64, error) {
  // Query daily_ohlcv for VNINDEX, ORDER BY date DESC, LIMIT 2 (second row = prev close)
  var prevClose float64
  err := r.db.WithContext(ctx).
    Table("daily_ohlcv").
    Where("code = ?", "VNINDEX").
    Order("date DESC").
    Limit(1).
    Offset(1).
    Pluck("close", &prevClose).Error
  
  if err != nil {
    return nil, err
  }
  return &prevClose, nil
}
```

---

## Test Plan

### Unit Tests

1. **T-U4-1:** computeDelta() with null prev returns (nil, "unknown")
2. **T-U4-2:** computeDelta() with positive delta returns (delta, "up")
3. **T-U4-3:** computeDelta() with negative delta returns (delta, "down")
4. **T-U4-4:** computeDelta() with delta < 0.1% returns (delta, "flat")
5. **T-U4-5:** FetchPrevSessionVnIndex() returns second-most-recent close
6. **T-U4-6:** SnapshotDTO JSON serializes new fields (delta + direction)
7. **T-U4-7:** Oil/gold/usd always emit null delta + "unknown" direction

### Integration Tests

1. **T-U4-8:** Execute() builds DTO with VnIndex delta + direction (live macro-indicators DB query)
2. **T-U4-9:** Execute() builds DTO with oil/gold/usd null + "unknown" (no history)
3. **T-U4-10:** API response JSON includes new fields in schema

### QA Gate

**QA-U4-1:** Call `get_macro_snapshot` via gateway wrapper. Verify response JSON includes:
- `vnIndexDelta` (number or null), `vnIndexDirection` (string)
- `oilUsdDelta` (null), `oilUsdDirection` ("unknown")
- `goldUsdDelta` (null), `goldUsdDirection` ("unknown")
- `usdVndDelta` (null), `usdVndDirection` ("unknown")

**QA-U4-2:** Over 2 business days, verify VnIndex direction changes (up/down/flat as market moves), delta value changes. Oil/gold/usd always null/unknown (consistent).

---

## Risk & Mitigation

**Risk R-U4-1:** VnIndex history query returns < 2 rows (first day of trading). Solution: graceful fallback to null/unknown if offset(1) returns empty.

**Mitigation:** FetchPrevSessionVnIndex() checks error; null result handled by computeDelta().

**Risk R-U4-2:** prev-session threshold (0.1%) may be too tight or loose. Architect decision: DEFERRED. Commit with 0.1% threshold; future sprint can tune.

**Mitigation:** Document threshold in code comment (tunable).

---

## Rebuild Required

**Yes.** After Go code change, rebuild macro-indicators:
```bash
docker compose build --no-cache macro-indicators
docker compose up -d --no-deps --force-recreate macro-indicators
```

QA verifies via `get_macro_snapshot` call (raw JSON, not badge).

---

## Commit Checklist

- [ ] dtos.go updated with delta + direction fields
- [ ] usecases.go Execute() updated with delta computation
- [ ] repositories.go FetchPrevSessionVnIndex() implemented (if needed)
- [ ] All tests pass (Go test suite exit 0)
- [ ] Integration test confirms live delta calculation
- [ ] Commit message: `feat(U4): direction+delta for get_macro_snapshot — VnIndex delta from history, oil/gold/usd null/"unknown"`
- [ ] AC trailer appended per commit-convention.md

---

---

## [QA] Review Record — 2026-06-07T08:50Z

**Verdict: APPROVED**

**Commit reviewed:** 9880eadc

**Go test suite:** 12/12 packages PASS. go vet: 0 errors.

**Live endpoint (POST :5004/snapshot):**
- `vnIndexDelta`: 7.350000000000136 (number, computed from daily_ohlcv prev-session)
- `vnIndexDirection`: "up"
- `oilUsdDelta`: null, `oilUsdDirection`: "unknown"
- `goldUsdDelta`: null, `goldUsdDirection`: "unknown"
- `usdVndDelta`: null, `usdVndDirection`: "unknown"

**Gateway passthrough (MCP :3000):** All 8 new fields present in served payload. TS tool is confirmed thin proxy — no field transformation.

**Additive-only (AC-U4-7):** git diff dtos.go = additions only. No existing field renamed or removed. PASS.

**DDD Fence-A:** domain/ports.go imports context+time only. No infrastructure/application imports. PASS.

**Security:** No hardcoded secrets, no process.env in modified Go files. PASS.

**Test coverage:** T-U4-1 (nil prev → unknown), T-U4-2 (up), T-U4-3 (down), T-U4-4 (flat), T-U4-6 (Execute() live prev-session), T-U4-6 safe-degrade (no prev session), T-U4-7 (oil/gold/usdVnd null/unknown) all present and verified.

**Contract test:** Both fakeContractMarketIndex and fakeZeroMarketIndex updated with FetchPrevSessionVnIndex stub. PASS.

**mcp-server health:** Up (healthy), RestartCount=0. "Up 21 seconds" during ops pass = normal rebuild restart, not crash-loop. PASS.

**AC coverage:**
- AC-U4-1: SnapshotDTO has 8 new fields — PASS
- AC-U4-2: VnIndex delta from daily_ohlcv OFFSET 1 — PASS (live: 7.35, direction: up)
- AC-U4-3: Oil delta=null, direction="unknown" — PASS
- AC-U4-4: Gold delta=null, direction="unknown" — PASS
- AC-U4-5: UsdVnd delta=null, direction="unknown" — PASS
- AC-U4-6: Execute() computes deltas+directions — PASS
- AC-U4-7: Additive only, no field renamed/removed — PASS
- AC-U4-8: Direction documented as string enum in dtos.go comment — PASS

---

## Related Tasks

- Independent of: TSU-DEV-U1, TSU-DEV-U2-GEN, TSU-DEV-U3, TSU-DEV-U5, TSU-DEV-U6, TSU-DEV-U2-PARITY (separate zone)
- Parallel execution: can run while TSU-DEV-U3/U5 in progress (no contention)
