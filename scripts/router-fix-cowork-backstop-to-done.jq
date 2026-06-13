# Router board move: FIX-COWORK-GUARANTEED-BACKSTOP in_progress[] -> done[] (IMPLEMENTED, awaiting Mon live-verify).
# NOT done_verified: AC-6 G1-G4 are live multi-day (first chef-morning fire Mon 2026-06-15T05:15Z).
# Pointer: docs/agents/dev-team/flow/main.md (router board-write step).
# Usage: jq --arg now "$NOW" -f scripts/router-fix-cowork-backstop-to-done.jq docs/data/orch/orch-state.json
(.task_board.in_progress | map(select(.id=="FIX-COWORK-GUARANTEED-BACKSTOP"))[0]) as $t
| if $t == null then error("FIX-COWORK-GUARANTEED-BACKSTOP not in in_progress[]") else . end
| .task_board.done += [
    ($t + {
      status: "done",
      done_at: $now,
      done_by: "router",
      router_implementation: {
        disposition: "IMPLEMENTED-AWAITING-MON-LIVE-VERIFY",
        option: "A — Layer-A per-slot RemoteTriggers (session-independent)",
        ac_status: "AC-1 (5 triggers created) DONE; AC-2 (trigger_id writeback) DONE; AC-3 (layer_a_deletion_locked) DONE; AC-4 (runbook §1/§9 + stability_log) DONE; AC-5 (dedup gate verify-in-flow) DONE; AC-6 (G1-G4 live) PENDING Mon 2026-06-15.",
        commits: ["a5a357d3 (agent-father: dedup gate in 3 flows + deletion lock + runbook)", "c809d66c (router: 5 triggers + trigger_id writeback)"],
        triggers_created: {
          "chef-morning": {id: "trig_01FdUF4YWg8TqpXVnBLC7GYj", next_run: "2026-06-15T05:15:00Z"},
          "chef-eod": {id: "trig_01NS8j25rYt4meXVqHyRsVNn", next_run: "2026-06-15T08:45:00Z"},
          "chef-evening": {id: "trig_013zatVHSRiChMJwm5XtSBEx", next_run: "2026-06-14T19:45:00Z"},
          "digest-sunday": {id: "trig_01FjB1WhF1bpgH1oYZF4BYru", next_run: "2026-06-14T13:47:00Z"},
          "tnb-audit": {id: "trig_01QgnBwnEyzLj5as55i53tea", next_run: "2026-06-14T20:13:00Z"}
        },
        router_raw_overrides: "Brief §3 env_011CV1yonRDFUhYhGEdkVwqj was pulled from the DELETED chef triggers (unverifiable). Router substituted PROVEN-LIVE env_01DNWKA2KMxnk5Utn1moxjoF + gateway connector 5c86b49b (url https://zenmidi.com/gateway) — both confirmed firing on the active Team-MCP-Health-Recheck trigger (last_fired 2026-06-13T20:02Z). Brief's events:[{prompt}] shorthand REJECTED by create API; correct shape = job_config.ccr.events[].data.message{content,role} with session_context (model/sources/allowed_tools) nested INSIDE job_config.ccr; mcp_connections top-level. Contract discovered iteratively + locked.",
        dedup_gate_live: "chef.md:46 (published:<slot>:<work_date> YYYY-MM-DD 28h ttl), tnb main.md:28 (published:tnb-audit:<YYYY-WW> ~8d), digest-predict main.md:28 (published:digest-sunday:<YYYY-WW> ~8d). First-writer-wins; Layer-A + Layer-B coexist without double-publish.",
        layer_b_status: "Layer-B */15 dispatcher (cron a95078d1) currently ARMED this session — fired 21:05Z this cycle. Immediate stopgap already in place; Layer-A is the permanent session-independent remedy. No /cron-cowork-team re-arm needed now.",
        deletion_lock: "cowork-schedule.json._notes.layer_a_deletion_locked=true — Layer-B fallback must NOT be deleted until 2x session-restart survivals logged in runbook §9.stability_log AND PO clears the flag."
      },
      live_verification_gate: {
        note: "PROMOTE done -> done_verified only after these fire LIVE. First chef-morning fire = Mon 2026-06-15T05:15Z (trigger next_run, authoritative; supersedes the groomed gate's mislabeled '06-16').",
        G1: "chef-morning fires Mon 2026-06-15 ~05:15-05:35Z: cowork-schedule.json chef-morning.last_fired updates + 2026-06-15 morning entry in docs/agent-memory/notebooks/unified-agent.md.",
        G2: "chef-eod fires Mon 2026-06-15 ~08:45-09:05Z: last_fired update + EOD notebook entry.",
        G3: "survives deliberate CLI session restart with NO manual /cron-cowork-team — a post-restart guaranteed-slot boundary still fires (session-independence = root closed). RemoteTriggers are claude.ai-hosted so this is structurally satisfied; confirm by observing a fire after any restart.",
        G4: "no double-publish: when Layer-B */15 AND Layer-A both fire the same slot/day, the published:<slot>:<date> claim makes exactly one publish (other exits silent).",
        closer: "TNB c95+ audit confirms morning+EOD present for 2 consecutive market days (Mon 06-15 + Tue 06-16) = recurrence #5 closed -> a future dev-team tick promotes to done_verified."
      }
    })
  ]
| .task_board.in_progress |= map(select(.id != "FIX-COWORK-GUARANTEED-BACKSTOP"))
