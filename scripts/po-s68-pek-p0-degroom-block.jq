# po-s68-pek-p0-degroom-block.jq
# De-groom FIX-ERRAUDIT-W1-PEK-P0 from .task_board.ready[] -> .task_board.backlog[]
# (backlog is this board's blocked/held parking lane; lane semantics carried by .status).
# Flip status READY -> BLOCKED (entry already carries the correct blocked_by + hold_reason).
# WHY: PEK-P0 is same-pek-zone-blocked behind the running RASTERIZE coding lane
#      (FIX-BCTC-BANK-PDF-OCR-RASTERIZE, in_progress, dev-pdf-extractor, worktree-isolated).
#      Leaving it in ready[] risks a dev-team cron tick dispatching a 2nd lane on a
#      stale (pre-RASTERIZE-merge) base -> rework + merge hazard. Blocking = ground truth.
# CONSERVATION: ready -1, backlog +1, board total unchanged.
# DOES NOT TOUCH: .head, .task_board.head, FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE (stays READY),
#                 the running RASTERIZE in_progress lane, any other entry.
# Usage:
#   jq -f scripts/po-s68-pek-p0-degroom-block.jq docs/data/orch/orch-state.json > /tmp/orch.tmp \
#     && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#     && mv /tmp/orch.tmp docs/data/orch/orch-state.json

# Snapshot the target entry from ready[], stamped with BLOCKED status.
( .task_board.ready[] | select(.id == "FIX-ERRAUDIT-W1-PEK-P0") ) as $pek
| ( $pek + {
      status: "BLOCKED",
      blocked_by: "FIX-BCTC-BANK-PDF-OCR-RASTERIZE",
      degroomed_at: "2026-06-15T22:39:38Z",
      degroomed_by: "po-s68"
  } ) as $blocked
# Remove from ready[], append the BLOCKED snapshot to backlog[].
| .task_board.ready   |= map(select(.id != "FIX-ERRAUDIT-W1-PEK-P0"))
| .task_board.backlog += [ $blocked ]
# Stamp board-level provenance.
| .task_board._updated_at = "2026-06-15T22:39:38Z"
| .task_board._updated_by = "po-s68"
