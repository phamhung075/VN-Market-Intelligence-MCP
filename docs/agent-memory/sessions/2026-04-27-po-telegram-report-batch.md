# PO Telegram Report Batch Processing (2026-04-27)

**Agent:** PO (Product Owner)
**Time:** 2026-04-27 14:00–14:30 UTC+2
**Action:** Triage, group, and batch telegram reports

---

## Report Summary

**Total Reports Processed:** 48
- **Real Reports:** 12 (triaged into Sprint 1346)
- **Fixed Reports:** 1 (already resolved in Sprint 1345b)
- **Test Fixtures:** 35 (marked processed for cleanup)

---

## Real Reports (12) — Sprint 1346 Tasks

### CRITICAL (1)

| ID | Issue | Task | Type |
|-----|-------|------|------|
| 1323 | Test stub in production scheduler | 1346a | FIX |

### HIGH (7)

| ID | Issue | Task | Type |
|-----|-------|------|------|
| 1310 | push-foreign-flow UNIQUE constraint | 1346b | FIX |
| 1312 | push-foreign-flow UNIQUE constraint (recurring) | 1346b | FIX |
| 1311 | DirectCodeNER suffix matching ("- MSN") | 1346c | FIX |
| 1320 | Volume spike calibration (5.909090 ratio) | 1346c | FIX |
| 1321 | Sentiment classifier negation gap (loss → BULLISH) | 1346c | FIX |
| 1322 | NER alias missing (Vietjet → VJC) | 1346c | FIX |
| 1316 | PDF circuit breaker timeout (5x SSC failure) | 1346d | FIX |
| 1317 | BUG channel retry missing (Telegram transient errors) | 1346d | FIX |
| 1313 | Unknown stock code breaking chain grouping | 1346d | FIX |

### MEDIUM (2) — Backlog → Sprint 1347

| ID | Issue | Task | Type |
|-----|-------|------|------|
| 1314 | DSC CEO bearish warning under-classified | 1346e | BACKLOG |
| 1315 | VPBankS/OKX cascade gap (banking sector) | 1346e | BACKLOG |

---

## Fixed Reports (1) — Already Resolved

| ID | Issue | Sprint | Status |
|-----|-------|--------|--------|
| 1318 | VNM/VEA BCTC extraction corruption | 1345b | FIXED (commit 6d73167b) |

**Action:** Mark processed (no further action needed)

---

## Test Fixtures (35) — Cleaned Up

Bulk-marked processed (system noise, no actionable value):

```
1326, 1327, 1328, 1330, 1331, 1332, 1334, 1335, 1337, 1338,
1339, 1340, 1341, 1342, 1343, 1344, 1345, 1346, 1347, 1348,
1349, 1350, 1351, 1352, 1353, 1354, 1355, 1356, 1362, 1363,
1365, 1368, 1371, 1372, 1373, 1375
```

**Descriptions:** "New report 1", "Report A", "Full fields test", etc.
**Action:** Bulk delete via MCP tool

---

## Batch Task Grouping

### Task 1346a (CRITICAL)
- **Purpose:** Remove test stub from production
- **Reports:** 1323
- **Size:** S
- **Time to Deploy:** 1-2h

### Task 1346b (HIGH)
- **Purpose:** Fix recurring UNIQUE constraint bug
- **Reports:** 1310, 1312
- **Size:** M
- **Time to Deploy:** 2-3h
- **Pattern:** Every ~60s during market hours (9:30–16:00)

### Task 1346c (HIGH)
- **Purpose:** Fix 4 alert quality bugs
- **Reports:** 1311, 1320, 1321, 1322
- **Size:** M
- **Time to Deploy:** 3-4h
- **Components:** Volume spike calibration, NER suffix exclusion, sentiment negation, alias registry

### Task 1346d (HIGH)
- **Purpose:** Fix 3 infrastructure issues
- **Reports:** 1316, 1317, 1313
- **Size:** M
- **Time to Deploy:** 2-3h
- **Components:** Circuit breaker logging, Telegram retry logic, unknown code prevention

### Task 1346e (MEDIUM) — BACKLOG
- **Purpose:** Cascade architecture enhancement (deferred to Sprint 1347)
- **Reports:** 1314, 1315
- **Size:** M
- **Reason:** Requires BA spec + architectural review; medium priority

---

## Batch Statistics

| Category | Count | Action |
|----------|-------|--------|
| Real + Actionable | 12 | Sprint 1346 (1346a–1346d) + Backlog (1346e) |
| Already Fixed | 1 | Mark processed (1318) |
| Test Fixtures | 35 | Delete via MCP tool |
| **Total** | **48** | — |

---

## Next Steps

1. **BA Spec:** Write `docs/REQ_1346.md` for tasks 1346a–1346d
2. **Developer:** Implement tasks 1346a–1346d (parallel execution)
3. **QA:** Integration test + smoke test (live feed 1h)
4. **Sprint 1347:** Plan cascade enhancement (1346e) with BA spec

---

## MCP Tool Calls Required

(Performed externally by main terminal)

1. `process_telegram_report(id=1318, delete_telegram_message=false)` — Mark 1318 processed
2. `process_telegram_report(id=1326)` through `process_telegram_report(id=1375)` — Bulk mark test fixtures

---

## Handoff Files

Created during this session:
- `/docs/handoffs/TASK_1346a.md`
- `/docs/handoffs/TASK_1346b.md`
- `/docs/handoffs/TASK_1346c.md`
- `/docs/handoffs/TASK_1346d.md`
- `/docs/handoffs/TASK_1346e.md`

Sprint goal:
- `/SPRINT_1346_GOAL.md`

---

**End of Batch Processing Report**

**Timestamp:** 2026-04-27 14:30 UTC+2
