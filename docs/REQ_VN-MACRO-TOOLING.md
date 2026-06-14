---
task_id: BA-VN-MACRO-TOOLING
sprint: VN-MACRO-TOOLING
status: SPEC-COMPLETE
author: ba
created_at: 2026-06-14
handoff_to: architect
---

# Requirements — VN-MACRO-TOOLING Sprint

**Brief source:** `docs/analysis-briefs/07-06-methodology-gap.md`
**VMT task objects (io_contracts + owners):** `docs/data/orch/orch-state.json` `.task_board.active_sprints[] | select(.id=="VN-MACRO-TOOLING")`
**Consuming skills (degraded, will flip live):** `.claude/skills/macro-health-read/` + `.claude/skills/trade-fx-pressure-decomp/`

---

## Global Acceptance Criteria (all tools must satisfy)

GA-1. **VPS routing mandatory** — every VN-source HTTP call (GSO, Customs, SBV) routes through the Vinahost VPS proxy (memory: `project_bctc_vps_proxy`). No direct call to a geo-blocked endpoint ever leaves the server process. Architecture implication: a `vpsFetch(url)` wrapper in `apps/macro-indicators/` infrastructure layer (or equivalent in mcp-server); no raw `fetch`/`http.Get` to VN gov domains.

GA-2. **Gateway-only surface** — every new tool is registered in `apps/mcp-server/src/interface/mcp/tools/macro/` (or a new `macro-vn/` sub-directory) and is reachable exclusively via `call_tool(server="vn-market", tool="<bare-name>", arguments={...})`. No direct import from outside the `interface/mcp/tools/` layer.

GA-3. **Skill switch-on contract** — the output schemas defined per-tool below are load-bearing. `macro-health-read` and `trade-fx-pressure-decomp` switch `is_estimate=true → false` by checking these exact field names. Field renames without a coordinated skill update break the switch-on.

GA-4. **Honest `is_estimate`** — every field that falls back to a seed/constant must carry `is_estimate: true` on the relevant track. No field may silently serve a static value without the flag. Follow `reference_low_confidence_handling`: confidence=0 → skip/omit; <0.2 → flag low; ≥0.2 normal.

GA-5. **Direction + delta, not point-in-time** — where the field is a rate or index, emit both the current value and a `delta` (vs prior period) and `trend` label (UP/DOWN/FLAT). Never emit a bare snapshot without a direction tag (memory: `feedback_market_data_direction`).

GA-6. **Transforms server-side** — MA3/MA5/YoY/YTD-cumulative are computed in the tool handler, not pushed to the agent caller. Agent math on raw series is forbidden.

GA-7. **Live payload probe before parser** — before the developer writes any parser for a new VPS-fetched endpoint, they MUST capture a real response sample (raw HTML or JSON). Parser written against schema comments alone is class-F1 (fail-closed-to-empty). See blocker list §8 below.

GA-8. **No hardcoded series values** — indicators, weights, and thresholds must be data-driven from the fetched source or `docs/data/system-map.json`. No magic numbers representing real economic values (memory: `feedback_no_hardcode_stats`).

GA-9. **Fail-closed behaviour** — if the VPS fetch fails: return `{is_estimate: true, error: "source_unavailable", data: null}` on that series. Never fabricate a value. Never return a misleading 200 with a static seed.

---

## Tool 1 — `get_vn_trade_balance`

**VMT task:** VMT-1-TRADE-BALANCE | **Priority:** HIGH (FIRST to implement) | **Size:** L
**Owners:** dev-macro-indicators (lead), dev-vps-crawls (fetch layer)
**Brief techniques:** T-33 (two-bloc split), T-34 (HS attribution), T-35/T-36 (processing-margin + negative-margin trap)
**Skill consumers:** `trade-fx-pressure-decomp` (primary — unlocks FX-incidence test, bloc split, margin trap), `macro-health-read` (secondary — trade track)

### FR-1 — Input contract
DDD layer: **interface**

```typescript
{
  period: "YYYY-MM" | "YTD"           // e.g. "2026-05" or "YTD"
  group_by: "bloc" | "hs_group" | "country"
  lookback_months?: number             // default 12; drives multi-year series depth
}
```

### FR-2 — Output contract (skill switch-on schema — load-bearing field names)
DDD layer: **domain** (aggregation + processing-margin computation)

```typescript
{
  period: string                        // "YYYY-MM" or "YTD"
  fetched_at: string                    // ISO-8601
  is_estimate: boolean

  total: {
    export_bn_usd: number              // billion USD, direction tag required
    import_bn_usd: number
    balance_bn_usd: number             // negative = deficit
    delta_mom_bn_usd: number           // vs prior period
    trend: "SURPLUS" | "DEFICIT" | "NARROWING" | "WIDENING"
  }

  bloc_split: {                        // Two-bloc split (T-33)
    fdi: {
      export_bn_usd: number
      import_bn_usd: number
      balance_bn_usd: number
      is_estimate: boolean
    }
    domestic: {
      export_bn_usd: number
      import_bn_usd: number
      balance_bn_usd: number
      is_estimate: boolean
    }
  }

  hs_attribution: Array<{             // HS-group breakdown (T-34)
    hs_group: string                  // e.g. "electronics_components", "oil", "textile", "machinery"
    export_bn_usd: number
    import_bn_usd: number
    net_bn_usd: number
    processing_margin: number         // export / import ratio (T-35); <1.0 = value-destroying
    margin_trend: "EXPANDING" | "CONTRACTING" | "FLAT"
    is_estimate: boolean
  }>

  per_country_import: Array<{         // Per-country import (T-34 — spot Taiwan/Korea chip inflow)
    country: string
    import_bn_usd: number
    share_pct: number
    is_estimate: boolean
  }>

  margin_series: Array<{              // Multi-year series for T-35 two-trend chart
    period: string
    hs_group: string
    processing_margin: number
  }>

  derived: {
    negative_margin_trap: boolean     // T-36: any hs_group with processing_margin < 1.0 AND volume rising
    trap_groups: string[]             // which hs_groups triggered the trap
  }
}
```

