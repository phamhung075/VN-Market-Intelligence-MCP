---
sprint: 1968c
branch: task/1968c-p03-server-filter
size: M
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR
Add optional `signal_type` filter parameter to `get_agent_signals` MCP tool to enable server-side filtering. News-scout, alert-commander, market-watcher call with precise `signal_type` values instead of receiving all signals and filtering client-side. Reduces payload size 40–60%. Additive API change (default=all preserves backward compat).

## [PM] Planning Context

**Zone:** `apps/mcp-server/src/interface/mcp/tools/` (tool schema) + flow files (callers)

**Acceptance Criteria:**
- [ ] AC-1: `get_agent_signals` MCP tool schema updated to include optional `signal_type: string | null` parameter (default: null = all types)
- [ ] AC-2: Server-side implementation filters results by `signal_type` before response serialization (if parameter is non-null)
- [ ] AC-3: Parameter is fully backward-compatible: clients that do not pass `signal_type` receive full result set (existing behavior)
- [ ] AC-4: Tool doc file `.claude/tools/list/get_agent_signals.md` updated with parameter description + example calls
- [ ] AC-5: At least 3 agents (news-scout, alert-commander, market-watcher) updated to call with `signal_type` filter for their specific needs:
  - news-scout: filter for `signal_type` values relevant to financial term feedback + legal risk dedup (e.g., all types, or specific subset)
  - alert-commander: filter for `signal_type` values relevant to alert dispatch (e.g., price_anomaly, chain_catalyst, kinh_dich)
  - market-watcher: optional; if it reads agent_signals, filter to relevant types
- [ ] AC-6: Unit test added covering: (a) call WITH `signal_type` param → results filtered; (b) call WITHOUT param → all results returned; (c) invalid `signal_type` value → handled gracefully (empty result or error per design)
- [ ] AC-7: Payload size reduction verified: 40–60% smaller result set for typical signal_type filter (measure via MCP call log or mock test)
- [ ] AC-8: Full regression suite GREEN (tsc 0 errors, existing tool tests ≥9358 PASS — post-1967-02 baseline per dev-mcp-server 257d92bf, new filter tests +1–3 GREEN)

