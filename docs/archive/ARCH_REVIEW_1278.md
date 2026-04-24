# Architectural Review — SPRINT 1278: Insider Dump Sentiment Cascade

**Date:** 2026-04-22
**Architect:** Claude (Haiku 4.5)
**Status:** APPROVED
**Ref:** REQ-1278, TECH-1278

---

## Executive Summary

**Sprint 1278** adds insider dump cascade detection to the intelligence cycle. When a CEO or banking leadership exits (xả hàng, bán sạch, thoái sạch keywords), the system cascades HIGH-severity alerts to peer banking stocks, capturing systemic contagion risk.

**Why?** VN's banking sector is systemically correlated. One bank's leadership confidence loss signals counterparty risk + deposit flight to peers. Investors need proactive alerts, not retrospective price moves.

**Design approach:** Reuse existing cascade framework (LEGAL_RISK_RULES pattern). Add 3-rule INSIDER_DUMP_RULES array + peer detection logic in application layer.

---

## Brownfield Summary

| Artifact | Status | Impact |
|----------|--------|--------|
| sentimentClassifier.ts:130–137 | ✓ Insider keywords exist | No changes needed; keywords already present from sprint 1272 |
| cascadeEngine.ts:2110–2149 | ✓ LEGAL_RISK_RULES pattern | INSIDER_DUMP_RULES will follow same structure |
| buildCausalChain() function | ✓ Existing | No modifications needed; already orchestrates cascade logic |
| pollNews.ts sentiment flow | ✓ Existing | Sentiment → cascade happens downstream; integration optional |

**Key finding:** No breaking changes. All new functionality is additive.

---

## Architecture Decisions

### Decision 1: Reuse LEGAL_RISK_RULES Pattern (approved)

**Question:** Should INSIDER_DUMP_RULES follow the same CascadeKeywordRule interface as LEGAL_RISK_RULES?

**Decision:** YES. Reuse pattern to maintain consistency.

**Rationale:**
- Insider dumps are **keyword-driven rules** like legal prosecutions (consistent pattern)
- Peer cascading is **distinct from hierarchical cascading** (stock→domain→action), but can be post-processed
- Minimizes code duplication; future rules can follow same template

**Trade-offs:**
- INSIDER_DUMP_RULES don't fit perfectly in the SECTOR_RULES loop (which is domain-based, not peer-based)
- Solution: New cascadeExecutor.ts module handles peer-specific orchestration

**Approval:** Maintains DDD boundaries; domain layer remains pure.

---

### Decision 2: Peer Cascade in Application Layer (approved)

**Question:** Should peer detection live in domain/ (cascadeEngine.ts) or application/ (cascadeExecutor.ts)?

**Decision:** **application/cascadeExecutor.ts** (NEW)

**Rationale:**
- Domain layer (cascadeEngine) = pure rule definitions + causal chain building
- Application layer = orchestration logic (sentiment check + watchlist filtering)
- Keeps domain/services pure and testable in isolation
- Follows DDD: domain defines rules, application orchestrates execution

**Implementation:**
```
domain/services/cascadeEngine.ts    → INSIDER_DUMP_RULES definition (pure)
application/cascadeExecutor.ts      → detectInsiderDumpPeers() orchestration (pure, calls domain)
application/usecases/pollNews.ts    → Integration point (optional for GREEN)
```

**Approval:** Maintains clean layer boundaries.

---

### Decision 3: Optional pollNews Integration (approved)

**Question:** Should 1278b implement full integration into pollNews.ts?

**Decision:** **Optional for GREEN phase**. cascadeExecutor.ts is complete and testable in isolation.

**Rationale:**
- cascadeExecutor functions are pure; can be tested without pollNews context
- GREEN phase focuses on making RED tests pass + validating pure functions
- Integration into pollNews can be separate task (allows for staged rollout + monitoring)
- Reduces risk of pollNews timeout regression during feature sprint

**Approval:** Pragmatic split; integration can follow separately.

---

## DDD Compliance

| Layer | Change | Compliance |
|-------|--------|-----------|
| **domain/services/cascadeEngine.ts** | ADD INSIDER_DUMP_RULES array | ✓ Pure domain rules, no I/O imports |
| **application/cascadeExecutor.ts** | NEW detectInsiderDumpPeers() | ✓ Pure function, calls domain only, no infrastructure |
| **application/usecases/pollNews.ts** | OPTIONAL integration | ✓ If implemented, imports application only |
| Tests | 1278a RED + 1278b GREEN | ✓ No infrastructure; test fixtures only |

**Verdict:** Zero DDD violations. All changes respect layer boundaries.

---

## Test Strategy

### RED Phase (1278a): Test Definition

**6 test cases, 5 PASS + 1 FAIL (intentional)**

1. **TC-1/2/3:** Sentiment detection — xả hàng/bán sạch/thoái sạch → bearish
   - PASS (keywords already exist)

2. **TC-4:** INSIDER_DUMP_RULES structure
   - FAIL until GREEN (defines contract for implementation)

3. **TC-5/6:** buildCausalChain integration + non-banking exclusion
   - PASS (existing function accepts domains correctly)

**Key insight:** RED phase validates that GREEN phase has a clear contract to implement.

### GREEN Phase (1278b): Implementation

**10 test cases, ALL PASS**