### FR-3 — Data source + routing
DDD layer: **infrastructure**

- Primary: Vietnam Customs (Tổng cục Hải quan) — `https://www.customs.gov.vn/` monthly trade statistics page, and/or GSO trade release `https://www.gso.gov.vn/`.
- **Geo-blocked: route ALL fetches through Vinahost VPS proxy** (GA-1). No direct fetch.
- Cadence: monthly release; tool caches last known value + timestamp. Return stale + `is_estimate=true` if source unreachable.
- Cross-check: where GSO and Customs diverge (they sometimes do for FDI-bloc attribution), prefer Customs for raw flow; GSO for official totals. Flag discrepancy in `notes[]`.

### FR-4 — Processing-margin computation
DDD layer: **domain**

`processing_margin = hs_group.export_bn_usd / hs_group.import_bn_usd`. Requires both values > 0; emit `is_estimate=true` on that group if either is missing. Electronics/components historical range: ~0.6–0.7 (−30% to −40%). `negative_margin_trap = true` when `processing_margin < 1.0 AND import_bn_usd > prior_period_import_bn_usd` for that group.

### NFR-1 — Freshness
Cache TTL: 24h (monthly data). Emit `fetched_at` and `source_lag_days` (days since official release). If source_lag_days > 35, flag `is_estimate=true` on the whole response.

### NFR-2 — BLOCKER — live source probe required
**BLOCKER-1 (source-probe):** Dev must fetch a live sample from Vietnam Customs and GSO via the VPS before writing the parser. The FDI-bloc / domestic-bloc attribution is NOT explicit in the public Customs tables — it may require a combination of fields or a separate FDI-by-sector series from GSO. The architect must decide the derivation strategy (direct table parse vs. cross-join two series). **This is a design decision, not a parsing decision.**

### Edge Cases
- **HS group taxonomy changes** — Customs reclassifies groups periodically. Parser must be driven by a config map (not hardcoded HS codes) updated when reclassification is detected.
- **Missing prior-period data** — `delta_mom_bn_usd` = null + `is_estimate=true` on the delta field only.
- **Negative margin edge** — when import = 0 (rare reporting gap), do not divide by zero; emit `processing_margin: null, is_estimate: true`.
- **YTD vs monthly inconsistency** — GSO YTD totals do not always back-calculate to consistent monthly figures. Emit `notes: ["YTD-monthly reconciliation gap detected"]` when they diverge >5%.

---

## Tool 2 — `get_vn_bop`

**VMT task:** VMT-2-BOP | **Priority:** HIGH | **Size:** L
**Owners:** dev-macro-indicators (lead), dev-vps-crawls (fetch layer)
**Brief techniques:** T-38 (FDI surplus parked offshore), T-39 (full BOP walk), T-40 (domestic vs FDI FX-incidence)
**Skill consumers:** `trade-fx-pressure-decomp` (FX-incidence test — flips from estimate to live), unified-agent/CHEF BOP walk

### FR-1 — Input contract
DDD layer: **interface**

```typescript
{
  period: "YYYY-QN" | "YYYY"          // quarterly or annual; e.g. "2026-Q1"
  components?: Array<
    | "current_account" | "trade_goods" | "services"
    | "income" | "transfers"
    | "fdi_net" | "portfolio_net" | "other_investment_net"
    | "errors_omissions" | "overall_balance"
  >                                    // default: all
}
```

### FR-2 — Output contract (skill switch-on schema — load-bearing)
DDD layer: **domain**

```typescript
{
  period: string
  fetched_at: string
  is_estimate: boolean

  current_account: {
    total_bn_usd: number
    trade_goods_bn_usd: number
    services_bn_usd: number
    income_bn_usd: number
    transfers_bn_usd: number
    trend: "SURPLUS" | "DEFICIT"
    is_estimate: boolean
  }

  financial_account: {
    fdi_net_bn_usd: number
    portfolio_net_bn_usd: number
    other_investment_net_bn_usd: number
    total_bn_usd: number
    is_estimate: boolean
  }

  errors_omissions_bn_usd: number     // E&O proxy for offshore-parked FDI (T-38)
  overall_balance_bn_usd: number

  derived: {
    offshore_parked_estimate_bn_usd: number  // E&O + other-invest; Báu's ~$450B cumulative proxy (T-38)
    fx_swing_line: string                     // name of the largest negative financial-account component
    fx_incidence: "FDI_BENIGN" | "DOMESTIC_PRESSURE" | "MIXED"  // T-40 discriminator
    // FDI_BENIGN: deficit driven by FDI bloc (USD parked offshore, low real FX pressure)
    // DOMESTIC_PRESSURE: deficit driven by domestic bloc (firms must source USD at bank)
  }

  is_estimate: boolean
}
```

