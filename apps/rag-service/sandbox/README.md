# Sandbox Runner

Scenario JSON → trace JSON. ZERO model/DB access. stdlib only.

## Usage

```bash
# Run from apps/rag-service/
python -m sandbox --service=rag-service --tier=primitive --scenario=<path-to-scenario.json>
python -m sandbox --service=rag-service --tier=primitive --scenario=all
python -m sandbox --service=rag-service --tier=module   --scenario=all
python -m sandbox --service=pdf-extractor --tier=primitive --scenario=<path>
python -m sandbox --service=rag-service --tier=primitive --scenario=<path> --output=trace.json
```

Exit 0 = pass. Non-zero = fail or schema error.

## Schemas

Scenario: `{ "primitive": "<name>", "input": {}, "expected_output": {} }`

Trace: `{ "passed": true, "primitive": "<name>", "actual": {}, "expected": {}, "diff": [], "elapsed_ms": 42 }`

## Security

ZERO ML/DB framework imports. Warns (not fails) on forbidden env vars (G7 baseline; full gate Phase 2 P2-E).
