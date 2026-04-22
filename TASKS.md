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
> Sprints 1278–1281 archived: `docs/archive/sprints-1278-1281.md`

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

**Status:** COMPLETE | **Ref:** TECH-1279 | **Goal:** Detect MSCI index inclusion announcements → cascade HIGH alerts to large-cap watchlist | **Size:** M (2 tasks, ~8 hours) | **Report:** reports/TASK_REPORT_1279_FINAL.md

| ID | Title | Status | Layer | Notes |
|----|----|--------|-------|-------|
| 1279a | RED: MSCI inclusion cascade tests | Done | test | 6 assertions; TC-1 to TC-6 PASS; merged to main |
| 1279b | GREEN: Implement MSCI rules + cascadeExecutor | Done | domain+app | 11 GREEN tests PASS; 18 total (7 RED + 11 GREEN); merged ✓ |

---

### Task 1279a — RED: MSCI Inclusion Cascade Tests [DONE]

**context:** docs/handoffs/TASK_1279a.md | **branch:** task/1279a-msci-inclusion-cascade-red-test

**Status:** Merged to main. All 6 RED tests (TC-1 to TC-6) PASS. TC-4 (MSCI_INCLUSION_RULES contract) intentionally FAILED until 1279b implements rules.

---

### Task 1279b — GREEN: Implement MSCI Rules + Integration [DONE]

**context:** docs/handoffs/TASK_1279b.md | **branch:** task/1279b-msci-inclusion-cascade-green-impl

**Status:** Merged to main. All 11 GREEN tests (GC-1 to GC-10 + TC-4 contract) PASS. Full suite: 18 PASS (7 RED + 11 GREEN).

**acceptance_criteria:** ✓ ALL MET
- [x] Implement msciDetector.ts (pure domain service, 155 lines, zero infrastructure imports)
- [x] Add MSCI_INCLUSION_RULES to cascadeEngine.ts (3 rules @ line 2199)
- [x] Add detectMsciCascadePeers() to cascadeExecutor.ts (41 lines @ line 166)
- [x] Integrate into buildCausalChain() step 2e (19 lines @ line 2488)
- [x] 11 GREEN tests (GC-1 to GC-10 + TC-4 contract) all PASS
- [x] Baseline: 6171 → 6187 (+16 assertions) ✓ VERIFIED

---

## Sprint 1280 — URGENT FIX: BCTC Queue Timeout Blocker (FIX-size)

**Status:** Todo | **Goal:** Unblock VPS BCTC fetch with quick parameter flag | **Size:** FIX (≤10 lines) | **Baseline:** 6187

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1280 | FIX: `/api/bctc-fetch-queue` skip-enrichment flag | Todo | interface | Add query param to return queue in <1s without SSC lookups |

---

## Sprint 1281 — Agriculture Weather Cascade Detection (M-size)

**Status:** COMPLETE | **Ref:** TECH-1281 | **Goal:** Detect rainfall/drought events → cascade alerts to agricultural stocks | **Size:** M (2 tasks, ~8 hours) | **Baseline:** 6187 | **Report:** reports/TASK_REPORT_1281_FINAL.md

| ID | Title | Status | Layer | Notes |
|----|----|--------|-------|-------|
| 1281a | RED: Agriculture weather cascade detection tests | Done | test | 8 PASS; 8 assertions total; **merged ✓** |
| 1281b | GREEN: Implement agriculture detector + rules + executor | Done | domain+app | 13 GREEN tests PASS; 21 total (8 RED + 13 GREEN); **merged ✓** |

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

## Sprint 1283 — URGENT: Foreign Flow Service Recovery (INCIDENT 2026-04-22)

**Status:** BLOCKED ON OPS | **Goal:** Add observability + recovery logic for foreign flow ingestion | **Size:** S (2 files, <50 lines)

| ID | Title | Status | Layer | Notes |
|----|----|--------|-------|-------|
| 1283 | BLOCK: Ops diagnose VPS bgapidatafeed endpoint | Blocked | ops | SSH: systemctl status vn-foreign-flow.service, journalctl, curl endpoint |
| 1283a | DEV-READY: Add foreign flow circuit breaker reset tool | Todo | interface | New MCP tool to diagnose + reset CB if stuck |

**Context:** vps_push_log shows 5108 consecutive error pushes (2026-04-22 07:36:55–now), last good push 2026-04-15 07:52:10. Probable causes: VPS endpoint down, field schema changed, circuit breaker tripped. Ops must diagnose first.

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1284 | IMF context sentiment | MEDIUM | Policy vs crisis distinction |
| 1274 | HOSE staleness guard | MEDIUM | >2h old = circuit DEGRADED |
| 1267 | SSC PDF timeout fallback | MEDIUM | Use news chain if OCR fails |
| 1282 | PDF fetch retry (15→30s) | MEDIUM | Exponential backoff on VPS; was mistakenly labeled 1281 |
| 1283b | Foreign flow fallback source | MEDIUM | If primary endpoint unrecoverable, use SSE alt data |
| 1285 | Add rag_analyses + evidence_scores schema | HIGH | Structural additions (L-size) |
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |
| 1287 | FOLLOWUP: Async BCTC enrichment (Option A) | MEDIUM | Background job to populate source_urls, prevents timeout on >100 items (sprint after 1280 merge) |

---
