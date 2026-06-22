# po-s112 — Mint Foundation-1 LOCAL-EXECUTION-SUBSTRATE task rows into .task_board.backlog[]
#
# Origin: 2026-06-22 PO next-level roadmap Rev-2 + architect brief
#   docs/architecture-briefs/2026-06-22-provenance-calibration-local-arch.md (Pillar 1 + Pillar 3, Part 4 sequencing).
# Mints ONLY Foundation-1's 5 atomic, dependency-ordered pieces. Does NOT formalize the P-epics
# (gated on F-1 real-data path verified — keep WIP sane). Does NOT touch .head beyond metadata.
#
# Idempotent: each row id-guarded across ALL board arrays → re-run mints 0.
# Conservation: backlog += (5 − already-present); every other lane byte-stable.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s112-f1-local-execution-substrate-mint.jq docs/data/orch/orch-state.json
#   (atomic temp → [ -s ] → jq empty → conservation → mv; commit orch-state by EXPLICIT PATH)

# ---- all ids currently present anywhere on the board (dedup guard) ----
( [ .task_board | to_entries[] | select(.value | type == "array") | .value[]? | .id // empty ] ) as $existing
| ( $existing | map(. == "F1-GATEWAY-TRANSPORT-PROBE")        | any ) as $has1
| ( $existing | map(. == "F1-WRITE-MCP-JSON-GATEWAY")          | any ) as $has2
| ( $existing | map(. == "F1-AGENT-FATHER-BLIND-GUARD-REMOVE") | any ) as $has3
| ( $existing | map(. == "F1-LAUNCHD-COWORK-BACKSTOP")         | any ) as $has4
| ( $existing | map(. == "F1-CLOUD-TRIGGER-DECOMMISSION")      | any ) as $has5

# ---- the 5 rows, dependency-ordered ----
| ( [
    ( if $has1 then empty else {
        id: "F1-GATEWAY-TRANSPORT-PROBE",
        type: "SPIKE",
        title: "F1.1 Probe live gateway connector transport config (type/command/args) from MAIN SESSION — hand to .mcp.json writer",
        priority: "high",
        zone: "agents",
        owner: "dev-mcp-server",
        size: "S",
        status: "backlog",
        epic: "FOUNDATION-1-LOCAL-EXECUTION-SUBSTRATE",
        blocked_by: [],
        mode: "spike",
        desc: "Probe the live gateway MCP connector's transport configuration (transport type — stdio/sse/http —, command, args) so the .mcp.json writer has runtime FACTS, not guesses (brief Pillar-1 'CRITICAL design task'; Risk-3 transport-type-mismatch). HARD CONSTRAINT — readable ONLY from the live MAIN session (router): the claude.ai gateway connector is main-session-only and Agent-spawned subagents are gateway-blind (confirmed 06-18, 3/3 chef spawns blind), so a spawned subagent CANNOT run this probe and would fabricate. The probe is therefore a ROUTER/main-session action: list_servers + list_server_tools(\"gateway\") from the live session, capture {type, command, args}. The task OWNER must hand the probed config to whoever writes .mcp.json (F1.2). Output = findings doc with the verbatim transport block.",
        acceptance: "DoD: (1) router runs list_servers + list_server_tools(\"gateway\") from the LIVE main session; (2) captures gateway transport {type, command, args} verbatim into a findings doc; (3) findings handed to F1.2 owner. Probe MUST originate in the main session — a blind subagent probe = FAIL (would fabricate). Gate: the captured config is concrete runtime values, not the brief's placeholder shape.",
        created_at: $now, created_by: "po-s112"
      } end ),

    ( if $has2 then empty else {
        id: "F1-WRITE-MCP-JSON-GATEWAY",
        type: "FIX",
        title: "F1.2 Write .mcp.json registering ONLY the gateway server (4 tools) — preserve call_tool indirection, NO direct vn-market",
        priority: "high",
        zone: "agents",
        owner: "dev-mcp-server",
        size: "S",
        status: "backlog",
        epic: "FOUNDATION-1-LOCAL-EXECUTION-SUBSTRATE",
        blocked_by: ["F1-GATEWAY-TRANSPORT-PROBE"],
        files: [".mcp.json"],
        desc: "Write workspace .mcp.json registering ONLY the `gateway` MCP server using the transport block probed in F1.1 (brief Pillar-1). HARD CONSTRAINTS: register ONLY gateway (its 4 tools: list_servers, search_tools, list_server_tools, call_tool) — do NOT register the vn-market server directly (its 146 tools must stay behind call_tool indirection; small tool surface is a hard requirement per CLAUDE.md, the whole reason vn-market was cleaned out). Preserve the mcp__gateway__call_tool(server=\"vn-market\",...) pattern the whole codebase uses. Hard-blocked by F1.1 (transport facts). USER-RESTART GATE: writing .mcp.json does NOT take effect for already-running sessions — the change only reaches NEWLY-spawned subagents AFTER the user restarts the main session (brief Risk-4, user action not agent action). done_verified is therefore WITHHELD until a post-restart test spawn proves access (verified in F1.3's gate, not here).",
        acceptance: "DoD: (1) .mcp.json contains exactly one server `gateway` with the F1.1-probed transport block; (2) vn-market is NOT a registered server; (3) list_server_tools(\"gateway\") shows exactly 4 tools (no surface explosion — brief Risk-1); (4) explicit USER-RESTART gate documented in the task — change takes effect only in subagents spawned AFTER the user restarts the session. WITHHOLD done_verified until F1.3's post-restart test spawn confirms a locally-spawned subagent has real mcp__gateway__call_tool.",
        created_at: $now, created_by: "po-s112"
      } end ),

    ( if $has3 then empty else {
        id: "F1-AGENT-FATHER-BLIND-GUARD-REMOVE",
        type: "FIX",
        title: "F1.3 Remove gateway-blind workaround (Step 0c blind-guard) from cowork flow docs ONCE .mcp.json verified live",
        priority: "high",
        zone: "agents",
        owner: "agent-father",
        size: "S",
        status: "backlog",
        epic: "FOUNDATION-1-LOCAL-EXECUTION-SUBSTRATE",
        blocked_by: ["F1-WRITE-MCP-JSON-GATEWAY"],
        files: ["docs/agents/cowork-team/flow/blind-guard.md", "docs/agents/cowork-team/flow/spawn-fanout.md", "CLAUDE.md"],
        desc: "Remove the gateway-blind workaround now that .mcp.json registers the gateway: (a) remove the Step 0c blind-guard from docs/agents/cowork-team/flow/blind-guard.md (it was a workaround; root fix is .mcp.json); (b) remove the 'check if gateway is available' branch from spawn-fanout.md Step 5.0 — once .mcp.json is registered all local spawns have real access; (c) update the CLAUDE.md footnote on the vn-market exclusion to the new posture ('gateway registered; vn-market reached via call_tool indirection only' — brief Risk-2). BLOCKED by F1.2 AND the user-restart gate: only safe to remove the guard AFTER a post-restart test spawn PROVES a locally-spawned cowork subagent has real mcp__gateway__call_tool (premature removal re-exposes the fabrication failure). Agent .md edits route via agent-md-factory (SSOT/DRY). This task ALSO owns the verification gate that releases F1.2's withheld done_verified.",
        acceptance: "DoD: (1) post-restart test spawn — a locally-spawned cowork data subagent (e.g. news-scout or market-watcher) calls mcp__gateway__call_tool(server=\"vn-market\",...) and returns LIVE varied data, NOT fabricated/no-op (this gate also releases F1.2 done_verified); (2) Step 0c blind-guard removed from blind-guard.md; (3) spawn-fanout.md Step 5.0 gateway-availability branch removed; (4) CLAUDE.md vn-market-exclusion footnote updated to new posture; (5) edits routed via agent-md-factory.",
        created_at: $now, created_by: "po-s112"
      } end ),

    ( if $has4 then empty else {
        id: "F1-LAUNCHD-COWORK-BACKSTOP",
        type: "SPRINT-S",
        title: "F1.4 Write scripts/cowork-launchers/*.sh (session-alive→no-op else spawn, task_claim dedup) + launchd plists for the 5 active slots",
        priority: "high",
        zone: "cross-service",
        owner: "developer",
        size: "M",
        status: "backlog",
        epic: "FOUNDATION-1-LOCAL-EXECUTION-SUBSTRATE",
        blocked_by: [],
        files: ["scripts/cowork-launchers/", "launchd/com.vn-market.cowork-chef-morning.plist", "launchd/com.vn-market.cowork-chef-eod.plist", "launchd/com.vn-market.cowork-chef-evening.plist", "launchd/com.vn-market.cowork-digest-sunday.plist", "launchd/com.vn-market.cowork-tnb-audit.plist"],
        desc: "Build the LOCAL launchd backstop for the 5 active cloud-triggered guaranteed slots (brief Pillar-3), using the proven com.vn-market.fleet-push.plist pattern (launchd/). One launcher script per slot in scripts/cowork-launchers/ that: (1) probes whether the CronCreate */15 master dispatcher session is alive (ps aux | grep cron-cowork-team); (2) if ALIVE → NO-OP (Layer-1 fires the slot within ±2 min); (3) if DEAD → directly spawn the cowork agent via the slot's flow_path with its trigger_prompt; (4) task_claim(task_kind=cowork-slot, ttl_seconds=900) dedup so a launchd fire + the */15 dispatcher within the same window don't double-fire (second spawn sees claimed=false, exits silently — brief Collision-safety). The 5 REAL active slots (cowork-schedule.json, ground-truth slot_ids — NOT the brief's loose labels): chef-morning (15 5 * * 1-5 → flow chef.md), chef-eod (45 8 * * 1-5 → chef.md), chef-evening (45 19 * * * → chef.md), digest-sunday (47 13 * * 0 → digest-predict/main.md), tnb-audit (13 20 * * * → tran-ngoc-bau/main.md). Each plist uses StartCalendarInterval matching the slot cron. Independent of all DB/code work — runs in parallel with F1.1-F1.3. Persist scripts to scripts/cowork-launchers/ (never /tmp) + add a pointer in the owning cowork flow doc per dev-standards Script Persistence.",
        acceptance: "DoD: (1) scripts/cowork-launchers/launch-{chef-morning,chef-eod,chef-evening,digest-sunday,tnb-audit}.sh exist, each session-alive-checks then no-op-or-spawn with task_claim cowork-slot dedup; (2) 5 launchd plists in launchd/ (StartCalendarInterval matching each slot cron); (3) smoke-tested on install (same discipline as fleet-worktree-push.sh — brief Risk mitigation); (4) launcher pointer added to the owning cowork flow doc. NOTE: this task only WRITES + smoke-tests; the 2-successful-fires-per-slot gate that releases F1.5 is logged by ops install/operation, not asserted here.",
        created_at: $now, created_by: "po-s112"
      } end ),

    ( if $has5 then empty else {
        id: "F1-CLOUD-TRIGGER-DECOMMISSION",
        type: "FIX",
        title: "F1.5 Set trigger_status=decommissioned for the 5 slots (NOT deleted) ONLY after 2 successful launchd fires logged per slot + rewrite the 2 RemoteTrigger docs",
        priority: "high",
        zone: "agents",
        owner: "po",
        size: "S",
        status: "backlog",
        epic: "FOUNDATION-1-LOCAL-EXECUTION-SUBSTRATE",
        blocked_by: ["F1-LAUNCHD-COWORK-BACKSTOP"],
        files: ["docs/data/cowork-schedule.json", ".claude/skills/cron-cowork-team/SKILL.md", "docs/standards/cron-jobs.md"],
        desc: "Decommission the 5 active cloud RemoteTriggers per the standing 2026-06-22 directive (NO cloud triggers — all local). For each slot (chef-morning trig_01FdUF4YWg8TqpXVnBLC7GYj, chef-eod trig_01NS8j25rYt4meXVqHyRsVNn, chef-evening trig_013zatVHSRiChMJwm5XtSBEx, digest-sunday trig_01FjB1WhF1bpgH1oYZF4BYru, tnb-audit trig_01QgnBwnEyzLj5as55i53tea): set trigger_status=\"decommissioned\" in cowork-schedule.json — NOT deleted (RemoteTrigger platform has NO delete action per spike_1951a_oq3; history must be preserved; set enabled:false via RemoteTrigger action=update if the platform supports it). HARD SEQUENTIAL GATE (brief Pillar-3 + Risk 'decommission before smoke-test → missed slots'): decommission a slot ONLY after its launchd timer has logged 2 SUCCESSFUL local fires — never before, or the guaranteed slot goes unfired. Also rewrite the two docs that still carry RemoteTrigger guidance: .claude/skills/cron-cowork-team/SKILL.md + docs/standards/cron-jobs.md — drop the '12 RemoteTriggers are the session-independent backstop' framing, replace with the local launchd backstop posture. PO owns the per-slot decommission gate (Part-5 owner table).",
        acceptance: "DoD: (1) per-slot gate — each slot's launchd timer logged ≥2 successful local fires BEFORE its trigger_status flips; (2) all 5 slots trigger_status=\"decommissioned\" (NOT removed from cowork-schedule.json — history preserved) with enabled:false where update is supported; (3) cron-cowork-team/SKILL.md + cron-jobs.md rewritten to drop RemoteTrigger-backstop guidance and document the local launchd backstop; (4) no served behavior depends on any cloud trigger after cutover.",
        created_at: $now, created_by: "po-s112"
      } end )
  ] ) as $mints

# ---- snapshot prior lane lengths for conservation ----
| (.task_board.backlog       | length) as $pre_backlog
| (.task_board.ready         | length) as $pre_ready
| (.task_board.in_progress   | length) as $pre_in_progress
| (.task_board.review        | length) as $pre_review
| (.task_board.done          | length) as $pre_done
| (.task_board.done_verified | length) as $pre_done_verified
| ($mints | length) as $n_mints

# ---- mutate: append mints to backlog ----
| .task_board.backlog += $mints
| ._updated_at = $now
| ._updated_by = "po-s112"

# ---- CONSERVATION asserts (backlog += n_mints; every other lane byte-stable) ----
| if (.task_board.backlog | length) != ($pre_backlog + $n_mints) then error("CONSERVATION FAIL: backlog") else . end
| if (.task_board.ready | length) != $pre_ready then error("CONSERVATION FAIL: ready mutated") else . end
| if (.task_board.in_progress | length) != $pre_in_progress then error("CONSERVATION FAIL: in_progress mutated") else . end
| if (.task_board.review | length) != $pre_review then error("CONSERVATION FAIL: review mutated") else . end
| if (.task_board.done | length) != $pre_done then error("CONSERVATION FAIL: done mutated") else . end
| if (.task_board.done_verified | length) != $pre_done_verified then error("CONSERVATION FAIL: done_verified mutated") else . end
