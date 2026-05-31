# AR-AGENT-A-OPTY — Fleet Cron Orchestrator + refine_bctc_md Flow Update (agent-father + dev-mcp-server)

**Sprint:** BCTC-AGENTIC-REFINE | **Owners:** agent-father (primary), dev-mcp-server (support) | **Date:** 2026-05-30  
**Status:** READY | **Blocker:** AR-MCP-OPTY (3 tools must exist first) | **Blocks:** AR-QA  
**Complexity:** MEDIUM (orchestrator cron skill + flow return-contract change)

---

## Summary

**The Option-Y fleet cron (§0.7.4):**

The refine orchestration runs on the host-level Claude Code session, not in the mcp-server container. This task creates two artifacts:

1. **`.claude/commands/crons/cron-refine-bctc.md`** — A thin fleet-cron skill that dispatches to the refine_bctc_md agent's main flow. The skill is a one-liner; the heavy logic is in the flow.

2. **Update `refine_bctc_md/flow/main.md` and sub-flows** — Change the output contract: instead of writing to `docs/refine-output/{report_id}/{unit_id}.json` on disk, each subagent returns structured JSON as the Task return value (CC native subagent mechanism). The fleet cron collects these return values and calls `push_bctc_refined_unit` for each window.

**Key changes from prior AR-AGENT-A:**
- The prior brief (§3.2.8) described file-exchange via `docs/refine-output/` directory. **This is replaced by CC Task return-value collection** (§0.7.2 option Y fix).
- Subagent flow files still run in Haiku, authored by Opus (unchanged).
- The flow returns structured JSON: `{ unit_id, page_numbers, markdown, confidence, flags }` as the Task output, not a disk file.

---

## Acceptance Criteria

### AC-AGENT-A-OPTY-1: Cron Skill — `.claude/commands/crons/cron-refine-bctc.md`

**New file:** `.claude/commands/crons/cron-refine-bctc.md`

**Content:**
```markdown
---
# Fleet cron skill dispatcher for BCTC refine orchestration (BCTC-AGENTIC-REFINE Option-Y)
# This skill is a one-liner; the orchestrator logic lives in the refine_bctc_md flow.
---

run docs/agents/refine_bctc_md/flow/main.md
```

**Cron schedule (applied by PO/ops, not in the file):** `'0 9,14,20 * * *'` UTC  
**OFF-HOSE verified:** 09:00, 14:00, 20:00 UTC are all outside 02:00-08:59 UTC Mon-Fri window (per brief §3.2.6).

**Notes:**
- [ ] File MUST be created (no stale references from prior AR-AGENT-A)
- [ ] Schedule is registered by PO/ops during AR-OPS-REBUILD (not in this task)
- [ ] Skill is readonly for this sprint (no live tuning of flow mid-sprint)

---

### AC-AGENT-A-OPTY-2: refine_bctc_md/flow/main.md — Orchestrator Flow Update

**File to modify:** `docs/agents/refine_bctc_md/flow/main.md`

**Current state (§3.2.6):** The main flow was authored in AR-AGENT-A to coordinate window partitioning and spawn subagents. Now update it to use the **fleet cron tool-based push mechanism** instead of file exchange.

**Changes to main.md:**

1. [ ] **Phase 1 (window partition):** UNCHANGED
   - Fetch all page OCR texts via `get_bctc_page_text` tool
   - Partition into windows via `partitionIntoWindows()` logic
   - Classify each page: `classifyPageForImageLoad()` to determine image load

2. [ ] **Phase 2 (fan-out):** UPDATED for CC Task returns
   - Spawn one `refine_bctc_md` subagent per window via CC Agent tool (unchanged)
   - **KEY CHANGE:** Collect the return value (JSON object) from each subagent, not a disk file
   - Pattern (pseudocode):
     ```
     for each window:
       spawn refine_bctc_md/flow/table-page.md (or prose-page, etc.)
         with window OCR text + images
       AWAIT subagent completion
       result = subagent_return_value  // CC Task mechanism
       results.push(result)  // Collect: { unit_id, page_numbers, markdown, confidence, flags, status }
     ```
   - No file I/O on `docs/refine-output/` directory

3. [ ] **Phase 3 (aggregate status):** UNCHANGED
   - Count DONE vs FAILED windows
   - Determine report-level `refine_status` (DONE / PARTIAL / FAILED)

