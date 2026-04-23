# Task Detail Archive — Completed Sprint Details

Archive of completed task detail sections. Active task board → `TASKS.md`.

---

## Sprint 1296: Infrastructure Recovery + IMF Sentiment Integration (13.5h total) — DESIGN PHASE COMPLETE

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1296a | IMF Indicator Research & Trade Mapping | ba | Done | none | 2–3 |
| 1296b | IMF Sentiment Classifier Service | domain | Design Complete | 1296a | 10–11 |

**Goal:** Unblock BCTC historical backfill (OPS-led validation) + plan IMF sentiment integration (BA research → Architect design → Dev implementation).

**Status:** Design phase complete. Task 1296a (IMF research) delivered with 11 cascade rules + confidence scoring. Task 1296b design approved in `docs/TECH_1296b.md`. Ready for Sprint 1297 implementation (10h dev phase).

**Note:** Task 1289g (BCTC portal fix) ready for VPS deployment (~45 min validation). Part A (OPS validation: BCTC portal fix testing) is external to this design, documented in REQ-1296.

---

### Task Details — Sprint 1296

#### 1296a: IMF Indicator Research & Trade Mapping (2–3h) — COMPLETE
**context:** docs/handoffs/TASK_1296a.md | docs/handoffs/TASK_1296a_COMPLETION.md
**Branch:** `task/1296a-imf-research`
**Status:** Done (2026-04-23)

**Scope:**
- [x] Audit `docs/market-analysis.md` for existing 60+ cascade rules
- [x] Research 4 IMF data sources: Official API, REST API (metadata.imf.org), web scraping, Trading Economics
- [x] Evaluate: data freshness lag, reliability (uptime %), availability (free/paid), rate limits
- [x] Create 11 candidate cascade rules (IMF indicator → VN sector → watchlist stocks; exceeds 8–12 minimum)
- [x] Define confidence scoring for imfSentiment field (range 0.0–1.0, thresholds, decay formula)
- [x] Resolve 3 blockers: B1 (IMF REST API selected), B2 (IMF-only Phase 1 confirmed), B3 (0.55 threshold recommended)

**Deliverable:** `docs/RESEARCH_IMF_INDICATORS.md` (3,200+ words, 9 sections)

**Acceptance Criteria:**
- [x] AC-1: 4 IMF sources evaluated + 1 recommended (REST API) with justification
- [x] AC-2: 11 cascade rules documented (exceeds 8–12) + sector sensitivity ranking (banking 0.75, exports 0.72, real estate 0.70)
- [x] AC-3: imfSentiment field specified (schema, confidence scoring formula, 3 scenarios, effort estimate 13.5h)
- [x] AC-4: All blockers resolved (B1 REST API, B2 IMF-only, B3 0.55 threshold) with recommendations

#### 1296b: IMF Sentiment Classifier Service (10–11h total, design 3–4h + dev 10h)
**context:** docs/handoffs/TASK_1296b.md
**Branch:** `task/1296b-imf-classifier`
**Status:** Done (merged 2026-04-23)
**Depends on:** 1296a ✓
**Design Doc:** `docs/TECH_1296b.md` (architecture, DDD contracts, interface specs approved)

**Design Phase (Architect, 3–4h):**
- [ ] Produce `docs/TECH_1296b.md` (architecture, DDD layer mapping, interface contracts)

**Implementation Phase (Dev, 10h):**

RED Phase (2h):
- CREATE: `src/domain/models/imfIndicators.ts` (types, constants)
- CREATE: `src/__tests__/1296b-imf-*.test.ts` (RED: failing assertions)

GREEN Phase (8h):
- CREATE: `src/domain/services/imfDataClassifier.ts` (sentiment logic, pure function)
- CREATE: `src/application/services/imfDataFetcher.ts` (HTTP fetch, circuit breaker, rate limiter)
- CREATE: `src/scheduler/market-data/imfIndicatorPollerJob.ts` (6h refresh cycle)
- CREATE: `src/interface/mcp/tools/macro-analysis/imfSignals.ts` (MCP tool)
- MODIFY: `src/domain/signals/signalTypes.ts` (add imfSentiment field)
- MODIFY: `src/domain/services/cascadeEngine.ts` (add 8–12 IMF rules)
- MODIFY: `src/domain/services/chainSynthesizer.ts` (integrate imfSentiment)
- All tests passing (20+ assertions, RED→GREEN phases)

