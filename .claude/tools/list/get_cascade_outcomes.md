# get_cascade_outcomes

**Category:** News-Analysis / Cascade Engine

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/cascadeOutcomeTools.ts`

## Purpose

Get cascade rule hits with outcome data (price impact 3d/7d, correct/wrong). NULL outcome values indicate pending backtest results. Use for signal quality review and post-hoc validation.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `days` | number | No | 30 | Look-back window in days (1-90) |
| `ticker` | string | No | — | Filter by ticker code (matches affected_stocks LIKE %ticker%), optional |

## Return Format

```
Cascade Outcomes — Last 30 days

ID    Rule                     Hit At               Ticker        Impact 3d Impact 7d Correct Conf%
────────────────────────────────────────────────────────────────────────────────────────────────────
1042  banking_up               2026-05-05 13:45:00  VCB           +2.34%    +3.12%    yes     85%
1041  steel_up                 2026-05-05 09:00:00  HSG           +1.87%    +2.45%    yes     78%
1040  aviation_down            2026-05-04 11:30:00  HVN           -1.56%    -2.34%    yes     92%
1039  real_estate_up           2026-05-04 15:30:00  VRE           pending   pending   pending —
1038  securities_up            2026-05-04 14:45:00  VCI           +0.92%    +1.34%    no      65%
1037  oil_gas_down             2026-05-03 14:22:00  GAS           —         —         pending —
```

## Outcome Status

| Value | Meaning |
|-------|---------|
| Number (e.g. 2.34%) | Price impact calculated; backtest complete |
| `pending` | Backtest running (Sprint 192 async job) |
| `—` | No data available (rule suppressed or alert cancelled) |
| `yes` / `no` | Outcome correctness (rule direction matched price move) |

## Use Cases

- **Digest & Predict** reviews outcomes to rank rule reliability
- **Report Analyzer** correlates cascade rules with actual price moves
- **System auditor** identifies rules with consistently wrong outcomes
- **Alert Commander** uses outcome data to tune alert thresholds

## Return Format (JSON)

```json
[
  {
    "id": 1042,
    "ruleKey": "banking_up",
    "hitAt": "2026-05-05 13:45:00",
    "ticker": "VCB",
    "priceImpact3d": 2.34,
    "priceImpact7d": 3.12,
    "outcomeCorrect": 1,
    "confidence": 0.85,
    "sourceRagId": "rag_2026050512_banking_signals"
  }
]
```

## Related Tools

- `get_cascade_metrics` — rule hit rates and accuracy overview
- `run_impact_chain` — fire cascade engine on specific headline
- `fetch_and_analyze` — feed news into cascade pipeline

## Notes

- Outcomes are populated by Sprint 192 backtest cron (async)
- NULL `outcome_correct` = backtest still pending (can take 1-7 days depending on lookback)
- Price impact is calculated 3 days and 7 days post-hit
- Max 200 rows returned; order by hit_at DESC (newest first)
- Ticker filter matches `affected_stocks` LIKE %ticker% (partial match OK)
- Confidence is extracted from RAG analysis; NULL if RAG entry missing
