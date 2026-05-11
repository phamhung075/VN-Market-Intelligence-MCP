# post_agent_signal

**Category:** News-Analysis / Agent Coordination

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`

## Purpose

Post a typed, TTL-bound signal to the agent coordination bus. Agents use this to share findings (news events, price confirmations, fundamental validations) that participate in the enrichment chain.

The chain synthesizer automatically forms causal chains when 2+ agents post about the same stock in the same 15-minute cycle. Signals expire after `ttl_minutes` and are automatically cleaned up.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `from_agent` | string | Yes | — | Name of the sending agent (e.g. 'news-scout') |
| `to_agent` | string | Yes | — | Name of receiving agent or 'all' for broadcast (e.g. 'alert-commander') |
| `signal_type` | enum | Yes | — | Signal classification: `urgent_news`, `price_anomaly`, `cross_validate`, `suppress`, `chain_catalyst`, `fundamental_validation`, `price_confirmation`, `verified_chain` |
| `stock_code` | string | No | — | Stock ticker code (e.g. 'VNM'), optional |
| `payload` | object | Yes | — | Signal payload: `title` (string), `detail` (string), `impact_score` (0-10, optional) |
| `ttl_minutes` | number | No | 120 | Time-to-live in minutes |
| `cycle_id` | string | No | auto | 15-min cycle ID (auto-computed if omitted), format YYYYMMDD-HHMM |
| `finding_data` | object | No | {} | Structured finding metrics (confidence, direction, event_type, validates, confirms_direction, volume_above_average, summary, etc.) |
| `causal_ref` | number | No | — | ID of parent signal this finding builds on |
| `chain_depth` | number | No | 0 | Chain depth: 0=catalyst, 1=validation, 2=confirmation, 3=synthesis (0-3) |

## Return Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "Signal posted successfully with id: 12345"
    }
  ]
}
```

**Error Response** (if validation fails):
```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Signal type 'chain_catalyst' has invalid or missing required fields:\n..."
    }
  ],
  "isError": true
}
```

## Validation Rules

- Signal types `chain_catalyst`, `price_confirmation`, `urgent_news`, `cross_validate`, `price_anomaly` are validated against strict Zod schemas
- Incomplete payloads are rejected with detailed error messages before storage
- Signal rejections are logged to the `signal_rejections` audit table
- Unknown signal types pass through with a warning (forward compatibility)

## Use Cases

- **News Scout** → post urgent_news signal when market-moving event detected
- **Market Watcher** → post price_anomaly signal for >2σ moves
- **Financial Analyst** → post cross_validate signal with BCTC confirmation
- **All agents** → post chain_catalyst signals for impact >= 7 watchlist catalysts

## Related Tools

- `get_agent_signals` — retrieve pending signals
- `record_signal_outcome` — mark signal as fired/suppressed/confirmed/false_positive
- `get_signal_effectiveness` — review signal quality metrics
- `get_open_chain_findings` — query open findings for enrichment

## Notes

- Signals with the same stock in the same cycle automatically form causal chains
- Chain depth helps the synthesizer understand signal hierarchy (catalyst → validation → confirmation → synthesis)
- Task 1293: strict schema validation prevents incomplete data in the enrichment pipeline
- causal_ref links signals to build multi-step reasoning chains
