# TASK_QA — Live End-to-End Verification

**Sprint:** ORCH-TASK-CANON  
**Owner:** qa  
**Type:** QA  
**Status:** TODO  
**Created:** 2026-06-06T21:30:00Z  
**Zone:** `docs/agents/ + apps/mcp-server/ + apps/frontend/`  
**Size:** S  
**Priority:** high  
**Depends:** [`AF-ORCH-F1A-F4`, `AF-ORCH-F1B`, `F2-MCP`, `F3-FE`]

---

## Summary

Live end-to-end verification that all 5 sprint tasks (F1a-F4 flows, F1B migration, F2 TypeScript, F3 frontend, QA itself) integrate correctly. Verify data flow from canonical SSOT → orch-state.json → API served → dashboard rendered. Confirm decision-journal visibility + accordion rendering.

---

## Test Plan

### Phase 1: SSOT Validation (after F1B commit)

**Pre-condition:** F1B migration commit merged

```bash
# Canonical field present
jq '.task_board.done[0] | has("id")' docs/data/orch/orch-state.json
# Expected: true

# No freeform status variants
jq '[.task_board.done[].status] | unique | .[]' docs/data/orch/orch-state.json | \
  grep -v -E '^(TODO|IN_PROGRESS|REVIEW|DONE|BLOCKED|CANCELLED|DEFERRED)$'
# Expected: (no output — all enum values)

# Nested container removed
jq '[.task_board.done[] | select(.id == "ORCH-DASH-DECISION-DRILLDOWN")] | length' docs/data/orch/orch-state.json
# Expected: 0

# Task count after flattening (66 original + 6 children - 1 container = 71)
jq '.task_board.done | length' docs/data/orch/orch-state.json
# Expected: 71
```

### Phase 2: API Serving (after F2 REBUILD)

**Pre-condition:** F2 TypeScript changes merged + mcp-server rebuilt + live

```bash
# API serves done[] array
curl -s http://localhost:3000/api/orchestration | jq '.task_board.done | type'
# Expected: "array"

# First done task has canonical fields
curl -s http://localhost:3000/api/orchestration | jq '.task_board.done[0] | {id, title, status}'
# Expected: {id: "...", title: "...", status: "DONE"} (example)

# Counts.done is accurate
curl -s http://localhost:3000/api/orchestration | jq '.counts.done'
# Expected: 71 (matches .task_board.done | length)

# Specific task readable
curl -s http://localhost:3000/api/orchestration | jq '.task_board.done[] | select(.id == "FIX-VPS-SSC-CURL-SCRAPER")'
# Expected: {id: "FIX-VPS-SSC-CURL-SCRAPER", title: "...", status: "DONE", ...} (non-empty)

# decisions.by_task populated for at least one task
curl -s http://localhost:3000/api/orchestration | jq '.decisions.by_task | keys | length'
# Expected: >0 (at least one task has journal entries)
```

### Phase 3: Dashboard Rendering (after F3 REBUILD)

**Pre-condition:** F3 TypeScript changes merged + frontend rebuilt + live

1. **Visual: Done Group Non-Empty**
   - Open http://localhost:3001
   - Navigate to Orchestration dashboard tab
   - Observe: Done group header shows "Done (N)" where N > 0
   - Observe: At least one task card visible under Done

2. **Visual: Task Accordion Rendering**
   - In Done group, click on a task card with journal entries (e.g., FIX-VPS-SSC-CURL-SCRAPER)
   - Observe: Accordion expands
   - Observe: STEP blocks render with fields (what-done, why-decision, etc.)
   - Observe: No console errors or broken markup

3. **SSR Markup Inspection:**
   ```bash
   curl -s http://localhost:3001 | grep -o 'data-accordion' | wc -l
   # Expected: >0 (at least one accordion element in HTML)
   
   curl -s http://localhost:3001 | grep -o 'Done (' | head -1
   # Expected: "Done (" present (done group visible)
   ```

### Phase 4: Decision-Journal Flow (after F4 + F1B + F2 live)

