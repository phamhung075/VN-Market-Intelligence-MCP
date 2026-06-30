# Dev Task — IND-P1 MCP Proxy Layer (4 Tools)

**Task ID:** IND-P1-MCP-PROXY-INDICATORS
**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Tier:** P1
**Zone:** apps/mcp-server (TypeScript)
**Dev Agent:** dev-mcp-server
**Created:** 2026-06-30T03:00:00Z
**PM Decomposition of:** BA-IND-P1-MOMENTUM-RS
**Depends-On:** IND-P1-TECHNICAL-ANALYSIS-SUITE, IND-P1-FOREIGN-ACCUM-RANK (HTTP endpoints must be LIVE before MCP layer begins)

---

## Scope

Implement the **MCP proxy layer** for all 4 new indicator tools:

1. **`get_roc_momentum`** — HTTP proxy to `POST /ta/roc-momentum` (apps/technical-analysis)
2. **`get_relative_strength`** — HTTP proxy to `POST /ta/relative-strength` (apps/technical-analysis)
3. **`get_52w_proximity`** — HTTP proxy to `POST /ta/52w-proximity` (apps/technical-analysis)
4. **`get_foreign_accum_rank`** — HTTP proxy to `POST /price/foreign-accum-rank` (apps/stock-price)

This is a **serial dependency task** — wait for both dev-technical-analysis and dev-stock-price endpoints to be LIVE before starting MCP work.

---

## Mandatory Architecture (from Architect Blueprint)

### MCP Tool Registration (TypeScript `src/interface/mcp/tools/`)

**New tool files (4):**
- `rocMomentumTools.ts` — register `get_roc_momentum`; schema + handler
- `relativeStrengthTools.ts` — register `get_relative_strength`; schema + handler
- `52wProximityTools.ts` — register `get_52w_proximity`; schema + handler
- `foreignAccumRankTools.ts` — register `get_foreign_accum_rank`; schema + handler

Each file follows the existing `volatilityIndicatorTools.ts` pattern:
- Import client function from `microservices/clients.ts`
- Define MCP tool schema (inputs, outputs)
- Register via `server.tool(name, description, schema, handler)`
- Handler calls client function + returns response

### Client Functions (TypeScript `src/infrastructure/microservices/clients.ts`)

**New client functions (4):**
- `computeROCMomentum(watchlistTickers?: string[]): Promise<ROCMomentumResponse>`
  - Calls `POST http://{TA_SERVICE_URL}/ta/roc-momentum`
  - Returns response with per-ticker ROC data + `momentum_factor_z` scalar
  
- `computeRelativeStrength(watchlistTickers?: string[]): Promise<RSResponse>`
  - Calls `POST http://{TA_SERVICE_URL}/ta/relative-strength`
  - Returns response with per-ticker RS data + `market_rs_composite` scalar

- `compute52WProximity(watchlistTickers?: string[]): Promise<ProximityResponse>`
  - Calls `POST http://{TA_SERVICE_URL}/ta/52w-proximity`
  - Returns response with per-ticker proximity data + `net_new_highs` scalar + `denominator_ma200`

- `computeForeignAccumRank(watchlistTickers?: string[]): Promise<ForeignAccumResponse>`
  - Calls `POST http://{STOCK_PRICE_SERVICE_URL}/price/foreign-accum-rank`
  - Returns response with per-ticker accum data + `foreign_accum_z_market` scalar + `adtv_unit`

**Environment variables (already exist or add if needed):**
- `TA_SERVICE_URL` (default: `http://localhost:5003`) — existing
- `STOCK_PRICE_SERVICE_URL` (default: `http://localhost:5000`) — existing or add

### Tool Registry (TypeScript `src/interface/mcp/tools/registry.ts`)

**Modify:** 
- Import 4 new tool registration functions
- Call `registerROCMomentumTools()`, `registerRelativeStrengthTools()`, `register52WProximityTools()`, `registerForeignAccumRankTools()` in the registry sequence

Follow existing pattern (e.g., `registerVolatilityIndicatorTools()`).

---

## Functional Requirements (Distilled from BA Spec)

### Tool 1: `get_roc_momentum`

**Input:** Optional `watchlist_tickers` array (fallback to env var `WATCHLIST_TICKERS`).
**Output:**
- Per-ticker fields: `ticker`, `roc_12_1`, `z_score`, `decile`, `label` (MOMENTUM_LEADER/NEUTRAL/LAGGARD), `null_reason` if applicable
- Aggregate scalar: `momentum_factor_z` (median z-score across deciles)
- `computed_as_of` (ISO8601 timestamp)

**Proxy behavior:**
- Call `POST http://TA_SERVICE_URL/ta/roc-momentum`
- If downstream service responds 200: pass through response as-is
- If downstream service errors or times out: return error with diagnostic message

