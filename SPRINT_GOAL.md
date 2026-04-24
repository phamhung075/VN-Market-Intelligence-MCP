# Sprint Goal

## Sprint 1311 — Backlog Drain: Schema Migrations + Sentiment + Macro Fixes (2026-04-24)

**Goal:** Fix 7 production bugs from 24-report backlog (2026-04-14/15). All recurring-module failures addressed.

**Scope:**

| Task | Title | Size | Reports |
|------|-------|------|---------|
| 1311a | Schema migration: verdict columns in market_messages | S | 1265 |
| 1310a | push-foreign-flow UNIQUE dedup diagnosis + fix | S | 1275,1277,1280 |
| 1309a | Cascade gaps: Hormuz / govt securities / agri exclusion | M | 1264,1268,1286 |
| 1308a | Sentiment: insider SELLING + global bearish macro | S | 1272,1278,1284 |
| 1307a | Macro cooldown bypass + briefing direction label | S | 1269,1270,1276 |

**Out of scope:** VPS ops (HOSE stale price, PDF local-route) → ops agent via UNBLOCK 1306. MSCI neutral rating (1279) → defer, requires product decision.

**Success metrics:**
- `batch_review_market_messages` verdict persists across loops (IDs don't re-appear)
- No UNIQUE constraint errors in push-foreign-flow logs
- "Xả hàng 9M cổ phiếu" → BEARISH; "IMF hạ dự báo" → BEARISH
- Macro USD/VND fires max 1x/day; morning briefing shows correct σ direction
- Hormuz → BSR BULLISH + VJC BEARISH; govt support → SSI/VCI BULLISH
- Test baseline 6629 → 6649+ (20 new tests across 5 tasks)

**baseline_pass:** 6629

---

## Sprint 1299 — MCP Tool Context Optimization (2026-04-23)

**Goal:** Reduce default MCP tool context load from 65k tokens → <30k tokens while maintaining quality and agent capability.

**Vision:**
- Currently, every agent bootstrap loads ALL 106 tools (~65k tokens = 32.4% of context budget)
- Problem: destroys reasoning capacity, reduces message history, forces tool culling mid-conversation
- Solution: Implement three-part optimization (tool index + skill-gated loading + session memory cache) to free ~40k tokens for agent intelligence

**Scope:**

| Phase | Title | Owner | Duration | Status |
|-------|-------|-------|----------|--------|
| 1299a | Tool Index + Reference Docs | BA | 2–3h | Todo |
| 1299b | Skill-Gated Loading (code + bootstrap) | Developer | 3–4h | Todo |
| 1299c | Session Memory Cache (cron + tracking) | Developer | 2–3h | Todo |

**Acceptance Criteria:**

| Phase | Success Metric |
|-------|---|
| **1299a** | ✓ Tool Index created: `docs/TOOL_INDEX.md` (1-liner per tool, <10k tokens). Skill manifest created: `docs/SKILL_MANIFEST.md` (per-skill tool map). Agent doc updated with loading rules. |
| **1299b** | ✓ Bootstrap logic updated: `src/interface/rest/agentBootstrap.ts` (skill-aware tool filtering). Unit tests pass. Manual test: launch agent with 1 skill → loads ≤25 tools (not all 106). |
| **1299c** | ✓ Session cache added: `src/infrastructure/cache/sessionToolCache.ts` (LRU, TTL=8h). Cron job `trackSessionToolUsage.ts` populates stats. Agent memory auto-updated: `docs/agent-memory/modules/tool-loading.md` (usage patterns). |
| **Baseline** | ✓ Token count verified: default bootstrap <30k (pre-tool inflation). Agent reasoning window expands 40k+ tokens. Test baseline stable (6508/6508). |

**Why:**

1. **Context pressure**: 65k tool context → agent forced to truncate reasoning/history
2. **Feature debt**: agents can't maintain multi-message reasoning chains
3. **UX impact**: briefings cut short, /ask answers incomplete, alerts less nuanced
4. **Solution fits constraints**: no API costs, no new infra, uses existing skill system (Sprint 1297)

**Effort:** ~7–10h total (a + b + c)

**Priority:** HIGH (restores reasoning depth, enables complex analysis, no dependencies on other sprints)

**Dependencies:**
- Sprint 1297 (skill system) ✓ COMPLETE
- No blockers on external APIs/infrastructure

**Metrics (Baseline vs Target):**

| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| Default tool context | 65k tokens | <30k tokens | bootstrap token count (via `/health` extension) |
| Agent reasoning budget | ~50k tokens | ~90k tokens | context allocation audit |
| Tool load time | N/A | <100ms | session cache hit rate |
| Skill coverage | 100% (all agents receive all tools) | 95% (agent gets only skills' tools + common) | coverage analysis in test suite |
| Test baseline | 6508 PASS | 6508+ PASS | bun test full suite |

**Post-Sprint:** Archive to `docs/archive/SPRINT_GOAL_ARCHIVE.md`

---

> **Decision Log:**
> - Why not vector DB for tool lookup? (Token cost stays same, adds infra. Chose filter+cache instead.)
> - Why session cache vs global? (Session-scoped tools shift per user workflow. Cache respects that. Global would over-generalize.)
> - Why not drop tools? (No. Tools are discoverable by agents in edge cases. Index + loading = safe filtering, not removal.)

---

## Sprint 1298: IMF Sentiment Classifier Implementation (10–11h total) — Todo

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1298a | IMF Sentiment Classifier — RED tests + domain models | domain/tests | Todo | TECH_1296b.md | 3–4 |
| 1298b | IMF Fetcher + Poller Job + Cron Registration | application/scheduler | Todo | 1298a | 4–5 |
| 1298c | Signal Integration + MCP Tool + GREEN tests | domain/interface/tests | Todo | 1298b | 3–4 |

**Goal**: Implement TECH_1296b.md design — IMF macro sentiment enriches ChainCatalyst conviction scoring via 11 cascade rules. Full spec: `docs/REQ_1298.md`. Design: `docs/TECH_1296b.md`.

**Status**: BA spec complete. Queued for Developer.

---
