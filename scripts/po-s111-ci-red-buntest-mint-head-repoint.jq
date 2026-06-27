# po-s111-ci-red-buntest-mint-head-repoint.jq
# Single-pass CI-RED triage: MINT one FIX (shared-root-cause directive) into
# ready[] LEAD (unshift) + REPOINT the canonical top-level .head at it
# (status=in_progress, next_agent=dev-mcp-server, isolation=worktree) so the
# dev-team Step-0b head-resume FIRES, while STASHING the prior head dispatch
# into .head.deferred_head so it resumes once CI is green.
# Idempotent: mint id-guarded across every board array; repoint guarded by the
# head already pointing at the new id.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s111-ci-red-buntest-mint-head-repoint.jq docs/data/orch/orch-state.json
# Atomic: temp -> [ -s ] -> jq empty -> conservation -> rename; commit by EXPLICIT PATH.
($now) as $now
| "FIX-CI-RED-EAC0CC65-BUNTEST" as $tid
| ( [ .task_board | (.backlog,.ready,.in_progress,.review,.done,.done_verified)[]? | .id? ] | any(. == $tid) ) as $present
| if $present then .
  else
    .task_board.ready = ([ {
      id: $tid,
      type: "FIX",
      title: "CI RED on main — bun test (73 fails / 16 files) — find shared root cause",
      status: "READY",
      priority: "P0",
      blocking: true,
      zone: "apps/mcp-server/",
      next_agent: "dev-mcp-server",
      isolation: "worktree",
      source_signal: "docs/signals/ci-red-eac0cc65-20260627114115.json",
      head_sha: "eac0cc654e417a48fc7d91cdfa6bdb4d77db923d",
      run_id: 28287805159,
      run_url: "https://github.com/phamhung075/VN-Market-Intelligence-MCP/actions/runs/28287805159",
      not_flaky: "3 consecutive CI runs failed same bun test job (eac0cc65 11:26, e257f8a0 06-26 22:39, cb3b92da 06-26 18:38)",
      desc: "CI is persistently RED on origin/main HEAD eac0cc65: bun test fails 73 tests across 16 files (13336 pass/53 skip). RECON-FIRST MANDATE: 16 unrelated test files failing simultaneously after 142 commits of churn strongly indicates ONE SHARED ROOT CAUSE (a common helper/schema/import/migration/fixture broke), NOT 16 independent bugs. Per feedback_isolation_probe_before_cluster_triage: probe ALL 16 fails FIRST and find the single shared break BEFORE fixing any file individually; contamination != root. GIT: router local HEAD is 142 commits behind origin/main; the breakage lives in those 142 commits local lacks (parallel sessions pushed direct). To REPRODUCE you MUST work against origin/main code in an isolated worktree (git worktree add against origin/main HEAD) — do NOT stash+rebase main (feedback_push_blocked_by_perpetual_dirty_tree).",
      files: [
        "apps/mcp-server/src/__tests__/1133-foreign-flow-alert-job",
        "apps/mcp-server/src/__tests__/1307-ta-alert-scan-job",
        "apps/mcp-server/src/__tests__/1309-bb-alert-scan-job",
        "apps/mcp-server/src/__tests__/1407b-sla-market-hours-gate",
        "apps/mcp-server/src/__tests__/1517-foreign-flow-alert-ohlcv-source",
        "apps/mcp-server/src/__tests__/1837a-pipeline-state",
        "apps/mcp-server/src/__tests__/1948a-improve-check-store",
        "apps/mcp-server/src/__tests__/1948d-improvement-signal-writer",
        "apps/mcp-server/src/__tests__/1977-orchestration-endpoint",
        "apps/mcp-server/src/__tests__/DWF-phase1-cadence",
        "apps/mcp-server/src/__tests__/FIX-ALERT-ORPHAN-CORRELATION",
        "apps/mcp-server/src/__tests__/FIX-CASCADE-MACRO-CARD-REAL-DETAIL",
        "apps/mcp-server/src/__tests__/FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR",
        "apps/mcp-server/src/__tests__/FIX-EVIDENCE-PIPELINE-STARVED",
        "apps/mcp-server/src/__tests__/WF2-signal-queue-cas",
        "apps/mcp-server/src/__tests__/X1-dryrun-emit-seam",
        "+ suspected shared source: common test helper / schema / migration / fixture imported by all 16"
      ],
      baseline_pass: "DONE only when a CI run with conclusion=success lands on a HEAD SHA DIFFERENT from eac0cc654e417a48fc7d91cdfa6bdb4d77db923d. Local-green does NOT count (feedback_ci_green_gate_blocked_by_cloud_chore_divergence). Verification_gate from signal: ci_green_on_subsequent_push.",
      escalation: "If recon proves the break is structural (shared schema/contract change requiring redesign), escalate to SPRINT-S via architect rather than patching 16 files.",
      groomed_by: "po",
      groomed_at: $now,
      created_at: $now
    } ] + .task_board.ready)
    | .head = {
        status: "in_progress",
        active_task_id: $tid,
        next_agent: "dev-mcp-server",
        next_action: "Spawn dev-mcp-server isolation=worktree against origin/main HEAD eac0cc65; RECON-FIRST find the ONE shared break behind all 16 failing __tests__ files before fixing; verify CI green on a new HEAD SHA.",
        updated_by: "po",
        updated_at: $now,
        note: "Repointed from SSOT-W1-HOOK-ENFORCE: persistent red main blocks the push gate, so the ci_red FIX preempts. Prior head dispatch stashed in .head.deferred_head — resume after CI green.",
        deferred_head: (.head | del(.deferred_head))
      }
  end