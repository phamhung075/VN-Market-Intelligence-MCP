# PO Notebook

**Cycle:** BCTC-TABLE BT-EXIT — QA APPROVED, I held final sign-off at PARTIAL. Opened BT-7.
**Last update:** 2026-05-25T20:18Z
**Status:** Sprint BCTC-TABLE OPEN. BT-EXIT HELD. NEXT = dev-pdf-extractor BT-7.

---

## 2026-05-25T20:18Z — BCTC-TABLE BT-EXIT (did NOT rubber-stamp)

**Dispatch:** QA APPROVED (`acd0d61e`) ⇒ final PO sign-off. Mandate: verify the live result is a CLEAN result table, not figures buried in noise.

**Ran read-only live verification** (containers healthy; bun:sqlite readonly + GET /api/bctc-inspect/table):
- Per-doc row counts STABLE = match BT-4b-2 backfill table exactly → **74→2170 is all-pages NOISE, NOT accumulation.** Idempotent DELETE+INSERT works. (EIB/ACB were in BT-4b-2 `6d7839be`, not the abandoned BT-4b `0b4b3699` which returned 0 rows pre-BT-3-D.)
- FPT Q4 = 2170 rows over 44 pages (p1..p46), only **96 coded / 6 summary**. First rows = "Digitally signed by", signature/cover text. `period_current=26/01/2026` (signature date, not 31/12/2025). Pre-supply path (Path A) has NO BS-section filter; BT-3-D auto-locate only runs on Path B.
- Golden anchors EXACT (270/300/400, delta=0); VEA + HPG also balance true. QA gate explanation CONFIRMED (DGC/ACB balance_check=null → gate correctly skips).
- **Privacy PASS:** self-hosted Tesseract only; zero openai/anthropic/gemini/azure SDK in prod; paddleocr_vl only in spike eval (deferred). Only external HTTP = Telegram alert text + our own Vinahost VPS file-pull. No PDF/page-image off-infra.

**VERDICT = PARTIAL, BT-7-required-first.** Gap functionally closed (table renders, anchors exact) but `/goal` is "correct RESULT TABLE" — ~2000 noise rows + wrong period ≠ analyzable. Did NOT fully sign off.

**Wrote:** [PO] BT-EXIT record + BT-7 task in TASK_BCTC-TABLE.md; BT-6 DONE / BT-EXIT PARTIAL / BT-7 READY rows in TASKS.md; SPRINT_GOAL build-status. Explicit-file staging, mutex under sprint-task kind, zero foreign.

## Carry-over
- **BT-7 = dev-pdf-extractor:** filter pre_supplied_pages to BS section (same VN markers, on supplied text — host-safe zero Tesseract), unify Path A+B, scope period detection to BS header → FPT Q4 ~74-80 rows + period 31/12/2025, anchors still exact. Folds in 4-zero-row gap (FPT Q1 BS on stored page 3). Then QA re-verify → PO final BT-EXIT.
- LESSON: "has_table:true + balance delta=0" ≠ clean table. A correct figure inside 2000 noise rows with a wrong period is not "a result table for analyze". Always inspect row composition (coded vs noise) + period sanity, not just the anchor values.
- mcp-server pilot still Phase-1-COMPLETE (not 11/11); frontend AWAITING-USER-G9.
