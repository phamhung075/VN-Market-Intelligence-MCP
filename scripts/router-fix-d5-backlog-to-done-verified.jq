# Board flip: D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING BACKLOG -> DONE_VERIFIED
#
# Router independently RAW-verified developer's D5 delivery (sprint-closing task):
# - Read full commit diff (ed01c5c1b) — matches self-report exactly: Stage-1b
#   (checkLaneCoherence) flipped warn-print-only -> hard-fail (process.exit(2))
#   in scripts/orch-validate.mjs, scripts/orch-apply.sh comment updated, 4 SHG
#   rows closed to DONE_VERIFIED with per-row signoff_note evidence.
# - Independently re-ran `bun scripts/orch-validate.mjs` on live file: exit 0,
#   0 issues (unchanged from pre-flip — no false-positive regression).
# - Independently re-ran the MANDATORY negative-path proof: injected a fresh
#   IN_PROGRESS-in-backlog[] violation into a throwaway fixture -> exit 2,
#   correct error message, confirmed non-zero (not just re-trusting the
#   self-report's own claim of this).
# - Independently re-ran orchStateSchema.test.ts: 104 pass / 0 fail / 627
#   expect() calls. Re-ran orch-apply-wrapper-tests.sh: 31/31 PASS.
# - Scrutinized SHG-2/3/4/5 closures rather than rubber-stamping (this was the
#   flagged risk from the in-flight discovery): confirmed referenced commits
#   46eba4b33 ("sprint eviction rule... SHG-4 + SHG-3") and 41d925d8c
#   ("normalize status enum... SHG-2") exist and match their cited scope;
#   confirmed docs/agents/pm/flow/task-archive.md § Sprint Eviction section
#   still present (line 34+); confirmed 0 live null-id sprint rows; confirmed
#   the 4 cited live-excluded IDs (FIX-BCTC-BANK-SUMMARY-MAPPING,
#   FIX-ALERT-OPEN-ZERO-PRICE-RACE, FU-PROFILE-DATA-VERIFY, REFLOW-MBB-Q1-2026)
#   are genuinely BLOCKED/coherent today, corroborating the "latent, not
#   live-exercised" risk claim for the cold-evict conflict below.
# - Independently reproduced the reported scripts/test/orch-cold-evict-tests.sh
#   regression: 19/27 PASS, 8 FAIL — exact match to self-report. All "REAL live
#   orch-state.json UNCHANGED" assertions still pass — confirms the regression
#   is confined to the test's own fixtures, not a live-data threat.
# - Confirmed D5's own board row was left untouched in backlog[]/BACKLOG for
#   this flip, per its explicit dispatch instructions.
# - Confirmed notebook docs/agent-memory/notebooks/developer.md: clean prepend,
#   prior D1-residual session entry fully intact below.
#
# This closes the BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP sprint in full
# (D0->D0B->D1->D2.5->D3->D4->D5, plus SHG-1..5, all now terminal).
#
# GUARD: refuse unless the row is in backlog[] with status BACKLOG.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-fix-d5-backlog-to-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.backlog // []) as $bl
| ([$bl[] | select(type=="object" and .id=="D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING")][0]) as $t
| if $t == null then error("D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING not in backlog[] — refuse")
  elif ($t.status != "BACKLOG") then error("D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING status != BACKLOG (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    updated_at: $now,
    updated_by: "router",
    commit: "ed01c5c1b",
    router_verdict: "APPROVED",
    router_verified_at: $now,
    router_verified_by: "router",
    router_note: "APPROVED. Independent RAW-verify: read full commit diff (ed01c5c1b), matches self-report exactly. Re-ran bun scripts/orch-validate.mjs fresh: exit 0, 0 issues, unchanged. Independently re-ran the mandatory negative-path proof with a fresh injected violation: exit 2 confirmed. Re-ran orchStateSchema.test.ts fresh: 104/0/627. Re-ran orch-apply-wrapper-tests.sh: 31/31. Scrutinized SHG-2/3/4/5 closures (not rubber-stamped): referenced commits 46eba4b33/41d925d8c exist and match cited scope, task-archive.md eviction section present, 0 null-id sprints, 4 cited live-excluded IDs confirmed BLOCKED/coherent. Independently reproduced the reported orch-cold-evict-tests.sh regression: 19/27, exact match, confirmed confined to test fixtures (live orch-state.json unaffected). Notebook prepend clean. Sprint BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP now fully closed. Minting follow-up FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE per D5's recommendation."
  }) as $done
| .task_board.backlog = [$bl[] | select(.id != "D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING")]
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
