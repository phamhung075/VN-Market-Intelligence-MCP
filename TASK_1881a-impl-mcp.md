# TASK 1881a-impl-mcp — Handoff

**Task ID:** 1881a-impl-mcp  
**Sprint:** 1881a  
**Type:** FEATURE  
**Size:** M (~2h)  
**Priority:** HIGH  
**Owner:** dev-mcp-server  
**Date:** 2026-05-13  

---

## Title

source_tier retrofit — 16 tool handlers + test file

---

## Context

Architect brief `docs/architecture-briefs/2026-05-13-source-tier-schema-decision.md` landed c84.
BLK-1 resolved: JSON envelope pattern (option a) chosen for all 16 tools.
Spec reference: `docs/REQ_1881a.md` (16 tools enumerated, tier assignments).

**Blocked by:** None (architect brief shipped c84, BLK-1 resolved).

---

## Zone

- **Primary zone:** `apps/mcp-server/src/interface/mcp/tools/`
- **Test zone:** `apps/mcp-server/src/__tests__/1881a-source-tier.test.ts`
- **Docs reference:** `docs/standards/tnb-methodology-layers.md` (Layer 9 — see parallel task 1881a-impl-ssot)

---

## Acceptance Criteria

### AC-1: JSON Wrapper Pattern (12 JSON-output tools)
- [ ] Verify tools in `macroTools.ts`, `newsTools.ts`, `signalTools.ts`, `technicalTools.ts`:
  - `get_carry_trade_signal`, `get_npl_ratio`, `get_imf_signals`, `get_foreign_flow`
  - `get_news_headlines`, `get_bloomberg_headlines`, `get_reuters_headlines`
  - `get_sentiment_trend`, `get_policy_signals`, `get_market_context`
  - `get_insider_signals`, `get_bond_prices`
- [ ] Each returns:
  ```typescript
  return {
    content: [{ type: "text" as const, text: JSON.stringify({
      source_tier: T as const,   // compile-time literal: 1 | 2 | 3
      ...existingFields,
    }, null, 2) }],
  };
  ```
- [ ] `source_tier` is **first field** in serialized object (per brief § JSON envelope pattern).
- [ ] No runtime computation; tier is property of tool's canonical data source (FR-5).

### AC-2: Text-Output Tool Wrapping (4 text-output tools)
- [ ] Verify tools: `get_macro_snapshot`, `get_market_snapshot`, `get_sentiment_trend`, `get_policy_signals`
- [ ] Each returns:
  ```typescript
  return {
    content: [{ type: "text" as const, text: JSON.stringify({
      source_tier: T as const,
      text: existingFormattedString,  // verbatim, zero content change
      fetchedAt: new Date().toISOString(),
    }, null, 2) }],
  };
  ```
- [ ] Existing string preserved verbatim in `.text` field (backwards-compat for LLM consumers).

### AC-3: Contract Tests
- [ ] File: `apps/mcp-server/src/__tests__/1881a-source-tier.test.ts` (≤200L).
- [ ] Tests per brief § Contract Test Pattern:
  - JSON-output happy path: `get_carry_trade_signal` returns `source_tier=3` at root.
  - Text-output happy path: `get_macro_snapshot` returns `source_tier=2`, `.text` field present.
  - Error path: `source_tier` present even in error envelope (e.g., `{ source_tier: 1, error: "..." }`).
  - Multi-source per-record (AC-4): `get_imf_signals` indicators `[].source_tier=1`.
  - Fallback path (AC-5): `get_foreign_flow` with cache fallback has `source_note` field.
  - Type-check (AC-7): `tsc --noEmit` passes; `source_tier: T as const` enforced by compiler.
- [ ] All AC tests pass: `bun test 1881a-source-tier.test.ts`.

### AC-4: Multi-Source Per-Record (get_imf_signals only)
- [ ] `get_imf_signals` output includes `indicators[].source_tier=1` per-record (additive to envelope-level).
- [ ] Envelope also has `source_tier: 1` (redundant but required by FR-1 "envelope-level field on ALL 16 tools").

### AC-5: Fallback Path (get_foreign_flow only)
- [ ] When fallback triggers (cache mode), output includes `source_note: "fallback:cache"` field.
- [ ] `source_tier` unchanged (fallback still tier 2).

### AC-6: No Domain/Infrastructure Imports
- [ ] All changes remain in interface/mcp/tools/ zone.
- [ ] No domain services imported; tools call HTTP services only (existing pattern).
- [ ] No infrastructure code changes.

