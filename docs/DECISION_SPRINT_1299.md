# Decision Record — Sprint 1299: MCP Tool Context Optimization

**Decision Date:** 2026-04-23
**Decision Status:** APPROVED FOR PLANNING
**Decision Owner:** Product Owner (Autonomous Mode)
**Approver:** PO (self-approval via autonomy mandate)

---

## Problem Statement

### Current State (Quantified)

| Metric | Value | Problem |
|--------|-------|---------|
| Default tool load | 106 tools | All agents get all tools |
| Tool context size | 65k tokens | 32.4% of typical 200k budget |
| Tools actually used | 10–25 per agent | 80% waste |
| Agent reasoning budget | ~50k tokens | Insufficient for complex chains |
| Message history depth | 2–3 turns | User reports: briefings cut mid-analysis |
| User impact | High | Incomplete digests, truncated /ask answers, weak signal chains |

### Root Cause

Bootstrap currently loads entire MCP tool registry into every agent session without filtering. Decision to load all tools was made when:
1. Tool count was lower (<50 tools)
2. Agent reasoning depth was less critical
3. Session context budgets higher

Now (Sprint 1299):
- Tool count: 106 (2x growth)
- Agent sophistication: 9 analysis skills + factory skills (6 new)
- Budget pressure: hitting ceiling at 200k tokens (average session)
- User expectations: multi-turn analysis depth required

### Impact Assessment

**User Experience Degradation:**
- Morning briefing: cut after 1000 words (should be 2500)
- /ask answers: truncated, missing supporting evidence
- Signal chains: news → sector → stock analysis incomplete

**System Constraints:**
- Cannot add new tools without context expansion
- Cannot maintain longer conversations
- Cannot support cross-agent reasoning chains

---

## Solution Decision

### Approach: Three-Phase Skill-Gated Loading

**Decision:** Implement smart bootstrap that loads only tools agents declare they'll use.

**Why This Approach (vs Alternatives):**

| Approach | Tokens Saved | Effort | Risks | Score |
|----------|--------------|--------|-------|-------|
| **Skill-gated loading (chosen)** | 40–50k | 7–10h | Medium (design changes) | ⭐⭐⭐⭐⭐ |
| Tool Index only | 5–10k | 2–3h | Low (docs only) | ⭐⭐ |
| Session cache only | 20–25k | 4–5h | Low (analytics) | ⭐⭐⭐ |
| Drop unused tools | 5–15k | 1–2h | **HIGH** (breaking change) | ⭐ |
| Cloud-hosted embeddings | 60–65k | 30h+ | **CRITICAL** (infra change) | ❌ |
| LLM-based tool selection | 50k | 20h+ | **HIGH** (non-deterministic) | ⭐⭐ |

**Choice Rationale:**
- Skill-gated loading combines impact (40–50k tokens) + safety (backwards compatible) + design fit (reuses Sprint 1297 skill system)
- Phased approach (index → bootstrap → cache) spreads risk
- No breaking changes, no infrastructure additions

---

## Solution Design Summary

### Architecture

```
Agent declares skills: ["financial-analyst", "market-watcher"]
        ↓
Bootstrap calls getAgentContext({ sessionId, skillIds: [...] })
        ↓
Manifest lookup: SKILL_MANIFEST[financial-analyst] ∪ SKILL_MANIFEST[market-watcher]
        ↓
Add always-on tools (system, logging, bootstrap itself)
        ↓
Load filtered tool set (40 tools, ~20k tokens)
        ↓
Agent gets optimized context with 40k+ tokens freed for reasoning
```

### Components

| Component | Owner | Effort | Risk | Status |
|-----------|-------|--------|------|--------|
| **Tool Index** (TOOL_INDEX.md) | BA | 1–2h | Low | Docs-only |
| **Skill Manifest** (SKILL_MANIFEST.md) | BA | 1–1.5h | Low | Single source of truth |
| **Bootstrap Refactor** (agentBootstrap.ts) | Dev | 3–4h | Medium | Code change, but backwards compat |
| **Session Cache** (sessionToolCache.ts) | Dev | 1–1.5h | Low | Infrastructure only |
| **Cron Job** (trackSessionToolUsageJob.ts) | Dev | 1–1.5h | Low | Analytics only |
| **Tests & Validation** | Dev | 2–3h | Medium | High coverage target |

---

## Implementation Phases

### Phase 1299a: Documentation (2–3h, BA-owned)

