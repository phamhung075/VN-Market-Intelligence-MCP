# po PLAN-ONLY -> IMPLEMENT handoff mint — FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER -> backlog[].
#
# Source: architect PLAN-ONLY brief docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md
#         (committed 5b676355e), which re-verified the parent recurring-bug ticket
#         FIX-AUDITOR-ORCHSTATE-FULLDOC-OVERWRITE-CLOBBERS-SSOT and concluded: routing half already
#         shipped 2026-06-27 (SSOT-W1-ORCH-APPLY-WRAPPER, 86286d265) but the CONTENT-SAFETY half
#         (conservation/magnitude check) was NEVER implemented and is EMPIRICALLY LIVE-EXPLOITABLE
#         TODAY (2026-07-10) — architect + router each independently reproduced a scaffold-collapse
#         (backlog 320->0, signal_rows 100->1, exit 0, "OK — candidate applied") through the CURRENT
#         production scripts/orch-apply.sh. Interim "Telegram-only" mitigation LAPSED (138 continuous
#         system-auditor signal_queue writes through 2026-07-08).
#
# PO board mechanic (PLAN-ONLY -> IMPLEMENT handoff):
#   - Parent ticket is DONE in done[] (PLAN-ONLY complete). It is NOT re-openable as an
#     implementation ticket. This mints a NEW, distinct implementation task_id — the same pattern used
#     by scripts/po-mint-fix-cowork-flows-gateway-blind-bridge-fallback.jq (PO mints a fresh backlog
#     row off a PLAN-ONLY escalation). Contrast the SIBLING FIX-TASKLOCK-OWNER-SESSION ticket, which
#     PO closed as SUPERSEDED with NO new task because the architect found the fix already live — here
#     the architect found code IS required, so a new implementation task_id is minted.
#   - supervised:true (board-inline) — routes this to the ROUTER-ADJUDICATED dispatch lane, NOT the
#     BOUNDED-1 auto-pickup FIFO. Rationale: (a) the router explicitly asked for prompt pickup and
#     flagged that a plain-backlog P1 may not surface fast relative to other P1s / behind P0s in
#     BOUNDED-1's priority_rank+array-index FIFO drain of a 386-row backlog; supervised:true takes it
#     OUT of "plain backlog[]". (b) it structurally protects against the documented BOUNDED-1
#     NON-CODE/DESIGN-row mis-dispatch hazard (dev-team/flow/main.md ~L521): a multi/cross-service row
#     with next_agent:dev-mcp-server, if left BOUNDED-1-eligible, would be auto-claimed and routed via
#     zone-detect's Tier-3 fallback to a GENERIC "developer" — the architect explicitly wants
#     dev-mcp-server (the zone that authored SSOT-W1-ORCH-APPLY-WRAPPER), not generic developer, and
#     not architect-split. (c) unlike placing the row directly in ready[], supervised:true does NOT
#     wedge BOUNDED-1 (which no-ops at WIP>=1) — the auto lane keeps draining other unsupervised rows
#     while the router dispatches this one directly under its WIP<=2 supervised budget.
#   - next_agent/owner:dev-mcp-server — per architect brief SS7: every touched file is a host-side
#     bash/bun repo script; zero apps/mcp-server/src TypeScript changes, zero container rebuild, NOT ops.
#   - zone:cross-service/ — accurate (all files are host-side repo scripts). The explicit
#     supervised:true + next_agent override zone-detect's generic-developer default for this label.
#   - Does NOT touch .head (left idle from the architect's Step-6 close). Additive backlog append only.
#
# Invoke (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   jq -f scripts/po-mint-fix-orchstate-conservation-guard-circuit-breaker.jq --arg now "<ISO8601Z>" \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/po/flow/sprint-kickoff.md (PLAN-ONLY -> IMPLEMENT handoff mint pattern);
#          docs/agent-memory/notebooks/po.md (decision record 2026-07-10).

"FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER" as $id
| if ([.task_board.backlog, .task_board.ready, .task_board.in_progress, .task_board.review, .task_board.qa, .task_board.done, .task_board.done_verified] | map(.[]?) | any((.id // .task_id) == $id))
  then error("id already exists on the board: " + $id) else . end
| .task_board.backlog = ((.task_board.backlog // []) + [{
    id: $id,
    title: "Implement magnitude-bounded conservation circuit-breaker as a new Stage-2 gate in scripts/orch-apply.sh (whole-board task_total + signal_total must retain >=50% of live value) + new shared scripts/orch-conservation-check.mjs + PreToolUse hook parity + extend the existing scripts/test/orch-apply-wrapper-tests.sh harness — closes the content-safety half of FIX-AUDITOR-ORCHSTATE-FULLDOC-OVERWRITE-CLOBBERS-SSOT that was never implemented and is empirically live-exploitable today",
    type: "FIX",
    priority: "P1",
    status: "TODO",
    zone: "cross-service/",
    size: "M",
    supervised: true,
    owner: "dev-mcp-server",
    next_agent: "dev-mcp-server",
    recurring_bug_escalation: true,
    parent_task: "FIX-AUDITOR-ORCHSTATE-FULLDOC-OVERWRITE-CLOBBERS-SSOT",
    architecture_brief: "docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md",
    created_at: $now,
    promoted_at: $now,
    promoted_by: "po (PLAN-ONLY->IMPLEMENT handoff, recurring_bug_escalation)",
    files: [
      "scripts/orch-apply.sh",
      "scripts/orch-conservation-check.mjs",
      "scripts/agents-flow/orch-state-hook-prewrite.mjs",
      "scripts/test/orch-apply-wrapper-tests.sh"
    ],
    verification_gate: "Extend the EXISTING scripts/test/orch-apply-wrapper-tests.sh (same ORCH_APPLY_LIVE_FILE_OVERRIDE + real-file-hash-unchanged safety pattern — do NOT create a parallel test file) with 3 cases per brief SS8: (1) COLLAPSE — populated fixture (>=312 backlog, >=97 signal rows) + de595a44-shaped scaffold candidate -> assert exit 1, fixture byte-unchanged (CONFIRMED RED today: currently exit 0, fixture destroyed; must go GREEN after fix); (2) APPEND-HAPPY — same fixture + 1 legit appended signal row -> assert exit 0, rows==pre+1, backlog unchanged (regression guard against over-blocking the auditor's real write); (3) SHRINK-ALLOWED — same fixture + done_verified[] emptied + ORCH_APPLY_ALLOW_SHRINK=cold-evict-test -> assert exit 0 (proves cold-evict.sh/task-archive.md bypass honored).",
    design_summary: "Brief SS4: new Stage-2 gate in scripts/orch-apply.sh AFTER schema validation, BEFORE the CAS-mtime rename. task_total (sum of all task-bearing lanes + active/closed sprint tasks) and signal_total (signal_queue.rows length) — a candidate that drops either below FLOOR_RATIO (default 0.5) of the live value, once live >= MIN_BASELINE (default 10), aborts exit 1 (reuses the existing validation-failed/live-untouched exit class). Logic lives in a new shared scripts/orch-conservation-check.mjs (bun, same runtime as orch-validate.mjs) called by orch-apply.sh AND scripts/agents-flow/orch-state-hook-prewrite.mjs (parity). NARROW NAMED BYPASS ORCH_APPLY_ALLOW_SHRINK=<reason> (mirrors the existing ORCH_APPLY_LIVE_FILE_OVERRIDE test-only precedent in that script) wired ONLY into scripts/orch-cold-evict.sh + docs/agents/pm/flow/task-archive.md (the 2 already-shipped legitimate bulk-eviction writers). REJECT the parent fix_spec's literal 'no lane may ever decrease' wording (brief SS4.2): it would falsely block normal single-task backlog->ready->in_progress lane moves AND both legitimate bulk-eviction writers — the whole-board magnitude-bounded ratio design avoids both false-positive modes because a single-task lane move nets to zero on task_total.",
    routing_note: "PLAN-ONLY->IMPLEMENT handoff from architect brief (parent DONE in done[]). supervised:true -> router dispatches dev-mcp-server DIRECTLY (WIP<=2 supervised budget), NOT via BOUNDED-1 FIFO and NOT via zone-detect generic-developer fallback. dev-mcp-server chosen (not ops, not architect-split) because every touched file is a host-side bash/bun repo script — zero apps/mcp-server/src changes, zero container rebuild. Full evidence + rejected-design proof: the architecture_brief. AC/DoD: verification_gate field above must be GREEN (COLLAPSE was RED before the fix)."
  }])
| ._updated_at = $now
| ._updated_by = "po"
