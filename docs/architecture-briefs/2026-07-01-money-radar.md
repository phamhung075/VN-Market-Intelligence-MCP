# Architecture Brief — Money Radar (Radar Dòng Tiền)
**Date:** 2026-07-01
**Author:** agents-architect
**Status:** READY — route to po for Phase-0-first decomposition

---

## 1. Problem Statement

The system has nine live money-flow tools (foreign-flow suite, carry, credit-flow, volatility, macro)
but no fusion layer — analysts must chain 4+ calls with no unified anomaly ranking.
More critically, there is **no divergence engine**: the moment when smart money quietly exits a rising
tape before the retail crowd reacts is the highest-value signal in VN markets, and today it is
invisible to every agent flow.

This brief specifies the **Money Radar** subsystem — capital-flow / smart-money-rotation detection
with DIVERGENCE as the headline signal — fulfilling the standing product intent:
*"more indicators so helper agents analyze market better"* (memory: `project_money_radar_vision.md`).

Input grounding: workflow `w97chja81` (2026-07-01), 4 mapper agents + 1 synthesis agent, 303,966
tokens, file:line evidence adopted without re-derivation below.

---

## 2. Non-Negotiable Field Constraints (router RAW-verified live 2026-07-01)

These facts are VERIFIED and MUST be baked into every implementation decision in every zone.

**C1 — `get_price_history` exposes ONLY close + volume (no H/L).**
VCB returned 76 bars; every bar has `{code, date, close, volume}` — no `open`, `high`, `low`.
Implication: 5 of 8 money-flow oscillators are FIELD-GATED. Only these are shippable in Phase 0:
- OBV (close sign × volume — no window constraint)
- Relative-volume z-score(20) (pure volume, window 20 << 76 bars)
- Up/Down volume ratio (close direction + volume, no constraint)
- Degraded close-only VWAP (proxy — MUST be labeled `is_proxy=true`, never canonical)

MFI(14), CMF(20), A-D line, Chaikin Oscillator — FIELD-GATED. They unlock automatically
IF the OHLCV epic exposes H/L (additive, zero radar rework required). Do NOT defer Phase 0
waiting for them.

**C2 — Reuse-first. Do NOT rebuild what is LIVE.**
| Tool | File:line | Status |
|---|---|---|
| `get_foreign_flow` (per-ticker net/severity/streak) | `foreignFlowTools.ts:232-382`; zero-detect :314 | LIVE T2 |
| `get_market_foreign_flow` (aggregate net + top buyers/sellers) | `marketWideForeignFlowTool.ts:160-282` | LIVE T2 |
| `get_foreign_accum_rank` (z_5d/20d, ACCUM/DISTRIB, `foreign_accum_z_market`) | `foreignAccumRankTools.ts:40-110` | LIVE T3 |
| `get_foreign_room` (saturation, 5d velocity, `foreign_outflow_z_5d`) | `foreignRoomTools.ts:33-77` | LIVE T2 |
| `get_carry_trade_signal` (regime, carrySpread pp, `is_estimate`) | `carryTools.ts:38-95` | LIVE T2/4 |
| `get_credit_flow_signal` (RE/banking direction, `is_estimate`) | `creditFlowTools.ts:249-282` | LIVE T4/2 |
| `get_macro_snapshot` (commodities, SBV, yield-spread, clock) | `macroTools.ts:430-499` | LIVE T2/4 |
| `get_volatility_indicators` (RV, regime, `rv_20d_percentile`) | `volatilityIndicatorTools.ts:42-110` | LIVE T3 |
| `daily_ohlcv.put_through_vol` (block/thỏa-thuận volume) | `foreignFlowFetcher.ts:345`; `schema-market-data.ts:100` | FETCHED — reuse column |

The ONE genuinely new crawl is **tự doanh** (proprietary desk), Phase 1 only.

**C3 — Credit-flow Tier-4 discipline (semi-honest today, must harden).**
`DEFAULT_RE_CREDIT_TRILLION` (~2800 trillion VND) and ±15% YoY default at
`creditFlowTools.ts:29,44-46` are hardcoded. When `is_estimate=true`, the credit-flow
component MUST be either excluded or hard-down-weighted in the composite. NEVER fed as real data.

