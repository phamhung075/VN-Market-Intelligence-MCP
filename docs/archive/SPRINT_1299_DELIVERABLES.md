# Sprint 1299 — Detailed Deliverables & Implementation Artifacts

**Created:** 2026-04-23
**Purpose:** Define exactly what will be created in each phase, file by file

---

## PHASE 1299a — Tool Index & Reference Docs

**Owner:** BA Agent
**Duration:** 2–3 hours
**Status:** Queued for work

---

### Deliverable 1a.1: `docs/TOOL_INDEX.md`

**Purpose:** Searchable reference for all 106 MCP tools
**Size:** Target <10k tokens (~2500 lines)
**Format:** Alphabetical table with categories

**Structure:**
```markdown
# MCP Tool Index

[Intro paragraph: ~100 words explaining purpose]

## Tools by Category

[Subsections for each of 34 categories in tool-registry.json]

### Category: Watchlist (4 tools)

| Tool | Input Signature | Output Type | Added | Category |
|------|-----------------|-------------|-------|----------|
| add_to_watchlist | ticker: string, thresholds?: Record<string, number> | { id: string, created_at: ISO8601, ticker: string } | 2026-Q1 | Watchlist |
| get_watchlist | none | WatchlistItem[] | 2026-Q1 | Watchlist |
| remove_from_watchlist | ticker: string | { deleted: true } | 2026-Q1 | Watchlist |
| update_thresholds | ticker: string, thresholds: Record<string, number> | { updated: true } | 2026-Q1 | Watchlist |

### Category: Financial Reports (4 tools)
[continue...]

## All Tools Alphabetically

[A–Z index with line numbers for quick lookup]

## Tools by Frequency (Analysis)

[Top 20 most-used tools per agent (from future usage stats)]

[Total: 106 tools, 34 categories, ~2500 lines]
```

**Validation Checklist:**
- [ ] All 106 tools from tool-registry.json present
- [ ] Zero duplicates (grep -c tool-name ≤ 1)
- [ ] Categories match tool-registry.json (34 categories)
- [ ] Input signatures valid TypeScript
- [ ] Output types valid TypeScript
- [ ] Alphabetical sort verified
- [ ] Token count <10k (estimate ~100 chars per tool line)
- [ ] No descriptions (only signature + type)

---

### Deliverable 1a.2: `docs/SKILL_MANIFEST.md`

**Purpose:** Single source of truth for skill → tools mapping
**Size:** Target <5k tokens (~1200 lines)
**Format:** Per-skill tool list with validation

