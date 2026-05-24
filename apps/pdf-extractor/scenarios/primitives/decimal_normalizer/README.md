# Primitive Scenarios — decimal_normalizer

## Primitive

`domain/primitives/decimal_normalizer/` — normalizes raw decimal strings extracted from Vietnamese BCTC PDFs into float values, correcting decimal-shift errors common in OCR output.

## Scenario JSON Schema

```json
{
  "primitive": "decimal_normalizer",
  "inputs": {
    "raw_string": <string>,
    "unit_hint":  <string>
  },
  "expected": <float | null>
}
```

`raw_string`: the raw string as extracted from PDF text (e.g. `"1234.5"`, `"0.000051"`, `"N/A"`).
`unit_hint`: hints at the unit context, e.g. `"billion_vnd"` (default), `"raw_micro"` (for decimal-shift correction).
`expected`: the normalized float value, or `null` if the string is non-numeric.

## Convention

| Filename | Category | Description |
|---|---|---|
| `happy_normal.json` | Happy | `"1234.5"` → `1234.5` (normal billion VND value) |
| `edge_decimal_shift_vnm.json` | Edge | `"0.000051"` + `unit_hint=raw_micro` → `51.0` (VNM net_profit decimal-shift fix) |
| `failure_non_numeric.json` | Failure | `"N/A"` → `null` (no crash, graceful return) |

## Decimal-Shift Bug Context

The decimal-shift bug class manifests in BCTC OCR output when billion-VND values are returned as micro-unit fractions:
- VNM `net_profit` = `0.000051` → should be `51.0` billion VND
- DHG `revenue` = `0.000009` → should be `9.0` billion VND

The `unit_hint="raw_micro"` corrects by multiplying by `1_000_000`.

## Running

```bash
PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/decimal_normalizer/happy_normal.json
```

## Failure Scenario Semantics

`failure_non_numeric.json` encodes `expected: null`. When the primitive receives a non-numeric string it returns `None` (Python null). `actual = null`, `expected = null` → `pass: true` (GREEN). This proves graceful handling of unparseable OCR output.
