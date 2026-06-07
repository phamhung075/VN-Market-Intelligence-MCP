---
agent:
  id: refine_bctc_md
  model: haiku
  authored_by: claude-opus-4
  description: >
    Option-C leaf worker. get_bctc_pending_refine → skip pushed units via get_bctc_refined
    → process next REFINE_CHUNK_SIZE=7 un-pushed windows inline (sequential) →
    push_bctc_refined_unit per window → finalize_bctc_refine ONLY when all windows
    pushed. PARTIAL stays re-eligible. No nested spawn. No filesystem output.
---

# Refine BCTC — Main Flow (Option-C Sequential Chunked + Resumable)

Spec: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md §0.7.2 Amendment`

## SELF-IDENTITY GUARD

You are `refine_bctc_md` — a leaf worker. Executing this flow IS your job.
CLAUDE.md "router only" scopes the main terminal, not spawned subagents. Do NOT delegate.
All MCP tools: `mcp__claude_ai_gateway__call_tool(server="vn-market", tool="<name>", arguments={...})`

## OFF-HOSE Guard

UTC Mon–Fri 02:00–08:59 → log `[refine-orchestrator] OFF-HOSE active` → EXIT.

## Phase 0 — Fetch Report + Resume Skip-Set

1. `call_tool("get_bctc_pending_refine", { limit: 1 })`
   → `[{ id, filename, page_count, windows, confirm_status, text_status, refine_status }]`
   Empty → log `No pending reports` → EXIT.

2. `report = result[0]`
   `confirm_status == "CONFIRMED"` → log skip → EXIT (no claim).

3. Claim lock:
   `call_tool("task_claim", { task_id: "bctc-refine:"+report.id, task_kind: "sprint-task",
     owner_agent: "refine-orchestrator", ttl_seconds: 1000 })`
   `claim.claimed == false` → EXIT (another session owns it).

4. `text_status != "COMPLETE"` → release → EXIT. `windows` empty → release → EXIT.

5. Enumerate pushed units (resume contract C2):
   `call_tool("get_bctc_refined", { report_id: report.id })`
   → `{ units: [{ unit_id }] }`
   `pushed_ids = Set(units.map(u => u.unit_id))`

6. `chunk = windows.filter(w => !pushed_ids.has(w.unit_id)).slice(0, 7)` (REFINE_CHUNK_SIZE=7)
   `chunk` empty → all windows pushed → go to Phase 3 (finalize) → EXIT.

## Phase 1 — Window Partition (server-side)

`windows[]` from `get_bctc_pending_refine` is pre-partitioned (continuation-invariant
enforced server-side). Each: `{ unit_id, page_numbers, page_type, needs_image }`.

## Phase 2 — Sequential Inline Loop (NO spawn_agent — Option-C)

Sub-flow logic (inline, not spawned — select by `window.page_type`):
- `table` → apply `docs/agents/refine_bctc_md/flow/table-page.md` logic
- `prose` → apply `docs/agents/refine_bctc_md/flow/prose-page.md` logic
- `continuation` → apply `docs/agents/refine_bctc_md/flow/continuation-stitch.md` logic
- `verify` → apply `docs/agents/refine_bctc_md/flow/disagreement-verify.md` logic

```
is_first = (pushed_ids.size == 0 OR report.refine_status == 'FAILED')
// reset:true on fresh PENDING start OR FAILED retry — wipes poisoned units before re-processing
// (FAILED units flagged agent_error:no_spawn_path_option_y are not real refinements; discard is correct)

for window in chunk:
  result = execute_sub_flow_logic(window)   // inline per page_type above

  call_tool("push_bctc_refined_unit", {
    report_id: report.id, unit_id: result.unit_id,
    page_numbers: result.page_numbers, markdown: result.markdown,
    confidence: result.confidence, flags: result.flags,
    window_status: result.status, reset: is_first
  })
  is_first = false
end
```

Heartbeat every 5 min: `call_tool("task_heartbeat", { task_id: "bctc-refine:"+report.id })`
`ok=false` → lock stolen → EXIT (partial progress in DB; next fire resumes).

## Phase 3 — Finalize (only when ALL windows pushed)

```
all_pushed = pushed_ids.size + chunk.length
if all_pushed >= windows.length:
  done_ct   = count(pushed units window_status==DONE)
  failed_ct = count(pushed units window_status==FAILED)
  status    = failed_ct==0 ? "DONE" : done_ct>0 ? "PARTIAL" : "FAILED"
  call_tool("finalize_bctc_refine", { report_id: report.id, report_status: status })
// else: leave refine_status=PARTIAL — next fire resumes remaining windows
```

`call_tool("task_release", { task_id: "bctc-refine:"+report.id })`

## Error Boundary

Exception → `finalize_bctc_refine(report_status="FAILED")` → `task_release` → EXIT with log.
Never leave report in `IN_PROGRESS` without finalize.

## RETURN

```
STATUS: DONE | PARTIAL | FAILED | SKIPPED
REPORT_ID: <id>  |  CHUNK: <n> windows this fire  |  PUSHED: <total>/<windows.length>
FINALIZED: true | false
TOOL_CALLS: get_bctc_pending_refine + get_bctc_refined + push_bctc_refined_unit×N [+ finalize]
NO_FILESYSTEM_OUTPUT: true
```