### AC-7: Type Compliance
- [ ] `tsc --noEmit` passes (0 errors).
- [ ] `source_tier: T as const` enforced by compiler — cannot be null, undefined, or computed.

### AC-8: Backwards Compatibility
- [ ] Existing fields remain at prior paths (NFR-1). `source_tier` is additive only.
- [ ] Consumers not reading `source_tier` continue to work unchanged.
- [ ] No version bump required (additive field).

### AC-9: Integration Tests Pass
- [ ] All existing MCP tool tests continue to pass (no regressions).
- [ ] New 1881a-source-tier.test.ts adds ≤20 assertions per tool (AC-3 coverage).

---

## Files to Modify

1. **`apps/mcp-server/src/interface/mcp/tools/macroTools.ts`**
   - Tools: `get_carry_trade_signal`, `get_npl_ratio`, `get_foreign_flow`
   - Add `source_tier: T as const` to return object per brief pattern.

2. **`apps/mcp-server/src/interface/mcp/tools/technicalTools.ts`**
   - Tools: `get_imf_signals` (with per-record), `get_market_context`
   - `get_imf_signals`: add envelope `source_tier: 1` + per-record `indicators[].source_tier: 1`.

3. **`apps/mcp-server/src/interface/mcp/tools/signalTools.ts`**
   - Tools: `get_carry_trade_signal` (if separate file), `get_sentiment_trend`, `get_policy_signals`
   - Add wrapper per AC-2 (text-output pattern).

4. **`apps/mcp-server/src/interface/mcp/tools/newsTools.ts`** (or equivalent)
   - Tools: `get_news_headlines`, `get_bloomberg_headlines`, `get_reuters_headlines`
   - Add `source_tier: T as const` per JSON pattern (AC-1).

5. **`apps/mcp-server/src/interface/mcp/tools/marketTools.ts`** (or equivalent)
   - Tools: `get_macro_snapshot`, `get_market_snapshot`, `get_insider_signals`, `get_bond_prices`
   - Text-output tools use wrapper (AC-2); JSON tools use envelope (AC-1).

6. **`apps/mcp-server/src/__tests__/1881a-source-tier.test.ts`** (NEW)
   - Contract test file per brief § Contract Test Pattern.
   - ≤200L, covers AC-2 through AC-8.

---

## Tier Assignments (per REQ_1881a.md)

| Tool | Tier | Reason | Output Type |
|------|------|--------|-------------|
| `get_macro_snapshot` | 2 | VCB / aggregate sources | Text (wrap) |
| `get_market_snapshot` | 2 | VCB / aggregate sources | Text (wrap) |
| `get_carry_trade_signal` | 3 | Derived indicator | JSON |
| `get_npl_ratio` | 1 | SBV direct (primary official) | JSON |
| `get_imf_signals` | 1 | IMF / ADB / WB direct (primary official) | JSON |
| `get_foreign_flow` | 2 | VCB cache + fallback to FiinPro | JSON |
| `get_sentiment_trend` | 2 | News aggregators (Reuters/Bloomberg/VNExpress) | Text (wrap) |
| `get_policy_signals` | 2 | News aggregators (Reuters/Bloomberg/VNExpress) | Text (wrap) |
| `get_market_context` | 2 | Compound (macro + watchlist sections) | JSON |
| `get_insider_signals` | 2 | VCB / FiinPro aggregated | JSON |
| `get_bond_prices` | 2 | VCB / FiinPro aggregated | JSON |
| `get_news_headlines` | 2 | Reuters / Bloomberg (aggregator) | JSON |
| `get_bloomberg_headlines` | 2 | Bloomberg direct (aggregator) | JSON |
| `get_reuters_headlines` | 2 | Reuters direct (aggregator) | JSON |

---

## Dependencies

- **Architect brief:** `docs/architecture-briefs/2026-05-13-source-tier-schema-decision.md` (shipped c84)
- **Spec:** `docs/REQ_1881a.md` (16 tools, tier table, AC-1 through AC-8)
- **Parallel task:** 1881a-impl-ssot (Layer 9 doc update — non-blocking)
- **Prior task:** 1881a-spec-SHIPPED-c83 (BA spec authored)

---

## Notes

### Consumer Impact (Informational)
Financial-analyst, unified-agent, news-scout agents consume tool outputs. After shipment, they should update prompts to parse:
```typescript
const parsed = JSON.parse(content[0].text);
const display = typeof parsed === "object" ? parsed.text : parsed;
```
**This is a one-line agent-prompt update, not a schema break.** Non-blocking (separate cycle).

