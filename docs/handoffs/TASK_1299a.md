# HANDOFF — Task 1299a: Tool Index + Reference Docs

**For:** BA Agent
**Sprint:** 1299
**Status:** Ready for work
**Effort:** 2–3 hours
**Depends:** None
**Blocks:** Task 1299b (developer)

---

## Context

All 106 MCP tools are currently loaded into every agent bootstrap (~65k tokens = 32.4% of context budget). This consumes massive reasoning capacity without corresponding value — most agents only use 10–25 of these tools per session.

**Goal:** Create searchable documentation + skill-to-tool mapping so that in Task 1299b, developers can implement smart filtering.

**Why BA owns this:** You know the agent workflow best. You understand which tools each analysis skill (news-scout, financial-analyst, market-watcher, etc.) actually needs. Your manifest ensures developers don't over-filter or under-filter.

---

## Deliverables

### Deliverable 1: `docs/TOOL_INDEX.md` (1-liner reference)

**Purpose:** Searchable reference for all 106 tools. No descriptions, just signature + output.

**Format:**
```markdown
# MCP Tool Index

Complete alphabetical reference for all 106 MCP tools.

| Tool | Input Signature | Output Type | Category |
|------|-----------------|-------------|----------|
| add_to_watchlist | ticker: string, thresholds?: {...} | { id, created_at } | Watchlist |
| answer_ask_question | question_id: string, answer: string | { id, answered_at } | Ask Queue |
| batch_review_market_messages | ids: string[], verdict: "ok"\|"spam" | { processed, skipped } | Message Review |
| claim_telegram_report | report_id: string | { claimed_by, created_at } | Telegram |
| close_position | ticker: string, exit_price: number | { exit_price, pnl } | Portfolio |
| compare_financials | tickers: string[], quarters?: string[] | ComparativeAnalysis | Financial |
| compare_stocks | ticker1: string, ticker2: string, metrics?: string[] | ComparisonResult | Analysis |
| ... | ... | ... | ... |

*106 tools total. Categories: Watchlist (4), Financial (4), Alerts (5), ...*
```

**Instructions:**
1. Extract ALL 106 tools from:
   - `docs/data/tool-registry.json` (tool list)
   - `.claude/knowledge/mcp-tools.md` (tool-per-agent tables)
   - `src/interface/rest/` (live MCP tool definitions, if you can access)
2. For each tool, write 1-liner: `Tool Name | Input Type Signature | Output Type | Category`
   - Input: Copy from tool definition (just types, no description)
   - Output: Copy expected return type
   - Category: From tool-registry.json "categories"
3. Sort alphabetically
4. Group by category at bottom (quick lookup)
5. Total tokens: target <10k (aim for 1-liner per tool = ~100 chars)

**Validation checklist:**
- [ ] All 106 tools present (cross-check against tool-registry.json count)
- [ ] Zero duplicates (grep duplicate tool names)
- [ ] No descriptions (only type signature)
- [ ] All categories represented (34 categories from tool-registry.json)
- [ ] Alphabetically sorted + category index at bottom
- [ ] Estimated token count <10k (doc should be ~2400 lines max)

---

### Deliverable 2: `docs/SKILL_MANIFEST.md` (skill-to-tools mapping)

**Purpose:** Define which tools each analysis skill (agent role) needs. Single source of truth for bootstrap filtering.

