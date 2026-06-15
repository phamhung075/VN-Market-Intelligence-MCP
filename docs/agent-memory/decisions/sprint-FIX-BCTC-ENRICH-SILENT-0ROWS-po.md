# Decision Journal — FIX-BCTC-ENRICH-SILENT-0ROWS (po)

## DJ-GATE — done_verified gate probe 2026-06-15T20:10Z [task_id: FIX-BCTC-ENRICH-SILENT-0ROWS]

**Context:** dev-team :07 merge-gate landed 68d54c7b (pdf-extractor Layout-6/7) +
989654f2 (mcp-server 0-row enrich gate); pm flipped row in_progress->review
(ad4c1537). PO drove the rebuild->verify pipeline that satisfies the documented
done_verified gate.

**What-considered:**
- only path: rebuild BOTH images (force-recreate per-container, never compose down),
  then RAW-verify the 3 documented gate checks against named-volume market.db.
- Pipeline pivot (NOT in plan): the board gate named `runBctcReparseJob` as the
  re-trigger, but RAW inspection showed that job is a TEXT-stranded-PDF recovery
  path (Tier 1b/2 pdf-parse) that does NOT exercise the B02-TCTD table-extraction
  fix. The ACTUAL fixed path is `runBctcPdfPullJob` (it pulls pending queue rows,
  calls the pdf-extractor, then applies the 989654f2 0-row gate). Drove the real
  path by resetting VCB 2026Q1+2025Q1 queue rows -> pending (in-container Bun, not
  sidecar — WAL lock) and running the pull job. Anchor VCB 2025Q4 (id 221) never
  reset.

**Why-change (from plan):** the documented re-trigger was the wrong job; switched to
the job that actually contains the merged fix. Verdict is more honest as a result.

**Raw evidence (named-volume vn-market-intelligence-mcp_market_data):**
- Rebuild: pdf-extractor img .Created 2026-06-15T19:29:13Z (sha ef0acd92), mcp-server
  19:37:04Z (sha 4e0206fe) — both > commit 19:12Z. pek-import-chain ALL OK (cv2/fitz/
  doclayout_yolo/paddleocr/torch). All 13 containers healthy post-rebuild; one transient
  zombie-PID on pdf-extractor recreate cleared by SIGKILL, no peer killed.
- check (a) real VARIED rows: **FAIL** — VCB 2026Q1 + 2025Q1 STILL 0 bctc_table_rows
  after re-enrich; pushBctcExtraction all-3-tiers chars:0. fitz: VCB_2026_Q1.pdf =
  53pp, 110 text-chars/first 8pp, images present = SCANNED/image-only. Layout-6/7
  text-table parser cannot fire on 0-char input — OCR rasterization missing.
- check (b) fail-loud: **PASS** — both rows -> enrich_failed (NOT done), logger.error
  "ENRICH 0-rows — FAIL LOUD", enrichFailed:2. 989654f2 confirmed working live.
- check (c) non-regression: **PASS** — FPT 2026Q1=145, VCB 2025Q4=112 intact.

**Decision:** HOLD FIX-BCTC-ENRICH-SILENT-0ROWS at review, done_verified WITHHELD
(check-a fails the user-facing /goal#1 bar — get_bctc_full(VCB/CTG) still 0 rows).
Merged code is CORRECT but INCOMPLETE: silent-swallow (b) + text-layout (c-safe) shipped;
scanned-bank-PDF leg needs OCR. Minted FIX-BCTC-BANK-PDF-OCR-RASTERIZE -> ready[] (P0,
dev-pdf-extractor, generic no-allowlist, PaddleOCR already in-image). cowork bctc-analyst
CTG/VCB/D2D RELEASE block stays JUSTIFIED (real, not a stale flag). orch-state committed
4763dee7. PUSH held (origin ~57 behind via benign cloud-chore divergence).

**Reusable scripts persisted:** scripts/ops-bctc-enrich-reverify-pulljob.sh,
scripts/po-s64-bctc-enrich-gate-hold-mint-ocr-triage.jq.
