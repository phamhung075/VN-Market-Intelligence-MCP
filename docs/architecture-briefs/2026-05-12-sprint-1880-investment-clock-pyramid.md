# Sprint 1880 — Technical Design: Investment Clock Phase + Pyramid Tier MCP Tools

**Author:** Architect | **Date:** 2026-05-12 | **Sprint:** 1880 | **Size:** SPRINT-S

---

## 1. Brownfield Scan

### Existing macro field inventory

**Table `macro_indicators`** (one row per `country`, upserted by Trading Economics job):
- `cpi` REAL — Consumer Price Index level
- `inflation_rate` REAL — alternate inflation series (use as secondary confirmation)
- `manufacturing_pmi` REAL — headline PMI (growth proxy)
- `gdp_growth` REAL — GDP growth % (growth proxy, less frequent)
- `country` TEXT — filter on `country = 'Vietnam'`

**Table `commodity_prices`** (one row per source, latest snapshot):
- `brent_crude_usd`, `gold_usd_per_oz`, `usd_vnd_rate`, `vix`, `dxy`, `sp500`, etc.

**Table `sbv_rates`** (latest SBV snapshot):
- `refinancing_rate_pct`, `max_deposit_rate_pct`, `overnight_rate_pct`

**Table `tracked_indicators`** (key-value append log):
- `indicator = 'fed_funds_rate'` — Fed rate
- `indicator = 'market_earning_yield'` — used by Dinh Gia
- `indicator = 'market_median_pe'`

### Signal choice for 1880a

Growth proxy: `macro_indicators.manufacturing_pmi` (Vietnam row).
- Threshold: PMI > 50 = expansion (growth UP); ≤ 50 = contraction (growth DOWN).
- Rationale: PMI is the highest-frequency growth signal already in DB (refreshed by Trading Economics job). `gdp_growth` is quarterly — too stale for regime detection. PMI aligns with Investment Clock academic convention.

Inflation proxy: `macro_indicators.cpi`.
- Threshold: CPI > 3.0 = inflation HIGH; ≤ 3.0 = inflation LOW.
- Rationale: SBV target band is 4%; 3.0 is a practical rising-pressure threshold. `inflation_rate` column exists as fallback when `cpi` is NULL.
- Fallback chain: `cpi` → `inflation_rate` → unavailable (return null phase).

### Existing pattern reused

`get_macro_snapshot` reads DB via `getDb()` + `initDatabase()` inline inside the tool handler (no use-case layer for pure reads). Same pattern applies here — these are pure-read tools with no side effects.

Domain service folder for pure functions: `apps/mcp-server/src/domain/services/macro/` (contains `carryTradeSignal.ts`, `yieldSpreadSignal.ts`). Both tools' classification logic belongs here per DDD layer rules.

### No existing Investment Clock or Pyramid service found

Grep confirmed zero matches for `investmentClock`, `pyramidTier`, `asset_class` across the codebase. These are net-new pure functions.

---

## 2. DDD Layer Assignment

| Artifact | Layer | Path |
|---|---|---|
| `classifyInvestmentClockPhase(pmi, cpi)` pure fn | **domain** | `apps/mcp-server/src/domain/services/macro/investmentClock.ts` |
| `classifyPyramidTier(assetClass)` pure fn | **domain** | `apps/mcp-server/src/domain/services/macro/pyramidTier.ts` |
| `registerInvestmentClockTool(server)` MCP handler | **interface** | `apps/mcp-server/src/interface/mcp/tools/macro/investmentClockTools.ts` |
| Unit tests | — | `apps/mcp-server/src/__tests__/1880a-investment-clock.test.ts` |
| Unit tests | — | `apps/mcp-server/src/__tests__/1880b-pyramid-tier.test.ts` |

**Files to modify:**
- `apps/mcp-server/src/domain/services/macro/index.ts` — add exports for both domain services
- `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` — add `registerInvestmentClockTool` export
- `apps/mcp-server/src/interface/mcp/tools/macro/registry.ts` OR `tools/registry.ts` — call registration

