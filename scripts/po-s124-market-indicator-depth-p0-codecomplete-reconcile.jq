# po-s124-market-indicator-depth-p0-codecomplete-reconcile.jq
# ---------------------------------------------------------------------------
# Sprint MARKET-INDICATOR-DEPTH-P0 — PO FINAL SIGN-OFF board reconcile.
# Single-pass, in-one-atomic-write, idempotent.
#
# Origin (2026-06-30, po-S3): QA gate PASS (all 7 APPROVED) but the live board
# did NOT match "all 7 DONE_VERIFIED" — P0-1/P0-4 sat in ready[] at status:READY
# (LIVE re-dispatch hazard) and the other 5 carried PREMATURE DONE_VERIFIED while
# misplaced across ready/in_progress/review (none in done_verified[]). The sprint
# success_metric binds done_verified to a LIVE-server RAW-verify which QA could
# NOT perform (stale images). Honest disposition = CODE-COMPLETE pending the
# mandated post-rebuild live probe (po-s100 precedent).
#
# EFFECTS:
#  M1 RELOCATE the 7 deliverables {P0-1,P0-2,P0-3,P0-4,OHLCV,P0-5,BREADTH}
#     out of ready[]/in_progress[]/review[] -> done[] as CODE-COMPLETE
#     (status:DONE, done_verified:false, qa_code_approved provenance preserved,
#      live_gate:WITHHELD_PENDING_LIVE_PROBE, po_signoff:APPROVED_CODE).
#  M2 RELOCATE BA-INDICATOR-DEPTH-P0 ready[] -> done[] as DONE_VERIFIED
#     (docs deliverable: spec delivered + consumed, no live gate).
#  M3 UMBRELLA active_sprints[MARKET-INDICATOR-DEPTH-P0]: keep status ACTIVE;
#     patch embedded tasks[] P0-1/P0-4 to CODE-COMPLETE; ADD .verification_gate
#     + .po_final_signoff (architecture ruling + deploy authorization + held live gate).
#
# IDEMPOTENT: relocation guarded by done[] membership; umbrella patch marker-guarded
#             on .po_final_signoff presence -> re-run mutates 0.
#
# USAGE:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s124-market-indicator-depth-p0-codecomplete-reconcile.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#   (harness adds conservation guard before the pipe — see po/flow/main.md § Reusable triage scripts)
# ---------------------------------------------------------------------------

def DELIVERABLES:
  ["P0-1-VOLATILITY-INDICATORS","P0-2-FOREIGN-ROOM-SUITE","P0-3-OMO-CURVE",
   "P0-4-MARKET-SENTIMENT-INDEX","OHLCV-BACKFILL-P0","P0-5-INSIDER-SENTIMENT",
   "BREADTH-TIME-SERIES"];

def is_deliverable: (.id // .task_id // "") as $i | (DELIVERABLES | index($i)) != null;
def is_ba:         (.id // .task_id // "") == "BA-INDICATOR-DEPTH-P0";

# code-complete patch: preserve QA's CODE approval as qa_code_* provenance,
# strip the premature done_verified_* stamp, hold the live gate.
def patch_codecomplete($now):
    .status = "DONE"
  | .done_verified = false
  | .qa_code_approved_at = (.done_verified_at // "2026-06-30T00:11:00Z")
  | .qa_code_approved_by = (.done_verified_by // "qa")
  | del(.done_verified_at) | del(.done_verified_by)
  | .live_gate = "WITHHELD_PENDING_LIVE_PROBE"
  | .live_gate_note = "QA verified code+unit only; sprint success_metric requires LIVE-server RAW-verify after ops rebuild (mcp-server+technical-analysis+macro-indicators). done_verified flips post-rebuild live e2e GREEN."
  | .po_signoff = "APPROVED_CODE"
  | .po_signoff_at = $now ;

def patch_ba_done($now):
    .status = "DONE_VERIFIED"
  | .done_verified = true
  | .done_verified_at = $now
  | .done_verified_by = "po"
  | .po_signoff = "APPROVED"
  | .po_signoff_at = $now ;

($now) as $now
# ---- gather the rows to relocate (snapshot BEFORE removal) ----
| ([ .task_board.ready[], .task_board.in_progress[], .task_board.review[] ]
   | map(select(is_deliverable))
   | map(patch_codecomplete($now))) as $deliv_moved
| ([ .task_board.ready[] ] | map(select(is_ba)) | map(patch_ba_done($now))) as $ba_moved
# ---- M1+M2: strip from source lanes, append to done[] (guard: skip if already in done) ----
| (.task_board.done | map(.id // .task_id // "")) as $done_ids
| .task_board.ready        |= map(select((is_deliverable or is_ba) | not))
| .task_board.in_progress  |= map(select(is_deliverable | not))
| .task_board.review       |= map(select(is_deliverable | not))
| .task_board.done += ([ $deliv_moved[], $ba_moved[] ]
                        | map(select(((.id // .task_id // "") as $i | $done_ids | index($i)) | not)))
# ---- M3: umbrella patch (idempotent on .po_final_signoff) ----
| (.task_board.active_sprints) |= map(
    if (.id == "MARKET-INDICATOR-DEPTH-P0")
    then
      .status = "ACTIVE"
      | (.tasks) |= ( (. // []) | map(if is_deliverable then patch_codecomplete($now) else . end) )
      | (if (.po_final_signoff | not) then
          .po_final_signoff = "APPROVED_CODE — done_verified HELD to post-rebuild LIVE e2e"
          | .po_final_signoff_at = $now
          | .verification_gate = {
              "qa_code_gate": "PASS — all 7 APPROVED (code+unit), QA session d3292ca4",
              "live_e2e_gate": "WITHHELD_PENDING_REBUILD",
              "rebuild_services": ["mcp-server","technical-analysis","macro-indicators"],
              "rebuild_mode": "single-service docker compose up -d --build <svc> — NEVER down&&up",
              "done_verified_condition": "post-rebuild router/qa RAW-verify LIVE: 5 tools return REAL non-stub values, omo_curve present, /ta/volatility-indicators 200, breadth persister fires, consumed by >=1 helper agent (sprint success_metric)",
              "architecture_ruling": "RATIFIED — breadth math in mcp-server breadthCalculator.ts is FINAL (TA-TS path stale; gateway-consumed regardless of host; no Go-TA port)",
              "deploy_authorized": true,
              "authorized_by": "po",
              "authorized_at": $now
            }
        else . end)
    else . end )
