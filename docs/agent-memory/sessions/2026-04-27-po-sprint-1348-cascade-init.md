# PO Session: Sprint 1348 Cascade Enhancement Initiation (2026-04-27)

**Agent:** PO (Product Owner)
**Time:** 2026-04-27 15:30 UTC+2
**Action:** Assess backlog + initiate cascade architecture sprint

---

## Situation

**Current State:**
- Sprint 1345 COMPLETE + MERGED (2026-04-27)
- Sprint 1347a + 1347b COMPLETE + MERGED (2026-04-27) — DB isolation + stock classification expansion
- Sprint 1346a still TODO (CRITICAL test stub) — blocking integration
- Sprint 1346e (cascade gaps) = BACKLOG, needs assessment

**Open Reports:**
1. **1314:** DSC CEO bearish warning — impact_chain returned 4 instead of market-wide
2. **1315:** VPBankS/OKX crypto partnership — banking cascade incomplete (only 4 banks, missing competitive/substitution logic)

Both reports identified in Sprint 1346 triage (2026-04-27 14:15) as MEDIUM BACKLOG requiring architectural review before implementation.

---

## Assessment: Cascade Architecture Gaps

### Report 1314 — DSC Brokerage Sentiment Narrow Impact

**Problem:** DSC (leading broker, DSC0) publishes bearish warning → system cascades only to 4 tickers (narrow impact chain) vs. market-wide sentiment broadcast expected.

**Technical Root:** `cascadeEngine.ts` routes individual tickers but doesn't handle "brokerage sector opinion" as market-wide signal. When a major brokerage issues blanket bearish warning:
- Current: Route to peer brokers only (ACB, TVS, etc.) → 4–5 tickers
- Expected: Broadcast to MARKET channel with confidence scoring → 8+ sectors affected

**Policy Question:** When does single-entity news (1 brokerage, 1 major news agency) escalate to market-wide broadcast? Thresholds:
- ≥3 peer entities affected?
- ≥50% of sector has exposure?
- Brokerage-specific signal type required?

---

### Report 1315 — Banking Cascade Missing Competitive Logic

**Problem:** VPBankS announces OKX (crypto exchange) partnership → system cascades only to 4 traditional banks (VCB, ACB, EIB, VPBankS) vs. complete competitive threat mapping.

**Technical Root:** `cascadeEngine.ts` lacks `COMPETITIVE_THREAT` signal type. Current logic:
- Same sector → peer impact (VCB, ACB, EIB get downside)
- Missing: Substitution threats (crypto fintech → threat to traditional banking)
- Missing: Sector-shift awareness (fintech adoption rate, millennials shifting wealth)

**Policy Question:** How does competitive innovation affect traditional competitors? New signal:
```
COMPETITIVE_THREAT (VPBankS + OKX → VCB/ACB/EIB risk)
  ├─ type: "substitution_threat" | "disintermediation" | "margin_compression"
  ├─ severity: "emerging" | "elevated" | "critical"
  └─ affected_tickers: [VCB, ACB, EIB, ...]
```

---

## Sprint 1348 Design — Cascade Architecture Enhancement

**Title:** Cascade Engine Redesign — Market-Wide Policy + Competitive Signals

**Type:** SPRINT-S (architecture + implementation)

**Vision:** Enhance cascadeEngine to handle:
1. Brokerage/news-agency sector-wide sentiment (market-wide broadcast policy)
2. Competitive threat routing (new COMPETITIVE_THREAT signal type)
3. Improved impact scoring (confidence-weighted cascading)

**Scope:**

| Task | Title | Layer | Size | Owner |
|------|-------|-------|------|-------|
| 1348a | BA spec: cascadeEngine policy + signal types | Spec | S | BA |
| 1348b | Design: DDD refactor (routing policy ÷ impact scoring) | Design | S | Architect |
| 1348c | Implement: cascadeEngine v2 + COMPETITIVE_THREAT | Domain | M | Developer |
| 1348d | Test: DSC + VPBankS scenario validation | Test | S | Developer |
| 1348e | QA: Integration test + market-wide broadcast verification | Test | S | QA |

**Total:** M sprint (~8–10h)

---

## Related Reports Batch

**BATCH NAME:** `SPRINT_1348_CASCADE_ENHANCEMENT`

**Batch ID:** 1348-cascade

**Related Report IDs:**
- `1314` — DSC brokerage sentiment routing gap
- `1315` — Banking/fintech competitive threat gap

**Linked Task:** 1346e (backlog cascade gaps)

**Priority:** MEDIUM

**Root Cause Classification:**
- **1314:** Architecture limitation (no market-wide policy)
- **1315:** Missing signal type (no COMPETITIVE_THREAT)