**Structure:**
```markdown
# Skill Manifest — Tool Mapping for Bootstrap Filtering

**Maintained by:** BA Agent
**Updated:** 2026-04-23
**Purpose:** Define which tools each analysis skill requires. Used by bootstrap in Sprint 1299b.

## Quick Reference (Tool Count per Skill)

| Skill | Tool Count | Primary Use Case |
|-------|-----------|------------------|
| news-scout | 14 | Breaking news → impact chains |
| financial-analyst | 24 | BCTC reports → valuation |
| market-watcher | 26 | Price action → patterns → alerts |
| kinh-dich-analyst | 8 | Hexagram readings → predictions |
| macro-catalyst-scout | 12 | Macro events → conviction scoring |
| flow-analyst | 10 | Foreign flow + insider → conviction |
| sentiment-gauge | 9 | Sentiment trend → forecasting |
| disclosure-auditor | 11 | Audit reports → risk signals |
| consensus-builder | 7 | Synthesis → briefings |

## Detailed Manifest

### Skill: news-scout
**Count:** 14 tools
**Use Cases:** Break news, trace causality, score impact
**Tools:**
- get_agent_signals (discover upstream signals)
- get_market_context (market temperature at time of news)
- fetch_and_analyze (fetch + initial analysis)
- run_impact_chain (trace: news → sector → stock impact)
- search_similar_context (find precedents)
- get_prediction_markets (market odds)
- get_rate_limit_status (avoid throttling)
- post_agent_signal (send to alert commander)
- get_recent_fixes (avoid duplicates)
- submit_feedback (log findings)
- get_legal_risk_signals (prosecution/tax risks)
- get_crisis_early_warning (velocity spike check)
- record_evidence_fragment (build case)
- log_agent_work (dev team log)

### Skill: financial-analyst
**Count:** 24 tools
**Use Cases:** BCTC analysis, valuation, cross-validation
**Tools:**
[List 24 tools with brief rationale per tool]

...

## Always-On Tools (System, all agents)

**Count:** 5 tools
**Rationale:** Foundational to every agent, regardless of skill

| Tool | Why Always-On | Category |
|------|---------------|----------|
| get_cycle_bootstrap | Bootstrap itself (metadata) | System |
| send_telegram | Inter-agent + user communication | Telegram |
| submit_feedback | System feedback + error reporting | System |
| get_recent_fixes | Self-healing check (avoid duplicates) | Observability |
| log_fix | Dev team communication | Dev Team |

## Tool Coverage Analysis

**Summary:**
- Total unique tools: 106
- Tools in manifest: 105
- Tools in always-on: 5
- Overlap (shared across skills): 42% (expected, healthy)

**Unused tools (candidates for future removal):**
- [none — all 106 tools covered]

**High-overlap tools (candidates for bundling):**
- get_market_context: 7 skills (market-watcher, news-scout, financial-analyst, flow-analyst, sentiment-gauge, consensus-builder, macro-catalyst-scout)
- get_agent_signals: 6 skills (news-scout, market-watcher, flow-analyst, sentiment-gauge, macro-catalyst-scout, consensus-builder)

**Implication for 1299c:** These high-overlap tools will show >80% session frequency.

## Validation Rules (for future maintenance)

1. **New tool added to MCP:** Update manifest within same sprint (add to relevant skill, or create new skill)
2. **New skill created:** Add to manifest with ≥5 tools
3. **Tool removed from MCP:** Remove from manifest + mark deprecated
4. **Skill becomes obsolete:** Remove skill section + redistribute tools
5. **Coverage target:** 95%+ of tools assigned (all 106 tools must appear in manifest + always-on)

## Decision Log

**Q: Why does financial-analyst have 24 tools while news-scout has 14?**
A: Financial analyst must query BCTC, PDFs, earnings, comparisons, insider trades, risk signals. News scout focuses on causality tracing. Higher breadth justified.

**Q: Are these skills fixed or will they change?**
A: Sprint 1299 is SSOT creation. Future: can be extended (new skills) or refactored (consolidate overlapping skills). Changes go through BA review + code change.

**Q: What if an agent needs a tool not in its skill?**
A: Sprint 1299 = filter by declared skills (design flaw = use full 106 tools). Sprint 1302+: implement dynamic reload (agent requests unexpected tool → async load).
```

**Validation Checklist:**
- [ ] All 9 skills defined with tool lists
- [ ] Always-on tools ≥5 (recommend 5–7)
- [ ] Every tool from TOOL_INDEX.md appears in manifest or always-on
- [ ] No tool listed twice in same skill
- [ ] Tool overlap analysis complete
- [ ] Unused tools identified (if any)
- [ ] Decision log addresses BA questions
- [ ] Coverage = 100% (all 106 tools accounted for)

---

### Deliverable 1a.3: `.claude/agents/README.md` — New section

**Current state:** File exists (Agent introduction + roles)
**Change:** Add "Skill-Gated Tool Loading" section at end

**New Section Content:**
```markdown
## Skill-Gated Tool Loading (Sprint 1299)

### Overview

Starting Sprint 1299, agents can declare which skills they'll use, reducing tool context from 65k → <25k tokens. This frees 40k+ tokens for reasoning depth and message history.

### How to Use

#### Scenario 1: Agent specializing in financial analysis

```typescript
const context = await getAgentContext({
  sessionId: "session-fa-001",
  skillIds: ["financial-analyst"]
});

