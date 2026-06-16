# po-s72-w1-pek-p0-promote.jq
# Single-task groom+promote: FIX-ERRAUDIT-W1-PEK-P0 backlog[] -> ready[].
#
# Preconditions (verified by PO before run):
#   - dependency FIX-BCTC-BANK-PDF-OCR-RASTERIZE reached done_verified (SAME-ZONE hold lifted)
#   - apps/pdf-extractor/ zone is FREE (no task in in_progress/ready with that zone)
#   - dev coding WIP 0/2 (only the cron-scheduler QA-observe gate occupies in_progress)
#   - row status READY-FOR-GROOMING, next_agent=ba
#
# Idempotent: skipped entirely if the id is already present in ANY board array
#   (backlog/ready/in_progress/review/done/done_verified). Re-run promotes 0.
#
# Conservation (harness-checked): backlog -1, ready +1, all other lanes unchanged,
#   total across the 6 lanes unchanged.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s72-w1-pek-p0-promote.jq docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH; PUSH held.)

def TID: "FIX-ERRAUDIT-W1-PEK-P0";

# is the id already in a NON-backlog lane? (then promotion already happened — no-op)
def already_promoted:
  [ (.task_board.ready, .task_board.in_progress, .task_board.review,
     .task_board.done, .task_board.done_verified)[]
    | select(type=="object") | .id ] | any(. == TID);

if already_promoted then .
else
  ( [ .task_board.backlog[] | select(type=="object" and .id == TID) ] | first ) as $row
  | if $row == null then .   # not in backlog either — nothing to do
    else
      .task_board.backlog |= map(select((type=="object" and .id == TID) | not))
      | .task_board.ready  |= ( . + [ $row
          + { status: "READY",
              lane: "ready",
              next_agent: "ba",
              groomed_at: $now,
              groomed_by: "po-s72",
              promoted_from: "backlog",
              promoted_at: $now,
              promoted_by: "po-s72",
              promotion_note: "Free coding slot (dev coding WIP 0/2 — only the ARCH-CRON-SCHEDULER-RELIABILITY QA-observe gate occupies in_progress; not a dev coding lane). Dependency FIX-BCTC-BANK-PDF-OCR-RASTERIZE reached done_verified (po-s70) — SAME-ZONE-SERIALIZED hold on apps/pdf-extractor/ lifted; zone confirmed FREE. W1 P0 PEK data-masking pair (pek_engine_adapter.py:668 layout-crash + :342/:717 PaddleOCR-load-fail served as clean 0-row pass) = BCTC-silent-0-rows class (/goal#1). FAIL-LOUD DoD: a crashed model NEVER served as a successful 0-row extraction -> re-raise OR tag extraction_status='degraded'/quarantined=True; ship the Python fail_loud_or_tag_degraded helper as by-product; generic across all sources. Route ba->architect->pm->dev(dev-pdf-extractor)->qa; router dispatches via lock-claim+spawn — po did NOT spawn. No-push." } ] )
    end
end
