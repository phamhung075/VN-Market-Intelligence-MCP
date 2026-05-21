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
| `signal_type` | enum | Yes | — | Signal classification: `urgent_news`, `price_anomaly`, `cross_validate`, `suppress`, `chain_catalyst`, `fundamental_validation`, `price_confirmation`, `verified_chain`, `verified_decision` |
| `stock_code` | string | No | — | Stock ticker code (e.g. 'VNM'), optional |
| `payload` | object | Yes | — | Signal payload: `title` (string), `detail` (string), `impact_score` (0-10, optional) |
| `ttl_minutes` | number | No | 120 | Time-to-live in minutes |
| `cycle_id` | string | No | auto | 15-min cycle ID (auto-computed if omitted), format YYYYMMDD-HHMM |
| `finding_data` | object | No | {} | Structured finding metrics (confidence, direction, event_type, validates, confirms_direction, volume_above_average, summary, etc.) |
| `causal_ref` | number | No | — | ID of parent signal this finding builds on |
| `chain_depth` | number | No | 0 | Chain depth: 0=catalyst, 1=validation, 2=confirmation, 3=synthesis (0-3) |
| `retry_count` | number | No | 0 | TNB critic gate retry counter. 0 = first attempt (default); 1 = retry after critic feedback. |

## Return Format

**Success (signal written):**
```json
{
  "success": true,
  "signal_id": 12345,
  "cycle_id": "20260517-0900",
  "critic_pass": true,
  "critic_score": 1.0,
  "message": "Signal posted to alert-commander: urgent_news [VCB] (id=12345, ttl=120m, cycle=20260517-0900, critic_score=1.0)"
}
```

**TNB Critic Gate rejection (first attempt, score < 0.6):**
```json
{
  "success": false,
  "signal_id": null,
  "critic_pass": false,
  "critic_score": 0.4,
  "critique": "Pillar gap: detail references price action only — add cost-of-capital or profit outlook context.",
  "retry_count_remaining": 1,
  "message": "Signal rejected by TNB critic gate [VCB]. Score: 0.4/1.0. Revise payload addressing the critique gap and call post_agent_signal again with retry_count=1."
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

## TNB Critic Gate

Every `post_agent_signal` call passes through a deterministic quality gate before DB write:

**5 checks × 0.2 each — threshold 0.6 (3 of 5 must pass):**
1. **Pillar coverage** — `detail` references at least one of: money supply / cost of capital / profit / policy
2. **Source tier** — no Facebook/Zalo/Reddit reference without tier-1 anchor
3. **Specificity** — `title + detail` >= 80 chars; no vague phrases ("có thể", "possibly", "might") as sole conclusion
4. **BCTC forensics** — for `fundamental_validation` only: `findingData` must include `m_score`, `f_score`, `accruals_flag`, or `btn_check`
5. **Confidence anchor** — `payload.impact_score >= 3` OR `findingData.confidence_score > 0.5`

**Retry protocol (max 1 retry):**
- Score < 0.6 on first attempt: signal NOT written; critique returned inline
- Agent revises payload and re-calls with `retry_count=1`
- On second call: written regardless of score (fail-soft)

**Fail-soft:** Gate timeout (20s) or error → signal written with `critic_score=null`. Never blocks.

**Persisted columns:** `critic_score REAL`, `critic_notes TEXT`, `retry_count INTEGER` on each `agent_signals` row.

## Notes

- Signals with the same stock in the same cycle automatically form causal chains
- Chain depth helps the synthesizer understand signal hierarchy (catalyst → validation → confirmation → synthesis)
- Task 1293: strict schema validation prevents incomplete data in the enrichment pipeline
- causal_ref links signals to build multi-step reasoning chains
