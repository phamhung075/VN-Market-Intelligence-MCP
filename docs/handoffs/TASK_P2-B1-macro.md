---
task_id: "P2-B1"
title: "MCP Tool Handler HTTP Rewire (R-3 Unblock)"
owner: "dev-mcp-server"
estimate: "2 hours"
priority: "HIGHEST — starts immediately (no blocker)"
blocks: ["P2-B2"]
blocked_by: []
goals: ["G5b", "R-3"]
phase: 2
charter_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md"
plan_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md"
---

# TASK P2-B1 — MCP Tool Handler HTTP Rewire (R-3 Unblock)

**Cycle:** c282 cycle-41 (macro-indicators pilot)  
**Dispatch timestamp:** 2026-05-23T18:52:00Z  
**Owner:** dev-mcp-server  
**Estimate:** 2 hours  
**AC count:** 7  
**Priority:** HIGHEST — R-3 critical unblock  

---

## Summary

4 MCP tools currently bypass the macro-indicators HTTP service entirely via direct domain imports within mcp-server. This violates DDD: the interface layer of mcp-server imports domain services (`computeCarryTradeSignal`, `computeYieldSpreadSignal`, `getMacroCalendar`) that belong to the macro-indicators bounded context.

**G5b requires all 4 tools to route through HTTP to the Go service at port 5004.**

This task rewires the 4 MCP tool handlers in TS to call HTTP endpoints instead of importing domain logic directly. Go handler stubs are created returning fixture JSON (P2-X1 extracts real primitives, P2-X3 upgrades stubs to real logic).

---

## Files to Modify

**TypeScript (interface layer — mcp-server):**
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` (MODIFY)
- `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts` (MODIFY)
- `apps/mcp-server/src/interface/mcp/tools/macro/dinhGiaTools.ts` (MODIFY)

**Go (interface layer — macro-indicators):**
- `apps/macro-indicators/pkg/interface/http/router.go` (MODIFY — add 3 routes)
- `apps/macro-indicators/pkg/interface/http/handlers_carry.go` (CREATE — stub)
- `apps/macro-indicators/pkg/interface/http/handlers_yield.go` (CREATE — stub)
- `apps/macro-indicators/pkg/interface/http/handlers_calendar.go` (CREATE — stub)

---

## Brownfield Analysis of the 4 MCP Tools

| Tool | File | Current implementation | New implementation |
|---|---|---|---|
| `get_macro_snapshot` | `macroTools.ts` | Calls `fetchYahooFinancePrices`, `fetchSbvRates` directly + DB reads + `computeCarryTradeSignal`, `computeYieldSpreadSignal` inline | HTTP POST `http://macro-indicators:5004/snapshot` (or localhost:5004 in dev) |
| `get_carry_trade_signal` | `carryTools.ts` | Reads sbv_rates + tracked_indicators from DB, calls `computeCarryTradeSignal()` | HTTP GET `http://macro-indicators:5004/carry-trade-signal` |
| `get_yield_spread_signal` | `dinhGiaTools.ts` | Reads tracked_indicators + sbv_rates from DB, calls `computeYieldSpreadSignal()` | HTTP GET `http://macro-indicators:5004/yield-spread-signal` |
| `get_macro_calendar` | `carryTools.ts` | Calls `getMacroCalendar()` directly from mcp-server domain | HTTP GET `http://macro-indicators:5004/macro-calendar?days={days}` |

---

## Go Service Endpoints to Add

P2-B1 must ADD three new routes to `pkg/interface/http/router.go`:

1. **GET /carry-trade-signal** — stub returns fixture JSON with shape:
   ```json
   {
     "regime": "HOT_MONEY_INFLOW",
     "carrySpread": 2.8,
     "vndDepositRate": 4.2,
     "fedFundsRate": 5.33,
     "computedAt": "2026-05-23T18:52:00Z"
   }
   ```

