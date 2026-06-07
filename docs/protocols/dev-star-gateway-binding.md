# dev-* MCP Gateway Binding — Mechanical Finding + Ruling

**Author:** architect  
**Date:** 2026-06-06  
**Sprint:** WORKFLOW-FLUIDITY (WF-3 SPIKE)  
**Status:** RULING ISSUED  

---

## 1. Mechanical Finding

**Why the binding is absent in dev-* flows.**

Agent sub-agents spawned via `Agent()` DO inherit the MCP tool surface of the spawning session when the session has those tools loaded at spawn time. This is confirmed by: BA (spawned this sprint) called `call_tool` successfully; po used it for the umbrella lock; bctc-analyst/market-watcher use it every cycle.

The gap is NOT a session-inheritance problem. It is a flow-execution-context problem:

1. **Flow pseudo-code vs tool calls.** Dev-* agent flows are written as markdown pseudo-code. A line like `call_tool(server="vn-market", tool="task_claim", ...)` inside a bash block is shell text — it is NOT an MCP tool invocation. MCP calls are tool-calls dispatched by the Claude runtime, not shell commands. A flow's bash block cannot invoke MCP; only the agent's Claude runtime layer can. Flows that describe `call_tool(...)` inside a bash block rely on the agent reading that as an instruction to issue a tool-call at the appropriate step — which works when the agent is running with the gateway in its tool surface.

2. **The real gap: tool package exclusion.** The `developer` tools package (`docs/agents/tools/package/developer.md`) lists ONLY `mcp__semble__search` and `mcp__semble__find_related` as MCP tools. The `mcp__claude_ai_gateway__call_tool` is NOT listed. The dev-* specialist tool packages inherit this omission. When a sub-agent is spawned, the tools available to it are scoped to its registered tool package. If `mcp__claude_ai_gateway__call_tool` is absent from the package, the agent cannot invoke it even if the parent session has it.

3. **Confirmed by memory note.** "dev-* sub-agents still lack the MCP gateway binding → still can't claim directly." The ORCH-TASK-CANON sprint confirmed: agent-father F1B had to run mutex-less as sole writer. BA cycle confirmed it works when the agent IS registered with the gateway.

4. **Flows written as pseudo-code DO work** when the agent has the tool. developer/init.md `spawn_pattern` block uses `call_tool(server="vn-market", ...)` — this works because `developer` (team-lead, not specialist) acts as the dispatcher and its spawner session has gateway access. The inner specialist agents (dev-mcp-server, dev-stock-price, dev-frontend, dev-alert-engine, dev-api-gateway) do NOT inherit the outer dispatcher's tool package.

**Summary:** The binding is absent because dev-* specialist tool packages omit `mcp__claude_ai_gateway__call_tool`. Fix requires adding the tool to specialist packages (WF-3-IMPL) OR codifying that all gateway calls for them route via the outer dispatcher session (Option III).

---

## 2. Ruling — Option III

**Chosen: Option III — Codify session-scoped constraint as enforced invariant.**

