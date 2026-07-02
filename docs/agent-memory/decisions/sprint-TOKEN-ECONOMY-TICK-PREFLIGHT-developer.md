# Decision Journal — Sprint TOKEN-ECONOMY-TICK-PREFLIGHT · developer

**Sprint goal:** Eliminate 80k tokens/hour idle burn from recurring cron ticks by moving deterministic MCP orchestration steps from LLM narration into shell scripts.

**Agent:** developer
**Started:** 2026-07-02T11:52:00Z

---

### STEP developer-S1 · developer · 2026-07-02T13:05:00Z
**task-id:** TOKEN-ECONOMY-TICK-PREFLIGHT-WU-1
**what-done:** Built `scripts/agents-flow/mcp-call.sh` (shared JSON-RPC-over-curl helper, live-verified against real mcp-server) + `scripts/agents-flow/cowork-tick-preflight.sh` (Steps 1-8, verdicts SILENT/WORK/LOST_ELECTION/DEFER/ERROR). Modified `docs/agents/cowork-team/flow/main.md` (new Step 0 + JUMP-TO table + explicit WORK-continuation mapping; original Steps 0a-4b kept verbatim as ERROR fallback). Annotated `leader-lock.md`/`blind-guard.md`/`match-slots.md`. Deleted dead `cowork-tick-autosilent.sh` (R5). 20/20 mocked regression tests pass (`cowork-tick-preflight.test.sh`); shellcheck clean at warning severity.

**what-considered:**
- **AC-1 naming typo:** spec bullet says `mpc_call`/`$MPC_HTTP_URL`; every other section (Design Spec, architect brief) says `mcp_call`/`$MCP_HTTP_URL`. Used the consistent name (file is `mcp-call.sh`) — treated as a typo, not a literal requirement.
- **R2 field list vs live schema:** handoff says `one_shots[]` needs `{id,team,agent,intent,prompt,deadline_at,zone}` — `zone` does not exist on `ScheduledTaskRow` (verified `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:941`). Passed through the FULL claimed object unmodified instead of hand-picking fields — satisfies R2's actual intent (don't orphan claimed rows) more robustly than a stale field list would.
- **Step 7 signal_queue schema:** spec pseudocode filters `route_to=="cowork-team"` — that field doesn't exist. Live schema (confirmed `orch-state.json` + `main.md` Step 0a) is `.signal_queue.rows[] | select(.to)` with `to ∈ {po, tran-ngoc-bau, unified-agent, alert-commander}`. Implemented against the real schema.
- **Step 8 `pressure_mode`:** spec pseudocode reads `.pressure_mode` from `pressure-state.json` — that key doesn't exist in the tool's 9-key `PressureState` schema (`emitPressureStateTool.ts`). Passed `"unknown"` (R3 safe-default spirit extended to this field; confirmed the arg is inert server-side — not persisted, tracing-only).
- **WORK-continuation mapping:** brief's JUMP-TO table only says "Continue at Step 4.2 (signal drain, slot fan-out, spawn, emit, release)" — too vague to preserve R2/R4 correctness (one-shot routing + real signal drain must still run, matcher/claim_due must NOT re-run). Wrote an explicit 4-point mapping in main.md instead of the terse one-liner from the brief.
- Testing: mocked `mcp_call` via function-override after `source`-ing the script (guarded by `[[ BASH_SOURCE == 0 ]]` so sourcing doesn't auto-execute) — avoids any real `claim_due_scheduled_tasks`/`emit_pressure_state` side effects per handoff instruction. Live-verified only `mcp-call.sh`'s transport/SSE-parse against `task_list_held` (read-only) + an unknown-tool call (confirms the live `isError` shape from the architect brief).
- Found and fixed a real bash bug while live-testing: `"${var:-{}}"` (parameter-expansion default of literal `{}`) corrupts to `{}}` due to bash's brace-parsing — split into two-step default assignment (`"${var:-}"` then explicit `[ -z ] && var='{}'`) in both the CLI wrapper and `mcp_call()` itself.

**why-decision:** Brownfield reality (live schema, real tool signatures, live-tested transport) takes precedence over the brief's prose pseudocode wherever they conflict — CLAUDE.md "fix root cause" + dev-standards "verify SERVING value" both point the same way. All deviations are narrow (field lists / variable names), not architectural — the Steps 1-8 / verdict / lock-semantics design is implemented as specified.

**why-change:** No change from PM/architect plan at the design level. Implementation-detail corrections only, documented above so QA/WU-2 don't re-trip on the same brief inaccuracies.

---
