# Sprint 1299 Overview — MCP Tool Context Optimization

**Status:** PLANNING PHASE ✓ COMPLETE
**Created:** 2026-04-23
**Sprint Start:** 2026-04-24
**Sprint End (Target):** 2026-04-28

---

## Executive Summary

Current system loads all 106 MCP tools (~65k tokens, 32.4% of budget) into every agent, even though each agent only uses 10–25 tools. This wastes massive reasoning capacity, truncates message history, and reduces analysis depth.

**Sprint 1299 solves this** by:
1. **Documenting tools** (BA, 2–3h) → create searchable index + skill-to-tool mapping
2. **Implementing smart loading** (Developer, 3–4h) → bootstrap filters tools by declared skills
3. **Tracking usage** (Developer, 2–3h) → session cache + analytics for future optimization

**Impact:** Frees ~40k tokens (20% of budget) for reasoning depth, multi-turn history, complex analysis.

---

## The Problem (Current State)

### Context Waste

```
Typical agent session budget: 200k tokens
├─ System prompt: 20k (10%)
├─ MCP tools (ALL 106): 65k (32.4%) ← WASTE
├─ Agent context/memory: 30k (15%)
├─ Message history: 25k (12.5%)
└─ Reasoning space: 60k (30%)

If one agent needs 15 tools (~15k tokens):
├─ Actual use: 15k
├─ Waste: 50k tokens unused
└─ Agent must truncate history or drop reasoning steps
```

### Consequences

1. **Truncated message history** — Agent can't see prior reasoning, duplicates analysis
2. **Shallow reasoning** — No room for multi-turn thinking chains
3. **Analysis quality degraded** — Complex cross-validations impossible
4. **Briefing quality suffers** — Digests cut mid-analysis, news chains incomplete

### Why Now?

- Sprint 1297 added 6 factory skills + complexity
- Sprint 1298 adds IMF classifier (more tools, more context pressure)
- User reports: briefings incomplete, /ask answers truncated
- System is hitting context budget ceiling at 200k tokens

---

## The Solution (Sprint 1299)

### 3-Phase Approach

| Phase | Owner | Duration | What | Output |
|-------|-------|----------|------|--------|
| **1299a** | BA | 2–3h | Index + manifest | docs/TOOL_INDEX.md + docs/SKILL_MANIFEST.md |
| **1299b** | Dev | 3–4h | Bootstrap refactor | skill-aware filtering + tests |
| **1299c** | Dev | 2–3h | Cache + analytics | session cache + cron job |

### Phase 1299a: Documentation (BA)

**Deliverables:**
1. `docs/TOOL_INDEX.md` — 1-liner per tool (106 tools, <10k tokens)
   - Enables quick lookup, used by developers in 1299b
2. `docs/SKILL_MANIFEST.md` — skill-to-tools mapping (9 skills)
   - Single source of truth for bootstrap filtering logic
3. `.claude/agents/README.md` — skill declaration rules
   - Explains how to use skill-gated loading
4. `docs/agent-memory/modules/tool-loading.md` — analysis + decisions
   - Documents optimization patterns, future improvements

**Success Metric:** All 106 tools documented, manifests validated against tool-registry.json

---

### Phase 1299b: Smart Bootstrap (Developer)

**Before:**
```typescript
getAgentContext(sessionId) → loads all 106 tools → 65k tokens
```

**After:**
```typescript
getAgentContext({ sessionId, skillIds: ["financial-analyst"] })
  → filter SKILL_MANIFEST[financial-analyst]
  → load ~24 tools + always-on
  → 15k tokens (77% reduction!)
```

**Implementation:**
- Refactor `src/interface/rest/agentBootstrap.ts`
- Add skill filtering logic + backwards compat (no skills param = load all)
- Write integration tests (3 scenarios: 1 skill, 3 skills, no skills)
- Validate: agent with 1 skill loads ≤25 tools

**Files Modified:**
- `src/interface/rest/agentBootstrap.ts` (primary change)
- `src/domain/skillManifest.ts` (new, static tool lists)
- `src/__tests__/integration-bootstrap-skills.test.ts` (new tests)

**Success Metric:** 3 integration tests pass, default context <30k tokens

---

### Phase 1299c: Session Cache + Analytics (Developer)

**Purpose:** Track which tools agents actually use, enable future optimization.

**Components:**
1. **Session Cache** — LRU cache (sessionId → tools loaded)
   - TTL: 8 hours
   - Max: 100 sessions (~1MB memory)
   - File: `src/infrastructure/cache/sessionToolCache.ts`