2. **GET /yield-spread-signal** — stub returns fixture JSON with shape:
   ```json
   {
     "label": "VN_ATTRACTIVE",
     "spread": 3.45,
     "earningYield": 8.2,
     "depositRate": 4.75,
     "computedAt": "2026-05-23T18:52:00Z"
   }
   ```

3. **GET /macro-calendar?days=60** — stub returns fixture JSON with shape:
   ```json
   {
     "events": [
       {"date": "2026-05-24", "event": "US Core PCE", "impact": "HIGH"},
       {"date": "2026-05-27", "event": "VN Industrial Output", "impact": "MEDIUM"}
     ],
     "daysRequested": 60,
     "fetchedAt": "2026-05-23T18:52:00Z"
   }
   ```

---

## Sequencing Note

Dev may implement in either order:
1. **Go endpoints first, then TS handlers** — safer, avoids TS HTTP failures
2. **TS handlers first with temporary localhost:5004 bypass** — if Go endpoints not yet running

**Recommended:** Go endpoints first (handlers_carry, handlers_yield, handlers_calendar stubs complete), then TS rewire.

---

## Acceptance Criteria

### AC-1: Direct Domain Imports Removed

`grep -rn "computeCarryTradeSignal\|computeYieldSpreadSignal\|getMacroCalendar\|fetchYahooFinancePrices\|fetchSbvRates" apps/mcp-server/src/interface/mcp/tools/macro/` must return **0 matches** (all direct domain/infra imports removed from tool handler files).

**Smoke check:**
```bash
cd apps/mcp-server
grep -rn "computeCarryTradeSignal\|computeYieldSpreadSignal\|getMacroCalendar\|fetchYahooFinancePrices\|fetchSbvRates" src/interface/mcp/tools/macro/
# Expected: no matches (exit 0, empty stdout)
```

### AC-2: HTTP Routing

All 4 MCP tools route exclusively via HTTP client to `http://macro-indicators:5004` (containerised) or `http://localhost:5004` (local dev).

HTTP base URL read from env var **`MACRO_INDICATORS_URL`** with fallback `http://localhost:5004` — never hardcoded.

**Smoke check:**
```bash
grep -n "MACRO_INDICATORS_URL" apps/mcp-server/src/interface/mcp/tools/macro/*.ts
# Expected: ≥1 match showing env var read with fallback
grep -n "http://localhost:5004\|http://macro-indicators:5004" apps/mcp-server/src/interface/mcp/tools/macro/*.ts | wc -l
# Expected: ≤1 match (only in fallback, not hardcoded)
```

### AC-3: Graceful HTTP Failure Handling

If the Go service is unreachable, each tool returns `{ error: "macro-indicators service unavailable" }` (no crash, no unhandled rejection).

**Smoke check:**
```bash
# Manually verify each tool's error handling block
grep -A 5 "catch\|error\|macro-indicators" apps/mcp-server/src/interface/mcp/tools/macro/*.ts | head -30
# Expected: error handling block returns JSON error, not throw/reject
```

### AC-4: Go Router Routes Registered

Go router (`router.go`) has 3 new routes registered: `GET /carry-trade-signal`, `GET /yield-spread-signal`, `GET /macro-calendar`.

`go build ./...` exits 0 in apps/macro-indicators.

**Smoke check:**
```bash
grep -n "GET.*carry-trade-signal\|GET.*yield-spread-signal\|GET.*macro-calendar" apps/macro-indicators/pkg/interface/http/router.go
# Expected: 3 matches (route registrations)
cd apps/macro-indicators && go build ./...
# Expected: exit 0
```

### AC-5: Smoke Test — HTTP 200 Responses

With Go service running (`go run ./cmd/server`), invoke each MCP tool via curl. Each endpoint returns HTTP 200 (or stub 501 if primitives not yet landed) with correct `Content-Type: application/json`.