**Rationale:** Adding `mcp__claude_ai_gateway__call_tool` to all dev-* specialist packages is the correct long-term fix, but it requires verifying that each specialist session actually has the gateway server loaded (tool-package change alone is not sufficient — the MCP server must be in `.mcp.json` and reachable from that agent's spawn context). That verification is a multi-sprint risk surface. More importantly: the current architecture already works correctly under Option III — the outer dev-team dispatcher holds the sprint-task lock on behalf of its agents (dispatcher-wrap pattern, Phase 4 SHIPPED per task-lock SKILL). The inner agents do NOT need their own task_claim — the outer claim serializes spawning. Inner agents use file-based discipline (.head atomic write) for pipeline-state, which requires NO MCP binding.

Option I (remove outer claim, have inner agents claim directly) introduces Phase 4 regression: the outer claim currently prevents duplicate spawning in multi-router race. Removing it without verified inner-claim fallback is unsafe.

Option II (heartbeat seam) adds complexity over Option III with no liveness gain: TTL=3600s already covers the spawn window; a file-based heartbeat is redundant.

**Invariant (enforced from this ruling forward):**
- All `task_claim` / `task_release` / `task_heartbeat` / `commit-mutex` MCP calls for dev-* specialist agents are the SOLE responsibility of the outer dispatcher session (dev-team/flow or developer team-lead).
- Dev-* specialist flows MUST NOT contain `task_claim` or `task_release` calls — these belong in the dispatcher-wrap layer only.
- Dev-* specialists write `.head` state atomically via jq + temp-file-then-rename (NO MCP required). This is already executable by all agents.
- Fail-loud STOP paths in dev-* specialist flows write `.head idle` atomically (WF-1, AC-WF1-6 — already shipped). They CANNOT call `task_release` directly. The dispatcher-wrap `finally` block (outer session) releases the lock after the spawn returns — this is the correct release point.
- Phase 4 activation (parallel worktree spawns with independent sessions) MUST include gateway binding fix before enabling. This is gated in WF-3-IMPL.

---

## 3. fail-loud-protocol.md Step 0 — No Follow-Up Edit Required

The current step 0 text (added by WF-1, commit 915bc4e5) reads:
> "dev-* agents lack direct MCP gateway binding in the sub-agent context (F-8, pending WF-3 ruling). Until WF-3 is resolved: dev-* agents cannot call task_release directly — rely on TTL expiry (3600s max)."

This is accurate and complete under Option III ruling. The `.head idle` reset block that follows IS executable without MCP. No edits required to fail-loud-protocol.md — the step 0 annotation now references "WF-3 resolved: Option III codified" for future readers.

---

## 4. WF-2 Unblock Answers

### BLOCKER-WF2-A: Exact TS file:line of .signal_queue.rows[] write path

Two call sites:

1. **`apps/mcp-server/src/infrastructure/orchStateStore.ts` L221–249** — `appendSignalQueueRow()`: the single canonical write function. Reads full orch-state, prepends the capped row to `state.signal_queue.rows`, calls `writeOrchStateAtomic()`. No mtime-check or retry loop. This is the insertion point for the WF-2 retry guard.

2. Call sites of `appendSignalQueueRow()`:
   - `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts` L311 — system-auditor improvement proposals.
   - `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` L237 — janitor D4 system_issue rows.

The drain (row status NEW→READ→archive) is done by dev-team cron via jq (flow, not TS). The TS layer is the write path only.

### BLOCKER-WF3-A (WF-2 option choice): Option A — mtime retry

**Chosen: Option A (retry-read-compare, mtime-based, 3 retries).**

**Trade-offs:**

| Dimension | Option A | Option B |
|---|---|---|
| Scope | 1 function edit in orchStateStore.ts | New SQLite table + migration + TS insert path |
| Risk | Low — injectable fn signatures already exist for test isolation | High — breaks single-JSON-SSOT invariant (OSC sprint lesson); two-step deploy |
| Data loss on collision | Rare (max 3 retries then WARN log, signal not lost — survives in memory) | Zero (SQLite WAL) |
| Concurrent writer classes | Still 3 (dev-team jq, improvementSignalWriter, tasksMdJanitorJob) | Reduces to 1 (SQLite) |
| Breaking change | None — `appendSignalQueueRow` signature unchanged | Dashboard read path and all 3 writer call sites must change |
| Collision frequency | Low — :00 every 4h, 2 writers, < 1s window | Same collision handled by WAL |

Option B's benefit (eliminate the write class entirely) is real but the migration cost is disproportionate for the current collision frequency (rare — requires both auditor Tier-2 and cowork-team to fire within the same millisecond rename window). Option A adds ~3 stat calls per write (negligible) and converts a silent data-loss risk into a logged WARN with automatic retry. The retry loop slots cleanly into `appendSignalQueueRow` without changing its injectable signature.

**Implementation target for dev-mcp-server:** Add mtime-compare loop inside `appendSignalQueueRow` (orchStateStore.ts L221) with injectable `statFn` parameter (matches existing injection pattern for testability). See WF-3-IMPL task.

---

## 5. Downstream Handoff

**Named target:** `agent-father` (flow edits — no TS code; dev-* specialist tool packages update) and `dev-mcp-server` (orchStateStore.ts mtime retry — Option A).

See WF-3-IMPL task in WORKFLOW-FLUIDITY sprint backlog.