**Deliverables:**
- ✅ `docs/TOOL_INDEX.md` — All 106 tools with 1-line signatures
- ✅ `docs/SKILL_MANIFEST.md` — 9 skills × tool lists (single SSOT)
- ✅ `.claude/agents/README.md` — Update with skill declaration rules
- ✅ `docs/agent-memory/modules/tool-loading.md` — Analysis + decisions

**Success Criteria:**
- All 106 tools documented (grep validation)
- SKILL_MANIFEST complete + validated against tool-registry.json
- No gaps or inconsistencies

**Gate:** BA signals "manifest validated + ready for developer"

---

### Phase 1299b: Bootstrap Implementation (3–4h, Developer-owned)

**Deliverables:**
- ✅ `src/interface/rest/agentBootstrap.ts` (refactored)
- ✅ `src/domain/skillManifest.ts` (new, static tool lists)
- ✅ `src/__tests__/integration-bootstrap-skills.test.ts` (5 tests)
- ✅ Performance report (bootstrap <100ms cold, <20ms warm)

**Success Criteria:**
- Bootstrap accepts `skillIds?` parameter
- Skill union computation correct
- 3 integration test scenarios pass (legacy, 1-skill, 3-skill)
- Context size validated: 1-skill agent <30k tokens
- Backwards compatible (no skillIds param → all tools)
- All 6508 existing tests still pass

**Gate:** Integration tests pass, performance targets met

---

### Phase 1299c: Analytics (2–3h, Developer-owned)

**Deliverables:**
- ✅ `src/infrastructure/cache/sessionToolCache.ts` (new LRU cache)
- ✅ `src/infrastructure/scheduler/trackSessionToolUsageJob.ts` (new cron)
- ✅ `docs/agent-memory/modules/tool-usage-stats.json` (generated)
- ✅ `docs/agent-memory/modules/tool-loading.md` (updated with findings)

**Success Criteria:**
- Session cache operational (get/set/evict/TTL all work)
- Cron job runs every 8 hours
- Histogram output valid JSON
- Usage stats tracked for future optimization

**Gate:** Cron runs successfully, stats generated

---

## Success Metrics (Post-Sprint)

| Metric | Current | Target | Method | Owner |
|--------|---------|--------|--------|-------|
| **Tool context** | 65k tokens | <30k tokens | Count tool tokens in bootstrap output | QA |
| **Agent reasoning** | ~50k tokens | ~90k tokens | Context allocation audit | QA |
| **Skill coverage** | 100% (all) | 95% (filtered) | Verify all expected tools load | Dev |
| **Bootstrap perf** | N/A | <100ms cold | Profiler on computeSkillUnion() | Dev |
| **Cache perf** | N/A | <20ms warm | Timer on cache.get() | Dev |
| **Test baseline** | 6508 PASS | 6508+ PASS | `bun test` full suite | Dev |
| **User impact** | Briefings cut | Briefings complete | QA smoke test (agent context <30k) | QA |

---

## Risk Assessment & Mitigation

### Risk 1: Tool Manifest Incomplete

