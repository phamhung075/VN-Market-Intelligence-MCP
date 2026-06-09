# PO retry edit (po-S23 + A-30 triage). One atomic jq pass over orch-state.json.
# TASK A: flip FIX-CI-MCP-SDK-MOCK-CONTAM TODO->DONE; re-baseline + un-queue Cluster 2 & 5.
# TASK B: append ops repair_task FIX-MCP-MEMORY-OOM-INVESTIGATE; triage both A-30 signal rows (dedup).

# --- shared new-baseline string (346 absolute, supersedes 629) ---
("346 native fail+error absolute (344 fail + 2 err / Ran 11802, sha 2acb7192, run 27184744909, bun job 80251172255 — SUPERSEDES the 629/e442cf11 absolute)") as $newbase

# --- TASK A: sprint task flips (active_sprints index 24 = CI-RED-RECONCILE) ---
| .task_board.active_sprints[24].tasks |= (map(
    if .id == "FIX-CI-MCP-SDK-MOCK-CONTAM" then
      .status = "DONE"
      | .closed_at = "2026-06-09T05:08:00Z"
      | .done_at = "2026-06-09T05:08:00Z"
      | .done_by = "po"
      | .actual_result = "PASS -283 (-45%): native fail+error 629 -> 346 at sha 2acb7192 (run 27184744909, bun job 80251172255: 11416 pass / 42 skip / 344 fail / 2 errors / Ran 11802). Code 5fa2822d retained + pushed by router. Option-A diagnosis EMPIRICALLY CONFIRMED (full no-op stub set on MockMcpServer cleared the ESM-cache cascade; fail -271, errors -12; count +265 as previously-crashed tests now execute)."
      | .note = (.note + " || [po S23 DJ-GATE-1 2026-06-09T05:08Z] GATE PASSED -283 (629->346). FIX-CI-MCP-SDK-MOCK-CONTAM DONE. Cluster1 largest single net win of the sprint (vs P5-P8 schema-drift breakeven-or-worse). 346 is the new gate floor for downstream FIX-CI-*. Router owns push (already pushed 5fa2822d).")
    elif .id == "FIX-CI-DATA-SYMLINK-ENOENT" then
      .status = "TODO"
      | .baseline_pass = $newbase
      | .gate = "native fail+error must DROP further vs the 346 absolute (sha 2acb7192, run 27184744909, job 80251172255); CI-workflow/infra change only (no prod logic)."
      | .note = ((.note // "") + " || [po S23 2026-06-09T05:08Z] UN-QUEUED QUEUED->TODO (Cluster1 DONE). Re-baselined 629->346. Cluster 2 (~91 native, missing apps/mcp-server/data symlink + ENOENT swallow in setup.ts). Dispatch-ready, owner dev-mcp-server.")
    elif .id == "FIX-CI-DEAD-REUTERS-TESTS" then
      .status = "TODO"
      | .baseline_pass = $newbase
      | .gate = "2 native errors -> 0 vs the 346 absolute (sha 2acb7192, run 27184744909, job 80251172255); dead-test deletion only (no prod code)."
      | .note = ((.note // "") + " || [po S23 2026-06-09T05:08Z] UN-QUEUED QUEUED->TODO (Cluster1 DONE). Re-baselined 629->346. Cluster 5 = the ENTIRE remaining error count (2 err) — cheapest possible next win; delete 2 _deprecated test files importing deleted reuters.js. Owner dev-mcp-server.")
    else . end
  ))

# --- TASK B: append ops repair_task to backlog ---
| .task_board.backlog += [{
    "id": "FIX-MCP-MEMORY-OOM-INVESTIGATE",
    "type": "FIX",
    "owner": "ops",
    "zone": "infra",
    "route_to": "ops",
    "status": "TODO",
    "priority": "high",
    "size": "S",
    "created_at": "2026-06-09T05:13:37Z",
    "created_by": "po",
    "sprint": "CI-RED-RECONCILE",
    "labels": ["a-30", "mcp-server", "memory-oom", "infra", "near-oom"],
    "title": "Investigate + remediate mcp-server memory near-OOM (A-30): 69.98% (04:35) -> 97.75% (05:06), 1.955GiB/2GiB cap, +28%/30min. Likely caused the host crash that aborted the prior PO run.",
    "context": "system-auditor A-30 escalation (commit aaef7d9a, pushed). mcp-server container memory climbed 69.98%@04:35Z -> 97.75%@05:06Z (1.955GiB of 2GiB hard cap), +28% in 30min, near-OOM. Signal rows: sau-20260609T033542Z (90.24% WARN) + sau-2026-06-09T05:06:15Z (97.75% HIGH).",
    "deliverable": "Root-cause the memory growth (leak vs legitimate working set vs CI-suite-driven spike) AND remediate. REMEDIATION CONSTRAINT (rebuild-recreate-destroys-peers rule): NEVER docker compose down && up — that kills peer containers ~21min. Use TARGETED force-recreate of the SINGLE mcp-server service only (docker compose up -d --force-recreate --no-deps mcp-server) to reclaim memory, then verify the cap holds and capture before/after RSS. If a code-side leak is implicated, raise a follow-up dev FIX (do not patch code as ops).",
    "gate": "mcp-server memory back below WARN threshold after targeted single-service recreate; peer containers untouched (docker ps -a confirms all peers still up, same uptime class); root-cause note recorded (leak vs working-set vs spike). NEVER down&&up."
  }]

# --- TASK B (dedup): triage both A-30 signal_queue rows in place (no new signal row) ---
| .signal_queue.rows |= (map(
    if .id == "sau-2026-06-09T05:06:15Z" or .id == "sau-20260609T033542Z" then
      .status = "TRIAGED"
      | .to = "ops"
      | .zone_owner = "infra"
      | .triage_note = "A-30 mcp-server memory near-OOM -> NEW repair_task FIX-MCP-MEMORY-OOM-INVESTIGATE (backlog, owner ops, zone infra, priority high). Both A-30 rows (WARN 90.24% + HIGH 97.75%) fold into the one task (dedup, no new signal row). Remediation = TARGETED single-service force-recreate ONLY (NEVER down&&up — rebuild-recreate-destroys-peers)."
    else . end
  ))

# --- SSOT bookkeeping ---
| .task_board._updated_at = "2026-06-09T05:13:37Z"
| .task_board._updated_by = "po"
| ._updated_at = "2026-06-09T05:13:37Z"
| ._updated_by = "po"