**C4 — OHLCV phase independence.**
Phase 0 is DECOUPLED from the in-flight OHLCV-depth / TA-consumer-layer epic
(`project_indicator_program_gated_on_ohlcv_depth.md`). Phase 0 oscillators need close+volume
present on 76 live bars — satisfied today. The epic is additive: when it lands (a) `delta_5d`
history deepens, (b) if H/L is exposed, MFI/CMF/A-D/Chaikin unlock automatically.
No blocking dependency in either direction.

---

## 3. Three-Layer Architecture

### L1 — Intra-market flow (per-ticker / per-sector)

| Component | Phase | Build note |
|---|---|---|
| Foreign net/severity/streak (per-ticker) | 0 | REUSE `get_foreign_flow` |
| Foreign accum z-score, ACCUM/DISTRIB rank | 0 | REUSE `get_foreign_accum_rank` |
| Foreign room saturation + 5d velocity | 0 | REUSE `get_foreign_room` |
| `daily_ohlcv.put_through_vol` (block volume context) | 0 | REUSE column — surface via composite |
| **OBV** | 0 — BUILD | depth-independent (close+vol, 76 bars) |
| **Relative-volume z-score(20)** | 0 — BUILD | pure volume stat |
| **Up/Down volume ratio** | 0 — BUILD | close direction + volume |
| **Degraded VWAP** (close-only proxy, `is_proxy=true`) | 0 — BUILD | labeled proxy |
| MFI(14) / CMF(20) / A-D / Chaikin Oscillator | FIELD-GATED | unlock when H/L exposed (C1) |
| **Tự doanh** (prop desk EOD net VND + streak) | 1 — NEW CRAWL | CafeF/Vietstock via VPS, reuse `cafef.ts` |
| Per-sector foreign flow bucketing (sector map from `system-map.json`) | 1 | derived from existing per-ticker data |
| Block/thỏa-thuận net-context tool | 1 | over existing `put_through_vol` column; per-deal direction stays REJECTED (C2, §4 roadmap) |

### L2 — Breadth & DIVERGENCE (market-wide) — the centerpiece

Divergence = **sign-conflict between a PRICE/INDEX axis and a FLOW/BREADTH axis**.
Emitted separately from the composite score, never diluted into a mean.
Four detectors (D1–D3 ship Phase 0; D3 gains full form in Phase 1):

**D1 — Index-vs-Breadth**
Index return > 0 while breadth narrowing (advancers shrinking, %-above-MA falling).
Input: `get_breadth_thrust` (already consumed by market-analyst/market-watcher).
Phase 0.

**D2 — Price-vs-OBV distribution** (classic "distribution tell")
Price trending up while OBV slope negative over the same window.
Requires only OBV (depth-independent, C1-clean). Phase 0.

**D3 — Crowd-vs-Smart** (thesis core: institutions rotate out before the crowd)
Phase 0 form: retail/aggregate volume up while foreign net-sell
(`get_market_foreign_flow` + `foreign_accum_z_market` < 0).
Phase 1 form: adds tự-doanh net-sell as the third axis (prop-desk confirming FII exit).

**D4 — Unconfirmed breakout**
New high with relative-volume z-score < 0. Phase 0.

Divergence severity = count and strength of concurrent conflicts.
A divergence detector fires ONLY when BOTH axes are non-null over the same window.
If either axis is null → `divergence.flag = UNKNOWN`, `null_reason` set. Never GREEN.

### L3 — Cross-asset regime (risk-on / risk-off)

Carry regime, credit flow, macro snapshot, and volatility — all REUSE existing tools.
This layer closes the mapper gap "Foreign-to-Domestic Credit Correlation Absent" by
co-locating foreign-flow (T2) and carry/credit (T2/4) in one regime read for carry-unwind
detection.

---

## 4. Composite Money Radar Score — `get_money_radar_composite`

**Output schema per ticker / market:**
```
{
  score: number | null,          // [-1,+1], null when coverage_pct < 0.5
  delta_5d: number | null,       // null when history < 6 pts
  divergence: {
    flag: "GREEN" | "AMBER" | "RED" | "UNKNOWN",
    severity: 0-3,
    detectors: string[],         // e.g. ["D2", "D3"]
    null_reason?: string
  },
  coverage_pct: number,
  source_tier: number,           // min contributing tier (honest floor)
  is_estimate: boolean,
  null_reason: string | null,
  components: Record<string, number | null>  // per-component normalized values
}
```

**Component inputs → normalized to [-1,+1], each carries own tier + null capability:**

