# get_macro_snapshot

**Module:** `interface/mcp/tools/macro/macroTools.ts`

**Category:** Macro / Regime

## Overview

Fetches live macro indicators from two independently error-isolated sources and returns a formatted macro intelligence summary with signal cascade indicators per sector.

Sources:
- Yahoo Finance: Brent crude, gold spot, USD/VND, DXY, US 10Y yield
- State Bank of Vietnam (SBV) via Vietcombank XML proxy: overnight rate, refinancing rate, official USD/VND FX

Also queries local SQLite for Thien Thoi regime signals and Dinh Gia (earnings yield vs deposit rate) inputs; each DB section is independently skipped on failure.

Note: `get_market_context` is the recommended compound entry point for agents at session start — it calls `get_macro_snapshot` internally along with 4 other data sources. Use `get_macro_snapshot` directly only when a focused macro-only query is needed.

## Tool Signature

```typescript
get_macro_snapshot(
  _testCommodityClient?: any,   // test-only
  _testSbvClient?: any,         // test-only
  _testDinhGiaInputs?: any      // test-only
) → { source_tier: 2, text: string, fetchedAt: string }
```

## Input Parameters

No production parameters. All three parameters are test-injection hooks and must not be passed in agent calls.

## Output Format

JSON envelope wrapping a plain-text macro summary:

```json
{
  "source_tier": 2,
  "text": "=== MACRO SNAPSHOT — 2026-05-19T08:00:00Z ===\n\n[COMMODITY PRICES]\nBrent Crude : 78.40 USD/bbl  (+0.8%)\nGold        : 2,345 USD/oz   (+0.3%)\nUSD/VND     : 25,410         (-0.1%)\n...\n\n[SBV RATES]\nOvernight   : 4.50%\nRefinancing : 4.50%\nOfficial FX : 25,400 VND/USD\n...\n\n[REGIME SIGNALS]\nRegime      : EASING\nCarry Regime: NEUTRAL\n...",
  "fetchedAt": "2026-05-19T08:00:00.000Z"
}
```

Key fields in `text` narrative:
- `[COMMODITY PRICES]` — Brent, gold, USD/VND, DXY, US 10Y with direction delta
- `[SBV RATES]` — overnight, refinancing, official FX (omitted if SBV fetch fails)
- `[REGIME SIGNALS]` — TIGHTENING / EASING / NEUTRAL, carry regime, us10y signal, dxy signal (from Thien Thoi DB; omitted if DB query fails)
- `[DINH GIA]` — earnings yield vs deposit rate spread (from tracked_indicators DB; omitted if DB query fails)
- Sector cascade signals for energy, gold, banking, real estate, aviation

## Error / Degradation Conditions

Each source is independently isolated:

| Failure | Behavior |
|---------|----------|
| Yahoo Finance fetch fails | Commodity section shows degraded / partial data; `logger.warn` emitted |
| SBV fetch fails | SBV rates section omitted; `logger.warn` emitted |
| Thien Thoi DB query fails | Regime signals section omitted; `logger.warn` emitted |
| Dinh Gia DB query fails | Dinh Gia section omitted; `logger.warn` emitted |
| Complete unexpected error | Returns `{ source_tier: 2, error: "Error fetching macro snapshot: ..." }` |

## Usage Examples

```
Market Analyst → get_macro_snapshot()
Returns current macro regime + commodity prices + sector cascade signals

(Preferred) Market Analyst → get_market_context()
Calls get_macro_snapshot internally plus watchlist, alerts, analysis history
```

## Integration Notes

- Called by: Market Analyst (direct macro query), `get_market_context` compound tool (internally)
- Source tier: 2 (aggregator — Yahoo Finance + Vietcombank XML proxy for SBV rates)
- TODO: upgrade to tier 1 when direct SBV REST API is implemented
- Superseded for session-start use by `get_market_context` (compound tool, Task 239)

## Related Tools

| Tool | Relationship |
|------|-------------|
| `get_market_context` | Compound tool that calls this internally; preferred for agent session start |
| `macro_policy` | Derives policy signals from macro snapshot output |
| `macro_evidence` | Appends macro evidence to a prediction claim |

---

**Added:** Task 089 (macro MCP tools)
**Stub created:** Sprint 1951b (QA BLOCK-3 resolution — tool confirmed live in macroTools.ts; NOT removed by get_market_context introduction)
**Status:** STABLE
