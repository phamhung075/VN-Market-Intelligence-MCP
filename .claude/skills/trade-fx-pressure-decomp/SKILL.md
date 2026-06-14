---
name: trade-fx-pressure-decomp
description: >
  Thành's BOP/trade-deficit decomposition (T-26, T-33..T-36, T-38, T-40, T-42).
  Invoke when: monthly trade-balance release; any month VN prints a goods deficit;
  or when usdVnd direction=BEARISH while reserves/flows look benign (the "mysterious stability" case).
  Explains WHY a record deficit does or does not move FX. Runs in DEGRADED mode off
  get_macro_snapshot until get_vn_trade_balance and get_vn_bop are live.
  Outputs deficit anatomy, FX-incidence verdict, NEGATIVE-MARGIN-TRAP flag, and cycle_stage.
version: "2026-06-14"
---

## Trade/FX Pressure Decomposition (SKILL — T-26/T-33–T-36/T-38/T-40/T-42)

**Source techniques:** T-26/T-33/T-34/T-35/T-36/T-38/T-40/T-42 (07-06 roundtable, Thành)
**Cap:** 120L | **Ref brief:** `docs/architecture-briefs/2026-06-14-07-06-methodology-upgrade.md`

### Design principle

A large trade deficit does NOT automatically mean FX pressure. The key question is: **who owes the USD?** FDI firms settle offshore → no bank-side FX demand. Domestic firms must source USD locally → real pressure. This decomposition separates the two.

---

### Tool resolution

| Step | Live tool (when available) | Degraded fallback |
|---|---|---|
| Trade totals + bloc split | `get_vn_trade_balance(group_by=bloc)` | `get_macro_snapshot()` trade_balance field |
| HS attribution | `get_vn_trade_balance(group_by=hs_group)` | estimate from known weights (electronics ~70–80%, oil ~30%) |
| BOP walk | `get_vn_bop(components=[current_account,fdi_net,other_investment_net,errors_omissions])` | `get_macro_snapshot()` FX reserves trend |

**Degraded mode:** If live tools unavailable → set `is_estimate=true`, use known structural priors (see Step 3 fallback below), and mark `fx_incidence` as `UNKNOWN`.

---

### Step 1 — Two-bloc split (T-33)

Separate FDI-sector performance from domestic-sector performance:

```
fdi_surplus_b  = FDI-bloc exports - FDI-bloc imports   (typically positive, but trending down)
domestic_deficit_b = domestic exports - domestic imports   (typically negative)
deficit_total_b = fdi_surplus_b + domestic_deficit_b

Direction alert:
  fdi_surplus_b FALLING + domestic_deficit_b WIDENING = dual deterioration → elevated FX risk
```

**Reference (5M-2026):** FDI surplus fell ~14B→~6B; domestic deficit ~9B→~11B.

---

### Step 2 — HS attribution (T-34)

Attribute the deficit to import-heavy HS groups:

```
electronics_components_pct = electronics+components share of total deficit   (prior: ~70–80%)
oil_import_b               = crude + petroleum imports   (prior: ~3B, ~30% of deficit)

IF live get_vn_trade_balance(group_by=hs_group) available:
  compute actual shares per HS group
ELSE degraded:
  electronics_components_pct = 0.75  (structural prior — is_estimate=true)
  oil_import_b = null
```

---

### Step 3 — Processing-margin gate (T-35/T-36)

Export value / import value per HS group reveals the "margin trap":

```
electronics_margin = electronics_exports_value / electronics_imports_value

NEGATIVE-MARGIN-TRAP (T-36): flag = true when:
  electronics_margin < 1.0   AND   electronics export volume is RISING
  → "càng xuất khẩu càng chết" — increasing volume at sub-1 margin deepens deficit faster

VN structural range: ~0.6–0.7 (−20% to −40%, mean −30%)
```

**Degraded:** Use structural prior `electronics_margin = 0.65`, `is_estimate=true`.

Output: `electronics_margin`, `margin_trap_flag` (boolean)

---

### Step 4 — FX-incidence test (T-38/T-40)

Classify who actually needs to buy USD:

```
IF deficit is dominated by fdi_surplus_b DECLINING (i.e. FDI side contracting):
  → FDI bloc absorbs its own FX internally (parent transfers, offshore netting)
  → FDI surplus parked offshore at 0% VND deposit → shows as BOP errors-and-omissions
  → fx_incidence = FDI_BENIGN   (T-38)

IF domestic_deficit_b WIDENING:
  → domestic firms must source USD at SBV/commercial banks
  → fx_incidence = DOMESTIC_PRESSURE   (T-40)

MIXED: both trends present → fx_incidence = MIXED (higher risk than FDI_BENIGN)
```

**BOP errors-and-omissions proxy (T-38):** Báu estimates ~$450B cumulative offshore from 30yr FDI. When E&O is large positive, it signals FDI surplus parked abroad — real FX pressure is lower than headline deficit suggests.

---

### Step 5 — Duration prior (T-42)

Trade cycles run ~1 year peak-to-trough, not 2–3 months. Apply this prior when forecasting:

```
cycle_stage = estimate from deficit age:
  months_in_deficit <= 3   → EARLY
  months_in_deficit 4–9    → MID
  months_in_deficit >= 10  → LATE (mean-reversion plausible in 1–3m)

Do NOT forecast deficit mean-reversion inside 2–3 months regardless of level.
```

---

### Output schema

```json
{
  "deficit_total_b": 0.0,
  "fdi_bloc_b": 0.0,
  "domestic_bloc_b": 0.0,
  "hs_attribution": [
    {"group": "electronics_components", "share_pct": 75, "is_estimate": true},
    {"group": "oil", "value_b": 3.0, "is_estimate": true}
  ],
  "electronics_margin": 0.65,
  "margin_trap_flag": true,
  "fx_incidence": "FDI_BENIGN | DOMESTIC_PRESSURE | MIXED | UNKNOWN",
  "fx_pressure_verdict": "LOW | MODERATE | HIGH",
  "cycle_stage": "EARLY | MID | LATE",
  "is_estimate": true,
  "decomp_note": "<one-sentence summary>"
}
```

**`fx_pressure_verdict` rules:**
- `FDI_BENIGN` + `margin_trap_flag=false` → LOW
- `MIXED` OR `margin_trap_flag=true` → MODERATE
- `DOMESTIC_PRESSURE` AND `margin_trap_flag=true` → HIGH

---

### Usage in flow files

```
Step X: trade-fx-pressure-decomp
  skill: .claude/skills/trade-fx-pressure-decomp/SKILL.md
  trigger: monthly trade data release OR usdvnd=BEARISH with benign reserves
  output → session state as TRADE_FX
  on fx_incidence=DOMESTIC_PRESSURE → escalate FX alarm in market-watcher / CHEF
  on margin_trap_flag=true         → flag electronics tickers in bctc-analyst
  consumers: market-watcher (FX/trade), unified-agent/CHEF (electronics/IZ/banking), digest-predict (FX thesis)
```