// Result: loads ~24 tools + 5 always-on = 29 tools total (~12k tokens)
```

#### Scenario 2: Agent doing market analysis (multi-skill)

```typescript
const context = await getAgentContext({
  sessionId: "session-market-001",
  skillIds: ["market-watcher", "sentiment-gauge"]
});

// Result: loads union of tools (26 + 9, overlap = 4) + 5 always-on
// = ~30 tools (~15k tokens)
```

#### Scenario 3: Legacy mode (load all tools, not recommended)

```typescript
const context = await getAgentContext({
  sessionId: "session-full-001"
});

// Result: loads all 106 tools (~65k tokens)
// Use only for backwards compat or full analysis mode
```

### Skill List & Tool Counts

See `docs/SKILL_MANIFEST.md` for full manifest.

| Skill | Tools | Use Case |
|-------|-------|----------|
| news-scout | 14 | Breaking news + causality chains |
| financial-analyst | 24 | BCTC + valuation analysis |
| market-watcher | 26 | Price action + patterns |
| kinh-dich-analyst | 8 | Hexagram readings |
| macro-catalyst-scout | 12 | Macro events → conviction |
| flow-analyst | 10 | Foreign flows + insider |
| sentiment-gauge | 9 | Sentiment forecasting |
| disclosure-auditor | 11 | Risk auditing |
| consensus-builder | 7 | Synthesis → briefings |

### Best Practices

1. **Declare early:** In agent bootstrap, declare skills immediately
   ```typescript
   const context = await getAgentContext({
     sessionId,
     skillIds: agentSkills
   });
   ```

2. **Combine complementary skills:** news-scout + market-watcher (news → market impact) vs financial-analyst + sentiment-gauge (complementary)

3. **Always-on tools:** System tools (bootstrap, telegram, feedback) added automatically, no need to declare

4. **Tool not in skill?** Current behavior (Sprint 1299): agent can't access. Future (Sprint 1302+): async reload available.

### Performance Impact

| Scenario | Tools | Context | Freed Tokens |
|----------|-------|---------|--------------|
| Legacy (all tools) | 106 | 65k | 0 |
| 1 skill | ~20 | 12k | 53k |
| 3 skills | ~35 | 20k | 45k |
| 9 skills (all) | 106 | 65k | 0 |

### Maintenance

When new tools are added to MCP:
1. Update `docs/TOOL_INDEX.md`
2. Update `docs/SKILL_MANIFEST.md` (add to relevant skill)
3. Update `src/domain/skillManifest.ts` (code constant)
4. Run validation test (ensure manifest matches MCP server)

### Troubleshooting

**Q: Agent complains "tool X not found"**
A: Tool X not in agent's declared skills. Either:
   - Re-declare skills to include X's skill
   - Use legacy mode (no skillIds param, load all 106)
   - Ask for dynamic tool reload (Sprint 1302 feature)

**Q: Context still huge (25k+ tokens)**
A: You may have declared all 9 skills (union = ~106 tools). Either:
   - Use smaller skill subset (1–3 skills)
   - Check for skill overlap (high-frequency tools appear in many skills)

**Q: How do I know which skills an agent needs?**
A: Check agent workflow in `.claude/agents/AGENT_NAME.md`:
   - Tools listed in workflow → required skills
   - Use `docs/SKILL_MANIFEST.md` reverse lookup (tool → skills that include it)
```

**Validation Checklist:**
- [ ] Section added at end of .claude/agents/README.md
- [ ] 3 usage scenarios with code examples
- [ ] Skill table matches SKILL_MANIFEST.md
- [ ] Performance impact table accurate
- [ ] Maintenance checklist clear
- [ ] Troubleshooting Q&A comprehensive

---

### Deliverable 1a.4: `docs/agent-memory/modules/tool-loading.md` — Analysis

**Purpose:** Record optimization decisions, patterns, future improvements
**Size:** Target <2k tokens (~500 lines)
**Audience:** Future developers optimizing tool loading