### Tool 2: `get_relative_strength`

**Input:** Optional `watchlist_tickers` array.
**Output:**
- Per-ticker fields: `ticker`, `rs_63d_pct`, `rs_126d_pct`, `rs_252d_pct`, `mansfield_rs_63d`, `mansfield_rs_126d`, `mansfield_rs_252d`, `composite_rs_score`, `composite_label` (STRONG/NEUTRAL/WEAK), `null_reason` if applicable, `low_sample_warning` if N<5
- Aggregate scalar: `market_rs_composite` (mean composite RS across watchlist)
- `computed_as_of` (ISO8601 timestamp)

**Proxy behavior:** Same as Tool 1.

### Tool 3: `get_52w_proximity`

**Input:** Optional `watchlist_tickers` array.
**Output:**
- Per-ticker fields: `ticker`, `high_52w`, `low_52w`, `pct_from_52w_high`, `pct_from_52w_low`, `above_ma50`, `above_ma200`, `proximity_label` (AT_HIGH/NEAR_HIGH/MID_RANGE/NEAR_LOW/AT_LOW), `new_high_today`, `null_reason` if applicable
- Aggregate fields: `new_highs_count`, `new_lows_count`, `net_new_highs` (scalar), `pct_above_ma50`, `pct_above_ma200`, `denominator_ma200` (sample count for MA200 calculation)
- `computed_as_of` (ISO8601 timestamp)

**Proxy behavior:** Same as Tool 1.

### Tool 4: `get_foreign_accum_rank`

**Input:** Optional `watchlist_tickers` array.
**Output:**
- Per-ticker fields: `ticker`, `net_flow_5d_raw`, `net_flow_20d_raw`, `cum_net_flow_5d_normalized`, `cum_net_flow_20d_normalized`, `z_score_5d`, `rank`, `label` (ACCUMULATING/NEUTRAL/DISTRIBUTING), `room_exhaustion` (boolean or null), `null_reason` if applicable
- Aggregate scalar: `foreign_accum_z_market` (mean z-score across tickers with >=5 bars; positive = net market accumulation)
- Response includes: `adtv_unit: "shares"`, `computed_as_of` (ISO8601 timestamp)

**Proxy behavior:** Same as Tool 1.

---

## MCP Tool Schema (JSON Schema Fragment)

**Common input schema:**
```json
{
  "type": "object",
  "properties": {
    "watchlist_tickers": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Optional override of watchlist. If omitted, uses server-configured WATCHLIST_TICKERS."
    }
  },
  "required": []
}
```

**Output schema:** Per-tool response object (typed via TypeScript interfaces, passed to MCP schema generator).

---

## Reuse Patterns (Follow Existing MCP Layer)

- **Entry point:** `volatilityIndicatorTools.ts` demonstrates tool registration, schema definition, handler wiring.
- **Client pattern:** `clients.ts` line 245+ shows `computeVolatilityIndicators()` function; follow this for 4 new functions.
- **Registry pattern:** `registry.ts` line 262+ shows `registerVolatilityIndicatorTools()` call; add 4 new registrations.
- **Error handling:** Proxy should catch HTTP errors and return MCP-formatted error responses (consistent with existing tools).

---

## Testing Strategy

- **Unit tests:** Verify client functions correctly format HTTP requests and parse responses.
- **Integration tests:** Verify MCP tools correctly invoke client functions and return expected MCP schema.
- **E2E:** Once GO backend endpoints are live, call each MCP tool and verify response structure matches BA spec.

---

## Acceptance Criteria (QA Gate)

1. All 4 MCP tools are registered and callable via MCP server.
2. Each tool correctly proxies to the corresponding HTTP endpoint (TA service or stock-price service).
3. Responses include per-ticker data + aggregate scalar (as per BA spec).
4. Honest-null fields (null_reason, room_exhaustion: null) are passed through unchanged from backend.
5. MCP schema matches the per-tool response structure (no truncation or aliasing).
6. Tools are consumed by >=1 helper agent (MW/CHEF/DP/AC/TNB/NS) — verified via session logs.

---

## Dependencies

- **Upstream (blocking):**
  - `IND-P1-TECHNICAL-ANALYSIS-SUITE` — endpoints must be LIVE: `POST /ta/roc-momentum`, `POST /ta/relative-strength`, `POST /ta/52w-proximity`
  - `IND-P1-FOREIGN-ACCUM-RANK` — endpoint must be LIVE: `POST /price/foreign-accum-rank`
  - Both zones (technical-analysis + stock-price) services must be running on localhost:5003 and localhost:5000 (or configured via env vars)

