# FIX-BCTC-BANK-SUMMARY-MAPPING — W2 dispatcher-verified GREEN -> review; dispatch W3 -> in_progress.
# W2 (bctcRowRepair.ts generic row-repair, commit 2cd9e105) RAW-verified: fence clean (3 files), secrets clean,
#   source RAW-read (generic/non-lossy: signature gate + same-ref passthrough + Roman longest-first ordering),
#   AC-5 count===20 + RISK-1 exact 21,355,164/35,225,543 pinned, no rebuild.
# W3 (detectSection section-boundary guard) edits refinedMarkdownParser.ts — SAME FILE as W2, now SAFE
#   (W2 committed; file-serialize satisfied). W5 (finalizeBctcRefineTool.ts + CTG re-ingest) serializes AFTER W3
#   so its re-ingest runs against the complete W2+W3+W4 fix set.
# Usage: ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg ts "$ts" --arg w2note "<note>" -f scripts/dev-team-fix-bctc-w2-review-w3-dispatch.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ts) as $now
# --- W2: in_progress -> review (dispatcher RAW-verified GREEN; awaits terminal sprint qa AC-13) ---
| ([ .task_board.in_progress[] | select(.id=="TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR") ]) as $w2moving
| .task_board.in_progress |= map(select(.id!="TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR"))
| .task_board.review += ($w2moving | map(
    .status = "REVIEW"
    | .next_agent = "qa"
    | .reviewed_at = $now
    | .dev_commit = "2cd9e105"
    | .dispatcher_verified = true
    | .review_note = $w2note
  ))
# --- W3: ready -> in_progress (dispatched, dev-mcp-server) ---
| ([ .task_board.ready[] | select(.id=="TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD") ]) as $w3moving
| .task_board.ready |= map(select(.id!="TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD"))
| .task_board.in_progress += ($w3moving | map(
    .status = "IN_PROGRESS"
    | .next_agent = "dev-mcp-server"
    | .dispatched_at = $now
    | .dispatched_by = "dev-team"
  ))
# --- head -> W3 active ---
| .head.status = "in_progress"
| .head.active_task_id = "TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD"
| .head.next_agent = "dev-mcp-server"
| .head.next_action = "dev-mcp-server implements W3 (section-boundary-contamination guard in detectSection, refinedMarkdownParser.ts — reuse FM-VCB-1 pattern; AC: eliminate section-boundary contamination rows OR confirm-clean with evidence like W4 did). File-serialize on refinedMarkdownParser.ts is SATISFIED (W2 committed 2cd9e105). NO container rebuild (unit-test-only). W5 (finalizeBctcRefineTool.ts validation_status + CTG re-ingest 96e36139) dispatches AFTER W3 commits, so re-ingest runs against complete W2+W3+W4 fix set. Terminal qa AC-13 (rebuild + live named-volume re-probe) after W5. W1/W2/W4 in review: dispatcher RAW-verified GREEN, await terminal qa."
| .head.updated_by = "dev-team"
| .head.updated_at = $now
| .head.note = "[dev-team 2026-07-01T19:20Z] W2-ROW-REPAIR RAW-verified GREEN -> review (dev 2cd9e105): bctcRowRepair.ts generic (no ticker/date/value hardcode — only in doc comment), non-lossy (signature gate code=null&&both-values-null, same-ref passthrough, empty-label bail, MIN_TOKEN_DIGITS=3), Roman longest-first ordering correct. AC-5 count===20 + RISK-1 exact 21,355,164/35,225,543. Fence clean (refinedMarkdownParser.ts+bctcRowRepair.ts+test), secrets clean, no rebuild. Wave-3: W3-SECTION-GUARD -> in_progress (same file as W2, now serialize-safe). W5 after W3 (re-ingest needs full fix set). qa watch-item: VN_NUMBER_TOKEN may mis-peel no-separator ints — non-triggering on dot-formatted CTG, AC-13 net. Locks held: SF-1, task:W1(review), task:W2(review), task:W4(review), task:W3(in_progress)."
| ._updated_at = $now
| ._updated_by = "dev-team"
