---
sprint: TOOL-SURFACE-UPGRADE
branch: task/TSU-U6-tsh-leftover-merges
size: S
zone: apps/mcp-server/src/interface/mcp/
depends_on: ["TSU-DEV-U3"]
blocks: []
---

# U6: TSH Leftover Merges — Description Updates Only

## TLDR

Architect verdict (lines 438–449 of spec): KEEP ALL tools separate (no merges). All TSH leftover pairs remain distinct. Deliverable: description updates ONLY to clarify overlap + lifecycle differences. No consolidation, no signature/logic change. Tools: get_patterns vs get_technical_indicators (clarify sources), 5x trigger_*_vps_fetch (clarify script + schema per tool), get_market_summary vs generate_market_summary (clarify caching semantics), get_insider_signals vs get_insider_transactions (clarify classifier vs DB reader).

---

## [PM] Planning Context

**Sprint:** TOOL-SURFACE-UPGRADE  
**Unit:** U6 — TSH leftover merges (verdict: keep separate, description-only updates)  
**Zone:** `apps/mcp-server/src/interface/mcp/`  
**Priority:** P3  
**Type:** Documentation (description updates)  
**Effort:** ~1.5h  
**Blocked by:** TSU-DEV-U3 (tool count must stabilize before final suite documentation)

### Acceptance Criteria

- [x] AC-U6-1: `get_patterns` description updated: clarify "semantic historical precedent lookup via RAG rag_analyses" vs get_technical_indicators quantitative indicators
- [x] AC-U6-2: `get_technical_indicators` description updated: clarify "quantitative price-history derived (RSI/MACD via Go port 5003)" vs get_patterns semantic lookup
- [x] AC-U6-3: All 5 trigger_*_vps_fetch tools: update descriptions to clarify which VPS script each invokes + expected return shape per tool (bctc has {queued,...}, price has {service,...}, news has no tickers, etc.)
  - `trigger_bctc_vps_fetch`: {queued, attempted, success, failed, log_tail}
  - `trigger_price_vps_fetch`: {service, attempted, success, failed, log_tail}
  - `trigger_news_vps_fetch`: {service, attempted, success, failed, log_tail} (NO tickers param)
  - `trigger_sbv_vps_fetch`: clarify SBV script invocation
  - `trigger_foreign_flow_vps_fetch`: clarify script invocation
- [x] AC-U6-4: `get_market_summary` description: clarify "read-cache-first (if cached summary exists, return it; else generate)"
- [x] AC-U6-5: `generate_market_summary` description: clarify "force-regenerate always (bypasses cache)"
- [x] AC-U6-6: `get_insider_signals` description: clarify "domain classifier engine — requires caller-provided transactions[] array as input (test-first, no DB call)"
- [x] AC-U6-7: `get_insider_transactions` description: clarify "DB-backed SSC lookup — returns raw disclosure rows with streak detection"

### Files to Read First

- `apps/mcp-server/src/interface/mcp/tools/` — locate all 10 tools (patterns, technical-indicators, 5x triggers, 2x market-summary, 2x insider)
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U6 TSH Leftover Merges (lines 189–211 in BA spec, lines 438–449 in architect brief) — detailed verdict per pair

### Files to Modify

- Pattern tools file: get_patterns + get_technical_indicators descriptions
- Trigger tools file: all 5 trigger_*_vps_fetch descriptions
- Summary tools file: get_market_summary + generate_market_summary descriptions
- Insider tools file: get_insider_signals + get_insider_transactions descriptions

### Dependencies

- Depends on: TSU-DEV-U3 (tool count must stabilize before finalizing descriptions)
- No blocks

### Knowledge Needed

- `docs/policies/dev-standards.md` — commit convention
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U6 Verdicts (lines 438–449) — architect rulings per pair
- Architect brownfield paths (lines 294–302): get_insider_signals vs get_insider_transactions clarification

### Related Documentation

- Architect verdict: `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` lines 438–449 (KEEP BOTH for all pairs, description-only updates)

---

## Implementation Guidance

### Description Update Patterns

**Before (example):**
```typescript
server.tool('get_patterns', 'Retrieve market patterns...', ...)

server.tool('get_technical_indicators', 'Calculate technical indicators...', ...)
```

**After:**
```typescript
server.tool('get_patterns',
  'Retrieve semantic market patterns via RAG historical precedent lookup ' +
  '(rag_analyses datastore). Distinct from get_technical_indicators which serves ' +
  'quantitative price-history derived indicators (RSI/MACD via Go service port 5003). ' +
  'Use patterns for narrative context; use technical_indicators for quant signals.',
  ...)

server.tool('get_technical_indicators',
  'Calculate quantitative technical indicators (RSI, MACD, Bollinger Bands) derived from ' +
  'price history via Go microservice (port 5003). Distinct from get_patterns which provides ' +
  'semantic historical precedent lookup. Use for quantitative signal generation.',
  ...)
```

### Pattern Template

For each tool pair, follow architect verdict section 450L structure:
1. Clarify what each tool does (semantic vs quant, read-cache vs force-regen, etc.)
2. Clarify the distinction (different data source, different lifecycle, different input/output)
3. Note consumer use cases (when to use each)

### Trigger Tools (5x) Example

