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

## Prevention Checklist

Before merging changes to agent prompt files (.claude/agents/*.md):
- [ ] All signal_type post calls include complete finding_data
- [ ] All numeric fields have realistic values (0.0–1.0 for confidence, not placeholder "0")
- [ ] All enum fields (direction, event_type) use only documented values
- [ ] At least one test case posts incomplete signal and expects MCP tool rejection

Before merging changes to agentSignalTools.ts:
- [ ] Validators exist for all enrichment chain signal types
- [ ] Validators reject payloads missing required fields
- [ ] Error messages explain which fields are missing and why (reference task #1293)

Before merging changes to chainSynthesizer.ts:
- [ ] Defensive fallbacks handle undefined fields gracefully
- [ ] Log warnings when finding_data fields are missing
- [ ] Conviction calculation does not crash (degrades safely)

---

## Fix Procedure (TECH-1293)

| Task | Scope | Estimate |
|------|-------|----------|
| 1293a | Create strict signal type interfaces (domain layer) | 4h |
| 1293b | MCP tool validation for all chain signals | 6h |
| 1293c | DB audit log for signal rejections | 4h |
| 1293d | Defensive fallbacks in synthesizer | 3h |

See `docs/TECH_1293_ROOTCAUSE.md` for full implementation plan.

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