| Component | Normalizer | Tier | Phase |
|---|---|---|---|
| Foreign net direction × severity | net_vol_5d / streak weight | 2 | 0 |
| `foreign_accum_z_market` | `tanh(z)` | 3 | 0 |
| `foreign_outflow_z_5d` | `−tanh(z)` | 2 | 0 |
| OBV slope | slope-sign × magnitude | 3 | 0 |
| Relative-volume z(20) | confirmation weight | 3 | 0 |
| Up/Down vol ratio | `(r−1)/(r+1)` | 3 | 0 |
| Degraded VWAP (proxy) | price-vs-VWAP z | 3 | 0 |
| Carry regime | +1/0/−1 by regime | 2/4 | 0 |
| Credit flow direction | +1/0/−1, down-weighted when `is_estimate=true` | 4/2 | 0 |
| Volatility regime | risk-off penalty | 3 | 0 |
| Tự doanh net | net VND 5d cum → `tanh` | 2 | 1 |

**Fusion (coverage-gated, tier-weighted mean over NON-NULL components only):**
```
score = Σ (wᵢ · conf(tierᵢ) · componentᵢ)  /  Σ (wᵢ · conf(tierᵢ))   [non-null i only]
delta_5d = score(t) − score(t−5)             // null when history < 6 pts
coverage_pct = Σ non-null weight / Σ total weight
source_tier  = min(tier across non-null contributing components)
```

**Tier confidence weights:** T1=1.0, T2=0.9, T3=0.7, T4=0.3 (estimates down-weighted).

---

## 5. Honest-NULL / No-Fabrication Contract (non-negotiable)

These rules are the Money Radar's contribution to the system integrity architecture:

**HN-1 — Never zero-fill null components.**
Components excluded by their own gate (zero-detect guard, <5-ticker accum threshold,
<20-session room gate, carry/macro estimate fallback) are excluded from the weighted mean,
never replaced with 0.

**HN-2 — coverage_pct < 0.5 → score = null.**
`null_reason` lists the missing inputs by name. No thin-data guess.

**HN-3 — Credit-flow Tier-4 exclusion.**
When `is_estimate=true` the credit-flow component is either excluded (weight=0) or
hard-down-weighted. DEFAULT_RE_CREDIT_TRILLION / ±15% YoY defaults
(`creditFlowTools.ts:29,44-46`) never enter the score as real.

**HN-4 — Divergence UNKNOWN-not-GREEN when axis is null.**
If the flow axis (OBV, foreign accum) or the price axis is null, the divergence detector
emits `flag=UNKNOWN` + `null_reason`. The composite inherits this: a null divergence axis
does NOT make the composite null, but the divergence field is UNKNOWN.

**HN-5 — Degraded VWAP labeled proxy.**
The close-only VWAP MUST carry `is_proxy=true` in its output. Never described to the user
as "VWAP" without the proxy qualifier.

**HN-6 — Frontend null contract.**
Null score renders as `'—'` (em-dash) + gray FreshnessBadge + `nullReason` via GaugeCard.
Per `dashboard.momentum.tsx:1-29` honest-NULL contract. Never a fabricated number.

**HN-7 — CCATO tie-in.**
The radar's `source_tier`, `is_estimate`, and `null_reason` fields are the provenance the
narrative-truth gate (`docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md`)
needs. Contract: fb-market-poster and CHEF may NOT publish a divergence/rotation claim unless
the underlying detector fired from non-null components. A `divergence=UNKNOWN` degrades to
a "không đủ dữ liệu" line. Never a fabricated rotation narrative.
This closes the failure modes: `feedback_fb_poster_fabricates_when_data_thin`,
`feedback_chef_fabricated_publish`.

---

## 6. Roadmap — Phase 0/1/2 mapped onto Indicator Roadmap P0/P1/P2

**Reference:** `docs/roadmaps/vn-market-indicator-roadmap.md` (verified, no-fake-data gate).
Rejected sub-components per §4: order-book one-sided flag, per-deal large-block direction,
Xtrackers, margin-per-account — DO NOT build.

### Phase 0 (= roadmap P0 tier — data on hand, depth-independent)

No new crawls. Ships real non-null readings on day one.

1. **`get_money_flow_oscillators`** — OBV, relative-volume z(20), up/down vol ratio,
   degraded VWAP (proxy-flagged). Owner: dev-technical-analysis Go :5003.
   Evidence basis: mapper mechanism 3 (SHIPPABLE_NOW status on all four).

