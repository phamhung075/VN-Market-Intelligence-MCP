# QA Review Record — rag-service P2-A (G4) + P2-G8 (G8)

**Date:** 2026-05-24
**QA agent cycle:** qa cycle-90
**Task:** P2-A (G4 import-linter fence deliberate-violation proof) + P2-G8 (G8 honest-red deliberate-break proof)
**Pilot:** rag-service
**Phase:** 2 OPEN

---

## P2-A — G4 Import-Linter Fence: Deliberate-Violation Proof (QA Co-Sign)

### Step 1: Clean Baseline — All 3 Contracts KEPT, Exit 0

```
$ cd apps/rag-service && lint-imports

Analyzed 32 files, 26 dependencies.
-----------------------------------
Fence-C: DDD layered architecture — domain is innermost, interface is outermost KEPT
Fence-A: primitives are independent — no primitive imports another primitive KEPT
Fence-B: retrieval module cannot import infrastructure KEPT

Contracts: 3 kept, 0 broken.
EXIT_CODE: 0
```

### Step 2: Fence-A Violation Injected (Working Tree Only — Never Staged)

File: `apps/rag-service/domain/primitive/similarity_scorer/similarity_scorer.py`
Injected line (l.15):
```python
from domain.primitive.top_k_selector import top_k_selector as _top_k  # DELIBERATE VIOLATION — DO NOT COMMIT
```

### Step 3: lint-imports With Violation — Exit Non-Zero, "Fence-A" Named

```
$ cd apps/rag-service && rm -rf .import_linter_cache && lint-imports

Analyzed 32 files, 27 dependencies.
-----------------------------------
Fence-C: DDD layered architecture — domain is innermost, interface is outermost KEPT
Fence-A: primitives are independent — no primitive imports another primitive BROKEN
Fence-B: retrieval module cannot import infrastructure KEPT

Contracts: 2 kept, 1 broken.

----------------
Broken contracts
----------------

Fence-A: primitives are independent — no primitive imports another primitive
----------------------------------------------------------------------------

domain.primitive.similarity_scorer is not allowed to import
domain.primitive.top_k_selector:

- domain.primitive.similarity_scorer.similarity_scorer ->
domain.primitive.top_k_selector.top_k_selector (l.15)

EXIT_CODE: 1
```

**R-FENCE gate criterion MET:** exit non-zero, "Fence-A" in output, file:line named.

### Step 4: Revert — Exit 0, All 3 KEPT, Never Committed

Violation reverted via Edit tool (line removed).
```
$ cd apps/rag-service && rm -rf .import_linter_cache && lint-imports

Analyzed 32 files, 26 dependencies.
-----------------------------------
Fence-C: DDD layered architecture — domain is innermost, interface is outermost KEPT
Fence-A: primitives are independent — no primitive imports another primitive KEPT
Fence-B: retrieval module cannot import infrastructure KEPT

Contracts: 3 kept, 0 broken.
EXIT_CODE: 0
```

```
$ git status --short apps/rag-service/domain/primitive/similarity_scorer/
(empty — clean)
```

**Violation never staged, never committed. git status CLEAN.**

### Pre-Revert Tag Anchor

| Field | Value |
|---|---|
| rag-pre-ci SHA | c061a74078369391f2e9efe498e02e08c188b7c8 |
| ancestor of HEAD | exit 0 (CONFIRMED) |
| .importlinter commit | 8a410685 (single commit on file) |
| CI job | .github/workflows/rag-service-py-lint.yml present |

### G4 Evidence Table

| Check | Result |
|---|---|
| AC-3: clean lint exit 0 | PASS — 3 contracts KEPT, exit 0 |
| AC-4: violation exit non-zero | PASS — exit 1, "Fence-A" in output, file:line cited |
| AC-4: "Fence-A" contract name in output | PASS — verbatim "Fence-A: primitives are independent" |
| AC-4: violation never staged/committed | PASS — git status CLEAN |
| AC-5: revert exit 0 | PASS — 3 contracts KEPT, exit 0 |
| AC-6: CI job present | PASS — .github/workflows/rag-service-py-lint.yml |
| AC-8: QA co-sign | PASS — QA independently reproduced all steps |
| rag-pre-ci tag ancestor | PASS — c061a740, merge-base exit 0 |

**G4 verdict: EARNED-PENDING. QA co-sign COMPLETE.**

---

## P2-G8 — G8 Honest-Red: Deliberate-Break + 5 Known-Bad Proof

### Baseline (before any corruption)

```
$ python3 -m sandbox --service=rag-service --tier=primitive --scenario=all
total=16 passed=16 failed=0
EXIT_CODE: 0

$ python3 dashboard/dash-check.py
24 checks passed, 0 checks failed
Verdict: PASS — all 5 primitive cards GREEN, module GREEN, microservice NOT-RUN
EXIT_CODE: 0
```

### AC-1: 1 Corrupted Golden → RED → Revert → GREEN

**Step 1 — Corrupt golden.json:** `similarity_scorer/scenarios/golden.json` `expected_output.similarity` changed from `0.6667` to `9.9`.

**Step 2 — Sandbox FAIL:**
```
$ python3 -m sandbox --tier=primitive --scenario=all
total=16 passed=15 failed=1
FAIL: similarity_scorer
  actual:   {'similarity': 0.6666666666666666}
  expected: {'similarity': 9.9}
EXIT_CODE: 1
```

