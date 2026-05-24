# Unified Agent — Prediction Review Flow (01:00 UTC)

**Tools:** `.claude/tools/package/unified-agent.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

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

**Notebook commit** — append to `docs/agent-memory/notebooks/unified-agent.md`:
```
### Prediction Review (HH:MM UTC)
- Mode: PREDICTION_REVIEW | Claims: N | Accuracy: X% | Flags: [list] | Regime at prediction: REGIME
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/unified-agent.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/unified-agent.md
git commit -m "chore(memory/unified-agent): notebook YYYY-MM-DD"
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
