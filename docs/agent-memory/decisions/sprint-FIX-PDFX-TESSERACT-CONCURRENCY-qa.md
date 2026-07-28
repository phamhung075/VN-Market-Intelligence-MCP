# Decision Journal — Sprint FIX-PDFX-TESSERACT-CONCURRENCY · qa

**Sprint goal:** verify-committed QA pass on the P0 OCR concurrency invariant fix (mechanism proof, falsification independently reproduced, live re-check).
**Agent:** qa
**Started:** 2026-07-28T17:00:00Z

---

### STEP qa-S1 · qa · 2026-07-28T17:05:00Z
**task-id:** FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT
**what-done:** Independently reconstructed and ran the RED-before/GREEN-after falsification myself (throwaway `git worktree` at `4bac2b85d^`, not the dev's word): patched `pytesseract.image_to_string` directly (ocr_gateway.py doesn't exist pre-fix) driving the same 15-wide real-ASGI-route burst — RED peak=15, matching the dev's claimed number. Ran the actual committed `test_ocr_concurrency_invariant.py` on HEAD — 8/8 GREEN.
**what-considered:**
- Trust the dev's close-out prose vs. re-run the falsification myself
- Literal test file can't run pre-fix (imports ocr_gateway) — reconstruct equivalent vs. skip this check
**why-decision:** "a test that cannot fail proves nothing" — router's central falsifiable hunt required independent execution, not a read.
**why-change:** none from plan.

### STEP qa-S2 · qa · 2026-07-28T17:08:00Z
**task-id:** FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT
**what-done:** Fixed-seed (12345) full suite run on both pre-fix worktree and post-fix HEAD — identical 7-failure set, byte-for-byte, on both; import-linter 3/3 KEPT (live `lint-imports` run); mypy env-bug reproduced verbatim; pytesseract 0.3.13 source read confirms real subprocess SIGKILL on `timeout=`.
**what-considered:** dev claimed "11" pre-existing failures; my runs saw 7-8 depending on seed.
**why-decision:** order-dependent (pytest-randomly) count variance, not a discrepancy in the core claim — same-seed-both-trees is what actually proves zero regression, and it held.
**why-change:** none from plan.

### STEP qa-S3 · qa · 2026-07-28T17:14:00Z
**task-id:** FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT
**what-done:** Live re-check (read-only ps/health/logs only): tesseract bound holds at 0-1 across ~15 samples; `docker logs` 30min tally 57x200/29x429/0x500 — 429 backpressure genuinely firing in live production. Router flagged a live memory finding mid-task; independently reproduced it myself before accepting: MemPerc back to 78-83% (VmHWM 97% of cap) ~23min post-restart under ordinary traffic, PID1 (uvicorn) RSS ~2.0-2.1GiB dominates, not tesseract.
**what-considered:** approve outright vs. fail the row for AC-4/live-burst gaps vs. approve mechanism + explicit correction.
**why-decision:** concurrency invariant (the row's actual title/root_cause) is proven; AC-4/live-burst-AC-2 are unmet as literally worded and the dev's "MemPerc ~95%->~9-11%" claim is a restart artifact, not durable — corrected explicitly in status_note rather than silently accepted, per verify-raw-not-badges. Root driver (parent-process RSS) is a separate, undiagnosed mechanism out of this row's scope — does not block, must not be folded in.
**why-change:** verdict = APPROVED for the concurrency mechanism specifically, with an explicit non-blocking correction recorded and a new-row recommendation routed to PO — not a clean unconditional APPROVED.
