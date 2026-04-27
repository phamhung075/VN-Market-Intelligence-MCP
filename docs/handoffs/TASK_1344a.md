# Developer Handoff — Task 1344a: Memory Filesystem Artifacts + mkdirSync Fix

**Sprint:** 1344
**Date:** 2026-04-27
**Task Size:** S (Small)
**Parallel:** YES — 1344a, 1344b, 1344c run concurrently (no shared files)

---

## Summary

Create three missing directories (`manifests/`, `issues/`, `patterns/`) and two fixture files (`ops.md`, `WAL-checkpoint.md`) under `apps/mcp-server/docs/agent-memory/`. Additionally, fix `agentMemoryUpdateTools.ts` to call `mkdirSync` before `writeFileSync` to prevent directory creation failures.

**Failures fixed:** 5 (2 from 1300a-agent-memory-tools, 3 from 1300b-agent-memory-update-tools)

---

## Sub-task A1: Create directories and fixture files

### Step 1: Create directories

```bash
mkdir -p apps/mcp-server/docs/agent-memory/manifests
mkdir -p apps/mcp-server/docs/agent-memory/issues
mkdir -p apps/mcp-server/docs/agent-memory/patterns
```

### Step 2: Create `apps/mcp-server/docs/agent-memory/manifests/ops.md`

Exact content (the table format is parsed by `parseManifestTable` in agentMemoryTools.ts):

```markdown
# Ops Memory Manifest

**Load when:** Health checks, incident response, or VPS troubleshooting.

| Task Type | Load |
|-----------|------|
| health-check, vps-status | issues/WAL-checkpoint.md, modules/scheduler.md |
| incident-response | issues/WAL-checkpoint.md |
| server-restart | issues/WAL-checkpoint.md |
```

### Step 3: Create `apps/mcp-server/docs/agent-memory/issues/WAL-checkpoint.md`

Exact content (YAML front-matter must include the `trigger` field with comma-separated values):

```markdown
---
agents: ops, developer, system-auditor
trigger: server-restart, health-check, db-maintenance
---

# Issue: WAL Checkpoint Missing on SIGTERM

**Status**: FIXED | **Severity**: Critical

## Summary

SQLite WAL checkpoint was not called on SIGTERM, causing potential data loss on container stop.
Fixed in Sprint 1336: named Docker volume replaces bind-mount. macOS Docker VirtualMachine
process no longer tears SHM on container stop.

## Trigger Conditions

- server-restart: Check WAL state before any restart
- health-check: Verify WAL file size is not growing unboundedly
- db-maintenance: Include WAL checkpoint in maintenance window

## Resolution

Sprint 1336 fix: docker-compose uses named volume for SQLite files. Alert-engine.db and
stock_price.db isolated to separate volumes.
```

---

## Sub-task A2: Fix agentMemoryUpdateTools.ts

### File: `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts`

**Change 1 — Line 21: Add `mkdirSync` to fs import**

Look for the line:
```typescript
import { writeFileSync, readFileSync, existsSync } from "fs";
```

Replace with:
```typescript
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
```

**Change 2 — Line 22: Add `dirname` to path import**

Look for the line:
```typescript
import { resolve } from "path";
```

Replace with:
```typescript
import { resolve, dirname } from "path";
```

**Change 3 — Around line 367: Add mkdirSync call before writeFileSync**

Locate the `update_memory_file` tool handler. Find the line:
```typescript
writeFileSync(filePath, fileContent, "utf-8");
```

Replace the single line with:
```typescript
// Ensure parent directory exists before writing
mkdirSync(dirname(filePath), { recursive: true });
writeFileSync(filePath, fileContent, "utf-8");
```

Note: The `append_session_record` tool already has a sessions directory, so only the `update_memory_file` write call needs protection.

---

## Acceptance Criteria

- [ ] `bun test --filter "1300a-agent-memory-tools"` → 5 pass, 0 fail
- [ ] `bun test --filter "1300b-agent-memory-update"` → 13 pass, 0 fail
- [ ] All three directories exist:
  - `apps/mcp-server/docs/agent-memory/manifests/`
  - `apps/mcp-server/docs/agent-memory/issues/`
  - `apps/mcp-server/docs/agent-memory/patterns/`
- [ ] Files created with exact content:
  - `apps/mcp-server/docs/agent-memory/manifests/ops.md` (contains `server-restart` in table)
  - `apps/mcp-server/docs/agent-memory/issues/WAL-checkpoint.md` (contains YAML trigger field)
- [ ] `agentMemoryUpdateTools.ts`:
  - Imports `mkdirSync` from `"fs"`
  - Imports `dirname` from `"path"`
  - Calls `mkdirSync(dirname(filePath), { recursive: true })` before `writeFileSync`

---

## Notes

- **Test isolation:** The 1300b tests write real files to `issues/` and `patterns/`. These persist across runs. Second run overwrites existing files — this is by design and tests still pass.
- **No code logic changes:** This task is purely filesystem artifact creation + one defensive `mkdirSync` guard. No domain logic modified.
- **DDD layer:** Infrastructure (filesystem access) + Interface (tool registration).

---

## Branch

`task/1344a-memory-filesystem-fix`

---

## Return block (when done)

```
DONE: Created memory filesystem directories (manifests/, issues/, patterns/) + fixture files (ops.md, WAL-checkpoint.md) + mkdirSync guard in agentMemoryUpdateTools.ts; 5 failures fixed (1300a: 2, 1300b: 3)
NEXT: [developer] task 1344b
HANDOFF: docs/handoffs/TASK_1344a.md
PIPELINE: continue
```