**Pre-condition:** At least one agent has written a per-agent journal file in F4 sprint

```bash
# Per-agent journal file exists
ls -la docs/agent-memory/decisions/sprint-ORCH-TASK-CANON-*.md 2>/dev/null | wc -l
# Expected: >0 (at least one agent wrote ORCH-TASK-CANON decisions)

# journalStore glob reads per-agent file
curl -s http://localhost:3000/api/orchestration | jq '.decisions.by_task | to_entries | .[0]'
# Expected: {key: "TASK_ID", value: [{taskId: "TASK_ID", what_done: "...", ...}]}

# Decisions mapped to a done task
curl -s http://localhost:3000/api/orchestration | jq '.task_board.done[] | select(.id == "AF-ORCH-F1A-F4") as $task | . + {has_decision: ($task.id as $id | true)}'
# Expected: Non-empty if AF-ORCH-F1A-F4 is in decisions.by_task
```

---

## Acceptance Checklist

- [ ] Phase 1: SSOT Validation
  - [ ] All done[] tasks have `id` field
  - [ ] No freeform status variants remain
  - [ ] Nested container removed
  - [ ] Count is 71 (66 + 6 - 1)

- [ ] Phase 2: API Serving
  - [ ] `/api/orchestration` returns 200 with valid JSON
  - [ ] `.task_board.done` is an array with ≥1 element
  - [ ] `.counts.done` matches `.task_board.done | length`
  - [ ] At least one known task (FIX-VPS-SSC-CURL-SCRAPER) present in done[]
  - [ ] `.decisions.by_task` has ≥1 entry

- [ ] Phase 3: Dashboard Rendering
  - [ ] Orchestration tab loads (no 500 errors)
  - [ ] Done group shows non-zero count
  - [ ] At least one task card visible under Done
  - [ ] Clicking accordion on a task with journal entries expands STEP blocks
  - [ ] No console errors; markup valid

- [ ] Phase 4: Decision-Journal Flow
  - [ ] Per-agent journal file(s) written for ORCH-TASK-CANON sprint
  - [ ] journalStore glob successfully reads per-agent file
  - [ ] Decisions map to at least one done task visible on dashboard

---

## Test Data / Fixtures

- **Live SSOT:** `docs/data/orch/orch-state.json` (post-F1B migration)
- **Live API:** `http://localhost:3000/api/orchestration` (post-F2 REBUILD)
- **Live Dashboard:** `http://localhost:3001/dashboard/orchestration` (post-F3 REBUILD)

---

## Risk / Known Issues

1. **Timing:** All 4 prior tasks must be committed + rebuilt before QA runs. If any is skipped, QA fails.

2. **Journal entries:** If F4 doesn't produce per-agent journal files (e.g., agent-father doesn't write to ORCH-TASK-CANON sprint journal), Phase 4 shows empty. This is OK — the journal is optional; the core flow (SSOT → API → dashboard) still works.

3. **Container state:** If mcp-server or frontend containers restart during QA, they must pick up the latest rebuilt images (verify image ID post-build).

4. **Decision-journal SKILL:** If the SKILL per-agent path fix (F4) is incomplete, journal files won't be written. Verify SKILL has `${AGENT_ID}` variable before F4 commits.

---

## Commit Message

```
test(qa): ORCH-TASK-CANON QA — live end-to-end verification

- SSOT: canonical schema applied (no freeform status, id field present, nested container flattened)
- API: /api/orchestration serves .task_board.done[] + counts.done accurate
- Dashboard: done group renders non-empty, accordion shows journal entries
- Decision-journal: per-agent files readable via glob, decisions joined to tasks
- 4-phase verification: SSOT → API → Dashboard → Journal flow
```

---

## Sign-Off

QA approves when:
1. All 4 prior tasks committed + verified live
2. All checklist items green
3. At least one done task with journal entries visible on dashboard
4. No console errors or crashes

**Status:** PENDING (depends on F1a-F4, F1B, F2, F3 completion)
