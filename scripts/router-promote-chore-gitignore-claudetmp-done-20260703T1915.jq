# Router promote: CHORE-GITIGNORE-CLAUDE-TMP in_progress[] -> done_verified[].
# qa a5cccbafa1d0d533f COMPLETE (CLEAN task — qa executes AND self-gates) + router RAW-verified PASS (2026-07-03T19:15Z):
#   commits d786f1d1b (gitignore .claude/tmp/ + git rm --cached 111 orch-hook-proposal-*.json) + 83db0a8de (DJ + report);
#   non-scratch scope = .gitignore + DJ + report ONLY (orch-state/code untouched); 111 files untracked, 0 tracked remain;
#   0 raw-UUID on ADDED lines (259 purged on removed lines = the leak fixed); scripts/orch-apply.sh has 0 refs to
#   .claude/tmp (no dependency — actual writer is scripts/agents-flow/orch-state-hook-prewrite.mjs, unrelated);
#   DJ docs/agent-memory/decisions/sprint-2026-07-03-qa.md has task-id CHORE-GITIGNORE-CLAUDE-TMP (DJ-GATE-1 PASS).
# Guards: error if not in in_progress[], error if already in done_verified[]. Type-guard string elements.
# Usage: jq --arg now "$NOW" -f scripts/router-promote-chore-gitignore-claudetmp-done-20260703T1915.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="CHORE-GITIGNORE-CLAUDE-TMP"))[0]) as $t
| if $t == null then error("CHORE-GITIGNORE-CLAUDE-TMP not in in_progress[] — refuse to promote")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="CHORE-GITIGNORE-CLAUDE-TMP")) | length) > 0) then error("already in done_verified[] — refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: "router",
      verified_at: $now,
      qa_agent: "qa",
      qa_verdict: "PASS",
      qa_commits: ["d786f1d1b", "83db0a8de"],
      signoff_note: "[router 2026-07-03T19:15Z] qa (CLEAN task — executes AND self-gates) COMPLETE + router RAW-verified PASS. Commits d786f1d1b (gitignore .claude/tmp/ + git rm --cached 111 orch-hook-proposal-*.json) + 83db0a8de (DJ + task report). RAW-verify ground-truth: 0 raw-UUID on ADDED lines; 259 UUID occurrences purged on REMOVED lines (the leak this task fixes); 0 tracked .claude/tmp files remain; .gitignore:16=.claude/tmp/; scripts/orch-apply.sh has 0 refs to .claude/tmp (no dependency — untracking structurally safe; actual snapshot writer is scripts/agents-flow/orch-state-hook-prewrite.mjs, unrelated to orch-apply); orch-state.json untouched since dispatch; DJ docs/agent-memory/decisions/sprint-2026-07-03-qa.md has task-id CHORE-GITIGNORE-CLAUDE-TMP (DJ-GATE-1 PASS); report reports/TASK_REPORT_CHORE-GITIGNORE-CLAUDE-TMP.md (3717B). Notable (documented by qa): first path-limited commit `git commit -m .. -- .gitignore .claude/tmp/` silently dropped the git rm --cached (re-tracked the still-on-disk files) — known class feedback_pathspec_commit_drops_rename_deletion; recovered via `git reset --soft HEAD~2` (both commits local/unpushed) + plain unscoped commit; final state RAW-verified clean. Both commits local/unpushed — fleet-push owns push. Resolves signal router-session-uuid-hygiene-20260703 sub-fix (B) .claude/tmp tracking; sub-fix (A) agent-notebook UUID provenance remains as backlog FIX-AGENT-NOTEBOOK-UUID-PROVENANCE."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "CHORE-GITIGNORE-CLAUDE-TMP"))
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "CHORE-GITIGNORE-CLAUDE-TMP done_verified (qa PASS, router RAW-verified). dev WIP=0 — idle. Backlog (PLAN-ONLY, PO-triaged not-single-shot-ready): FIX-BCTC-FULL-BATCH-CONTAMINATION (HIGH, architect-first handler-vs-gateway); FEAT-SEVERITY-OVERRIDE-SURFACING; FIX-AGENT-NOTEBOOK-UUID-PROVENANCE (MEDIUM — sub-fix A of session-UUID-hygiene, agent notebooks); FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT (LOW); RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL (ops/infra-vps, PLAN-ONLY). DEPLOY-GATED (pending mcp-server rebuild): FIX-LEGAL-RISK ROBUST tier + pdfpull-guard + COLUMN-ORDER finalize_bctc_refine CTG.",
    updated_at: $now,
    updated_by: "router",
    note: "19:15Z: CHORE-GITIGNORE-CLAUDE-TMP in_progress->done_verified (qa PASS a5cccbafa, router RAW-verified: 0 added-line UUID, 111 untracked, orch-apply independent). dev WIP=0 — idle."
  }
