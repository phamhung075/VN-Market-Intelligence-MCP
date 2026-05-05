# get_open_chain_findings

**Category:** News-Analysis / Agent Coordination

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`

## Purpose

Query open findings for agents to enrich with additional signals. Returns partially-formed causal chains that need downstream validation or confirmation. Helps agents discover enrichment opportunities without duplicating analysis.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `stock_code` | string | No | — | Filter by stock ticker (e.g. 'VNM'), optional |
| `chain_depth` | number | No | — | Filter by chain depth (0-3), optional. 0=catalyst, 1=validation, 2=confirmation, 3=synthesis |
| `days` | number | No | 7 | Look-back window in days (1-30) |

## Return Format

```json
[
  {
    "id": 1234,
    "fromAgent": "news-scout",
    "signalType": "chain_catalyst",
    "stockCode": "VNM",
    "cycleId": "20260505-1400",
    "chainDepth": 0,
    "title": "VNM profit surge 15%",
    "detail": "Q3 earnings beat forecast",
    "impactScore": 8,
    "createdAt": "2026-05-05T14:00:00Z",
    "expiresAt": "2026-05-05T16:00:00Z",
    "findingData": {
      "confidence": 0.85,
      "direction": "bullish",
      "event_type": "earnings_beat",
      "validates": null,
      "summary": "Strong earnings announcement"
    }
  }
]
```

## Chain Depth Explanation

| Depth | Type | Sender | Description |
|-------|------|--------|-------------|
| 0 | catalyst | News Scout | Market-moving catalyst (news event, regulatory change) |
| 1 | validation | Financial Analyst | Fundamental support for catalyst (BCTC metrics, sector trends) |
| 2 | confirmation | Market Watcher | Technical confirmation (price action, volume patterns) |
| 3 | synthesis | Alert Commander | Synthesized verified chain with multiple confirmations |

## Use Cases

- **Financial Analyst** calls with `stock_code=VNM, chain_depth=0` to find news catalysts needing BCTC validation
- **Market Watcher** calls with `chain_depth=1` to find fundamental signals needing technical confirmation
- **Alert Commander** calls with `chain_depth=2` to find signals ready for synthesis
- **System auditor** calls to review open enrichment chains for quality

## Related Tools

- `post_agent_signal` — agents send signals to create chain links
- `get_agent_signals` — retrieve signals assigned to this agent
- `record_signal_outcome` — mark enrichment work as complete

## Notes

- Returns signals with `status` in ("pending", "acknowledged") only
- Filtered by TTL expiry; only non-expired findings returned
- `findingData` is type-specific; see signal types documentation
- Chain depth helps agents identify enrichment opportunities at their specialization level
- Empty result = all open chains fully enriched (good signal flow)
