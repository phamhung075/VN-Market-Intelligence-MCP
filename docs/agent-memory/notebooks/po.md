# PO Notebook

## 2026-06-01T15:25Z — EXIT sign-off PROSE-TEXT-LOSS (Task #18) → CLOSED

Spawned for EXIT sign-off only (chain already complete: architect→dev→ops→qa).

**Verdict: APPROVED / DONE-CLOSED.** Display-only bug, no data ever lost.
- Root cause (Layer C / display): `handleBctcInspectOcr` queried `bctc_layout_units WHERE page_type='table'`, so prose pages fell to the coverage-gap branch with `text_content:""` while `pdf_extracted_text` held valid OCR for EVERY page.
- Fix a10448b0: gap-branch now `SELECT text_content,confidence FROM pdf_extracted_text WHERE filename=? AND page_number=?`; html renders `data.text_content`; `pek_coverage_gap:true` preserved (correct signal). +5 DV cases, DV-1 RED→GREEN with genuine pre-fix RED proof.
- OPS rebuild img 33e4386c ≠ prior 4446a6e9, container healthy, both greps confirm fix in /app/src.

**ROUTER RAW-VERIFY (not relaying QA badge):** read live `/api/bctc-inspect/ocr` myself — FPT (e8ea3df5) p1=2081ch real OCR ("CÔNG TY CỔ PHẦN FPT…"), p2=134ch ("BÁO CÁO TÀI CHÍNH HỢP NHẤT… QUÝ I 2026"); table pp.22/25 unaffected. Lesson [[feedback_router_verify_raw_not_badges]] applied.

**Recorded:** TASKS.md closed-sprints + EXIT commit defd3fdd; TASKS pruned 82→80L (collapsed DONE TSH-2/3/4 into one line). commit-mutex claim→release clean round-trip.

**Out-of-scope (pre-existing, NOT regressions, NOT reopened):** pp.22/25 identical content (one PEK segment-window) · VCB refine_status=PENDING placeholder · FU-BANK-CODECOL backlog · FPT YoY 2025-Q4 GM-100% → FU-TRUST-REFRESH.

**Carry-over / next queued (reported to router):**
- **TSH-1 (dev-mcp-server, MEDIUM)** SHIPS FIRST — deregister `get_market_hexagram` (kinhDichTools.ts:510–546) + drop orphan import. Then ops rebuild #1.
- **ENV-ISOLATION-P2 (#15, MEDIUM)** GATE-RELEASED/schedulable — EI-P2-1→2→3→QA. SERIALIZE the EI-P2-2 mcp-server rebuild against TSH-1 rebuild (same `apps/mcp-server/` zone) — never parallel.
- HIGH backlog still ahead of these: VPS-DEPLOY-PLACEHOLDER-GUARD (T1 ops-recon HARD GATE) · NB-PRUNE-FIX (NB-BLOAT-FLOW-OVERWRITE active).
