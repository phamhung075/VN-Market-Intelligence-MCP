---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1975-p1-mcp-3-coordinationtools
size: M
zone: apps/mcp-server/
depends_on: ["TASK_1973"]
blocks: ["TASK_1980"]
---

## TLDR

Add `owner_client_session: z.string().optional()` parameter to the Zod schemas for `task_claim`, `task_heartbeat`, `task_release`, and `task_force_release_orphan` tools. Remove server-side injection of `owner_client_session` from the implementation (lines 52-57 mint `SERVER_SESSION_ID`; keep `owner_session = SERVER_SESSION_ID` as diagnostic only). Thread caller-supplied `owner_client_session` into the store function calls.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Acceptance Criteria:**
  - [ ] `task_claim` tool schema includes `owner_client_session: z.string().optional()` in input Zod schema
  - [ ] `task_heartbeat` tool schema includes `owner_client_session: z.string().optional()`
  - [ ] `task_release` tool schema includes `owner_client_session: z.string().optional()`
  - [ ] `task_force_release_orphan` tool schema includes `owner_client_session: z.string().optional()`
  - [ ] coordinationTools.ts (lines 52-57): server-side minting of `owner_client_session` is REMOVED; keep only `owner_session = SERVER_SESSION_ID` (diagnostic, not for ownership)
  - [ ] Thread caller-supplied `owner_client_session` into each coordinationStore call (claimTask, heartbeatTask, releaseTask, releaseOrphanTask)
  - [ ] Verify via RAW call: a client passes `owner_client_session="my-session-uuid"` → verify it appears in the returned `current_holder.owner_client_session` (and does NOT get overwritten by server-minted value)
  - [ ] Backward-compat: clients that do NOT pass `owner_client_session` still work (matching-ladder falls through to `owner_agent`, per P1-MCP-2)
  - [ ] Commit message lists the four tool schemas modified and references the sprint brief

- **Files to read first:**
  - apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts (entire file, focus on lines 52-57 server-side injection, 113-121 where injection is applied)
  - apps/mcp-server/src/infrastructure/db/coordinationStore.ts — function signatures to understand parameter order
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §8 P1-MCP-3 spec
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §2 (session identity scheme — emphasizes caller supply, not server mint)

- **Files to create:** None
- **Files to modify:**
  - apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts — Zod schemas + implementation
  
- **Dependencies:** TASK_1973 (migration SQL must exist), ideally after TASK_1974 (so matching-ladder is live)
- **Knowledge needed:**
  - `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §2 (session identity scheme) — caller-supplied is acceptable, threat model is cooperative internal agents
  - Zod schema pattern for optional strings: `z.string().optional()`
  - MCP tool schema registration pattern (consult existing coordinationTools.ts for precedent)

## [Developer] Implementation Notes

1. **Remove server-side injection (lines 52-57):**
   - Current code likely has:
     ```typescript
     const SERVER_SESSION_ID = `pid-${process.pid}-ts-${Date.now()}`;
     const ownerSession = SERVER_SESSION_ID;
     ```
   - KEEP this logic for `owner_session` field (diagnostic only)
   - DO NOT inject `owner_client_session` here; let callers supply it

2. **Update Zod schemas for the four tools:**
   - Locate tool input schema definitions (likely in coordinationTools.ts around the tool registration)
   - Add field to each: `owner_client_session: z.string().optional()`
   - Example for `task_claim`:
     ```typescript
     const taskClaimSchema = z.object({
       task_id: z.string(),
       task_kind: z.enum(['sprint-task', 'cowork-slot', 'dashboard-row', 'commit-mutex', 'session-presence']),
       owner_agent: z.string(),
       owner_client_session: z.string().optional(), // NEW
       ttl_seconds: z.number().optional(),
       payload: z.string().optional(),
     });
     ```

3. **Thread into store calls:**
   - For each tool, extract `owner_client_session` from the parsed arguments
   - Pass it to the coordinationStore function
   - Example:
     ```typescript
     const { task_id, task_kind, owner_agent, owner_client_session, ttl_seconds, payload } = args;
     const result = await claimTask(db, {
       taskId: task_id,
       taskKind: task_kind,
       ownerAgent: owner_agent,
       ownerClientSession: owner_client_session, // NEW
       ttlSeconds: ttl_seconds,
       payload: payload,
     });
     ```

4. **Testing locally:**
   ```bash
   docker compose up -d
   
   # Test 1: Pass owner_client_session in claim
   curl -X POST http://localhost/gateway/call-tool \
     -d '{"server":"vn-market","tool":"task_claim","arguments":{"task_id":"test-mcp3-1","task_kind":"sprint-task","owner_agent":"dev-team","owner_client_session":"uuid-aaa-111","ttl_seconds":3600}}'
   
   # Verify response includes current_holder.owner_client_session = "uuid-aaa-111"
   
   # Test 2: Heartbeat with correct owner_client_session
   curl -X POST http://localhost/gateway/call-tool \
     -d '{"server":"vn-market","tool":"task_heartbeat","arguments":{"task_id":"test-mcp3-1","owner_client_session":"uuid-aaa-111"}}'
   
   # Verify: {ok:true}
   ```

---

## AC: RAW-Verify Against LIVE coordination.db

After code lands and container rebuilds:
```bash
# (1) Call task_claim with explicit owner_client_session → verify it appears in response and DB
# (2) Call task_list_held() → verify rows show owner_client_session field populated
# (3) Old calls WITHOUT owner_client_session still work (backward-compat via matching-ladder)
```

## RETURN to PM

Once this task is DONE (QA verified):
- Confirm the four tool schemas accept `owner_client_session` as optional
- Confirm callers can now pass this field and have it thread through to the store
- Unblock TASK_1980 (P1-FINAL) — but only after all AF-* tasks (1976-1979) land so callers are actually passing the field