### FR-3 — Data source + routing
DDD layer: **infrastructure**

- Primary: SBV (Ngân hàng Nhà nước) quarterly BOP publication — `https://www.sbv.gov.vn/`. **Geo-blocked → VPS.**
- Cross-check: IMF BOP data for Vietnam (existing `get_imf_signals` tool already fetches IMF — read IMF for quarterly cross-validation of current_account total). Where SBV and IMF diverge >2%, emit `notes: ["SBV/IMF divergence detected"]` and prefer SBV as primary.
- Cadence: quarterly (lag ~2 months after quarter-end). Cache 7 days. If source unreachable: return stale + `is_estimate=true`.
- Annual BOP: SBV publishes annual summaries; accept `period="YYYY"` and map to available annual rows.

### FR-4 — FX-incidence discriminator logic
DDD layer: **domain**

`fx_incidence` derivation:
- If `financial_account.fdi_net_bn_usd > 0` AND `errors_omissions_bn_usd < -1.0` → `FDI_BENIGN` (FDI surplus is parked offshore; E&O absorbs it; no real USD demand at domestic banks).
- If `current_account.trade_goods_bn_usd < -3.0` AND domestic-bloc evidence from `get_vn_trade_balance` shows growing domestic deficit → `DOMESTIC_PRESSURE`.
- Otherwise → `MIXED`.
- When `get_vn_trade_balance` is not yet live, `fx_incidence` = `MIXED` with `is_estimate=true`.

### NFR-1 — Freshness
SBV BOP: quarterly. `source_lag_quarters` emitted. If lag > 2 quarters, flag `is_estimate=true`.

### BLOCKER — live probe
**BLOCKER-2 (source-probe):** SBV BOP is published as a PDF or Excel table. Dev must VPS-probe the SBV BOP page to determine: (a) machine-readable format (JSON API vs Excel vs PDF), (b) whether all 10 line items are present in one table or require joining multiple sheets. Architect may need to specify a PDF-parse path (using existing `pdf-extractor` app) vs. Excel parse depending on the live payload shape.

### Edge Cases
- **E&O sign convention** — SBV may flip sign vs IMF convention. Probe live to confirm which sign convention is used before hard-coding the discriminator.
- **Restated quarters** — SBV regularly restates prior quarters. Store revision metadata (`revised_at` field) to flag when a cached row has been superseded.
- **Missing financial-account decomposition** — SBV sometimes only publishes overall financial account without FDI/portfolio split. In this case emit sub-components as null with `is_estimate=true`; overall BOP walk still functions.

---

## Tool 3 — `get_vn_macro_indicators`

**VMT task:** VMT-3-MACRO-INDICATORS | **Priority:** HIGH | **Size:** L
**Owners:** dev-macro-indicators (lead), dev-vps-crawls (GSO path), dev-mainserver-crawls (S&P PMI path)
**Brief techniques:** T-16 (PMI MA), T-17 (IIP YTD-cumulative), T-18 (real retail sales), T-24 (public investment), T-25 (FDI registered vs disbursed)
**Skill consumers:** `macro-health-read` (production/consumption/investment tracks — primary, all 5 series)

### FR-1 — Input contract
DDD layer: **interface**

```typescript
{
  indicators: Array<
    | "pmi"
    | "iip"
    | "retail_sales_nominal"
    | "retail_sales_real"
    | "public_investment"
    | "fdi_registered"
    | "fdi_disbursed"
  >
  transform?: "raw" | "ma3" | "ma5" | "yoy" | "ytd_cumulative"  // default: "raw"
  period?: "YYYY-MM"                   // latest if omitted
  lookback_months?: number             // default 13 (enables YoY + 1 extra point)
}
```

### FR-2 — Output contract (skill switch-on schema — load-bearing)
DDD layer: **domain**

```typescript
{
  period: string
  fetched_at: string

  series: Array<{
    indicator: string                  // one of the 7 indicator names above
    transform: string                  // applied transform
    values: Array<{
      period: string                   // "YYYY-MM"
      value: number | null
      is_estimate: boolean
    }>
    unit: string                       // "index" | "pct_yoy" | "trillion_vnd" | "bn_usd"
    source: string                     // "gso" | "sp_global" | "mpi"
    source_tier: number               // 1=official-live 2=official-cached 3=estimate 4=seed
    notes: string[]
  }>
}
```

### FR-3 — Indicator specs
DDD layer: **domain** (transform logic) + **infrastructure** (fetch)

| Indicator | Source | Fetch path | Transform note |
|---|---|---|---|
| `pmi` | S&P Global VN PMI press releases | Main-server fetch (not geo-blocked; S&P PMI page is globally accessible) | MA3 = average of 3 most recent monthly prints (T-16). Raw print NOT to be used alone for regime calls. |
| `iip` | GSO monthly socio-economic report | VPS fetch | YTD-cumulative preferred (T-17); MoM suppressed by Tết seasonality — emit both `raw` and `ytd_cumulative` always |
| `retail_sales_nominal` | GSO | VPS fetch | Nominal figure as published |
| `retail_sales_real` | Derived | — | `real = nominal / (1 + cpi_yoy/100)` where CPI sourced from `get_cpi_components`; if CPI unavailable: `is_estimate=true`, note `"real_unstripped"` |
| `public_investment` | GSO / MPI (Ministry of Planning & Investment) | VPS fetch | YTD-cumulative disbursed vs plan (T-24). Emit `disbursement_rate_pct = ytd_disbursed / annual_plan * 100` |
| `fdi_registered` | GSO / MPI | VPS fetch | Monthly + YTD (T-25). Distinguish registered capital vs. supplemental capital injections |
| `fdi_disbursed` | GSO / MPI | VPS fetch | Actual disbursed (T-25). `fdi_disbursed / fdi_registered` = implementation ratio; emit separately |

