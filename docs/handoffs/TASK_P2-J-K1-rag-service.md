# P2-J (G10) + P2-K1 (G11) — rag-service QA Review Record

**QA cycle:** 100
**Date:** 2026-05-24
**Tasks:** P2-J (G10 close) + P2-K1 (G11 regression alarm proof)
**Pilot:** rag-service (Phase 2)
**SSOT:** docs/data/pilot-status-rag-service.json

---

## PART 1 — P2-J (G10): Fix Verification + Close

### Injection Recap (from SEALED record)

```
primitive: top_k_selector
file: apps/rag-service/domain/primitive/top_k_selector/top_k_selector.py
line: 30
injected_literal: results[k:]    (tail slice — returns items AFTER first k)
original_literal: results[:k]    (head slice — returns first k items)
injection_commit: 12d2381c
rag-pre-inject tag: 8b2dbf30
```

### Fix Verification

**Fix commit:** `695947d6 fix(rag-service): P2-J G10 blind fix — top_k_selector slice inversion`

**Diff verified:**
```diff
-    return results[k:]
+    return results[:k]
```

**Fix assessment:**
- (a) Fix CORRECTLY reverses the injection. `results[:k]` is the exact inverse of injected `results[k:]`. Not a masking hack — the single-character change restores the head-slice semantics. Verdict: EXACT INVERSE.
- (b) Cycle count: exactly 1 fix commit between injection (12d2381c) and green state (695947d6) touching apps/rag-service/. Below baseline 1.5. Verdict: BELOW BASELINE.
- (c) Sandbox verification (QA independently run):
  - `python3 -m sandbox --service=rag-service --tier=primitive --scenario=all` → EXIT:0, 16/16 PASS
  - `python3 -m sandbox --service=rag-service --tier=module --scenario=all` → EXIT:0, 2/2 PASS
  - `python3 apps/rag-service/dashboard/dash-check.py` → EXIT:0, 24/24 PASS
- (d) Coupled module scenario: `module_golden` shows `top_k_ids: ["doc-1"]` `passed: true`. Coupling CONFIRMED GREEN — root cause fixed, not patched around.

### Git Log (injection → fix window, rag-service only)

```
695947d6 fix(rag-service): P2-J G10 blind fix — top_k_selector slice inversion
12d2381c test(rag-service): P2-J G10 injection — sealed
```

Fix commits on rag-service between injection and green state: **1**

### G10 Evidence Summary

| Check | Verdict |
|-------|---------|
| Fix is exact inverse of injection | PASS |
| Not a masking hack | PASS |
| cycle_count = 1 | PASS (≤2, below baseline 1.5) |
| sandbox primitive 16/16 EXIT:0 | PASS |
| sandbox module 2/2 EXIT:0 | PASS |
| dash-check 24/24 EXIT:0 | PASS |
| module_golden GREEN (coupled scenario) | PASS |

**P2-J verdict: DONE.**
**G10 measurement: cycle_count=1 (below baseline 1.5 — strong result). Status field NOT flipped (PO-only §4.5).**

---

## PART 2 — P2-K1 (G11): 2-Trial Regression Alarm Coupling Proof

### Rubric

TA cycle-17 / macro cycle-57 precedent: TWO trials, each must show ≥1 COUPLED scenario flips RED when a primitive is mutated, and a SINGLE-EDIT fix restores GREEN. Outcome-(a) × 2 = PASS.

---

### Trial-1 — top_k_selector (P2-J evidence reused)

**Primitive mutated:** top_k_selector (`results[:k]` → `results[k:]`)
**Primary RED:** 3/3 top_k_selector primitive scenarios FAIL (golden, edge_k_equals_len, failure_k_exceeds_len)
**Coupled RED:** `module_golden` scenario FAILS — `top_k_ids: []` vs expected `["doc-1"]`

**Why this is coupling:** The retrieval module (domain/module/retrieval/module.py) calls `_select_top_k()` at Step 7 of the pipeline. The mutation propagates up: top_k_selector returns the TAIL of the sorted list instead of the head, so the single passing candidate (doc-1, distance=0.3) is dropped, producing an empty result that contradicts the module_golden expected output.

