# Index — TECH-1295 Signal Payload Quality Enforcement

**Project**: Signal Payload Quality — Permanent Fix
**Status**: APPROVED FOR IMPLEMENTATION
**Date**: 2026-04-23
**Effort**: 18h (Sprint 1295a–1295d)

---

## Quick Navigation

### For Quick Overview (5 min read)
**Start here if you need a quick summary:**
1. `/ANALYST_FINDINGS_1295.md` — High-level findings (8KB)
2. `/docs/ARCHITECTURE_DECISION_1295.md` — Decision rationale (9KB)

### For Full Context (20 min read)
**Read for complete understanding:**
1. `/docs/TECH_1295.md` — Full architecture decision (21KB)
2. `docs/ARCHITECTURE_DECISION_1295.md` — Executive summary (9KB)
3. `ANALYST_FINDINGS_1295.md` — Stakeholder findings (8KB)

### For Implementation (Dev Team, 2 hours)
**Follow these to execute:**
1. `/docs/handoffs/TASK_1295_KICKOFF.md` — Execution guide (12KB)
   - Subtask breakdown (1295a–1295d)
   - RED/GREEN test cases
   - Implementation checklist
2. `/docs/TECH_1295.md` (Section 5–8) — DDD layer plan + task breakdown

### For Decision Review (Architect/PM, 1 hour)
**Review for approval:**
1. `/docs/ARCHITECTURE_DECISION_1295.md` — Options evaluated
2. `/docs/TECH_1295.md` (Section 3–4) — Root cause + recommendations

### For QA Testing (Post-Merge, 2 hours)
**Verify implementation:**
1. `/docs/handoffs/TASK_1295_KICKOFF.md` (Execution section)
2. `/docs/TECH_1295.md` (Section 8 — Verification Checklist)

---

## Document Index

### Core Documents

| File | Purpose | Size | Audience |
|------|---------|------|----------|
| `/docs/TECH_1295.md` | Full architecture decision + implementation plan | 21KB | Architect, Dev Team |
| `/docs/handoffs/TASK_1295_KICKOFF.md` | Dev team execution guide (RED/GREEN tests + implementation) | 12KB | Dev Team, QA |
| `/docs/ARCHITECTURE_DECISION_1295.md` | Executive summary + decision rationale + options | 9KB | PM, Architect, Stakeholders |
| `/ANALYST_FINDINGS_1295.md` | High-level findings + incident analysis | 8KB | All stakeholders |

### Supporting Documents (Updated)

| File | Change | Purpose |
|------|--------|---------|
| `/docs/agent-memory/sessions/2026-04-23-architect.md` | APPENDED | Root-cause analysis + decision |
| `/docs/agent-memory/patterns/signal-payload-quality.md` | UPDATED | Prevention checklist + fix procedure |

---

## Key Sections (By Role)

### Architect / Tech Lead
**Read**: TECH_1295.md
- Section 1: Brownfield Impact (5 min)
- Section 2: Root-Cause Analysis (10 min)
- Section 3: Architecture Decision (5 min)
- Section 4: DDD Layer Plan (3 min)
**Decision**: Approved Option A (Typed Builders)
**Outcome**: Ready for PM + Dev Team

### Project Manager
**Read**: ARCHITECTURE_DECISION_1295.md
- Problem Statement (2 min)
- Recommended Solution (2 min)
- Implementation Plan (3 min)
- Next Steps (1 min)
**Action**: Assign 1295a–1295d to Dev Team (18h total, 4–5 days)
**Priority**: HIGH (fixes recurring bug)

### Developer Team
**Read**: TASK_1295_KICKOFF.md
- Quick Summary (1 min)
- Subtask Breakdown (20 min)
  - 1295a: Signal Builders (8h)
  - 1295b: Agent Specs (4h)
  - 1295c: Audit Service (4h)
  - 1295d: Integration Tests (2h)
- Execution Order (3 min)
- Key Files Reference (2 min)
**Action**: Create branch `task/1295a-signal-builders` and start
**Reference**: TECH_1295.md for detailed context

### QA / Testing
**Read**: TECH_1295.md (Section 8) + TASK_1295_KICKOFF.md
- Test Cases (Section Breakdown in Kickoff)
- Verification Checklist (TECH_1295.md Section 8)
- Success Metrics (7-day targets)
**Action**: Verify 40+ test assertions GREEN, metrics achieved
**Monitoring**: Track rejection_rate for 7 days post-merge

### Product Owner
**Read**: ANALYST_FINDINGS_1295.md + ARCHITECTURE_DECISION_1295.md
- Incident Timeline (1 min)
- Root Causes (5 min)
- Solution Overview (2 min)
- Risk Assessment (2 min)
**Decision**: Approve TECH-1295 for sprint (18h, LOW risk)

---

## Problem Summary

**What**: Signal payloads incomplete (missing confidence, direction, affected_stocks)
**When**: 2026-04-23 02:36 UTC
**Impact**: 5 bullish alerts suppressed (low conviction due to missing fields)
**Recurrence**: 3x (Sprint 228, 1293 incident, 1294b RED failure)

