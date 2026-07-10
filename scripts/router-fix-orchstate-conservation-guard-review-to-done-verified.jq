# Board flip: FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER REVIEW -> DONE_VERIFIED
#
# Router independently RAW-verified (not payload-trust) beyond dev-mcp-server's own
# report:
# - HEAD unchanged at time of report (10a9a934d) — no premature commit.
# - Per-lane counts vs the last committed baseline: backlog 387->386, review 21->22,
#   every other lane (ready/in_progress/done/done_verified/active+closed sprint tasks)
#   byte-identical — exactly the single row's backlog->review move, confirming the
#   disclosed incident+recovery left ZERO residual data loss. signal_queue.rows id-set
#   diff against baseline: empty (identical set).
# - Read scripts/orch-conservation-check.mjs in full — implementation matches the
#   architecture brief's §4.1 formula exactly (whole-board task_total across 6 flat
#   lanes + active/closed sprint tasks, signal_total = signal_queue.rows.length,
#   FLOOR_RATIO=0.5, MIN_BASELINE=10, ORCH_APPLY_ALLOW_SHRINK narrow bypass).
# - Read the orch-apply.sh diff — new Stage 2 gate correctly placed after schema
#   validation, before the CAS-mtime rename; read the orch-state-hook-prewrite.mjs
#   diff — PreToolUse parity with the same fail-open-on-infra-missing contract as the
#   existing validator check.
# - Read the orch-cold-evict.sh diff — bypass + the ORCH_APPLY_LIVE_FILE_OVERRIDE
#   propagation fix (the incident's actual root cause) both correctly scoped, no-op in
#   production.
# - Ran scripts/test/orch-apply-wrapper-tests.sh myself: 31/31 PASS, all "REAL live
#   file UNCHANGED" assertions held.
# - Independently reproduced RED-before: genuinely swapped orch-apply.sh for the
#   git-committed pre-fix version (git show 10a9a934d:scripts/orch-apply.sh — 0
#   "conservation" references, confirmed), reran the SAME extended harness ->
#   COLLAPSE failed as expected (expected exit 1, got 0; fixture CHANGED), 28/31 —
#   NOT just re-trusting dev-mcp-server's own claimed before/after, an independent
#   from-scratch repro (dev-mcp-server's earlier stash-based attempt in-session had
#   silently no-op'd once already this task — this repro used a direct file-swap
#   instead of git stash to avoid that class of failure). Restored the fix, reran:
#   31/31 GREEN again.
# - Ran bun test scripts/agents-flow/orch-state-hook.test.mjs myself: 19/19 PASS.
# - Confirmed zero apps/mcp-server/src changes via git status.
# - Notebook (docs/agent-memory/notebooks/dev-mcp-server.md) and DJ-GATE-1
#   (sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md) entries present, task-id-stamped,
#   content matches the verified facts above.
#
# GUARD: refuse unless FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER is in
# review[] with status REVIEW.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-fix-orchstate-conservation-guard-review-to-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER")][0]) as $t
| if $t == null then error("FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER status != REVIEW (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    updated_at: $now,
    updated_by: "router",
    commit: "pending",
    router_verdict: "APPROVED",
    router_verified_at: $now,
    router_verified_by: "router",
    router_note: "APPROVED. Independent RAW-verify beyond dev-mcp-server's own report: per-lane count reconciliation against last committed baseline (10a9a934d) proves the disclosed incident+recovery left zero residual data loss (backlog 387->386, review 21->22 = exactly this one row moving, every other lane + signal_queue.rows id-set byte-identical). Read orch-conservation-check.mjs + all 3 diffs (orch-apply.sh, orch-state-hook-prewrite.mjs, orch-cold-evict.sh) in full — matches the architecture brief design exactly, fail-open policy consistent with the existing validator pattern. Ran scripts/test/orch-apply-wrapper-tests.sh myself: 31/31 PASS. Independently reproduced RED-before by genuinely swapping in the git-committed pre-fix orch-apply.sh (confirmed 0 conservation references) and rerunning the same extended harness: COLLAPSE failed exactly as expected (28/31) — restored, 31/31 GREEN again. Ran bun test scripts/agents-flow/orch-state-hook.test.mjs myself: 19/19 PASS. Confirmed zero apps/mcp-server/src changes. Notebook + DJ-GATE-1 present and accurate."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "router"
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "router",
    active_task_id: null,
    next_agent: null
  }