**Fix:** single-edit restore `results[:k]` in top_k_selector.py (commit 695947d6)
**Post-fix:** sandbox primitive 16/16 EXIT:0, module 2/2 EXIT:0

**Outcome-(a): OBSERVED** — mutation → coupled module scenario RED → single-edit fix → both GREEN.

---

### Trial-2 — relevance_threshold_gate (DIFFERENT primitive, working-tree only)

**Primitive mutated:** relevance_threshold_gate
**File:** apps/rag-service/domain/primitive/relevance_threshold_gate/relevance_threshold_gate.py
**Single-literal change (working tree only — NEVER committed):**
```diff
-    return [r for r in results if float(r.get("distance", float("inf"))) <= max_distance]
+    return [r for r in results if float(r.get("distance", float("inf"))) >= max_distance]
```
**Mutation class:** comparison operator flip (`<=` → `>=`) — causes gate to KEEP high-distance results and DISCARD low-distance results (inverted threshold logic).

#### BEFORE (mutation applied) — RED state:

**Primitive tier (EXIT:1):**
```
relevance_threshold_gate failure_all_below: passed=False
  actual: [{"id":"doc-a","distance":0.6},{"id":"doc-b","distance":0.9}]
  expected: []
relevance_threshold_gate golden: passed=False
  actual: [{"id":"doc-2","distance":0.8}]
  expected: [{"id":"doc-1","distance":0.3}]
```
2 of 3 relevance_threshold_gate scenarios FAIL. (edge_at_threshold passes because distance==max_distance satisfies both `<=` and `>=`.)

**Module tier (EXIT:1) — BOTH scenarios FAIL:**
```
retrieval module_edge_no_results: passed=False
  actual: {"top_k_ids":["doc-far-1","doc-far-2"]}
  expected: {"top_k_ids":[]}

retrieval module_golden: passed=False
  actual: {"top_k_ids":["doc-2"]}
  expected: {"top_k_ids":["doc-1"]}
```
Coupling path: `module.py` Step 5 calls `_threshold_gate(scored, max_distance)`. With inverted gate, doc-1 (distance=0.3 < 0.5) is now EXCLUDED and doc-2 (distance=0.9 > 0.5) is INCLUDED — the module golden expected output `["doc-1"]` becomes `["doc-2"]`. The module_edge_no_results scenario (all results above threshold, expected `[]`) also flips RED because those far-distance results now PASS the inverted gate.

**Regression alarm fired on 2 coupled module scenarios.**

#### AFTER (single-edit revert: `>=` → `<=`) — GREEN restored:

**Primitive tier (EXIT:0):** 16/16 PASS (all relevance_threshold_gate scenarios GREEN)
**Module tier (EXIT:0):** 2/2 PASS (module_golden + module_edge_no_results both GREEN)

**Git status post-revert:** CLEAN — mutation never staged or committed.

**Outcome-(a): OBSERVED** — mutation → 2 coupled module scenarios RED → single-edit revert → all GREEN.

---

### G11 Summary

| Check | Trial-1 | Trial-2 |
|-------|---------|---------|
| Primitive mutated | top_k_selector | relevance_threshold_gate |
| Mutation type | slice direction flip | comparison operator flip |
| Different from other trial | n/a | YES (different primitive) |
| ≥1 coupled scenario RED | YES (module_golden RED) | YES (2 coupled scenarios: module_golden + module_edge_no_results) |
| Single-edit fix restores GREEN | YES (commit 695947d6) | YES (working-tree revert) |
| Mutation committed to history | YES (P2-J inject: 12d2381c, fix: 695947d6) | NO (working-tree only) |
| Outcome-(a) observed | YES | YES |

**G11 verdict: PASS. Outcome-(a) × 2.**
**P2-K1 verdict: DONE. G11 EARNED-PENDING (PO flips at 12/12 terminal — §4.5).**

---

## SSOT Updates

- `docs/data/pilot-status-rag-service.json`: P2-J.status → DONE, P2-K1.status → DONE, G10.cycle_count → 1
- No G-goal status flips (PO-only per §4.5)
- decisionMatrix untouched
- goalsEarned stays 0

## Next

**P2-K2 (G9):** Playwright headless trust contract — LAST task. Owner: dev-rag-service.
