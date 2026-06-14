---
name: regime-extraction
description: >
  SSOT regime extraction from bootstrap macro snapshot. Parse REGIME, CARRY_REGIME,
  US10Y_SIGNAL, DXY_SIGNAL from get_macro_snapshot. Each flow declares which
  variables it needs.
---

## Regime Extraction (Step 0b — from bootstrap, zero extra tool calls)

Parse `get_macro_snapshot` text block already in bootstrap context:

```
REGIME       = "Global Liquidity: X"    → TIGHTENING | EASING | NEUTRAL
CARRY_REGIME = "VND Carry Spread" line  → HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK
US10Y_SIGNAL = "US 10Y Yield" line      → RISK-OFF | RISK-ON | NEUTRAL
DXY_SIGNAL   = "DXY" line              → USD STRENGTHENING | USD WEAKENING | USD STABLE
```

If `get_macro_snapshot` not in bootstrap context → call it once now.

### PMI extension (T-16 — EXTEND 07-06)

When a flow declares `Variables` that includes `PMI_TREND`:
- Do NOT use the raw PMI print as the regime signal. Compute a 3-period moving average over the last 3 available monthly prints.
- `PMI_MA3 > 51 AND rising` → EXPANDING | `49–51 OR flat` → NEUTRAL | `< 49 OR falling` → CONTRACTING
- Source: `get_vn_macro_indicators(indicators=[pmi], transform=ma3)` when live; else use `get_macro_snapshot()` PMI field with `is_estimate=true`.
- Set `PMI_TREND_IS_ESTIMATE = true` until `get_vn_macro_indicators` is available.

### Usage in flow files

Each flow declares which variables it needs on a single line:
```
**0b. Regime** → skill: .claude/skills/regime-extraction/SKILL.md
Variables: REGIME, CARRY_REGIME
```

To additionally extract PMI momentum:
```
Variables: REGIME, CARRY_REGIME, PMI_TREND
```

Only extract the declared variables. Skip the rest.
