# TASK 1779b — VPS Service Restart Handler + MCP Tool + Registry

**Sprint:** SPRINT-S
**Parent:** 1779 — Add systemctl restart capability to VPS trigger tools
**Branch:** `task/1779b-vps-restart-handler`
**Owner:** developer
**Priority:** high
**Type:** feature
**Estimate:** ~2h
**Depends on:** 1779a merged to main

---

## Context

With the `sshExec` infrastructure layer in place (1779a), this task wires the 3-layer allowlist handler, the MCP tool registration, and the registry entry. The handler is the security gate: it enforces which services may be restarted before calling `sshExec`.

---

## Acceptance Criteria

### Handler — `vpsServiceRestartHandler.ts`

1. File path: `apps/mcp-server/src/interface/mcp/vpsServiceRestartHandler.ts`
2. Exports: `export async function vpsServiceRestartHandler(input: unknown): Promise<McpToolResult>`
3. Three-layer allowlist (reject anything not on the list):
   - **Layer 1 — input validation:** `input` must be `{ service: string }` — reject with `{ error: "invalid input" }` otherwise.
   - **Layer 2 — service allowlist:** only `["price-fetcher", "foreign-flow-fetcher", "bctc-fetcher"]` are permitted — reject unknown service with `{ error: "service not allowed: <name>" }`.
   - **Layer 3 — systemctl allowlist:** command sent to `sshExec` is always the literal template `systemctl restart <allowlisted-service>` — never user-supplied string.
4. On `sshExec` success (`exitCode === 0`): return `{ success: true, service, stdout }`.
5. On non-zero exit: return `{ success: false, service, exitCode, stderr }`.
6. On thrown error: return `{ error: error.message }`.
7. Uses `Bun.env` only, `.js` imports only.

### MCP Tool — `vpsServiceRestartTool.ts`

1. File path: `apps/mcp-server/src/interface/mcp/tools/system/vpsServiceRestartTool.ts`
2. Tool name: `restart_vps_service`
3. Description: `"Restart a named service on the Vinahost VPS via SSH. Allowed: price-fetcher, foreign-flow-fetcher, bctc-fetcher."`
4. Input schema: `{ service: { type: "string", description: "Service name to restart" } }` (required).
5. Returns standard MCP format: `{ content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }`.

### Registry

1. File: `apps/mcp-server/src/interface/mcp/tools/registry.ts`
2. Add exactly one import line for `vpsServiceRestartTool` and one registration call — no other changes.

### Tests

File: `apps/mcp-server/src/__tests__/1779-vps-service-restart.test.ts`

Six tests (no real SSH — mock `sshExec`):
1. Valid service `"price-fetcher"` → calls `sshExec`, returns `{ success: true }`.
2. Valid service `"foreign-flow-fetcher"` → success path.
3. Valid service `"bctc-fetcher"` → success path.
4. Unknown service `"nginx"` → `{ error: "service not allowed: nginx" }`, `sshExec` NOT called.
5. `sshExec` returns `exitCode: 1` → `{ success: false, exitCode: 1 }`.
6. Invalid input (no `service` key) → `{ error: "invalid input" }`.

---

## Files to Create / Modify

```
apps/mcp-server/src/interface/mcp/vpsServiceRestartHandler.ts   [new]
apps/mcp-server/src/interface/mcp/tools/system/vpsServiceRestartTool.ts   [new]
apps/mcp-server/src/__tests__/1779-vps-service-restart.test.ts   [new]
apps/mcp-server/src/interface/mcp/tools/registry.ts   [+1 import +1 line]
```

---

## Risks / Notes

- Handler must import `sshExec` from `"../../infrastructure/vps/sshExec.js"` (DDD layer: interface → infrastructure is allowed via application layer normally, but this is a thin pass-through with no business logic — acceptable exception documented here).
- Do not add a new system subfolder if `system/` already exists under `tools/`; check first.
- Registry line must not break existing tool ordering.

---

## Done When

- [x] All 6 integration tests pass: `bun test src/__tests__/1779-vps-service-restart.test.ts` — 8 pass, 0 fail
- [x] `bun tsc --noEmit` passes with no TypeScript errors
- [ ] `restart_vps_service` appears in tool list when server starts (log check)
- [ ] PR opened against `main` with branch `task/1779b-vps-restart-handler`

## Implementation Notes (developer → qa)

Files created:
- `apps/mcp-server/src/interface/mcp/vpsServiceRestartHandler.ts` — three-layer allowlist gate
- `apps/mcp-server/src/interface/mcp/tools/system/vpsServiceRestartTool.ts` — MCP tool registration
- `apps/mcp-server/src/__tests__/1779-vps-service-restart.test.ts` — 8 tests (6 spec + 2 edge cases)

Files modified:
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — 1 import + 1 array entry

Allowlist (Layer 2): `["price-fetcher", "foreign-flow-fetcher", "bctc-fetcher"]`
Tool name: `restart_vps_service`
sshExec mock strategy: Bun.spawn monkey-patch per test (same pattern as 1779a)