2. **`get_money_radar_composite`** aggregator — wires existing tools (HN-1..HN-7) +
   the four new oscillators into the composite schema above. Exposes as a new MCP tool.
   Owner: dev-mcp-server.

3. **Divergence detectors D1 (index-vs-breadth), D2 (price-vs-OBV), D3 Phase 0 form
   (crowd-vs-foreign), D4 (unconfirmed breakout).**
   Owner: dev-mcp-server (fused into the composite call).

4. **Block-deal volume surface** — expose existing `put_through_vol` column as a
   component in the composite (context weight, not directional). No new crawl.

5. **`/dashboard/money-radar` route** (Remix, `dashboard.money-radar.tsx`) —
   mirrors `dashboard.momentum.tsx` structure: PageHeader + FreshnessBadge('daily'),
   grid-cols-1/sm:grid-cols-2/xl:grid-cols-4, 4 GaugeCards.
   Owner: dev-frontend. See §8 for card spec.

**Phase-0 DoD (demonstrable, no fabrication):**
- `get_money_radar_composite` called with no ticker argument returns a real non-null
  score (< 0.5 coverage → null with `null_reason`, not a zero). Foreign accum z-score,
  OBV slope, relative-volume z, and volatility regime all contribute non-null.
- D2 divergence fires on a real historical example: select a session where VN-Index
  closed up but OBV (computed over close+volume) had negative slope over the preceding
  5 sessions → detector emits `flag=AMBER`, `detectors=["D2"]`.
- Dashboard loads without error; null card shows `'—'` + gray badge + "Chưa có dữ liệu";
  non-null card shows formatted score + colored badge.
- Momentum cards (all-NULL) sit parallel without regressions.

### Phase 1 (= roadmap P1 tier — new real fetch/backfill)

Maps to roadmap line 64 (Proprietary/Tự doanh Net Flow, effort M, dev-stock-price + dev-mcp-server)
and line 65 (Block/Putthrough Deal Flow, effort M).

1. **Tự doanh EOD crawl** — CafeF/Vietstock via VPS (geo-blocked), reuse `cafef.ts` pattern.
   Output: daily net VND, 3d/5d cum, streak, matched-vs-putthrough split.
   Enables D3 full form (foreign + prop-desk vs crowd = third flow vector).
   Owner: dev-vps-crawls (fetch) + dev-mcp-server (new `get_tu_doan_flow` tool + composite wiring).

2. **Per-sector foreign flow bucketing** — derive from existing per-ticker data, sector map
   from `docs/data/system-map.json`. No new fetch. Owner: dev-mcp-server.

3. **Block/thỏa-thuận net-context tool** — over existing `put_through_vol` column.
   Per-deal direction stays REJECTED (§4 roadmap, unfetchable). Owner: dev-mcp-server.

4. **D3 full form wiring** in composite. Owner: dev-mcp-server.

### Phase 2 (= roadmap P2 tier — stretch, hard data)

Maps to roadmap §3 P2 stretch items and the composite-last rule.

1. **Full L3 cross-asset regime composite** — carry × credit × macro × volatility →
   risk-on/off signal + carry-unwind trigger. Owner: dev-mcp-server.

2. **Agent wiring expansion** — add composite to market-watcher Step 2 bootstrap,
   digest-predict P-3, alert-commander divergence-CRITICAL rule.

3. **ETF create/redeem** (VanEck VNM + Fubon — PARTIAL, already LIVE via mainserver;
   DCVFM pending VPS/Chromium assessment; Xtrackers EXCLUDED — synthetic swap, §4).
   Owner: dev-stock-price/dev-macro-indicators + dev-mcp-server.

4. **Margin-debt** (Circular-210 parser, quarterly +30-45d lag).
   SHIP level+QoQ+coverage% ONLY — z-score band NOT computable honestly (§4 roadmap).
   Owner: dev-pdf-extractor + dev-macro-indicators + dev-mcp-server.

5. **H/L-gated oscillators (MFI/CMF/A-D/Chaikin)** unlock automatically IF the OHLCV
   epic exposes H/L. Zero radar rework — additive only.

---

## 7. Zone Routing

