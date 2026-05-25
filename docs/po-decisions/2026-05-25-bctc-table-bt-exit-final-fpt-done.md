# PO Decision — BCTC-TABLE BT-EXIT FINAL: FPT Consolidated Balance-Sheet Goal SIGNED OFF

**Date:** 2026-05-25T20:51Z
**Decided by:** po (full autonomy, no user approval needed)
**Sprint:** BCTC-TABLE
**Supersedes:** the PARTIAL hold of 2026-05-25T20:18Z (BT-7 required)
**Records:** `docs/handoffs/TASK_BCTC-TABLE.md § [PO] BT-EXIT FINAL`

---

## Verdict

**DONE** — the user's explicit `/goal` ("bctc can extract correct result table for analyze") is met for the FPT consolidated balance sheet. **Sprint BCTC-TABLE CLOSED.** Follow-up **Sprint BCTC-TABLE-2 opened** for residual multi-ticker/quarterly coverage gaps (non-blocking).

## The PARTIAL hold had exactly two named blockers — both closed

The 2026-05-25T20:18Z PARTIAL hold did NOT rubber-stamp QA's APPROVED; it identified two specific reasons the FPT result table was not analysis-grade:

1. **Noise:** FPT Q4 stored 2170 rows across 44 pages (only 96 coded) — figures correct but buried in signature/cover-page text.
2. **Wrong period:** `period_current = "26/01/2026"` (the digital-signature timestamp), not the reporting period.

BT-7 (`210a0a62`) + the deploy/re-backfill (`29efb93c`, HEAD) closed BOTH, verified by deterministic read-only DB/API reads on the live container (`GET /api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`):

| Metric | PARTIAL (before BT-7) | FINAL (after BT-7, live) |
|---|---|---|
| FPT Q4 rows | 2170 (noise) | **150 (clean)** |
| FPT Q4 period_current | "26/01/2026" (signature) | **"31/12/2025"** |
| FPT Q4 period_prior | corrupted | "31/12/2024" |
| balanced / delta | true / 0 (buried) | **true / 0** |
| code 270 (Total Assets) | 88,089,621,779,862 | **88,089,621,779,862 EXACT** |
| code 300 (Total Liab) | 44,338,155,487,272 | **44,338,155,487,272 EXACT** |
| code 400 (Total Equity) | 43,751,466,292,590 | **43,751,466,292,590 EXACT** |
| code 440 (Total Nguồn Vốn) | — | **88,089,621,779,862 EXACT** |

Second independent clean balance proof: HPG Q4 = 117 rows, 31/12/2025, balanced=true.

The inspector renders the Code|Label|2025|2024 table + a green balance badge next to the OCR text. This is a clean, analyzable *result table*, not figures buried in noise — the goal is demonstrably met.

## QA re-gate: NOT required (recorded for honesty, not as a shortcut)

I did not order a formal QA re-gate. The mandate left this to my discretion. Rationale:
- BT-6 was already APPROVED on the full sprint (`acd0d61e`): security/DDD/privacy/commit-hygiene PASS, fence genuine (deliberate-violation → exit 1), 276/276 pdf-extractor + 38/38 mcp-server BCTC tests.
- BT-7 is a narrow, well-tested change: +281 passing tests (271 baseline + 10 new), including a Path-A end-to-end asserting the 44→4-page filter, ≤96 rows, `period_current=31/12/2025`, golden anchors exact, OCR-never-called; fence re-proven LIVE.
- The live numbers were produced by the **dev-mcp-server deploy agent against the running container** — independent of the dev-pdf-extractor author who wrote the fix — via deterministic DB/API reads. That is exactly the kind of independent live verification a QA re-gate re-runs.
- No schema/endpoint change (filter on supplied text + period scoping only) → minimal regression surface; QA's prior structural APPROVED carries forward.

Per `feedback_scale_pilot_done_bar.md`: this is NOT a scale-pilot terminal (no pilot-status edit, no G9 user sign-off gate). It is a post-pilot correctness build behind a frozen DONE pilot. The DONE bar here = "user's explicit target proven clean live," which is met.

## What is signed off — and what is explicitly NOT

**SIGNED OFF (DONE):** FPT consolidated balance sheet (page-4-first then 4-5-6 stitch) extracts to a clean, correct, analyzable result table live in `/api/bctc-inspect`, with the correct reporting period and an exact balance identity. HPG Q4 = second clean proof. Privacy PASS (self-hosted Tesseract only, zero external-API/VLM; BT-7 Path A = zero Tesseract, host-safe).

**NOT claimed — honest residual coverage gaps (all dev-pdf-extractor zone, NOT BT-7 regressions, NOT FPT-goal blockers):**
- (a) **FPT Q1 = 0 rows** — quarterly "Báo cáo tình hình tài chính" reuses code 270 for a different line → BT-5 cross-check gate CORRECTLY blocks (270≠300+400). The gate is behaving as designed; needs a quarterly code-map.
- (b) **Period-detection bugs on non-FPT layouts:** VEA `01/01/2025` (period-start leak), SHB `22/04/2025` (stray date). Distinct from the FIXED signature-date leak.
- (c) **ACB/DGC/DHG/EIB `period_current` EMPTY.**
- (d) **balance_pass=N/A docs** (no 270/300/400 → identity unverifiable; rows still stored + rendered). VNM 29 rows / EIB 68 rows look low vs a ~80-row full BS → possible partial extraction.

I am explicitly NOT overclaiming "all 14 docs perfect." Multi-ticker/quarterly coverage is INCOMPLETE.

## Decision

- **BT-EXIT verdict = DONE** for the FPT consolidated-balance-sheet goal. PARTIAL hold LIFTED.
- **Sprint BCTC-TABLE CLOSED.** Not kept open for residuals — that would conflate "user's ask is done" with "extractor is perfect," which is dishonest.
- **Sprint BCTC-TABLE-2 OPENED** (separate sprint, not a reopen) for residuals (a)-(d): B2-1 quarterly code-map, B2-2 period-detection hardening, B2-3 empty-period docs, B2-4 partial-extraction investigation. Routed to dev-pdf-extractor, MEDIUM priority, does NOT consume the WIP=2 fleet cap. See `docs/TASKS.md § Sprint BCTC-TABLE-2`.

## Privacy audit — PASS

Zero external-API/VLM in the live extraction path. BT-7 Path-A filter operates on already-stored OCR text (zero Tesseract — docker stats stable ~50 MiB, no swap pressure). Only external HTTP = `api.telegram.org` (WORK-alert text only) + Vinahost VPS BCTC file PULL (deprecated `inspection_store.py`, not the table path). No financial PDF/page-image sent off-infra.

## Commit handoff (MCP gateway / task_claim UNCALLABLE in this PO subagent harness)

`call_tool` / `search_tools` both error "No such tool available" in this harness (same as the ffe17028 hand-off). Per the fail-closed mutex guardrail I did NOT bypass it. Files written to the working tree, NOTHING staged. Main terminal commits:

```
git add docs/handoffs/TASK_BCTC-TABLE.md docs/SPRINT_GOAL.md docs/TASKS.md docs/po-decisions/2026-05-25-bctc-table-bt-exit-final-fpt-done.md
git commit -m "docs(bctc-table): BT-EXIT FINAL — FPT consolidated BS goal SIGNED OFF (sprint CLOSED); BCTC-TABLE-2 opened for residual coverage gaps"
```
