# record_signal_outcome

**Category:** News-Analysis / Agent Coordination

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`

## Purpose

Record the processing outcome for a signal after an agent has acted on it. Outcomes feed into signal effectiveness metrics and help calibrate the enrichment chain confidence over time.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `signal_id` | number | Yes | — | ID of the signal to record outcome for |
| `outcome` | enum | Yes | — | Processing result: `fired`, `suppressed`, `confirmed`, `false_positive` |

## Return Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "Outcome recorded: signal_id=1234, outcome=fired"
    }
  ]
}
```

## Outcome Types

| Outcome | Meaning |
|---------|---------|
| `fired` | Signal triggered an alert or action; confirmed valid |
| `suppressed` | Signal was suppressed (rule violation or false positive detected) |
| `confirmed` | Signal was independently validated by another agent |
| `false_positive` | Signal was incorrect; market moved opposite to signal direction |

## Use Cases

- **Alert Commander** records `fired` when a critical signal leads to an alert
- **Market Watcher** records `false_positive` when price doesn't confirm signal direction
- **Report Analyzer** records `confirmed` when BCTC validates a news catalyst
- **Alert Commander** records `suppressed` when downstream signal contradicts upstream finding

## Related Tools

- `post_agent_signal` — agents send signals
- `get_agent_signals` — retrieve pending signals
- `get_signal_effectiveness` — review aggregated effectiveness metrics

## Notes

- Outcomes are mandatory before signal TTL expiry (cleanup removes non-outcomes)
- Effectiveness metrics are computed from outcome distribution
- Multiple outcomes for the same signal (e.g., "fired" + "false_positive") are tracked
- Outcomes feed into agent calibration and signal quality audits