### FR-4 — retail_sales_real derivation
DDD layer: **domain**

This is a first-class computed field (T-18), not an afterthought. `real_growth = (nominal_growth - cpi_yoy) / (1 + cpi_yoy/100)` approximation. The skill uses `price_driven: boolean = (nominal_growth > 3.0 && real_growth < 2.0)` to flag inflation-driven revenue without real volume growth. This boolean is load-bearing for `macro-health-read` consumption track.

### NFR-1 — Freshness + cadence
GSO releases monthly socio-economic data around day 28–30 of the following month. PMI: released first business day of next month (S&P Global press page). Staleness gate: if `fetched_at` > 35 days old for GSO, or > 35 days old for PMI, set `is_estimate=true` on that series.

### BLOCKER — live probe
**BLOCKER-3 (source-probe):** GSO monthly report format. The GSO site (`https://www.gso.gov.vn/`) publishes data as: (a) HTML tables on the press-release page, (b) Excel download, or (c) statistical yearbook PDF. Dev must VPS-probe the live GSO page for the most recent monthly release to confirm which format is machine-readable and whether IIP, retail sales, public investment, and FDI are all in the same report or separate pages. The S&P PMI page probe is NOT geo-blocked; dev can probe directly.

### Edge Cases
- **Tết distortion** — January/February IIP and retail figures are severely distorted by the Lunar New Year. Do not use MoM for these months; `ytd_cumulative` removes this. Emit `tiet_distortion_flag: true` on Jan/Feb raw IIP values.
- **FDI supplemental vs. new** — GSO distinguishes new project FDI from supplemental capital injections (parent-co loss cover is often a supplemental injection). Both are summed in `fdi_registered`; emit `fdi_supplemental_bn_usd` separately when source provides it (T-41 fake-FDI detector in news-scout depends on this).
- **GSO revision cycles** — GSO revises monthly figures in the annual statistical yearbook. Flag rows where `is_revised=true` when a more recent publication changes a prior month's value.
- **PMI below/above 50 boundary** — never emit a raw PMI regime label. The skill applies the MA3 rule; the tool emits raw + MA3 values only.

---

## Tool 4 — `get_cpi_components`

**VMT task:** VMT-4-CPI-COMPONENTS | **Priority:** MEDIUM | **Size:** M
**Owners:** dev-macro-indicators (lead), dev-vps-crawls (GSO CPI path)
**Brief techniques:** T-22 (component-level CPI decomposition), supports T-20 (oil pass-through), T-21 (CPI peak detection), T-43 (China PPI imported-inflation)
**Skill consumers:** `macro-health-read` (inflation track — `cpi_peaked` boolean is the switch-on field); `market-watcher` CPI peak-detection

### FR-1 — Input contract
DDD layer: **interface**

```typescript
{
  period: "YYYY-MM"                    // defaults to latest
  basis: "yoy" | "mom"               // YoY default; MoM also accepted for oil pass-through
  weights?: boolean                   // include basket weights (default true)
}
```

### FR-2 — Output contract (skill switch-on schema — load-bearing)
DDD layer: **domain**

```typescript
{
  period: string
  fetched_at: string
  basis: "yoy" | "mom"

  overall_cpi: {
    value_pct: number
    delta_vs_prior_period: number
    trend: "RISING" | "FALLING" | "FLAT"
    is_estimate: boolean
  }

  baskets: Array<{
    name: string                       // e.g. "transport", "food_catering", "housing_construction", "education", "health", "other"
    name_vi: string                    // Vietnamese name from GSO
    weight_pct: number | null          // basket weight in CPI (transport ~20%; null if not published)
    contribution_pct: number           // contribution to headline CPI change
    yoy_pct: number                    // YoY or MoM change per basis
    is_admin_priced: boolean           // true for education, health (government-set prices — T-22)
    is_estimate: boolean
  }>

  derived: {
    cpi_peaked: boolean                // T-21: true when YoY momentum is rolling over
    // logic: cpi_peaked = (overall_cpi.value_pct < prior_2_periods_avg) AND (overall_cpi.trend == "FALLING")
    peak_detection_basis: string       // "3m_rolling_average" — method transparency
    oil_contribution_pct: number       // transport basket contribution as oil-pass-through proxy (T-20)
    admin_price_contribution_pct: number  // sum of admin-priced basket contributions
    non_core_pct: number               // food + energy — volatile component
  }

  is_estimate: boolean
}
```

### FR-3 — Data source + routing
DDD layer: **infrastructure**