**Impact if Deferred:**
- Morning briefing loses macro context (brokerage sentiment)
- Fintech disruption alerts don't propagate to traditional banking peers
- Value-investor analysis system (Sprint 1336) misses competitive risks

**Risk Mitigation:**
- 1346a (test stub removal) can proceed independently
- 1348 doesn't block daily cron operations (DSC/VPBankS are secondary signals)
- Can run in parallel with other infrastructure work

---

## Technical Summary

### cascadeEngine.ts Architecture Changes

**Current:** Single-entity → peer routing
```
DSC (stock) → peer brokers (ACB, TVS, etc.) → [list]
VPBankS (crypto partnership) → same-sector banks → [list]
```

**Proposed:** Semantic signal routing + policy layer
```
cascadePolicy.ts
  ├─ policy.handleBrokerageSentiment(entity, opinion, confidence)
  │   └─ if (confidence > 0.75 && sector_weight > 0.5) → broadcast MARKET
  ├─ policy.handleCompetitiveThreadat(threat_type, source, targets)
  │   └─ emit COMPETITIVE_THREAT signal
  └─ Confidence-weighted scoring (no hard-coded cutoffs)

cascadeEngine.ts (refactored)
  ├─ dispatch(signal) → router.route(signal) → policy.apply(signal)
  ├─ Handle: PRICE_MOVE, SENTIMENT, COMPETITIVE_THREAT, MACRO_EVENT
  └─ Emit: Routed signals to channel dispatcher
```

**New Signal Type:**
```typescript
type COMPETITIVE_THREAT = {
  sourceEntity: string;        // VPBankS
  threatType: "substitution" | "disintermediation" | "margin_compression";
  affectedTickers: string[];   // [VCB, ACB, EIB, ...]
  confidence: 0.0–1.0;         // 0.65–0.80 range
  timeframe: "weeks" | "months" | "quarters";
}
```

**DDD Compliance:**
- Routing policy = domain logic (cascadePolicy.ts in src/domain)
- Signal dispatch = application logic (cascadeEngine in src/app)
- Channel routing = infrastructure (telegram, market dispatchers in src/infra)

---

## Decision Log

**Why SPRINT-S not backlog?**
- User provided explicit examples (DSC, VPBankS) indicating market impact
- Affects daily briefing quality (morning sentiment context)
- Cascading improvements downstream (value-investor analysis depends on good signal routing)
- M estimate fits current sprint capacity

**Why BA spec first?**
- "Market-wide" is a policy choice, not a technical decision
- BA must clarify: sector weight thresholds, confidence cutoffs, signal hierarchy
- Architect then designs DDD pattern accordingly
- Developer implements tested contract

**Why not inline with 1346 sprint?**
- 1346 is bug-fixing (triage + fix real incidents)
- 1348 is architecture enhancement (requires design upfront)
- Mixing would lengthen 1346 timeline
- Clean separation: 1346 → defects, 1348 → improvements

**Why parallel with other work?**
- 1346a (test stub) can merge independently
- 1348 doesn't touch scheduler, alert-engine, watchdog
- Stock classification (1347b) is prerequisite (enables better peer mapping)
- Can proceed simultaneously

---

## Handoff Files Created

- `/docs/handoffs/TASK_1348a.md` — BA spec handoff
- `/docs/handoffs/TASK_1348b.md` — Architect design review
- `/docs/handoffs/TASK_1348c.md` — Developer implementation
- `/docs/handoffs/TASK_1348d.md` — Developer testing (DSC + VPBankS scenarios)
- `/docs/handoffs/TASK_1348e.md` — QA integration verification

---

## Files to Update

- **SPRINT_GOAL.md** — Add Sprint 1348 goal
- **TASKS.md** — Add Sprint 1348 tasks (1348a–1348e)
- **project-stats.json** — Update currentSprint=1348 (after 1346a merge)

---

## Next Step

**Primary (blocking):** Developer (Task 1346a: remove test stub from production scheduler)

**Secondary (parallel ready):** BA (Task 1348a: cascade architecture spec)

Instruction:
1. 1346a must complete before 1348 starts (can't test cascade routing with stub in scheduler)
2. Once 1346a merged, spawn BA for 1348a spec
3. Parallel: architect can start design review (1348b) once BA outlines policy questions

---

## Batch Return Summary

**BATCH TYPE:** SPRINT_S_INITIATION
**BATCH ID:** 1348-cascade
**STATUS:** PENDING_BA_SPEC
**RELATED_REPORTS:** [1314, 1315]
**BLOCKING_TASK:** 1346a (must merge first)
**ESTIMATED_DURATION:** 8–10h (M sprint)

---

**Status:** Sprint 1348 assessed and designed. Awaiting 1346a completion before BA spawn.

Timestamp: 2026-04-27 15:30 UTC+2