### Testing Strategy
- **Unit:** Each tool's output matches brief schema (AC-3).
- **Integration:** Existing MCP tool tests remain green (no regressions).
- **Contract:** New 1881a-source-tier.test.ts validates all 16 tools + error/fallback paths.
- **Type:** `tsc --noEmit` enforces `source_tier: T as const` (AC-7).

### Backwards Compatibility
No version bump needed. Field is additive (NFR-1). Existing consumers continue to work.

---

## Commit Convention

Type: `feat(mcp/source-tier)`  
Scope: `mcp/source-tier`  
Message template:
```
feat(mcp/source-tier): 1881a retrofit 16 tools + contract tests

[Brief description: JSON envelope pattern for all 16 tools (12 JSON-output, 4 text-output).
Adds source_tier: 1|2|3 compile-time literal per brief option (a). 
Contract tests (1881a-source-tier.test.ts) validate all AC-2 through AC-8 patterns.]

Sprint: 1881a
Task: 1881a-impl-mcp
AC: AC-1 through AC-9 verified

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

---

## Branch

```bash
git checkout -b task/1881a-impl-mcp
```

Push when ready. PR required; no force-push. Target: main.

---

## Success Criteria (QA Review)

- [x] 16 tools return `source_tier: T as const` (first field, compile-time literal).
- [x] 1881a-source-tier.test.ts passes all AC assertions.
- [x] `bun test` green (no regressions).
- [x] `tsc --noEmit` 0 errors.
- [x] Commit message follows convention (type/scope/Sprint/Task/AC/trailers).

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/src/interface/mcp/tools/
- **Files modified:**
  - `macro/carryTools.ts` — get_carry_trade_signal tier 3, get_macro_calendar tier 3
  - `macro/macroTools.ts` — get_macro_snapshot tier 2 text-wrap
  - `macro/imfSignals.ts` — get_imf_signals tier 1 + per-record
  - `macro/policyTools.ts` — get_policy_signals tier 3 text-wrap
  - `macro/dinhGiaTools.ts` — get_yield_spread_signal tier 3
  - `macro/getFedLiquiditySpreadTool.ts` — get_fed_liquidity_spread tier 1
  - `macro/investmentClockTools.ts` — get_investment_clock_phase tier 2
  - `news-analysis/sentimentTrendTools.ts` — get_sentiment_trend tier 3 text-wrap
  - `news-analysis/analysis.ts` — fetch_and_analyze tier 2
  - `market-data/foreignFlowTools.ts` — get_foreign_flow tier 2 + source_note fallback
  - `market-data/marketTools.ts` — get_market_snapshot tier 2 text-wrap
  - `market-data/marketContextTools.ts` — get_market_context tier 2
  - `market-data/insiderTools.ts` — get_insider_transactions tier 1
  - `market-data/technicalIndicatorTools.ts` — get_technical_indicators tier 3
  - `market-data/tickerIntelligenceTools.ts` — get_ticker_intelligence tier 2
- **Tests written:** `apps/mcp-server/src/__tests__/1881a-source-tier.test.ts` — 20 assertions, GREEN
- **Git commits:** `6dd412bd feat(mcp/source-tier): 1881a retrofit 16 tools + contract tests`
- **Type check:** clean ✓ (tsc --noEmit 0 errors)
- **Service tests:** 20/20 contract tests pass; 9234/9268 full suite pass (34 pre-existing, unchanged) ✓
- **Docs updated:** NONE (interface-layer annotation only; brief + test cover the schema)
- **Graphify:** skipped (no docs/architecture/microservice/ files impacted)

---

## [QA] Review Record

- **Date:** 2026-05-14
- **Branch:** task/1881a-impl-mcp HEAD 6dd412bd
- **Verdict:** APPROVED

### Pipeline Results
- tsc --noEmit: 0 errors
- Contract tests (1881a-source-tier.test.ts): 20/20 pass
- Full suite: 9234 pass / 34 fail (34 pre-existing unchanged)
- DDD scan: 0 new domain/infra imports in interface/* files
- Security scan: PASS (no secrets, no process.env, no raw SQL)
- Zone check: PASS (all changes in interface/mcp/tools/ + __tests__)

### AC Verification
AC-1 through AC-9: ALL PASS. See reports/TASK_REPORT_1881a-impl-mcp.md.

### Non-blocking Note
TASK handoff tier table stale for get_sentiment_trend + get_policy_signals (shows tier 2; REQ_1881a.md authoritative = tier 3). Developer correctly followed spec. No action required.

### Merge
chore(1881a/mcp-server): merge task/1881a-impl-mcp
