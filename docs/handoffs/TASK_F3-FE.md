# TASK_F3-FE — Done-Group Source Swap (board.done vs tasks filter)

**Sprint:** ORCH-TASK-CANON  
**Owner:** dev-frontend  
**Type:** SPRINT-S  
**Status:** TODO  
**Created:** 2026-06-06T21:15:00Z  
**Zone:** `apps/frontend/app/routes/`  
**Size:** S  
**Priority:** high  
**Depends:** [`F2-MCP`]

---

## Summary

Update dashboard orchestration component to use `board.done ?? []` as the authoritative source for done tasks instead of filtering `tasks[]` array with `t.status === "DONE"`. This is an additive data-source swap — no component logic changes, only the source array changes. Must ship AFTER F2 REBUILD is live-verified.

---

## Files to Modify

### apps/frontend/app/routes/dashboard.orchestration.tsx

**Lines 84–88** (TaskBoard interface) **+ Lines 325–343** (TaskBoardPanel component)

1. **Update TaskBoard interface** (L84–88):
   ```ts
   export interface TaskBoard {
     active_sprints?: Sprint[];
     done?: TaskRow[];           // NEW field
   }
   ```

2. **Update TaskBoardPanel component** (L325–343):
   
   **Before:**
   ```tsx
   export function TaskBoardPanel({ board, decisions }: TaskBoardPanelProps) {
     const activeTasks = board.active_sprints?.flatMap((s) => s.tasks ?? []) ?? [];
     const doneTasks = activeTasks.filter((t) => t.status === "DONE");
     
     return (
       <div>
         <div>Active: {activeTasks.length}</div>
         <div>Done: {doneTasks.length}</div>
         {/* ... render doneTasks ... */}
       </div>
     );
   }
   ```

   **After:**
   ```tsx
   export function TaskBoardPanel({ board, decisions }: TaskBoardPanelProps) {
     const activeTasks = board.active_sprints?.flatMap((s) => s.tasks ?? []) ?? [];
     const doneTasks = board.done ?? [];  // NEW: use board.done directly, no filter
     
     return (
       <div>
         <div>Active: {activeTasks.length}</div>
         <div>Done: {doneTasks.length}</div>
         {/* ... render doneTasks (no change to rendering logic) ... */}
       </div>
     );
   }
   ```

3. **Rendering logic:** No changes to how each task is rendered (title, status badge, accordion for decisions, etc.). The rendering code remains identical — only the source array `doneTasks` changes.

4. **Accordion behavior:** If a done task has `decisions.by_task[taskId]`, the accordion still populates (no change). The decision-journal per-agent files from F4 will populate this via journalStore glob in F2.

---

## Acceptance Criteria

1. **TypeScript compilation:** `tsc --noEmit` in `apps/frontend/` = 0 errors (TaskBoard interface updated)

2. **Component renders done[]:**
   - TaskBoard with `done: [{id: "T1", title: "...", ...}]` → done group shows task T1
   - TaskBoard with `done: []` → done group shows "0 done tasks" (empty state)
   - TaskBoard with `done: undefined` → done group shows "0 done tasks" (fallback to [])

3. **No filter fallback:** The code does NOT have a fallback filter like `board.done ?? tasks.filter(t => t.status === "DONE")`. It is purely `board.done ?? []`. If F2 REBUILD is not yet deployed, done group shows empty — correct degraded state (not broken).

4. **Accordion still works:** If a done task has entries in `decisions.by_task[id]`, clicking accordion shows STEP blocks. Verified via SSR markup inspection.

5. **Live AC after REBUILD:**
   ```
   Dashboard open → Orchestration tab → Done group shows N tasks
   (N = count from /api/orchestration .task_board.done)
   
   Click a done task with journal entries → accordion renders STEP fields
   (requires F4 journal rewrite + at least one agent's per-agent journal file written)
   ```

---

## Rollout Order

**STRICT SEQUENTIAL:**
```
F1a+F4 commit ✓
    ↓
F1B migration commit ✓
    ↓
F2 TypeScript + REBUILD ✓ (live-verified: curl /api/orchestration returns done[])
    ↓
F3 REBUILD (this task) — ONLY after F2 is live
```

**Why:** If F3 ships before F2 REBUILD, the dashboard requests done[] but the API doesn't serve it yet (DTO missing the field). The `board.done ?? []` fallback shows empty — which is the correct degraded state (transparent to operator, not a crash). However, we prefer F2 to be live first for full visibility.

---

## Build Standard

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: Rebuild frontend container after TypeScript changes.
```

---

## Commit Message

```
feat(frontend): ORCH-TASK-CANON F3 — done-group source swap (board.done instead of filter)

- Update TaskBoard interface: add optional done?: TaskRow[] field
- Update TaskBoardPanel: derive doneTasks from board.done ?? [] (not tasks filter)
- No fallback filter: empty array on missing done field (correct degraded state)
- No rendering logic changes: same task display + accordion behavior
- TypeScript: 0 errors (TaskBoard interface updated)
```

---

## Handoff Notes

- This task is ADDITIVE (new source field, no breaking changes to rendering).
- MUST ship after F2 REBUILD is live-verified.
- The 71-task count (66 from F1B migration + 6 from flattened ORCH-DASH-DECISION-DRILLDOWN - 1 container) will appear in dashboard done group after deployment.
- If F2 not yet deployed when F3 ships, done group shows empty (not broken) — operator tolerates brief visibility gap.
