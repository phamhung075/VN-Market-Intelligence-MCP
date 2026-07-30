# dev-team-mint-execute-tier-locklifetime-20260730-2319.jq
# Mints FIX-EXECUTETIER-PHASE35-RESUME-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION.
#
# 2nd occurrence of the exact class main.md's own S2 resume-dispatch already fixed
# (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION): background
# Agent() spawns return in milliseconds while the agent runs far longer, so releasing
# the resume lock in a `finally` bound to the spawn call frees it while the agent is
# still live -- the NEXT read of that lock succeeds and re-spawns a SECOND agent onto
# the same task. main.md lines 503-531/612-629/690-707/752-769/809+ (S2/SLS-resume/
# RLC-resume/DRS-resume/QA-Drain-resume dispatcher-wraps) all carry the fix (no release
# on success, ttl_seconds:3600 is the lock's lifetime bound). execute-tier.md's own
# Phase-3.5 dispatcher-wrap (lines 33-66) -- the DOCUMENTED target of BOUNDED-1's own
# "JUMP TO execute" comment ("execute-tier.md's own Phase-3.5 dispatcher-wrap claims
# task:<id>") -- still uses the pre-fix pattern: `finally: task_release(...)` runs
# immediately after each background Agent() call returns, for every claim in
# spawned_batch, unconditionally.
#
# 1st occurrence (self-caught, no board row minted, see decision-journal STEP
# dev-team-S8 2026-07-30T22:37Z / notebook cycle-20260730T2237Z-tick): I manually used
# the S4 release-immediately convention (mirroring Phase-3.5's own documented pattern)
# to dispatch a Step-3 FIX while ALSO setting `.head`, then next tick's Step 0b resume
# path re-attempted a claim on the now-freed lock and would have re-spawned the SAME
# live agent had I not caught it by direct session-level knowledge. This tick (2nd
# occurrence): ran BOUNDED-1's promote+claim myself, .head set to in_progress, then
# had to CONSCIOUSLY deviate from execute-tier.md's own documented Phase-3.5 release
# semantics and hand-apply main.md's S2 LOCK-LIFETIME pattern instead, specifically to
# avoid reproducing the same bug a 2nd time in the same tick I diagnosed it in.
#
# NOT self-fixing: execute-tier.md's Phase-3.5 is ALSO the genuine multi-task PM-tier-
# batch dispatcher, where per-subtask claim keys do NOT all map 1:1 onto `.head.active_
# task_id` the way a single BOUNDED-1/SLS/RLC/DRS pickup does -- whether the LOCK-
# LIFETIME fix applies unconditionally to every claim in spawned_batch, or only to the
# single-task auto-pickup case, is a real design question (an architect call), not a
# blind copy-paste of the S2 fix.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-mint-execute-tier-locklifetime-20260730-2319.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/self-caught-20260730T2319Z" as $src
| "FIX-EXECUTETIER-PHASE35-RESUME-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION" as $id
| ( [ .task_board | (.backlog,.ready,.in_progress,.review,.done,.done_verified,.qa)[]? | .id? ] ) as $existing
| if ($existing | any(. == $id)) then .
  else
    .task_board.backlog = ([ {
      id: $id,
      type: "FIX",
      title: "execute-tier.md Phase-3.5 dispatcher-wrap releases the resume lock immediately after a background spawn -- main.md's own S2/SLS/RLC/DRS/QA-Drain resume-dispatchers already carry the LOCK-LIFETIME fix for the identical task:<id> key; Phase-3.5 (BOUNDED-1's own documented JUMP-TO target) does not",
      status: "BACKLOG",
      priority: "P1",
      size: "S",
      zone: "cross-service/",
      owner: "dev-team",
      next_agent: "architect",
      supervised: false,
      plan_only: false,
      created_at: $now,
      created_by: $src,
      updated_at: $now,
      source: "dev-team self-caught, 2nd occurrence, tick 2026-07-30T23:07Z",
      desc: "docs/agents/dev-team/flow/execute-tier.md:33-66 (Phase 3.5, the ONLY documented target of BOUNDED-1's own 'JUMP TO execute' comment at main.md:558) claims task:<id> then releases it in a `finally` bound to the same background Agent() call -- run_in_background=true returns in milliseconds while the spawned agent runs far longer, so the lock frees while the agent is still live. The IDENTICAL class was already fixed for main.md's own S2/SLS-resume/RLC-resume/DRS-resume/QA-Drain-resume dispatcher-wraps (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION -- grep 'LOCK-LIFETIME' in main.md, 5 occurrences, all fixed: no release on success, ttl_seconds:3600 IS the lock's lifetime bound, release only on the exception path). Phase-3.5 was never touched by that fix. 1st occurrence: self-caught manually 2026-07-30T22:37Z tick (decision-journal STEP dev-team-S8, notebook cycle-20260730T2237Z-tick) -- I had used the S4/Phase-3.5-style release-immediately convention for a Step-3 FIX dispatch that ALSO set .head, and the NEXT tick's S2 resume-path successfully re-claimed the freed lock, which would have re-spawned the same live agent a 2nd time had I not caught it by direct out-of-band session knowledge. 2nd occurrence (this tick): ran BOUNDED-1's own promote+claim scripts (which correctly set .head.active_task_id per main.md:555-561), then had to consciously deviate from execute-tier.md's own documented Phase-3.5 semantics and hand-apply main.md's S2 pattern instead to avoid reproducing the same bug within the same tick I was diagnosing it in.",
      files: ["docs/agents/dev-team/flow/execute-tier.md"],
      deliverable: "AC: decide (architect call, not a blind copy-paste) whether the LOCK-LIFETIME fix applies to EVERY claim in Phase-3.5's spawned_batch, or only to the single-task case where the claimed id equals .head.active_task_id (multi-task PM-tier-batches may have a different correctness argument for prompt release -- each subtask's own claim key may not gate a SINGLE .head the way BOUNDED-1/SLS/RLC/DRS's single-task claims do). Whichever the design lands on, update Phase-3.5's finally-release block to match, and add a regression fixture (mirroring whatever verified the original S2 fix) proving a 2nd claim attempt on the same task:<id> fails while the spawned agent is still live.",
      out_of_scope: "Re-deriving whether the original S2/SLS/RLC/DRS/QA-Drain fix itself is correct -- that fix is accepted as-is; this row is scoped to Phase-3.5 catching up to it.",
      baseline_pass: "9408",
      related: ["FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION"]
    } ] + .task_board.backlog)
  end
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