> Note: check whether registration is in `tools/registry.ts` or per-module barrel at import time. Per architecture doc, `registry.ts` imports module barrels; the barrel calls `register*` — follow the same barrel→registry chain.

---

## 3. File Layout (5 files total)

```
CREATE:
  apps/mcp-server/src/domain/services/macro/investmentClock.ts      (~35 LOC)
  apps/mcp-server/src/domain/services/macro/pyramidTier.ts          (~30 LOC)
  apps/mcp-server/src/interface/mcp/tools/macro/investmentClockTools.ts  (~55 LOC)
  apps/mcp-server/src/__tests__/1880a-investment-clock.test.ts      (~50 LOC)
  apps/mcp-server/src/__tests__/1880b-pyramid-tier.test.ts          (~40 LOC)

MODIFY:
  apps/mcp-server/src/domain/services/macro/index.ts                (+2 export lines)
  apps/mcp-server/src/interface/mcp/tools/macro/index.ts            (+1 export line)
```

**Bundling rationale:** Both tools share one handler file (`investmentClockTools.ts`) because they are co-located in the same SSOT layer (Layer 8), trivially small, and registering two tools from one file matches the existing `carryTools.ts` pattern (which also exposes multiple tools from one file). The domain services are separated because they are logically independent pure functions with different test surfaces.

---

## 4. Investment Clock Classification Rule

### 2×2 Truth Table

| Growth signal | Inflation signal | Phase |
|---|---|---|
| PMI > 50 (UP) | CPI ≤ 3.0 (LOW) | **Recovery** — growth recovering, inflation contained |
| PMI > 50 (UP) | CPI > 3.0 (HIGH) | **Overheat** — growth strong, inflation rising |
| PMI ≤ 50 (DOWN) | CPI > 3.0 (HIGH) | **Stagflation** — growth weak, inflation high |
| PMI ≤ 50 (DOWN) | CPI ≤ 3.0 (LOW) | **Reflation** — growth weak, inflation low (stimulus phase) |

### Thresholds

```typescript
const PMI_EXPANSION_THRESHOLD = 50;    // standard PMI neutral
const CPI_PRESSURE_THRESHOLD   = 3.0;  // VN context: SBV target 4%, early-warning at 3%
```

### Null handling

If `manufacturing_pmi` IS NULL and `gdp_growth` IS NULL → return `{ phase: null, reason: "insufficient_data" }`.
If `cpi` IS NULL → fall back to `inflation_rate`. If both NULL → return `{ phase: null, reason: "insufficient_data" }`.

---

## 5. Pyramid Tier Mapping Strategy

**Decision: static lookup table with normalized lowercase matching.**

Rationale: the input space is finite and well-known for VN market context. Regex adds fragility with no benefit at this scale. A `Map<string, Tier>` with `assetClass.toLowerCase().trim()` normalization covers all PO examples and future additions without regex maintenance burden.

### Mapping table (12 entries — covers VN + global asset classes)

| Input string | Tier |
|---|---|
| `"cash"` | `cash` |
| `"money market"` | `cash` |
| `"t-bill"` | `cash` |
| `"government bond"` | `bonds` |
| `"corporate bond"` | `bonds` |
| `"bond"` | `bonds` |
| `"vn equity"` | `equity` |
| `"equity"` | `equity` |
| `"stock"` | `equity` |
| `"reit"` | `alt` |
| `"gold"` | `alt` |
| `"commodity"` | `alt` |
| `"futures"` | `alt` |
| `"private equity"` | `alt` |
| `"crypto"` | `speculative` |
| `"nft"` | `speculative` |
| `"warrant"` | `speculative` |
| `"penny stock"` | `speculative` |

**Unknown input:** return `{ tier: null, reason: "unknown_asset_class" }` — never throw.

### Type definition

```typescript
export type InvestmentClockPhase = "Recovery" | "Overheat" | "Stagflation" | "Reflation";
export type PyramidTier = "cash" | "bonds" | "equity" | "alt" | "speculative";
```

---

## 6. MCP Tool Handler Design (`investmentClockTools.ts`)

### `get_investment_clock_phase`

