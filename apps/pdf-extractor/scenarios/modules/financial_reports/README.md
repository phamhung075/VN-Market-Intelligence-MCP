# Module Scenarios — financial_reports

## Module

`domain/modules/financial_reports/` — composes `validate_financial_figures` and `decimal_normalizer` primitives via Protocol ports to produce a validated financial report from raw OCR extraction output.

## Scenario JSON Schema

```json
{
  "module": "financial_reports",
  "inputs": {
    "raw_assets":      <string>,
    "raw_equity":      <string>,
    "raw_liabilities": <string>,
    "raw_margin":      <string>,
    "raw_revenue":     <string>,
    "unit_hint":       <string>
  },
  "expected": {
    "confidence": <float in [0.0, 1.0]>
  }
}
```

Each `raw_*` field is the OCR-extracted string before decimal normalization. The module applies `decimal_normalizer` first, then `validate_financial_figures`. `unit_hint` is forwarded to the normalizer.

## Convention

| Filename | Category | Description |
|---|---|---|
| `multi_primitive_story.json` | Happy (multi-primitive) | Full pipeline: raw strings → normalize → validate → confidence |

Multi-primitive stories exercise ≥2 primitives in sequence within a single module run.

## Running

```bash
PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \
    --tier=module \
    --scenario=apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json
```

## Security Policy

All scenario JSON files in this directory MUST NOT contain:
- Real VPS URLs or IP addresses
- DB paths or credentials
- API keys, tokens, secrets, passwords

Use synthetic fixture values only. Zero real company names required — use placeholder values.