**Acceptance Criteria:**
- [ ] IMF types + constants defined (ImfIndicator, IMF_INDICATORS)
- [ ] Classifier logic: growth forecast → sentiment mapping, sector impacts
- [ ] Fetcher: circuit breaker + rate limiter wrapping all HTTP calls
- [ ] Signal schema: imfSentiment optional field added and validated
- [ ] Cascade rules: 8–12 IMF-specific rules registered (IMF growth ↑ → banking ↑, etc.)
- [ ] Poller job: 6h cycle, registered in `src/scheduler/cron-registry.ts`
- [ ] MCP tool: `get_imf_signals` callable, returns JSON with indicators + sentiment
- [ ] DDD compliance verified: domain layer imports only domain/Zod/primitives
- [ ] All tests RED→GREEN: 20+ assertions passing, 0 failures

---

## Sprint 1295: Signal Payload Quality Enforcement — Typed Builders (18h total) — COMPLETE

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1295a | Signal Builders (4 classes: Chain, Price, Urgent, Cross) | domain | Done | none | 8 |
| 1295b | Agent Spec Update (01-news-scout, 04-market-watcher) | docs | Done | 1295a | 4 |
| 1295c | Signal Quality Audit Service (monthly cron + dashboard) | application | Done | 1295a | 4 |
| 1295d | Integration Test (E2E: builder → MCP → DB → synthesis) | tests | Done | 1295a, 1295b, 1295c | 2 |

---

### Task Details — Sprint 1295

#### 1295a: Signal Builders (8h, RED phase)
context: docs/handoffs/TASK_1295a.md
- CREATE: src/domain/signals/signalBuilders.ts (4 builder classes + factory functions)
- CREATE: src/__tests__/1295a-signal-builders.test.ts (16 assertions)
- MODIFY: src/domain/signals/index.ts (barrel export builders)
- Each builder: fluent API, enforces required fields, reuses Zod schemas (1293a)

#### 1295b: Signal Payload Quality Pattern Documentation (4h, documentation only)
context: docs/handoffs/TASK_1295b.md
- MODIFY: docs/agent-memory/patterns/signal-payload-quality.md (add Prevention: Use Typed Builders section with 3 builder examples, error handling, benefits checklist)
- Note: Reframed to documentation-only (agents are tool-users, not code implementers; builder patterns belong in code docs, not agent specs)
- No automated tests (documentation task)

#### 1295c: Signal Quality Audit Service (4h, GREEN phase)
context: docs/handoffs/TASK_1295c.md
- CREATE: src/application/services/signalQualityAudit.ts (queryRejectionStats + generateAuditReport)
- CREATE: src/scheduler/audits/monthlySignalQualityJob.ts (cron: 1st month 00:00 UTC, alert threshold 2%)
- CREATE: src/__tests__/1295c-signal-quality-audit.test.ts (10+ assertions)
- MODIFY: src/application/services/index.ts, src/scheduler/cron-registry.ts

#### 1295d: Integration Test (2h, GREEN phase)
context: docs/handoffs/TASK_1295d.md
- CREATE: src/__tests__/1295d-integration-builders-to-synthesis.test.ts (12+ assertions, E2E flow)
- CREATE: docs/agent-memory/modules/signalBuilders.md (module analysis)
- MODIFY: docs/agent-memory/patterns/signal-payload-quality.md (builder prevention section)

---

## Sprint 1289f: BCTC Discovery Layer Rewrite (6-9h total)

**Context:** Historical backfill executed but discovered 0 PDFs. Root cause: script uses non-existent portal URLs and doesn't submit search forms. Requires reverse-engineering VN exchange portals (SSC, HNX, UPCOM) and rewriting discovery logic.

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1289f-inv | Portal Form Investigation (SSC, HNX, UPCOM) | research | Done | none | 2-3 |
| 1289f-dev | Rewrite Discovery Script (hybrid wait strategy) | vps-scripts | Done | 1289f-inv | 3-6 |
| 1289f-test | VPS Testing + Full Backfill Validation | ops | Blocked | 1289f-dev | 1-2 |
| 1289g | **ESCALATED:** Investigate HOSE/HNX/UPCOM Portal URLs | research | Done | none | 2-3 |

---

### Task Details — Sprint 1289f

