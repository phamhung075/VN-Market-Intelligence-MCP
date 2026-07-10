# Board flip: D1-BACKLOG-HYGIENE-SWEEP-EXECUTE READY -> DONE_VERIFIED
#
# Router independently RAW-verified developer's D1-residual delivery:
# - Read full commit diff (c6235460e) — matches self-report exactly: 5 rows
#   backlog[REVIEW]->review[], 3 rows backlog[IN_PROGRESS]->in_progress[],
#   FIX-BCTC-BANK-SUMMARY-MAPPING DONE->BLOCKED (stays backlog[]),
#   FACTORY-INTERFACE-split-server-ts backlog[BLOCKED]->done_verified[].
#   D1's own row untouched (not part of the diff).
# - git status confirms orch-state.json clean (developer committed cleanly).
# - Independently re-ran `bun scripts/orch-validate.mjs` fresh: 0 coherence
#   warnings (Stage 0+1 PASS, no warnings printed) — full 9->0 convergence
#   confirmed, matching po's original 16->0 sprint-closing arithmetic.
# - Independently re-ran `orch-conservation-check.mjs` across the commit
#   boundary (c6235460e^ vs c6235460e): task_total 473=473, signal_total
#   0=0 — exact conservation, zero net row mutation (pure relabel/relocate).
# - Independently re-ran `orchStateSchema.test.ts`: 103 pass / 0 fail / 622
#   expect() calls, live-data C3-a subtest logged 0 issues.
# - Confirmed notebook docs/agent-memory/notebooks/developer.md: clean
#   prepend (53L total), prior RETRY/D4 session entries fully intact below.
#
# Sprint-closing significance: this is the LAST of D1/D2.5/D3's dependents
# for D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING (depends=[D3,D2.5,D1]) — all
# 3 now DONE_VERIFIED, D5 fully dispatchable after this flip.
#
# GUARD: refuse unless the row is in ready[] with status READY.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-fix-d1-ready-to-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.ready // []) as $rd
| ([$rd[] | select(type=="object" and .id=="D1-BACKLOG-HYGIENE-SWEEP-EXECUTE")][0]) as $t
| if $t == null then error("D1-BACKLOG-HYGIENE-SWEEP-EXECUTE not in ready[] — refuse")
  elif ($t.status != "READY") then error("D1-BACKLOG-HYGIENE-SWEEP-EXECUTE status != READY (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    updated_at: $now,
    updated_by: "router",
    commit: "c6235460e",
    router_verdict: "APPROVED",
    router_verified_at: $now,
    router_verified_by: "router",
    router_note: "APPROVED. Independent RAW-verify: read full commit diff (c6235460e), matches self-report exactly (5 REVIEW moves, 3 IN_PROGRESS moves, 1 relabel DONE->BLOCKED, 1 close-exception to done_verified). Re-ran bun scripts/orch-validate.mjs fresh: 0 warnings (9->0 full convergence). Re-ran orch-conservation-check.mjs across commit boundary: 473=473, 0=0 exact. Re-ran orchStateSchema.test.ts fresh: 103/0/622, live-data 0 issues. Notebook prepend clean (53L, prior entries intact). Sprint-closing: D5's depends=[D3,D2.5,D1] now all DONE_VERIFIED."
  }) as $done
| .task_board.ready = [$rd[] | select(.id != "D1-BACKLOG-HYGIENE-SWEEP-EXECUTE")]
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
