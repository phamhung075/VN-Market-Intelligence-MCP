# SPRINT-233 GOAL — Cowork Resilience: End-to-End Fallback Chain Validation

**Sprint Number**: 233
**Size**: M (medium — verification + audit + hardening, full BA→Arch→Dev→QA pipeline)
**Status**: APPROVED_BY_ARCHITECT
**Date**: 2026-04-21

---

## Vision

Validate that Sprint 232's intelligent fallback chains (primary → cache → Yahoo/domestic/Công Báo) function correctly under real market conditions, with proper confidence penalty labeling and exhaustion escalation.

**Problem Solved**: Sprint 232 implemented resilient fallback infrastructure but has NOT been validated in production. Without end-to-end testing, fallback signals may reach market channels without proper source metadata, confidence penalties may not apply, and escalation may silently fail.

**Solution**: Comprehensive E2E test suite + signal quality audit logging + manual market-hours smoke test.

---

## Success Metrics

| Metric | Target | Owner |
|--------|--------|-------|
| E2E test assertions | 27+ passing (all 15 ACs covered) | Dev |
| Audit logging coverage | 100% of signals logged (no gaps) | Dev |
| Confidence penalty | 0.8075× applied to all fallback signals | Dev |
| Market-hours smoke test | All 5 phases + 10-point checklist completed | QA |
| Escalation accuracy | Fires for exhausted services, <5s latency | Dev + QA |
| Code quality | TypeScript clean, DDD layers separated, SQL parameterized | Dev |

---

## Artifacts

| File | Description | Owner | Status |
|------|-------------|-------|--------|
| `docs/TECH_233.md` | Architecture design, DDD layer map, confidence penalty derivation | Architect | ✓ DONE |
| `docs/REQ_233.md` | Full requirement spec (15 ACs, all acceptance criteria) | BA | ✓ (provided) |
| `docs/handoffs/TASK_233a.md` | TDD RED test suite (27 failing assertions) | Dev | ✓ DONE |
| `docs/handoffs/TASK_233b.md` | GREEN implementation (signalValidator + audit + schema) | Dev | ✓ DONE |
| `docs/handoffs/TASK_233c.md` | Manual smoke test protocol (5 phases, observation checklist) | QA | ✓ DONE |
| `reports/SPRINT_REPORT_233.md` | Market-hours test observations + metrics | QA | Todo |
| `src/__tests__/233-cowork-resilience-e2e.test.ts` | E2E test file (created in 233a) | Dev | Todo |

---

## Task Sequence

```
233a (RED test suite)
  ↓
233b (GREEN implementation) ← blocks: must merge before 233c
  ↓
233c (manual smoke test)
```

**Timeline**:
- 233a: 4h (TDD RED, write 27 assertions)
- 233b: 5h + 1h review (implement, all tests pass)
- 233c: 2h execution + 1h report (market-hours, 09:00–15:00 UTC+7)
- **Total**: ~13h

---

## Key Implementation Details

### Confidence Penalty Formula

```
confidence_final = base_confidence × penalty × temporal_decay

where:
  penalty = 0.8075 (if source_fallback=true, else 1.0)
  temporal_decay = max(0.5, 1 - age_hours/24)
  base_confidence = 100 - divergence, clamped [95, 100]
```

**Examples**:
- Fresh VPS price (divergence 2%): 98 × 1.0 = **98**
- 2h old cache (divergence 2%): 98 × 0.8075 × 0.917 = **73**
- 6h old cache (divergence 2%): 98 × 0.8075 × 0.75 = **59**

### Signal Quality Audit Table

Every signal → entry in `signal_quality_audit` with:
- signal_id, signal_type, ticker
- source_fallback (0 | 1), fallback_source, fallback_tier
- confidence_score (before penalty), confidence_score_final (after)
- confidence_penalty (1.0 | 0.8075)
- price_age_minutes, staleness_warning
- vps_breaker_state, coverage_gap
- created_at (ISO8601)

### Market-Hours Smoke Test (5 Phases)

