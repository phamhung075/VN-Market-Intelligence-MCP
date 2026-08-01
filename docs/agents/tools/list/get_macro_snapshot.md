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
  _params?: Record<string, unknown>   // optional passthrough to the Go /snapshot POST body
) → {
  source_tier: 1 | 2 | 3 | 4,
  text: string,                       // human-readable prose — see FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT below
  fetchedAt: string | null,
  data: Record<string, unknown>,      // raw macro-indicators payload, passed through verbatim
}
```

## Input Parameters

No production parameters. `_params` is an internal passthrough forwarded to the macro-indicators
`/snapshot` HTTP POST body and is not intended for agent-supplied use.

## Output Format

**FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT (2026-08-01):** `text` is a human-readable, section-block-shaped
prose summary — the SAME shape family as `get_market_snapshot`'s `text` — built generically by
`buildMacroSnapshotText()` (`macroTools.ts`). It walks the raw upstream response recursively and
renders EVERY field it finds as a bracketed `[Section]` header with indented `Key: Value` lines — no
per-field/per-ticker hardcode, so a field the Go service adds tomorrow renders automatically. `text`
is prose (previously it was `JSON.stringify(data)` — a latent raw-JSON leak-trap for any downstream
prose-parser that echoes `.text` verbatim to the MARKET channel; closed by this fix). The raw
upstream payload is ALSO passed through verbatim as the envelope's `data` field so synthesizing
agents that need typed values read `data.signals.carry.regime` etc. directly instead of parsing prose.

```json
{
  "source_tier": 2,
  "text": "[Macro Snapshot]\nStatus: ok\nVn Index: 1282.50\nOil Usd: 84.37\nGold Usd: 1950.50\nUsd Vnd: 25450\nData Source: live\n\n[Signals]\n  [Carry]\n    Regime: NEUTRAL\n    Carry Spread: 1.38\n    Vnd Deposit Rate: 5\n    Fed Funds Rate: 3.62\n    Source Tier: 2\n  [Yield]\n    Label: CHEAP\n    Spread: 3.20\n  ...\n\nGenerated: 2026-05-19T08:00:00.000Z",
  "fetchedAt": "2026-05-19T08:00:00.000Z",
  "data": {
    "status": "ok",
    "vnIndex": 1282.5,
    "oilUsd": 84.37,
    "goldUsd": 1950.5,
    "usdVnd": 25450.0,
    "dataSource": "live",
    "signals": { "carry": { "regime": "NEUTRAL", "carrySpread": 1.38, "source_tier": 2 }, "yield": { "label": "CHEAP", "spread": 3.2 } }
  }
}
```

Key sections in `text` (rendered generically from whatever `data` contains — no fixed field list):
- Top-level scalars (`status`, `vnIndex`, `oilUsd`, `goldUsd`, `usdVnd`, `dataSource`, ...) — one `Key: Value` line each
- `[Signals]` — nested sub-sections per component (`[Carry]`, `[Yield]`, `[Oil]`, `[Gold]`, `[Usdvnd]`, `[Investment Clock]`, and any future component)
- `null`/`undefined` fields render as the honest string `unavailable`, never fabricated
- Trailing `Generated: <fetchedAt>` line (`unavailable` when the upstream omits `fetchedAt` — FDA-7)

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
- Source tier: worst-of (max) `source_tier` across every `signals.*` component actually present in
  the macro-indicators response (baseline 2 for the live aggregator; rises to e.g. 4 if any present
  component — carry, yield, or a future addition — is itself an estimate/fixture). An absent
  component never lowers the reported tier. Fix: FU-MACRO-SNAPSHOT-TIER-WORSTOF (2026-07-31),
  `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` `get_macro_snapshot` handler.
- TODO: upgrade the aggregator's own baseline tier when a direct SBV REST API replaces the proxy
- Superseded for session-start use by `get_market_context` (compound tool, Task 239)
- FDA-7 (2026-07-31): honest provenance-omission fallbacks. If NO present `signals.*`
  component carries a `source_tier` (older Go build without provenance fields, or `signals`
  entirely absent), `source_tier` defaults CONSERVATIVELY to `4` (unknown), never the
  optimistic `2`. If the Go response omits `fetchedAt`, the field is returned as `null` —
  the proxy never re-stamps `new Date().toISOString()` as a substitute, which would make a
  stale/older-build snapshot masquerade as freshly fetched.

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
