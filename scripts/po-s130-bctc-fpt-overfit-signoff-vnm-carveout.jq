# po-s130 — sign off FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT (VCB+HPG+FPT GREEN) +
# carve out VNM column-separated layout + data-loss recovery + 2 guards, atomic.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s130-bctc-fpt-overfit-signoff-vnm-carveout.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Idempotent: FR/sprint relocate guarded by done_verified membership; mints id-guarded.

def has_id($id): any(.task_board[]?|.[]?|select(type=="object"); .id==$id);

(["330","331","332"]) as $frids
| "FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT" as $sp
| (.task_board.backlog | map(select(.id as $i | $frids | index($i)))) as $frrows
| (.task_board.in_progress | map(select(.id==$sp))) as $sprows
# M1: lift FR rows from backlog + sprint from in_progress
| .task_board.backlog |= map(select(.id as $i | ($frids | index($i)) | not))
| .task_board.in_progress |= map(select(.id != $sp))
| .task_board.done_verified += (
    ($frrows | map(. + {
      status:"DONE", done_verified:true,
      qa:"FR unit+zone+sandbox G12 GREEN (qa 2026-06-28, commit 5fe3b7a4)",
      qa_blocker_resolution:"VNM sprint-gate re-scoped OUT (column-separated layout = distinct root, FU-tracked). FR-6 itself GREEN.",
      closed_at:$now, closed_by:"po"
    } | del(.qa_blocker)))
    + ($sprows | map((. | del(.next_agent)) + {
      status:"DONE", done_verified:true,
      resolution:"FPT-overfit root FIXED; generalization QA-RAW-verified GREEN on VCB(bank,31f2a9a9 Stage4)+HPG(non-bank,918a7abd Stage4)+FPT(e71f845d Stage6 non-reg). 7 FRs shipped (commit 5fe3b7a4), sandbox G12 both tiers GREEN.",
      rescoped_out:{
        VNM:"0-row = column-separated OCR layout (distinct root, predates sprint, NOT a 7-FR regression); VNM served by refine path not /extract-tables -> SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT",
        data_loss:"VNM 94->0 rows (QA /extract-tables overwrote live) -> FIX-VNM-BCTC-ROWS-DATA-LOSS-RECOVER",
        process_guard:"FU-EXTRACT-VERIFY-SHADOW-NOT-LIVE",
        fr4_risk4:"FU-FR4-RISK4-30LINE-LIMIT"
      },
      signoff_at:$now, signoff_by:"po"
    }))
  )
# M2: data-recovery P1 -> ready
| (if has_id("FIX-VNM-BCTC-ROWS-DATA-LOSS-RECOVER") then . else
    .task_board.ready += [{
      id:"FIX-VNM-BCTC-ROWS-DATA-LOSS-RECOVER", type:"FIX", status:"READY", priority:"P1",
      zone:"apps/mcp-server/", next_agent:"dev-mcp-server",
      title:"Restore VNM 2025Q4 bctc_table_rows (94->0, QA /extract-tables overwrote live)",
      desc:"RECON-FIRST: count bctc_refined_units WHERE report_id=4316f6d1 AND window_status=DONE. /extract-tables (pushBctcTableHandler) writes bctc_table_rows ONLY, NOT bctc_refined_units -> refined truth likely survived. If rows present: re-run finalizeBctcRefineTool for 4316f6d1 -> re-inserts 94 rows (no re-extraction/backup). If refined_units ALSO gone: escalate (no DB-backup script in scripts/ or launchd).",
      verification_gate:"VNM 4316f6d1 bctc_table_rows restored to 94 rows (BS46+IS22+CF26).",
      origin:"data-loss-incident TASK_332 QA 2026-06-28", created_at:$now, created_by:"po"
    }] end)
# M3: column-separated recon SPIKE -> backlog
| (if has_id("SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT") then . else
    .task_board.backlog += [{
      id:"SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT", type:"SPIKE", mode:"spike", status:"BACKLOG", priority:"P2",
      zone:"apps/pdf-extractor/", next_agent:"ba", timebox:120,
      title:"Recon: column-separated OCR layout extraction (VNM + similar)",
      question:"Which issuers depend on row-based /extract-tables AND have column-separated OCR (0 rows from Layouts 1-7) with NO working refine path? Build a new column-separated parser ONLY if recon proves a genuine gap (affected issuers may already route through refine_bctc_md->finalizeBctcRefine).",
      related:["FU-FR4-RISK4-30LINE-LIMIT"],
      origin:"VNM carve-out from FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT", created_at:$now, created_by:"po"
    }] end)
# M4: shadow-verify durable guard -> backlog
| (if has_id("FU-EXTRACT-VERIFY-SHADOW-NOT-LIVE") then . else
    .task_board.backlog += [{
      id:"FU-EXTRACT-VERIFY-SHADOW-NOT-LIVE", type:"FIX", status:"BACKLOG", priority:"P2",
      zone:"apps/mcp-server/", next_agent:"architect",
      title:"Guard: extraction verification must not overwrite live bctc_table_rows",
      desc:"Recurrence of negative-path-test-corrupts-live-SSOT: QA /extract-tables verification destroyed VNM production rows (94->0). Design: verification targets a shadow report_id / refuse to overwrite non-empty live bctc_table_rows without explicit flag.",
      origin:"data-loss-incident TASK_332 QA 2026-06-28", created_at:$now, created_by:"po"
    }] end)
# M5: FR-4 RISK-4 30-line FU -> backlog
| (if has_id("FU-FR4-RISK4-30LINE-LIMIT") then . else
    .task_board.backlog += [{
      id:"FU-FR4-RISK4-30LINE-LIMIT", type:"FIX", status:"BACKLOG", priority:"P3",
      zone:"apps/pdf-extractor/", next_agent:"dev-pdf-extractor",
      title:"FR-4 _detect_section_start: limit scan to first 30 lines (architect RISK-4)",
      desc:"QA non-blocking finding: _detect_section_start scans full page; RISK-4 mitigation (first 30 lines) not implemented -> VNM page-4 mis-excluded. Zero impact on VCB/HPG/FPT but latent.",
      related:["SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT"], created_at:$now, created_by:"po"
    }] end)
# head -> dev-mcp-server (urgent data recovery)
| .head = {
    status:"in_progress", active_task_id:"FIX-VNM-BCTC-ROWS-DATA-LOSS-RECOVER", next_agent:"dev-mcp-server",
    next_action:"Dispatch dev-mcp-server: RECON-FIRST recover VNM 2025Q4 bctc_table_rows (94->0 from QA /extract-tables overwrite). Check bctc_refined_units report_id=4316f6d1 survived -> re-run finalizeBctcRefineTool. Sprint FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT SIGNED OFF (VCB+HPG+FPT GREEN); VNM carved to SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT. See docs/handoffs/TASK_332.md [PO] Ruling.",
    updated_by:"po", updated_at:$now
  }
| .task_board.last_triaged_at=$now | .task_board.last_triaged_by="po"
