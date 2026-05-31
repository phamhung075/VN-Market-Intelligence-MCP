# QA — Notebook

## cycle-172 · 2026-05-31 · BANK-QA-2 — BANK-AWARE-BCTC — CHANGES_REQUESTED

**Sprint:** BANK-AWARE-BCTC | **Task:** BANK-QA-2 | **Verdict:** CHANGES_REQUESTED — 1 blocking

```
date: 2026-05-31T~18:30Z
method: bun test (scoped 7 files) + tsc + sqlite3 in-container direct reads

TEST COUNTS:
  BANK-AWARE-1 (DV-BANK-1..7): 26/0 PASS
  HCM-DISAMBIG: 19/0 PASS (0-diff confirmed)
  240-bctc-full: 5/0 PASS
  7-file combined run: 82 pass / 1 FAIL
  tsc: 0 errors | DDD: PASS | Security: PASS

FAILING TEST:
  FU-6f-eval-blob-blockers.test.ts:387 — DV-FU6F-B1-3
  Expected stage_statuses[6]="red", received "yellow"
  Root: VNM seeded with 2-digit codes only ("10","60") → isBankFormFromRows=true
        → goldenAnchors drops gross_profit → 2/2=1.0 → not red.
  This is a FU-TRUST-REFRESH test (FU-6f), not a BANK-AWARE-BCTC test.

DV-BANK-7 GENUINE: Seed-4 (codes "01","02","I","B") proves structural over domain string.
  OLD: isBankForm("other")=false (wrong for ACB). NEW: isBankFormFromRows=true (correct).

CORPUS REGRESSION:
  FPT 2026-Q1: gross=4,244,889 (34%) / net=2,476,789 / balance=0% / NO misclassification PASS
  ACB 2026-Q1: gross=null / net=4,320,388 / balance=0% / bank correctly classified PASS
  VCB 2025-Q4: PENDING (0 rows, not finalized) — gross=net=100% pre-existing artifact, not regression

BLOCKING (1):
  FU-6f-eval-blob-blockers.test.ts:387 — DV-FU6F-B1-3 discriminator edge case
  Fix: add 3-digit balance code to test fixture OR tighten discriminator for 2-digit-only sets
```

REPORT: reports/TASK_REPORT_BANK-QA-2.md
NEXT: dev-mcp-server | DV-FU6F-B1-3 fix — discriminator edge case (2-digit-only corporate seed)

---

## cycle-171 · 2026-05-31 · FU-4 CLOSING GATE — FU-TRUST-REFRESH — CHANGES_REQUESTED

**Sprint:** FU-TRUST-REFRESH | **Task:** FU-4 CLOSING GATE | **Verdict:** CHANGES_REQUESTED — 2 new blocking

```
date: 2026-05-31T17:30Z
reports: FPT e8ea3df5 / ACB fea19bae
method: direct in-container bun:sqlite + bctc-eval API + source inspection

SCALAR STATUS (all prior BLOCK-A/B/C remain resolved):
  FPT: gross=4,244,890 / margin=34% / net=2,476,790 / assets=68,586,095 / equity=40,122,037
       balance=0% / DT-1 CLEAN / DT-2 PASS / rows=145 / PENDING / DONE
  ACB: gross_profit=NULL (cleared FU-6e) / gross_margin_pct=NULL / equity=98,751,052
       PBT=5,368,138 / net=4,320,388 / net_revenue=6,989,162 / assets=1,030,900,741
       balance=0% / DT-1 CLEAN / DT-2 PASS (NULL≠net_revenue) / rows=106 / PENDING / DONE

BCTC EVAL:
  FPT: overall=yellow (stage-4 GREEN; stages 1-3 backfill; stage-6 yellow balance-signal only)
  ACB: overall=RED — stage-6 RED: golden_row_match=0.667 < 0.9
       Root: computeBctcEval.ts:171 goldenAnchors=["net_revenue","net_profit","gross_profit"]
       hardcoded for all domains; bank gross_profit=null → scored as missing anchor.
       Eval config bug (pre-existing gap exposed by correct FU-6e fix).

get_bctc_full: serves from scalar cols (bctcFullTools.ts:125 row.gross_profit).
  FPT gross=4,244,890 PASS | ACB gross=null PASS (no stale 100% margin)

TESTS: FU-6e 6/0 | FU-6 suite 56/0 | tsc 0 errors | DDD PASS | Security PASS
TREE: HCM-DISAMBIG 0-diff | PDF-Extract-Kit 0-diff | FU-6 files all committed

BLOCKING (2):
  B-1 computeBctcEval.ts:171 — goldenAnchors bank-unaware → ACB eval RED
      Fix: exclude gross_profit for bank domain; re-run eval for fea19bae
  B-2 finalizeBctcRefineTool.ts — income_stmt_json.grossProfit still 6,989,162 stale
      Fix: null-clear blob field alongside scalar in NOT-APPLICABLE path
```

REPORT: reports/TASK_REPORT_FU-4-CLOSING-GATE.md
NEXT: dev-mcp-server | B-1 domain-aware goldenAnchors + B-2 income_stmt_json sync;
      ops | re-run eval ACB; re-gate

---

## cycle-170 · 2026-05-31 · FU-4 FINAL RE-GATE — FU-TRUST-REFRESH — CHANGES_REQUESTED

**Sprint:** FU-TRUST-REFRESH | **Task:** FU-4 FINAL RE-GATE | **Verdict:** CHANGES_REQUESTED — 1 new blocking (DT-2 ACB gross_profit)

