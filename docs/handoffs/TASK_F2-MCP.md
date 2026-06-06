# TASK_F2-MCP — TypeScript Interface Rename + Done[] Serving + Journalstore Glob

**Sprint:** ORCH-TASK-CANON  
**Owner:** dev-mcp-server  
**Type:** SPRINT-S  
**Status:** TODO  
**Created:** 2026-06-06T21:00:00Z  
**Zone:** `apps/mcp-server/src/`  
**Size:** L  
**Priority:** high  
**Depends:** [`AF-ORCH-F1B`]

---

## Summary

TypeScript-side changes to align with F1B migration. Rename `OrchStateTaskBoardTask` interface field from `task_id: string` (mandatory) to `id: string` (mandatory) with legacy `task_id?: string` optional-only. Add `.task_board.done?: OrchStateTaskBoardTask[]` support. Update `buildOrchestrationDto()` to project done[] to the DTO. Implement journalStore.ts glob reader for per-agent decision journal files. Tests + container REBUILD. All changes depend on F1B migration being merged and verified.

---

## Files to Modify

### apps/mcp-server/src/infrastructure/orchStateStore.ts

**Lines 49–83** (`OrchStateTaskBoardTask` + `OrchStateTaskBoard` interfaces)

1. **Rename canonical field:**
   ```ts
   // BEFORE
   export interface OrchStateTaskBoardTask {
     task_id: string;   // mandatory
     id?: string;       // legacy optional
     // ... rest
   }

   // AFTER
   export interface OrchStateTaskBoardTask {
     id: string;         // mandatory — canonical
     task_id?: string;   // legacy-tolerance only (read path)
     // ... rest
   }
   ```

2. **Add optional new fields:**
   ```ts
   export interface OrchStateTaskBoardTask {
     // ... mandatory + optional above ...
     status_note?: string;    // freeform status detail
     created_at?: string;     // when task created
     closed_at?: string;      // when task reached terminal status
     sprint?: string;         // sprint ID
     priority?: string;       // high/medium/low
     size?: string;           // XS/S/M/L/XL
     type?: string;           // FIX, SPIKE, etc
     files?: string[];        // touched files
     depends?: string[];      // dependency task IDs
     note?: string;           // detailed notes
   }
   ```

3. **Add done[] array to OrchStateTaskBoard:**
   ```ts
   export interface OrchStateTaskBoard {
     // ... existing fields (active_sprints[]) ...
     done?: OrchStateTaskBoardTask[];  // optional, defaults to []
   }
   ```

4. **Add JSDoc comment block** above `OrchStateTaskBoardTask`:
   ```ts
   /**
    * Canonical task row schema for docs/data/orch/orch-state.json.
    * 
    * Authority: This interface is the machine-readable SSOT for task structure.
    * Human-readable reference: docs/standards/task-schema.md
    * 
    * Mandatory fields: id, title, owner, status, zone, created_at
    * Optional fields: task_id (legacy), status_note, closed_at, sprint, priority, size, type, files, depends, note, commit
    * 
    * Closed status enum (no freeform variants):
    *   TODO | IN_PROGRESS | REVIEW | DONE | BLOCKED | CANCELLED | DEFERRED
    * 
    * Banned fields (never written): desc, label, summary, resolved_id, task_id (as write target)
    * 
    * Post-F1B migration, all .task_board.done[] and .task_board.active_sprints[].tasks[] rows use
    * 'id' as the canonical field (not 'task_id'). The projectTask() function coalesces
    * id || task_id for backward-compat reading.
    */
   ```

### apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts

**Lines 62–86** (OrchTaskDto + OrchTaskBoardDto interfaces) **+ Lines 143–159** (projectTask) **+ Lines 232–296** (buildOrchestrationDto)

1. **Update OrchTaskDto** to include optional new fields:
   ```ts
   export interface OrchTaskDto {
     id: string;
     title: string;
     owner?: string;
     status?: string;
     zone?: string;
     type?: string;
     size?: string;
     priority?: string;
     status_note?: string;      // NEW
     created_at?: string;       // NEW
     closed_at?: string;        // NEW
     depends?: string[];
     note?: string;
     files?: string[];
     commit?: string;
   }
   ```

2. **Update OrchTaskBoardDto** to include done[] array:
   ```ts
   export interface OrchTaskBoardDto {
     active_sprints?: OrchSprintDto[];
     done?: OrchTaskDto[];         // NEW
   }
   ```