- Source: GSO CPI release (`https://www.gso.gov.vn/`). **Geo-blocked → VPS.**
- GSO publishes 11 CPI baskets (hàng hóa và dịch vụ nhóm): Food & catering services, Beverages & tobacco, Apparel, Housing & construction materials, Household equipment, Health, Transport, Post & telecom, Education, Culture & entertainment, Other goods & services.
- Cadence: monthly. Cache 24h. Source_lag_days emitted.

### FR-4 — CPI peak-detection logic
DDD layer: **domain**

`cpi_peaked` = `true` when: (a) current `overall_cpi.value_pct` < average of prior 2 months, AND (b) the 3-month moving average of `overall_cpi.value_pct` is falling. This is a momentum indicator, not a level threshold (T-21 principle). Requires `lookback_months >= 3` in the tool's internal fetch.

### NFR-1 — Basket weight stability
GSO updates CPI basket weights approximately every 5 years (last update ~2020). The tool must store `weight_reference_year` and flag `is_estimate=true` on weights when the reference year is > 5 years old (weights may drift).

### BLOCKER — live probe
**BLOCKER-4 (source-probe):** GSO publishes CPI as part of the monthly socio-economic press release AND as a separate CPI-specific release. Dev must VPS-probe to confirm: (a) whether the 11-basket breakdown (with individual weights) is in the press-release HTML table or requires the Excel/PDF download, (b) whether basket names are consistent month-to-month (GSO has renamed baskets before).

### Edge Cases
- **Administered-price shocks** — education and health baskets spike in months when the government adjusts fees (not demand-driven). `is_admin_priced=true` allows consuming skills to strip these from trend analysis.
- **Energy subsidy removal** — if government removes fuel subsidy mid-year, transport basket spikes immediately (T-20 near-immediate pass-through). Tool does not need to detect this; `market-watcher` reads `oil_contribution_pct` and makes the call.
- **Base-effect distortions** — if prior-year CPI was abnormally high, YoY comparisons are misleading. Emit `base_effect_flag: boolean` when prior-year same-month CPI was >1.5 standard deviations from mean (3-year trailing).

---

## Tool 5 — `get_vn_liquidity_state`

**VMT task:** VMT-5-LIQUIDITY-STATE | **Priority:** MEDIUM | **Size:** M
**Owners:** dev-macro-indicators (lead), dev-vps-crawls (SBV OMO/interbank path), dev-mainserver-crawls (CNY/DXY FX path)
**Brief techniques:** T-29 (interbank framework break), T-30 (OMO outstanding as stress gauge), supports T-23 (VIRA/VARA cross-check), T-27 (SJC gold gap), T-28 (CNY coupling)
**Skill consumers:** `macro-health-read` (fx + liquidity tracks); `trade-fx-pressure-decomp` (FX/rates context)

### FR-1 — Input contract
DDD layer: **interface**

```typescript
{} | { period: "YYYY-MM" }            // latest if empty; or specific month
```

### FR-2 — Output contract (skill switch-on schema — load-bearing)
DDD layer: **domain**

```typescript
{
  period: string
  fetched_at: string

  interbank: {
    rate_1w_pct: number               // 1-week tenor — the benchmark (T-29, line 320–322)
    rate_on_pct: number | null        // overnight rate (secondary)
    delta_vs_refi_floor_pct: number   // interbank_1w - refi_rate; positive = above floor (normal); near-zero or negative = stressed
    trend: "EASING" | "TIGHTENING" | "STABLE"
    is_estimate: boolean
  }

  omo: {
    outstanding_bn_vnd: number        // OMO net outstanding (T-30)
    delta_vs_peak_bn_vnd: number      // vs. rolling 12m peak; large negative = liquidity injection absorbing
    net_direction: "INJECTION" | "ABSORPTION" | "NEUTRAL"
    is_estimate: boolean
  }

  policy_rates: {
    refi_rate_pct: number             // SBV refinancing rate
    discount_rate_pct: number | null
    deposit_ceiling_pct: number | null
    is_estimate: boolean
  }

  irs: {                              // Interest Rate Swap (T-29 — signals market duration expectations)
    rate_1y_pct: number | null
    is_estimate: boolean
  }

  sjc_gold: {                         // T-27 — SJC vs world gold premium gap as FX/policy stress proxy
    sjc_price_mn_vnd: number          // SJC gold price in million VND/tael
    world_price_mn_vnd: number        // world gold converted at spot USD/VND
    gap_mn_vnd: number                // sjc - world; ~8M VND now (easing); ~20M = historic stress
    gap_direction: "NARROWING" | "WIDENING" | "STABLE"
    stress_flag: boolean              // true when gap > 15M VND (historic stress threshold)
    is_estimate: boolean
  }

  fx_coupling: {                      // T-28 — CNY-coupling FX rule
    cny_usd_ytd_pct: number           // CNY vs USD YTD change; positive = CNY strengthening
    dxy_ytd_pct: number               // DXY YTD change
    vnd_usd_ytd_pct: number           // VND vs USD YTD change
    coupling_verdict: "CNY_STABLE_VND_RESILIENT" | "CNY_WEAK_VND_RISK" | "CNY_DECOUPLED"
    // CNY_WEAK_VND_RISK: CNY weakening vs USD -> elevate VND depreciation alarm
    // CNY_STABLE_VND_RESILIENT: CNY holding/strengthening -> down-weight VND alarm even if DXY up
    is_estimate: boolean
  }

  is_estimate: boolean
}
```

### FR-3 — Data sources + routing
DDD layer: **infrastructure**

