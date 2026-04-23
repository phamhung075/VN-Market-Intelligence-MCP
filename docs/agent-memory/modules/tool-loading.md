---
agents: architect, developer, ba
trigger: tool-loading, skill-manifest, context-optimization
---

# Module: Tool Loading (Sprint 1299)

Status: NEW — 2026-04-23

---

## Purpose

Documents the skill-gated tool loading system introduced in Sprint 1299 to reduce per-agent MCP context from ~65k tokens to <30k tokens.

---

## Design Decisions

### Where SKILL_MANIFEST lives

SKILL_MANIFEST is a static TypeScript const inside `src/interface/mcp/bootstrap/agentBootstrap.ts` (interface layer). It is NOT in `domain/` or `infrastructure/`.

Rationale: SKILL_MANIFEST maps MCP tool names — an interface/infrastructure concept — to skills. Placing it in `domain/` would violate DDD (domain must not know MCP tool names). Interface layer is the correct home.

Human-readable SSOT: `docs/SKILL_MANIFEST.md` (JSON block).
Runtime twin: the TypeScript const in `agentBootstrap.ts` — developer maintains sync manually.

### Why static const, not database

Manifest changes only when a new tool is added or a skill is defined. Both are code-review-gated. Static const = zero latency, zero infra, version-controlled. Runtime config drift risk eliminated.

### digest_predict trim

digest_predict trimmed from ~52 → 49 tools to hit the <30k token target.

Tools removed:

| Tool | Reason |
|------|--------|
| `read_telegram_reports` | Dev-team internal. Analysis agent has no use case |
| `get_agent_work_log` | Dev-team internal audit. Analysis agent has no use case |
| `get_label_accuracy_report` | QA-specific calibration. `get_calibration_report` is the correct tool |

### Always-on tools (7)

Injected into every resolved tool set regardless of skill:
`get_cycle_bootstrap`, `submit_feedback`, `get_recent_fixes`, `log_agent_work`, `send_telegram`, `post_agent_signal`, `get_agent_signals`

### Session cache placement

`SessionToolCache` (LRU, TTL 8h, max 100 sessions) lives in `src/infrastructure/cache/sessionToolCache.ts`. It is called from `server.ts` (interface layer) — NOT from `agentBootstrap.ts` — to keep bootstrap pure config with no infra dependency.

Cache is pure in-memory (no disk I/O). Not on SSE request path. Read/write <1ms.

---

## Loading Flow

```
Claude client request → server.ts createMcpServerInstance(skills?)
  → if skills provided: agentBootstrap.getToolsForSkills(skills)
      → resolve SKILL_MANIFEST[skill] for each skill name
      → union result sets + always-on tools
      → deduplicate (Set)
      → filter against toolRegistry (skip missing)
      → return ToolRegistryFn[]
  → if no skills: toolRegistry (all 107, unchanged — backwards compat)
  → server.ts: fns.forEach(fn => fn(server))
  → sessionToolCache.set(sessionId, { skills, toolNames, loadedAt })
```

Edge cases:
- Unknown skill → warn to console + fallback full toolRegistry
- `skills: []` → always-on tools only (~7 tools)
- Tool in manifest but not in registry → silently skip

---

## Token Targets

| Skill | Tools | Target tokens |
|-------|-------|---------------|
| news_scout | 14 | ~8.4k |
| financial_analyst | 24 | ~14.4k |
| market_watcher | 26 | ~15.6k |
| alert_commander | 19 | ~11.4k |
| digest_predict | 49 | ~29.4k |
| dev_team | 9 | ~5.4k |
| qa_responder | 14 | ~8.4k |
| unified_coordinator | 40 | ~24k |
| All skills | — | <30k |

Baseline: 107 tools × ~600 tokens = ~65k. Best case reduction: -85% (dev_team).

---

## DDD Risk: Forbidden Imports in agentBootstrap.ts

`agentBootstrap.ts` MUST NOT import from:
- `../../domain/...` — domain has no MCP knowledge
- `../../infrastructure/...` — bootstrap is pure config

Allowed imports: `../tools/registry.js` (same interface layer), `@modelcontextprotocol/sdk`, Node built-ins.

Test `src/__tests__/1299b-bootstrap.test.ts` includes a static import check to enforce this invariant.

Pattern reference: `docs/agent-memory/patterns/DDD-violations.md` (recur=7x, severity=High)

---

## File Map

| File | Layer | Role |
|------|-------|------|
| `docs/SKILL_MANIFEST.md` | docs | Human-readable SSOT — JSON block + per-skill detail |
| `docs/TOOL_INDEX.md` | docs | 107-tool reference index by category |
| `src/interface/mcp/bootstrap/agentBootstrap.ts` | interface | Runtime SKILL_MANIFEST const + getToolsForSkills() |
| `src/interface/mcp/server.ts` L130–137 | interface | createMcpServerInstance(skills?) modification |
| `src/infrastructure/cache/sessionToolCache.ts` | infrastructure | LRU session tool cache |
| `src/scheduler/system/trackSessionToolUsageJob.ts` | scheduler | 8h cron: writes tool-usage-stats.json |
| `docs/agent-memory/modules/tool-usage-stats.json` | data | Per-tool session usage counts (written by cron) |

---

## Known Issues

None at creation. Verify after 1299b that import-check test passes and all 9 skills resolve non-empty tool lists.

---

## Next Tasks

- 1299b: Implement `agentBootstrap.ts` + `server.ts` modification + tests
- 1299c: Implement `SessionToolCache` + `trackSessionToolUsageJob` + cron registry update
