---
sprint: ORCH-DASH-DECISION-DRILLDOWN
branch: task/orch-dash-qa-verification
size: S
zone: qa
depends_on: [ARCH-ORCH-F3]
blocks: []
---

## TLDR

Verify the live orchestration dashboard decision drilldown feature. Test that DONE task rows are clickable, accordion expands with correct STEP entries, non-DONE rows remain inert, empty state displays correctly, API returns valid JSON, and both mcp-server and frontend containers are running latest code.

## [PM] Planning Context

- **Acceptance Criteria:**
  - [ ] AC-QA-1: mcp-server container is running (verify `docker ps | grep mcp-server` shows RUNNING state with recent build)
  - [ ] AC-QA-2: frontend container is running (verify `docker ps | grep frontend` shows RUNNING state with recent build)
  - [ ] AC-QA-3: `curl http://localhost:3000/api/orchestration` returns 200 with valid JSON (not markdown string)
  - [ ] AC-QA-4: Response JSON includes `decisions` field (is object, not null/undefined)
  - [ ] AC-QA-5: `decisions.by_task` and `decisions.sprint_bucket` keys match entries in `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN.md` file
  - [ ] AC-QA-6: Open browser to `http://localhost:3001/dashboard/orchestration`; page loads without errors
  - [ ] AC-QA-7: Dashboard displays ORCH-DASH-DECISION-DRILLDOWN sprint with task list
  - [ ] AC-QA-8: DONE task rows are clickable (visual affordance: cursor-pointer, chevron visible)
  - [ ] AC-QA-9: Click a DONE task row → accordion expands, shows STEP entries in chronological order (newest first)
  - [ ] AC-QA-10: STEP entries display all 6 fields: step_id, agent_id, timestamp, what_done, what_considered (as bullet list), why_decision, why_change
  - [ ] AC-QA-11: Click the same DONE task row again → accordion closes
  - [ ] AC-QA-12: Click multiple DONE task rows → all selected rows stay open independently (multi-open, not single-open)
  - [ ] AC-QA-13: Non-DONE task rows (TODO, IN_PROGRESS, REVIEW) have no accordion affordance; not clickable
  - [ ] AC-QA-14: For a DONE task with no decision journal entries → accordion shows "No decisions recorded for this task."
  - [ ] AC-QA-15: For a DONE task with only sprint-level entries (no task-id in journal) → accordion shows "Sprint-level decisions (no task-id assigned)" + entries
  - [ ] AC-QA-16: Use keyboard (Tab + Enter/Space) to navigate and expand accordion → works same as mouse click
  - [ ] AC-QA-17: All text in accordion renders plain (no HTML tags, no markdown, no injected content)
  - [ ] AC-QA-18: Existing orchestration dashboard fields (head, task_board, signal_queue, sprint_goal) unchanged; `decisions` is additive

- **Files to read first:**
  - `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` § QA § Test Strategy — verification checklist
  - `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN.md` — sample journal entries to locate in API response
  - `docs/data/orch/orch-state.json` (section `.task_board.active_sprints[] | select(.id == "ORCH-DASH-DECISION-DRILLDOWN")`) — task list to verify on dashboard

- **Files to create:**
  - None (verification only; no code changes)

- **Files to modify:**
  - None (sign-off document only, optional)

- **Dependencies:** ARCH-ORCH-F3 (all code must be merged before QA begins)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` § Testing (tier-3 = service, verify LIVE not stale image)
  - `docs/references/docker-commands.md` or ops runbook (docker ps, docker logs, curl checks)

---

## QA Procedure

### Phase 1: Container Verification

```bash
# Verify mcp-server running
docker ps | grep mcp-server
# Expected: RUNNING, recent timestamp (within last 30 min)

# Verify frontend running
docker ps | grep frontend
# Expected: RUNNING, recent timestamp

# If either is stale (>30 min old), rebuild:
# (developer or ops will have done this; QA just verifies)
docker logs mcp-server | tail -20  # should show clean startup, no errors
docker logs frontend | tail -20
```

### Phase 2: API Verification

```bash
# Get the orchestration DTO
curl http://localhost:3000/api/orchestration | jq '.' > /tmp/orch.json

# Verify decisions field exists and is object
jq '.decisions | type' /tmp/orch.json
# Expected: "object"

# Verify by_task and sprint_bucket are present
jq '.decisions | keys' /tmp/orch.json
# Expected: ["by_task", "sprint_bucket"]

# Sample: look for task-id-keyed entries
jq '.decisions.by_task | keys | .[]' /tmp/orch.json
# Expected: [task IDs from ORCH-DASH-DECISION-DRILLDOWN sprint]