```
date: 2026-05-31T16:30Z
reports: FPT e8ea3df5 / ACB fea19bae
method: direct in-container bun:sqlite + local source inspection

PRIOR BLOCKERS STATUS:
  BLOCK-A (ACB equity_total stale): RESOLVED — stored 98,751,052 (was 1,030,900,741)
  BLOCK-B (ACB PBT/net_profit wrong picks): RESOLVED — PBT=5,368,138, net_profit=4,320,388
  BLOCK-C (enforceBalanceIdentity fail-open): RESOLVED — source lines 330-365 return
    violation string on any null required scalar; allAbsent check preserves income-only exemption

ACB BALANCE IDENTITY: |932,149,689 + 98,751,052 - 1,030,900,741| = 0 → 0.0000% PASS

FPT REGRESSION: all scalars correct (assets=68,586,094 / equity=40,122,036 / gross=4,244,889 /
  net=2,476,789) / balance=0% / gross≠net / DT-1 CLEAN / DT-2 PASS / rows=145 / PENDING — PASS

ACB SCALARS: equity/PBT/net_profit correct. gross_profit=6,989,162=net_revenue (FAIL).
  Code "20" absent from bctc_table_rows. Aggregator returns null. finalizeBctcRefineTool.ts:423
  null-skip fires → stale legacy pdf-parse value persists. DT-2 ACB: FAIL.

TESTS: FU-6d-scalar-correctness.test.ts 12/0 | tsc 0 | mock-guard PASS | DDD PASS | Sec PASS
get_bctc_full: FPT PASS | ACB gross 100% wrong (stale); PBT/net/equity now correct

BLOCKING (1):
  finalizeBctcRefineTool.ts:~423 — null-skip leaves stale gross_profit for banks.
  Fix: explicitly write null for gross_profit when aggregator bank-path returns null.
```

REPORT: reports/TASK_REPORT_FU-4-FINAL-REGATE.md
NEXT: dev-mcp-server | null gross_profit for bank reports in finalize; re-finalize ACB; re-gate

---

## cycle-169 · 2026-05-31 · FU-4 RE-GATE — FU-TRUST-REFRESH — CHANGES_REQUESTED — 3 blocking

ACB equity_total=1,030,900,741 (= assets; correct=98,751,052) BLOCK-A. PBT=147M/net=74K wrong picks BLOCK-B. enforceBalanceIdentity returns null on null equity (fail-open) BLOCK-C. FPT PASS.
REPORT: reports/TASK_REPORT_FU-4-REGATE.md | NEXT: dev-mcp-server FU-6d 3-block fix

---

## cycle-168 · 2026-05-31 · TSH-2/3/4 RE-VERIFY — TOOL-SURFACE-HYGIENE — APPROVED

All 6 tool description distinctions live post-rebuild (ca53c8de). Container built 11:25 post-commit f4da532f 11:13. toolCount=154. APPROVED.

---

## cycle-167 · 2026-05-31 · FU-4 QA — FU-TRUST-REFRESH — CHANGES_REQUESTED — 2 blocking

financial_reports aggregate scalars not updated by re-refine (get_bctc_full serves equity=0 for FPT). ACB bctc_eval stale red. FPT table rows 114 (was; now 145 after fix).

---

## cycle-166 · 2026-05-31 · TSH-2/3/4 QA — TOOL-SURFACE-HYGIENE — CHANGES_REQUESTED — stale container

Container image 31min before commit f4da532f. All 6 descriptions missing. Ops rebuild needed.

---

## cycle-165 · 2026-05-31 · TSH-1 QA — TOOL-SURFACE-HYGIENE — CHANGES_REQUESTED — 2 blocking

285-kinhdich-tools.test.ts:83-85 + :103-115 still expect get_market_hexagram (now deregistered). toolCount=154 CORRECT (155-1). Container post-c29f36cf. Fix: remove 2 test cases, "6"→"5".

---

## cycle-164 · 2026-05-31 · ENV-ISOLATION EI-P1 Gate — APPROVED

EI-P1-1/2/3 all green. 9 services APP_ENV=production confirmed. 4 deliberate-violation RED tests proven. SOP doc 241L. APPROVED.

---

## cycle-163 · 2026-05-31 · FU-TRUST-REFRESH/FU-1 QA — APPROVED

pdf-extractor /page-text OCR seam. 783 pass/40 fail (40 pre-existing). FU-1 23 new tests 23/0. RED path proven (source_reachable:false, not silent empty). APPROVED.

---

## cycle-162 · 2026-05-31 · MACRO-CMDTY-DELTA QA — CHANGES_REQUESTED

BRENT/GOLD delta correct (prev-day close). DPI-3 AC-2/AC-3 timestamps same-day → fail. Test-only fix needed.

---

## cycle-161 · 2026-05-31 · P1-QA — DWF-PHASE1 Adaptive Cadence — APPROVED

48/48 pass. 3 RED proofs. 14 enabled slots. NFR-P1-1/5 untouched. APPROVED.

---

## cycle-160 · 2026-05-31 · DWF-QA — DYN-WF-FOUNDATION Phase 0+2 — APPROVED

Phase 0+2 all green. DV-P2-1..7 + DV-TTL-CAP-1..4 pass. tsc 19 errors pre-existing (DWF test file only). APPROVED.

---

## Archive (cycles ≤159)

Full detail available via `git log docs/agent-memory/notebooks/qa.md`.
Key milestones: cycle-159 BCTC-TRUST-RED APPROVED | cycle-157 AIT-QA APPROVED | cycle-156 HC-QA-3 APPROVED | cycle-153 AR-QA bake-off APPROVED.

---

**Binding:** Active cycle only (≤200L). Historical detail in git log.