**Structure:**
```markdown
# Agent Memory: Tool Loading Optimization (Sprint 1299+)

**Created:** 2026-04-23 (Sprint 1299a)
**Owner:** BA
**Status:** Phase 1 (index + manifest) complete

## Key Findings

### Skill Tool Overlap Analysis

**news-scout vs market-watcher:**
- Shared tools: get_market_context, get_agent_signals, post_agent_signal, get_recent_fixes, submit_feedback, log_agent_work (6 shared)
- news-scout exclusive: fetch_and_analyze, run_impact_chain, search_similar_context, get_prediction_markets, get_legal_risk_signals, get_crisis_early_warning, record_evidence_fragment (7)
- market-watcher exclusive: get_price_history, get_patterns, get_sector_rotation, get_sector_comparison, get_kinhdich_reading, get_market_hexagram, get_supply_chain_exposure, get_alerts, get_positions, get_portfolio_risk, compare_stocks, manage_alert_mute, get_energy_grid_signals, get_climate_risk_signals, get_foreign_flow (15)
- **Implication:** Load both = 26 unique tools (not 14+26=40). Good coverage for briefing agents.

**financial-analyst vs disclosure-auditor:**
- Shared tools: list_stored_pdfs, get_bctc_full, read_bctc_pdf, get_earnings_calendar, compare_stocks, get_legal_risk_signals (6)
- **Implication:** Can't separate these skills. Future: bundle as "financial-suite".

### Tool Categories Most Valuable (by agent dependency)

| Category | Agents Using | Usage Frequency (estimate) | Why Essential |
|----------|--------------|---------------------------|---------------|
| Market snapshot | 7 agents | 15% | Core decision trigger |
| Alerts | 8 agents | 12% | Alert Commander exclusive |
| Financial (BCTC) | 3 agents | 8% | High-value, concentrated |
| Kinh Dich | 4 agents | 3% | Niche but powerful |
| Agent signals | 5 agents | 6% | Inter-agent comms |

### Unused Tools (Candidates for Removal in Sprint 1302+)

**Current:** All 106 tools used by ≥1 agent or marked as "diagnostic"

- `get_broker_credibility` — Not called by any agent, diagnostic only
  - **Decision:** Keep (broker intel may be added in future analysis)
  - **Review date:** 2026-10-01 (after 6 months with usage stats)

- `get_label_accuracy_report` — Only QA Responder calls (diagnostic)
  - **Decision:** Keep (essential for QA diagnostics)

### High-Frequency Tools (Will Dominate Usage Stats)

Based on agent workflow analysis:
1. `get_cycle_bootstrap` — Every agent, every session (100%)
2. `get_market_snapshot` — 7 agents, every session (80%)
3. `send_telegram` — 5 agents, multiple times per session (70%)
4. `get_bctc_full` — Financial analyst, 30% of sessions (30%)
5. `get_agent_signals` — Multi-agent comms, 60% of sessions (60%)

**Implication for 1299c:** Session cache will show these tools in 80%+ of sessions. Candidates for special optimization (always-on list) in future.

## Optimization Roadmap

### Phase 1 — Sprint 1299 (CURRENT)
- Skill-gated loading (10–25 tools per skill, 40k token savings)
- Session cache (track usage patterns)
- Manifest as SSOT (easy maintenance)

### Phase 2 — Sprint 1302 (Planned)
- Smart skill bundling (e.g., financial-analyst + disclosure-auditor → financial-suite)
- Dynamic tool discovery (agent requests unexpected tool → async reload)
- Tool deprecation policy (remove 0-usage tools after 6+ months)

### Phase 3 — Sprint 1305 (Future)
- Per-agent skill profiles (store learned preferences in CLAUDE.md)
- Predictive tool preload (ML model: session start conditions → likely tools)
- Weighted skill definitions (tools marked as "essential" vs "optional")

### Phase 4 — Sprint 1310+ (Visionary)
- Cross-agent tool negotiation (agents request tools from each other)
- Tool versioning (tool API changes handled gracefully)
- Tool marketplace (agents can define custom tools)

## Decision Log

**Q: Why not remove unused tools now (Sprint 1299)?**
A: Tools are discoverable in edge cases. Also, "unused" per agent registry ≠ unused in practice (may be called indirectly). Better to track usage + deprecate after 6 months of data.

**Q: Why 8-hour session cache TTL?**
A: Matches market hours (9:15am–4:30pm VN time ≈ 7h, +1h buffer). Expires between trading days, prevents stale tool lists.

**Q: Can agents request tools mid-session?**
A: Not yet (Sprint 1299). Fallback: use legacy mode (load all 106). Sprint 1302: implement async reload + silent fallback.

**Q: What if skill definition changes (e.g., remove a tool)?**
A: BA updates SKILL_MANIFEST.md → Dev updates src/domain/skillManifest.ts → Tests rerun. Sessions currently active keep old tools (TTL 8h timeout).

**Q: How do we know if a tool is truly unused?**
A: Combine agent code analysis (grep "call tool X") + session usage stats (track via cron job). Both must show 0 usage for 6 months before removal.

## Metrics Tracking

After Sprint 1299c (session cache + cron job), track:

- **Weekly:** Tool frequency histogram (tools used in past 7 days)
- **Monthly:** Skill coverage (which skill-combinations appear together?)
- **Quarterly:** Context efficiency (avg tool context size per session)

**Target SLA:** Default session context <25k tokens (vs current 65k).
```