3. **Update projectTask()** (L143–159) to pass through new fields:
   ```ts
   function projectTask(task: OrchStateTaskBoardTask): OrchTaskDto {
     return {
       id: task.id || task.task_id || "",
       title: task.title || "",
       owner: task.owner,
       status: task.status,
       zone: task.zone,
       type: task.type,
       size: task.size,
       priority: task.priority,
       status_note: task.status_note,        // NEW
       created_at: task.created_at,          // NEW
       closed_at: task.closed_at,            // NEW
       depends: task.depends,
       note: task.note,
       files: task.files,
       commit: task.commit,
     };
   }
   ```

4. **Update buildOrchestrationDto()** (L232–296) to project done[] from SSOT:
   ```ts
   // Add after active_sprints projection (around L280):
   const doneTasks = (taskBoard.done ?? [])
     .flatMap((task) => {
       // Flatten nested containers (if any remain)
       if (task.id === "ORCH-DASH-DECISION-DRILLDOWN" && task.children) {
         return task.children.map(projectTask);
       }
       return [projectTask(task)];
     });

   // Update buildOrchestrationDto return:
   return {
     task_board: {
       active_sprints: sprints,
       done: doneTasks,  // NEW
     },
     counts: {
       in_progress: inProgress,
       backlog: backlog,
       done: doneTasks.length,  // CHANGED: source is now done[].length, not active_sprint DONE count
     },
     // ... rest
   };
   ```

5. **Replace countTasksFromTaskBoard contribution to counts.done:**
   - Old: `counts.done = (count from activeTasksWithStatus("DONE"))`
   - New: `counts.done = (taskBoard.done ?? []).length`
   - The `countTasksFromTaskBoard()` function itself is unchanged for `inProgress` and `backlog` — only the `done` contribution source changes.

### apps/mcp-server/src/infrastructure/journalStore.ts

**Lines 284–300** (getDecisionsForSprints)

Replace single-file lookup with glob reader:

```ts
export async function getDecisionsForSprints(
  sprintIds: string[],
  decisionsDir: string = DECISIONS_DIR
): Promise<DecisionsByTask> {
  const result: DecisionsByTask = { by_sprint: {}, by_task: {} };

  for (const sprintId of sprintIds) {
    // Glob pattern: sprint-${sprintId}*.md (matches both sprint-S1.md and sprint-S1-agent-id.md)
    const pattern = `sprint-${sprintId}`;
    let files: string[] = [];
    
    try {
      files = readdirSync(decisionsDir)
        .filter((name) => name.startsWith(pattern) && name.endsWith(".md"))
        .sort();
    } catch (e) {
      // Directory doesn't exist or no permissions — return empty
      continue;
    }

    const decisions: JournalStep[] = [];
    const mtimeByFile: Record<string, number> = {};

    for (const file of files) {
      const filePath = path.join(decisionsDir, file);
      
      // Check mtime cache (existing logic)
      try {
        const stat = statSync(filePath);
        const cached = mtimeCache.get(filePath);
        if (cached && cached.mtime === stat.mtime.getTime()) {
          // Use cached parse result
          decisions.push(...cached.steps);
          mtimeByFile[filePath] = stat.mtime.getTime();
          continue;
        }
        mtimeByFile[filePath] = stat.mtime.getTime();
      } catch {
        continue;
      }

      // Parse file
      try {
        const content = readFileSync(filePath, "utf-8");
        const parsed = parseJournalFile(content, sprintId);
        decisions.push(...parsed.steps);
        
        // Cache
        mtimeCache.set(filePath, {
          mtime: mtimeByFile[filePath]!,
          steps: parsed.steps,
        });
      } catch (e) {
        console.warn(`Failed to parse journal file ${filePath}: ${e}`);
      }
    }

    // Index by sprint and by task
    result.by_sprint[sprintId] = decisions;
    for (const step of decisions) {
      if (step.taskId) {
        if (!result.by_task[step.taskId]) {
          result.by_task[step.taskId] = [];
        }
        result.by_task[step.taskId].push(step);
      }
    }
  }

  return result;
}
```

**Key changes:**
- `readdirSync` glob: match files starting with `sprint-${sprintId}` (covers both legacy `sprint-S1.md` and new `sprint-S1-agent-id.md`)
- Multi-file loop: parse all matching files and merge their steps
- mtime cache per file: each file cached independently
- Back-compat: legacy single-file names (`sprint-${id}.md` no agent suffix) are still matched and read

### apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.test.ts

**Add unit tests:**

1. **buildOrchestrationDto with done[] present:**
   ```ts
   test("buildOrchestrationDto projects done[] from task board", () => {
     const state: OrchState = {
       // ... setup ...
       task_board: {
         active_sprints: [],
         done: [
           {
             id: "T1",
             title: "Done task 1",
             owner: "dev",
             status: "DONE",
             zone: "apps/test/",
             created_at: "2026-06-01T00:00:00Z",
           },
         ],
       },
     };
     const dto = buildOrchestrationDto(state);
     expect(dto.task_board.done).toHaveLength(1);
     expect(dto.task_board.done[0]?.id).toBe("T1");
     expect(dto.counts.done).toBe(1);
   });
   ```

