**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 13. Error Boundary & Communication

### Error Boundary (Universal)

```
Tool fails after 1 retry -> send_telegram(bug) -> session log -> EXIT
```

Never investigate. Never write incident docs. Report and exit.

### Communication Standards

- **Caveman mode** (`.claude/skills/caveman/SKILL.md`): ~75% token reduction
- **Token economy** (`.claude/skills/token-economy/SKILL.md`): ULTRA agent-to-agent, FULL handoffs, LITE user-facing

### RETURN Block (Dev team)

```
DONE: <one sentence>
NEXT: <agent-name> | <one sentence>
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
QUALITY: full | partial | degraded    # (Section 18.4)
CONFIDENCE: high | medium | low       # (Section 18.3)
```

### Pipeline State

```json
{ "status": "...", "nextAgent": "...", "nextPrompt": "...", "activeTaskId": "...", "updatedAt": "...", "updatedBy": "..." }
```

---

## 14. Signal Bus Reference

| Signal | From | To | Purpose |
|--------|------|----|---------|
| `urgent_news` | news-scout | alert-commander | Breaking news |
| `chain_catalyst` | news-scout | all | Crisis / macro |
| `crisis_velocity` | news-scout | alert-commander | Escalating crisis |
| `news_impact` | news-scout | alert-commander | General news |
| `price_anomaly` | market-watcher | alert-commander | Unusual price |
| `fundamental_validation` | financial-analyst | alert-commander | Valuation |
| `cross_validate` | any | any | Request validation |
| `suppress` | any | any | Suppress signal |
| `verified_chain` | alert-commander | digest-predict | Verified alert |
| `conviction_change` | digest-predict | alert-commander | Confidence shift |
| `legal_risk` | news-scout | alert-commander | Legal risk |

```
post_agent_signal({ from_agent, to_agent, signal_type, stock_code, payload: { title, detail, impact_score }, ttl_minutes, chain_depth, finding_data: {...} })
```