**Validation Checklist:**
- [ ] All findings documented (overlap analysis, coverage, unused tools)
- [ ] Decision log comprehensive
- [ ] Roadmap phases reasonable (S1302, S1305, S1310+)
- [ ] Metrics tracking defined
- [ ] File references match (tool-loading.md accounted for in agent memory)

---

## PHASE 1299b — Skill-Gated Bootstrap Implementation

**Owner:** Developer Agent
**Duration:** 3–4 hours
**Status:** Depends on 1299a complete + SKILL_MANIFEST.md approved

---

### Deliverable 1b.1: `src/interface/rest/agentBootstrap.ts` (Refactored)

**Current size:** ~150 lines (getAgentContext function)
**Changes:** +50 lines (skill filtering logic)
**Test coverage:** 3 integration tests

**Key changes:**
1. Add `AgentBootstrapOptions` interface with optional `skillIds?: string[]`
2. Implement `computeSkillUnion()` function
3. Add session cache lookup + storage
4. Maintain backwards compatibility (no skillIds = load all)
5. Add validation against MCP tool registry

**Diff size:** ~60 lines added, 20 lines modified, 0 removed

---

### Deliverable 1b.2: `src/domain/skillManifest.ts` (New)

**Purpose:** Static tool lists per skill
**Size:** ~150 lines (9 skills + always-on)
**Format:** TypeScript const

**Structure:**
```typescript
export const SKILL_MANIFEST: Record<string, string[]> = {
  "news-scout": ["get_agent_signals", "get_market_context", ...],
  "financial-analyst": [...24 tools...],
  ...
};

export const ALWAYS_ON_TOOLS = [
  "get_cycle_bootstrap",
  "send_telegram",
  "submit_feedback",
  "get_recent_fixes",
  "log_fix"
];
```

**Validation checklist:**
- [ ] All 9 skills defined
- [ ] All tools are valid strings (match TOOL_INDEX.md)
- [ ] Always-on tools ≥5
- [ ] No undefined tool names (import check)
- [ ] Alphabetically sorted within each skill (maintainability)

---

### Deliverable 1b.3: `src/__tests__/integration-bootstrap-skills.test.ts` (New)

**Purpose:** Verify skill-gated loading works correctly
**Tests:** 5 integration tests covering 3 scenarios

**Test scenarios:**

1. **Legacy mode (no skills):** Load all 106 tools
   ```typescript
   it('should load all 106 tools when no skills provided', async () => {
     const result = await getAgentContext({ sessionId: 'session-legacy' });
     expect(result.toolCount).toBe(106);
   });
   ```

