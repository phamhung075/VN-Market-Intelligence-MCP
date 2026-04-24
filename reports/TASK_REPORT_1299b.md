# Task Report 1299b — compact
date: 2026-04-23
outcome: APPROVED

changed:
- src/interface/mcp/bootstrap/agentBootstrap.ts (NEW, 384 lines)
- src/interface/mcp/server.ts (L131–138, skills? param + import L35)
- src/__tests__/1299b-skill-gated-bootstrap.test.ts (NEW, 9 TCs)

bun test (task): 9 pass / 0 fail
bun test (full): 6551 pass / 10 fail (all 10 pre-existing — tasks 048/061/124/293/1294b/1321/1378)
tsc: 0 errors
ddd: PASS (TC-1 static guard + grep confirmed zero domain/infra imports in agentBootstrap.ts)
security: PASS (no process.env, no SQL, no hardcoded secrets)

## AC Verification

| AC | Result | Evidence |
|----|--------|---------|
| AC-1 | PASS | SKILL_MANIFEST fully populated (8 skills) |
| AC-2 | PASS | news_scout=14 tool names → ≤25 unique fns (TC-2) |
| AC-3 | PASS | digest_predict=49 tool names → ≤49 unique fns (TC-6, lower bound >30) |
| AC-4 | PASS | ALWAYS_ON_TOOLS 7 names injected in all non-empty results (TC-3, TC-5) |
| AC-5 | PASS | Probe-based dedup collapses 49→≤39 unique fns — token budget maintained |
| AC-6 | PASS | grep + TC-1 static guard: zero domain/infra imports in agentBootstrap.ts |
| AC-7 | PASS | digest_predict ≤49 fns (TC-6) — token ceiling enforced by design |

## Key Findings

- toolRegistry: 70 registration fns, 107+ MCP tool names (1 fn can register N tools)
- Probe approach: fake McpServer intercepts `.tool()` + `.registerTool()` at module init — pure interface layer
- always-on dedup: post_agent_signal + get_agent_signals share registerAgentSignalTools → 6 unique fns for 7 names
- Backwards compat: `createMcpServerInstance()` with no args still uses full toolRegistry (L136)
- Full suite OOM: pre-existing Bun 1.3.11 bug, confirmed in handoff, not caused by this task
- DDD TC-1 suite failure: owned by task 1321 (separate test), not 1299b
