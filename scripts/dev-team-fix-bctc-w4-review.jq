# FIX-BCTC-BANK-SUMMARY-MAPPING — W4 dispatcher-verified GREEN -> review (awaits terminal qa AC-13).
# W4 (bctcScalarAggregator fixtures + total_liabilities exclusion fix, commit a46131cf) RAW-verified:
#   fence clean (2 files: bctcScalarAggregator.ts + FIX-BCTC-BANK-SUMMARY-MAPPING-W4.test.ts), secrets clean,
#   Claude-Session trailer present, source-coherent (reuses pre-existing findByLabelExcluding + P_BANK_EQUITY_EXCLUDE),
#   tests substantive (5 it + 2 it.each = 11 runtime cases, RED->GREEN regression proof for the 2nd in-scope defect).
# Head STAYS on W2 (active dev critical path). W3 serializes after W2 (same file refinedMarkdownParser.ts). W5 dep W2+W4.
# Usage: ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg ts "$ts" --arg w4note "<note>" -f scripts/dev-team-fix-bctc-w4-review.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ts) as $now
# --- W4: in_progress -> review (dispatcher RAW-verified GREEN; awaits terminal sprint qa AC-13) ---
| ([ .task_board.in_progress[] | select(.id=="TASK-W4-FIX-BCTC-BANK-SUMMARY-MAPPING-AGGREGATOR-FIXTURES") ]) as $w4moving
| .task_board.in_progress |= map(select(.id!="TASK-W4-FIX-BCTC-BANK-SUMMARY-MAPPING-AGGREGATOR-FIXTURES"))
| .task_board.review += ($w4moving | map(
    .status = "REVIEW"
    | .next_agent = "qa"
    | .reviewed_at = $now
    | .dev_commit = "a46131cf"
    | .dispatcher_verified = true
    | .review_note = $w4note
  ))
# --- head STAYS on W2 (critical path); refresh note only ---
| .head.updated_by = "dev-team"
| .head.updated_at = $now
| .head.note = "[dev-team 2026-07-01T19:10Z] W4-AGGREGATOR-FIXTURES RAW-verified GREEN -> review (dev a46131cf). Fence clean (bctcScalarAggregator.ts + W4 test only), secrets clean, trailer present. Found+fixed 2nd in-scope defect: total_liabilities combined-line exclusion (P_BANK_TOTAL_LIABILITIES_EXCLUDE + findByLabelExcluding, mirrors equity FU-6c) with RED->GREEN fixture. AC-9 synthetic-bank genericity + AC-8 FPT/VNM non-regression covered. Awaits terminal qa AC-13 (full compile+live on clean tree). WIP now=1 (W2 in-flight). W3 (detectSection, SAME FILE refinedMarkdownParser.ts) serializes AFTER W2 commits; W5 dep W2+W4. Locks held: SF-1, task:W1(review), task:W4(review), task:W2(in_progress)."
| ._updated_at = $now
| ._updated_by = "dev-team"