2. **Cron Job** — Aggregate tool usage every 8h
   - Input: all sessions from cache
   - Output: tool frequency histogram → `docs/agent-memory/modules/tool-usage-stats.json`
   - File: `src/infrastructure/scheduler/trackSessionToolUsageJob.ts`

3. **Agent Memory** — Record findings + future optimizations
   - File: `docs/agent-memory/modules/tool-loading.md` (updated)

**Success Metric:** Cron runs successfully, histogram generated, usage stats tracked

---

## Architecture Changes

### Before (Monolithic Tool Loading)

```
Agent
  ↓
agentBootstrap.getAgentContext()
  ↓
MCP.getAllTools() [106 tools]
  ↓
formatAsContext() [65k tokens]
  ↓
Agent context bloated
```

### After (Skill-Gated Loading)

```
Agent declares skills: ["financial-analyst", "market-watcher"]
  ↓
agentBootstrap.getAgentContext({ skillIds: [...] })
  ↓
computeSkillUnion(skillIds)
  ├─ SKILL_MANIFEST[financial-analyst] = [24 tools]
  ├─ SKILL_MANIFEST[market-watcher] = [26 tools]
  ├─ Union (overlap) = ~35 tools
  └─ Add ALWAYS_ON_TOOLS = 5 tools
  ↓
Load [35+5=40] tools [~20k tokens]
  ↓
sessionToolCache.set(sessionId, [40 tools])
  ↓
Agent context optimized, 45k tokens freed
```

### Layer Changes

**Domain:** No changes to business logic. New file `skillManifest.ts` = static config (read-only).

**Interface:** Bootstrap refactored to accept `skillIds?` parameter. Backwards compatible.

**Infrastructure:** New cache + cron job. No database changes.

---

## Success Metrics

| Metric | Current | Target | How We Measure |
|--------|---------|--------|-----------------|
| **Tool context size** | 65k tokens | <30k tokens | Read from bootstrap token count |
| **Agent reasoning budget** | ~50k tokens | ~90k tokens | Context allocation audit |
| **Tool load time (cold)** | N/A | <100ms | Profiler on computeSkillUnion() |
| **Tool load time (warm)** | N/A | <20ms | Timer on cache.get() |
| **Skill coverage** | 100% (all agents get all tools) | 95% (skill-union coverage) | Availability test (verify all expected tools loaded) |
| **Session cache hit rate** | N/A | >80% (repeat sessions reuse) | Tracked in tool-usage-stats.json |
| **Test baseline** | 6508 PASS | 6508+ PASS | `bun test` full suite (regression check) |

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Tool manifest incomplete** (tool X not in any skill) | Medium | High | BA validates with system-auditor. Grep checks coverage. Dev runs integration test with live agents. |
| **Skill-tool mapping wrong** | Medium | High | Each skill definition reviewed by BA. Developer tests with actual agent workflow. |
| **Bootstrap breaks old code** | Low | High | Backwards compatibility: no skillIds param → loads all 106 tools (legacy mode). |
| **Session cache memory leak** | Low | Medium | Unit test for LRU eviction + TTL. Manual heap snapshot after 1000 sessions. |
| **Tool still slow to load** | Low | Medium | Profile computeSkillUnion(). If slow, add warmup cache at startup. |

---

## Dependencies & Blockers

**Incoming (required before sprint):**
- ✓ Sprint 1297 (skill system) — COMPLETE. 6 factory skills + skill declaration working.
- ✓ Tool registry stable — 106 tools, no major additions planned.

**Outgoing (1299 unblocks):**
- Sprint 1298 (IMF classifier) — Ready for implementation (no tool context bloat)
- Future analysis sprints — Can rely on freed context budget

---

## Effort Breakdown

| Task | Owner | Duration | Effort Category | Notes |
|------|-------|----------|-----------------|-------|
| 1299a: Tool Index + Manifest | BA | 2–3h | Documentation | Search + organize + validate (most time = validation) |
| 1299b: Bootstrap refactoring + tests | Dev | 3–4h | Code + Testing | 1h refactor, 2h tests, 1h validation |
| 1299c: Session cache + cron + analytics | Dev | 2–3h | Code + Testing | 1h cache, 1h cron, 1h testing |
| **Subtotal** | | **7–10h** | | |
| QA smoke test | QA | 1h | Testing | Manual validation (agent context <30k), regression check |
| **Total Sprint** | | **8–11h** | | Typical sprint: 40h. 1299 = 20–27.5% of capacity |