# Verify a specific STEP entry structure
jq '.decisions.by_task["ARCH-ORCH-F1"][0]' /tmp/orch.json 2>/dev/null || echo "No entries for F1 yet"
# Expected: { step_id, agent_id, timestamp, task_id, what_done, what_considered, why_decision, why_change }
```

### Phase 3: Dashboard UI Verification

1. **Page Load:**
   - Open `http://localhost:3001/dashboard/orchestration` in browser
   - Expected: Page loads, no console errors, ORCH-DASH-DECISION-DRILLDOWN sprint visible

2. **Task List Rendering:**
   - Verify all 6 tasks displayed: ARCH-ORCH-DASH-DECISION-DRILLDOWN, PM-ORCH-DASH-DECISION-DRILLDOWN, ARCH-ORCH-F1, ARCH-ORCH-F2, ARCH-ORCH-F3, ARCH-ORCH-QA
   - DONE task (architect blueprint) should be visibly marked (color, checkmark, etc.)
   - TODO tasks should be visibly marked differently

3. **Accordion Affordance:**
   - Hover over DONE task row (architect blueprint task)
   - Expected: cursor changes to pointer, chevron visible (▾ icon or equivalent)
   - Hover over TODO task row
   - Expected: no pointer cursor, no chevron, visibly inert

4. **Single Accordion Expand:**
   - Click on the DONE task row
   - Expected: accordion expands, shows decision entries below the row
   - Verify entries display these fields (order may vary):
     - step_id (e.g., "architect-S1")
     - agent_id (e.g., "architect")
     - timestamp (human-readable date/time)
     - what_done (one-line summary)
     - what_considered (bullet list)
     - why_decision (one-line reason)
     - why_change (one-line comparison)

5. **Multiple Accordion Expand (Multi-Open):**
   - If any other DONE tasks exist or will be DONE by QA time, click another one
   - Expected: both accordions stay open; clicking the first again closes only the first
   - Verify independent toggle behavior (not single-open, which would close the first when opening the second)

6. **Empty State:**
   - If any DONE task has no decision entries (unlikely for architect blueprint, but possible for other tasks)
   - Expected: accordion shows "No decisions recorded for this task."

7. **Sprint-Level Fallback:**
   - If the architect blueprint task has entries without task-id in the journal (edge case)
   - Expected: accordion shows "Sprint-level decisions (no task-id assigned)" + entries

8. **Keyboard Navigation:**
   - Use Tab key to focus the DONE task row
   - Expected: focus outline visible (browser default or custom)
   - Press Enter or Space
   - Expected: accordion toggles (same as mouse click)
   - Press Tab again to move to next row; repeat

9. **Visual Stability:**
   - Scroll within accordion entries (if they overflow)
   - Expected: no layout shift, text is readable, no missing fields
   - Resize browser window
   - Expected: accordion stays readable on narrow screens (no horizontal scroll for entry content)

10. **Entry Content Security:**
    - Inspect one STEP entry in browser dev tools (F12 → Elements)
    - Expected: all text nodes are plain (no `<img>`, `<script>`, `<iframe>`, no HTML entities that shouldn't be decoded)
    - Search for `dangerouslySetInnerHTML` in rendered HTML
    - Expected: not found

### Phase 4: Regression Check

```bash
# Verify existing orchestration fields unchanged
curl http://localhost:3000/api/orchestration | jq '.head, .task_board, .signal_queue, .sprint_goal' > /tmp/orch_existing.json

# Compare to a prior build snapshot (if available)
# Key: existing fields should byte-identical, decisions is purely additive
jq '.head | keys | sort' /tmp/orch_existing.json
# Expected: same keys as before F2 (no new/removed fields at top level)
```

---

## Expected Findings

- **Normal:** All 18 criteria pass; feature is ship-ready
- **Minor:** Small CSS tweaks needed (spacing, chevron rotation angle, font size) — file cosmetic-only subtask
- **Regression:** A STEP entry displays malformed or partial (missing field) — escalate to developer with reproduction steps
- **Performance:** API response time >500ms or dashboard page takes >3s to load — escalate to developer with curl + browser timing

---

## Sign-off Criteria

- All 18 AC items checked and marked passing
- API response includes valid `decisions` JSON object
- Dashboard accordion renders STEP entries with all 6 fields visible
- Multi-open state works (multiple DONE tasks can be expanded simultaneously)
- Keyboard navigation works (Tab + Enter/Space)
- Non-DONE tasks are inert (no accordion affordance)
- No console errors, no security violations
- Existing orchestration fields unchanged
- Write result to `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN.md` with QA sign-off (optional document, not required; passed criteria suffice)
- Return status block: APPROVED or APPROVED-WITH-CONDITIONS + any cosmetic/perf notes
