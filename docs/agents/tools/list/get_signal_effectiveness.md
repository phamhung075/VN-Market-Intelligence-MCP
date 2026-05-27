# get_signal_effectiveness

**Category:** News-Analysis / Agent Coordination

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`

## Purpose

Retrieve aggregated effectiveness metrics for signals, showing signal quality by type and agent. Helps identify which signal types are reliably predicting market moves vs. which are noisy.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `days` | number | No | 30 | Look-back window in days (1-365) |
| `signal_type` | string | No | — | Filter by single signal type (e.g. 'chain_catalyst'), optional |
| `from_agent` | string | No | — | Filter by source agent (e.g. 'news-scout'), optional |

## Return Format

```
Signal Effectiveness Metrics — Last 30 days

Signal Type      | From Agent      | Count | Fired | False+ | Confirm | Suppress | Hit Rate
chain_catalyst   | news-scout      | 42    | 35    | 5      | 18      | 2        | 83%
price_anomaly    | market-watcher  | 127   | 98    | 22     | 61      | 8        | 77%
cross_validate   | financial-analyst | 12  | 11    | 1      | 7       | 0        | 92%
urgent_news      | news-scout      | 58    | 48    | 7      | 31      | 3        | 83%

Overall effectiveness: 78% (292 fired or confirmed / 375 total signals)
Reliability ranking: cross_validate (92%) > chain_catalyst (83%) > urgent_news (83%) > price_anomaly (77%)
```

## Effectiveness Calculation

- **Hit Rate** = (fired + confirmed) / (fired + confirmed + false_positive + suppressed)
- **Signals with no outcome recorded** = excluded from effectiveness calculation
- **Overall effectiveness** = sum of fired+confirmed / sum of all outcomes

## Use Cases

- **Digest & Predict** reviews effectiveness weekly to tune signal weights
- **Alert Commander** uses hit rates to adjust signal thresholds
- **System auditor** identifies dead or noisy signal sources for recalibration

## Related Tools

- `post_agent_signal` — agents send signals
- `record_signal_outcome` — record signal outcomes
- `get_agent_signals` — retrieve pending signals

## Notes

- Signals with no recorded outcome are excluded from metrics
- Minimum sample size recommended: 10+ signals per type for reliable metrics
- Hit rates < 50% indicate need for signal source review
- Filtering by agent shows individual source reliability
- Historical trends help identify degradation in signal quality over time
