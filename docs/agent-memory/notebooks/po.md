# PO Notebook

## Cycle 2026-05-30 — KICKOFF Sprint BCTC-AGENTIC-REFINE

USER-APPROVED plan `/Users/admin/.claude/plans/magical-cooking-cocoa.md` (read in full). Root-cause replacement for the recurring BCTC over-merge bug — 4 prior sprints patched the geometry middle; this REPLACES it OUTRIGHT with a cron-driven agent refine step.

**What:** OCR text + crisp pymupdf-rasterized page image → refine agent (numbers←text / structure←image / disagreement→FLAG never guess, balance = catch-net not gate) → trusted content. Feed BOTH `bctc_table_rows` (deterministic markdown→rows parser) AND `get_bctc_refined`. The existing `bctc-analyst` 6-pass expert flow consumes it UNCHANGED.

**User-LOCKED (do NOT re-litigate):** (1) OCR = local Tesseract behind swappable iface (Mistral later); (2) REPLACE OUTRIGHT — delete YOLO + bbox grouping + `bctc_page_grouper.py` 5-state machine; (3) analyst feed = BOTH (rows + refined md).

**Highest-risk item flagged to architect:** the markdown→`bctc_table_rows` parser is the NEW single point of correctness — must be DETERMINISTIC + heavily tested or expert analysis degrades silently. Architect must spec it TIGHTLY. DV RED→GREEN on parser AND idempotent store.

**Actions this cycle:** SPRINT_GOAL.md § BCTC-AGENTIC-REFINE prepended (full vision/contract/build-list/remove-list/DoD/owner-chain). TASKS.md seeded (AR-BA..AR-EXIT, 9 tasks, zone:multi). Umbrella lock `task:BCTC-AGENTIC-REFINE` claimed (claimed:true, sprint-task kind, TTL 3600). NEXT → ba (REQ decomposition + zone-split confirm).

## Carry-over
- **SUPERSESSION:** BCTC-AGENTIC-REFINE replaces the geometry middle that BCTC-LAYOUT-FIRST (LF-EXTRACT) + the just-signed BCTC-TABLE-BOUNDARY built. When AR ships, close BCTC-LAYOUT-FIRST LF-EXTRACT as superseded (LF-OVERLAY UX layer survives — refined units render in the same viewer). Reconcile at AR-ARCH brief.
- AR chain gates: critique-before-approve EVERY hop. Verify: parser DV red-before, idempotency ≥3× via in-container `bun:sqlite` direct read (NOT push echo), readiness gate skips IN_PROGRESS, FPT span [22,23] = ONE unit, replace-outright grep-proof (YOLO/grouper gone), PDF-Extract-Kit 0-diff.
- Scoped `git add <file>` only — working tree has MANY unrelated uncommitted files; NEVER `-A`.
- FU-BTB-OCR (OPEN MED) — may be mooted by AR (PATH B / OCR-text-into-descriptor is replaced wholesale). Revisit at AR-EXIT.
- FU-MON TIME-CRITICAL Monday: re-probe Brent/Gold delta after 06:00 UTC + get_foreign_flow(HPG) after HOSE open. Flip DONE or REOPEN.
- pdf-extractor container `unhealthy` — ops health-probe next triage (AR will rebuild it anyway).
- HOUSEKEEPING (non-blocking): qa.md ≫200L, TASKS.md >80L cap → claude-manager-helper prune; never block an exit on it.
- Still OPEN (WIP): SELF-IMPROVE-GATE X-1 (HIGH), CHEF-ATTN (MED), DPI-FOLLOWUPS FU-A/B/C (MED). string-vs-enum HELD.
