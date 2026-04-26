# Unified Agent — Prediction Review Flow (01:00 UTC)

## Input
`get_prediction_markets()` open claims

## Output
Accuracy flags | session log

---

`get_prediction_markets()` → compare resolved predictions vs outcomes
Under-performing (accuracy < 50%) → `submit_feedback(agent="unified-agent", ...)`

**Session log** `docs/agent-memory/sessions/YYYY-MM-DD-unified-agent.md`:
```
### Prediction Review (HH:MM UTC)
- Mode: PREDICTION_REVIEW | Claims: N | Accuracy: X% | Flags: [list]
```
