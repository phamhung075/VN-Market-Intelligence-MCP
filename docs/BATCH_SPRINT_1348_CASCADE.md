# Batch: Sprint 1348 — Cascade Architecture Enhancement

**Batch ID:** `SPRINT_1348_CASCADE_ENHANCEMENT`

**Initiation Date:** 2026-04-27 15:30 UTC+2

**Status:** PENDING_1346a_MERGE

**Type:** SPRINT-S (Small architecture enhancement with 5 sequential tasks)

---

## Related Reports — Grouping

### Primary Reports (Cascade Routing)

| Report ID | Title | Severity | Root Cause | Impact |
|-----------|-------|----------|-----------|--------|
| **1314** | DSC CEO bearish warning — impact_chain narrow | MEDIUM | cascadeEngine lacks market-wide policy | Morning briefing loses brokerage sector sentiment |
| **1315** | VPBankS/OKX crypto — banking cascade incomplete | MEDIUM | Missing COMPETITIVE_THREAT signal type | Analysis misses fintech disruption threats |

### Report Relationship

Both reports stem from same architectural limitation: **cascadeEngine.ts routes individual tickers but cannot handle sector-wide policy-based signals or competitive threat dynamics.**

**Single Root Cause:**
```
cascadeEngine v1 = hardcoded peer routing (DSC → {ACB, TVS} only)
Solution = cascadeEngine v2 = semantic signal + policy layer
```

---

## Batch Composition

**Total Tasks:** 5 (1348a–1348e)

**Total Duration:** M sprint (8–10 hours)

**Sequential Dependencies:**
```
1348a (BA spec)
  ↓
1348b (Architect design) [can start during 1348a if needed]
  ↓
1348c (Developer implementation)
  ├─→ 1348d (Developer testing)
  └─→ (parallel)
       ↓
       1348e (QA integration)
```

**Critical Path:** 1348a → 1348b → 1348c → 1348e (≈8–9h)

---

## Task Details

### 1348a — BA Spec (Size: S, Hours: 1–1.5)

**Owner:** BA

**Input:** Reports 1314, 1315 | Sprint 1348 Vision | cascadeEngine.ts current code

**Output:** `docs/REQ_1348.md` with:
1. Policy definition: When does single-entity news become market-wide?
2. Competitive threat model: How to classify substitution vs. margin pressure?
3. Signal hierarchy: Which signals override others?
4. Confidence thresholds: Minimum confidence for MARKET channel broadcast?

**AC:** Spec accepted by Architect (design review), all policy questions answered

---

### 1348b — Architect Design (Size: S, Hours: 1.5–2)

**Owner:** Architect

**Input:** REQ_1348.md from BA | cascadeEngine.ts current structure

**Output:** `docs/ARCH_1348.md` with:
1. New cascadePolicy.ts module (domain layer)
2. refactored cascadeEngine.ts (application layer routing)
3. Signal type definitions (COMPETITIVE_THREAT structure)
4. DDD layer separation (domain vs. app vs. infra)
5. Test strategy (unit tests for policy, integration for routing)

**AC:** Design reviewed + approved by Developer, all implementation questions resolved

---

### 1348c — Implement cascadeEngine v2 (Size: M, Hours: 2–2.5)

**Owner:** Developer

**Input:** ARCH_1348.md from Architect | 1348d test stubs

**Changes:**
1. New file: `src/domain/cascadePolicy.ts` (policy logic)
2. Refactor: `src/app/cascadeEngine.ts` (routing dispatch)
3. New type: `COMPETITIVE_THREAT` in signal schemas
4. Update: `src/app/signalBuilders` (add competitive threat builder)

**AC:**
- All 7371 baseline tests pass (zero regressions)
- New cascadePolicy unit tests pass (≥8 tests)
- TS compilation: 0 errors
- DDD compliance: No domain imports of infrastructure

---

### 1348d — Test DSC + VPBankS Scenarios (Size: S, Hours: 1–1.5)

**Owner:** Developer

**Input:** cascadeEngine v2 implementation from 1348c

**Output:** `src/__tests__/1348-cascade-dsci-vbanksk.test.ts` with scenarios:

1. **DSC Bearish:** DSC publishes bearish warning → verify MARKET channel broadcast to [VIC, VNG, BSI, ACB, TVS, EIB, HDB, VPB]
2. **VPBankS/OKX:** VPBankS announces OKX partnership → verify COMPETITIVE_THREAT to [VCB, ACB, EIB, HDB]
3. **Confidence Scoring:** Low-confidence DSC warning (0.45) → no MARKET broadcast; high-confidence (0.78) → broadcast
4. **Non-regression:** Existing peer routing (1313 through 1346) still works

**AC:**
- All 4 scenarios pass
- Baseline + new tests = 7379+ total pass
- Zero pre-existing test regressions

---

### 1348e — QA Integration Test (Size: S, Hours: 1–1.5)

**Owner:** QA

**Input:** Merged 1348c + 1348d from main branch

**Testing:**
1. Deploy via docker-compose (full stack)
2. Manual test: Post mock DSC alert via MCP tool → verify MARKET channel receives broadcast
3. Manual test: Post mock VPBankS/OKX news → verify COMPETITIVE_THREAT routed to banking peers
4. Smoke test: Daily cron cycle (taAlertScan, bbAlertScan) → verify no scheduler regression
5. Log audit: cascadePolicy decisions logged (for debugging)

