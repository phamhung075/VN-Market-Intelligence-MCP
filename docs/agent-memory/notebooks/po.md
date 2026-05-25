# PO Notebook

**Cycle:** BCTC-TABLE BT-EXIT FINAL — signed off FPT goal DONE, CLOSED sprint, opened BCTC-TABLE-2 for residuals.
**Last update:** 2026-05-25T20:51Z
**Status:** Sprint BCTC-TABLE CLOSED (BT-EXIT FINAL=DONE). BCTC-TABLE-2 OPEN (residual coverage, non-blocking). NEXT = dev-pdf-extractor (B2, not blocking).

---

## 2026-05-25T20:51Z — BCTC-TABLE BT-EXIT FINAL (lifted my own PARTIAL hold)

**Dispatch:** BT-7 shipped + LIVE (`210a0a62` fix + `29efb93c` deploy/re-backfill, HEAD). Decide: final sign-off vs more work.

**My prior PARTIAL had exactly two named blockers on the FPT target — both closed:**
- Noise: FPT Q4 2170 rows → **150 rows** (Path-A BS section filter now unifies with Path-B auto-locate).
- Period: `period_current` "26/01/2026" (signature date) → **"31/12/2025"** (two-pass `_detect_periods` rejects HH:MM:SS signature lines). period_prior=31/12/2024.
- balanced=true delta=0; anchors 270/300/400/440 ALL EXACT. HPG Q4 = 117 rows, 31/12/2025, balanced (2nd clean proof).

**QA re-gate: NOT required.** BT-6 already APPROVED (`acd0d61e`); BT-7 +281 tests incl. Path-A e2e + fence-live deliberate-violation; live numbers produced by the dev-mcp-server DEPLOY agent (independent of the fix author) via deterministic DB/API reads. Not a scale-pilot terminal (no pilot-status edit, no G9 gate) per feedback_scale_pilot_done_bar.md.

**VERDICT = DONE for the FPT consolidated-BS goal. Sprint CLOSED.** Did NOT keep it open for residuals (would conflate "ask done" with "extractor perfect" — dishonest). Privacy PASS (self-hosted Tesseract only; Path A zero Tesseract host-safe).

**Honest residuals → BCTC-TABLE-2 (NOT blockers, all dev-pdf-extractor):** (a) FPT Q1=0 (quarterly reuses code 270 → BT-5 gate correctly blocks; needs code-map); (b) VEA 01/01/2025 + SHB 22/04/2025 period bugs; (c) ACB/DGC/DHG/EIB period EMPTY; (d) balance_pass=N/A + low-row VNM(29)/EIB(68) possible partial extraction. NOT claiming "all 14 perfect."

**Wrote (working tree, NOTHING staged — MCP task_claim UNCALLABLE in harness, fail-closed mutex NOT bypassed):** [PO] BT-EXIT FINAL in TASK_BCTC-TABLE.md; SPRINT_GOAL build-status CLOSED; TASKS.md BT-EXIT/BT-7 DONE rows + BCTC-TABLE-2 sprint block (B2-1..B2-4); po-decisions/2026-05-25-bctc-table-bt-exit-final-fpt-done.md. Handed exact commit cmd to main terminal (as for ffe17028).

## Carry-over
- **Main terminal MUST commit** 4 files: TASK_BCTC-TABLE.md + SPRINT_GOAL.md + TASKS.md + po-decisions/2026-05-25-bctc-table-bt-exit-final-fpt-done.md (commit msg in po-decisions doc). Then notebook separately.
- **BCTC-TABLE-2 (dev-pdf-extractor, MEDIUM, no WIP-cap):** B2-1 quarterly code-map (FPT Q1), B2-2 period hardening (VEA/SHB), B2-3 empty-period (ACB/DGC/DHG/EIB), B2-4 partial-extraction (VNM/EIB low-row). Non-blocking; below active reliability/pilot work.
- LESSON (carried + confirmed): a clean result table = coded rows ≈ total rows + sane reporting period + exact identity. The BT-7 fix validated the PARTIAL-hold instinct: "has_table+delta=0" alone was NOT enough; row composition + period sanity were the real bar.
- mcp-server pilot still Phase-1-COMPLETE (not 11/11); frontend AWAITING-USER-G9.
