# Architecture Decision — Signal Payload Quality (TECH-1295)

**Date**: 2026-04-23
**Status**: APPROVED FOR IMPLEMENTATION
**Decision**: Option A (Typed Builders) + Monthly Audit
**Effort**: 18h (4 subtasks)
**Risk**: LOW

---

## Problem Statement

**Recurring bug**: News Scout + Market Watcher emit incomplete signal payloads (missing `confidence`, `direction`, `affected_stocks`, etc.) on chain_catalyst and price_confirmation signals.

**Impact**:
- 5 bullish signals suppressed on 2026-04-23 02:36 UTC (low conviction due to missing fields)
- Alert Commander cannot fire high-conviction 4-AND alerts
- MCP tool rejects incomplete payloads, agents retry (latency + extra API calls)

**Root causes** (4 gaps):
1. Type definition gap: `SignalPayload` interface too permissive
2. Job implementation gap: Agents skip finding_data under token budget pressure
3. Integration gap: MCP tool validation only checks 1 of 8 signal types
4. Testing gap: RED tests don't assert "incomplete payload → rejection"

---

## What Was Done (TECH-1293)

✅ **1293a**: Strict Zod schemas (ChainCatalystFindingDataSchema, PriceConfirmationFindingDataSchema, etc.)
✅ **1293b**: MCP tool validation for all chain signals (rejects before DB storage)
✅ **1293c**: DB audit log (signal_rejections table, tracks failed payloads)
✅ **1293d**: Domain fallbacks (chainSynthesizer handles missing fields gracefully)

**Result**: Reactive validation — catches incomplete payloads AFTER construction, logs errors, causes agent retries.

---

## The Gap (Why 1293 Alone Insufficient)

**Pattern**: Agents still construct incomplete payloads; 1293 validates AFTER.

```
Flow with 1293 (Reactive):
┌─────────────────────────────────────────────────────────────┐
│ Agent constructs object literal (incomplete)                 │
│  → POST to MCP tool                                          │
│    → MCP validates (rejects)                                 │
│      → Agent retries (new API call)                          │
│        → Agent succeeds (now complete)                       │
│          → Signal stored                                     │
│            → (15ms delay + extra tokens + log entry)         │
└─────────────────────────────────────────────────────────────┘
```

**Problem**: Validation is too late. Agents have already wasted effort constructing bad object.

---

## Solution: Typed Builders (Option A)

**Approach**: Pre-emit validation via fluent builder API.

```
Flow with Builders (Proactive):
┌─────────────────────────────────────────────────────────────┐
│ Agent uses builder:                                          │
│  createChainCatalystBuilder()                                │
│    .setEventType("credit_policy")                            │
│    .setDirection("bullish")                                  │
│    .setConfidence(0.8)                                       │
│    .addStock("VIC")                                          │
│    .build()  ← Validates IMMEDIATELY                         │
│      ↓                                                        │
│   Throws if incomplete (agent catches + retries locally)     │
│   OR returns validated data (agent posts safely)             │
│                                                              │
│  → POST to MCP tool (now guaranteed complete)               │
│    → MCP validates (passes quickly)                          │
│      → Signal stored                                         │
└─────────────────────────────────────────────────────────────┘
```

**Benefits**:
1. **Pre-emit** — Agents catch errors at construction time (no MCP round-trip)
2. **Typed** — TypeScript compiler ensures builder methods exist + return correct type
3. **Enforced** — `.build()` throws if required fields missing (compile-time safety)
4. **Safe** — MCP tool still validates (defense in depth)

---

## Why Option A Wins

| Aspect | Option A (Builders) | Option B (Pre-Emit Validator) | Option C (Typed Agents) |
|--------|-------------------|-------------------------------|------------------------|
| **When** | Pre-emit (at construction) | Pre-emit (before post) | Pre-emit (compile-time) |
| **Enforcement** | TypeScript compiler | Discipline-based | TypeScript compiler |
| **Effort** | 18h | 6h | 40h+ |
| **Risk** | LOW | MEDIUM | HIGH (blocks on redesign) |
| **Agent adoption** | Soft rollout (MCP fallback) | Required | Required (full redesign) |
| **Measurable** | Yes (rejection rate ↓50%) | Yes | Yes (but slow) |

**Winner**: Option A because it combines low effort + low risk + measurable improvement.

---

## Implementation Plan (Sprint 1295)

