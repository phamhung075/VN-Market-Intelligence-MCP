# Scenarios — PDF Extractor Sandbox

This directory contains scenario JSON files for the pdf-extractor sandbox runner.

## Directory Layout

```
scenarios/
├── README.md                          (this file — schema overview)
├── primitives/                        (primitive-tier scenarios)
│   ├── echo_identity/                 (scaffold fixture: identity/echo primitive)
│   │   ├── happy.json
│   │   ├── happy_string.json
│   │   └── failure_mismatch.json
│   ├── validate_financial_figures/    (P1-B1 — added by P1-B1 task)
│   └── decimal_normalizer/            (P1-B2 — added by P1-B2 task)
├── modules/                           (module-tier scenarios)
│   └── financial_reports/             (P1-D — added by P1-D task)
└── service/                           (service-tier scenarios — Phase 2+)
```

## Scenario JSON Schema

### Primitive-tier scenario

```json
{
  "primitive": "<function_name>",
  "inputs":    { "param1": "value1", "param2": "value2" },
  "expected":  "<return_value>"
}
```

- `primitive`: must match the Python module name under `domain/primitives/<name>/` and the callable name inside it (convention: module name == function name).
- `inputs`: keyword arguments passed verbatim to the primitive function.
- `expected`: exact equality check against the actual return value.

### Running a scenario

```bash
PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/echo_identity/happy.json
```

### Trace output (stdout)

```json
{
  "primitive": "echo_identity",
  "inputs":    { "value": 42 },
  "expected":  42,
  "actual":    42,
  "pass":      true,
  "error":     null
}
```

Exit code 0 = PASS. Exit code non-zero = FAIL (honest RED).

## Security Policy

Scenario JSON files MUST NOT contain:
- Real VPS URLs or IP addresses
- DB paths or credentials
- API keys, tokens, secrets, passwords
- OCR / Tesseract credentials

Use `http://localhost:9999` or `file://fixtures/` patterns for URL fixtures.
The sandbox process must pass the zero-creds env audit (AC-5) at all times.
