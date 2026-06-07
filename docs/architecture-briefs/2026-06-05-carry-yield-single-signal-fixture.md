# Architecture Brief: CARRY-YIELD-SINGLE-SIGNAL-FIXTURE

**Date:** 2026-06-05
**Sprint:** DSI-EXTENSION (follows DATA-SERVE-INTEGRITY)
**Lead agent:** architect
**Finding origin:** dispatcher router raw-verify — live :5004 tick (2026-06-05)
**Zone:** `apps/macro-indicators/` → `dev-macro-indicators`
**Build standard:** lean (existing service, bug-fix/refactor — no new service primitives)

---

## 1. Finding Summary

DSI-INV-1 is violated on two live MCP tool paths that the DSI sprint's /snapshot fix did NOT cover.

| Tool | Go endpoint | Current response |
|------|------------|-----------------|
| `get_carry_trade_signal` | GET /carry-trade-signal | `{regime:"FII_OUTFLOW_RISK", carrySpread:-0.63, fedFundsRate:5.33, vndDepositRate:4.7}` — NO source_tier, NO is_estimate, hardcoded fixture values |
| `get_yield_spread_signal` | GET /yield-spread-signal | `{label:"CHEAP", earningYield:8.2, depositRate:4.7, computedAt:"2026-05-23T00:00:00Z"}` — NO provenance, hardcoded fixture values |

Meanwhile POST /snapshot (get_macro_snapshot) serves the LIVE path: fed=3.62, vndDeposit=5.0, carrySpread=+1.38, regime=NEUTRAL, source_tier=2, is_estimate=false.

Two live MCP tools give CONTRADICTORY carry regime. The single-signal path is the original F-CARRY-CORRUPT value (5.33/−0.63/FII_OUTFLOW_RISK) with zero provenance markers. The DSI sprint's fix was necessary-not-sufficient: it corrected /snapshot (ComputeMacroUseCase.Execute()) but the two single-signal Go handlers are DI-free closures with their own hardcoded fixture consts and no port injection.

---

## 2. Root Cause: DI-Free Handler Closures

### The wiring gap

`router.go` `NewRouter(useCase *application.ComputeMacroUseCase, logger *slog.Logger)` passes `useCase` into `handleSnapshot` and `handleExternal`. But:

```go
r.Get("/carry-trade-signal", handleCarryTradeSignal())
r.Get("/yield-spread-signal", handleYieldSpreadSignal())
```

Both are called with **no arguments**. `handleCarryTradeSignal()` and `handleYieldSpreadSignal()` are zero-argument factory functions that close over nothing — they use their own package-level `const` blocks:

```go
// handlers_carry.go
const (
    carryFixtureVNDDepositRate = 4.7
    carryFixtureFedFundsRate   = 5.33
    carryFixtureComputedAt     = "2026-05-23T00:00:00Z"
)

// handlers_yield.go
const (
    yieldFixtureEarningYield = 8.2
    yieldFixtureDepositRate  = 4.7
    yieldFixtureComputedAt   = "2026-05-23T00:00:00Z"
)
```

The DSI sprint never touched these files. `usecases.go` has full DSI-INV-1 compliance (resolvers + buildCarryDTO/buildYieldDTO + suppression logic), but this logic is only reachable via `Execute()`, which is only called from `handleSnapshot` and `handleExternal`.

### Why the existing router_test.go is a false-green

`TestCarryTradeSignalRoute` asserts the body contains `"FII_OUTFLOW_RISK"` — which is exactly the WRONG fixture value. The test was written to the fixture behaviour and now enforces the bug.

---

## 3. Design Decision: Option B (Consolidate)

**Decision: Option B — retire the standalone Go endpoints, have the MCP TS tools call /snapshot and project the carry/yield sub-object.**

### Rationale