**Smoke check:**
```bash
# In separate terminal, start Go service:
cd apps/macro-indicators && go run ./cmd/server

# In another terminal:
curl -s http://localhost:5004/health
# Expected: {"status":"ok","service":"macro-indicators","port":5004}

curl -s http://localhost:5004/carry-trade-signal
# Expected: HTTP 200 + JSON with regime/carrySpread/...

curl -s http://localhost:5004/yield-spread-signal
# Expected: HTTP 200 + JSON with label/spread/...

curl -s "http://localhost:5004/macro-calendar?days=60"
# Expected: HTTP 200 + JSON with events array
```

**Paste curl output to RETURN block** (below).

### AC-6: Zero New Cross-Service Imports

`grep -rn "from.*apps/macro-indicators\|require.*macro-indicators" apps/mcp-server/src/` must return **0 new imports** (no cross-service imports added in TS zone beyond existing ones before P2-B1).

**Smoke check:**
```bash
# Verify no new domain imports from macro-indicators:
grep -rn "import.*from.*\.\.\/\.\.\/\.\.\/\.\.\/macro-indicators\|from.*../../macro-indicators" apps/mcp-server/src/
# Expected: 0 matches (only HTTP calls, no imports)
```

### AC-7: R-1 Guard — No Randomization

`grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/` must exit 1 (zero matches in Go pilot zone).

**Smoke check:**
```bash
grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/
# Expected: exit 1 (no matches)
```

---

## Hard Gates (Binding)

### R-1 Determinism Check (AC-7)

`grep -rE "math/rand|rand\.Intn|rand\.Float" apps/macro-indicators/` must exit 1 (zero matches).

**Failure mode:** If randomization detected in Go handlers, task BLOCKED until removed. Commit rejected.

### G12 DoD Gate (Sandbox Green)

`cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` must exit 0 before DONE.

The sandbox must remain green throughout P2-B1 even though new Go handler stubs are added.

**Failure mode:** If sandbox exits non-zero after P2-B1 changes, task BLOCKED until repaired. Commit rejected.

---

## Anchor Discipline

Before commit:
```bash
git log --oneline --ancestry-path 1776df8e..HEAD | tail -1
# Expected: non-empty (ancestor chain intact)
```

After commit:
```bash
git log --oneline --ancestry-path 1776df8e..HEAD | tail -1
# Expected: non-empty (no rewrite)
```

**Failure mode:** If ancestor chain broken, commit rejected per protocol.

---

## Out-of-Zone Bans (Forbidden Reads/Writes)

Do NOT modify:
- `apps/technical-analysis/` (FROZEN — TA pilot CLOSED)
- `apps/mcp-server/src/domain/` (business logic stays in mcp-server domain for now)
- `docs/data/pilot-status-macro-indicators.json` (SSOT — PM/QA owned)
- `.golangci.yml` (not yet created; P2-A1 creates this)
- `.github/workflows/ci.yml` (not yet modified; P2-A2 adds macro-indicators job)

**In zone:**
- `apps/mcp-server/src/interface/mcp/tools/macro/` (TS handler rewire)
- `apps/macro-indicators/pkg/interface/http/` (Go HTTP handlers)

---

## Constraints (Binding)

| Constraint | Enforcement |
|---|---|
| **L84 staging** | `git add <explicit-path>` per file. Never `git add -A` or `git add .` |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` |
| **Anchor 1776df8e** | Must remain ancestor before AND after every commit |
| **FRED_API_KEY ban** | Zero FRED_API_KEY references in committed .go/.ts files |

---

## Commit Subject

```
feat(mcp-server,macro-indicators): cycle-41 — P2-B1 MCP HTTP rewire (R-3 unblock) — 4 macro tools → port 5004
```

Include in commit body:
- List of 4 tools rewired (get_macro_snapshot, get_carry_trade_signal, get_yield_spread_signal, get_macro_calendar)
- 3 new Go routes added (/carry-trade-signal, /yield-spread-signal, /macro-calendar)
- AC-7 verification (R-1 grep result)
- G12 sandbox output (exit 0, all tiers green)
- Anchor reachability check

---

## Implementation Guidance

### Go Handlers (Stubs)

Each handler file should follow this pattern:

**handlers_carry.go:**
```go
package http

