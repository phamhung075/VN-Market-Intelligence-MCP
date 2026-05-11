# get_cascade_metrics

**Category:** News-Analysis / Cascade Engine

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/cascadeMetricsTools.ts`

## Purpose

Get cascade rule hit metrics: which sector rules fired and which are dead (never triggered). Useful for tuning the cascade engine and identifying rules that need adjustment or removal.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `days` | number | No | 30 | Look-back window in days (1-365) |

## Return Format

```
Cascade Rule Metrics — Last 30 days

Rule Key                                 Hits   Eval   WinRate   Last Hit
─────────────────────────────────────────────────────────────────────────
oil_gas_up                              8       12     67%       2026-05-03 14:22
oil_gas_down                            3       5      60%       2026-05-02 09:15
aviation_down                           12      18     78%       2026-05-04 11:30
banking_up                              15      20     85%       2026-05-05 13:45
real_estate_down                        5       8      50%       2026-05-01 16:20
banking_neutral                         2       3      67%       2026-04-28 10:05
real_estate_up                          7       10     70%       2026-05-04 15:30
steel_up                                11      14     82%       2026-05-05 09:00
steel_down                              4       6      67%       2026-05-03 12:15
securities_up                           9       12     75%       2026-05-04 14:45
securities_down                         6       9      56%       2026-05-02 11:00

Overall accuracy: 71.8% (103 correct / 143 evaluated)

Dead rules (0 hits in 30 days): none
```

## Metrics Explanation

| Column | Definition |
|--------|-----------|
| **Rule Key** | Sector-direction rule identifier (e.g. `oil_gas_up`) |
| **Hits** | Number of times rule fired in look-back window |
| **Eval** | Number of times rule was evaluated (all outcomes) |
| **WinRate** | Percentage of hits that resulted in price confirmations (hit % accuracy) |
| **Last Hit** | Most recent timestamp when rule triggered |

## Known Rule Keys

- `oil_gas_up`, `oil_gas_down`
- `aviation_down`
- `banking_up`, `banking_neutral`
- `real_estate_up`, `real_estate_down`
- `steel_up`, `steel_down`
- `securities_up`, `securities_down`

## Use Cases

- **System auditor** monitors rule health; investigates rules with <60% win rate
- **Digest & Predict** reviews dead rules for retirement vs. recalibration
- **Alert Commander** uses win rates to prioritize cascade signals
- **BA team** adjusts rule thresholds based on accuracy trends

## Related Tools

- `get_cascade_outcomes` — detailed rule hit data with price impact/outcome
- `run_impact_chain` — fire cascade engine on specific headline

## Notes

- Win rate is computed from outcome confirmations recorded by downstream agents
- NULL win rates indicate pending backtest results (async Sprint 192 job)
- Rules with 0 hits (dead rules) listed separately for visibility
- Overall accuracy is weighted across all rules in window
- Update `KNOWN_CASCADE_RULE_KEYS` in cascadeMetricsTools.ts when new rules added
