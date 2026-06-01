# QA — Notebook

## Archive (cycles ≤159)

Full detail available via `git log docs/agent-memory/notebooks/qa.md`.
Key milestones: cycle-159 BCTC-TRUST-RED APPROVED | cycle-157 AIT-QA APPROVED | cycle-156 HC-QA-3 APPROVED | cycle-153 AR-QA bake-off APPROVED.

---

**Binding:** Active cycle only (≤200L). Historical detail in git log.

---

## cycle-174 · 2026-05-31 · BANK-QA-3 — BANK-AWARE-BCTC — APPROVED

**Sprint:** BANK-AWARE-BCTC | **Task:** BANK-QA-3 | **Verdict:** APPROVED

```
date: 2026-05-31T~20:30Z
method: bun tsc + bun test (targeted + full suite batched)
commit: 941bf552 (BANK-DEV-4 hybrid discriminator)

TSC: 0 errors

TARGETED TESTS (sprint scope):
  BANK-AWARE-1 (DV-BANK-7 + 5 consumer tests): 29/0 PASS
  FU-6f-eval-blob-blockers: 8/0 PASS (DV-FU6F-B1-3 GREEN — was RED in QA-2)
  FU-6e-not-applicable-clear: 6/0 PASS
  240-bctc-full: 5/0 PASS
  Sprint total: 48/0 PASS

FULL SUITE (954 runnable files; 3 LanceDB excluded — Bun crash, pre-existing):
  10662 pass / 135 fail
  All 135 failures pre-existing: 089-tool-macro, 1414-diacritics, 1423-carry, 1570b-yield-spread
  Zero BANK-AWARE-BCTC regressions.

TRUTH TABLE SEEDS:
  ACB [A,B,I,I.1,XIII,01,null] → true (BANK) PASS
  FPT [100,270,411a,420a,420b] → false (CORPORATE) PASS
  income-only [10,60] → false (CORPORATE) PASS

DV-FU6F-B1-3 ROOT CAUSE CONFIRMED:
  BANK-DEV-2 3-digit-absence: ["10","60"] no 3-digit → isBankFormFromRows=true → bank anchors →
  2/2=1.0 → NOT red. Now: ROMAN_SECTION("10")=false → hasRomanOrSection=false → corporate →
  gross_profit null → 2/3<0.9 → RED. Correct.

CONSUMER INTEGRITY: 2 files changed (bctcFormType + test). Zero call-site signature changes.
C-6 computeBctcEval: corporate gross_profit still in goldenAnchors — confirmed via DV-BANK-5+DV-FU6F-B1-3.
DDD: PASS | Security: PASS

OUT-OF-SCOPE: BCTC-CODE-COLUMN-HYGIENE (label leaks to code col). Hybrid immune. Future task.
VCB PENDING/0rows: pre-existing.
```

REPORT: reports/TASK_REPORT_BANK-QA-3.md

---

## cycle-173 · 2026-05-31 · NB-PRUNE-1 — NB-PRUNE-FIX — APPROVED

Sprint: NB-PRUNE-FIX | Task: NB-PRUNE-1 | Verdict: APPROVED | Commit: 7166db01 (skill-only)
Fixtures: Session 5871L/69s→344L/3s (AC-5 guard fires); ISO-ts 316L/30s→27L/3s ≤200L; c-fmt 166L/12s→58L/3s ≤200L.
Preamble preserved: ISO+c-format confirmed. Exactly-3 no-prune: confirmed. Fenced ## over-count: theoretical only (0 live). TODO po/developer contradiction: deferred (po.md=26L). Skill 104L ≤120L cap. NB-PRUNE-1 → DONE in TASKS.md.