---

## Timeline

| Date | Phase | Deliverable | Gate |
|------|-------|-------------|------|
| **Thu 2026-04-24** | 1299a kickoff | BA reads docs/handoffs/TASK_1299a.md | BA confirms understanding |
| **Fri 2026-04-25** | 1299a delivery | TOOL_INDEX.md + SKILL_MANIFEST.md + agent README | BA signals "manifest validated" |
| **Fri 2026-04-25** | 1299b kickoff | Dev reads TECH_1299.md + SKILL_MANIFEST | Dev confirms understanding |
| **Sat 2026-04-26** | 1299b delivery | Bootstrap refactored + tests pass | Integration test: 1-skill agent loads ≤25 tools |
| **Sat 2026-04-26** | 1299c kickoff | Dev implements cache + cron | Dev confirms structure |
| **Sun 2026-04-27** | 1299c delivery | Session cache + cron job operational | Cron runs, histogram generated |
| **Sun 2026-04-27** | QA smoke test | Manual validation + regression check | All tests pass, context <30k |
| **Mon 2026-04-28** | Merge to main | PR reviewed + merged | Deploy with skill-aware bootstrap |

---

## Rollout Safety Plan

**If bootstrap breaks at runtime:**
1. Revert TASK_1299b only (agentBootstrap.ts)
2. Fall back to legacy mode (load all 106 tools)
3. Continue with 1299a + 1299c (non-blocking)
4. Re-attempt 1299b next sprint with additional testing

**If session cache leaks memory:**
1. Disable cron job (stop accumulating usage stats)
2. Keep cache operational (for performance benefit)
3. Investigate + fix in follow-up task

**No breaking changes for end users.**

---

## Future Optimizations (Sprint 1302+)

### Phase 2: Smart Skill Bundling
- Identify skill combinations that always appear together
- Bundle them as "super-skills" to reduce manifest complexity
- Example: financial-analyst + disclosure-auditor → financial-suite

### Phase 3: Dynamic Tool Discovery
- Agent requests unexpected tool mid-session
- Async reload + cache invalidation
- Silent fallback (agent continues if tool unavailable)

### Phase 4: ML-Based Tool Prefetch
- Track user workflow patterns (session history)
- Predict likely tools for next session
- Pre-warm cache before agent starts

---

## Sign-Off Checklist

**Product Owner (PO):**
- [ ] Sprint goal approved (context optimization = high impact)
- [ ] Effort realistic (7–10h = 20% sprint capacity)
- [ ] Risks understood and mitigated
- [ ] Success metrics clear (65k → <30k tokens)

**Business Analyst (BA):**
- [ ] REQ_1299.md approved (requirements clear)
- [ ] Willing to create TOOL_INDEX + SKILL_MANIFEST
- [ ] Manifest validation strategy defined

**Architect:**
- [ ] TECH_1299.md approved (design sound, no violations)
- [ ] DDD layers respected (no domain changes)
- [ ] Performance targets achievable
- [ ] Backwards compatibility confirmed

**Developer:**
- [ ] Code structure understood (bootstrap refactor)
- [ ] Test strategy clear (3 scenarios)
- [ ] Dependencies resolved (SKILL_MANIFEST ready)

**QA:**
- [ ] Test plan clear (integration + regression)
- [ ] Smoke test scenarios defined
- [ ] Rollback plan available

---

## Documents Created

1. **SPRINT_GOAL.md** ✓ — Sprint vision & phases
2. **docs/REQ_1299.md** ✓ — Requirements specification (BA approval needed)
3. **docs/TECH_1299.md** ✓ — Technical design (Architect approval needed)
4. **docs/handoffs/TASK_1299a.md** ✓ — BA task handoff
5. **TASKS.md** ✓ — Updated with 3 Sprint 1299 tasks
6. **docs/SPRINT_1299_OVERVIEW.md** ✓ — This document

---

## Next Steps

1. **PO (Product Owner):** Review this overview. Approve sprint goal or request changes.
2. **BA Agent:** Read `docs/handoffs/TASK_1299a.md`. Start Task 1299a on Thu 2026-04-24.
3. **Architect:** Review `docs/TECH_1299.md`. Approve or request changes to design.
4. **Developer:** Stand by for Fri 2026-04-25 kickoff. Start with `docs/TECH_1299.md` study + test structure planning.
5. **QA Agent:** Prepare smoke test scenarios (context token count, agent spawning with skills, regression check).

---

**Status:** Ready to launch. Awaiting BA confirmation to begin Sprint 1299a.