- **Shared:** Existing MCP server infrastructure (Bun, mcp npm package, tool registry).

---

## Files Overview (What to Create/Modify)

**Create (4 new):**
- src/interface/mcp/tools/rocMomentumTools.ts
- src/interface/mcp/tools/relativeStrengthTools.ts
- src/interface/mcp/tools/52wProximityTools.ts
- src/interface/mcp/tools/foreignAccumRankTools.ts

**Modify (2):**
- src/infrastructure/microservices/clients.ts — add 4 client functions
- src/interface/mcp/tools/registry.ts — import + register 4 tools

**Total touched files: 4 new + 2 modified = 6 files in apps/mcp-server**

---

## Delivery Timeline

Estimated effort: **Small** (S — pure proxy wiring, no business logic).
Single dev, ~2–3h to implement once backend endpoints are live.
**Critical:** Backend (dev-technical-analysis + dev-stock-price) must SHIP FIRST. This task waits for their HTTP endpoints.

---

## Sequence

1. **dev-technical-analysis** ships 3 endpoints → QA signs off
2. **dev-stock-price** ships 1 endpoint → QA signs off
3. **dev-mcp-server** wires MCP proxy layer for all 4 → QA signs off

All 4 tools go LIVE to helper agents simultaneously (DP/CHEF/MW/AC/TNB/NS feed them into Fear & Greed composition).

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files created (4):**
  - `apps/mcp-server/src/interface/mcp/tools/market-data/rocMomentumTools.ts` — registers `get_roc_momentum` (#181)
  - `apps/mcp-server/src/interface/mcp/tools/market-data/relativeStrengthTools.ts` — registers `get_relative_strength` (#182)
  - `apps/mcp-server/src/interface/mcp/tools/market-data/52wProximityTools.ts` — registers `get_52w_proximity` (#183)
  - `apps/mcp-server/src/interface/mcp/tools/market-data/foreignAccumRankTools.ts` — registers `get_foreign_accum_rank` (#184)
  - `apps/mcp-server/src/__tests__/IND-P1-MCP-PROXY-INDICATORS.test.ts` — 22 tests (REG + NULL-passthrough + ERR + FWRD)
- **Files modified (2):**
  - `apps/mcp-server/src/infrastructure/microservices/clients.ts` — added 4 typed client functions + response interfaces (computeROCMomentum, computeRelativeStrength, compute52WProximity, computeForeignAccumRank)
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — imported + registered 4 new tools (#181–#184)
- **Tests written:** `src/__tests__/IND-P1-MCP-PROXY-INDICATORS.test.ts` — 22 assertions GREEN (REG-1..4, NULL-1..10, ERR-1..6, FWRD-1..2)
- **Git commits:** `7e098482` feat(IND-P1-MCP-PROXY-INDICATORS): wire 4 indicator MCP proxy tools
- **Type check:** clean (`bun tsc --noEmit` exit 0)
- **bun test (new file):** 22 pass / 0 fail
- **bun test (full suite):** 13866 pass / 90 fail (90 are pre-existing failures in `_deprecated/` + SHG migration coherence — none in my files)
- **Tool count:** 182 tools (pre-task baseline 178 + 4 new) — `gen-tool-registry.ts` dry-run verified
- **Scheduler count:** 3 cron.schedule entries (unchanged — scheduler not touched)
- **Docs updated:** `docs/data/tool-registry.json` regenerated via `gen-tool-registry.ts` | `docs/data/orch/orch-state.json` board row IND-P1-MCP-PROXY-INDICATORS BACKLOG→REVIEW (next_agent=qa)
- **Graphify:** skipped (no architecture docs impacted)
- **REBUILD NEEDED:** YES — mcp-server single-service rebuild required before QA can invoke tools via gateway (new TypeScript files must be compiled into the running container)
- **AC6 (helper-agent consumption):** QA-gate concern — not a build blocker; tools wired and ready post-rebuild

### Gate Evidence

| Gate | Result |
|------|--------|
| tsc --noEmit | exit 0 — clean |
| bun test (new) | 22 pass / 0 fail |
| bun test (full) | 13866 pass, 90 pre-existing fail, exit 0 |
| Tool count | 182 (gen-tool-registry.ts --dry-run) |
| Scheduler count | 3 (unchanged) |

### Honest-NULL Discipline Verification

All 4 tools pass null fields through unchanged:
- `momentum_factor_z: null` → passes through (test NULL-1)
- `market_rs_composite: null` + `low_sample_warning: true` → passes through (test NULL-4)
- `pct_above_ma200: null` when `denominator_ma200: 0` → passes through (test NULL-6)
- `room_exhaustion: null` per-ticker → passes through unchanged, NOT coerced to false (test NULL-9)
