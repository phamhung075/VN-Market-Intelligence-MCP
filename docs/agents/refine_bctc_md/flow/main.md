---
agent:
  id: refine_bctc_md
  model: claude-haiku-3-5
  authored_by: claude-opus-4
  description: >
    Fleet-cron orchestrator (Option-Y). Calls get_bctc_pending_refine → fans out one
    Haiku subagent per window via CC Task mechanism → collects Task return values →
    pushes each window via push_bctc_refined_unit → finalizes via finalize_bctc_refine.
    NO filesystem output. NO docs/refine-output/ writes.
---

# Refine BCTC — Orchestrator (Option-Y Fleet Cron)

## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `refine_bctc_md` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with the OFF-HOSE Guard check below.

All MCP tools are reached via the gateway wrapper:
`mcp__claude_ai_gateway__call_tool(server="vn-market", tool="<name>", arguments={...})`

## OFF-HOSE Guard

**Check UTC time BEFORE doing anything else.**

If current UTC time is between 02:00 and 08:59 (inclusive), Mon–Fri:
- Log: `[refine-orchestrator] OFF-HOSE window active — skipping run`
- EXIT immediately. Do not call any tools.

Allowed run times: 09:00–01:59 UTC any day (weekends unrestricted).
Scheduled slots `0 9,14,20 * * *` UTC are all outside the off-HOSE window by design.

## Phase 0 — Fetch Pending Report

1. Call `get_bctc_pending_refine` (limit: 1).
   ```
   call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={ limit: 1 })
   ```
   Returns: `[{ id, filename, page_count, windows }]` — `windows` is the pre-partitioned
   window list from the server side.

2. If result is empty → no reports pending → log `[refine-orchestrator] No pending reports` → EXIT cleanly.

3. Take the FIRST report: `report = result[0]`.

3b. **Confirm status guard** — check `report.confirm_status` before claiming:
   - If `report.confirm_status == "CONFIRMED"`:
     - Log: `[refine-orchestrator] Report {report.id} is CONFIRMED — skipping refine`
     - EXIT cleanly. Do NOT claim. Do NOT set refine_status to FAILED. Return `{ skipped: true, reason: 'confirmed' }`.
   - Otherwise: continue to Step 4.
   *(Belt-and-suspenders: Layer 1 in `getBctcPendingRefineTool` WHERE clause already filters CONFIRMED reports at source. This guard catches any edge case where a confirmed report still reaches the flow.)*

4. Claim a task lock before processing:
   ```
   claim = call_tool(server="vn-market", tool="task_claim", arguments={
     task_id:     "bctc-refine:" + report.id,
     task_kind:   "sprint-task",
     owner_agent: "refine-orchestrator",
     ttl_seconds: 3600
   })
   ```
   If `claim.claimed == false` → another session is processing this report → EXIT cleanly (no error).

5. Readiness check: `report` must have `text_status == "COMPLETE"`. If `text_status` is
   `IN_PROGRESS` or `PARTIAL` → release claim → EXIT cleanly.

6. `windows` must be a non-empty array. If empty → release claim → log WARN → EXIT cleanly.

## Phase 1 — Window Partition (already done by server)

`get_bctc_pending_refine` returns the `windows[]` partition computed server-side via
`partitionIntoWindows()`. The continuation-table invariant (no split across boundaries)
is enforced by the server before this flow runs.

Each window object:
```
{
  unit_id:      string,       // e.g. "w_0_0", "w_0_1"
  page_numbers: number[],     // 1-indexed, max 3 pages
  page_type:    "table" | "prose" | "continuation" | "verify",
  needs_image:  boolean       // classifyPageForImageLoad result
}
```

No additional partitioning is done in this flow. Proceed directly to Phase 2.

## Phase 2 — Fan-Out (CC Task Subagent per Window)

Spawn one `refine_bctc_md` subagent per window using the CC Agent/Task mechanism.
Bounded by `REFINE_FANOUT_CONCURRENCY` (default 5) — never spawn more than the cap
simultaneously. Queue windows into a bounded pool.

Sub-flow selection table:

| `page_type` | Sub-flow path |
|---|---|
| `table` | `docs/agents/refine_bctc_md/flow/table-page.md` |
| `prose` | `docs/agents/refine_bctc_md/flow/prose-page.md` |
| `continuation` | `docs/agents/refine_bctc_md/flow/continuation-stitch.md` |
| `verify` | `docs/agents/refine_bctc_md/flow/disagreement-verify.md` |

For each window in `windows`:
```
sub_flow_path = select_sub_flow(window.page_type)

// CC native subagent spawn — return value collected by orchestrator
task_result = await spawn_agent(
  agent_id:  "refine_bctc_md",
  flow_path: sub_flow_path,
  input: {
    report_id,
    unit_id:      window.unit_id,
    page_type:    window.page_type,
    page_numbers: window.page_numbers,
    needs_image:  window.needs_image
  }
)

// task_result IS the subagent's Task return value JSON — NOT a disk file
```

Failure handling (never throws — captured in window result):
- Timeout (subagent exceeds `REFINE_WINDOW_TIMEOUT_S`, default 120s):
  ```json
  { "unit_id": "<id>", "page_numbers": [...], "markdown": "",
    "confidence": 0.0, "flags": ["timeout"], "status": "FAILED" }
  ```
- Agent error (non-zero exit or exception):
  ```json
  { "unit_id": "<id>", "page_numbers": [...], "markdown": "",
    "confidence": 0.0, "flags": ["agent_error:<detail>"], "status": "FAILED" }
  ```

Collect ALL window results (DONE and FAILED) into `results[]` before Phase 3.
**NO file I/O. NO docs/refine-output/ writes.**

Heartbeat every 5 minutes during the fan-out:
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "bctc-refine:" + report.id })
```
If heartbeat returns `ok=false` → lock stolen → commit partial state if any → EXIT.

## Phase 3 — Aggregate Window Results

```
done_count   = count(results where status == "DONE")
failed_count = count(results where status == "FAILED")

report_status =
  if failed_count == 0:             "DONE"
  else if done_count > 0:           "PARTIAL"
  else:                             "FAILED"
```

All windows (DONE and FAILED) proceed to Phase 4 — FAILED windows are NOT silently dropped.

## Phase 4 — Push to Tools + Finalize

### 4a. Push each window result

```
reset_next = true  // first call resets prior data for this report (idempotency)

for result in results:
  response = call_tool(server="vn-market", tool="push_bctc_refined_unit", arguments={
    report_id:     report.id,
    unit_id:       result.unit_id,
    page_numbers:  result.page_numbers,
    markdown:      result.markdown,
    confidence:    result.confidence,
    flags:         result.flags,
    window_status: result.status,
    reset:         reset_next
  })

  if response.ok:
    reset_next = false   // only first call resets; subsequent calls append
  else:
    log_error("[refine-orchestrator] push failed for unit " + result.unit_id)
    // continue — do not abort; push remaining windows
end
```

### 4b. Finalize report

Call once, after ALL push_bctc_refined_unit calls complete:

```
call_tool(server="vn-market", tool="finalize_bctc_refine", arguments={
  report_id:     report.id,
  report_status: report_status
})
```

`finalize_bctc_refine` server-side performs:
- DELETE + re-parse `bctc_table_rows` from `bctc_refined_units` (DONE units only)
- SET `financial_reports.refine_status = report_status`

### 4c. Release lock

```
call_tool(server="vn-market", tool="task_release", arguments={
  task_id: "bctc-refine:" + report.id
})
```
`ok=false` from release is acceptable (TTL expired or lock stolen — both recoverable).

## Error Boundary

Any unhandled exception → set `report_status = "FAILED"` → call `finalize_bctc_refine`
with `report_status="FAILED"` → release lock → EXIT with error log.
Do NOT leave a report in `IN_PROGRESS` state without a finalize call.

## RETURN

```
STATUS: DONE | PARTIAL | FAILED | SKIPPED
REPORT_ID: <id>
WINDOWS_PROCESSED: <n>
DONE: <done_count> | FAILED: <failed_count>
REPORT_STATUS: DONE | PARTIAL | FAILED
TOOL_CALLS: get_bctc_pending_refine + push_bctc_refined_unit×N + finalize_bctc_refine
NO_FILESYSTEM_OUTPUT: true
```
