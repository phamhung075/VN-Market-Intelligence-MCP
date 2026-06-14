---
name: macro-health-read
description: >
  Báu's "two trucks → six tracks" top-down macro read for VN (T-15..T-18, T-21, T-22, T-24, T-25).
  Invoke at the start of any cycle that needs a macro-layer read: market-watcher every cycle,
  unified-agent/CHEF before the TNB Layer-1 paragraph, digest-predict weekly.
  Runs in DEGRADED mode off get_macro_snapshot + get_policy_signals (all tracks marked
  is_estimate=true) until the new MCP tools land; upgrades automatically once they are live.
  Outputs a 6-track JSON with momentum verdicts, never absolute snapshots.
version: "2026-06-14"
---

## Macro-Health Read (SKILL — T-15..T-25)

**Source techniques:** T-15/T-16/T-17/T-18/T-21/T-22/T-24/T-25 (07-06 roundtable, Báu)
**Cap:** 120L | **Ref brief:** `docs/architecture-briefs/2026-06-14-07-06-methodology-upgrade.md`

### Design principle

Every track outputs a **momentum verdict** (STRONG / AVERAGE / WEAK), not a level snapshot.
Thresholds are relative-to-history and direction-aware (T-16/T-17/T-21).

---

### Tool resolution (two modes)

| Track | Live tool (when available) | Degraded fallback |
|---|---|---|
| Production: PMI | `get_vn_macro_indicators(indicators=[pmi], transform=ma5)` | `get_macro_snapshot()` PMI field |
| Production: IIP | `get_vn_macro_indicators(indicators=[iip], transform=ytd_cumulative)` | `get_macro_snapshot()` IIP field |
| Consumption | `get_vn_macro_indicators(indicators=[retail_sales_nominal, retail_sales_real])` | `get_macro_snapshot()` consumption field |
| Inflation | `get_cpi_components(basis=yoy, weights=true)` | `get_macro_snapshot()` CPI field |
| Investment | `get_vn_macro_indicators(indicators=[public_investment, fdi_registered, fdi_disbursed])` | `get_policy_signals()` investment block |
| FX/Rates | `get_vn_liquidity_state()` | `get_macro_snapshot()` usdVnd + `get_policy_signals()` |

**Degraded mode rule:** If live tools return 404 / tool-not-found → fall to fallback and set `is_estimate=true` for that track.

---

### Step 1 — Production track (T-16/T-17)

**PMI (T-16):** Read PMI as a 3–5-period moving average over the raw print, not the raw print itself. Raw-print noise hides trend direction.
```
pmi_ma = CALL get_vn_macro_indicators(indicators=[pmi], transform=ma5) OR fallback
verdict:
  pmi_ma > 51 AND rising → STRONG
  pmi_ma 49–51 OR flat   → AVERAGE
  pmi_ma < 49 OR falling → WEAK
```

**IIP (T-17):** Use YTD-cumulative YoY, NOT MoM (Tết seasonality distorts MoM).
```
iip_ytd = CALL get_vn_macro_indicators(indicators=[iip], transform=ytd_cumulative) OR fallback
Compare to prior-year same-period YTD (momentum only).
```

Combine → `production_verdict: STRONG | AVERAGE | WEAK`

---

### Step 2 — Consumption track (T-18)

Strip CPI from nominal retail sales to isolate real demand:
```
real_growth = nominal_retail_growth_pct - cpi_yoy_pct
  (or directly from retail_sales_real if available)

nominal_growth  → read from macro data
real_growth     → compute as above
price_driven    → true if (nominal_growth - real_growth) > 3pp
```

**Example (T-18):** Nominal 11.2% with CPI ~6% → real ~5.2% = "thấp" (below 6% real = WEAK demand).

```
real_growth > 7% → STRONG
real_growth 4–7% → AVERAGE
real_growth < 4% → WEAK
```

Output: `nominal_growth`, `real_growth`, `price_driven` (boolean), `consumption_verdict`

---

### Step 3 — Inflation track (T-21/T-22)

**CPI peak-detection (T-21):** Is YoY CPI rolling over? Compare this month vs prior 3 months.
```
cpi_peaked = true if cpi_yoy_current < cpi_yoy_3m_avg
```