4. [ ] **Phase 4 (push to tools):** NEW
   - For each collected window result:
     - [ ] Call `push_bctc_refined_unit(report_id, unit_id, page_numbers, markdown, confidence, flags, window_status, reset=true for first window)`
   - After all windows are pushed:
     - [ ] Call `finalize_bctc_refine(report_id, report_status=determined-in-phase-3)`
   - Return: `{ ok: true, report_id, windows_processed, status }` (optional; logged to WORK channel by PO if needed)

**New section: Orchestrator pseudocode for Phase 2 + Phase 4**
```
PHASE 2: Fan-Out (via CC Agent spawning)
─────────────────────────────────────────
for window_idx, window in windows:
  sub_flow_path = select_sub_flow(window.type)  // table-page, prose-page, continuation-stitch
  
  // Spawn subagent; CC framework collects return value
  task_result = await spawn_agent(
    agent_id: "refine_bctc_md",
    flow_path: sub_flow_path,
    input: {
      report_id, unit_id, page_numbers, ocr_texts, images, window_type
    }
  )
  
  // task_result is the subagent's return JSON
  window_result = {
    unit_id: task_result.unit_id,
    page_numbers: task_result.page_numbers,
    markdown: task_result.markdown,
    confidence: task_result.confidence,
    flags: task_result.flags,
    status: task_result.status || "DONE"  // subagent sets or default
  }
  
  results.push(window_result)
end

PHASE 3: Aggregate
──────────────────
done_count = count(results where status="DONE")
failed_count = count(results where status="FAILED")
report_status = 
  if failed_count == 0: "DONE"
  else if done_count > 0: "PARTIAL"
  else: "FAILED"

PHASE 4: Push to Tools
──────────────────────
reset_next = true  // first push resets prior data

for result in results:
  response = await call_tool("push_bctc_refined_unit", {
    report_id,
    unit_id: result.unit_id,
    page_numbers: result.page_numbers,
    markdown: result.markdown,
    confidence: result.confidence,
    flags: result.flags,
    window_status: result.status,
    reset: reset_next
  })
  
  if response.ok:
    reset_next = false  // only first call resets
  else:
    log_error("Push failed for unit " + result.unit_id)
end

// Finalize report
response = await call_tool("finalize_bctc_refine", {
  report_id,
  report_status
})

return { ok: true, report_id, windows_processed: len(results), status: report_status }
```

---

### AC-AGENT-A-OPTY-3: Sub-flows — Return-Value Contract

**Files to verify (no changes needed if already correct):**
- `docs/agents/refine_bctc_md/flow/table-page.md`
- `docs/agents/refine_bctc_md/flow/prose-page.md`
- `docs/agents/refine_bctc_md/flow/continuation-stitch.md`
- `docs/agents/refine_bctc_md/flow/disagreement-verify.md`

**Return-value contract (each sub-flow must emit at end):**

Each sub-flow completes by returning a JSON object (via `return` in the flow syntax, or final output variable):

```json
{
  "unit_id": "window_001",
  "page_numbers": [1, 2],
  "markdown": "| Mã số | Chỉ tiêu | ... |\n|---|---|...|\n| 100 | ...",
  "confidence": 0.95,
  "flags": [],
  "status": "DONE"
}
```

**Field definitions:**
- `unit_id`: string, unique per window, e.g., `"w_{report_idx}_{window_idx}"`
- `page_numbers`: array of 1-indexed page numbers in the window (e.g., `[22, 23]`)
- `markdown`: the refined markdown output (pipe-table format with headers)
- `confidence`: float 0.0–1.0 (average across all cells; 1.0 = no low-confidence flags)
- `flags`: array of strings (e.g., `["timeout", "agent_error:..."]`) — empty array if no issues
- `status`: "DONE" (success) or "FAILED" (should be set by the subagent if something went wrong; default to "DONE" if not provided)

**Verification:**
- [ ] Each sub-flow explicitly returns the JSON object (not written to disk)
- [ ] No `docs/refine-output/` file writes in the sub-flows
- [ ] Field names match the tool schema in `AR-MCP-OPTY-handoff.md` AC-MCP-OPTY-2

---

### AC-AGENT-A-OPTY-4: Cron Skill Environment Variables

**Schedule binding (in docker-compose or PO config):**

The cron skill `.claude/commands/crons/cron-refine-bctc.md` is scheduled at the fleet level. The schedule `'0 9,14,20 * * *'` UTC is already defined in `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` §3.2.6.

