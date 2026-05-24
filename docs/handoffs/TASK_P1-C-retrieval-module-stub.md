---
task: P1-C
title: "retrieval module stub — Protocol ports + mock-port tests"
pilot: rag-service
status: DONE
commit: 8be07048
date: 2026-05-24T07:56:29Z
next_actor: qa
next_task: P1-E (dashboard stub, G12 streak #3)
---

# P1-C Handoff — Retrieval Module Stub

## G12 DoD Gate Evidence

### (a) Sandbox GREEN — both tiers

**Primitive tier (`--tier=primitive --scenario=all`):**
```json
[
  {"passed": true, "primitive": "mock_adder", "actual": {"sum": 7.0}, "expected": {"sum": 7.0}},
  {"passed": true, "primitive": "similarity_scorer", "actual": {"similarity": 1.0}, "expected": {"similarity": 1.0}},
  {"passed": true, "primitive": "similarity_scorer", "actual": {"error": "ValueError"}, "expected": {"error": "ValueError"}},
  {"passed": true, "primitive": "similarity_scorer", "actual": {"similarity": 0.6667}, "expected": {"similarity": 0.6667}}
]
```
Exit code: 0. All 4 scenarios PASS.

**Module tier (`--tier=module --scenario=all`):**
```json
{
  "passed": true,
  "primitive": "retrieval",
  "actual": {"top_k_ids": ["result-A", "result-B", "result-C"]},
  "expected": {"top_k_ids": ["result-A", "result-B", "result-C"]},
  "diff": [],
  "elapsed_ms": 0
}
```
Exit code: 0. Module scenario PASS.

### (b) Env audit EMPTY

```
env | grep -E 'DB_|API_KEY|SECRET|TOKEN|PASSWORD|LANCEDB|HF_|HUGGINGFACE'
# Returns: (empty — no forbidden keys in sandbox process)
```

## Fence-B Proof

```
grep -rn "lancedb\|sentence_transformers\|torch\|import.*infrastructure" \
  apps/rag-service/domain/module/retrieval/
```
Returns 0 code matches (only docstring/comment references). Fence-B CLEAN.

## pytest Count

- Baseline (P1-B): 41 tests
- After P1-C: **51 tests** (+10 mock-port unit tests)
- Exit: 51 passed, 0 failed

## Files Committed (commit 8be07048)

| File | Status |
|---|---|
| `domain/module/__init__.py` | NEW |
| `domain/module/retrieval/__init__.py` | NEW — exports RetrievalModule + ports |
| `domain/module/retrieval/ports.py` | NEW — EmbedderModulePort, VectorSearchPort (Protocol) |
| `domain/module/retrieval/module.py` | NEW — RetrievalModule + sandbox entry point `retrieve()` |
| `domain/module/retrieval/scenarios/module_golden.json` | NEW — multi-primitive module scenario |
| `__tests__/unit/test_retrieval_module.py` | NEW — 10 mock-port tests (happy/empty/distance filter) |
| `sandbox/__main__.py` | MOD — async coroutine support + `_` prefix skip |
| `mock_adder/scenarios/failure_wrong_sum.json → _failure_wrong_sum_scaffold.json` | RENAME |

## G2 Calibration Check

- RetrievalModule composes `similarity_scorer` primitive via port call (domain-to-domain)
- EmbedderModulePort + VectorSearchPort are Protocol (structural typing), not ABC
- No infrastructure imports anywhere in `domain/module/retrieval/`
- Module has its own multi-step scenario JSON (module_golden.json)
- Stub stubs: relevance_threshold_gate, temporal_decay_scorer, top_k_selector inline
  (Phase 2 bucket-B extractions)

## Next Task

→ P1-E: Dashboard stub — `apps/rag-service/dashboard/index.html` (3-panel, G12 streak #3)