| Zone / service | Phase | Deliverable |
|---|---|---|
| **dev-technical-analysis** (Go :5003) | 0 | `get_money_flow_oscillators`: OBV, rel-vol z(20), up/down ratio, degraded VWAP (`is_proxy=true`) |
| **dev-mcp-server** | 0 | `get_money_radar_composite` MCP tool; D1/D2/D3/D4 divergence detectors; composite aggregation + HN rules |
| **dev-vps-crawls** | 1 | Tự doanh EOD fetch (CafeF/Vietstock via VPS, reuse `cafef.ts`) |
| **dev-mcp-server** | 1 | `get_tu_doan_flow` tool; D3 full-form wiring; sector bucketing; block-deal net-context tool |
| **dev-frontend** | 0–1 | `apps/frontend/app/routes/dashboard.money-radar.tsx`; loader → `/api/money-radar`; 4 GaugeCards |
| **dev-mcp-server** | 2 | Full L3 cross-asset composite; agent flow wiring |
| **dev-stock-price / dev-macro-indicators** | 2 | ETF create/redeem (partial); margin-debt (Circular-210) |

---

## 8. Frontend Card Specification

**Route:** `apps/frontend/app/routes/dashboard.money-radar.tsx`
**Template:** mirror `apps/frontend/app/routes/dashboard.momentum.tsx` exactly.

PageHeader: title="Radar Dòng Tiền", subtitle="Tổng hợp dòng vốn thị trường",
FreshnessBadge(dataAsof=generated_at, slaTierKey='daily') in actions.

Grid: `grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4`

**4 GaugeCards (using `GaugeCard.tsx:45-127`, `FreshnessBadge.tsx:129-201`):**

| Card | title | scalar source | badge label options |
|---|---|---|---|
| Money Radar Composite | "Dòng Tiền" | `score.toFixed(2)` or `'—'` | MẠNH / YẾU / TRUNG TÍNH |
| Khối Ngoại | "Dòng Vốn Ngoại" | `foreign_accum_z_market.toFixed(2)` or `'—'` | GOM HÀNG / XÃ HÀNG |
| Khối Lượng Nội | "Khối Lượng Nội Địa" | `rel_vol_z_20.toFixed(2)` or `'—'` | CAO / THẤP |
| Phân Kỳ | "Tín Hiệu Phân Kỳ" | divergence.flag | PHÂN KỲ / KHÔNG RÕ |

Null rendering (per HN-6): scalar=`'—'`, badge={label:'Chưa có dữ liệu', color:'gray'},
nullReason from composite `null_reason`.
FreshnessBadge SLA: `'daily'` (maxStalenessMin=1560, 26h, same as momentum cards).
No diacritics in CSS class names. Vietnamese labels only in displayed strings.

---

## 9. Agent Consumption Wiring

| Agent / flow | Step | Action |
|---|---|---|
| **fb-market-poster** | STEP 1b (`main.md:150-186`) | Add `get_money_radar_composite()` as 4th hard-required-live tool alongside `get_market_foreign_flow`, `get_macro_snapshot`, `get_technical_indicators`. Feeds STEP 2b TNB Layer 2 (FX/capital-flow pressure `:298-306`). Divergence flag → "smart money vs crowd" line. Must clear CCATO gate (HN-7). Phase 0 wiring only; Phase 2 hardening. |
| **unified-agent / chef.md** | Step 3 Layer 2+3 (`:109-112,178`) | Radar composite as P0 enrichment for FII-flow thesis alongside `get_foreign_room`. Optional tier (not hard-required). Phase 1. |
| **market-watcher / cycle.md** | Step 2 bootstrap + evidence fragment `:83-101` | Add radar composite beside `get_volatility_indicators` + `get_breadth_thrust` + `get_foreign_room`; divergence severity as evidence fragment. Phase 2. |
| **digest-predict / daily-predict.md** | P-3 Market Indicators | Add composite + `delta_5d` as regime input beside breadth_thrust/volatility. Phase 2. |
| **alert-commander** | Firing gate (`:9-18`) | New divergence-CRITICAL rule: D3 (smart-money exit during euphoria) → CRITICAL alert. Phase 2. Gated on D3 non-null. |

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| H/L absent despite OHLCV tool description claiming OHLCV (C1) | Ship only the 4 shippable oscillators; VWAP labeled proxy; note gating explicitly in tool schema |
| Foreign-flow VPS (`bgapidatafeed`) market-hours-only (STALE_RISK) | `source_tier` floor = min contributing tier; FreshnessBadge market-hours logic; `coverage_pct` exposed |
| False divergence from early-session zero rows (`feedback_foreign_flow_deferred_write_race`) | Divergence requires BOTH axes non-null over the same window; zero-detection guard respected; UNKNOWN not GREEN |
| Credit-flow DEFAULT_RE_CREDIT_TRILLION never cleaned up | C3 contract; HN-3 enforcement; dev-mcp-server hardening in Phase 2 |
| `get_market_foreign_flow` watchlist-only (not full-exchange) | Honest COVERAGE_NOTE already present; sector/market composites carry same caveat; never presented as exchange-wide |
| TA Go :5003 stale-image / split-mismatch (ongoing epic) | Phase 0 oscillators computed from `daily_ohlcv` via dev-technical-analysis restart + re-probe AFTER any deploy; not from the stale TA image |
| Phase 2 radar cards empty while Phase 0 momentum cards honest-NULL | The contrast validates the architecture: radar cards render non-null (depth-independent) while momentum cards honest-NULL (OHLCV-depth-gated) — do NOT homogenize |