**Probability:** Medium | **Impact:** High (agent can't access expected tools)

**Mitigation:**
1. BA validates manually against tool-registry.json
2. Developer runs integration test with live agents (news-scout, financial-analyst, etc.)
3. Grep validation: all 106 tools present in manifest
4. Code review: Architect checks manifest coverage

**Contingency:** If gaps found, revert to Phase 1 (re-validate manifest) before proceeding to Phase 2.

---

### Risk 2: Skill-Tool Mapping Wrong

**Probability:** Medium | **Impact:** Medium (agent missing tools mid-workflow)

**Mitigation:**
1. Each skill definition reviewed by BA (understands agent workflow)
2. Developer cross-checks against agent .md files (grep tool calls)
3. Integration test spawns actual agent with skill, verifies all tools load
4. Code review focused on manifest correctness

**Contingency:** Fallback to legacy mode (load all 106 tools) if mapping wrong. Debug manifest, fix, re-test.

---

### Risk 3: Bootstrap Breaks Old Code

**Probability:** Low | **Impact:** High (agent bootstrap fails)

**Mitigation:**
1. Add backwards compatibility: `getAgentContext(sessionId)` → `getAgentContext({ sessionId, skillIds: undefined })`
2. When skillIds not provided, load all 106 tools (legacy behavior)
3. All callers tested (should be 3–5 places)
4. Unit test explicitly validates backwards compat

**Contingency:** Revert bootstrap refactor, run full test suite. No user-facing impact.

---

### Risk 4: Session Cache Memory Leak

**Probability:** Low | **Impact:** Medium (memory usage grows unbounded)

**Mitigation:**
1. LRU cache with max 100 sessions
2. TTL 8 hours (sessions expire automatically)
3. Unit test for eviction logic + TTL
4. Manual heap snapshot after 1000 session loads
5. Cron job monitoring (track cache size every 8h)

**Contingency:** If leak detected, disable cache + investigate. Cron job continues running (analytics unaffected).

---

### Risk 5: Tool Load Still Slow (<100ms fails)

**Probability:** Low | **Impact:** Low (performance regression)

**Mitigation:**
1. Profile computeSkillUnion() with large skill sets
2. If slow, add warmup cache at agent startup
3. Benchmark: union computation on 3 skills = ~2ms expected
4. Session cache warm hit = <20ms

**Contingency:** Accept <100ms if <150ms (still fast). If >200ms, optimize manifest structure or add caching layer.

---

### Risk 6: Unused Tools / Dead Code

**Probability:** Low | **Impact:** Low (future maintenance)

**Mitigation:**
1. Track tool usage via cron job + histogram
2. In Sprint 1302+, review low-usage tools
3. Decision log in tool-loading.md: document why tool is kept
4. Deprecation policy: remove tools after 6 months 0-usage

**Contingency:** No action needed (tool stays). Monitor usage stats quarterly.

---

## Dependencies & Blockers

### Required Before Sprint Start

- ✅ Sprint 1297 (skill system) — COMPLETE. 6 factory skills deployed.
- ✅ Tool registry stable — 106 tools, no major additions planned for sprint.
- ✅ SKILL_MANIFEST.md scope defined — BA understands 9 skills.

### Unblocks Future Work

- **Sprint 1298 (IMF classifier)** — Can proceed with confidence (tool context optimized)
- **Future sprints** — 40k+ tokens available for new features/analysis depth
- **Sprint 1302 (skill bundling)** — Usage stats will inform optimization

---

## Alternative Designs Considered

### Alternative 1: Vector DB Embedding Search

**Idea:** Index tool descriptions in vector DB, agent queries via embedding.

**Evaluation:**
- ✅ Tokens saved: 60–65k (highest)
- ❌ Effort: 20–30h (infra setup, embeddings, vector DB)
- ❌ Risk: HIGH (new infrastructure, cloud dependency)
- ❌ Maintenance: Complex (keep embeddings in sync with tool updates)

**Rejected because:** Adds infrastructure complexity for diminishing returns vs skill-gated approach.

---

### Alternative 2: Global Tool Cache (Not Session-Scoped)

**Idea:** Cache tool set globally, reuse across all sessions.

**Evaluation:**
- ✅ Tokens saved: 40–50k
- ✅ Effort: 5–7h (simpler, no session tracking)
- ❌ Problem: Over-generalizes. Tool usage varies by user workflow + market conditions.
- ❌ Risk: MEDIUM (cache becomes stale, doesn't reflect actual needs)

**Rejected because:** Session-scoped cache is more accurate. Enables future per-user optimization.

---

### Alternative 3: Drop Tools Entirely

**Idea:** Remove least-used tools (bottom 20) from MCP registry.

**Evaluation:**
- ✅ Tokens saved: 5–15k
- ✅ Effort: 1–2h (just delete code)
- ❌ Risk: CRITICAL (breaking change, some agents lose tools)
- ❌ Irreversible (can't easily add tools back)

**Rejected because:** Too risky. Better to filter than remove. Tools are discoverable in edge cases.

---

### Alternative 4: Agent-Specific Profiles

**Idea:** Store per-agent preferred tools in CLAUDE.md.

**Evaluation:**
- ✅ Tokens saved: 40–50k
- ✅ Effort: 6–8h
- ⚠️ Problem: Requires per-agent configuration. More maintenance.
- ⚠️ Risk: MEDIUM (agents can't be flexible, tied to profile)

**Rejected because:** Skill-gated approach is more flexible. Agents can declare different skills per session.

---

## Decision Summary

### What We're Deciding

**To implement Sprint 1299: MCP Tool Context Optimization** with three phases (documentation, bootstrap refactoring, session cache) to reduce tool context from 65k → <30k tokens.

### Key Design Decisions

1. **Skill-gated filtering** (not vector DB, not tool removal)
   - Reuses Sprint 1297 skill system
   - Backwards compatible
   - Flexible (agents declare skills per-session)

2. **Session-scoped cache** (not global)
   - Respects user workflow differences
   - Enables future per-user optimization

3. **Manifest as SSOT** (not scattered)
   - Single source of truth (SKILL_MANIFEST.md)
   - Code reference (skillManifest.ts)
   - Easy to validate + maintain

4. **Analytics via cron job** (not real-time)
   - Lightweight (aggregate every 8h, not every call)
   - Sufficient for usage tracking
   - Enables future optimization

### What We're NOT Doing

- ❌ Cloud infrastructure additions (no vector DB, no Redis)
- ❌ Tool removal (filtering only, no breaking changes)
- ❌ Per-agent profiles (skill declaration is flexible enough)
- ❌ Real-time tool selection (too expensive, overkill)

### Approval Authority

**PO (Product Owner)** — Acting in autonomous mode (CLAUDE.md § "Autonomy mandate"):
- Identified context pressure as HIGH impact problem
- Designed solution that maintains capability + improves quality
- Prioritized by user impact (briefing quality, analysis depth)
- Scheduled within sprint capacity (7–10h = 20% of 40h sprint)

**No user approval required** — User is non-technical. PO is empowered to optimize product.

---

## Handoff Instructions

### For BA Agent

**Read:** `docs/handoffs/TASK_1299a.md`
**Do:** Create TOOL_INDEX.md + SKILL_MANIFEST.md + update agent README
**Time:** 2–3 hours
**Gate:** Signal "manifest validated" when complete

---

### For Developer Agent

**Phased approach:**
1. **After 1299a done:** Read docs/TECH_1299.md + SKILL_MANIFEST.md
2. **Phase 1299b:** Refactor bootstrap + write integration tests (3–4h)
3. **Phase 1299c:** Build session cache + cron job (2–3h)
4. **Testing:** Validate performance targets, regression tests pass

**Gate:** Integration tests pass, perf targets met, full test suite passes

---

### For QA Agent

**After all phases done:**
- Smoke test: spawn agent with ["financial-analyst"], verify context <30k tokens
- Regression test: `bun test`, verify 6508+ tests pass
- Performance test: verify bootstrap <100ms cold
- Report: `reports/TASK_REPORT_1299.md`

**Gate:** All tests pass, smoke test successful

---

## Timeline

| Date | Phase | Status | Owner |
|------|-------|--------|-------|
| **Wed 2026-04-23** | Planning (this doc) | ✅ COMPLETE | PO |
| **Thu 2026-04-24** | 1299a kickoff | → Ready | BA |
| **Fri 2026-04-25** | 1299a delivery | → Expected | BA |
| **Fri 2026-04-25** | 1299b kickoff | → Ready | Dev |
| **Sat 2026-04-26** | 1299b delivery | → Expected | Dev |
| **Sat 2026-04-26** | 1299c kickoff | → Ready | Dev |
| **Sun 2026-04-27** | 1299c delivery | → Expected | Dev |
| **Sun 2026-04-27** | QA smoke test | → Ready | QA |
| **Mon 2026-04-28** | Merge to main | → Expected | Dev |

**Contingency:** If any phase slips, shift timeline +1 day. Total sprint =4.5 days effort (expected delivery Mon 2026-04-28).

---

## Approval Sign-Off

| Role | Name | Status | Date |
|------|------|--------|------|
| Product Owner | PO Agent | ✅ APPROVED | 2026-04-23 |
| Business Analyst | BA Agent | ⏳ PENDING | (Awaiting planning review) |
| Architect | Architect Agent | ⏳ PENDING | (Awaiting TECH_1299.md review) |
| Developer Lead | Developer Agent | ⏳ PENDING | (Awaiting phase 1299a delivery) |
| QA Lead | QA Agent | ⏳ PENDING | (Awaiting dev delivery) |

---

## Document Links

| Document | Purpose | Owner | Status |
|----------|---------|-------|--------|
| `SPRINT_GOAL.md` | Sprint vision + phases | PO | ✅ Created |
| `docs/REQ_1299.md` | Requirements spec | BA | ✅ Created |
| `docs/TECH_1299.md` | Technical design | Architect | ✅ Created |
| `docs/handoffs/TASK_1299a.md` | BA task handoff | BA | ✅ Created |
| `docs/SPRINT_1299_OVERVIEW.md` | Executive summary | PO | ✅ Created |
| `docs/SPRINT_1299_DELIVERABLES.md` | File-by-file artifacts | Dev | ✅ Created |
| `docs/DECISION_SPRINT_1299.md` | This decision record | PO | ✅ Created |

---

**Decision Status:** ✅ APPROVED (PO autonomous decision, 2026-04-23)

**Next Step:** Send to BA for Task 1299a kickoff. Planning phase complete.
