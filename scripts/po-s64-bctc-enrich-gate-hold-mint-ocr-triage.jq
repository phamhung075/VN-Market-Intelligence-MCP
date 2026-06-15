# po-s64-bctc-enrich-gate-hold-mint-ocr-triage.jq
# Single-pass done_verified-gate triage for FIX-BCTC-ENRICH-SILENT-0ROWS.
#
# Live RAW probe (2026-06-15, rebuilt pdf-extractor + mcp-server images, named-volume
# market.db) split 3 gate checks:
#   (a) get_bctc_full(VCB) real VARIED rows  -> FAIL: VCB 2026Q1 + 2025Q1 still 0 table_rows
#       after re-enrich through the FIXED runBctcPdfPullJob. Root: scanned/image-only bank
#       PDF (110 text-chars / first 8 pages of 53) -> Layout-6/7 text-table parser never
#       fires (no extractable text); OCR rasterization is the missing leg.
#   (b) 0-row enrich -> enrich_failed not done -> PASS: both VCB rows flipped enrich_failed
#       + logger.error "ENRICH 0-rows — FAIL LOUD". Silent-advance genuinely fixed.
#   (c) non-regression FPT 2026Q1 (145) + VCB 2025Q4 (112) -> PASS (intact, untouched).
#
# Action (all idempotent, atomic temp->verify->rename):
#  1. HOLD FIX-BCTC-ENRICH-SILENT-0ROWS at review (done_verified stays PENDING) with a
#     SHARPENED gate note recording the (a) FAIL + (b)/(c) PASS and the OCR root cause.
#  2. MINT FIX-BCTC-BANK-PDF-OCR-RASTERIZE to ready[] (the precise follow-on: scanned
#     B02-TCTD bank PDFs need OCR rasterization before the Layout-6/7 parser can extract
#     rows; generic across all scanned/image-only PDFs, no per-ticker allowlist).
#
# Conservation: review[] length unchanged; ready[] += exactly 1 (skipped if id present in
# ANY board array); the FIX-BCTC row keeps status REVIEW + lane review; FPT-BT5 untouched.
#
# Flow-doc pointer: docs/agents/po/flow/main.md § Reusable triage scripts.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" \
#   -f scripts/po-s64-bctc-enrich-gate-hold-mint-ocr-triage.jq docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH; PUSH held).

def all_ids: [.task_board[] | (if type=="array" then .[] else empty end) | .id] ;
def has_id($x): (all_ids | index($x)) != null ;

# 1. SHARPEN the gate note on the held review row (status + lane unchanged).
.task_board.review = (.task_board.review | map(
  if .id == "FIX-BCTC-ENRICH-SILENT-0ROWS" then
    . + {
      "done_verified": "PENDING",
      "done_verified_gate_probe": {
        "probed_at": $now,
        "by": "po",
        "method": "rebuilt BOTH images (pdf-extractor .Created 2026-06-15T19:29:13Z, mcp-server 19:37:04Z — both > commit 19:12Z), force-recreate per-container (no peer killed, all 13 healthy), re-drove VCB 2026Q1(id 292117)+2025Q1(id 224) queue rows through the FIXED runBctcPdfPullJob; raw-read named-volume market.db (vn-market-intelligence-mcp_market_data) via keinos/sqlite3 sidecar.",
        "check_a_real_varied_rows": "FAIL — VCB 2026Q1 + 2025Q1 STILL 0 bctc_table_rows after re-enrich. pushBctcExtraction all-3-tiers exhausted chars:0 confidence:0. ROOT: VCB bank PDFs are SCANNED/image-only (fitz: 110 text-chars across first 8 of 53 pages, images present). The Layout-6/7 text-table parser (68d54c7b, _try_parse_code_row) cannot fire on 0-char input — OCR rasterization is the missing leg, NOT a parse-layout gap.",
        "check_b_fail_loud": "PASS — both VCB rows flipped status=enrich_failed (NOT done); logger.error '[bctcPdfPull] ENRICH 0-rows — FAIL LOUD'; pull result enrichFailed:2. 989654f2 silent-advance fix CONFIRMED working live.",
        "check_c_non_regression": "PASS — FPT 2026Q1 = 145 rows (done), VCB 2025Q4 = 112 rows (done); both anchors intact + untouched.",
        "verdict": "HOLD at review. done_verified WITHHELD: check (a) FAILS — the user-facing get_bctc_full(VCB/CTG)='Chua co du lieu BCTC' is NOT resolved (still 0 rows). The merged code is CORRECT but INCOMPLETE: it fixes the silent-swallow (b) + the text-table layout (c-safe) but the scanned-bank-PDF leg needs OCR. cowork bctc-analyst CTG/VCB/D2D RELEASE gate stays JUSTIFIED-blocked (block is real). Follow-on minted: FIX-BCTC-BANK-PDF-OCR-RASTERIZE."
      }
    }
  else . end
))
|

