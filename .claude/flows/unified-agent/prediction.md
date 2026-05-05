# Unified Agent — Prediction Review Flow (01:00 UTC)

**Tools:** `.claude/tools/package/unified-agent.md`

## Input
`get_prediction_markets()` open claims

## Output
Accuracy flags | session log

---

`get_prediction_markets()` → compare resolved predictions vs outcomes

**Accuracy threshold (regime-aware)**:
- `REGIME=NEUTRAL` or `EASING` when predictions were made: accuracy < 50% → `submit_feedback(agent="unified-agent", ...)`
- `REGIME=TIGHTENING` when predictions were made: accuracy < 40% → flag (monday.md DAMPENING reduces baseline; < 40% is genuinely under-performing)
- Log REGIME at prediction time in session entry for auditing

If `get_prediction_markets()` does not return regime context → check current `get_macro_snapshot()` regime as proxy.

**Session log** `docs/agent-memory/sessions/YYYY-MM-DD-unified-agent.md`:
```
### Prediction Review (HH:MM UTC)
- Mode: PREDICTION_REVIEW | Claims: N | Accuracy: X% | Flags: [list] | Regime at prediction: REGIME
```
