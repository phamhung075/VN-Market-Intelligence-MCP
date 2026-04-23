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
> **Sprints 1289f, 1295, 1296 detail sections archived:** → `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprint 1296: Infrastructure Recovery + IMF Sentiment Integration (13.5h total) — DESIGN PHASE COMPLETE

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1296a | IMF Indicator Research & Trade Mapping | ba | Done | none | 2–3 |
| 1296b | IMF Sentiment Classifier Service | domain | Design Complete | 1296a | 10–11 |

**Goal:** Unblock BCTC historical backfill (OPS-led validation) + plan IMF sentiment integration (BA research → Architect design → Dev implementation).

**Status:** Design phase complete. Task 1296a delivered with 11 cascade rules. 1296b design approved. Ready for Sprint 1297 implementation. Detailed specs → `docs/archive/TASK_DETAILS_ARCHIVE.md`.

---

## Sprint 1297: Critical System Reliability & BCTC Historical Backfill (7–11h total) — PLANNING

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1297a | Audit Phase II — Fail-Loud Protocol Injection (14 agents) | docs | Backlog | none | 2–3 |
| 1297b | BCTC Portal URL Discovery Fix (unblock historical backfill) | vps-scripts | Backlog | none | 4–6 |
| 1297c | VPS Validation of BCTC Portal Fix | ops | Backlog | 1297b | 1–2 |

**Goal:** Fix two critical blockers: (1) remaining 14 agent files lack fail-loud protocol (robustness), and (2) BCTC portal discovery script has broken URLs (blocks 37×8 historical backfill).

**Status:** PLANNING — 1297a ready to queue for PM, 1297b ready to queue for Developer, 1297c awaits 1297b completion.

---

### Task Details — Sprint 1297

#### 1297a: Audit Phase II — Fail-Loud Protocol Injection (2–3h)
**Status:** Backlog (ready to start)
**Owner:** PM
**Context:** Sprint 1296 (and recent audit) added fail-loud protocol sections to 5 critical agents (ba.md, architect.md, developer.md, fixer.md, pm.md). Remaining 14 agents (.claude/agents/*.md) still lack these sections.

**Files to Modify:**
- qa.md, code-janitor.md, po.md, system-auditor.md, unified-agent.md, ops.md, claude-manager-helper.md
- 01-news-scout.md, 02-financial-analyst.md, 04-market-watcher.md, 05-alert-commander.md, 06-digest-predict.md, 07-qa-responder.md, cowork-refactory-expert.md, idea-forge.md, market-analyst.md

**Scope:**
- Add identical "Fail-Loud Lazy-Load Protocol" section to each agent file
- Section must reference `.claude/knowledge/fail-loud-protocol.md` for full protocol details
- Format: copy from ba.md (template) and adapt role context if needed
- Validation: confirm all 22 agents have the section (simple grep check)

**Acceptance Criteria:**
- [ ] All 14 remaining agent files updated with fail-loud protocol sections
- [ ] Each section references `.claude/knowledge/fail-loud-protocol.md`
- [ ] Commit message clearly states "Audit 1297a" + "14 agents"
- [ ] Verification: `grep -l "fail-loud protocol" .claude/agents/*.md | wc -l` returns 22

#### 1297b: BCTC Portal URL Discovery Fix (4–6h)
**Status:** Backlog (waiting for developer)
**Owner:** Developer
**Context:** Task 1289g investigation identified broken BCTC portal URLs. Validation test (0/3 stocks returned PDFs) failed. Root cause: HOSE URL returns 404, HNX/UPCOM PDFs non-discoverable.

**Files to Modify:**
- `vps-scripts/discover-bctc-urls-browser.py` (primary)
- `docs/BCTC_PORTAL_URL_FINDINGS_2026_UPDATED.md` (findings + rationale, updated)

**Scope:**
- Investigate current HOSE BCTC disclosure endpoint (manual curl + browser inspection)
- Check if HNX serves PDFs via API or requires different page structure
- Fix or bypass UPCOM SSL certificate issue
- Update `discover_from_hose()`, `discover_from_hnx()`, `discover_from_upcom()` with correct URLs
- Re-test with 3 stocks (VNM, BID, FPT 2024 Q4) — **target: ≥2/3 pass**

**Acceptance Criteria:**
- [ ] Current HOSE BCTC portal URL identified and verified (HTTP 200 + returns PDF links)
- [ ] HNX portal structure mapped (AJAX endpoints or direct URLs confirmed)
- [ ] UPCOM SSL issue resolved (bypass or correct endpoint)
- [ ] Script updated with 3 working fallback chains
- [ ] Re-test: VNM 2024 Q4 returns ≥1 PDF URL, BID 2024 Q4 returns ≥1 PDF URL
- [ ] Code committed with clear rationale for URL changes
- [ ] Update findings doc with solution summary

#### 1297c: VPS Validation of BCTC Portal Fix (1–2h)
**Status:** Backlog (depends on 1297b)
**Owner:** Ops
**Context:** After 1297b completes and URLs are fixed, OPS must validate on Vinahost VPS and execute full historical backfill.

**Scope:**
- Deploy fixed script to VPS
- Re-run 3 test stocks (VNM, BID, FPT 2024 Q4)
- Confirm ≥2/3 tests pass (return valid PDF URLs)
- Execute full historical backfill: all 37 stocks × 8 quarters (Q1 2023–Q4 2024)
- Verify DB ingestion completes without errors

**Acceptance Criteria:**
- [ ] Script deployed to VPS
- [ ] Test validation: ≥2/3 stocks pass (URLs returned + PDFs downloadable)
- [ ] Full backfill executed: 37 stocks × 8 quarters in DB
- [ ] Spot-check 5 random BCTC records in DB (verify PE, PB, ROE fields populated)
- [ ] Report: `reports/TASK_REPORT_1297c.md` summarizing results

---



## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---