2. **buildOrchestrationDto with done absent (optional field):**
   ```ts
   test("buildOrchestrationDto handles missing done[] gracefully", () => {
     const state: OrchState = {
       // ... setup ...
       task_board: {
         active_sprints: [],
         // done field absent
       },
     };
     const dto = buildOrchestrationDto(state);
     expect(dto.task_board.done).toEqual([]);
     expect(dto.counts.done).toBe(0);
   });
   ```

3. **projectTask with new fields:**
   ```ts
   test("projectTask includes new canonical fields", () => {
     const task: OrchStateTaskBoardTask = {
       id: "T1",
       title: "Test",
       owner: "dev",
       status: "DONE",
       zone: "apps/test/",
       created_at: "2026-06-01T00:00:00Z",
       status_note: "Pending verification",
       closed_at: "2026-06-02T00:00:00Z",
     };
     const dto = projectTask(task);
     expect(dto.status_note).toBe("Pending verification");
     expect(dto.created_at).toBe("2026-06-01T00:00:00Z");
   });
   ```

4. **journalStore.ts glob reader (in journalStore.test.ts):**
   ```ts
   test("getDecisionsForSprints reads multiple files per sprint", async () => {
     // Setup: create sprint-S1.md + sprint-S1-dev.md in test dir
     // Call: getDecisionsForSprints(["S1"], testDir)
     // Expect: decisions from both files merged
   });
   ```

---

## Acceptance Criteria

1. **TypeScript compilation:** `tsc --noEmit` in `apps/mcp-server/` = 0 errors

2. **projectTask coalesce:** 
   - `projectTask({id: "T1"})` returns DTO with `id: "T1"` (canonical)
   - `projectTask({task_id: "T2"})` returns DTO with `id: "T2"` (legacy fallback)
   - `projectTask({id: "T3", task_id: "T4"})` returns `id: "T3"` (id preferred)

3. **buildOrchestrationDto:**
   - Input state with `done: [...]` → output DTO with `task_board.done[0].id` present
   - Input state without `done` → output DTO with `task_board.done: []`
   - `counts.done` equals `done[].length`

4. **journalStore glob:**
   - Directory with `sprint-S1.md` + `sprint-S1-dev.md` → both files parsed + steps merged
   - Directory with legacy `sprint-S1.md` only → backward-compat works (mtime cache per file)
   - Empty directory → graceful empty result

5. **Unit tests:**
   - 25+ new tests in orchestrationHandler.test.ts + journalStore.test.ts
   - All tests pass with 0 fails
   - No regression in existing tests (>160 existing should still pass)

6. **Live AC after REBUILD:**
   ```bash
   curl http://localhost:3000/api/orchestration | jq '.task_board.done | length'
   # Should return a number (count of done tasks from migrated F1B)
   
   curl http://localhost:3000/api/orchestration | jq '.task_board.done[0].id'
   # Should return a string task ID (not null)
   
   curl http://localhost:3000/api/orchestration | jq '.counts.done'
   # Should equal the length of .task_board.done[]
   ```

---

## Build Standard

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: Rebuild mcp-server container after TypeScript changes.
```

---

## Commit Message

```
feat(mcp-server): ORCH-TASK-CANON F2 — canonical task schema interface + done[] serving + journalStore glob

- Rename OrchStateTaskBoardTask field: task_id → id (mandatory); task_id now legacy-optional only
- Add optional new fields: status_note, created_at, closed_at, sprint, priority, size, type, files, depends, note
- Add OrchStateTaskBoard.done?: OrchStateTaskBoardTask[] (optional, defaults to [])
- Add JSDoc authority declaration linking to docs/standards/task-schema.md
- Update buildOrchestrationDto() to project done[] from task_board (new done: OrchTaskDto[] in DTO)
- Update counts.done to source from (taskBoard.done ?? []).length (not active_sprint DONE count)
- Implement journalStore.ts glob reader: sprint-${id}*.md pattern (per-agent + legacy back-compat)
- Update projectTask() to pass through new canonical fields
- Add 25+ unit tests (orchestrationHandler + journalStore)
- TypeScript: 0 errors after rename (coalesce logic preserved)
```

---

## Handoff Notes

- F1B migration MUST be merged and verified before starting this task. JSON data must already be in canonical form.
- Container REBUILD required after merge (TypeScript changes).
- Live verification: curl `/api/orchestration` and verify done[] projection + counts.done correctness.
- F3 frontend depends on this REBUILD being live-verified before it ships.
