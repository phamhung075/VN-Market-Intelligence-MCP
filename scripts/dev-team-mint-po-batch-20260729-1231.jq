# dev-team-mint-po-batch-20260729-1231.jq
# Applies the BATCH returned by po's tick-12:07Z triage (background agent a041b454093f53d4a).
# po deliberately did NOT write orch-state.json itself this tick (dev-team held the hot-file
# write lane); this script performs the write on its behalf, per main.md Step 1/2 contract
# (BATCH([{type,id,title,desc,size?,files,baseline_pass,zone?}]) -> router applies).
#
# Four mutations, each idempotent (id-guarded):
#   (1) MINT FIX-MCP-SERVER-DEPLOY-LANE-STALL-REBUILD-REQUIRED-INERT into backlog[] (P1, ops).
#       Runtime-verified: mcp-server container's emitPressureStateTool.ts still serves
#       host_headroom_mb, image built 2026-07-25T12:44:56Z, fix commit 98917416a landed
#       2026-07-28T18:01Z -- 3 days of merged-but-undeployed fix. Live effect: cowork
#       spawn-fanout.md Step 5.1 reads container_vm_headroom_mb, never finds a number,
#       stays permanently DEGRADED at max_parallel=2.
#   (2) MINT FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE into backlog[] (P1,
#       architect), MINTED WITH supervised:true + plan_only:true per po's explicit
#       instruction -- omitting those flags would land this row in the exact dispatch gap
#       it describes (main.md:547 names this residual as untracked).
#   (3) MINT FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE into backlog[] (P2,
#       agent-father). Structural grant gap (frontmatter has no Bash), not agent fault --
#       notebook uncommittable, dirty across 3 consecutive cycles, compounding the sweep-
#       guard exposure surface. related to the already-READY FIX-COWORK-BASH-GRANT-
#       COVERAGE-STAMP-TRANSPORT row -- co-dispatch both to agent-father in one edit pass.
#   (4) UNBLOCK FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2: router-adjudicated direct
#       dispatch (backlog[] -> in_progress[], status BACKLOG -> IN_PROGRESS). This row is
#       structurally undispatchable by every automated lane -- next_agent=agent-father
#       fails BOUNDED-1's ^dev(-|$)|^developer$ pattern, and supervised/plan_only are both
#       null so SLS (which requires BOTH) skips it too. It is the sole blocker of a
#       4x-recurring P0 (FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD). .head repointed to this
#       task since it is this tick's Step-3 dispatch.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-mint-po-batch-20260729-1231.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/po-batch-20260729T1207Z" as $src
| ( [ .task_board | (.backlog,.ready,.in_progress,.review,.done,.done_verified,.qa)[]? | .id? ] ) as $existing

# ── (1) MINT FIX-MCP-SERVER-DEPLOY-LANE-STALL-REBUILD-REQUIRED-INERT ─────────
| "FIX-MCP-SERVER-DEPLOY-LANE-STALL-REBUILD-REQUIRED-INERT" as $id1
| if ($existing | any(. == $id1)) then .
  else
    .task_board.backlog = ([ {
      id: $id1,
      type: "FIX",
      title: "Merged fixes never deploy: 9 rows carry rebuild_required, mcp-server image is 3 days older than its fix commit",
      status: "BACKLOG",
      priority: "P1",
      size: "M",
      zone: "cross-service/",
      owner: "po",
      next_agent: "ops",
      supervised: false,
      plan_only: false,
      created_at: $now,
      created_by: $src,
      updated_at: $now,
      source: "po triage 2026-07-29T12:07Z tick, drain-signal cowork-team file, runtime-verified at three planes",
      desc: "RUNTIME-VERIFIED for pressure-state: docker exec into the live mcp-server shows apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts has 0 occurrences of container_vm_headroom_mb and still emits host_headroom_mb; docs/data/pressure-state.json (emitted 2026-07-29T12:10:38Z) confirms the same old field only; the running image was built 2026-07-25T12:44:56Z while the fix (commit 98917416a) was authored 2026-07-28T18:01Z -- three days of merged-but-undeployed code. Live consequence: docs/agents/cowork-team/flow/spawn-fanout.md Step 5.1 reads container_vm_headroom_mb, never finds a number, and stays permanently DEGRADED with max_parallel=2 on every cowork tick. A prior acceptance check for this same fix demonstrated readiness via docker cp of a parser replica into the container -- the copy passed but the served path never changed (known recurring lesson).",
      files: [
        "apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts",
        "docs/data/pressure-state.json",
        "docs/agents/cowork-team/flow/spawn-fanout.md"
      ],
      deliverable: "Rebuild mcp-server ONLY (never docker compose down && up -- CLAUDE.md Rebuild lane invariant, peers must survive), then re-verify at the runtime plane, not the image-metadata plane. Then sweep the other rebuild_required rows for the same undeployed-fix pattern (po flagged FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION, FIX-SCHEDULER-DOUBLE-REGISTRATION, FACTORY-TECHANALYSIS-dedup-calculator as date-implicated only, not yet runtime-confirmed -- verify each independently, do not inherit po's date arithmetic as proof).",
      baseline_pass: "pressure-state.json emits container_vm_headroom_mb as a number; next cowork tick reports degraded:false",
      related: ["FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY"],
      note: "CI is GREEN on main (39a4dac7c, 2026-07-29T05:27Z), so the CI-RED-cdd5fa5a-FIX gate on FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY (REVIEW, next_agent=qa) is discharged -- but qa must verify AFTER this rebuild, since the container it would probe today is the stale one."
    } ] + .task_board.backlog)
  end

