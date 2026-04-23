# Pattern: Signal Payload Quality Gap

**recurrence**: 3x (Sprint 228+, Sprint 1293 incident)
**severity**: HIGH
**root_cause**: Type definition gap + job implementation gap + no validation
**detection_date**: 2026-04-23 02:36 UTC

---

## Definition

News Scout + Market Watcher emit incomplete signal payloads on enrichment chain signals (`chain_catalyst`, `price_confirmation`). Alert Commander receives signals missing required numeric verification fields (`confidence`, `direction`, `summary` in finding_data), then synthesizer falls back to 0 values, degrading conviction scores below firing thresholds.

**Symptom**: 4-AND alerts suppressed despite matching criteria (incident: 5 bullish signals suppressed 2026-04-23).

---

## Root Causes

1. **Type definition gap** — `SignalPayload` interface is intentionally permissive (`[key: string]: unknown`)
2. **Job implementation gap** — Agents skip finding_data entirely under response budget pressure
3. **Integration gap** — MCP tool validates only `cross_validate` signals, not enrichment chain signals
4. **Testing gap** — RED tests do not assert on missing fields; GREEN fills with placeholders

---

## Expected Behavior

Each signal type carries strict finding_data requirements:

| Signal Type | Required Fields | Source |
|-------------|-----------------|--------|
| `chain_catalyst` | event_type, direction, confidence, affected_stocks, headline, source | News Scout (01-news-scout.md line 92) |
| `price_confirmation` | price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence | Market Watcher (04-market-watcher.md line 155) |
| `urgent_news` | confidence, direction, event_type | News Scout (01-news-scout.md line 95) |

Chain synthesizer accesses these fields without null guards:
- `findingData["confidence"]` → defaults to 0 if undefined
- `findingData["direction"]` → defaults to "" if undefined
- `findingData["summary"]` → used for narrative building

---

## Prevention Checklist (Post-TECH-1295)

### For Agent Developers (Using Builders)

- [ ] Import builder from domain: `const builder = createChainCatalystBuilder()`
- [ ] Use fluent API: `.setEventType(...).setDirection(...).setConfidence(...)`
- [ ] Call `.build()` BEFORE posting (throws if incomplete)
- [ ] Catch builder errors and retry with complete data
- [ ] Do NOT post object literals directly (builders enforce type safety)

### For Agent Implementers (MCP Tool Fallback)

Before merging changes to agent prompt files (.claude/agents/*.md):
- [ ] All signal_type post calls include complete finding_data
- [ ] All numeric fields have realistic values (0.0–1.0 for confidence, not placeholder "0")
- [ ] All enum fields (direction, event_type) use only documented values
- [ ] At least one test case posts incomplete signal and expects MCP tool rejection

### For Code Reviewers (Before Merge)

Before merging changes to agent specs or signal posting code:
- [ ] Builders used when available (1295a+)
- [ ] MCP tool validation still in place (1293b fallback)
- [ ] No regression in signal rejection audit metrics (1295c)

Before merging changes to agentSignalTools.ts:
- [ ] Validators exist for all enrichment chain signal types
- [ ] Validators reject payloads missing required fields
- [ ] Error messages explain which fields are missing and why (reference task #1293)

Before merging changes to chainSynthesizer.ts:
- [ ] Defensive fallbacks handle undefined fields gracefully
- [ ] Log warnings when finding_data fields are missing
- [ ] Conviction calculation does not crash (degrades safely)

---

## Fix Procedure (TECH-1293 + TECH-1295)

### Phase 1: Validation Infrastructure (TECH-1293, MERGED)

| Task | Scope | Estimate | Status |
|------|-------|----------|--------|
| 1293a | Create strict signal type interfaces (domain layer) | 4h | ✅ MERGED |
| 1293b | MCP tool validation for all chain signals | 6h | ✅ MERGED |
| 1293c | DB audit log for signal rejections | 4h | ✅ MERGED |
| 1293d | Defensive fallbacks in synthesizer | 3h | ✅ MERGED |

See `docs/TECH_1293_ROOTCAUSE.md` for implementation details.

### Phase 2: Pre-Emit Enforcement (TECH-1295, READY)

| Task | Scope | Estimate | Status |
|------|-------|----------|--------|
| 1295a | Signal Builders (4 types, typed pre-emit) | 8h | READY |
| 1295b | Agent Spec Updates (use builders) | 4h | READY |
| 1295c | Signal Quality Audit Service + Job | 4h | READY |
| 1295d | Integration Tests (builders → synthesis) | 2h | READY |

See `docs/TECH_1295.md` for full implementation plan.

---

## Verification (Post-Merge)

- [ ] 0 signal rejections over 24h window (get_signal_rejection_summary)
- [ ] Alert Commander conviction scores ≥0.75 (historical baseline)
- [ ] 4-AND alerts resume firing (watchlist-opportunity threshold met)
- [ ] Agent memory logs confidence penalty = 0 (no missing fields detected)

---

## Related Issues

- Task #693 (cross_validate validation) — single-type validator, not generalized
- Sprint 230 (signalValidator service) — confidence penalty applied post-synthesis, not pre-emit
- Pattern DDD-violations.md — independent issue (layer crossing in signal emission)

---

## Author

Architect (2026-04-23)
Source: Recurring bug escalation #1293
