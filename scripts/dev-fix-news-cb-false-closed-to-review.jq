# scripts/dev-fix-news-cb-false-closed-to-review.jq
#
# FIX-NEWS-CB-FALSE-CLOSED — in_progress[] -> review[] after implementation +
# tests GREEN + push. Flipped to REVIEW (not DONE_VERIFIED) because the fix
# lives in apps/mcp-server TypeScript source — it requires an image rebuild +
# container restart (ops-gated) to take live-serving effect. Code-level
# verification (RED->GREEN TDD, targeted 18-file regression sweep 295/0,
# tsc clean, live pre-fix get_system_status confirmation) is done; live
# post-rebuild re-check of get_system_status SOURCE HEALTH table is the
# pending gate before DONE_VERIFIED (qa/ops own the rebuild step).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-news-cb-false-closed-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.in_progress | map(select(.id == "FIX-NEWS-CB-FALSE-CLOSED"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    reviewed_at: $now,
    reviewed_by: "developer",
    review_note: "Root-caused 2 live SOURCE HEALTH bugs in apps/mcp-server (verified apps/news-fetch/ is an unwired parallel pipeline via api-gateway NEWS_URL proxy — not the owner). (A) intelligenceCycleJob.ts defaultPollNews() re-injected no-op reuters/tradingeconomics stub fetchers every 15-min scheduled tick; pollNews.ts health loop treats fulfilled-but-empty as a real failure for sources outside STUB_CAPABLE_KEYS, silently overwriting the Sprint-1833g/1898b recordDisabled() seed with an ever-climbing down count (79+, live-confirmed via get_system_status pre-fix). Fixed by removing both keys — restores pollNews.ts own documented resolvedFetchers contract. (B) formatSourceHealthTable 18-char Nguồn column truncated Trading Economics (17c) and Trading Economics News (22c) to the identical string (live byte-diff confirmed) — not a registry duplicate, a display collision. Widened 18->26, header/separator now derived from the same constant. New test apps/mcp-server/src/__tests__/FIX-NEWS-CB-FALSE-CLOSED.test.ts (RED confirmed pre-fix, GREEN post-fix, 3 tests). Targeted 18-file regression sweep covering every source-health/pollNews/intelligence-cycle test: 295 pass / 0 fail. tsc clean. Commits aa87cfe05 (fix) + b1425a0c6 (memory), pushed to main. Decision journal: docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-developer.md STEP developer-S3. REVIEW not DONE_VERIFIED: fix requires apps/mcp-server image rebuild (ops-gated) to take live-serving effect — qa/ops should rebuild + re-query get_system_status SOURCE HEALTH table to confirm Reuters RSS / Trading Economics show disabled (not climbing failures) and the duplicate row is gone, then flip DONE_VERIFIED."
  })
)
| .task_board.in_progress |= map(select(.id != "FIX-NEWS-CB-FALSE-CLOSED"))
| .task_board._updated_at = $now
| .task_board._updated_by = "developer (FIX-NEWS-CB-FALSE-CLOSED -> REVIEW)"