- **Input:** no required params. Optional `_testSnapshot` (PMI + CPI values) for test injection — mirrors `_testCommodityClient` pattern in `macroTools.ts`.
- **Production path:** `getDb()` → `SELECT manufacturing_pmi, cpi, inflation_rate FROM macro_indicators WHERE country = 'Vietnam' ORDER BY fetched_at DESC LIMIT 1`
- **Output JSON:**
  ```json
  {
    "phase": "Recovery",
    "pmi": 51.2,
    "cpi": 2.8,
    "growth_signal": "UP",
    "inflation_signal": "LOW",
    "thresholds": { "pmi_expansion": 50, "cpi_pressure": 3.0 },
    "fetched_at": "<ISO>"
  }
  ```
- **I/O:** DB read only (no fetch, no write). Deterministic given same DB state.

### `get_pyramid_tier`

- **Input:** `asset_class: z.string()` (required).
- **No DB access** — pure static lookup, truly zero I/O.
- **Output JSON:**
  ```json
  {
    "asset_class": "VN equity",
    "tier": "equity",
    "tier_description": "Listed equity — higher risk, higher return potential"
  }
  ```

### MCP return format (mandatory per dev-standards)

```typescript
return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
```

---

## 7. Test Plan

### 1880a — `classifyInvestmentClockPhase` (domain unit tests)

| # | Fixture | Expected |
|---|---|---|
| 1 | PMI=52, CPI=2.5 | `Recovery` |
| 2 | PMI=54, CPI=3.8 | `Overheat` |
| 3 | PMI=48, CPI=4.1 | `Stagflation` |
| 4 | PMI=47, CPI=2.1 | `Reflation` |
| 5 | PMI=50 (boundary), CPI=3.0 (boundary) | `Reflation` (≤ is DOWN, ≤ is LOW) |
| 6 | PMI=null, CPI=null | `{ phase: null, reason: "insufficient_data" }` |
| 7 | PMI=null, CPI=3.5, gdp_growth=2.1 (fallback) | `Stagflation` (gdp_growth>0 = UP, CPI HIGH) |
| 8 | PMI=51, CPI=null, inflation_rate=3.2 | `Overheat` (inflation_rate fallback) |

Note: test cases 7 and 8 require the domain function to accept an explicit `gdpGrowth` fallback param and `inflationRate` fallback param alongside `pmi` and `cpi`. Design the domain fn signature as:

```typescript
classifyInvestmentClockPhase(inputs: {
  pmi: number | null;
  cpi: number | null;
  gdpGrowth?: number | null;    // fallback growth proxy
  inflationRate?: number | null; // fallback inflation proxy
}): { phase: InvestmentClockPhase | null; reason?: string; growthSignal: "UP" | "DOWN" | null; inflationSignal: "HIGH" | "LOW" | null }
```

### 1880b — `classifyPyramidTier` (domain unit tests)

| # | Input | Expected |
|---|---|---|
| 1 | `"VN equity"` | `equity` |
| 2 | `"crypto"` | `speculative` |
| 3 | `"government bond"` | `bonds` |
| 4 | `"gold"` | `alt` |
| 5 | `"cash"` | `cash` |
| 6 | `"CRYPTO"` (uppercase) | `speculative` (normalization) |
| 7 | `"  VN Equity  "` (whitespace) | `equity` (trim) |
| 8 | `"exotic_derivative_xyz"` | `{ tier: null, reason: "unknown_asset_class" }` |

### MCP integration smoke tests (in same test files, using `_testSnapshot` injection)

- `get_investment_clock_phase` with `_testSnapshot={pmi:52,cpi:2.5}` → text contains `"Recovery"`
- `get_pyramid_tier` with `asset_class="VN equity"` → text contains `"equity"`

Tests use `bun:test`. No real DB access — domain functions are pure, MCP handler tests use injection pattern. Test files placed in `apps/mcp-server/src/__tests__/`.

---

## 8. Risk Flags