**Option A (inject ComputeMacroUseCase into single-signal handlers):**
- Keeps 3 live endpoints (/carry-trade-signal, /yield-spread-signal, /snapshot all serving independently)
- Requires: change `handleCarryTradeSignal()`/`handleYieldSpreadSignal()` signatures to accept `*ComputeMacroUseCase`; update `NewRouter` to pass useCase to those handlers; replicate the buildCarryDTO/buildYieldDTO projection inside the handlers (or call Execute() and project sub-object); delete fixture consts.
- BUT: `Execute()` computes all 6 signals to return the carry or yield sub-object. Calling it just for one sub-signal is wasteful — it runs the investment-clock, oil, gold, usdvnd classifiers too. This is not a correctness problem but it is dead computation.
- Keeps 3 separate endpoints where 1 (/snapshot) is already the canonical source. The 2 single-signal endpoints become thin projection shells — they add surface area without adding value.
- `router_test.go` `TestCarryTradeSignalRoute` must be rewritten anyway (it asserts the wrong fixture value).

**Option B (consolidate: TS tools call /snapshot, project sub-object; retire Go single-signal endpoints):**
- `/carry-trade-signal` and `/yield-spread-signal` Go endpoints and their fixture handler files are **deleted entirely**.
- `carryTools.ts` `get_carry_trade_signal` changes its HTTP call: `GET /snapshot → POST /snapshot` (body `{}`), then projects `response.signals.carry` as the tool output — adding `source_tier` and `is_estimate` from the already-correct CarrySignalDTO.
- `dinhGiaTools.ts` `get_yield_spread_signal` does the same: `POST /snapshot {}` → project `response.signals.yield`.
- **Kills the fixture-as-live class definitively**: the fixture handler files cease to exist. No `const carryFixture*` can silently re-emerge.
- **Eliminates dead code surface** per the mandate: 2 Go handler files gone + 2 router entries gone + 2 fixture const blocks gone.
- **Single source of truth for carry/yield**: only `/snapshot` exists. The DSI-INV-1 logic lives in one place (`buildCarryDTO`/`buildYieldDTO` in `usecases.go`), tested once, served once.
- **No new port injection**: `NewRouter` signature unchanged. No risk of wiring mistake duplicating the DI graph.
- **Contract continuity for TS callers**: `get_carry_trade_signal` still returns regime/carrySpread/vndDepositRate/fedFundsRate/computedAt — same logical shape, now with added `source_tier` + `is_estimate` from CarrySignalDTO. `get_yield_spread_signal` still returns label/spread/earningYield/depositRate/computedAt + adds `source_tier` + `is_estimate`.
- Downside: `/snapshot` does slightly more work per single-signal call (runs all 6 primitives). In practice these MCP tools are called infrequently (not hot path). Acceptable.

**Verdict: B is the definitif fix. Less code, less surface, kills the entire fixture-handler class.**

---

## 4. Implementation Spec — SPRINT-S, Single Zone

**Zone:** `apps/macro-indicators/` + `apps/mcp-server/src/interface/mcp/tools/macro/`

Both sub-zones are part of one logical sprint. PM should assign to dev-macro-indicators (Go) and dev-mcp-server (TS) as two sequential sub-tasks within the same sprint ticket, with the Go deletion completing first (since TS rewire depends on /snapshot being stable, which it already is).

---

### Sub-task B-1: Go plane — delete single-signal handlers and router entries

**Zone tag:** `apps/macro-indicators/`

**Files to delete:**

- `apps/macro-indicators/pkg/interface/http/handlers_carry.go` — delete entirely
- `apps/macro-indicators/pkg/interface/http/handlers_yield.go` — delete entirely

**File to modify:** `apps/macro-indicators/pkg/interface/http/router.go`

Remove the two route registrations:

```go
// DELETE these two lines:
r.Get("/carry-trade-signal", handleCarryTradeSignal())
r.Get("/yield-spread-signal", handleYieldSpreadSignal())
```

Also remove the carry/yield import at the top of router.go if they exist — but both handlers are in the same `http` package so no import to remove. Verify the file compiles after deletion.

Final `NewRouter` route list:
```go
r.Get("/health", handleHealth())
r.Post("/snapshot", handleSnapshot(useCase, logger))
r.Get("/macro-calendar", handleMacroCalendar())
r.Get("/external", handleExternal(useCase, logger))
```

**Tests to delete or rewrite in `router_test.go`:**

`TestCarryTradeSignalRoute` — **delete**. It asserts `FII_OUTFLOW_RISK` which was the fixture bug value. No replacement needed in the Go layer (the real contract test lives in `handlers_snapshot_contract_test.go`).