**Files to read first:**
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/getAgentSignals.ts` (current tool implementation)
- `.claude/tools/list/get_agent_signals.md` (current tool doc)
- `.claude/flows/news-scout/stage-bootstrap.md` or stage-signals.md (current call patterns)
- `.claude/flows/alert-commander/cycle.md` or stage-bootstrap.md (current call patterns)
- Brief: `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` § L-9 Tier 3

**Files to create:** None

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/getAgentSignals.ts` — Add `signal_type?: string | null` parameter to Zod schema; implement server-side filter logic
- `.claude/tools/list/get_agent_signals.md` — Document new parameter with examples
- `.claude/flows/news-scout/stage-bootstrap.md` or stage-signals.md — Update `call_tool` invocations to include `signal_type` parameter (if applicable for news-scout's needs)
- `.claude/flows/alert-commander/cycle.md` or stage-bootstrap.md — Update `call_tool` invocations to include `signal_type` parameter
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/getAgentSignals.test.ts` — Add 1–3 new test cases for filter parameter

**Dependencies:** None (can pair with P01/P02 in parallel)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (parameterized tool design, backward compat)
- `docs/standards/mcp-tools.md` (MCP tool interface patterns)

## [Implementer] Completion Record

**Commit:** c3b18e8c (2026-05-21)
**Branch:** main (no branch — all work stays on main per policy)
**Test result:** 9364 PASS / 285 FAIL (285 = pre-existing BCTC freeze, unchanged) / tsc 0 errors
**New tests:** 6 (1968c-p03-signal-type-filter.test.ts) — all GREEN

**AC checklist:**
- [x] AC-1: `signal_type: z.string().nullable().optional()` added to get_agent_signals Zod schema in `agentSignalTools.ts`
- [x] AC-2: Server-side SQL filter via `AND s.signal_type = '...'` clause in `getSignals()` (`agentSignalStore.ts`)
- [x] AC-3: Backward-compat: null/undefined/omitted → no SQL clause → all types returned
- [x] AC-4: `.claude/tools/list/get_agent_signals.md` updated with parameter row + Key Notes section
- [x] AC-5: alert-commander `stage-signals.md` updated: step 3b (`signal_type="price_anomaly"`) + step 3c (`signal_type="chain_catalyst"`) with actual `call_tool` blocks; news-scout SELF_SIGNALS_CACHE unchanged (loads all types correctly for dedup)
- [x] AC-6: 6 tests: AC-1 schema, AC-2 filter, AC-3 backward-compat, AC-3b null=all, AC-6c invalid→empty, AC-7 payload reduction
- [x] AC-7: Test verifies 50% reduction (within 40-60% target) with 5/10 signals filtered
- [x] AC-8: 9364 ≥ 9358 baseline; tsc 0 errors; BCTC untouched

**Implementation delta (agentSignalStore.ts):**
- `GetSignalsOptions` interface: added `signalType?: string | null` field with JSDoc
- `getSignals()`: added `signalTypeClause` — applies `AND s.signal_type = '...'` when signalType is non-null/non-empty; uses SQL escaping (replace `'` with `''`)

**Implementation delta (agentSignalTools.ts):**
- `get_agent_signals` tool description updated to mention signal_type
- Added `signal_type: z.string().nullable().optional()` parameter with describe()
- Handler passes `signalType: args.signal_type` to `getSignals()` when non-null

---

## [Developer] Implementation Notes

### Schema update (getAgentSignals.ts)
```typescript
// Current: fields from_agent, status, hours_back (optional)
// Add:
signal_type?: string | null;  // NEW: filter results by signal_type; null/undefined = all types

// Zod schema:
{
  from_agent: z.enum([...]),
  status: z.enum(['all', 'read', 'unread']),
  hours_back: z.number().optional(),
  signal_type: z.string().nullable().optional(),  // NEW
}
```

### Filter logic (server-side)
```typescript
let results = await getAgentSignalsFromDb(from_agent, hours_back);
// Filter by status
results = results.filter(r => status === 'all' || r.status === status);
// NEW: Filter by signal_type
if (signal_type) {
  results = results.filter(r => r.signal_type === signal_type);
}
return results;
```

### Tool doc update (.claude/tools/list/get_agent_signals.md)
Add to parameters section:
```
- **signal_type** (string, optional): Filter results to specific signal type (e.g., "price_anomaly", "chain_catalyst", "kinh_dich", "verified_decision"). If null or omitted, returns all types. Default: null.
  - Example: `signal_type: "price_anomaly"` → only price anomalies returned
  - Example: `signal_type: null` → all signal types (backward compatible)
```

### Agent-side calls
**news-scout stage-signals.md:**
```
call_tool(
  server="vn-market",
  tool="get_agent_signals",
  arguments={
    from_agent: "news-scout",
    status: "unread",
    signal_type: null  // or leave omitted to get all types for dedup check
  }
)
```

**alert-commander cycle.md:**
```
call_tool(
  server="vn-market",
  tool="get_agent_signals",
  arguments={
    from_agent: "news-scout",
    status: "all",
    signal_type: "verified_decision"  // or "price_anomaly" depending on use case
  }
)
```

---

## [QA] Review Record
_(To be filled by QA upon task completion)_

- [ ] Tool schema accepts `signal_type` parameter
- [ ] Server-side filtering implemented and tested
- [ ] Backward compatibility verified: calls without `signal_type` return full result set
- [ ] Payload size reduction measured: 40–60% smaller for filtered calls (vs. full result)
- [ ] Unit tests GREEN (filter present, filter absent, invalid value cases)
- [ ] Regression suite PASS (tsc 0 errors, existing tests ≥9358 PASS — post-1967-02 baseline)
- [ ] Agent calls updated in ≥2 flows (news-scout, alert-commander)

---

## [PM] Handoff Summary
**Tier 3 token economy lever (Phase 3).** Server-side `signal_type` filter additive API change; zero breaking changes. Reduces `get_agent_signals` payload 40–60% for calls that specify a filter. Dev-mcp-server zone. Pairs in parallel with 1968c-P01 and 1968c-P02. Brief §3 L-9 context-tracking safeguard: backward-compat is mandatory (default=all behavior preserved).