2. **Single skill:** financial-analyst → ≤25 tools
   ```typescript
   it('should load ≤25 tools for financial-analyst', async () => {
     const result = await getAgentContext({
       sessionId: 'session-fa',
       skillIds: ['financial-analyst']
     });
     expect(result.toolCount).toBeLessThanOrEqual(25);
     expect(result.toolCount).toBeGreaterThan(5);
   });
   ```

3. **Multi-skill combo:** 3 skills → ≤30 tools (union, not sum)
   ```typescript
   it('should compute tool union for 3-skill combo', async () => {
     const result = await getAgentContext({
       sessionId: 'session-combo',
       skillIds: ['financial-analyst', 'market-watcher', 'news-scout']
     });
     expect(result.toolCount).toBeLessThanOrEqual(30);
   });
   ```

4. **Session cache:** Same session reuses cache
   ```typescript
   it('should cache tools per session (8h TTL)', async () => {
     const sessionId = 'session-cache-test';
     const result1 = await getAgentContext({
       sessionId,
       skillIds: ['financial-analyst']
     });
     const result2 = await getAgentContext({
       sessionId,
       skillIds: ['financial-analyst']
     });
     expect(result1.toolCount).toBe(result2.toolCount);
   });
   ```

5. **Context size:** 1 skill → <30k tokens
   ```typescript
   it('should reduce context from 65k to <30k for single skill', async () => {
     const result = await getAgentContext({
       sessionId: 'session-tokens',
       skillIds: ['financial-analyst']
     });
     const estimatedTokens = (result.toolCount * 250) / 4; // rough estimate
     expect(estimatedTokens).toBeLessThan(30000);
   });
   ```

**File size:** ~80 lines (test code)
**Coverage:** Line coverage ≥90% (agentBootstrap.ts)

---

### Deliverable 1b.4: Performance Profiling Report

**Purpose:** Validate performance targets
**Report:** `reports/TASK_1299b_PERF.md`

**Metrics:**
- Bootstrap cold (compute from scratch): <100ms
- Bootstrap warm (cache hit): <20ms
- computeSkillUnion() complexity: O(n) where n=tools per skill (~25)
- Memory: session data < 5KB per session

**Example output:**
```
Performance Profile — Task 1299b Bootstrap Refactoring

Test: 100 bootstrap calls (50 cold, 50 warm)
├─ Cold avg: 87ms (target: <100ms) ✓
├─ Warm avg: 18ms (target: <20ms) ✓
├─ computeSkillUnion() avg: 2.3ms (target: <5ms) ✓
└─ Memory per session: 2.8KB (target: <5KB) ✓

All targets met. Optimize = N/A.
```

---

## PHASE 1299c — Session Cache & Analytics

**Owner:** Developer Agent
**Duration:** 2–3 hours
**Status:** Depends on 1299b complete + tests passing

---

### Deliverable 1c.1: `src/infrastructure/cache/sessionToolCache.ts` (New)

**Purpose:** LRU cache for session → tools mapping
**Size:** ~80 lines
**Dependencies:** node-cache (already in package.json)

**Interface:**
```typescript
class SessionToolCache {
  get(sessionId: string): SessionToolEntry | undefined;
  set(sessionId: string, tools: string[]): void;
  clear(): void;
  getAllSessions(): Map<string, SessionToolEntry>;
}

export const sessionToolCache = new SessionToolCache();
```

**Constraints:**
- Max 100 sessions
- TTL: 8 hours
- LRU eviction on capacity exceeded

**Test file:** `src/__tests__/unit-session-cache.test.ts` (~50 lines)
- LRU eviction
- TTL expiration
- Concurrent get/set
- getAllSessions() returns correct data

---

### Deliverable 1c.2: `src/infrastructure/scheduler/trackSessionToolUsageJob.ts` (New)

**Purpose:** Cron job to aggregate tool usage statistics
**Size:** ~100 lines
**Trigger:** Run every 8 hours via cron scheduler

**Input:** All sessions in cache
**Output:** `docs/agent-memory/modules/tool-usage-stats.json`