**Format:**
```markdown
# Skill Manifest — Tool Mapping

**Maintained by:** BA (Sprint 1299 + maintenance)
**Updated:** [date]
**Purpose:** Map analysis skills to required tools for skill-gated bootstrap loading.

## Analysis Skills (9 total)

### Skill: news-scout
**Description:** Breaking news → causal chains → impact scoring
**Tools (14 total):**
- get_agent_signals
- get_market_context
- fetch_and_analyze
- run_impact_chain
- search_similar_context
- get_prediction_markets
- get_rate_limit_status
- post_agent_signal
- get_recent_fixes
- submit_feedback
- get_legal_risk_signals
- get_crisis_early_warning
- record_evidence_fragment
- log_agent_work

### Skill: financial-analyst
**Description:** BCTC reports → valuation → cross-validation
**Tools (24 total):**
- get_cycle_bootstrap
- get_user_positions_for_analysis
- get_earnings_calendar
- list_stored_pdfs
- get_bctc_full
- read_bctc_pdf
- get_financial_summary
- compare_stocks
- ... [continue]

### Skill: market-watcher
...

### Skill: kinh-dich-analyst
...

## Always-On Tools (all agents, no matter the skill)

**System & Lifecycle:**
- get_cycle_bootstrap (bootstrap itself)
- send_telegram (communication)
- submit_feedback (system feedback)
- get_recent_fixes (self-healing check)
- log_fix (dev team comms)

**Rationale:** These are foundational to every agent's first step and inter-agent communication.

## Tool Coverage Validation

- Total tools in manifest: XXX / 106
- Tools unused by any skill: YYY (listed below, candidates for future removal)
- Skills with overlap (share tools): ZZZ% (expected, indicates healthy reuse)

*Unused tools (for future Sprint 1302+ review):*
- [list any tools not mentioned in any skill]
```

**Instructions:**
1. Extract skill definitions from:
   - `.claude/agents/*.md` (agent "Workflow" sections = skills they claim)
   - `.claude/skills/*/SKILL.md` (skills created in Sprint 1297)
   - `docs/IMPLEMENTATION_STATUS.md` (agent roles + responsibilities)
2. For each of the 9 analysis skills (news-scout, financial-analyst, market-watcher, kinh-dich-analyst, macro-catalyst-scout, flow-analyst, sentiment-gauge, disclosure-auditor, consensus-builder), list:
   - Which tools they call in their workflow
   - Rationale (1 sentence per tool): why it's essential
3. Identify "always-on" tools (system, logging, bootstrap)
4. Validate:
   - Sum of all tools = 106? (should be ≥100 with overlap)
   - Any tools not in any skill? (candidates for future deprecation)
   - Any skill with <5 tools? (likely incomplete)

**Validation checklist:**
- [ ] All 9 skills defined + tool lists complete
- [ ] Always-on tools identified (≥5 tools)
- [ ] Every tool from TOOL_INDEX.md appears in at least one skill or always-on
- [ ] Tool duplicates counted (overlap is expected)
- [ ] Unused tools identified (if any)
- [ ] Manifest self-consistent (no tool listed twice in same skill)

---

### Deliverable 3: `.claude/agents/README.md` — Update bootstrap rules

**Current state:** Missing. Add section explaining skill-gated loading.

**To add (after existing content):**
```markdown
## Skill-Gated Tool Loading (Sprint 1299)

### How to declare skills

When spawning an agent with limited tool context, pass `skillIds` parameter:

```typescript
// Load only tools for financial analyst
const context = await getAgentContext({
  sessionId: "user-session-001",
  skillIds: ["financial-analyst"]
});

// Load tools for multiple skills
const context = await getAgentContext({
  sessionId: "user-session-002",
  skillIds: ["market-watcher", "news-scout"]
});

// Legacy: load all 106 tools (not recommended)
const context = await getAgentContext({
  sessionId: "user-session-003"
});
```

### Skill list

Available analysis skills: `docs/SKILL_MANIFEST.md`

### Why this matters

- **Default:** All 106 tools = 65k tokens = 32% of context wasted
- **Optimized:** 1–3 skills = 10–25 tools = 10–25k tokens
- **Benefit:** 40k+ tokens freed for reasoning, message history, analysis depth

### Best practices

1. **Declare skills early:** In agent bootstrap, declare which skills agent will use
2. **Combine related skills:** news-scout + market-watcher (complementary) vs news-scout + kinh-dich-analyst (overlapping, less efficient)
3. **Always-on tools:** System tools (bootstrap, telegram, feedback) always included automatically
4. **New tools:** If you add a new tool to manifest, update SKILL_MANIFEST.md + corresponding skill entry
```

---

### Deliverable 4: `docs/agent-memory/modules/tool-loading.md` (analysis)

**Purpose:** Record decisions, patterns, and future optimization ideas.