`TestYieldSpreadSignalRoute` — **delete**. Same reason — it asserts `CHEAP` which was the fixture value.

These are the only two tests referencing those handlers. The `handlers_snapshot_contract_test.go` already covers POST /snapshot carry/yield sub-object shape via `TestSnapshotBodyContract`.

**New test to add in `router_test.go`:**

```go
// TestCarryYieldEndpointsRetired asserts that GET /carry-trade-signal and
// GET /yield-spread-signal return 404 after the single-signal handlers were
// retired (Option B consolidation, CARRY-YIELD-SINGLE-SIGNAL-FIXTURE brief).
// If these return 200, a fixture handler was accidentally re-added.
func TestCarryYieldEndpointsRetired(t *testing.T) {
    srv := httptest.NewServer(newTestRouter())
    defer srv.Close()

    for _, path := range []string{"/carry-trade-signal", "/yield-spread-signal"} {
        resp, err := http.Get(srv.URL + path)
        if err != nil {
            t.Fatalf("GET %s failed: %v", path, err)
        }
        resp.Body.Close()
        if resp.StatusCode != http.StatusNotFound {
            t.Errorf("GET %s: expected 404 (endpoint retired), got %d — fixture handler must have been re-added", path, resp.StatusCode)
        }
    }
}
```

**New test to add in `usecases_test.go` — anti-fixture-value regression guard:**

```go
// TestSingleSignalToolAntiFixtureGuard is the explicit DSI-INV-1 regression guard
// for CARRY-YIELD-SINGLE-SIGNAL-FIXTURE: ensures that NO live computation path
// produces the known fixture values (5.33/4.7 carry; 8.2/4.7 yield) when live
// port inputs are available. This test proves the fixture consts in the deleted
// handlers_carry.go/handlers_yield.go are permanently dead.
//
// If this test ever fails, the fixture values somehow re-entered a live path.
func TestSingleSignalToolAntiFixtureGuard(t *testing.T) {
    // Inject live inputs distinct from all fixture values.
    uc := NewComputeMacroUseCase(
        newStubCommodity(),
        &stubSBVRate{},
        &stubMarketIndex{vnIndex: 1880.0},
        &stubCarryYieldInputs{vndDeposit: 5.0, fedFunds: 3.62, earnYield: 6.83},
    )

    resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
    if err != nil {
        t.Fatalf("Execute() error: %v", err)
    }

    // Extract carry fields.
    type carryFields struct {
        FedFundsRate   float64  `json:"fedFundsRate"`
        VNDDepositRate float64  `json:"vndDepositRate"`
        CarrySpread    *float64 `json:"carrySpread"`
        IsEstimate     bool     `json:"is_estimate"`
        SourceTier     int      `json:"source_tier"`
    }
    b, _ := json.Marshal(resp.Signals.Carry)
    var cf carryFields
    if err := json.Unmarshal(b, &cf); err != nil {
        t.Fatalf("unmarshal carry: %v", err)
    }

    // DSI-INV-1: fixture rate 5.33 must NOT be served on live path.
    if abs(cf.FedFundsRate-5.33) < 0.001 {
        t.Errorf("ANTI-FIXTURE: carry fedFundsRate=5.33 — fixture handlers_carry.go const re-entered live path; must be 3.62 (live EFFR)")
    }
    // source_tier must not be 0 (absent/unset).
    if cf.SourceTier == 0 {
        t.Errorf("ANTI-FIXTURE: carry source_tier=0 (absent) — provenance field missing from carry DTO")
    }
    // is_estimate must be false for live inputs.
    if cf.IsEstimate {
        t.Errorf("ANTI-FIXTURE: carry is_estimate=true on live-input path — suppression fired incorrectly")
    }

    // Extract yield fields.
    type yieldFields struct {
        EarningYield float64 `json:"earningYield"`
        DepositRate  float64 `json:"depositRate"`
        IsEstimate   bool    `json:"is_estimate"`
        SourceTier   int     `json:"source_tier"`
    }
    yb, _ := json.Marshal(resp.Signals.Yield)
    var yf yieldFields
    if err := json.Unmarshal(yb, &yf); err != nil {
        t.Fatalf("unmarshal yield: %v", err)
    }

    // DSI-INV-1: fixture earningYield 8.2 must NOT be served when live port returns 6.83.
    if abs(yf.EarningYield-8.2) < 0.001 {
        t.Errorf("ANTI-FIXTURE: yield earningYield=8.2 — fixture handlers_yield.go const re-entered live path; must be 6.83 (live port)")
    }
    if yf.SourceTier == 0 {
        t.Errorf("ANTI-FIXTURE: yield source_tier=0 (absent) — provenance field missing from yield DTO")
    }
}
```