**Output format:**
```json
{
  "timestamp": "2026-04-23T22:00:00Z",
  "period": "last_7_days",
  "sessionCount": 42,
  "uniqueToolsUsed": 87,
  "averageToolsPerSession": 24.3,
  "tools": {
    "get_cycle_bootstrap": { "count": 42, "percentage": 100.0 },
    "get_market_snapshot": { "count": 35, "percentage": 83.3 },
    "send_telegram": { "count": 31, "percentage": 73.8 },
    ...
  }
}
```

**Validation checklist:**
- [ ] Cron job registered in cron-registry.json
- [ ] Runs every 8 hours (43200 seconds)
- [ ] Output file created + updated
- [ ] Histogram sorted by frequency
- [ ] Percentages computed correctly
- [ ] Error handling (graceful if cache empty)

---

### Deliverable 1c.3: `docs/agent-memory/modules/tool-usage-stats.json` (New, Generated)

**Purpose:** Persisted statistics from cron job
**Size:** Grows over time (~1KB per week)
**Updated:** Every 8 hours

**Format:** Same as cron output (see above)

**Archival:** Every 30 days, copy to `docs/agent-memory/archive/tool-usage-stats-2026-04-30.json`

---

### Deliverable 1c.4: Update `docs/agent-memory/modules/tool-loading.md`

**Current:** Created in 1299a (Phase 1)
**Update:** Add "Usage Tracking" section

**New section:**
```markdown
## Usage Tracking (Phase 1299c — Sprint 1299)

### Session Cache Statistics

After 1 week of Sprint 1299 deployment:
- Total sessions tracked: 52
- Average tools per session: 24.3
- Unique tools used: 87 (of 106 available)
- Unused tools: 19 (18%)
  - get_broker_credibility
  - get_label_accuracy_report
  - [17 others]

### High-Frequency Tools

| Tool | Sessions | Frequency | Skill Combo |
|------|----------|-----------|-------------|
| get_cycle_bootstrap | 52 | 100% | Always-on |
| get_market_snapshot | 47 | 90% | market-watcher, consensus-builder |
| send_telegram | 41 | 79% | All skills |
| get_agent_signals | 35 | 67% | 6 skills |
| get_market_context | 32 | 62% | news-scout, market-watcher, flow-analyst |

### Skill Usage Patterns

**Most common skill combinations:**
1. financial-analyst + disclosure-auditor (24% of sessions) → "financial-suite" candidate
2. news-scout + market-watcher (18% of sessions) → complementary
3. Single skill (58% of sessions) → majority use single-skill mode

**Implication:** Future (Sprint 1302): bundle financial-analyst + disclosure-auditor.

### Performance Metrics

**Tool context reduction achieved:**
- Average session before: 65k tokens (all 106 tools)
- Average session after: 19.2k tokens (24.3 tools)
- **Tokens freed: 45.8k per session (70.5% reduction)**

**Agent reasoning budget impact:**
- Freed tokens reallocated to message history + reasoning steps
- Typical agent can now maintain 5–7 turn conversations (was 2–3 turns)

### Recommendations

1. **Keep deployment** — Usage stats validate the optimization works
2. **Plan Sprint 1302** — Bundle high-overlap skills (financial-suite)
3. **Review unused tools** — Monitor these 19 tools, deprecate if 0 usage persists

```

---

## Testing & Validation Artifacts

### Unit Tests (Created in 1299b + 1299c)

1. **integration-bootstrap-skills.test.ts** — 5 tests, bootstrap logic
2. **unit-session-cache.test.ts** — 6 tests, cache behavior
3. **unit-skill-manifest.test.ts** — 3 tests, manifest completeness
   - All 9 skills present
   - All 106 tools covered
   - No undefined tool names

### Integration Test (Created in 1299b)

**Test:** Spawn actual agent with ["financial-analyst"] skill
**Verify:** Tool context <30k tokens, agent can call all expected tools, performance <100ms

### Regression Test (Existing, run before merge)

**Test:** Full test suite `bun test`
**Target:** 6508+ tests pass (no regressions)

---

## Commit Messages