| Field group | Source | Routing |
|---|---|---|
| `interbank` (1w rate) | SBV daily interbank rate fixings `https://www.sbv.gov.vn/` | VPS |
| `omo` (outstanding) | SBV OMO auction results page | VPS |
| `policy_rates` | SBV official rates page | VPS |
| `irs` | VN bond market / HNX interbank derivative quotes (if available) | VPS; mark `is_estimate=true` if HNX source not reachable |
| `sjc_gold.sjc_price_mn_vnd` | Existing SJC gold crawler (already in mcp-server) — **only the GAP calculation is new** | Re-use existing; no new crawl needed |
| `sjc_gold.world_price_mn_vnd` | Derived: `world_gold_usd_per_oz * troy_oz_per_tael * usdvnd_rate / 1_000_000` | Main-server existing FX + gold fetch |
| `fx_coupling` (CNY, DXY, VND) | Main-server FX fetch (existing — not geo-blocked) | Main-server |

### FR-4 — SJC gap calculation
DDD layer: **domain**

`gap_mn_vnd = sjc_price_mn_vnd - world_price_mn_vnd`. The existing SJC crawler returns raw SJC price; the conversion of world gold to VND terms is new computation using existing world-gold-USD and USD/VND from `get_macro_snapshot`. No new crawl: chain the existing data. `stress_flag = gap_mn_vnd > 15.0` (threshold: 15M VND gap; historic stress ~20M, current ~8M per brief).

### NFR-1 — Freshness
SBV interbank fixing: daily (business days). OMO: per auction (typically daily or few times/week). Cache 6h. If source unreachable for > 24h, mark `is_estimate=true` on the relevant group.

### BLOCKER — live probe
**BLOCKER-5 (source-probe):** SBV publishes interbank rates and OMO data as separate pages/tables. Dev must VPS-probe both URLs to confirm: (a) machine-readable format (HTML table vs Excel), (b) whether the 1-week tenor is explicit or must be inferred from a tenor grid, (c) whether OMO net outstanding is stated directly or must be computed from individual auction add/drain entries. The IRS quote source (HNX or OTC) is unconfirmed — dev must search and report back before implementing; architect may need to lower-priority or defer IRS to `is_estimate=true` fallback.

### Edge Cases
- **SBV holiday closures** — interbank does not fix on public holidays. Tool returns last known rate with `fetched_at` of the last fix date; consuming skills must not interpret this as "rate unchanged today".
- **OMO direction reversal** — SBV can flip from net-injection to net-absorption within one week. `net_direction` must reflect the net of the current outstanding balance, not the direction of the most recent operation.
- **CNY/DXY data outage** — if main-server FX fetch fails, `fx_coupling` group: `is_estimate=true`, use last-known values with `note: "fx_coupling_stale"`.

---

## Tool 6 — EXTEND `get_credit_flow_signal` (VIRA/VARA real distribution)

**VMT task:** VMT-6-CREDIT-FLOW-EXTEND | **Priority:** MEDIUM | **Size:** M
**Owner:** dev-mcp-server (lead), dev-macro-indicators (VIRA/VARA source research)
**Brief technique:** T-23 (bank-survey consensus cross-check)
**Skill consumer:** `digest-predict` (VIRA/VARA consensus cross-check)
**Zone:** `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts` (extend in-place)

### Current state (from code audit)
The existing `getCreditFlowSignalHandler` (creditFlowTools.ts L104) uses:
- Static fallback constants (`DEFAULT_RE_CREDIT_TRILLION = 2_800`, `reCreditRatioPct: 20/19`, `yoyGrowthPct: 15/-15`) — already flagged as `is_estimate=true`/`static_seed`.
- SBV refi rate from DB (live, via `sbv_rates_history` table) — this part works.
- VIRA/VARA survey path: **does not exist yet** — the brief references a "VIRA/VARA survey path" but it is not implemented in the current tool.

### FR-1 — Add VIRA/VARA survey distribution output
DDD layer: **interface** (output field addition) + **infrastructure** (VIRA/VARA fetch)

Extend the existing output to include:

```typescript
survey_distribution: {
  source: "VIRA" | "VARA" | null
  period: string                       // survey period e.g. "2026-Q1"
  mean_pct: number | null              // mean forecast (CPI/IRS/interbank/FX depending on survey topic)
  dispersion_pct: number | null        // standard deviation or range of responses
  hawk_outliers: string[]              // institution names or count that forecast significantly above mean
  dove_outliers: string[]              // institution names or count that forecast significantly below mean
  survey_topic: string                 // "credit_growth" | "interbank_rate" | "cpi" | "fx"
  is_estimate: boolean
  note: string | null
}
```

### FR-2 — VIRA/VARA data source
DDD layer: **infrastructure**

- VIRA (Vietnam Institute for Research and Analysis) and VARA (Vietnam Association for Research and Analysis): both publish periodic bank-survey consensus reports. These are NOT geo-blocked (they may publish on their own sites, or results appear in Vietnamese financial media — VnExpress, CafeF, DNSE).
- **Source probe required (BLOCKER-6):** Dev must search for VIRA/VARA machine-readable publication URLs. If no machine-readable source exists, the field falls back to `is_estimate=true, note: "VIRA/VARA manual input required"`. The architect must decide whether to implement a manual-input endpoint (PUT /vira-survey-data) or accept the `is_estimate` degraded mode.
- Where live: parse survey mean + distribution from latest report.
- Where unavailable: remove the static-seed masquerade. `survey_distribution.is_estimate=true` is correct and honest; the existing `yoyIsEstimate` + `mortgageIsEstimate` flags must remain and not be overwritten.

