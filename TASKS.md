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
> Sprints 1278–1281 archived: `docs/archive/sprints-1278-1281.md` (includes MSCI inclusion + agriculture weather cascades, BCTC timeout fix, all merged)

---

## Sprint 1282 — Data Freshness Monitoring Tool (S-size)

**Status:** Todo | **Goal:** Eliminate false alarm cascade rule gaps via data freshness detection tool | **Size:** S (2 tasks, 2 files) | **Baseline:** 6187 | **Target:** 6197 (+8 assertions)

| ID | Title | Status | Layer | Notes |
|----|-------|--------|-------|-------|
| 1282a | RED: Data freshness monitoring tool tests | Todo | test | 8 assertions: price/BCTC/news SLA breach + recovery detection |
| 1282b | GREEN: Implement freshness detector + formatter | Todo | interface+domain | Calls `freshnessSlaChecker` domain service, formats alerts |

**Context:** Existing `freshnessSlaChecker.ts` (domain) defines SLA thresholds per signal type. New tool wraps it for interface layer (MCP + future briefing gate-keeping). Prevents cascade alerts when data is stale.

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
| 1283b | Foreign flow fallback source | MEDIUM | If primary endpoint unrecoverable, use SSE alt data |
| 1285 | Add rag_analyses + evidence_scores schema | HIGH | Structural additions (L-size) |
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |
| 1287 | FOLLOWUP: Async BCTC enrichment (Option A) | MEDIUM | Background job to populate source_urls, prevents timeout on >100 items (sprint after 1280 merge) |

---