**Root Causes** (4 gaps):
1. Type definition gap (SignalPayload interface too permissive)
2. Job implementation gap (agents skip finding_data under token budget)
3. Integration gap (MCP validation too late, post-construction)
4. Testing gap (RED tests don't assert missing fields)

**TECH-1293** added reactive validation (MCP tool rejects incomplete payloads after construction)
**TECH-1295** adds proactive validation (builders enforce completeness at construction time)

---

## Solution Summary

**Option Selected**: Option A (Typed Builders)

**Why**:
- Pre-emit validation (catches at construction, no MCP round-trip)
- Typed enforcement (TypeScript compiler ensures completeness)
- Low effort (18h vs 40h+ for alternatives)
- Low risk (MCP tool fallback always active)
- Measurable (70% reduction in rejections)

**How**:
```typescript
const finding = createChainCatalystBuilder()
  .setEventType("credit_policy")
  .setDirection("bullish")
  .setConfidence(0.8)
  .addStock("VIC")
  .addSector("Banking")
  .setHeadline("Credit easing")
  .setSource("cafef")
  .build();  // Throws if incomplete
```

---

## Implementation Timeline

| Phase | Task | Effort | Status | Dev Days |
|-------|------|--------|--------|----------|
| **Phase 1** | 1295a: Builders | 8h | READY | Day 1–2 |
| **Phase 2** | 1295b: Agent Specs | 4h | READY | Day 2–3 |
| **Phase 3** | 1295c: Audit Service | 4h | READY | Day 3–4 |
| **Phase 4** | 1295d: Integration | 2h | READY | Day 4–5 |
| **Total** | **All** | **18h** | **READY** | **4–5 days** |

---

## Success Metrics

**7 Days Post-Merge**:
- Signal rejections: <5 per 1000 posts (down from 12–15)
- MCP rejection rate: <0.5% (down from 1.2%)
- Conviction scores: 0.7–0.85 (restored from 0.3–0.5)
- 4-AND alerts: Resume firing at baseline rate
- Confidence penalties: 0 in logs (vs. HIGH during incident)

**Evidence**: `get_signal_quality_audit(days=7)` query + Alert Commander metrics

---

## Risk Profile

**Overall Risk**: LOW

| Risk | Mitigation |
|------|-----------|
| Agents don't adopt builders | MCP tool validates (fallback); soft rollout |
| Builder API confusing | Fluent interface + clear errors + examples |
| Performance regression | Builders thin wrappers; no DB cost |
| Backward compat | Builders optional; 1293d fallbacks handle old signals |

---

## Approval Checklist

- [x] Architect approval: APPROVED (2026-04-23 06:45 UTC)
- [x] Implementation ready: YES (all subtasks defined)
- [x] Dev team handoff: COMPLETE (TASK_1295_KICKOFF.md)
- [ ] PM assignment: PENDING
- [ ] Dev team execution: NOT STARTED (awaiting PM assignment)
- [ ] QA review: PENDING (post-merge)
- [ ] Production deployment: PENDING (post-QA)

---

## File Organization

```
docs/
  ├── TECH_1295.md                    (Full architecture decision)
  ├── ARCHITECTURE_DECISION_1295.md   (Executive summary)
  ├── INDEX_TECH_1295.md              (This file)
  ├── handoffs/
  │   └── TASK_1295_KICKOFF.md        (Dev team execution guide)
  ├── agent-memory/
  │   ├── sessions/
  │   │   └── 2026-04-23-architect.md (UPDATED: root-cause analysis)
  │   └── patterns/
  │       └── signal-payload-quality.md (UPDATED: prevention checklist)

root/
  └── ANALYST_FINDINGS_1295.md        (High-level findings)
```

---

## Quick Links

### Read These First
- `ANALYST_FINDINGS_1295.md` — Problem + solution overview (5 min)
- `docs/ARCHITECTURE_DECISION_1295.md` — Decision rationale (3 min)

### For Implementation
- `docs/handoffs/TASK_1295_KICKOFF.md` — Step-by-step execution guide

### For Full Context
- `docs/TECH_1295.md` — Complete analysis + implementation plan

### For Approval
- `docs/ARCHITECTURE_DECISION_1295.md` — Decision review

---

## Questions?

**Q: Is TECH-1293 broken?**
A: No, 1293 works perfectly. It catches incomplete payloads at MCP tool. 1295 adds pre-emit validation to prevent construction in the first place.

**Q: Do agents need to change immediately?**
A: No, builders are optional. Existing agents still work; MCP tool validates as fallback. Soft rollout recommended.

**Q: What's the risk?**
A: LOW. Validation happens at 2 layers (builder + MCP tool). Backward compatible. Old signals handled by 1293d fallbacks.

**Q: How long to implement?**
A: 18 hours (4–5 development days). 4 subtasks: 1295a (8h), 1295b (4h), 1295c (4h), 1295d (2h).

**Q: Is this ready to start?**
A: YES. All subtasks defined, test cases specified, DDD architecture verified.

---

## Related Documents

- `/docs/TECH_1293_ROOTCAUSE.md` — TECH-1293 analysis (validation infrastructure, merged)
- `/docs/agent-memory/patterns/signal-payload-quality.md` — Prevention checklist
- `/docs/agent-memory/sessions/2026-04-23-architect.md` — Session log with decision
- `/.claude/agents/01-news-scout.md` — Agent spec (will be updated in 1295b)
- `/.claude/agents/04-market-watcher.md` — Agent spec (will be updated in 1295b)

---

**Status**: READY FOR PM ASSIGNMENT
**Next**: PM assigns 1295a–1295d to Dev Team
**Timeline**: 4–5 development days
**Risk**: LOW
**Impact**: 50% reduction in signal rejections, 4-AND alerts resume firing