### FR-3 — Static-seed cleanup (anti-regression)
DDD layer: **infrastructure**

The `DEFAULT_RE_CREDIT_TRILLION`, `reCreditRatioPct: 20/19` constants are currently `static_seed`. They must remain flagged as `is_estimate=true` (they already are, per existing provenance lines). This EXTEND does NOT replace them with live data — the VIRA/VARA survey output is additive. Do NOT remove the existing `is_estimate` flags as part of this change.

### Edge Cases
- **Survey topic mismatch** — VIRA and VARA may survey different topics in different quarters. The `survey_topic` field must reflect what the most recent available survey actually covers, not an assumed topic.
- **No survey this quarter** — `survey_distribution: null` with `note: "no_survey_this_period"` is correct. Do not carry forward a prior quarter's results as if current.

---

## Tool 7 — VMT-7-REGISTER (Registration + Gateway Surface)

**VMT task:** VMT-7-REGISTER | **Priority:** HIGH | **Size:** M
**Owner:** dev-mcp-server
**Depends on:** VMT-1 through VMT-5 (all 5 new tools must be implemented before registration)
**Zone:** `apps/mcp-server/src/interface/mcp/tools/macro/` + `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` + `apps/mcp-server/src/interface/mcp/registry.ts`

### FR-1 — Tool registration
DDD layer: **interface**

Each of the 5 new tools must be registered in the MCP server's tool registry (pattern: existing `macroTools.ts` registration as reference). Registration includes:
- Tool name (bare name, no `mcp__vn-market__` prefix)
- Zod input schema matching the FR-1 contract per tool
- Handler function reference
- Description string (English, ≤ 200 chars) suitable for `search_tools("<keyword>")` discovery

### FR-2 — Gateway discoverability gate
DDD layer: **interface**

After registration + container rebuild, run:
```
call_tool(server="vn-market", tool="list_server_tools", arguments={}) 
  → each of the 5 new tool names must appear

call_tool(server="vn-market", tool="search_tools", arguments={"keyword": "trade_balance"})
  → get_vn_trade_balance must appear

call_tool(server="vn-market", tool="get_vn_trade_balance", arguments={"period": "2026-05", "group_by": "bloc"})
  → must return a valid response (not 404/tool-not-found)
```

### FR-3 — Schema-contract verification (skill switch-on acceptance)
DDD layer: **interface**

The acceptance test for VMT-7 is: a live `call_tool` to each new tool returns a response whose JSON keys include all load-bearing fields named in FR-2 of the respective tool requirement above. This is what allows `macro-health-read` and `trade-fx-pressure-decomp` to flip from `is_estimate=true` to live.

### NFR-1 — Parity with existing TOOL-SURFACE-UPGRADE U2-PARITY gate
The new tools must pass the same parity checks as prior tool-surface upgrades: `list_server_tools` count increases by exactly 5; no existing tools disappear; registry.ts imports clean (`tsc --noEmit` passes after addition).

---

## Section 8 — Consolidated Blockers / Open Questions for Architect

These are questions only the architect (or a VPS probe) can answer before dev writes parsers. BA cannot resolve these.

| ID | Tool | Blocker | Resolution needed from |
|---|---|---|---|
| BLOCKER-1 | VMT-1 | How is FDI-bloc vs domestic-bloc trade split derived from Customs/GSO? Is it a direct table column or cross-join of two series? | Architect (design decision) after dev VPS-probe |
| BLOCKER-2 | VMT-2 | SBV BOP format: PDF vs Excel vs JSON API? All 10 BOP line items in one table or multiple? E&O sign convention matches IMF? | Dev VPS-probe first; architect decides parse path (may invoke `pdf-extractor`) |
| BLOCKER-3 | VMT-3 | GSO monthly socio-economic report: HTML table vs Excel download vs PDF? IIP + retail + FDI all in one report or separate pages? | Dev VPS-probe (not geo-blocked for PMI; VPS for GSO) |
| BLOCKER-4 | VMT-4 | GSO CPI: 11-basket breakdown (with weights) in press-release HTML or Excel/PDF? Basket names consistent month-to-month? | Dev VPS-probe via VPS |
| BLOCKER-5 | VMT-5 | SBV interbank: 1-week tenor explicit or derived from tenor grid? OMO net outstanding stated directly or computed from auction entries? IRS quote source (HNX or OTC)? | Dev VPS-probe; architect may defer IRS to `is_estimate` |
| BLOCKER-6 | VMT-6 | VIRA/VARA survey: machine-readable URL exists? Manual-input fallback (PUT endpoint) or accept `is_estimate` degraded mode? | Architect decides on manual-input vs degraded |

---

## Section 9 — DDD Layer Summary