**Sprint 1299a — Tool Index:**
```
docs(1299a): Create tool index + skill manifest for context optimization

- Added docs/TOOL_INDEX.md (106 tools, <10k tokens)
- Added docs/SKILL_MANIFEST.md (9 skills, tool mapping)
- Updated .claude/agents/README.md with skill declaration rules
- Added docs/agent-memory/modules/tool-loading.md (analysis + roadmap)

All 106 tools documented. Skill manifest validated. Ready for 1299b bootstrap refactoring.
```

**Sprint 1299b — Bootstrap Refactoring:**
```
refactor(1299b): Implement skill-gated tool loading in bootstrap

- Refactored src/interface/rest/agentBootstrap.ts
  - Added AgentBootstrapOptions interface (skillIds?: string[])
  - Implemented computeSkillUnion() for smart filtering
  - Added session cache integration
  - Maintained backwards compatibility (no skillIds = load all)

- Added src/domain/skillManifest.ts
  - 9 skills + always-on tools
  - Single source of truth for tool filtering

- Added src/__tests__/integration-bootstrap-skills.test.ts
  - 5 integration tests (legacy, single-skill, multi-skill, cache, tokens)
  - All tests pass. Tool context reduced 65k → <30k tokens.

Performance: bootstrap cold <100ms, warm <20ms. All targets met.
```

**Sprint 1299c — Session Cache:**
```
feat(1299c): Add session cache + tool usage analytics cron job

- Added src/infrastructure/cache/sessionToolCache.ts
  - LRU cache (max 100 sessions, TTL 8h)
  - Session tool tracking for analytics

- Added src/infrastructure/scheduler/trackSessionToolUsageJob.ts
  - Runs every 8 hours
  - Aggregates tool usage across all sessions
  - Outputs histogram to docs/agent-memory/modules/tool-usage-stats.json

- Updated docs/agent-memory/modules/tool-loading.md
  - Usage statistics and patterns recorded
  - Recommendations for Sprint 1302+ optimization

Usage stats show: 70.5% token reduction achieved (45.8k tokens freed per session).
```

---

## Sign-Off Checklist (QA)

- [ ] All deliverables created (files exist + content complete)
- [ ] Tool Index: 106 tools, <10k tokens, alphabetically sorted
- [ ] Skill Manifest: 9 skills, 100% tool coverage
- [ ] Bootstrap refactored: skill filtering works, backwards compat confirmed
- [ ] Integration tests pass: all 5 scenarios (legacy, 1/3 skills, cache, tokens)
- [ ] Performance validated: bootstrap <100ms cold, <20ms warm
- [ ] Session cache operational: LRU eviction + TTL verified
- [ ] Cron job operational: runs every 8h, generates histogram
- [ ] Full test suite passes: 6508+ tests, zero regressions
- [ ] Code reviewed: SKILL_MANIFEST + bootstrap refactor + cache
- [ ] Documentation complete: TOOL_INDEX + SKILL_MANIFEST + agent README + tool-loading memory
- [ ] Commit messages clear + linked to tasks
- [ ] All files have proper headers (owner, purpose, date, links)

---

## Release Notes (Post-Sprint)

**Title:** Sprint 1299 Complete — 40k Token Context Savings

**Summary:**
Implemented skill-gated tool loading to reduce MCP tool context from 65k → <25k tokens. Agents now declare which skills they'll use; bootstrap filters tools to match. Session cache tracks usage for future optimization.

**Impact:**
- Agent reasoning budget: +40k tokens (70% increase)
- Message history: can now maintain 5–7 turn conversations (was 2–3)
- Analysis depth: complex cross-validations now feasible
- Performance: bootstrap <100ms cold, <20ms warm cache hit

**How to Use:**
See `docs/SKILL_MANIFEST.md` for skill list. Declare skillIds in bootstrap call:
```typescript
getAgentContext({ sessionId, skillIds: ["financial-analyst", "market-watcher"] })
```

**Future Work:** Sprint 1302 (smart skill bundling, dynamic tool discovery)

---

**End of Deliverables Document**
