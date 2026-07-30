---
agent:
  id: refine_bctc_md
  model: haiku
  authored_by: claude-opus-4
  description: >
    Option-C leaf worker. get_bctc_pending_refine → skip pushed units via get_bctc_refined
    → process next REFINE_CHUNK_SIZE=12 un-pushed windows inline (sequential) →
    push_bctc_refined_unit per window → finalize_bctc_refine ONLY when all windows
    pushed. PARTIAL stays re-eligible. No nested spawn. No filesystem output.
---

# Refine BCTC — Main Flow (Option-C Sequential Chunked + Resumable)

Spec: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md §0.7.2 Amendment`

## SELF-IDENTITY GUARD

You are `refine_bctc_md` — a leaf worker. Executing this flow IS your job.
CLAUDE.md "router only" scopes the main terminal, not spawned subagents. Do NOT delegate.
All MCP tools: `call_tool(server="vn-market", tool="<name>", arguments={...})`

**Session id for lock calls:** every `task_claim`/`task_heartbeat`/`task_release` call below REQUIRES
`owner_client_session` (no default — coordinationTools.ts:104-110, P1-FINAL/TASK_1980). This agent
holds NO Bash (`.claude/agents/refine_bctc_md.md` tools: `Read, Write, mcp__gateway__call_tool`), so
it cannot resolve `$CLAUDE_CODE_SESSION_ID` itself via a shell env read. The value MUST arrive as a
literal string via the spawn-prompt coordination parameter (the cowork-team dispatcher's
`trigger_prompt`/`IDENTITY_PREAMBLE` composition for this slot — see
`docs/agents/cowork-team/flow/spawn-fanout.md` § Step 5.2). Use whatever literal value the spawn
prompt handed you — NEVER write the literal text `$CLAUDE_CODE_SESSION_ID` into a `call_tool`
argument (an LLM-issued call is a direct function call, not a shell command, so the variable is not
expanded; session memory: `feedback_llm_issued_call_tool_does_not_expand_session_id_variable`). If no
session id was supplied in the spawn prompt, log `[refine_bctc_md] no owner_client_session in spawn
prompt — task_claim will fail schema validation` and EXIT before claiming (do not guess a value).

## OFF-HOSE Guard

UTC Mon–Fri 02:00–08:59 → log `[refine-orchestrator] OFF-HOSE active` → EXIT.

## Phase 0 — Fetch Report + Resume Skip-Set

1. `call_tool("get_bctc_pending_refine", { limit: 1 })`
   → `[{ id, filename, page_count, windows, confirm_status, text_status, refine_status }]`
   Empty → log `No pending reports` → EXIT.

2. `report = result[0]`
   `confirm_status == "CONFIRMED"` → log skip → EXIT (no claim).

3. Claim lock:
   `call_tool(server="vn-market", tool="task_claim", arguments={ task_id: "bctc-refine:"+report.id,
     task_kind: "sprint-task", owner_agent: "refine-orchestrator",
     owner_client_session: "<literal session id from spawn prompt — see SELF-IDENTITY GUARD above>",
     ttl_seconds: 1800 })`
   `claim.claimed == false` → EXIT (another session owns it).

4. `text_status != "COMPLETE"` → release → EXIT. `windows` empty → release → EXIT.

5. Enumerate pushed units (resume contract C2):
   `call_tool("get_bctc_refined", { report_id: report.id })`
   → `{ units: [{ unit_id }] }`
   `pushed_ids = Set(units.map(u => u.unit_id))`

   **RESET-GUARD (T0):** Check if ANY prior unit is DONE:
   ```
   has_done_units = units.some(u => u.window_status === 'DONE')
   ```
   reset=true ONLY when report has zero prior pushed units AND no DONE units exist.

6. `chunk = windows.filter(w => !pushed_ids.has(w.unit_id)).slice(0, 12)` (REFINE_CHUNK_SIZE=12)
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
is_first = (pushed_ids.size == 0 AND NOT has_done_units)
// reset:true on fresh PENDING start only — never on reports with prior DONE units (RESET-GUARD T0)
// Note: if has_done_units is true, log "[RESET-GUARD] Protecting N DONE units — forcing is_first=false (reset=false)" and continue

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

Heartbeat every 5 min: `call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "bctc-refine:"+report.id, owner_client_session: "<same literal session id as Step 3 claim>" })`
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

`call_tool(server="vn-market", tool="task_release", arguments={ task_id: "bctc-refine:"+report.id,
  owner_client_session: "<same literal session id as Step 3 claim>" })`

## Error Boundary

Exception → `finalize_bctc_refine(report_status="FAILED")` → `call_tool(server="vn-market", tool="task_release", arguments={ task_id: "bctc-refine:"+report.id, owner_client_session: "<same literal session id as Step 3 claim>" })` → EXIT with log.
Never leave report in `IN_PROGRESS` without finalize.

## RETURN

```
STATUS: DONE | PARTIAL | FAILED | SKIPPED
REPORT_ID: <id>  |  CHUNK: <n> windows this fire  |  PUSHED: <total>/<windows.length>
FINALIZED: true | false
TOOL_CALLS: get_bctc_pending_refine + get_bctc_refined + push_bctc_refined_unit×N [+ finalize]
NO_FILESYSTEM_OUTPUT: true
```