import (
	"encoding/json"
	"net/http"
)

func (h *Handler) HandleCarryTradeSignal(w http.ResponseWriter, r *http.Request) {
	// TODO(P2-X3): call real macro_carry_trade_signal.Compute() here
	// For now, return fixture JSON with correct shape
	resp := map[string]interface{}{
		"regime":            "HOT_MONEY_INFLOW",
		"carrySpread":       2.8,
		"vndDepositRate":    4.2,
		"fedFundsRate":      5.33,
		"computedAt":        "2026-05-23T18:52:00Z",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
```

**handlers_yield.go:** Similar pattern, different shape.  
**handlers_calendar.go:** Similar pattern with events array.

Register in router.go:
```go
mux.HandleFunc("GET /yield-spread-signal", h.HandleYieldSpreadSignal)
mux.HandleFunc("GET /carry-trade-signal", h.HandleCarryTradeSignal)
mux.HandleFunc("GET /macro-calendar", h.HandleMacroCalendar)
```

### TypeScript Handlers (Rewrite)

Each tool should:

1. Read `MACRO_INDICATORS_URL` env var (fallback `http://localhost:5004`)
2. Construct HTTP client call (e.g., `fetch()` or axios)
3. Return HTTP response JSON directly
4. Handle HTTP errors gracefully

Example (macroTools.ts):
```typescript
export const get_macro_snapshot = tool({
  name: "get_macro_snapshot",
  description: "...",
  handler: async (input: Input) => {
    const baseUrl = process.env.MACRO_INDICATORS_URL || "http://localhost:5004";
    try {
      const response = await fetch(`${baseUrl}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        return { error: "macro-indicators service unavailable" };
      }
      return response.json();
    } catch (error) {
      return { error: "macro-indicators service unavailable" };
    }
  }
});
```

---

## RETURN

When DONE, provide:

1. **Commits:** List all commits (dev + signal)
2. **Curl output:** Paste all 3 endpoint curl responses from AC-5 smoke test
3. **Sandbox output:** Paste `go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` output
4. **R-1 verification:** Paste grep exit code + match count (must be exit 1)
5. **Anchor check:** Paste `git log --oneline --ancestry-path 1776df8e..HEAD | tail -1` output

**Example return block:**

```
COMMITS:
- 1a2b3c4 (dev-mcp-server impl — TS handlers + Go stubs)
- 5d6e7f8 (dev-mcp-server signal — completion)

CURL OUTPUTS:
$ curl -s http://localhost:5004/carry-trade-signal
{"regime":"HOT_MONEY_INFLOW","carrySpread":2.8,"vndDepositRate":4.2,"fedFundsRate":5.33,"computedAt":"2026-05-23T18:52:00Z"}

$ curl -s http://localhost:5004/yield-spread-signal
{"label":"VN_ATTRACTIVE","spread":3.45,"earningYield":8.2,"depositRate":4.75,"computedAt":"2026-05-23T18:52:00Z"}

$ curl -s "http://localhost:5004/macro-calendar?days=60"
{"events":[{"date":"2026-05-24","event":"US Core PCE","impact":"HIGH"},{"date":"2026-05-27","event":"VN Industrial Output","impact":"MEDIUM"}],"daysRequested":60,"fetchedAt":"2026-05-23T18:52:00Z"}

SANDBOX OUTPUT:
tier=primitive: 3 total, 3 pass, 0 fail → OK (exit 0)
tier=module: 2 total, 2 pass, 0 fail → OK (exit 0)
tier=all: 5 total, 5 pass, 0 fail → OK (exit 0)

R-1 VERIFICATION:
$ grep -rE "math/rand|rand\.Intn|rand\.Float" apps/macro-indicators/pkg/
# Exit 1 (no matches)

ANCHOR CHECK:
$ git log --oneline --ancestry-path 1776df8e..HEAD | tail -1
9a8b7c6 feat(mcp-server,macro-indicators): cycle-41 — P2-B1 MCP HTTP rewire...
```