**Notes:**
- [ ] Schedule is applied by ops (not in this task; see AR-OPS-REBUILD)
- [ ] Environment variables `REFINE_FANOUT_CONCURRENCY`, `REFINE_WINDOW_TIMEOUT_S`, `REFINE_MAX_WINDOW_PAGES` are already set in `docker-compose.yml` (AR-OPS-PRE)
- [ ] The refine_bctc_md flow reads these env vars as needed (via `Bun.env` if running in the host CC session)

---

### AC-AGENT-A-OPTY-5: Build + Test

- [ ] Syntax check: `.claude/commands/crons/cron-refine-bctc.md` is valid YAML + markdown
- [ ] Flow validation: `docs/agents/refine_bctc_md/flow/main.md` can be parsed by CC agent system
- [ ] No references to `docs/refine-output/` in any sub-flows
- [ ] Verify: all sub-flows return the expected JSON structure (manual inspection)

---

## Files to Create / Modify

| File | Action | Reason |
|---|---|---|
| `.claude/commands/crons/cron-refine-bctc.md` | Create | AC-AGENT-A-OPTY-1 (fleet cron skill) |
| `docs/agents/refine_bctc_md/flow/main.md` | Modify | AC-AGENT-A-OPTY-2 (update orchestrator for tool-based push) |
| `docs/agents/refine_bctc_md/flow/table-page.md` | Verify | AC-AGENT-A-OPTY-3 (return-value contract) |
| `docs/agents/refine_bctc_md/flow/prose-page.md` | Verify | AC-AGENT-A-OPTY-3 (return-value contract) |
| `docs/agents/refine_bctc_md/flow/continuation-stitch.md` | Verify | AC-AGENT-A-OPTY-3 (return-value contract) |
| `docs/agents/refine_bctc_md/flow/disagreement-verify.md` | Verify | AC-AGENT-A-OPTY-3 (return-value contract) |

---

## Implementation Notes

### File Exchange Removal

**Old pattern (§3.2.8, now REMOVED):**
```
orchestrator writes to docs/refine-output/{report_id}/{unit_id}.json
subagent reads from same path
orchestrator deletes after reading
```

**New pattern (Option Y, now STANDARD):**
```
subagent returns JSON object as Task return value (CC native)
main flow collects return value directly
main flow calls push_bctc_refined_unit with collected data
no file I/O needed
```

**Cleanup:** If any `docs/refine-output/` directories exist from prior runs, they can be safely ignored (not created by the new flow).

### Pseudocode Detail

The Phase 2 fan-out uses CC's Agent/Task mechanism. The pseudocode above is language-agnostic; the actual implementation depends on the CC flow syntax (likely via a `spawn` or `task` block that collects the return value).

---

## Non-Negotiables

- **NO file writes to `docs/refine-output/`.** All data flows through tool calls.
- **Return-value contract is binding.** Every sub-flow must return the exact JSON structure.
- **main branch only.** No feature branches.
- **Explicit `git add <file>`** per file — never `-A`.
- **Cron skill is READONLY this sprint.** No tuning mid-sprint.

---

## Exit Criteria

- [x] AC-AGENT-A-OPTY-1: Cron skill `.claude/commands/crons/cron-refine-bctc.md` created.
- [x] AC-AGENT-A-OPTY-2: `refine_bctc_md/flow/main.md` updated with orchestrator flow (Phase 1–4).
- [x] AC-AGENT-A-OPTY-3: All sub-flows verified to return expected JSON structure.
- [x] AC-AGENT-A-OPTY-4: Environment variables confirmed (already set by AR-OPS-PRE).
- [x] AC-AGENT-A-OPTY-5: No file I/O to `docs/refine-output/` in live code.
- [x] Syntax validation passed.

---

## Related Docs

- Architecture brief: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` (§0.7)
- Option-Y ruling: §0.7.2 (host-level fleet cron, CC Task returns)
- Prior: AR-MCP-OPTY (3 tools that this flow calls)
- Next: AR-QA (bake-off on FPT + ACB)

---

## RETURN

```
TASK: AR-AGENT-A-OPTY
STATUS: READY FOR ASSIGNMENT
OWNER: agent-father (primary), dev-mcp-server (review)
BLOCKER: AR-MCP-OPTY (3 tools must exist)
BLOCKS: AR-QA (fleet cron + tools must be wired before bake-off)
ESTIMATED: 2–3 hours (flow logic update + cron skill creation + verification)
NEXT: AR-QA (ops + qa) — end-to-end bake-off on FPT + ACB
```
