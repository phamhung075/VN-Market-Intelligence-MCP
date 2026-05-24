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

Exit 0 = all scenarios passed. Non-zero = env-audit blocked, scenario failure, or schema error.

## Schemas

Scenario: `{ "primitive": "<name>", "input": {}, "expected_output": {} }`

Trace: `{ "passed": true, "primitive": "<name>", "actual": {}, "expected": {}, "diff": [], "elapsed_ms": 42 }`

## Security — Env-Audit Hard Gate (G7, Phase 2)

**The runner exits NON-ZERO and refuses to run any scenarios if a forbidden credential
env var is detected in the process environment.**

This is a HARD FAIL (upgraded from WARN in Phase 1). Scenarios never execute when
forbidden keys are present.

### Forbidden key pattern (module constant `_FORBIDDEN_ENV_REGEX`)

```
DB_PATH, DB_*, LANCEDB*, HF_TOKEN, HUGGINGFACE*, OPENAI_API_KEY,
EMBEDDING_MODEL, DATABASE_URL, API_KEY*, SECRET*, TOKEN*, PASSWORD*
```

### Allowed keys (explicit allowlist `_ENV_ALLOWLIST`)

- `HF_HUB_OFFLINE` — safety flag (R-5, pre-baked model cold-start hardening). **NOT forbidden.**

### Proof commands

```bash
# Clean env → exits 0, runs scenarios:
cd apps/rag-service
python -m sandbox --service=rag-service --tier=primitive --scenario=all

# Forbidden key injected → exits NON-ZERO, no scenarios run:
LANCEDB_PATH=/tmp/x python -m sandbox --service=rag-service --tier=primitive --scenario=all
# Output: [SANDBOX ERROR] Forbidden credential env vars detected: ['LANCEDB_PATH']. ...

# HF_HUB_OFFLINE allowed → exits 0 as normal:
HF_HUB_OFFLINE=1 python -m sandbox --service=rag-service --tier=primitive --scenario=all
```

## Edit-JSON-and-Rerun Cycle (G7 edit-rerun proof)

1. Edit any scenario JSON input field (e.g. change a `distance` value)
2. Re-run sandbox: `python -m sandbox --service=rag-service --tier=primitive --scenario=<path>`
3. Trace output changes to reflect the new inputs
4. Revert the edit: `git checkout <scenario-file>`
5. Re-run: trace returns to original output

No server restart, no model reload, no DB access required. Pure JSON → JSON.

## Known-Bad Scenarios (G8)

Files prefixed `known_bad_` contain deliberately wrong `expected_output` values.
They are permanent test artefacts proving the RED state is honest.

The `--scenario=all` default runner **skips** files prefixed with `known_bad_` (handled by
the `not f.startswith("_")` filter in `_collect_scenario_files`). Known-bad files have the
naming pattern `known_bad_*.json` — to run them explicitly, pass the full file path:

```bash
python -m sandbox --service=rag-service --tier=primitive \
  --scenario=apps/rag-service/domain/primitive/similarity_scorer/scenarios/known_bad_wrong_score.json
```
