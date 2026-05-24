---
title: "P2-J1 Bug-Injection Spec — low_confidence_gate Threshold Off-By-Literal"
date: "2026-05-24"
author: "qa"
status: "SEALED"
pilot: "pdf-extractor"
charter_goal: "G10"
task_id: "P2-J1"
target_file: "apps/pdf-extractor/domain/primitives/low_confidence_gate/primitive.py"
detection_scenario: "apps/pdf-extractor/scenarios/primitives/low_confidence_gate/edge_low_confidence_flag.json"
baseline_cycles: 1.5
target_cycles: 2
---

# SEALED — G10 measurement integrity

**WARNING: The fixing dev agent MUST NOT read this file.**
This spec exists solely for QA cycle-counting and injection-mechanics reference.
The blind dev diagnoses purely from the failing sandbox scenario and dashboard card.
Reading this file constitutes a cheat that voids the G10 measurement.

---

# P2-J1 Bug-Injection Spec — G10 AI-Fixability Proof (pdf-extractor)

**Audience:** P2-J2 (qa, performs injection), qa (counts cycles at P2-J3 close).
**Authority:** `phase-2-task-plan-python.md §P2-J1/P2-J2`; baseline from `docs/data/bug-inventory.json`.
**Pattern:** Follows `docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md` precedent.

---

## Selected Primitive — `low_confidence_gate`

**Why this primitive over `decimal_normalizer`:**

1. `decimal_normalizer` was already used for the G8 deliberate-break proof (P2-E2) — using it again reduces the novelty of the G10 test.
2. `low_confidence_gate` threshold boundaries are the explicit "G10/G11 injection targets" called out in both the task plan (§P2-B2 IMPORTANT boundary note) and in `primitive.py`'s docstring ("THESE ARE G10/G11 INJECTION TARGETS").
3. Single-literal constant mutation: `_LOW_CONF_THRESHOLD` — exactly the canonical off-by-one / wrong-value injection pattern.
4. The affected scenario (`edge_low_confidence_flag.json`) produces a concrete wrong string output ("normal" vs expected "low_confidence") — unambiguous RED, not a floating-point tolerance issue.

---

## Mutation

| Field | Value |
|---|---|
| File | `apps/pdf-extractor/domain/primitives/low_confidence_gate/primitive.py` |
| Line | 40 |
| Constant | `_LOW_CONF_THRESHOLD` |
| Original literal | `0.2` |
| Mutated literal | `0.1` |
| Full original line | `_LOW_CONF_THRESHOLD: float = 0.2  # strictly less than → low_confidence; ≥ → normal` |
| Full mutated line | `_LOW_CONF_THRESHOLD: float = 0.1  # strictly less than → low_confidence; ≥ → normal` |

**Semantic effect:** With threshold=0.1, the gate now classifies confidence=0.15 as "normal" (since 0.15 >= 0.1) instead of "low_confidence" (since 0.15 < 0.2). The `failure_zero_skip.json` and `happy_normal.json` scenarios are unaffected (exact-zero gate and high-confidence path remain correct). The mutation is strictly scoped to the mid-range boundary.

---

## Expected Failure Signature

| Scenario | Pre-injection | Post-injection |
|---|---|---|
| `edge_low_confidence_flag.json` (confidence=0.15, expected="low_confidence") | GREEN — actual="low_confidence", pass=true | **RED** — actual="normal" (0.15 >= 0.1), expected="low_confidence", pass=false |
| `happy_normal.json` (confidence=0.85, expected="normal") | GREEN | GREEN (unaffected: 0.85 >= 0.1, returns "normal" — same result) |
| `failure_zero_skip.json` (confidence=0.0, expected="skip") | GREEN | GREEN (unaffected: zero-gate fires before threshold check) |
| `known_bad_disposition_wrong.json` (G8 fixture) | RED (intentional) | RED (still fails — this is a known-bad fixture; irrelevant to G10 measurement) |

**Detectability claim:** The mutation produces a wrong string output, not a floating-point near-miss. `edge_low_confidence_flag.json` card MUST flip RED. If it does not, the mutation did not land — do not proceed.

**Dashboard impact:** The `low-confidence-gate` primitive card flips RED. All other primitive cards (validate-financial-figures, decimal-normalizer, confidence-scorer, ratio-computer, field-extractor) remain GREEN. The module card (financial-reports) may also flip RED if the multi-primitive story exercises the gate — this is expected and counts as part of the same injection.

---

## Pytest Impact

The `primitive.py` unit tests that assert `gate_confidence(0.15) == "low_confidence"` will also FAIL after injection. This is expected — the injection is committed as-is (broken state is the measurement baseline). pytest failure count for low_confidence_gate boundary tests: estimated 1–3 tests depending on how many edge-case assertions exist. pytest delta should be reported in the P2-J2 commit.

---

## Cycle-Counting Protocol

1. **Cycle definition.** One cycle = one dispatch of dev-pdf-extractor ending with a commit + sandbox re-run.
2. **GREEN exit.** A cycle is the successful cycle if every `low_confidence_gate` scenario card (excluding known_bad fixtures) shows GREEN on the sandbox dashboard immediately after commit.
3. **Cycle increment.** Any cycle where `edge_low_confidence_flag.json` remains RED = +1 cycle, re-dispatch.
4. **No partial credit.** Any RED scenario on the low_confidence_gate card = cycle does not count as success.
5. **Known-bad fixture stays RED.** `known_bad_disposition_wrong.json` showing RED is correct — do not count it as a failure.
6. **Cross-primitive isolation.** If dev's fix accidentally breaks another primitive, that counts as +1 cycle (regression).
7. **No-cheat clause.** Dev agent must not read this file. QA verifies agent's bash history at P2-J3 cycle-count review.

---

## Baseline & Target

| Metric | Value | Source |
|---|---|---|
| `baselineCycleCount` | **1.5 cycles** | `docs/data/bug-inventory.json` § `pdf_extractor_baseline.baselineCycleCount` (system-wide fallback) |
| G10 target | **≤ 2 cycles** | Pilot charter G10 |
| Failure | > 2 cycles to all-GREEN | Per protocol above |
| Tie-break | Exactly 2 cycles = PASS (target is ≤ 2, inclusive) | — |

---

## Correct Fix

The correct fix is a single-literal restore:

```python
_LOW_CONF_THRESHOLD: float = 0.2  # restore from 0.1 → 0.2
```

Any other approach (e.g., changing the scenario expected value, changing the comparison operator, adding a special case for 0.15) does NOT constitute a correct fix and results in continued RED or a masked RED.

---

## Downstream Hand-Off

- **P2-J2 (injection commit):** QA sets pre-inject tag, mutates line 40, confirms RED on edge scenario, commits.
- **P2-J3 (blind dev fix):** dev-pdf-extractor dispatched with SYMPTOM ONLY — "low-confidence-gate card RED; edge scenario FAIL". No spec reference provided.
- **P2-J3 cycle-count:** QA applies protocol above; records in `pilot-status-pdf-extractor.json` G10 evidence at close.

---

## References

- `docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-2-task-plan-python.md` §P2-J0/J1/J2
- `docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md` (precedent pattern)
- `docs/data/bug-inventory.json` §pdf_extractor_baseline
- `apps/pdf-extractor/domain/primitives/low_confidence_gate/primitive.py` line 40 (injection site)
- `apps/pdf-extractor/scenarios/primitives/low_confidence_gate/edge_low_confidence_flag.json` (detection scenario)
