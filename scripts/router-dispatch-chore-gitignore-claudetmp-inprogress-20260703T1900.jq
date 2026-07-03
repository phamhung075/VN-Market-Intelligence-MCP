# Router dispatch: CHORE-GITIGNORE-CLAUDE-TMP backlog[] -> in_progress[], dispatch qa (S4 CLEAN).
# PO triage (acb64c64d6253e8ae) RETURN BATCH=[CHORE-GITIGNORE-CLAUDE-TMP], type=CLEAN, zone=cross-service/,
#   deploy-independent single-shot, RAW-confirmed real repo debt. dev WIP=0 -> room (WIP<=2).
# Router RAW-verified PO changes: 0 raw-UUID VALUE leak (orch-state+po.md+jq); board rows present; signal RESOLVED.
# Per dev-team/flow/main.md Step 2 matrix CLEAN -> S4 CLEAN dispatch (spawn qa run_in_background) -> EXIT -> jump:end.
# Board promoted to in_progress (owner=qa) so no re-triage after task-lock + SF-1 release (board is the durable dedup).
# Guards: error if not in backlog[], error if already in in_progress[]. Type-guard string elements.
# Usage: jq --arg now "$NOW" -f scripts/router-dispatch-chore-gitignore-claudetmp-inprogress-20260703T1900.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.backlog | map(select(type=="object" and .id=="CHORE-GITIGNORE-CLAUDE-TMP"))[0]) as $t
| if $t == null then error("CHORE-GITIGNORE-CLAUDE-TMP not in backlog[] — refuse to dispatch")
  elif ((.task_board.in_progress | map(select(type=="object" and .id=="CHORE-GITIGNORE-CLAUDE-TMP")) | length) > 0) then error("already in in_progress[] — refuse dup")
  else . end
| .task_board.in_progress += [
    ($t + {
      status: "IN_PROGRESS",
      owner: "qa",
      dev_agent: "qa",
      dispatched_by: "router",
      dispatched_at: $now,
      dispatch_note: "[router 2026-07-03T19:00Z] dev-team tick 18:37Z S4 CLEAN dispatch. PO acb64c64d6253e8ae RETURN BATCH=[CHORE-GITIGNORE-CLAUDE-TMP] (type CLEAN, cross-service/, deploy-independent single-shot). Spawned qa run_in_background: add .claude/tmp/ to .gitignore + git rm --cached the 111 tracked orch-hook-proposal-*.json (UUID-leak + repo bloat); MUST verify scripts/orch-apply.sh treats .claude/tmp/ as scratch (does NOT depend on tracking) + confirm orch-apply still validates+applies after untracking; forward-fix only, NO history rewrite. qa commits code (.gitignore + rm --cached) index-only + writes decision-journal (task-id CHORE-GITIGNORE-CLAUDE-TMP) + task report. Router promotes -> done_verified next tick after RAW-verify."
    })
  ]
| .task_board.backlog |= map(select(type != "object" or .id != "CHORE-GITIGNORE-CLAUDE-TMP"))
| .head += {
    status: "in_progress",
    active_task_id: "CHORE-GITIGNORE-CLAUDE-TMP",
    next_agent: "qa",
    next_action: "qa executing CHORE-GITIGNORE-CLAUDE-TMP (S4 CLEAN): .gitignore .claude/tmp/ + git rm --cached 111 orch-hook-proposal-*.json + verify orch-apply.sh scratch-independence. On qa complete: router RAW-verify (0 UUID leak on added lines, orch-apply still applies, DJ entry present) then promote in_progress->done_verified. Backlog remaining (PLAN-ONLY): FIX-BCTC-FULL-BATCH-CONTAMINATION (architect-first), FEAT-SEVERITY-OVERRIDE-SURFACING, FIX-AGENT-NOTEBOOK-UUID-PROVENANCE, FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT, RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL (ops/infra-vps). ROBUST-tier legal-risk batch still DEPLOY-GATED.",
    updated_at: $now,
    updated_by: "router",
    note: "19:00Z: CHORE-GITIGNORE-CLAUDE-TMP backlog->in_progress (S4 CLEAN, dev-team tick 18:37Z). Dispatched qa run_in_background. dev WIP=1."
  }