**Step 3 — Dashboard RED (inline trace updated to passed:false in index.html):**
```
$ python3 dashboard/dash-check.py
FAIL  Trace #'trace-similarity-scorer-golden': passed=False —
      not green-worthy but would display as green (G8 violation)
23 checks passed, 1 checks failed
Verdict: FAIL
EXIT_CODE: 1
```

**Step 4 — Revert:** golden.json restored to `0.6667`, index.html inline trace restored to `passed:true`.

**Step 5 — Sandbox GREEN restored:**
```
$ python3 -m sandbox --tier=primitive --scenario=all
total=16 passed=16 failed=0
EXIT_CODE: 0

$ python3 dashboard/dash-check.py
24 checks passed, 0 checks failed
Verdict: PASS
EXIT_CODE: 0
```

```
$ git status --short apps/rag-service/domain/primitive/similarity_scorer/
(empty — clean)
$ git status --short apps/rag-service/dashboard/index.html
(empty — clean)
```

**Golden.json corruption and index.html modification NEVER COMMITTED.**

### AC-2: 5 Known-Bad Scenarios → All 5 exit 1, passed:false

Known-bad files (permanent artefacts, excluded from --scenario=all by `known_bad_` prefix):

| File | Deliberate wrong expected | Actual output | Result |
|---|---|---|---|
| `similarity_scorer/scenarios/known_bad_wrong_score.json` | `{"similarity": 9.9}` | `{"similarity": 0.6667}` | **passed:false, exit 1** |
| `relevance_threshold_gate/scenarios/known_bad_wrong_filter.json` | both results pass threshold | only doc-1 passes | **passed:false, exit 1** |
| `top_k_selector/scenarios/known_bad_wrong_k.json` | all 3 results returned for k=2 | only 2 returned | **passed:false, exit 1** |
| `context_window_packer/scenarios/known_bad_wrong_pack.json` | `"THIS IS WRONG EXPECTED OUTPUT"` | actual packed string | **passed:false, exit 1** |
| `temporal_decay_scorer/scenarios/known_bad_wrong_decay.json` | `{"score": 9.999}` | `{"score": 0.2}` | **passed:false, exit 1** |

All 5 produce `passed: false`, all 5 exit non-zero (exit 1). Dashboard would show each corresponding card as RED if inline traces were loaded from these bad scenarios.

### AC-3: No False Greens — Standard --scenario=all Still 16/16

```
$ python3 -m sandbox --service=rag-service --tier=primitive --scenario=all
total=16 passed=16 failed=0
EXIT_CODE: 0
```

The `known_bad_` prefix exclusion in `sandbox/__main__.py` line 227 prevents false-green contamination from known-bad files. Confirmed.

### AC-5: Standard Scenarios Regression After G8 Proof

```
$ python3 -m sandbox --service=rag-service --tier=primitive --scenario=all
total=16 passed=16 failed=0 — EXIT_CODE: 0

$ python3 dashboard/dash-check.py
24 checks passed, 0 checks failed — EXIT_CODE: 0
```

### AC-6: Env Audit Empty

```
$ env | grep -E 'DB_PATH|LANCEDB|HF_TOKEN|HUGGINGFACE|OPENAI_API_KEY|EMBEDDING_MODEL|DATABASE_URL'
(empty)
```

### G8 Evidence Table

| Check | Result |
|---|---|
| Baseline: 16/16 PASS, dash 24/24 | PASS |
| AC-1: golden→9.9 → sandbox exit 1, 1 FAIL | PASS |
| AC-1: dash-check FAIL (similarity-scorer RED) | PASS — exit 1, "passed=False" G8 violation message |
| AC-1: revert → 16/16 PASS, dash 24/24 | PASS |
| AC-1: golden.json + index.html never committed | PASS — git CLEAN confirmed |
| AC-2: known_bad_wrong_score.json | PASS — passed:false, exit 1 |
| AC-2: known_bad_wrong_filter.json | PASS — passed:false, exit 1 |
| AC-2: known_bad_wrong_k.json | PASS — passed:false, exit 1 |
| AC-2: known_bad_wrong_pack.json | PASS — passed:false, exit 1 |
| AC-2: known_bad_wrong_decay.json | PASS — passed:false, exit 1 |
| AC-3: --scenario=all 16/16 (no false-greens from known_bad_) | PASS |
| AC-5: standard regression after proof | PASS — 16/16, dash 24/24 |
| AC-6: env audit empty | PASS |
| Microservice NOT-RUN honest | PASS — no inline trace, dash PASS |

**G8 verdict: EARNED-PENDING. QA co-sign COMPLETE.**

---

## Task Status

| Task | Status |
|---|---|
| P2-A (G4 fence violation proof) | DONE — QA co-signed |
| P2-G8 (G8 honest-red proof) | DONE — QA co-signed |

**SSOT not mutated:** goalsEarned=0, decisionMatrix all TBD, G4/G8 stay EARNED-PENDING. No G-goal flips (§4.5 honored).

**NEXT:** dev-rag-service — P2-F (G5 delete+rewire: git mv → _deprecated/ + retriever.ts → ragHttpClient.ts). P2-A unblocks P2-F.