**Verification after Go changes (dev-macro-indicators must confirm before marking done):**

```bash
cd apps/macro-indicators
go build ./...           # must compile clean
go test ./pkg/...        # all tests pass including new TestCarryYieldEndpointsRetired
```

---

### Sub-task B-2: TS plane — rewire carryTools.ts and dinhGiaTools.ts to POST /snapshot

**Zone tag:** `apps/mcp-server/`

**File: `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts`**

Change `get_carry_trade_signal` handler from `GET /carry-trade-signal` to `POST /snapshot {}` with carry sub-object projection.

Replace the tool description to reflect provenance fields now surfaced:

```typescript
server.tool(
  "get_carry_trade_signal",
  "Computes the VND carry trade signal for the Thien Thoi (global liquidity) layer " +
    "of the Trần Ngọc Báu macro framework. " +
    "Routes through HTTP POST /snapshot to the macro-indicators microservice (port 5004) " +
    "and projects the carry sub-object. " +
    "Returns regime, carrySpread (null when inputs are estimated), vndDepositRate, " +
    "fedFundsRate, computedAt, source_tier (2=administered-published, 4=fixture/estimate), " +
    "is_estimate (true when any carry input fell back to fixture), and fetched_at_source " +
    "(FRED source date for fedFunds; null when unavailable). " +
    "Source tier: reflects live carry inputs — tier:2 when live, tier:4 when fixture fallback.",
  {},
  async () => {
    const url = `${baseUrl}/snapshot`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: "{}",
      });

      if (!response.ok) {
        logger.warn("[get_carry_trade_signal] HTTP error from macro-indicators /snapshot", {
          status: response.status,
          url,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "macro-indicators service unavailable" }, null, 2),
            },
          ],
        };
      }

      const snapshot = await response.json() as {
        signals?: {
          carry?: unknown;
        };
      };

      const carrySignal = snapshot?.signals?.carry;
      if (carrySignal == null) {
        logger.warn("[get_carry_trade_signal] /snapshot response missing signals.carry", { url });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "carry signal not available in snapshot" }, null, 2),
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(carrySignal, null, 2) }],
      };
    } catch (err) {
      logger.warn("[get_carry_trade_signal] fetch failed", {
        error: err instanceof Error ? err.message : String(err),
        url,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "macro-indicators service unavailable" }, null, 2),
          },
        ],
      };
    }
  },
);
```

The `get_macro_calendar` registration in `carryTools.ts` is **unchanged** — it still calls `GET /macro-calendar`.

**File: `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts`**

Same pattern for `get_yield_spread_signal`: call `POST /snapshot {}`, project `snapshot.signals.yield`.

```typescript
server.tool(
  "get_yield_spread_signal",
  "Computes the yield spread signal for the Dinh Gia (valuation) layer of the " +
    "Trần Ngọc Báu macro framework (Phase 2). " +
    "Routes through HTTP POST /snapshot to the macro-indicators microservice (port 5004) " +
    "and projects the yield sub-object. " +
    "Returns label, spread, earningYield, depositRate, computedAt, " +
    "source_tier (2=administered-published, 4=fixture/estimate), " +
    "and is_estimate (true when any yield input fell back to fixture). " +
    "Source tier: tier:2 when both earningYield and depositRate are live; tier:4 on fixture fallback.",
  {},
  async () => {
    const url = `${baseUrl}/snapshot`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: "{}",
      });

      if (!response.ok) {
        logger.warn("[get_yield_spread_signal] HTTP error from macro-indicators /snapshot", {
          status: response.status,
          url,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "macro-indicators service unavailable" }, null, 2),
            },
          ],
        };
      }

      const snapshot = await response.json() as {
        signals?: {
          yield?: unknown;
        };
      };

      const yieldSignal = snapshot?.signals?.yield;
      if (yieldSignal == null) {
        logger.warn("[get_yield_spread_signal] /snapshot response missing signals.yield", { url });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "yield signal not available in snapshot" }, null, 2),
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(yieldSignal, null, 2) }],
      };
    } catch (err) {
      logger.warn("[get_yield_spread_signal] fetch failed", {
        error: err instanceof Error ? err.message : String(err),
        url,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "macro-indicators service unavailable" }, null, 2),
          },
        ],
      };
    }
  },
);
```