| Layer | What lives here |
|---|---|
| **interface** (mcp-server) | Tool registration (Zod schema + handler wiring), gateway discoverability (VMT-7) |
| **domain** (macro-indicators app) | Aggregation logic: processing-margin, FX-incidence discriminator, CPI peak-detection, retail_sales_real derivation, SJC gap calculation, `negative_margin_trap`, `fx_swing_line`, `cpi_peaked` |
| **application** (macro-indicators app) | Use-case orchestration: fan-out to multiple infrastructure fetchers, transform computation (MA3/MA5/YoY/YTD-cumulative), series assembly |
| **infrastructure** (macro-indicators app + vps-crawls) | VPS-proxied HTTP fetches (GSO, Customs, SBV), response caching, PDF/Excel parsing (if required for BOP), staleness TTL logic |

---

## Section 10 — Recommended Zone Split for Architect

The architect must produce a multi-zone blueprint. Recommended split:

**Zone A — `apps/macro-indicators/` (Go service, port 5004)**
- New HTTP endpoints: `POST /trade-balance`, `POST /bop`, `POST /macro-indicators`, `POST /cpi-components`, `POST /liquidity-state`
- Domain logic for all 5 tools (processing-margin, FX-incidence, CPI-peak, etc.)
- VPS fetch infrastructure layer (`vpsFetch` wrapper)
- Follows the existing pattern: `router.go` adds routes; new `handlers_vmt.go`; domain in `pkg/domain/`; infra in `pkg/infrastructure/`

**Zone B — `apps/mcp-server/src/interface/mcp/tools/macro/` (TypeScript, existing)**
- New MCP tool handlers: route HTTP to macro-indicators new endpoints (same pattern as existing `macroTools.ts` → HTTP POST `/snapshot`)
- New files: `tradeBalanceTools.ts`, `bopTools.ts`, `macroIndicatorsVnTools.ts`, `cpiComponentsTools.ts`, `liquidityStateTools.ts`
- VMT-7 registration in `registry.ts` + `index.ts`

**Zone C — `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts` (TypeScript, in-place extend)**
- VMT-6: extend `getCreditFlowSignalHandler` output with `survey_distribution` field
- Separate fetch function for VIRA/VARA (infrastructure) if source confirmed

**Zone D — `apps/macro-indicators/pkg/infrastructure/` (new: VPS proxy wrapper)**
- Generic `vpsFetch(url, options)` wrapper that routes through Vinahost VPS
- Shared across Zones A/B; not duplicated per-tool
- Mirrors the existing pattern from `project_bctc_vps_proxy` memory (same VPS endpoint)

**Dependency order for implementation:**
1. Zone D (VPS wrapper) — shared dependency, no waiting
2. Zone A VMT-1 + VMT-3 in parallel (both GSO source; share the VPS wrapper once probed)
3. Zone A VMT-2 in parallel if BOP probe is fast; defer if PDF parse needed
4. Zone A VMT-4 + VMT-5 in parallel (CPI + liquidity are smaller)
5. Zone B all 5 MCP tools (after Zone A endpoints exist and return 200)
6. Zone C VMT-6 (independent; can start any time)
7. Zone B VMT-7 registration gate (after all 5 Zone B handlers done)

---

## Section 11 — Non-Functional Requirements (all tools)

| NFR | Requirement |
|---|---|
| VPS routing | All VN-source (GSO/Customs/SBV) HTTP traffic MUST route through Vinahost VPS; no direct fetch even in test |
| Fail-closed | Source unavailable → `{is_estimate: true, error: "source_unavailable"}` — never fabricate; never silent empty |
| Cache | Each tool caches last-known response per period. Cache TTL: 24h (monthly data), 6h (daily data). Atomic write. |
| Transform server-side | MA3/MA5/YoY/YTD-cumulative computed in handler; not pushed to caller |
| Direction + delta | Every rate/index field carries `delta` vs prior period and `trend` label |
| Language | Tool output fields: English keys; Vietnamese values where applicable (`name_vi`, notes in Vietnamese context) |
| `is_estimate` per field | Honest at field level, not just response level; per `reference_low_confidence_handling` |
| No hardcoded macro values | Config or SSOT-driven; no magic economic constants in source code |
| Reusable scripts | Probe scripts → `scripts/` with pointer in owning flow doc; never `/tmp` |
| Container rebuild required | After code change: ops must rebuild + recreate the `mcp-server` + `macro-indicators` containers (memory: `feedback_rebuild_after_dev_change`) |

---

## Section 12 — Acceptance Boundary (Skill Switch-On)

The exact acceptance boundary for this sprint: both consuming skills flip from degraded (`is_estimate=true` on all tracks) to live (`is_estimate=false` on live-sourced tracks) WITHOUT code changes to the skills themselves. This requires:

1. `get_vn_trade_balance` returns `bloc_split.fdi`, `bloc_split.domestic`, `hs_attribution[].processing_margin`, `derived.negative_margin_trap`
2. `get_vn_bop` returns `derived.fx_incidence`, `derived.offshore_parked_estimate_bn_usd`
3. `get_vn_macro_indicators` returns `series[indicator="pmi"].values` (MA3 transform), `series[indicator="iip"].values` (ytd_cumulative), `series[indicator="retail_sales_real"].values`, `series[indicator="retail_sales_real"].price_driven`
4. `get_cpi_components` returns `derived.cpi_peaked`
5. `get_vn_liquidity_state` returns `interbank.rate_1w_pct`, `omo.outstanding_bn_vnd`, `sjc_gold.gap_mn_vnd`, `fx_coupling.coupling_verdict`

QA must verify each field is present and non-null on a live call before marking VN-MACRO-TOOLING DONE.