# ── (2) MINT FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE ─────────
| "FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE" as $id2
| if ($existing | any(. == $id2)) then .
  else
    .task_board.backlog = ([ {
      id: $id2,
      type: "FIX",
      title: "61 backlog rows (1 P0, ~24 P1) have NO dispatch lane -- gated by NON-DEV-NEXT_AGENT, ineligible for SLS",
      status: "BACKLOG",
      priority: "P1",
      size: "M",
      zone: "cross-service/",
      owner: "po",
      next_agent: "architect",
      supervised: true,
      plan_only: true,
      created_at: $now,
      created_by: $src,
      updated_at: $now,
      source: "po triage 2026-07-29T12:07Z tick",
      desc: "docs/agents/dev-team/flow/main.md:547 names this verbatim as 'a tracked residual gap (no dedicated sweep lane yet)'. It has no row and no owner until now. Distinct from FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER, which covers the supervised+plan_only set the Supervised-Lane Sweep already drains -- this row is the wider set: any backlog row whose next_agent does not match BOUNDED-1's ^dev(-|$)|^developer$ pattern, and that is NOT already caught by the supervised+plan_only pair, sits with no automated pickup path at all. Oldest affected rows have been idle since 2026-07-21.",
      files: [],
      MINT_WITH: "supervised:true, plan_only:true -- deliberate on THIS row per po's instruction, so it does not itself land in the exact gap it describes (a non-dev next_agent row with no supervised+plan_only pair is invisible to SLS).",
      deliverable: "Design + implement a sweep lane (or extend an existing one) that covers non-dev next_agent backlog rows not already caught by BOUNDED-1 (^dev(-|$)|^developer$) or SLS (supervised && plan_only). Architect scopes the lane first (this row is supervised+plan_only precisely so it routes to architect for design, not straight to a dev-* implementer).",
      baseline_pass: "scripts/audits/bounded1-supervised-lane-report.sh SECONDARY section reads 0",
      related: ["FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER"]
    } ] + .task_board.backlog)
  end

# ── (3) MINT FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE ────────
| "FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE" as $id3
| if ($existing | any(. == $id3)) then .
  else
    .task_board.backlog = ([ {
      id: $id3,
      type: "FIX",
      title: "alert-commander holds no Bash tool, so commit-mutex cannot run -- notebook uncommittable across 3 consecutive cycles",
      status: "BACKLOG",
      priority: "P2",
      size: "S",
      zone: "cross-service/",
      owner: "po",
      next_agent: "agent-father",
      supervised: false,
      plan_only: false,
      created_at: $now,
      created_by: $src,
      updated_at: $now,
      source: "po triage 2026-07-29T12:07Z tick",
      desc: "Frontmatter is 'tools: Read, Write, Edit, mcp__gateway__call_tool' -- a structural tool-grant gap, not agent laziness. Self-reported by alert-commander at 06:11Z, 08:13Z, 12:10Z. Notebook is dirty right now. Compounding: uncommitted content parked in the shared tree IS the commit-sweep-guard exposure surface this session has been tracking all day (FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2, dispatched this same tick).",
      files: [".claude/agents/alert-commander.md"],
      deliverable: "Grant Bash to alert-commander. CO-DISPATCH alongside the existing READY row FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT (also next_agent=agent-father, same actuator -- news-scout + market-watcher frontmatter Bash grants) so both land in one edit pass rather than two separate agent-father cycles.",
      baseline_pass: "alert-commander completes a cycle with its notebook committed",
      related: ["FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT"]
    } ] + .task_board.backlog)
  end

# ── (4) UNBLOCK FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2: dispatch now ──
| "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2" as $uid
| ( [ .task_board.backlog[]? | select(.id == $uid) ] | length ) as $uInBacklog
| if $uInBacklog == 0 then .
  else
    ( [ .task_board.backlog[] | select(.id == $uid) ][0]
      | .status = "IN_PROGRESS"
      | .updated_at = $now
      | .updated_by = $src
      | .dispatch_note = "Router-adjudicated direct dispatch 2026-07-29T12:31Z, per po BATCH UNBLOCK: this row is structurally undispatchable by every automated lane (next_agent=agent-father fails BOUNDED-1's dev pattern; supervised/plan_only both null so SLS -- which needs BOTH -- also skips it; absent from backlog-detail.json). Sole remaining blocker of the 4x-recurring P0 FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD, whose two sibling arms (..-HOOK, ..-SKILLS) are already done. Re-scope note carried forward from po's 2026-07-29T11:26Z ruling: the '4 call sites' title is a FLOOR -- 8 distinct agent commit paths swept in one day (07-29 measurement) -- verify current scope before implementing."
    ) as $urow
    | .task_board.backlog = [ .task_board.backlog[] | select(.id != $uid) ]
    | .task_board.in_progress = (.task_board.in_progress + [ $urow ])
    | .head = {
        status: "in_progress",
        active_task_id: $uid,
        next_agent: "agent-father",
        updated_at: $now,
        updated_by: "dev-team",
        next_action: ($uid + " dispatched to agent-father by router (S4 UNBLOCK path) -- structurally unreachable by BOUNDED-1/SLS, per po BATCH 2026-07-29T12:07Z tick")
      }
  end

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
