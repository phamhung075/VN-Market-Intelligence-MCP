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

### Usage in flow files

Each flow declares which variables it needs on a single line:
```
**0b. Regime** → skill: .claude/skills/regime-extraction/SKILL.md
Variables: REGIME, CARRY_REGIME
```

Only extract the declared variables. Skip the rest.