# 2. MINT the OCR-rasterize follow-on to ready[] (idempotent).
.task_board.ready = (
  if has_id("FIX-BCTC-BANK-PDF-OCR-RASTERIZE") then .task_board.ready
  else .task_board.ready + [{
    "id": "FIX-BCTC-BANK-PDF-OCR-RASTERIZE",
    "type": "FIX",
    "priority": "P0",
    "status": "READY",
    "route_to": "dev-pdf-extractor",
    "zone": "apps/pdf-extractor/",
    "mode": "code",
    "size": "M",
    "title": "Scanned/image-only B02-TCTD bank PDFs yield 0 text-chars -> Layout-6/7 parser never fires -> 0 table_rows: add OCR rasterization leg before text-table parse",
    "desc": "LIVE-VERIFIED by PO 2026-06-15 done_verified gate probe of FIX-BCTC-ENRICH-SILENT-0ROWS: after rebuilding BOTH images and re-enriching VCB 2026Q1+2025Q1 through the fixed runBctcPdfPullJob, both STILL produced 0 bctc_table_rows. fitz raw: VCB_2026_Q1.pdf = 53 pages, 110 text-chars across first 8 pages, embedded images = SCANNED/image-only. pushBctcExtraction's 3 text-tiers (pdf_path / remote-URL / pdf-parse) all returned chars:0 confidence:0. The Layout-6/7 fix (68d54c7b) parses TEXT lines into code-rows and is correct, but it never receives text for scanned bank PDFs. MISSING LEG: rasterize image-only/low-text PDF pages and OCR them (PaddleOCR is already in the pdf-extractor image — pek-import-chain ALL OK) BEFORE handing text to _try_parse_code_row. This is the actual remaining root of get_bctc_full(VCB/CTG)='Chua co du lieu BCTC'.",
    "generic_mandate": "GENERIC across ALL scanned/image-only PDFs (any ticker, any form). Detect low-text-density (e.g. chars-per-page below a threshold) and route to the OCR-rasterize path — NO per-ticker allowlist, NO VCB/CTG date-literal.",
    "fail_loud_requirement": "If OCR rasterization still yields 0 rows, the existing 989654f2 enrich_failed gate keeps it visible (NOT done) — do not regress that fail-loud path.",
    "baseline_pass": "done_verified = get_bctc_full(VCB) AND get_bctc_full(CTG) return REAL VARIED rows raw-verified vs named-volume market.db; AND FPT 2026Q1 (145) + VCB 2025Q4 (112) remain non-regressed; AND a genuinely-unparseable PDF still lands enrich_failed not done.",
    "recurrence_class": "BCTC-VPS-PIPELINE-STALE (enrich-0-rows leg) — the scanned-PDF remainder after the silent-swallow + text-layout legs shipped.",
    "depends_on": "FIX-BCTC-ENRICH-SILENT-0ROWS (merged; this completes its check-a leg)",
    "source": "PO done_verified gate probe 2026-06-15 (FIX-BCTC-ENRICH-SILENT-0ROWS check-a FAIL)",
    "created_at": $now,
    "dispatch_note": "P0 — TRUE remaining root of the VCB/CTG user-facing P0. dev-pdf-extractor leads (OCR rasterization + low-text-density routing). PaddleOCR already in-image. Generic, no allowlist. done_verified = real VARIED rows for VCB AND CTG vs named-volume DB."
  }]
  end
)
|

.task_board._updated_at = $now
| .task_board._updated_by = "po"