---

## 11. Sequencing Recommendation for PO (Phase-0-first)

**Sprint MONEY-RADAR-P0** — one focused sprint, 4 tasks:

1. **dev-technical-analysis**: add money-flow oscillator endpoint
   (`get_money_flow_oscillators` — OBV, rel-vol z(20), up/down ratio, degraded VWAP).
   Effort S. Zone: Go :5003.

2. **dev-mcp-server**: `get_money_radar_composite` MCP tool (wires existing tools + new
   oscillators, D1/D2/D3/D4 detectors, HN rules). Effort M. Zone: dev-mcp-server.

3. **dev-frontend**: `/dashboard/money-radar` route (4 GaugeCards, honest-NULL per §8).
   Effort S. Zone: dev-frontend.

4. **QA gate**: verify DoD per §6 Phase-0 DoD (non-null composite on live data; D2
   divergence fires on real example; null card honest-NULL; no momentum regression).

**HOLD until Phase 0 verified:** tự-doanh crawl, sector bucketing, agent wiring, CCATO wiring.
**HOLD permanently (§4 roadmap):** order-book one-sided flag, per-deal direction,
Xtrackers, margin-per-account.

---

## 12. Files Referenced (with evidence)

**Live tools (reuse):**
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:232-382`
- `apps/mcp-server/src/interface/mcp/tools/market-data/marketWideForeignFlowTool.ts:160-282`
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignAccumRankTools.ts:40-110`
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignRoomTools.ts:33-77`
- `apps/mcp-server/src/interface/mcp/tools/market-data/volatilityIndicatorTools.ts:42-110`
- `apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts:38-95`
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:430-499`
- `apps/mcp-server/src/interface/mcp/tools/sector/creditFlowTools.ts:249-282` (C3 — is_estimate)

**Fetchers / schema:**
- `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts:345` (put_through_vol extraction)
- `apps/mcp-server/src/infrastructure/fetchers/cafef.ts` (tự-doanh crawl template, Phase 1)
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:100` (put_through_vol column)

**Consumers (wiring targets):**
- `docs/agents/fb-market-poster/flow/main.md:150-186` (STEP 1b hard-required-live)
- `docs/agents/fb-market-poster/flow/main.md:298-306` (STEP 2b TNB Layer 2)
- `docs/agents/unified-agent/flow/chef.md:109-112,178`
- `docs/agents/market-watcher/flow/cycle.md:83-101`
- `docs/agents/digest-predict/flow/daily-predict.md` (P-3 stage)

**Frontend:**
- `apps/frontend/app/routes/dashboard.momentum.tsx:1-29` (honest-NULL contract template)
- `apps/frontend/app/components/GaugeCard.tsx:45-127` (props interface + render)
- `apps/frontend/app/components/FreshnessBadge.tsx:129-201` (badge + 'daily' SLA tier)
- New: `apps/frontend/app/routes/dashboard.money-radar.tsx`

**Governance:**
- `docs/roadmaps/vn-market-indicator-roadmap.md` (P0/P1/P2 tiers; §4 reject list)
- `docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md` (CCATO contract)
- `docs/data/system-map.json` (.project.watchlist; .project.data_sources; sector map)
- `docs/data/frontend-data-coverage-map.json` (coverage status)

---

## 13. Signal

Signal file: `docs/signals/money-radar-20260701T075240Z.json` → po