```typescript
server.tool('trigger_bctc_vps_fetch',
  'Trigger VPS batch BCTC PDF fetch job. Parameters: tickers[], verbose, dry_run. ' +
  'Returns {queued, attempted, success, failed, log_tail}. Invokes vps-scripts/fetch-bctc.sh on Vinahost VPS.',
  ...)

server.tool('trigger_price_vps_fetch',
  'Trigger VPS price fetch job. Parameters: tickers[], verbose, dry_run. ' +
  'Returns {service, attempted, success, failed, log_tail}. Invokes vps-scripts/fetch-prices.sh on Vinahost VPS.',
  ...)

server.tool('trigger_news_vps_fetch',
  'Trigger VPS news fetch job. Parameters: verbose, dry_run (NO tickers — source-based). ' +
  'Returns {service, attempted, success, failed, log_tail}. Invokes vps-scripts/fetch-news.sh on Vinahost VPS.',
  ...)

// Similar for trigger_sbv_vps_fetch, trigger_foreign_flow_vps_fetch
```

### Summary Tools Example

```typescript
server.tool('get_market_summary',
  'Get cached market summary (if available) or generate if absent. Caching semantics: ' +
  'read-cache-first, fall back to generation. Reuses generated summary across requests. ' +
  'Consumer: digest-predict daily flows that value cached consistency over fresh regeneration.',
  ...)

server.tool('generate_market_summary',
  'Force-regenerate market summary (bypass cache). Semantics: always regenerate, ' +
  'do not read cache. Consumer: digest-predict weekly flows that require fresh analysis. ' +
  'Distinct from get_market_summary which prioritizes cache.',
  ...)
```

### Insider Tools Example

```typescript
server.tool('get_insider_signals',
  'Domain classifier engine — classifies insider transactions as signals. REQUIRES caller to ' +
  'provide transactions[] array as input (no DB call). Test-first design: pure classification ' +
  'logic, stateless. Input: transactions[] from get_insider_transactions or external source. ' +
  'Output: classified signals with strength/confidence.',
  ...)

server.tool('get_insider_transactions',
  'DB-backed insider transaction lookup. Queries SSC disclosure table (insiderStore). ' +
  'Returns raw transaction rows with streak detection. Extended lookback: 90→180d per FIX-H. ' +
  'Distinct from get_insider_signals which is a pure classifier (no DB, requires input).',
  ...)
```

---

## Test Plan

### Unit Tests

1. **T-U6-1:** get_patterns description contains "RAG" + "rag_analyses"
2. **T-U6-2:** get_technical_indicators description contains "quantitative" + "port 5003"
3. **T-U6-3:** trigger_bctc_vps_fetch description contains "fetch-bctc.sh" + "{queued, attempted, ...}"
4. **T-U6-4:** trigger_price_vps_fetch description contains "fetch-prices.sh" + "{service, attempted, ...}"
5. **T-U6-5:** trigger_news_vps_fetch description explicitly notes "NO tickers param"
6. **T-U6-6:** get_market_summary description mentions "cache-first"
7. **T-U6-7:** generate_market_summary description mentions "force-regenerate"
8. **T-U6-8:** get_insider_signals description mentions "classifier" + "requires input"
9. **T-U6-9:** get_insider_transactions description mentions "DB" + "SSC lookup"

### QA Gate

**QA-U6-1:** List tools via `list_server_tools("vn-market")`. Verify:
- All 10 tools present (no deregistrations)
- Descriptions match architect verdict (no merge, only clarity)
- get_patterns ≠ get_technical_indicators (distinct clauses)
- Both get_market_summary tools present (distinct caching semantics)
- Both get_insider_* tools present (distinct source/architecture)

---

## Risk & Mitigation

**Risk R-U6-1:** Description updates unclear or contradictory. Solution: follow architect verdict text (lines 438–449) verbatim for each pair.

**Mitigation:** Architect brief is the spec; copy-paste clarity language.

**Risk R-U6-2:** Tools removed by mistake (merge attempted despite verdict). Solution: KEEP BOTH for all pairs — no consolidation this sprint.

**Mitigation:** Explicit in AC and architect verdict: "KEEP ALL SEPARATE".

---

## Rebuild Required

**Yes.** After description changes (metadata only, no logic), rebuild for consistency:
```bash
docker compose build --no-cache mcp-server
docker compose up -d --no-deps --force-recreate mcp-server
```

QA verifies via `list_server_tools("vn-market")` (raw descriptions, not badge).

---

## Commit Checklist

- [ ] All 10 tool descriptions updated (patterns, triggers, summaries, insiders)
- [ ] No tool merged (all 10 present)
- [ ] No signature/logic change (descriptions only)
- [ ] Descriptions clarify overlap + distinction per architect verdict
- [ ] All tests pass (tsc exit 0)
- [ ] Commit message: `docs(U6): clarify TSH leftover tool descriptions — keep separate, no merges`
- [ ] AC trailer appended per commit-convention.md

---

## Related Tasks

- Depends on: TSU-DEV-U3 (tool count stabilizes before finalizing documentation)
- Independent of: TSU-DEV-U1, TSU-DEV-U2-GEN, TSU-DEV-U4, TSU-DEV-U5 (documentation-only, no code impact)
- Precedes: TSU-DEV-U2-PARITY (finalized suite before count verification)