**R1 — Stale macro_indicators row (medium risk).**
The `macro_indicators` table has a `UNIQUE(country)` constraint — only one row per country, overwritten on each job cycle. If the Trading Economics job hasn't run recently, PMI/CPI values may be weeks old. The tool must surface `fetched_at` in the response so the caller can judge staleness. No alert needed (not a production-critical path). Mitigation already present: `fetched_at` column exists on the table.

**R2 — NULL PMI in production (low risk).**
Trading Economics scrape may fail to populate `manufacturing_pmi` if the TE page structure changes. The null-fallback to `gdp_growth` and the `insufficient_data` return handles this gracefully. No silent wrong answer.

**R3 — Open-ended `asset_class` string (low risk).**
The static map will return `null` for unrecognized inputs. This is the correct behavior per spec ("pure function, no throw"). The MCP caller receives a structured null rather than an exception.

**R4 — DDD boundary violation risk (mitigated by design).**
Both classification functions are domain-pure (no `infrastructure/` imports). The MCP handler does the DB read in the interface layer and passes plain values to the domain function. This is the same pattern as `carryTradeSignal.ts` (domain) + `carryTools.ts` (interface reads DB, calls domain fn). No violation if implemented as specified.

**R5 — CPI threshold generalization (low risk, flag for future).**
The 3.0% CPI threshold is calibrated for Vietnam SBV context (target 4%). If this tool is extended to global regime detection, the threshold must be parameterized. Document this assumption in JSDoc. Not in scope for 1880.

---

## 9. PM Handoff — Atomic Tasks

### Task 1880a: `get_investment_clock_phase`

**Files:**
- CREATE `apps/mcp-server/src/domain/services/macro/investmentClock.ts`
- CREATE `apps/mcp-server/src/interface/mcp/tools/macro/investmentClockTools.ts` (registration for both tools)
- CREATE `apps/mcp-server/src/__tests__/1880a-investment-clock.test.ts`
- MODIFY `apps/mcp-server/src/domain/services/macro/index.ts` (add export)
- MODIFY `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` (add export)

**Acceptance criteria:**
- `classifyInvestmentClockPhase({pmi:52,cpi:2.5})` returns `{phase:"Recovery",...}`
- `classifyInvestmentClockPhase({pmi:null,cpi:null})` returns `{phase:null,reason:"insufficient_data",...}`
- MCP tool `get_investment_clock_phase` returns valid JSON with `phase` key
- 8 unit tests pass, no DB access in domain tests
- Return format: `{ content: [{ type: "text", text: JSON.stringify(...) }] }`

**Estimated LOC:** ~90 (35 domain + 55 interface handler)

---

### Task 1880b: `get_pyramid_tier`

**Files:**
- CREATE `apps/mcp-server/src/domain/services/macro/pyramidTier.ts`
- CREATE `apps/mcp-server/src/__tests__/1880b-pyramid-tier.test.ts`
- `investmentClockTools.ts` already created in 1880a — add `registerPyramidTierTool` to same file

**Acceptance criteria:**
- `classifyPyramidTier("VN equity")` returns `{tier:"equity",...}`
- `classifyPyramidTier("crypto")` returns `{tier:"speculative",...}`
- `classifyPyramidTier("CRYPTO")` returns `{tier:"speculative",...}` (case-insensitive)
- `classifyPyramidTier("unknown_xyz")` returns `{tier:null,reason:"unknown_asset_class"}`
- MCP tool `get_pyramid_tier` requires `asset_class` param, returns valid JSON
- 8 unit tests pass, zero I/O in domain function
- Return format: `{ content: [{ type: "text", text: JSON.stringify(...) }] }`

**Estimated LOC:** ~30 domain + 25 handler addition = ~55 LOC (shared handler file)

---

**Total sprint estimate:** ~145 LOC across 5 new files + 2 small modifications. Within SPRINT-S budget (≤30 LOC limit applies per-tool domain function, not total; handler + tests are interface/test layer).

**Dependency:** 1880b handler can be written into the same file as 1880a handler. Recommended sequencing: 1880a first (establishes `investmentClockTools.ts` + barrel wiring), then 1880b appends `registerPyramidTierTool` to that file and adds `pyramidTier.ts` domain service.