**Template:**
```markdown
# Agent Memory: Tool Loading Optimization (Sprint 1299)

**Last Updated:** 2026-04-23
**Phase:** 1299a (index creation)
**Owner:** BA

## Key Findings

### Skill Tool Overlap
- **news-scout + market-watcher:** 8 shared tools (get_market_context, get_agent_signals, etc.)
  - Implication: Loading both skills adds marginal cost (union, not sum)
  - Recommendation: Market briefing agents should load both (complementary)

- **financial-analyst + disclosure-auditor:** 6 shared tools (BCTC queries, earnings calendar)
  - Implication: Strong dependency — can't separate these skills
  - Recommendation: Bundle as "financial-suite" for future optimization (Sprint 1302)

### Unused Tools (Candidates for Removal)
- `get_broker_credibility` — 0 agents call this
  - Status: Keep (broker intel may be added in future analysis)
- `get_label_accuracy_report` — Only QA Responder calls
  - Status: Keep (diagnostic, essential for QA)

### Tool Categories Most Valuable
| Category | Agents | Usage | Why |
|----------|--------|-------|-----|
| Market snapshot | 7 agents | 15% of calls | Central to every analysis |
| Alerts | 8 agents | 12% of calls | Decision trigger |
| Financial (BCTC) | 3 agents | 8% of calls | High-value, concentrated |
| Kinh Dich | 4 agents | 3% of calls | Niche, but powerful |

## Optimization Recommendations

### Phase 1 (Implemented Sprint 1299)
- Skill-gated loading (10–25 tools per skill)
- Session cache (track usage patterns)

### Phase 2 (Sprint 1302+)
- Smart skill bundling (combine always-together skills)
- Dynamic tool discovery (agent requests unexpected tool → async reload)
- Tool deprecation (remove 0-usage tools after 6+ months)

### Phase 3 (Sprint 1305+)
- Per-agent skill profiles (store learned preferences)
- Predictive tool preload (ML: "when agent X starts, load these tools")

## Decision Log

**Q: Why not remove "unused" tools now?**
A: Tools are discoverable in edge cases. Better to track usage + deprecate later. Removal = breaking change, too risky Sprint 1299.

**Q: Why 8-hour session cache TTL?**
A: Matches market hours + typical user session. Expires before next trading day.

**Q: Can agents request new tools mid-session?**
A: Not yet (Sprint 1299). Future work: async reload + silent fallback.
```

---

## Definition of Done

- [ ] `docs/TOOL_INDEX.md` created (106 tools, <10k tokens, alphabetically sorted)
- [ ] `docs/SKILL_MANIFEST.md` created (9 skills, all tools assigned, always-on identified)
- [ ] `.claude/agents/README.md` updated (skill declaration rules + examples)
- [ ] `docs/agent-memory/modules/tool-loading.md` created (findings + recommendations)
- [ ] Validation: grep confirms all 106 tools in manifest (no gaps)
- [ ] Validation: no tool appears in 2+ skills without reason
- [ ] Token count confirmed: TOOL_INDEX.md <10k tokens
- [ ] Commit message: `docs(1299a): Create tool index + skill manifest for context optimization`
- [ ] PR reviewer: System Auditor or Architect (validate manifest completeness)

---

## Questions for BA?

1. **Skill boundaries:** News-scout can call get_legal_risk_signals + get_crisis_early_warning. Should financial-analyst also have these? → Recommend: news-scout primary, financial-analyst secondary (shared)

2. **Always-on list:** Missing any critical tools? Current: [get_cycle_bootstrap, send_telegram, submit_feedback, get_recent_fixes, log_fix] → Recommend: add send_alert_digest

3. **Tool version:** If a tool changes signature in future, does manifest break? → Recommend: no (manifest is late-binding, bootstrap validates against MCP server at runtime)

---

## Links

- **Requirements:** `docs/REQ_1299.md`
- **Technical Design:** `docs/TECH_1299.md`
- **Sprint Goal:** `SPRINT_GOAL.md`
- **Task List:** `TASKS.md` → Sprint 1299 → Task 1299a
