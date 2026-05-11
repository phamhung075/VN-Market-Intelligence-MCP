# TASK JANITOR-1821b — Wire smartCompactSpawner via MCP tool `smart_compact`

**Sprint:** 1821b
**Type:** Feature (additive wiring — no scheduler, no domain changes)
**Owner:** developer
**Estimate:** ~1.5h
**Branch:** `task/JANITOR-1821b-smart-compact-tool`

---

## Context

`apps/mcp-server/src/infrastructure/agents/smartCompactSpawner.ts` was created and left untracked (no caller, no MCP surface). This task wires it into the MCP tool registry via a new `smart_compact` tool. Additive only — zero changes to existing files except two targeted additions.

---

## Files to touch

| Action | Path |
|--------|------|
| READ only — no change | `apps/mcp-server/src/infrastructure/agents/smartCompactSpawner.ts` |
| CREATE | `apps/mcp-server/src/interface/mcp/tools/system/smartCompactTool.ts` |
| MODIFY | `apps/mcp-server/src/interface/mcp/tools/system/index.ts` |
| MODIFY | `apps/mcp-server/src/interface/mcp/tools/registry.ts` |
| CREATE | `apps/mcp-server/src/__tests__/1821b-smart-compact-tool.test.ts` |

---

## Step-by-step

### Step 1 — Create `smartCompactTool.ts`

Create `apps/mcp-server/src/interface/mcp/tools/system/smartCompactTool.ts`.

Pattern: follow `vpsServiceRestartTool.ts` exactly (module-level JSDoc, named export `registerSmartCompactTool`, one `server.tool()` call, return `{ content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }`).

Tool name: `smart_compact`
Description: `"Summarize the latest Claude session JSONL and write a compact memory file. Pass sessionPath to target a specific file, or omit to use the most recent session."`

Parameters (zod):
```typescript
{
  sessionPath: z.string().optional().describe("Absolute path to a .jsonl session file. Omit to auto-detect the latest session.")
}
```

Handler body:
```typescript
const result = await spawnSmartCompact(sessionPath);
```

Import:
```typescript
import { spawnSmartCompact } from "../../../../infrastructure/agents/smartCompactSpawner.js";
```

### Step 2 — Add barrel export to `system/index.ts`

Append one line after the last existing export:
```typescript
export { registerSmartCompactTool } from "./smartCompactTool.js";
```

### Step 3 — Register in `registry.ts`

Add import at the end of the import block (after `registerVpsServiceRestartTool`):
```typescript
import { registerSmartCompactTool } from "./system/smartCompactTool.js";
```

Add registration at the end of the `toolRegistry` array (after `registerVpsServiceRestartTool`):
```typescript
  registerSmartCompactTool,             // Task JANITOR-1821b: smart_compact (+1 → 118)
```

### Step 4 — Create smoke tests

Create `apps/mcp-server/src/__tests__/1821b-smart-compact-tool.test.ts`.

Two tests — no I/O, no spawning, pure unit:

**Test 1** — `registerSmartCompactTool` is a function (import guard):
```typescript
import { registerSmartCompactTool } from "../interface/mcp/tools/system/smartCompactTool.js";
it("registerSmartCompactTool is a function", () => {
  expect(typeof registerSmartCompactTool).toBe("function");
});
```

**Test 2** — `spawnSmartCompact` returns `{ success: false }` when session file path is a non-existent path:
```typescript
import { spawnSmartCompact } from "../infrastructure/agents/smartCompactSpawner.js";
it("spawnSmartCompact returns success:false for missing session file", async () => {
  const result = await spawnSmartCompact("/tmp/__nonexistent_session_1821b__.jsonl");
  expect(result.success).toBe(false);
  expect(typeof result.error).toBe("string");
});
```

Use the standard test file header from dev-standards.md. Preload from `setup.ts` handles DB_PATH.

---

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-1 | `bun tsc --noEmit` exits 0, no new type errors |
| AC-2 | `bun test 1821b` — 2 tests pass, 0 fail |
| AC-3 | Full suite `bun test` — 8563+ pass, 0 new failures vs baseline |
| AC-4 | `smart_compact` name appears as a string literal in `registry.ts` tool array comment |
| AC-5 | `registerSmartCompactTool` is present in the `toolRegistry` array in `registry.ts` |
| AC-6 | `smartCompactSpawner.ts` is reachable via import chain: `registry.ts` → `smartCompactTool.ts` → `smartCompactSpawner.ts` |
| AC-7 | No scheduler entry added — `smart_compact` is MCP-only, not cron |
| AC-8 | Tool count comment in registry reflects 118 tools |

---

## Constraints

- No changes to `smartCompactSpawner.ts` itself — the file is correct as-is.
- No cron/scheduler entry — explicitly excluded by architect protocol.
- Import paths use `.js` extension (ESM), never `.ts`.
- `Bun.env` not `process.env` for any new env reads (none needed here).
- Return format: `{ content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }` — exact shape, no deviations.

---

## Commit message

```
task(JANITOR-1821b): wire smartCompactSpawner via MCP tool smart_compact

- CREATE smartCompactTool.ts (interface layer wrapper)
- ADD barrel export to system/index.ts
- ADD import + registration in registry.ts (118th tool)
- CREATE 1821b smoke tests (2 pass)
```

---

## Report

On completion, write `reports/TASK_REPORT_JANITOR-1821b.md` with: files changed, test results, tsc result, tool count confirmed.
