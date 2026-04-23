# Session: 2026-04-23 BA Sprint Planning — REQ-1294

**Date**: 2026-04-23 | **Agent**: Business Analyst | **Task**: Sprint recommendation + spec writing | **Status**: COMPLETE

---

## Context

Current state after Sprint 1293 (Signal Payload Hardening):
- **1293a–1293d**: All COMPLETE (merged 2026-04-23 05:45 UTC)
- **Issue**: Signal chain completeness is 40% — News Scout and Market Watcher agents not populating numeric payload fields
- **Blocked signals**: VIC 9.5, NVL 8, BSR 7.5 (5 bullish 4-AND alerts suppressed due to missing `newsSentiment`, `kinhDichConfidence`, `agentSignalsMajority` in payload)
- **Backlog**: 1284 (IMF sentiment), 1267 (SSC PDF fallback), 1286 (IMPLEMENTATION_STATUS update)

---

## Analysis: Recommendation for Sprint 1294

### Rationale for Combining 1284 + 1267

**1284 — IMF Context Sentiment Detection** (MEDIUM)
- Problem: Chain catalyst signals lack `newsSentiment` field. Currently defaults to 0.0 (neutral).
- Solution: Detect IMF news, classify as policy_adjustment (+0.3..+0.7) vs crisis_signal (-0.6..-0.3), populate field.
- Impact: Unblocks 4-AND alerts by providing complete signal payload.
- Effort: 5h (sentiment classifier extension + keyword matching + tests)

**1267 — SSC PDF Timeout Fallback** (MEDIUM)
- Problem: BCTC PDF extraction timeouts cause silent data loss (82% success rate).
- Solution: When OCR fails, fallback to populating BCTC fields from recent chain_catalyst signals.
- Impact: Improves BCTC extraction from 82% → >90%, reduces gaps in financial_reports table.
- Effort: 4h (fallback logic + signal-to-BCTC mapper + tests)

### Why Combine?

1. **Shared infrastructure**: Both depend on chain_catalyst signals carrying complete data
2. **Sequential dependency**: FR-1 (IMF sentiment) enables FR-2 (BCTC fallback by signal inference)
3. **Scope alignment**: Both are signal/data resilience improvements, not independent feature additions
4. **Test efficiency**: Single E2E test verifies both: IMF news → signal enrichment → BCTC fallback
5. **Total effort**: 15.5h total fits comfortably in one sprint (vs two separate sprints of 5h + 4h)

### Why NOT 1286 (IMPLEMENTATION_STATUS update)?

1286 is LOW priority documentation. Can proceed in parallel or as post-sprint cleanup. Not blocking development or investor signals.

---

## Artifact: REQ-1294

**File**: `/docs/REQ_1294.md`

**Structure**:
- Executive Summary: signal chain completeness problem + solution
- User Story: investor perspective on context richness
- FR-1: IMF sentiment detection (domain layer)
- FR-2: BCTC fallback logic (application layer)
- 3 Blockers (B1, B2, B3) requiring PO decision on scope
- 5 Acceptance Criteria (AC-1 to AC-5) covering IMF sentiment, fallback logic, signal completeness, audit trail, E2E
- Edge cases: 8 scenarios for IMF sentiment, 6 scenarios for BCTC fallback
- Out of Scope: clear boundaries (no NLP/ML, no non-BCTC fallbacks, IMF-only per scope)
- DDD Layer Map: 7 files, 15.5h total effort
- Pre-Confirmed Locations: 5 critical files verified in codebase

---

## Blockers Identified (PO Decision Required)

### B1: IMF Sentiment Scope

**Question**: Should we also classify World Bank, ADB, BIS macro events as sentiment signals?

**Context**: Spec currently IMF-only. Expansion could improve context richness but may add noise.

**Recommendation**: Keep IMF-only for Sprint 1294 (focused scope). World Bank/ADB can be Phase 2 if metrics improve.

---

### B2: BCTC Fallback Confidence Threshold

**Question**: At what confidence level should downstream tools (ratio calculator, briefing builder) accept fallback fields?

**Context**: Spec suggests 0.45–0.65 for news_inference vs 0.85+ for OCR. Needs downstream tool adoption.

**Recommendation**: Set default 0.55, allow override via `BCTC_FALLBACK_MIN_CONFIDENCE` env var.

---

### B3: Signal Age for BCTC Fallback

**Question**: Should 7-day lookback be fixed or configurable?

**Context**: If stock has no BCTC news for 2 weeks, fallback won't trigger (may be too conservative).

**Recommendation**: Fixed 7 days for Sprint 1294. Monitor success rate; adjust in Sprint 1295 if needed.

---

## Decision Summary

| Decision | Value | Rationale |
|----------|-------|-----------|
| **Sprint scope** | 1294a (IMF) + 1294b (BCTC fallback) | Combined > efficiency, shared dependencies |
| **Effort** | 15.5h (~2 sprints, or split if schedule tight) | MEDIUM priority, non-blocking for current alerts |
| **Blockers** | 3 identified (B1, B2, B3) | PO decision on scope/thresholds before dev start |
| **Spec status** | DRAFT → READY_FOR_ARCHITECT (pending blocker resolution) | All acceptance criteria defined, DDD layer mapped |

---

## Files Updated

| File | Change | Reason |
|------|--------|--------|
| `docs/REQ_1294.md` | CREATED | Full BA spec for Sprint 1294 |
| `TASKS.md` | MODIFIED | Added Sprint 1294 section, moved 1284/1267 to active sprint |
| This session file | CREATED | Document BA analysis + blockers |

---

## Next Steps

1. **PO Review**: Resolve blockers B1, B2, B3
2. **Architect Scan**: Review `docs/REQ_1294.md`, confirm DDD layer mapping
3. **Dev Start**: Create task branches `task/1294a-imf-sentiment` + `task/1294b-bctc-fallback`
4. **TDD RED Phase**: Write failing tests per AC-1 to AC-5
5. **GREEN Phase**: Implement FR-1 + FR-2
6. **QA Review**: Verify signal completeness, E2E briefing generation

---

## Risk Notes

- **Risk**: If BCTC fallback signals are inconsistent or outdated, confidence penalties may hide real BCTC data quality issues
  - **Mitigation**: Log all fallback activations with signal provenance; require QA review of top 10 fallback cases after merge
- **Risk**: IMF sentiment classification depends on keyword matching; portals may change terminology
  - **Mitigation**: Add unit test with 20 real IMF headlines; update keyword list quarterly
- **Risk**: Signal-to-BCTC field mapper may not exist in chainSynthesizer; new domain service required
  - **Mitigation**: Confirm in Architect scan; scope may need to expand if complex mapping logic needed

---

## Session Timeline

- **09:00–09:15**: Read TASKS.md, project-stats.json, agent-memory INDEX
- **09:15–09:30**: Review Sprint 1293 completion, BCTC portal discovery issue, session log
- **09:30–09:45**: Check signal types (signalTypes.ts), chainSynthesizer.ts structure
- **09:45–10:00**: Analyze backlog items 1284 + 1267 scope + interdependencies
- **10:00–10:45**: Write REQ_1294.md (full spec, blockers, AC, DDD layer map)
- **10:45–10:50**: Update TASKS.md, create session log
- **10:50**: Complete, ready for PO blocker resolution

**Total BA effort: 50 minutes**

---

## Session Metadata

- **Agent**: Business Analyst (BA)
- **Model**: Haiku 4.5
- **Status**: COMPLETE — REQ_1294.md ready for PO review (blockers), then Architect review
- **Handoff**: PM should update TASKS.md sprint 1294 task assignments after blockers resolved