- TC-1/2: cascadeExecutor returns correct peer lists
- TC-3/4: Confidence + keyword thresholds enforced
- TC-5/6/7: Non-banking + circular cascade prevention
- TC-8/9/10: E2E integration + keyword matching validation

**Coverage:** Sentiment detection (1272 ✓) + rule definition (new) + peer filtering (new) + integration (new)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **False positives (xả hàng ≠ insider dump)** | 3–5% | Low | Confidence >0.6 threshold; monitor alert volume |
| **Peer list staleness (TCB/MBB added later)** | Low | Low | stock-classification.json is SSOT; quarterly updates |
| **Circular cascade** | Very low | High | Code enforces original stock ≠ peer list |
| **Performance regression** | Low | Medium | Pure functions <50ms; <10% cycle overhead target |
| **pollNews integration timeout** | Low | Medium | Integration deferred; cascadeExecutor is non-blocking |

**Severity rating:** LOW. Mitigation plan robust.

---

## Performance Expectations

| Metric | Target | Justification |
|--------|--------|---------------|
| Rule matching | <50ms per article | Pure function, 3-keyword regex scan |
| Peer detection | <10ms | watchlist filter (small set ≤20 stocks) |
| E2E cascade | <100ms | Combined orchestration |
| Cycle overhead | <10% (3–4 sec on 30–45s baseline) | Additive, non-blocking |

**Validation:** GREEN phase includes perf assertions in test suite.

---

## Security Review

- [ ] ✓ No SQL (domain layer, no injection risk)
- [ ] ✓ No external HTTP (domain + application layers)
- [ ] ✓ No file I/O (pure functions)
- [ ] ✓ No secrets (no config access)
- [ ] ✓ No unsafe array mutations (use `const`, freeze if needed)

**Verdict:** SECURE. No new attack surface.

---

## Backward Compatibility

- **Database:** No schema changes (no new tables, no migrations)
- **APIs:** No new endpoints (cascade is internal to intelligence cycle)
- **Config:** No new thresholds (reuse existing 30-min macro cooldown)
- **Alerts:** New severity mapping ("insider_dump_banking_peers" → "HIGH"), non-breaking

**Verdict:** FULLY COMPATIBLE. Existing deployments can upgrade without downtime.

---

## Deployment Readiness

**Pre-deployment checklist:**
- [ ] 1278a RED tests PASS
- [ ] 1278b GREEN tests PASS
- [ ] bun tsc --noEmit passes (no TS errors)
- [ ] bun test (full suite, no regressions)
- [ ] Code review approved (TECH-1278 signature)
- [ ] QA sign-off (TASK_REPORT_1278.md)

**Deployment steps:**
1. Merge PR (auto-merge policy)
2. Run launchctl kickstart to reload MCP server
3. Monitor alerts channel for peer alerts (should appear within 2 min of insider dump detection)
4. Log baseline: expect 1–2 insider dump alerts per week (VN large-cap banking sector)

---

## Success Metrics (Post-Deployment)

| Metric | Baseline | Target | Method |
|--------|----------|--------|--------|
| **Insider dump detection latency** | N/A (new) | <2 min from news publish | Telegram alert timestamp vs article timestamp |
| **False positive rate** | N/A (new) | <5% | Weekly manual review of peer alerts |
| **Peer alert coverage** | N/A (new) | ≥80% of banking peers | Count peer alerts vs original stock alerts |
| **Cycle overhead** | 30–45s baseline | <10% increase (34–50s) | 15-min cycle perf monitoring |

---

## Handoff Contents

| Artifact | Location | Purpose |
|----------|----------|---------|
| TECH-1278 | docs/TECH_1278.md | Full technical design (architecture + implementation plan) |
| 1278a Handoff | docs/handoffs/TASK_1278a.md | RED phase specification (6 test cases + fixtures) |
| 1278b Handoff | docs/handoffs/TASK_1278b.md | GREEN phase implementation (INSIDER_DUMP_RULES + cascadeExecutor + 10 integration tests) |
| TASKS.md | TASKS.md | Sprint added to active backlog |

---

## Known Deferred Items

1. **pollNews.ts integration:** Optional for 1278b. Can be separate integration task.
2. **Alert severity mapping:** Verify alertGenerator.ts handles "insider_dump_banking_peers" → severity="HIGH". May need separate PR.
3. **Macro cooldown per-rule:** Current 30-min global cooldown. Rule-specific cooldown deferred to future sprint if needed.

---

## Architect Signature

| Role | Name | Date | Status |
|------|------|------|--------|
| Architect (Design) | Claude Haiku 4.5 | 2026-04-22 | APPROVED ✓ |
| Developer (TBD) | [Pending] | [TBD] | TODO |
| QA (TBD) | [Pending] | [TBD] | TODO |

---

## Next Steps (for PM)

1. **PM Review:** Verify sprint sizing (M-size, 5–7 hours)
2. **Schedule:** Add 1278a + 1278b to backlog
3. **Developer assignment:** Assign to available developer
4. **QA coordination:** Notify QA to prepare test review checklist
5. **Monitoring:** Post-deployment, monitor MARKET channel for peer alerts

---

**End of Architectural Review**

Architecture is sound, risks are mitigated, design is complete. Ready for PM scheduling.