**Component decomposition (T-22):** Transport ~20% weight, housing+construction materials, food & catering are the main movers. Administered-price categories (education, health) mask underlying demand inflation — exclude from trend judgment.

```
IF live get_cpi_components available:
  report top-3 contributors by weight × change
  set cpi_peaked boolean from momentum of heaviest movers
ELSE degraded:
  read CPI headline from get_macro_snapshot
  set cpi_peaked = null (unknown in degraded mode)
  is_estimate = true
```

Output: `cpi_yoy`, `cpi_peaked` (boolean or null), `top_contributors[]`, `inflation_verdict`

---

### Step 4 — Investment track (T-24/T-25)

**Đầu tư công (T-24):** Is disbursement accelerating vs plan? Only the disbursement rate matters, not the registered budget.

**FDI quality (T-25):** Registered ≠ disbursed ≠ productive. Note sector quality (high-tech/AI chips/data centers vs commodity assembly). Cross-check against `trade-fx-pressure-decomp` NEGATIVE-MARGIN-TRAP before treating FDI as unambiguously positive.

```
fdi_disbursed_ratio = fdi_disbursed / fdi_registered   (target > 60%)
public_investment_verdict = ACCELERATING | FLAT | LAGGING
```

Output: `public_investment_verdict`, `fdi_registered_b`, `fdi_disbursed_b`, `fdi_disbursed_ratio`, `fdi_quality_note`, `investment_verdict`

---

### Step 5 — FX/Rates track (T-27/T-28/T-29/T-30)

This step captures direction only. Deep decomposition → delegate to `trade-fx-pressure-decomp`.

```
usdvnd_direction: APPRECIATING | STABLE | DEPRECIATING   (vs 1-month trend)
sjc_world_gap_vnd: <value>   ← narrowing gap = easing stress (T-27)
cnyu_coupling_active: true if CNY has weakened > 1% vs USD YTD   ← T-28 rule:
  VND stress is real only when CNY weakens vs USD; if CNY holds/strengthens → downweight VND alarm
interbank_1w_vs_refi: above | at | below   (T-29)
omo_outstanding_trend: rising | flat | falling   (T-30)
```

Output: `usdvnd_direction`, `sjc_world_gap_vnd`, `cny_coupling_active`, `interbank_vs_refi`, `fx_verdict`

---

### Output schema

```json
{
  "production":   {"value": "<pmi_ma>/<iip_ytd>", "trend": "rising|flat|falling", "verdict": "STRONG|AVERAGE|WEAK", "is_estimate": true},
  "consumption":  {"nominal_growth": 0.0, "real_growth": 0.0, "price_driven": false, "verdict": "STRONG|AVERAGE|WEAK", "is_estimate": true},
  "inflation":    {"cpi_yoy": 0.0, "cpi_peaked": null, "top_contributors": [], "verdict": "RISING|PEAKING|FALLING", "is_estimate": true},
  "investment":   {"public_investment_verdict": "ACCELERATING|FLAT|LAGGING", "fdi_disbursed_ratio": 0.0, "fdi_quality_note": "", "verdict": "STRONG|AVERAGE|WEAK", "is_estimate": true},
  "fx":           {"usdvnd_direction": "STABLE", "sjc_world_gap_vnd": 0, "cny_coupling_active": false, "interbank_vs_refi": "at", "verdict": "BENIGN|STRESS|WATCH", "is_estimate": true},
  "liquidity":    {"omo_outstanding_trend": "flat", "verdict": "AMPLE|NEUTRAL|TIGHT", "is_estimate": true},
  "macro_regime_note": "<one-sentence summary>"
}
```

All `is_estimate` fields default `true` until the 5 new MCP tools (`get_vn_trade_balance`, `get_vn_bop`, `get_vn_macro_indicators`, `get_cpi_components`, `get_vn_liquidity_state`) are live. Set to `false` per-track as each tool becomes available.

---

### Usage in flow files

```
Step X: macro-health-read
  skill: .claude/skills/macro-health-read/SKILL.md
  output → session state as MACRO_HEALTH
  on is_estimate=true for any track → log "[macro-health] degraded: <track> is_estimate"
  consumers: market-watcher Step 2, unified-agent/CHEF Step 2/3, digest-predict weekly
```