1. **Phase 1 (09:00–09:15)**: Primary signals, no fallback, confidence_penalty=1.0
2. **Phase 2 (09:15–09:30)**: Inject circuit breaker "open" → fallback routed, confidence_penalty=0.8075
3. **Phase 3 (09:30–09:45)**: Exhaust all fallbacks → escalation fires, agent status="degraded"
4. **Phase 4 (09:45–10:00)**: Remove injection → auto-recovery to primary, status="ok"
5. **Phase 5 (10:00)**: Metrics extraction, report writing

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Temporal decay too aggressive | Conservative linear formula + staleness_warning educates users |
| Confidence penalty (0.8075) arbitrary | Document derivation (geometric mean of uncertainties) in code comment |
| Manual test requires exact timing | Automate fallback injection in future sprint; document 5-phase procedure |
| Audit table bloat | Index on created_at; archive after 30 days; future optimization |
| Fallback penalty on invalid signals | DO NOT apply 0.8075 if valid=false; test covers edge case |

---

## DDD Compliance Checklist

- [ ] Domain layer (`signalValidator`): Pure functions, no async/IO
- [ ] Application layer (`marketAnalysisJob`): Audit logging orchestration
- [ ] Infrastructure layer (`schema-system`): Database persistence
- [ ] No cross-layer imports (domain must not import infrastructure)
- [ ] All SQL parameterized (no string interpolation)
- [ ] Test isolation (in-memory SQLite)

---

## Handoff Notes for Developer

### TASK-233a (TDD RED)
- Write ALL 27 assertions first (RED phase)
- Test structure: describe blocks by AC (AC-1 to AC-15)
- Use Bun in-memory SQLite for test isolation
- Import signalValidator + resilientFetcher (stubs ok, will extend in 233b)

### TASK-233b (GREEN)
- Implement in order: (1) signalValidator extension, (2) audit schema, (3) audit logging
- All 27 tests must pass before merge
- Verify adjacent function signatures unchanged
- Run `bun tsc --noEmit` + DDD layer scan

### TASK-233c (Manual Smoke Test)
- Execute during Vietnam trading hours (09:00–15:00 UTC+7)
- Follow 5-phase procedure with exact timing
- Record all observations in SPRINT_REPORT_233.md
- Verify 10-point checklist complete
- Sign report with QA name + date

---

## Post-Sprint Checklist

- [ ] All 27 E2E test assertions pass
- [ ] Code review: TECH-233 matches implementation
- [ ] DDD compliance verified (no layer violations)
- [ ] signal_quality_audit table has 100% coverage (no skipped signals)
- [ ] Market-hours smoke test completed (all 5 phases + observation log)
- [ ] SPRINT_REPORT_233.md signed and filed
- [ ] Merged to main + branch deleted
- [ ] docs/TASKS_ARCHIVE.md updated (if sprint complete)
- [ ] Telegram WORK channel notified: "SPRINT-233 COMPLETE"

---

## Related Sprints

- **Sprint 232**: Implemented resilientFetcher + fallback routers (now under validation)
- **Sprint 230**: Signal validator baseline + latency instrumentation
- **Sprint 229**: Price staleness watchdog (led to fallback investigation)

---

## Questions Resolved (from REQ-233 blockers)

| Blocker | Resolution |
|---------|-----------|
| B1: Temporal decay formula | Linear decay `1 - age_hours/24`, capped at 0.5 minimum |
| B2: Audit retention | Keep 30 days, archive to signal_quality_audit_archive after (future) |
| B3: Market-hours timezone | Vietnam local time (UTC+7), 09:00–15:00 |
| B4: Penalty constant configurable | Hard-coded 0.8075 in signalValidator.ts with rationale |
| B5: Escalation error count | Last 3 errors (truncated for brevity) |

All blockers confirmed, no showstoppers.

---

## Communication

**Team notifications**:
- Dev: Use `docs/handoffs/TASK_233a.md`, `TASK_233b.md` as implementation guide
- QA: Use `docs/handoffs/TASK_233c.md` for manual test procedure
- PM: Reference TECH-233 for architecture decisions (ask if questions)

**Escalation**: If 233a/233b blocked, post to WORK channel with blocker description.

---

**Sprint designed by**: Architect (Claude Code)
**Sprint approved by**: Architect
**Sprint initiated**: 2026-04-21
**Planned completion**: 2026-04-22 (depends on manual test window availability)