**AC:**
- All integration tests pass
- No errors in scheduler logs
- MARKET/broadcast channels deliver expected alerts
- Report: `reports/SPRINT_REPORT_1348.md`

---

## Blocking Condition

**Critical:** 1346a (Remove test stub from production scheduler) must merge BEFORE 1348 starts.

**Reason:** 1348d integration tests run live scheduler. If test stub present, scheduler hangs on stub call → tests timeout.

**Status:** 1346a is in Todo, developer currently assigned. ETA merge: 2026-04-27 evening.

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| cascadePolicy becomes too complex | Split into: broadcastPolicy + competitivePolicy modules |
| Competitive threat over-triggers | Confidence threshold (0.65 min); manual audit required for <0.75 |
| Regressions in existing cascade logic | 1348d must include non-regression tests (all 1313–1346 scenarios) |
| DDD refactor introduces import cycles | Architect reviews import tree before handoff to Developer |

---

## Success Criteria (Full Batch)

**Code Quality:**
- All 7379+ tests pass (0 regressions)
- TS: 0 errors
- DDD: cascadePolicy (domain) ÷ cascadeEngine (app) ÷ dispatchers (infra)
- Test coverage: cascadePolicy unit tests (≥8), cascadeEngine integration (DSC + VPBankS + non-regression)

**Functional:**
- DSC bearish warning cascades to ≥8 sectors via MARKET channel
- VPBankS/OKX partnership broadcasts COMPETITIVE_THREAT to [VCB, ACB, EIB, HDB]
- Confidence thresholds enforced (no low-confidence market broadcasts)
- All existing peer routing still works

**Documentation:**
- REQ_1348.md (BA spec)
- ARCH_1348.md (Architect design)
- TASK_REPORT_1348e.md (QA sign-off)
- Sprint retrospective in SPRINT_GOAL.md

**Deployment:**
- All commits to main with `--no-ff`
- Merge in order: 1348a (doc-only) → 1348b (doc-only) → 1348c (code) → 1348d (test) → 1348e (QA)
- No hot-fix required

---

## Files to Create/Update

**New Files:**
- `/docs/REQ_1348.md` (BA spec)
- `/docs/ARCH_1348.md` (Architect design)
- `/docs/handoffs/TASK_1348a.md` (BA handoff)
- `/docs/handoffs/TASK_1348b.md` (Architect handoff)
- `/docs/handoffs/TASK_1348c.md` (Developer implementation handoff)
- `/docs/handoffs/TASK_1348d.md` (Developer testing handoff)
- `/docs/handoffs/TASK_1348e.md` (QA handoff)
- `/src/domain/cascadePolicy.ts` (new module)
- `/src/__tests__/1348-cascade-dsci-vbanksk.test.ts` (test file)

**Modified Files:**
- `/src/app/cascadeEngine.ts` (refactored)
- `/src/app/signalBuilders/index.ts` (add COMPETITIVE_THREAT builder)
- `/src/types/signals.ts` (add COMPETITIVE_THREAT type)
- `/SPRINT_GOAL.md` (Sprint 1348 goal added)
- `/TASKS.md` (1348a–1348e added)
- `/docs/data/project-stats.json` (currentSprint=1348, updated notes)

---

## Downstream Impact

**Value-Investor Analysis System (Sprint 1336):**
- Better cascade routing → improved signal quality for conviction synthesis
- Competitive threat signals → new conviction dimension (competitive position risk)

**Morning Briefing:**
- Brokerage sector sentiment now market-wide broadcast → morning summary includes macro context
- Fintech disruption risks highlighted → investor alerts include competitive threats

**Cowork Analysis Team:**
- New COMPETITIVE_THREAT signal available for analysis jobs
- Better peer mapping (stock classification 1347b enables geographic weighting)

---

## Timeline (if 1346a merges 2026-04-27 evening)

| Task | Est Start | Est End | Owner | Duration |
|------|-----------|---------|-------|----------|
| 1348a (BA spec) | 2026-04-27 20:00 | 2026-04-27 22:00 | BA | 2h |
| 1348b (Architect) | 2026-04-27 22:00 | 2026-04-28 00:30 | Architect | 2.5h |
| 1348c (Developer impl) | 2026-04-28 00:30 | 2026-04-28 03:30 | Developer | 3h |
| 1348d (Developer test) | 2026-04-28 03:30 | 2026-04-28 05:00 | Developer | 1.5h |
| 1348e (QA integration) | 2026-04-28 05:00 | 2026-04-28 06:30 | QA | 1.5h |
| **Total** | | | | **10h** |

**Estimated Completion:** 2026-04-28 06:30 UTC+2

---

## PO Sign-Off

**Decision:** Approve Sprint 1348 initiation.

**Rationale:**
- Reports 1314 + 1315 represent same architectural gap (cascadeEngine policy layer)
- M sprint fits sprint capacity + infrastructure priority
- Blocking task (1346a) clear path to merge
- Downstream impact justifies: value-investor analysis + morning briefing improvements
- No user approval required per feedback_po_autonomy.md

**Approval:** APPROVED

**Next:** Await 1346a merge → spawn BA for 1348a spec

---

**Batch Metadata:**

- Batch ID: `SPRINT_1348_CASCADE_ENHANCEMENT`
- Related Report IDs: `[1314, 1315]`
- Batch Type: `SPRINT_S_ARCHITECTURE`
- Status: `PENDING_BLOCKING_TASK`
- PO Decision: `APPROVED`

---

Document created: 2026-04-27 15:30 UTC+2
