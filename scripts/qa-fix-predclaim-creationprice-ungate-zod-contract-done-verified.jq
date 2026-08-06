# scripts/qa-fix-predclaim-creationprice-ungate-zod-contract-done-verified.jq
#
# Direct-Commit Verify (dev-team Review-Lane QA-Drain, qa[] row, branch:null)
# for FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT.
#
# Verified independently, not trusted from review_note prose: commit 6feec3ab1
# on main ancestry, git show --stat matches all 4 named production files
# (evidenceTools.ts/predictionClaimStore.ts/intelligenceCycleJob.ts/
# predictionClaimsHandler.ts) + 4 doc files. tsc clean. Targeted 6-file suite
# 96/96 pass (285 expect). Full suite 15139 pass/40 skip/53 fail/1 error/48030
# expect (601s) — comfortably clears the row's own regression floor
# (>=9408 pass/<=348 fail). DDD clean (zero domain->infra imports). Security
# clean (no process.env, parameterized SQL, no secrets). mock-guard PASS.
# Deliverable (c) update-path re-verified structurally: insertPredictionClaim
# is the ONLY INSERT site into prediction_claims (grep-confirmed);
# resolveClaim/excludeClaim/markClaimUnresolvable UPDATE statements never
# touch stock/direction/creation_price/resolution_date/confidence.
#
# LIVE gateway acceptance (the row's own AC-1) is SATISFIED, not deferred.
# The row flagged "PENDING-REBUILD: live gateway acceptance NOT claimed --
# running container predates this commit; rebuild is USER-GATED" -- this was
# STALE, not re-checked before being written. docker inspect: the running
# mcp-server container was created 2026-08-06T08:41:16Z, ~12 DAYS AFTER this
# fix's commit (2026-07-25T12:06:06Z UTC) -- for unrelated reasons (other
# fixes shipped since). docker exec cat of the LIVE container's
# predictionClaimStore.ts diffed BYTE-IDENTICAL against git HEAD. curl
# :3000/api/prediction-claims (the actual served endpoint, not a host-CLI/
# sqlite read): 30 total claims now (grew from the row's own last-seen 17);
# ids 18-30 (13 CONSECUTIVE live-production claims, created 2026-07-25 --
# this fix's own commit day -- through 2026-08-01) ALL carry non-null
# creationPrice, a complete reversal of the pre-fix 6-week 0%-scoreable run;
# pre-fix NULL rows (ids 1,8,9,10,11,12) still serve correctly with outcome
# "excluded" -- read-path grandfather (deliverable e) confirmed live, zero
# dropped rows, no 500. The "rebuild is USER-GATED" framing itself is also
# retired standing policy (feedback_po_deploy_rebuild_full_autonomy_no_user_gate,
# 2026-08-01) independent of the container-timestamp finding.
#
# Usage: jq --arg now "$NOW" \
#   -f scripts/qa-fix-predclaim-creationprice-ungate-zod-contract-done-verified.jq \
#   docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def qa_note:
  "[QA] Review Record (direct-commit verify) -- APPROVED, DONE_VERIFIED. " +
  "Commit 6feec3ab1 on main ancestry, git show --stat matches all 4 named " +
  "production files + 4 doc files. Diff read in full (not trusted from " +
  "review_note): evidenceTools.ts price lookup now unconditional (direction/" +
  "expected_move_pct gate only target_price); predictionClaimStore.ts adds a " +
  ".strict() Zod write-door on insertPredictionClaim requiring a finite " +
  "creation_price (throws descriptive error + fire-and-forget sendTelegramBug); " +
  "intelligenceCycleJob.ts chain-synthesizer sibling defect fixed; " +
  "predictionClaimsHandler.ts stale/false docstring corrected. Deliverable (c) " +
  "re-verified structurally: insertPredictionClaim is the ONLY INSERT site " +
  "into prediction_claims (grep-confirmed); resolveClaim/excludeClaim/" +
  "markClaimUnresolvable UPDATE statements never touch stock/direction/" +
  "creation_price/resolution_date/confidence. tsc clean (0 errors). Targeted " +
  "6-file suite (every file touching insertPredictionClaim/create_prediction_claim) " +
  "re-run fresh: 96/96 pass, 285 expect() calls. Full bun test independently " +
  "re-run: 15139 pass/40 skip/53 fail/1 error/48030 expect (601s) -- clears the " +
  "row's own regression floor (>=9408 pass/<=348 fail) with large margin. DDD " +
  "clean (zero domain-> infra imports in any touched file). Security clean (no " +
  "process.env, parameterized SQL only, no hardcoded secrets). mock-guard.sh " +
  "PASS. CORRECTED the row's own stale review_note claim: 'PENDING-REBUILD: " +
  "live gateway acceptance NOT claimed -- running container predates this " +
  "commit; rebuild is USER-GATED' was NOT re-checked before being written. " +
  "docker inspect: running mcp-server container created 2026-08-06T08:41:16Z, " +
  "~12 days AFTER this fix's commit (2026-07-25T12:06:06Z UTC) -- rebuilt since " +
  "for unrelated reasons. docker exec cat of the live container's " +
  "predictionClaimStore.ts diffed BYTE-IDENTICAL against git HEAD. curl " +
  ":3000/api/prediction-claims (the real served endpoint, not host-CLI/sqlite): " +
  "30 total claims (grew from the row's own last-seen 17); ids 18-30 (13 " +
  "CONSECUTIVE live-production claims spanning 2026-07-25 through 2026-08-01) " +
  "ALL carry non-null creationPrice -- complete reversal of the pre-fix 6-week " +
  "0%-scoreable run. Pre-fix NULL rows (ids 1,8,9,10,11,12) still serve " +
  "correctly as excluded -- read-path grandfather (deliverable e) confirmed " +
  "LIVE, zero dropped rows, no 500. The row's own AC-1 (live-endpoint proof) " +
  "is SATISFIED here, not deferred. 'Rebuild is USER-GATED' is also retired " +
  "standing policy (feedback_po_deploy_rebuild_full_autonomy_no_user_gate, " +
  "2026-08-01) independent of the container-timestamp finding. DJ: " +
  "sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-3.md STEP qa-S44.";

(.task_board.qa[] | select(.id=="FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT")) as $t
| if $t == null then error("FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT not in qa[] — refuse")
  elif ($t.status != "QA") then error("FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT status != QA (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    status_note: qa_note,
    next_agent: "pm",
    updated_at: $now,
    updated_by: "qa",
    qa_verified_at: $now,
    qa_verified_by: "qa"
  }) as $done
| .task_board.qa = [.task_board.qa[] | select(.id != "FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board._updated_at = $now
| .task_board._updated_by = "qa"
