# po-s70 — three board mutations on docs/data/orch/orch-state.json (PO sole board-writer)
# Pointer: docs/policies/dev-standards.md § Script Persistence; flow docs/agents/po/flow/main.md
#
# MUTATION 1: FIX-BCTC-BANK-PDF-OCR-RASTERIZE  in_progress[] -> done_verified[]  (status=done_verified)
#             + unblock FIX-ERRAUDIT-W1-PEK-P0 (backlog) — remove blocked_by RASTERIZE, mark ready-for-grooming
# MUTATION 2: mint FIX-BCTC-BANK-SUMMARY-MAPPING (P1, value-accuracy follow-on) into backlog[]
#             + cross-link into BCTC-ANALYTICS-LAYER sprint task list (bank-serving cluster sibling)
# MUTATION 3: FIX-ERRAUDIT-W2-MCP-DATALAYER  in_progress[] -> review[]  (status=REVIEW, next_agent=qa)
#             + set .head to reflect it is in the GATE (next dev-team :07 must NOT re-dispatch dev-mcp-server)
#
# Invoke: jq -f scripts/po-s70-*.jq docs/data/orch/orch-state.json > /tmp/orch.tmp
# Args (-n not used; reads orch-state as input). Timestamp injected via --arg NOW.

# ---- pull the two in_progress objects we are moving ----
( .task_board.in_progress
  | map(select((.id // .task_id) == "FIX-BCTC-BANK-PDF-OCR-RASTERIZE"))
  | .[0] ) as $rast
|
( .task_board.in_progress
  | map(select((.id // .task_id) == "FIX-ERRAUDIT-W2-MCP-DATALAYER"))
  | .[0] ) as $datalayer
|

# ==== MUTATION 1: RASTERIZE -> done_verified ====
( $rast
  + { status: "done_verified",
      lane: "done_verified",
      next_agent: null,
      done_verified: "YES",
      done_verified_at: $NOW,
      done_verified_by: "po-s70",
      done_verified_note: "DoD MET for the scanned-bank-PDF OCR-rasterize extraction leg. qa APPROVED (21/21 tests in the deployed pdf-extractor container; 989654f2 enrich_failed fail-loud guard intact; generic low-text-density routing, no per-ticker allowlist). Router RAW-verified LIVE on named volume vn-market-intelligence-mcp_market_data: deployed ocr_worker.py byte-identical to main (734ab5d5); CTG 2026Q1 = 55 real varied plausible bank rows, VCB 2026Q1 = 55 real varied plausible bank rows; non-regression FPT 2026Q1=145 DONE, VCB 2025Q4=112 PARTIAL. Code on main 734ab5d5, container already rebuilt + LIVE, worktree removed. NOTE: this closes the RAW-EXTRACTION (bctc_table_rows) leg only — the downstream financial_reports SCALAR summary columns are garbage for bank tickers (CTG 2026Q1 net_margin_pct=229157%, total_assets=0, accounting-identity violated -> validation_status=low_confidence); that distinct value-accuracy defect is tracked separately as FIX-BCTC-BANK-SUMMARY-MAPPING (minted this turn under BCTC-ANALYTICS-LAYER), NOT a regression of this task."
    }
) as $rast_dv
|

# ==== MUTATION 3: DATALAYER -> review (next_agent=qa) ====
( $datalayer
  + { status: "REVIEW",
      lane: "review",
      next_agent: "qa",
      review_at: $NOW,
      review_by: "po-s70",
      merged_to_main: "9f4a8eef",
      review_note: "Code merged to main 9f4a8eef (router cherry-picked from worktree commit 1ba5c7f0). 31/31 unit tests pass; tsc clean (1 pre-existing unrelated error only). safeQuery/runSection/failLoud helpers + 9 FAIL-LOUD migrations (imfConvictionBridge / scanMarket getAvgVolumeSync+getThresholds / imfDataFetcher / assembleBriefing 7 catches / marketContextBuilder / vnstockBridge). Worktree removed, dispatch lock released. ops is rebuilding mcp-server NOW + qa LIVE-verify (FORCED-FAILURE DoD on named-volume market.db) is PENDING. NOT done_verified — awaits the rebuild + qa live-RAW gate. CODING IS DONE: do NOT re-dispatch dev-mcp-server on the next dev-team :07 tick."
    }
) as $datalayer_rev
|

# ==== MUTATION 2: mint FIX-BCTC-BANK-SUMMARY-MAPPING ====
{
  id: "FIX-BCTC-BANK-SUMMARY-MAPPING",
  type: "FIX",
  priority: "P1",
  status: "BACKLOG",
  epic: "BCTC-ANALYTICS-LAYER",
  sprint: "BCTC-ANALYTICS-LAYER",
  route_to: "dev-pdf-extractor",
  route: "po->ba->architect->pm->dev->qa",
  next_agent: "ba",
  zone: "apps/mcp-server/src/interface/mcp/tools/financial-reports/",
  mode: "code",
  size: "M",
  title: "BANK financial_reports SCALAR summary columns are garbage: B02-TCTD balance-sheet rows squeezed into income-statement scalar columns -> net_margin_pct=229157%, total_assets=0, accounting-identity violated (CTG 2026Q1) -> validation_status=low_confidence on every bank ticker",
  desc: "qa follow_on_required from FIX-BCTC-BANK-PDF-OCR-RASTERIZE done_verified gate. The RAW extraction layer (bctc_table_rows) is now CORRECT for banks (CTG/VCB 2026Q1 = 55 real varied plausible rows, raw-verified vs named-volume market.db) — this defect is PURELY the downstream scalar SUMMARIZER. RAW EVIDENCE (CTG 2026Q1): net_revenue=3910, ebitda=3.6e14, net_margin_pct=229157%, total_assets=0 while total_liabilities=24.7B -> 'Accounting identity violated — mismatch 100%' -> validation_status=low_confidence. The bank-aware B02-TCTD summary-mapping layer is squeezing bank balance-sheet rows into income-statement scalar columns (net_revenue / ebitda / net_margin_pct) and dropping total_assets. SCOPE = ALL bank tickers in the financial_reports scalar columns (B02-TCTD form), generically. This is a served-metric integrity defect (/goal#1 no-fake-data: a 229157% margin / total_assets=0 with non-zero liabilities is implausible-but-non-empty fabricated-shaped data). Cross-link: kin to the BAL-1b bank-B02-TCTD-serving cluster of BCTC-ANALYTICS-LAYER (BAL-1b fixed the SERVE gate; this fixes the SCALAR-MAPPING upstream of serve) and to memory project_bank_aware_bctc (B02-TCTD 1 SSOT across 7 consumers, Roman+no-3digit discriminator). NOT covered by FIX-BCTC-ENRICH-SILENT-0ROWS (that is 0-rows raw extraction) nor FIX-BCTC-BANK-PDF-OCR-RASTERIZE (OCR-rasterize leg, now done) nor the FIX-DE-* chain (interest-bearing-debt decomposition only).",
  generic_mandate: "GENERIC across ALL bank tickers / B02-TCTD forms — NO per-ticker allowlist, NO date-literal, NO special-case. Detect bank-form structurally (reuse the existing isBankFormFromRows / Roman+no-3digit B02-TCTD discriminator SSOT) and map bank balance-sheet rows into the correct scalar columns (or honestly NULL income-statement scalars that have no bank-form equivalent) — never squeeze balance-sheet rows into income-statement columns.",
  fail_loud_requirement: "A bank summary that violates the accounting identity (assets != liabilities + equity within tolerance) or yields an implausible margin band MUST surface as honest NULL / validation_status=low_confidence WITH the dimension dropped — NOT a fabricated 229157% / total_assets=0 served as a real reading. Verify LIVE on the NAMED-VOLUME market.db (vn-market-intelligence-mcp_market_data), NOT host ./data decoy. Rebuild container after code change. done_verified = qa-green LIVE RAW.",
  baseline_pass: "done_verified (/goal#1) = get_bctc_full(CTG) AND get_bctc_full(VCB) serve PLAUSIBLE bank scalar summaries RAW-verified vs named-volume market.db: total_assets > 0 and consistent with total_liabilities+equity (accounting identity holds within tolerance), net_margin_pct within a plausible bank band (NOT 229157%), ebitda not an absurd 1e14 magnitude; validation_status no longer low_confidence solely from the identity violation; AND a non-bank ticker (FPT/VNM) summary is NON-REGRESSED.",
  recurrence_class: "BCTC-ANALYTICS-LAYER bank-B02-TCTD cluster (scalar-summary-mapping leg) — kin BAL-1b bank-serving + project_bank_aware_bctc; also nonzero-values-need-plausibility-check class (implausible-but-non-empty served metric).",
  owner_decision: "BA + architect to confirm whether the bank summary-mapping lives in the dev-pdf-extractor scalar-summarizer (bctcScalarAggregator / B02-TCTD row->scalar mapping) or in the dev-mcp-server serve/finalize path; route to dev-pdf-extractor by default (scalar-mapping is upstream of serve), reassign to dev-mcp-server if the architect SPIKE pins the defect in the mcp-server mapping layer.",
  source: "qa follow_on_required @ FIX-BCTC-BANK-PDF-OCR-RASTERIZE done_verified gate (PO-s70 2026-06-16)",
  created_at: $NOW,
  created_by: "po-s70",
  cross_link: ["BCTC-ANALYTICS-LAYER", "BAL-1b-DEV", "FIX-BCTC-BANK-PDF-OCR-RASTERIZE", "project_bank_aware_bctc"],
  dispatch_note: "[PO-s70 \($NOW)] MINTED value-accuracy follow-on. RAW extraction leg (RASTERIZE) done_verified; this owns the bank SCALAR summary-mapping defect (income-statement columns garbage for banks). Searched board first — no existing BANK-AWARE/ENRICH-SILENT/BAL-* task owns this scalar-mapping scope; cross-linked into BCTC-ANALYTICS-LAYER as the scalar-summary leg of the bank-B02-TCTD cluster. Route po->ba->architect (SPIKE to pin module owner) ->pm->dev-pdf-extractor(or dev-mcp-server)->qa. Generic, no allowlist, done_verified = plausible bank scalars + accounting-identity holds vs named-volume DB."
} as $bank_summary
|

# ---- apply all three mutations + unblock W1-PEK-P0 + bump head + meta ----
.task_board.in_progress |= map(
  select(((.id // .task_id) != "FIX-BCTC-BANK-PDF-OCR-RASTERIZE")
      and ((.id // .task_id) != "FIX-ERRAUDIT-W2-MCP-DATALAYER"))
)
| .task_board.done_verified += [$rast_dv]
| .task_board.review += [$datalayer_rev]
| .task_board.backlog += [$bank_summary]
# unblock W1-PEK-P0 (RASTERIZE dep cleared)
| .task_board.backlog |= map(
    if (.id // .task_id) == "FIX-ERRAUDIT-W1-PEK-P0"
    then . + {
      status: "READY-FOR-GROOMING",
      next_agent: "ba",
      unblocked_at: $NOW,
      unblocked_by: "po-s70",
      unblock_note: "Dependency FIX-BCTC-BANK-PDF-OCR-RASTERIZE reached done_verified (po-s70). SAME-ZONE-SERIALIZED hold lifted: apps/pdf-extractor/ is no longer held by the active RASTERIZE lane. Now UNBLOCKED + ready for grooming/promotion to a free coding slot."
    }
    | del(.blocked_by) | del(.hold_reason)
    else . end
  )
# bump head to reflect DATALAYER is in the review/qa GATE (do NOT re-dispatch dev-mcp-server)
| .head = {
    status: "review",
    updated_at: $NOW,
    updated_by: "po-s70",
    active_task_id: "FIX-ERRAUDIT-W2-MCP-DATALAYER",
    next_agent: "qa",
    note: "FIX-ERRAUDIT-W2-MCP-DATALAYER promoted in_progress->review by po-s70. Code merged to main 9f4a8eef (31/31 tests, tsc clean); ops rebuilding mcp-server + qa LIVE-verify (FORCED-FAILURE DoD, named-volume market.db) PENDING. CODING IS DONE — next dev-team :07 tick MUST NOT re-dispatch dev-mcp-server; this task is in the qa GATE. Also this turn: FIX-BCTC-BANK-PDF-OCR-RASTERIZE -> done_verified (extraction leg DoD met, qa+router RAW-verified); FIX-ERRAUDIT-W1-PEK-P0 unblocked (RASTERIZE dep cleared); FIX-BCTC-BANK-SUMMARY-MAPPING minted (P1 bank scalar-summary value-accuracy follow-on, BCTC-ANALYTICS-LAYER)."
  }
| ._updated_at = $NOW
| ._updated_by = "po-s70"
| .updated_at = $NOW
| .updated_by = "po-s70"
| .task_board._updated_at = $NOW
| .task_board._updated_by = "po-s70"
