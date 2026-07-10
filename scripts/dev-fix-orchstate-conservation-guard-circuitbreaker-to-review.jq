# scripts/dev-fix-orchstate-conservation-guard-circuitbreaker-to-review.jq
#
# FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER — in_progress[] -> review[]
# after implementation + tests GREEN. Flipped to REVIEW (not DONE_VERIFIED —
# developer never self-flips per DJ-GATE-1 / task instructions); next_agent
# stays router (this was a router-adjudicated DIRECT dispatch, not a
# BOUNDED-1/qa pickup — router said it will RAW-verify + commit itself).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-orchstate-conservation-guard-circuitbreaker-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.in_progress | map(select(.id == "FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    next_agent: "router",
    reviewed_at: $now,
    reviewed_by: "dev-mcp-server",
    review_note: "New scripts/orch-conservation-check.mjs (bun, magnitude-bounded whole-board task_total/signal_total ratio guard per brief SS4.1 formula — 6 flat lanes backlog/ready/in_progress/review/done/done_verified + active_sprints[].tasks[]/closed_sprints[].tasks[]; FLOOR_RATIO=0.5, MIN_BASELINE=10, ORCH_APPLY_ALLOW_SHRINK bypass). Wired as Stage 2 in scripts/orch-apply.sh (after schema validation, before CAS-mtime rename) AND scripts/agents-flow/orch-state-hook-prewrite.mjs (PreToolUse parity, same fail-open-on-infra-missing contract as the existing validator check). Bypass wired ONLY into scripts/orch-cold-evict.sh (ORCH_APPLY_ALLOW_SHRINK=orch-cold-evict.sh:scheduled-eviction on its internal orch-apply.sh call) and docs/agents/pm/flow/task-archive.md Sprint Eviction step (ORCH_APPLY_ALLOW_SHRINK=pm/task-archive.md:sprint-eviction) -- the 2 legitimate bulk-eviction writers per brief SS4.2/SS4.3. Audited scripts/orch-backlog-stub.sh per the brief: confirmed it only strips fields (task_board.backlog length unchanged), no bypass needed there. Extended (not forked) the EXISTING scripts/test/orch-apply-wrapper-tests.sh with COLLAPSE/APPEND-HAPPY/SHRINK-ALLOWED per verification_gate -- 320-backlog/340-done_verified/100-signal-row populated fixture; COLLAPSE proven RED before the fix (git-reverted orch-apply.sh, reran the SAME extended harness: exit 0, fixture destroyed) and GREEN after (git-restored the fix: exit 1, fixture byte-unchanged) -- both runs shown, not just asserted. Full harness 31/31 PASS. Also extended the pre-existing scripts/agents-flow/orch-state-hook.test.mjs (2 tests needed ORCH_HOOK_CONSERVATION_CHECK=/nonexistent isolation since they use minimal synthetic Write-tool content compared against the REAL production live file's much larger totals -- the hook always reads the real on-disk file for its baseline, same as its pre-existing Edit-path behavior; correctly blocking those synthetic payloads IS the guard doing its job, not a bug -- plus 1 new fail-open parity test). 19/19 PASS. Live-confirmed in production: this row's own backlog->in_progress move (task_total live=538 candidate=538) passed the guard with zero friction, proving normal lane moves net to zero as designed. INCIDENT + RECOVERY during host-side verification (surfaced for the record, not hidden): a manual smoke test of scripts/orch-cold-evict.sh against a throwaway ORCH_STATE-overridden fixture briefly overwrote the REAL docs/data/orch/orch-state.json (orch-apply.sh has its OWN ORCH_APPLY_LIVE_FILE_OVERRIDE variable, independent of orch-cold-evict.sh/orch-backlog-stub.sh's ORCH_STATE variable -- the internal orch-apply.sh call was not propagating it, a pre-existing latent gap, not something this task introduced) -- immediately caught (task_total mismatch vs the just-run --dry-run preview) and recovered via git checkout to the last commit (10a9a934d) within the same tool call; verified byte-identical hash before/after a corrected re-run. Fixed the root cause as an in-scope safety hardening: both orch-cold-evict.sh and orch-backlog-stub.sh's internal orch-apply.sh calls now explicitly propagate ORCH_APPLY_LIVE_FILE_OVERRIDE=\"${ORCH_STATE}\" (no-op in production, since both already default to the identical canonical path) -- re-verified end-to-end against a throwaway fixture with real-file-hash-unchanged proof. Zero apps/mcp-server/src changes (verified), zero container rebuild. tsc N/A (no .ts touched). CANONICAL pointers added to docs/policies/dev-standards.md for orch-conservation-check.mjs + the ORCH_STATE-propagation note on both eviction scripts."
  })
)
| .task_board.in_progress |= map(select(.id != "FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER"))
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-mcp-server (FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER -> REVIEW)"
| .head = {
    status: "review",
    active_task_id: "FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER",
    next_agent: "router",
    next_action: "FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER at REVIEW -- router: RAW-verify (re-run scripts/test/orch-apply-wrapper-tests.sh + bun test scripts/agents-flow/orch-state-hook.test.mjs) then commit explicit paths (NOT the notebook-only staging pattern -- this task has real code changes: scripts/orch-apply.sh, scripts/orch-conservation-check.mjs (new), scripts/agents-flow/orch-state-hook-prewrite.mjs, scripts/agents-flow/orch-state-hook.test.mjs, scripts/orch-cold-evict.sh, scripts/orch-backlog-stub.sh, scripts/test/orch-apply-wrapper-tests.sh, docs/agents/pm/flow/task-archive.md, docs/policies/dev-standards.md, docs/agent-memory/notebooks/dev-mcp-server.md, plus the 2 board-move .jq scripts and orch-state.json itself) then flip DONE_VERIFIED. No rebuild/deploy needed (host-side bash/bun scripts + docs only).",
    updated_at: $now,
    updated_by: "dev-mcp-server"
  }
