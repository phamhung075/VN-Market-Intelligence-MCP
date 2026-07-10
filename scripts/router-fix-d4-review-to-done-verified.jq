# Board flip: D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND REVIEW -> DONE_VERIFIED
#
# Router independently RAW-verified beyond developer's own report (mirrors the
# FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER precedent earlier this tick):
# - Read full diffs of all 3 commits (f336ddaca feat, 0597f0f6a board move,
#   ac8deb8f1 notebook+journal) — content matches the self-report exactly.
# - Ran scripts/test/orch-cold-evict-tests.sh myself: 27/27 PASS (all 6 required
#   cases: evict-correctness, non-terminal-skip, --exclude-ids both forms,
#   idempotent re-run, conservation-guard-still-fires paired control, dry-run
#   zero-mutation), including every "REAL live orch-state.json UNCHANGED"
#   assertion holding.
# - Ran scripts/test/orch-apply-wrapper-tests.sh myself: 31/31 PASS — no
#   regression to the pre-existing wrapper.
# - Confirmed docs/policies/dev-standards.md CANONICAL block + docs/WORK.md
#   one-liner both updated accurately.
# - Notebook write this time landed CORRECTLY (docs/agent-memory/notebooks/
#   developer.md, 37L, well under the 200L autoprune trigger — the oldest
#   session was manually trimmed by the agent itself, not hook-triggered
#   corruption; content verified present via git show ac8deb8f1). Decision
#   journal docs/agent-memory/decisions/sprint-BACKLOG-HYGIENE-VERIFY-PRUNE-
#   SWEEP-developer.md exists on disk, 3 STEP entries, content matches.
# - git status confirms zero residual dirty files in D4's scope.
# - Did NOT execute against live orch-state.json (correctly deferred to D1,
#   confirmed by developer's own scope discipline note).
#
# GUARD: refuse unless the row is in review[] with status REVIEW.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-fix-d4-review-to-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND")][0]) as $t
| if $t == null then error("D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND status != REVIEW (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    updated_at: $now,
    updated_by: "router",
    commit: "f336ddaca,0597f0f6a,ac8deb8f1",
    router_verdict: "APPROVED",
    router_verified_at: $now,
    router_verified_by: "router",
    router_note: "APPROVED. Independent RAW-verify: read all 3 commit diffs in full, content matches self-report exactly. Ran scripts/test/orch-cold-evict-tests.sh myself: 27/27 PASS. Ran scripts/test/orch-apply-wrapper-tests.sh myself: 31/31 PASS, no regression. Confirmed docs/policies/dev-standards.md + docs/WORK.md updated accurately. Notebook write landed correctly this time (developer.md 37L, well under 200L autoprune trigger — oldest session manually trimmed by agent, not hook corruption). Decision journal file present and accurate. git status clean in scope. Correctly did not touch live orch-state.json (deferred to D1)."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND")]
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
