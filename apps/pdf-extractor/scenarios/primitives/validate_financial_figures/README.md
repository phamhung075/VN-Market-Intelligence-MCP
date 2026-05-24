# Primitive Scenarios — validate_financial_figures

## Primitive

`domain/primitives/validate_financial_figures/` — validates extracted BCTC financial figures against accounting rules.

## Scenario JSON Schema

```json
{
  "primitive": "validate_financial_figures",
  "inputs": {
    "total_assets":      <float | null>,
    "total_equity":      <float | null>,
    "total_liabilities": <float | null>,
    "operating_margin":  <float | null>,
    "net_revenue":       <float | null>
  },
  "expected": <float in [0.0, 1.0]>
}
```

All inputs are in billion VND (or ratios for `operating_margin`). `null` values are skipped — partial extraction is not penalized.

## Convention

| Filename | Category | Description |
|---|---|---|
| `happy.json` | Happy | All valid figures, no violations → 1.0 |
| `edge_vnm_val01.json` | Edge | VNM Q4 2024: assets=957T < equity=18829T → 0.0 (VAL-01) |
| `failure_negative_assets.json` | Failure | assets=-100 → 0.0 (VAL-02) — expected shows honest RED when mismatched |

## Validation Rules

Hard violations (return 0.0 immediately):
- `BCTC-VAL-01`: `total_assets < total_equity` (accounting identity broken)
- `BCTC-VAL-02`: `total_assets < 0`
- `BCTC-VAL-04`: `total_liabilities < 0`

Soft violations (-0.2 each, floor 0.1):
- `BCTC-VAL-03`: `operating_margin` outside `(-5.0, +1.0)` as ratio
- `BCTC-VAL-05`: `net_revenue <= 0`
- `BCTC-VAL-06`: `total_equity < 0`

## Running

```bash
PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json
```

## Failure Scenario Semantics

The `failure_negative_assets.json` scenario encodes the expected output as `0.0`.
- When run, `actual` = `0.0`, `expected` = `0.0` → `pass: true` (GREEN). This proves the primitive correctly identifies the hard violation.
- To observe honest RED for G8 testing: change `expected` to any non-zero value; runner exits non-zero.