### 1295a: Signal Builders (8h)
Create fluent builder classes for 4 signal types:
- `createChainCatalystBuilder()` → ChainCatalystBuilder
- `createPriceConfirmationBuilder()` → PriceConfirmationBuilder
- `createUrgentNewsBuilder()` → UrgentNewsBuilder
- `createCrossValidateBuilder()` → CrossValidateBuilder

Each builder:
- Enforces required fields via setters
- `.build()` validates against Zod schema
- Throws clear error if incomplete

### 1295b: Agent Spec Updates (4h)
Update agent .md files to use builders:
- `.claude/agents/01-news-scout.md` (chain_catalyst + urgent_news)
- `.claude/agents/04-market-watcher.md` (price_confirmation)
- `docs/agent-memory/patterns/signal-payload-quality.md` (prevention checklist)

### 1295c: Signal Quality Audit (4h)
Create monthly audit job + dashboard:
- `signalQualityAudit.ts` — Queries rejection stats
- `monthlySignalQualityJob.ts` — Runs 1st of month
- `get_signal_quality_audit()` MCP tool — Dashboard for Unified Coordinator
- Triggers WORK channel alert if rejection_rate > 2%

### 1295d: Integration Tests (2h)
Full end-to-end tests:
- Build signal → post via MCP → retrieve from DB → synthesize
- Assert no rejections + correct conviction scores
- Assert no confidence penalties in logs

---

## DDD Architecture

```
src/domain/signals/
  ├─ signalTypes.ts         (TECH-1293a, Zod schemas)
  ├─ signalBuilders.ts      (TECH-1295a, fluent builders) ← NEW
  └─ index.ts               (barrel exports)

src/interface/mcp/tools/
  └─ news-analysis/
    └─ agentSignalTools.ts  (TECH-1293b, MCP validation)

src/infrastructure/db/
  └─ signalRejectionStore.ts (TECH-1293c, audit log)

src/application/services/
  └─ signalQualityAudit.ts  (TECH-1295c, analytics) ← NEW

src/scheduler/audits/
  └─ monthlySignalQualityJob.ts (TECH-1295c, cron) ← NEW
```

**DDD Rules**:
- Builders (domain) → no infrastructure imports ✓
- Reuse Zod schemas (domain) ✓
- MCP tool calls builders (interface → domain) ✓

---

## Success Metrics (7 Days Post-Merge)

| Metric | Baseline | Target | Evidence |
|--------|----------|--------|----------|
| Signal rejections per 1000 posts | 12–15 | <5 | `get_signal_quality_audit(days=7)` |
| MCP tool rejection rate | 1.2% | <0.5% | DB query: rejection_count / total_posts |
| Confidence penalties in logs | High | 0 | grep "Missing confidence" in logs |
| Chain synthesizer conviction | 0.3–0.5 (incident) | 0.7–0.85 (baseline) | Alert metrics |
| 4-AND alert firing rate | Suppressed | Pre-bug baseline | Alert Commander audit log |

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Agents don't adopt builders | MEDIUM | MEDIUM | MCP tool still validates (fallback); soft rollout; doc examples |
| Builder API confusing | LOW | MEDIUM | Fluent interface + clear error messages; test with agent simulator |
| Performance regression | LOW | LOW | Builders are thin wrappers; no DB cost |
| Backward compat (old signals) | LOW | LOW | Builders optional; old signals handled by 1293d fallbacks |
| Type mismatch (builder ≠ schema) | VERY LOW | HIGH | Builders use same Zod schemas; single source of truth |

---

## Next Steps

1. **Architect approval**: ✅ APPROVED (2026-04-23)
2. **Dev Team execution**: Start 1295a–1295d (18h, 4 subtasks)
3. **QA review**: Verify 1295a–1295d tests + agent specs
4. **Merge**: Deploy to production
5. **Monitor**: Run audit job; track metrics

---

## Related Decisions

| Task | Relation | Status |
|------|----------|--------|
| TECH-1293 | Validation infrastructure (1295 builds on) | ✅ MERGED |
| TECH-1294 | BCTC resilience (separate incident) | IN PROGRESS |
| Agent Architecture Redesign | Future (Option C, 40h+) | BACKLOG |

---

**Architect**: 2026-04-23
**Ready for Dev Team**: YES
**Implementation: TECH_1295.md + TASK_1295_KICKOFF.md**
