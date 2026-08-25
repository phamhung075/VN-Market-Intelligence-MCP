# scripts/dev-pdf-extractor-orientation-to-review-20260825.jq
#
# Board transform for FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN.
# Written by dev-pdf-extractor; the ROUTER lands it (dev agents never write orch-state.json):
#
#   jq -f scripts/dev-pdf-extractor-orientation-to-review-20260825.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Does three things:
#   1. moves the row ready[] -> review[] with status/next_agent/dispatch_lane/owner = qa
#   2. CORRECTS the stale "2 GiB" figure in AC-5 to the live cgroup value (2.5 GiB)
#   3. appends the dev-complete evidence to status_note
#
# Validated against the live board before commit: ready 110 -> 109, review 29 -> 30.

(.task_board.ready | map(select(.id == "FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN"))[0]) as $row
| .task_board.ready |= map(select(.id != "FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN"))
| .task_board.review += [
    $row
    + {
        status: "REVIEW",
        next_agent: "qa",
        dispatch_lane: "qa",
        owner: "qa",
        updated_at: "2026-08-25T20:45:00Z",
        ac: ($row.ac | sub("The pdf-extractor cap is 2 GiB";
                           "The pdf-extractor cap is 2,684,354,560 B = 2560 MiB = 2.5 GiB (CORRECTED 2026-08-25 by dev-pdf-extractor from the live /sys/fs/cgroup/memory.max; the earlier 2 GiB figure was stale and any % computed against it used a dead denominator)")),
        status_note: ($row.status_note + " | DEV COMPLETE 2026-08-25T20:40Z (dev-pdf-extractor), commit 905e32be1. AC-1/AC-2/AC-3/AC-4/AC-5 MET, AC-6 PARTIAL-BY-STRUCTURE. Mechanism: one Tesseract OSD probe per PAGE via ocr_gateway mode=osd + numpy.rot90 on the rasterized pixels UPSTREAM of backend dispatch; use_angle_cls stays False deliberately (per-text-LINE CNN = the OOM shape, and inert anyway since select_ocr_backend defaults to tesseract-vie with OCR_TEXT_BACKEND unset). | AC-2 NOTE: each text site has TWO sub-paths and both are fixed — a rotated page returns 672-3008 chars of mojibake, far above LOW_TESSERACT_PAGE_CHARS=30, so the PaddleOCR rasterize fallback NEVER fires and a constructor-only fix would have been inert on the read that actually produces page text. page_rasterizer.py also corrected (in-zone producer of the PNG get_bctc_page_image serves the refiner). | AC-4 evidence is a TEXT DIFF, not a confidence number: pages 13,14,15,16,41 (and 58,59) OCR byte-identical, measured by OCR-ing twice (raw raster vs correct_orientation output), and 0 false positives across 89 pages of 2 reports. | AC-5 CORRECTED ABOVE: cap is 2.5 GiB not 2 GiB. Cost, cgroup not ru_maxrss: all-upright arm +1.35 s/page worst case; MIXED arm -1.76 s/page (net faster — Tesseract is slower on a sideways page than a corrected one); memory.peak delta 0.0 MiB, memory.events max=0 oom_kill=0, window peak 360->363 MiB. | AC-6 SPLIT: page-image leg WIRED (rasterize_page force=True + POST /rasterize {force:true}), verified end-to-end. Text leg NOT wired and STRUCTURALLY CANNOT BE from this zone — pdf_extracted_text is written by apps/mcp-server/.../pdfOcrWorker.ts::ocrOnePage (pdftoppm | tesseract -l vie+eng, NO --psm, NO orientation detection), a FOURTH construction site the row did not know about; pdf-extractor opens market.db mode=ro by design (FU-1). bctc_layout_units has ZERO rows for report 1f53ef33, so 100% of that report's refine input came from that mcp-server read. Escalated: docs/signals/pdfx-orientation-fourth-ocr-site-mcpserver-2026-08-25T203747Z.json. | NOT DEPLOYED: /app is baked into the image; all container verification ran from a /tmp/pdfxfix overlay, live /app untouched. IMAGE REBUILD REQUIRED (ops). | Full record: docs/agent-memory/decisions/dev-pdf-extractor-orientation-20260825T2030Z.md")
      }
  ]
