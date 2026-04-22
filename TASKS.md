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

---

## Sprint 1278 — CEO Insider Selling Sentiment Cascade (M-size)

**Status:** COMPLETE | **Ref:** TECH-1278 | **Goal:** Detect insider selling sentiment → cascade to banking sector alerts | **Size:** M (2 tasks, 5–7 hours total) | **Report:** reports/TASK_REPORT_1278b.md

| ID | Title | Status | Layer | Notes |
|----|----|--------|-------|-------|
| 1278a | RED: Insider dump sentiment cascade tests | Done | test | 6 assertions; TC-1 to TC-6 all PASS |
| 1278b | GREEN: Implement INSIDER_DUMP_RULES + cascadeExecutor | Done | domain+app | 13 GREEN tests PASS; 16 total (6 RED + 10 GREEN); merged to main |

---

## Sprint 1275 (Tier 2) — Foreign Flow Multi-Date UNIQUE Edge Cases (M-size)

| ID | Title | Status | Type | Notes |
|----|----|--------|------|-------|
| 1280 | Test: UNIQUE(code, date) rolling window (same stock, different dates) | Todo | Test | Validates constraint doesn't break multi-date inserts |

---

## Sprint 1264 (Tier 2) — Hormuz Strait Cascade (M-size)

| ID | Title | Status | Type | Notes |
|----|----|--------|------|-------|
| 1264 | Add geopolitical cascade: Hormuz closure → shipping/energy ALERTS | Todo | Sprint | Links oil surge to FPT/VSA/PVD/PLX signals |

---

## Sprint 1279 — MSCI Inclusion Cascade Detection (M-size)

**Status:** ACTIVE | **Ref:** TECH-1279 | **Goal:** Detect MSCI index inclusion announcements → cascade HIGH alerts to large-cap watchlist | **Size:** M (2 tasks, ~8 hours) | **Report:** (pending)

| ID | Title | Status | Layer | Notes |
|----|----|--------|-------|-------|
| 1279a | RED: MSCI inclusion cascade tests | Todo | test | 6 assertions; TC-1,2,3,5,6 PASS, TC-4 intentional FAIL |
| 1279b | GREEN: Implement MSCI rules + cascadeExecutor | Backlog | domain+app | Blocked by 1279a; msciDetector.ts, MSCI_INCLUSION_RULES, detectMsciCascadePeers() |

---

### Task 1279a — RED: MSCI Inclusion Cascade Tests

**context:** docs/handoffs/TASK_1279a.md

**acceptance_criteria:**
- Given MSCI keywords (nộp danh sách, đáp ứng tiêu chí, chỉ số msci) in news text
- When classifySentiment() or buildCausalChain() called
- Then sentiment.direction="bullish", confidence >0.7, TC-1–TC-6 (5 PASS, 1 SKIP/FAIL expected)

**branch:** task/1279a-msci-inclusion-cascade-red-test

---

### Task 1279b — GREEN: Implement MSCI Rules + Integration

**context:** docs/handoffs/TASK_1279b.md

**acceptance_criteria:**
- Given MSCI keywords at credibility ≥0.7 (Reuters/SSC/Bloomberg)
- When detectMsciCascadePeers() called with watchlist
- Then returns large-cap stocks only (MWG, KDH, FPT, MSN, VCB, HPG, BID, CTG), no sector peers

**depends_on:** 1279a ✓ (RED merged)

**branch:** task/1279b-msci-inclusion-cascade-green-impl

---

## Sprint 1280 — URGENT FIX: BCTC Queue Timeout Blocker (FIX-size)

**Status:** Todo | **Goal:** Unblock VPS BCTC fetch with quick parameter flag | **Size:** FIX (≤10 lines) | **Baseline:** 6187

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1280 | FIX: `/api/bctc-fetch-queue` skip-enrichment flag | Todo | interface | Add query param to return queue in <1s without SSC lookups |

---

## Sprint 1281 — Agriculture Weather Cascade Detection (M-size)

**Status:** ACTIVE | **Ref:** TECH-1281 | **Goal:** Detect rainfall/drought events → cascade alerts to agricultural stocks | **Size:** M (2 tasks, ~8 hours) | **Baseline:** 6187 | **Report:** (pending)

| ID | Title | Status | Layer | Notes |
|----|----|--------|-------|-------|
| 1281a | RED: Agriculture weather cascade detection tests | Review | test | 7 PASS, 1 FAIL (TC-4 contract test); 8 assertions total |
| 1281b | GREEN: Implement agriculture detector + rules + executor | Backlog | domain+app | Blocked by 1281a; agricultureDetector.ts, AGRICULTURE_WEATHER_RULES, detectAgricultureCascadePeers() |

---

### Task 1281a — RED: Agriculture Weather Cascade Tests

**context:** docs/handoffs/TASK_1281a.md

**acceptance_criteria:**
- Given weather keywords (mưa lớn, hạn hán, bão, rét đậm) in news text
- When detectAgricultureWeatherKeywords() called
- Then matched=true, impactType in [rainfall|drought|storm|cold_snap], confidence >0.2, TC-1 through TC-7 PASS

**branch:** task/1281a-agriculture-cascade-red-test

---

### Task 1281b — GREEN: Implement Agriculture Detector + Rules + Integration

**context:** docs/handoffs/TASK_1281b.md

**acceptance_criteria:**
- Given agriculture weather keywords at credibility ≥0.6 (Reuters/VnExpress)
- When detectAgricultureCascadePeers() called with watchlist
- Then returns agriculture-domain stocks only (VNR, BFC, QNT, ANV, MPC, ASM), excludes tech/banking, all GREEN tests PASS

**depends_on:** 1281a ✓ (RED tests pass + merged)

**branch:** task/1281b-agriculture-cascade-green-impl

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1284 | IMF context sentiment | MEDIUM | Policy vs crisis distinction |
| 1274 | HOSE staleness guard | MEDIUM | >2h old = circuit DEGRADED |
| 1267 | SSC PDF timeout fallback | MEDIUM | Use news chain if OCR fails |
| 1282 | PDF fetch retry (15→30s) | MEDIUM | Exponential backoff on VPS; was mistakenly labeled 1281 |
| 1283 | franceSummaryJob missing schema | MEDIUM | Add pre-flight checks |
| 1285 | Add rag_analyses + evidence_scores schema | HIGH | Structural additions (L-size) |
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |
| 1287 | FOLLOWUP: Async BCTC enrichment (Option A) | MEDIUM | Background job to populate source_urls, prevents timeout on >100 items (sprint after 1280 merge) |

---
