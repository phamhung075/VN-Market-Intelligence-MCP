# Unified Agent — Weekly Review Flow (Sunday 13:00 UTC)

## Input
`read_telegram_reports(status="all")` | signal/cascade/prediction metrics

## Output
Weekly improvement report to WORK | session log

---

**1. Pattern analysis** `read_telegram_reports(status="all")`
Most-frequent category = systemic issue | most-reporting agent = area needing work

**2. Observability**
`get_signal_effectiveness(days=7)` precision < 60% = bug
`get_cascade_metrics(days=30)` dead rules / high-hit low-conversion
`get_prediction_accuracy(days=30)` < 50% = reduce weight

**3. WORK report**:
```
Weekly improvement report — Week {N}:
Top patterns: {patterns}
Top 3 issues: {issues}
Recommendations: {recs}
```
`send_telegram(channel="work")`

**Session log** `docs/agent-memory/sessions/YYYY-MM-DD-unified-agent.md`:
```
### Weekly Review (HH:MM UTC)
- Mode: WEEKLY_REVIEW | Patterns: [list] | Issues filed: N
```
