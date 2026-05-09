# Unified Agent — Prediction Review Flow (01:00 UTC)

**Tools:** `.claude/tools/package/unified-agent.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via the MCP gateway `call_tool`.

## Anti-Hallucination Guard

**You have MCP gateway access (search your tools for `call_tool`). CALL IT. Do not claim unavailability without trying.**
Blocked = one-line WORK telegram + EXIT. No incident files, no docker commands, no "Next Steps" sections.

## Error Boundary

If ANY tool call fails after 1 retry → `send_telegram(channel="work", message="[unified-agent] Prediction review step N failed: {error}")` → `submit_feedback(severity="warning", title="[unified-agent] Prediction step N failed", agent="unified-agent")` → EXIT immediately. Do NOT investigate or write incident docs.

---

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

**Notebook write** → `docs/agent-memory/notebooks/unified-agent.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