**DTO surface note for dev-mcp-server:**

The `CarrySignalDTO` fields now surfaced by these tools (from `/snapshot signals.carry`):

| Field | Type | Note |
|-------|------|------|
| `regime` | string | "UNKNOWN" when is_estimate=true |
| `carrySpread` | number or null | null when is_estimate=true |
| `vndDepositRate` | number | SBV administered rate |
| `fedFundsRate` | number | FRED EFFR |
| `reasoning` | string | human-readable |
| `computedAt` | string (RFC3339) | time of Execute() call |
| `is_estimate` | boolean | true = fixture fallback active |
| `source_tier` | integer | 2 = live, 4 = fixture |
| `fetched_at_source` | string or null | FRED MAX(date), never time.Now() |

The `YieldSignalDTO` fields now surfaced:

| Field | Type | Note |
|-------|------|------|
| `label` | string | CHEAP / FAIRLY_VALUED / EXPENSIVE |
| `spread` | number | earningYield − depositRate |
| `earningYield` | number | VN equity earnings yield % |
| `depositRate` | number | SBV deposit rate % |
| `reasoning` | string | |
| `computedAt` | string (RFC3339) | |
| `is_estimate` | boolean | |
| `source_tier` | integer | 2 = live, 4 = fixture |

**Rebuild required after TS changes:**

```bash
# dev-mcp-server must trigger container rebuild via ops after code change
# (per [Rebuild after dev change] memory — restart relaunches stale image)
```

---

### Sub-task B-3: DSI brief annotation (docs only)

Annotate `docs/architecture-briefs/2026-06-04-data-serve-integrity.md` §9 Sequence Summary with:

```
CARRY-YIELD-SINGLE-SIGNAL-FIXTURE (P0, S, ADDITIONAL):
  /snapshot DSI fix was necessary-not-sufficient.
  GET /carry-trade-signal and GET /yield-spread-signal had separate DI-free handlers
  with own fixture consts — served 5.33/FII_OUTFLOW_RISK while /snapshot served 3.62/NEUTRAL.
  Fix = Option B consolidation: retire single-signal Go endpoints, TS tools call POST /snapshot
  and project carry/yield sub-object. handlers_carry.go + handlers_yield.go deleted.
  Brief: docs/architecture-briefs/2026-06-05-carry-yield-single-signal-fixture.md
```

---

## 5. Risk Flags

**R-1 (LOW): /snapshot runs all 6 primitives; carry/yield single-signal tools now compute all 6.**
Acceptable cost — these tools are called infrequently. The macro-indicators service is lightweight (no network calls from Execute(), pure DB reads + in-process computation). No perf concern.

**R-2 (LOW): POST /snapshot is the contract for carryTools/dinhGiaTools after this change.**
If macro-indicators container is down, both tools return `{"error":"macro-indicators service unavailable"}` — same as before. No regression in degraded-mode behaviour.

**R-3 (MEDIUM): `router_test.go` currently asserts `FII_OUTFLOW_RISK` and `CHEAP` as expected values.**
Both tests must be deleted (they are fixture-asserting anti-tests). The retirement guard `TestCarryYieldEndpointsRetired` replaces them. If dev-macro-indicators only deletes the handler files without removing or replacing these tests, `go test` will fail on missing symbol references. Must be done atomically.

**R-4 (LOW): carryTools.ts `get_macro_calendar` registration is in the same `registerCarryTools` function.**
Dev-mcp-server must NOT touch the `get_macro_calendar` block — it still calls `GET /macro-calendar` and is correct. Only the `get_carry_trade_signal` block changes.

