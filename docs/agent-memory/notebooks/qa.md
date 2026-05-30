# QA — Notebook

## cycle-150 · 2026-05-30 · BCTC-TABLE-BOUNDARY BTB-QA — RED (2 blocking issues remain)

**Sprint:** BCTC-TABLE-BOUNDARY | **Task:** BTB-QA | **Verdict:** RED (partial progress — 2 of 4 issues remain)

```
date: 2026-05-30T01:45Z
type: anti-false-green adjudication (BTB-QA cycle-150 — post-ops-af59abee)
sprint: BCTC-TABLE-BOUNDARY
sentinel_A: FPT e71f845d-ffa5-48f9-8f09-30ac2cd09c65 (20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf, 46pp)
sentinel_B: ACB fea19bae-2b7a-4954-b3e0-e09d7bfc7390 (20260422-ACB-BCTC-Hop-nhat-Quy-1-nam-2026.pdf)
confirmed: ac6b1c2e is phantom (no financial_reports record); fea19bae is live ACB Q1-2026

UNIT TESTS: 122/122 PASS + 150/155 PASS (5 stale + 25/25 mcp + 12/12 pek)
DB SENTINELS: FPT=31 (27table+4prose, 0dup) VERIFIED | ACB=10 (5×2dup, 0prose) STALE

RED-3: 5 stale tests in test_pek_engine_adapter.py::TestGroupBboxesIntoUnits fail
  (import deleted _group_bboxes_into_units). AD-2 anti-drift guard green.
  ACTION: remove stale TestGroupBboxesIntoUnits class

RED-4: ACB sentinel not re-extracted (pdf-extractor busy with FPT cron).
  Current: 10 rows, 5×2dup, 0 prose (pre-fix state).
  ACTION: ops quiesce FPT, trigger ACB re-extraction, verify 0-dup + prose present

GREEN: FPT idempotency PROVEN (31 rows, 4+ extractions, 0dup);
  prose units PRESENT (4); 8-page cap REMOVED;
  core 122 tests PASS; mcp-server 25/25 + tsc 0 errors;
  frozen files 0-diff.

YOLO LIMITATION: page_type classification has margin errors (prose↔table mislabels);
  state machine logic is correct. Known PATH B limitation (stored_text="").
  Impact: some financial pages appear in prose units. Not a regression.
```

---

## cycle-149 · 2026-05-30 · BCTC-TABLE-BOUNDARY BTB-QA — RED (2 blocking issues)

**Sprint:** BCTC-TABLE-BOUNDARY | **Task:** BTB-QA | **Verdict:** RED

```
date: 2026-05-30T01:30Z
type: anti-false-green adjudication (BTB-QA)
sprint: BCTC-TABLE-BOUNDARY
commits: d297f3ba (boundary state machine) + b1e826c2 (instrumentation)
sentinels: FPT e71f845d + ACB fea19bae (correct id, not ac6b1c2e phantom)

UNIT TESTS: 42/42 + 58/58 + 38/38 + 659/659 all PASS | tsc 0 errors
DB SENTINELS: FPT 31 rows (needs live verify) | ACB not re-extracted (pending)

RED blockers: (1) 5 stale tests import deleted function; (2) ACB sentinel pending re-extraction

GREEN: all unit-test layers pass; frozen files 0-diff; push handler idempotent pattern correct
```

---

## Archive (cycles ≤148)

Historical QA cycle logs (2026-05-29 and earlier) archived here for reference.
Full session history available via git log `docs/agent-memory/notebooks/qa.md`.

---

**Binding:** Active cycle only (≤200L). Historical detail pruned 2026-05-30.