#### 1289f-inv: Portal Form Investigation (2-3h)
**Branch:** `task/1289f-portal-investigation`
**Context:** `docs/handoffs/TASK_1289_PORTAL_INVESTIGATION.md`

Investigation protocol created in: `docs/BCTC_PORTAL_FORM_INVESTIGATION.md`

**Deliverables:**
- [ ] SSC portal form structure (fields, selectors, submission method)
- [ ] HNX portal form structure (backup)
- [ ] UPCOM portal form structure (fallback)
- [ ] PDF extraction pattern per portal
- [ ] Expected AJAX endpoints or direct URLs
- [ ] Report: `docs/BCTC_PORTAL_DISCOVERY_FINDINGS.md`

#### 1289f-dev: Rewrite Discovery Script (3-6h)
**Branch:** `task/1289f-discovery-rewrite`
**Context:** `docs/handoffs/TASK_1289_DISCOVERY_REWRITE.md`

**Files:**
- MODIFY: `vps-scripts/discover-bctc-urls-browser.py` (complete rewrite)
  - Replace URL-based discovery with form-based search
  - Implement SSC form submission (primary)
  - Implement HNX form submission (fallback 1)
  - Implement UPCOM form submission (fallback 2)
  - Parse result tables for PDF links
  - Maintain JSON output format (url, source, confidence)
- CREATE: `src/__tests__/1289f-discovery-form-submission.test.ts` (8+ assertions)
- MODIFY: `vps-scripts/enrich-bctc-urls.sh` (if needed)

**Success Criteria:**
- Discovery rate ≥80% on test stocks (VNM, BID, FPT) × multiple quarters
- <10s per stock (acceptable for form submission)
- All JSON output valid
- Fallback chain works (SSC → HNX → UPCOM)

#### 1289f-test: VPS Testing + Full Backfill (1-2h)
**Branch:** None (VPS ops)
**Context:** `reports/TASK_DEPLOYMENT_1289f_VALIDATION.md`
**Status:** BLOCKED — Portal URL discovery failed (0/3 tests found PDFs)

**Test Results:**
- VNM 2024 Q4: ❌ FAIL (0 PDFs)
- BID 2024 Q4: ❌ FAIL (0 PDFs)
- FPT 2024 Q4: ❌ FAIL (0 PDFs)

**Blocker:** HOSE portal URL (`https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}`) no longer returns BCTC PDFs in discoverable DOM elements. Portal structure appears to have changed.

#### 1289g: **ESCALATED** — Investigate Portal URLs (2-3h)
**Branch:** `task/1289g-portal-url-investigation`
**Context:** `docs/handoffs/TASK_1289g.md` (completed)
**Depends on:** 1289f-test failure diagnosis
**Status:** Done — Investigation Complete, Fix Implemented, Ready for VPS Deployment

**Actions Completed:**
- [x] Manually inspect HOSE portal structure (confirmed React SPA via curl)
- [x] Verified category=BCTC parameter is correct (portal loads but PDFs not in DOM at expected time)
- [x] Identified root cause: Asynchronous JavaScript rendering, insufficient wait time
- [x] Updated script with extended wait strategy + alternative selectors
- [x] Document findings in `docs/BCTC_PORTAL_URL_FINDINGS_2026.md`
- [x] Commit changes to git (b78323c8)
- [x] QA Approval: All 6 checks passed

**Implementation Summary:**
- **File Modified:** `vps-scripts/discover-bctc-urls-browser.py`
  - Extended wait strategy: 3× retries with 1.5–2s backoff (up to 5.5s total)
  - Alternative selectors: Try "download" links, then manual filter all `<a>` tags
  - Enhanced logging: Debug output for HTTP status, link counts, selector fallbacks
- **Findings Doc:** `docs/BCTC_PORTAL_URL_FINDINGS_2026.md` (complete investigation + rationale)
- **Investigation Script:** `vps-scripts/investigate-bctc-portal.py` (helper for future diagnostics)

**Effort Used:** 2.5–3 hours (investigation + implementation + documentation)

**Success Criteria:**
- [x] Investigation documented in detailed findings file
- [x] Script updated with enhanced discovery logic
- [x] Alternative selectors and retry logic implemented
- [x] Code committed with clear commit message
- [ ] Pending on VPS: ≥2 of 3 validation tests pass (VNM, BID, FPT 2024 Q4)
- [ ] After VPS validation: Unblock 1289f-test for full historical backfill (37 stocks × 8 quarters)