---

## 6. Test Summary

### Go — `apps/macro-indicators/pkg/interface/http/router_test.go`

| Test | Action | Reason |
|------|--------|--------|
| `TestCarryTradeSignalRoute` | DELETE | Asserts fixture bug value `FII_OUTFLOW_RISK`; endpoint retired |
| `TestYieldSpreadSignalRoute` | DELETE | Asserts fixture bug value `CHEAP`; endpoint retired |
| `TestCarryYieldEndpointsRetired` | ADD | 404 guard — prevents accidental re-addition of fixture handlers |

### Go — `apps/macro-indicators/pkg/application/usecases_test.go`

| Test | Action | Reason |
|------|--------|--------|
| `TestSingleSignalToolAntiFixtureGuard` | ADD | Regression guard: live path must never emit fixture values 5.33/4.7/8.2 |

### Existing tests that must still pass unchanged

All existing `usecases_test.go` tests (DPI-2b, DSI-INV-1 table-driven, FU-SBV-DEPOSIT-PROVENANCE-GO) remain valid and unchanged. `TestSnapshotBodyContract` and `TestExternalBodyContract` in `handlers_snapshot_contract_test.go` unchanged.

---

## 7. Verified Paths

| File | Finding |
|------|---------|
| `apps/macro-indicators/pkg/interface/http/handlers_carry.go` | Const `carryFixtureFedFundsRate=5.33` + zero DI → fixture served as live |
| `apps/macro-indicators/pkg/interface/http/handlers_yield.go` | Const `yieldFixtureEarningYield=8.2` + zero DI → fixture served as live |
| `apps/macro-indicators/pkg/interface/http/router.go:38-39` | Two DI-free route registrations — `handleCarryTradeSignal()` and `handleYieldSpreadSignal()` receive no useCase |
| `apps/macro-indicators/pkg/interface/http/router_test.go:60,85` | Tests assert fixture bug values as expected — anti-tests, must be deleted |
| `apps/macro-indicators/pkg/application/usecases.go` | `buildCarryDTO` / `buildYieldDTO` fully DSI-INV-1 compliant — the fix exists, just unreachable from single-signal path |
| `apps/macro-indicators/cmd/server/main.go:57` | `NewRouter(useCase, logger)` — useCase already constructed with all 4 live ports; passing it to the single-signal handlers requires only signature change (Option A) or routing around them (Option B, chosen) |
| `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts:47` | `GET /carry-trade-signal` — will be replaced with `POST /snapshot {}` + projection |
| `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts:47` | `GET /yield-spread-signal` — will be replaced with `POST /snapshot {}` + projection |

---

## 8. Handoff Block

```
## [Architect] Brownfield Findings — CARRY-YIELD-SINGLE-SIGNAL-FIXTURE

- **Zone:** multi-file, single sprint (two sub-tasks, sequential)
  - Sub-task B-1: apps/macro-indicators/ → dev-macro-indicators
    - DELETE handlers_carry.go, handlers_yield.go
    - MODIFY router.go: remove 2 route entries
    - MODIFY router_test.go: remove 2 fixture-asserting tests; add retirement guard test
    - ADD usecases_test.go: anti-fixture regression guard test
  - Sub-task B-2: apps/mcp-server/ → dev-mcp-server (after B-1 deployed)
    - MODIFY carryTools.ts: GET /carry-trade-signal → POST /snapshot + carry projection
    - MODIFY dinhGiaTools.ts: GET /yield-spread-signal → POST /snapshot + yield projection
    - REBUILD mcp-server container via ops

- **Verified paths:** see §7 above

- **Design decision:** Option B (consolidate) — retire single-signal Go endpoints; TS tools
  proxy through /snapshot and project sub-object. Kills fixture-handler class definitively,
  reduces dead code surface, eliminates fixture const re-emergence risk. Single DSI-INV-1
  logic path (buildCarryDTO/buildYieldDTO in usecases.go).

- **DSI brief annotation required:** see §4 Sub-task B-3

- **Scan clean:** true ✓
- **BUILD-STANDARD:** lean (bug-fix/refactor, existing service)
- **BUILD-STANDARD-REF:** docs/standards/microservice-build-standard.md
```
