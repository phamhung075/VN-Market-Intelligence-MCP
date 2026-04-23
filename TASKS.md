# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`
> Sprints 182–189 archived: `docs/archive/sprints-182-189.md`
> Sprints 190–220 archived: `docs/archive/sprints-190-220.md`
> Sprints 221–230 archived: `docs/archive/sprints-221-230.md`
> Sprints 231–239 archived: `docs/archive/sprints-231-239.md`
> Sprints 240–240 archived: `docs/archive/sprints-240-240.md`
> Sprints 1269–1277 archived: `docs/archive/sprints-1269-1277.md`
> Sprints 1278–1282 archived: `docs/archive/sprints-1278-1282.md` (includes MSCI inclusion + agriculture weather cascades + data freshness monitoring tool, BCTC timeout fix, all merged)
> Sprints 1282–1289 archived: `docs/archive/sprints-1282-1289.md` (includes data freshness monitoring tool, foreign flow circuit breaker diagnostics, insider selling sentiment fix, BCTC async queue enrichment, foreign flow fallback fetcher, parse errors root-cause fix, all merged)
> Sprints 1290–1290 archived: `docs/archive/sprints-1290-1290.md` (includes foreign flow fallback fetcher integration into scheduler job, merged)
> Sprints 1291–1294 archived: `docs/archive/sprints-1291-1294.md` (includes Alert signal payload schema hardening + Signal Payload Enrichment & BCTC Fallback Resilience, 6 subtasks total, all merged)
> Sprints 1295a archived: Signal Builders completed (fluent API, 4 classes, 16 tests, DDD compliant, merged)

---

## Sprint 1295: Signal Payload Quality Enforcement — Typed Builders (18h total)

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1295a | Signal Builders (4 classes: Chain, Price, Urgent, Cross) | domain | Done | none | 8 |
| 1295b | Agent Spec Update (01-news-scout, 04-market-watcher) | docs | Review | 1295a | 4 |
| 1295c | Signal Quality Audit Service (monthly cron + dashboard) | application | Review | 1295a | 4 |
| 1295d | Integration Test (E2E: builder → MCP → DB → synthesis) | tests | Review | 1295a, 1295b, 1295c | 2 |

---

### Task Details — Sprint 1295

#### 1295a: Signal Builders (8h, RED phase)
context: docs/handoffs/TASK_1295a.md
- CREATE: src/domain/signals/signalBuilders.ts (4 builder classes + factory functions)
- CREATE: src/__tests__/1295a-signal-builders.test.ts (16 assertions)
- MODIFY: src/domain/signals/index.ts (barrel export builders)
- Each builder: fluent API, enforces required fields, reuses Zod schemas (1293a)

#### 1295b: Agent Spec Update (4h, documentation)
context: docs/handoffs/TASK_1295b.md
- MODIFY: .claude/agents/01-news-scout.md (add builder import + usage)
- MODIFY: .claude/agents/04-market-watcher.md (add builder import + usage)
- MODIFY: docs/agent-memory/patterns/signal-payload-quality.md (prevention pattern)
- No automated tests (manual review + agent simulator)

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

---

## Sprint 1289f: BCTC Discovery Layer Rewrite (6-9h total)

**Context:** Historical backfill executed but discovered 0 PDFs. Root cause: script uses non-existent portal URLs and doesn't submit search forms. Requires reverse-engineering VN exchange portals (SSC, HNX, UPCOM) and rewriting discovery logic.

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1289f-inv | Portal Form Investigation (SSC, HNX, UPCOM) | research | Done | none | 2-3 |
| 1289f-dev | Rewrite Discovery Script (hybrid wait strategy) | vps-scripts | Done | 1289f-inv | 3-6 |
| 1289f-test | VPS Testing + Full Backfill Validation | ops | Blocked | 1289f-dev | 1-2 |
| 1289g | **ESCALATED:** Investigate HOSE/HNX/UPCOM Portal URLs | research | Todo | none | 2-3 |

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
**Context:** `docs/handoffs/TASK_1289g.md` (handoff complete, ready for developer assignment)
**Depends on:** 1289f-test failure diagnosis
**Status:** Handoff Ready — Waiting for Developer Assignment

**Actions:**
- [ ] Manually inspect HOSE portal structure using browser DevTools
- [ ] Verify if category=BCTC parameter still works or needs update
- [ ] Check if PDFs moved to different section/API
- [ ] Test SSC official portal (congbothongtin.ssc.gov.vn) as alternative
- [ ] Update script with correct portal URLs
- [ ] Re-run validation tests (target: ≥2/3 success)
- [ ] Document findings in `docs/BCTC_PORTAL_URL_FINDINGS_2026.md`

**Effort Estimate:** 2-3 hours (reverse-engineer portal structure, update script, re-test)

**Success Criteria:**
- At least 2 of 3 validation tests pass (VNM, BID, FPT 2024 Q4)
- After fix: return to 1289f-test for full backfill execution

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---
