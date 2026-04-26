# Sprint Goal

## Sprint 1340 — Planning Ready (2026-04-26)

**Status:** Blocker resolved. Working tree cleaned. Ready for sprint planning.

**Current State:**
- `currentSprint === 1340` in project-stats.json (awaiting sprint kickoff)
- Working tree clean: stale archive docs deleted, knowledge references updated
- All 359 cleanup commits merged to main
- No WIP tasks blocking new sprint

---

## Retrospective: Sprints 1330–1337 (2026-04-25)

### Sprint 1330 — Test Regression Fixes Post-Phase-0-Merge

**Delivered:**
- Fixed 7 failing test regressions introduced by Phase 0 merge
- 1289c: fallback field normalization
- 1476: WAL threshold message text
- 240: Alert Commander cooldown reset
- 1551: DB isolation assertion

**Result:** 26/26 target tests pass. Baseline restored to 6520 pass / 213 fail.

---

### Sprint 1331 — Single-Writer SQLite Isolation

**Delivered:**
- Isolated `alert-engine.db` and `stock_price.db` to single-writer pattern
- RED tests (1331a) + GREEN implementation (1331b)
- Root cause: macOS Docker VM process tearing SHM on container stop → WAL corruption

**Result:** SQLite corruption eliminated. Named volume replaces bind-mount. 6 recurring corruption reports closed.

---

### Sprint 1332 — Insider Governance Sell-High-Buy-Low Signal

**Delivered:**
- New domain signal: insider governance sell-high-buy-low pattern detection
- RED tests (1332a) + domain implementation (1332b)
- Enriches Alert Commander conviction scoring for value investor workflow

**Result:** Signal added to conviction pipeline. All existing tests stable.

---

### Sprint 1333 — Source Attribution Suffix Stripping

**Delivered:**
- Fix: strip source attribution suffixes before ticker match (e.g., "[VnExpress]" trailing tokens)
- Prevents false-negative ticker detection when news sources append attribution to headlines
- RED tests (1333a) + fix implementation (1333b)

**Result:** Ticker match accuracy improved. Regression locked in test suite.

---

### Sprint 1334 — stock_code Sentinel + CEO Analyst Warning Broadcast

**Delivered:**
- Normalized `stock_code` sentinel values (null/"" coercion)
- CEO analyst warning broadcast to Alert Commander
- TypeScript type errors in signal-filter tests resolved (1334a fix)
- RED tests (1334a) + GREEN implementation (1334b)

**Result:** Sentinel normalization prevents downstream null-coercion bugs. CEO signal reaches market channel.

---

### Sprint 1335 — VPBankS/OKX Crypto Cascade Rules

**Delivered:**
- FR-1: VPBankS crypto exposure cascade rule (banking + fintech)
- FR-2: OKX VN market entry cascade rule (securities sector signal)
- FR-3: Crypto regulatory signal → broad market impact cascade
- Rules BA-approved (FR-1/FR-2/FR-3 APPROVED)
- RED tests (1335a) + GREEN rules (1335b)

**Result:** 3 new cascade rules active in cascadeEngine.ts. Merged to main.

---

### Sprint 1336 — Value Investor Analysis System

**Delivered:**
- 30 analysis ledger files (sectioned by stock/sector)
- New agent: Report Analyzer
- 4 agent modifications: News Scout, Market Watcher, Alert Commander, Unified Agent
- Quarterly conviction synthesis workflow
- `analysis_mode: value_investor` flag in project config
- Phase 2 + Phase 3 implementation documentation

**Result:** Value investor daily batch logging + quarterly synthesis operational. Baseline: 6520 pass / 213 fail.

---

### Sprint 1337 — Infrastructure Hardening

**Delivered:**
- `hour_bucket` migration guard (idempotent schema migration protection)
- Foreign flow circuit breaker timeout tuning
- Polymarket CLOB endpoint circuit breaker bypass (non-critical data source)
- Merged via `merge(1337): infra-db-cb-fixes`

**Result:** Production infrastructure more resilient. 3 failure modes closed.

---

## Sprint 1327 — Phase 0 Merge + Test Infrastructure Stabilization (2026-04-25)

**Goal:** Merge Phase 0 monorepo scaffold to main, activate new test infrastructure, triage + fix pre-existing test failures for stable baseline.

**Vision:** Phase 0 is complete (branch ready, 6796 tests passing). Merging unblocks Phases 1-3 microservices extraction. Stabilizing pre-existing failures improves test confidence and baseline tracking.

**Scope:**
- IN: Merge `feature/ddd-phase-0` to main + verify docker-compose build
- IN: Triage pre-existing failures (15 tests), categorize by root cause
- IN: Fix critical failures (if <2h work per fix); defer architectural (BCTC OCR, bootstrap AC, registry) to Sprint 1328+
- IN: Investigate Bun test crash (memory/resource issue, post-test-run panic)
- OUT: Full Phase 1 microservices extraction (Phase 1a/1b already done; Phase 2a/2b in review)

**Success Metrics:**
- Phase 0 merged to main, docker-compose starts all 9 services without errors
- Test baseline tracked: baseline_current = 6796, baseline_target = 6450 (legacy), failures = 15 (categorized)
- Pre-existing failures categorized by component (BCTC x4, Bootstrap x2, Task Legacy x3, Registry x2, Other x4)
- Bun crash diagnosed (memory pressure, Bun bug, or resource exhaustion)

**Size:** M (5-6h total: 1h merge+verify, 2h triage+categorization, 2-3h fixes)

**Blockers:** None. Phase 0 branch ready.

**Next Agent:** BA (write Requirement Spec for triage + fix plan)

---

## Sprint 1326 — Documentation Cleanup + Phase 0 Monorepo Readiness (2026-04-25)

**Goal:** Archive obsolete task specs (340 files), consolidate organizational rules, validate Phase 0 monorepo scaffold for microservices migration.

**Scope:**
- ✅ Move 89 analysis files → `docs/archive/` (cascade maps, incident reports, BCTC audits)
- ✅ Move 131 REQ/TECH specs → `docs/historical/` (2013-2026 sprint archives)
- ✅ Delete duplicate task specs and obsolete planning docs
- ✅ Restore org rules to CLAUDE.md + tree-map.md
- ✅ Add graphify integration pattern (pattern/graphify-integration.md)
- Phase 0: Validate monorepo scaffold structure + test baseline

**Baseline:** 6796 pass / 15 fail (stable). All Phase 3c tests passing.

**Completion:** Documentation reorganization DONE. Graphify graph updated (57 nodes, 36 edges, 27 communities). Next: Execute Phase 0 merge to activate monorepo test infrastructure.

---

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
