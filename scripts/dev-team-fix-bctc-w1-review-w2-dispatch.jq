# FIX-BCTC-BANK-SUMMARY-MAPPING — W1 dispatcher-verified GREEN -> review; dispatch W2 -> in_progress.
# W1 (identity-serve-guard, commit 098d7c23) RAW-verified live: CTG blocked on all 3 serve tools, VCB serves.
# W2 (refinedMarkdownParser.ts row-repair) is file-disjoint from in-flight W4 (bctcScalarAggregator.ts) -> safe concurrent (WIP=2).
# W3 (detectSection, SAME FILE as W2) serializes in a later wave. W5 depends W2+W4.
# Usage: ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg ts "$ts" --arg w1note "<note>" -f scripts/dev-team-fix-bctc-w1-review-w2-dispatch.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ts) as $now
# --- W1: in_progress -> review (dispatcher RAW-verified GREEN; awaits terminal sprint qa AC-13) ---
| ([ .task_board.in_progress[] | select(.id=="TASK-W1-FIX-BCTC-BANK-SUMMARY-MAPPING-GUARD") ]) as $w1moving
| .task_board.in_progress |= map(select(.id!="TASK-W1-FIX-BCTC-BANK-SUMMARY-MAPPING-GUARD"))
| .task_board.review += ($w1moving | map(
    .status = "REVIEW"
    | .next_agent = "qa"
    | .reviewed_at = $now
    | .dev_commit = "098d7c23"
    | .dispatcher_verified = true
    | .review_note = $w1note
  ))
# --- W2: ready -> in_progress (dispatched, dev-mcp-server) ---
| ([ .task_board.ready[] | select(.id=="TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR") ]) as $w2moving
| .task_board.ready |= map(select(.id!="TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR"))
| .task_board.in_progress += ($w2moving | map(
    .status = "IN_PROGRESS"
    | .next_agent = "dev-mcp-server"
    | .dispatched_at = $now
    | .dispatched_by = "dev-team"
  ))
# --- head -> W2 active ---
| .head.status = "in_progress"
| .head.active_task_id = "TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR"
| .head.next_agent = "dev-mcp-server"
| .head.next_action = "dev-mcp-server implements W2 (generic ROMAN_SECTION-anchored markdown row-repair in refinedMarkdownParser.ts or new sibling bctcRowRepair.ts — AC-5 recover ~20 corrupted-but-present CTG rows; RISK-1 spot-check vs CTG row 55 Tiền gửi tại NHNN 21,355,164/35,225,543). NO container rebuild (avoid race with in-flight W4 rebuild) — verify via targeted bun test only. W3 (detectSection, SAME FILE) serializes after W2. W5 after W2+W4. W1-GUARD in review: dispatcher RAW-verified GREEN, awaits terminal qa AC-13."
| .head.updated_by = "dev-team"
| .head.updated_at = $now
| .head.note = "[dev-team 2026-07-01T19:00Z] W1-GUARD RAW-verified GREEN -> review (dev 098d7c23; live: CTG [CORRUPT-SKIP] on all 3 serve tools get_financial_summary/get_bctc_full/compare_financials, VCB serves normally). Wave-2: W2-ROW-REPAIR -> in_progress, file-disjoint with in-flight W4-AGGREGATOR (refinedMarkdownParser.ts vs bctcScalarAggregator.ts). W2 unit-test-only (no rebuild, avoid race w/ W4 verify phase). W3 serializes after W2 (same file). W5 after W2+W4. Locks held: SF-1, task:W1, task:W4, task:W2."
| ._updated_at = $now
| ._updated_by = "dev-team"
