# Microservice: alert-engine

**Language:** TypeScript / Bun
**Port:** 5006 (external + internal)
**Role:** Signal evaluation and alert lifecycle management. Evaluates multi-source signals against adaptive thresholds, applies dedup/cooldown/grouping logic, synthesizes verified chains (2+ agent confirmations), and POSTs results to mcp-server. Owns `alert_engine.db` as local cache.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | Alert domain services (in mcp-server shared — alert-engine runs them) | alertGenerator.ts, alertCooldown.ts, alertDedup.ts, alertGrouper.ts, alertMuteChecker.ts, customAlertEvaluator.ts, convictionScorer.ts, recencyWeighter.ts, chainSynthesizer.ts |
| infrastructure | `alert_engine.db` (sole writer, local cache), HTTP client to mcp-server | Store evaluated alerts locally before push |
| interface | HTTP endpoints | Called by mcp-server alert scan jobs; POST results back to mcp-server |

---

## Tool Surface

Alert tools live in mcp-server. See `docs/architecture/microservice/mcp-server/alerts.md` for: `get_alerts`, `mark_alert_read`, `manage_alert_mute`, `list_alert_rules`, `send_alert_digest`, `get_alert_accuracy`, `get_signal_effectiveness`, `get_cascade_metrics`, `get_cascade_outcomes`, `get_open_chain_findings`, `get_crisis_early_warning`, `get_signal_rejection_summary`, `write_alert_verdict`, `record_signal_outcome`.

Alert policy: `.claude/knowledge/alert-policy.md`

---

## Upstream Dependencies (data in)

| Source | How |
|--------|-----|
| mcp-server scheduler | HTTP trigger (taAlertScanJob, bbAlertScanJob run in mcp-server, call alert-engine) |
| agent_signals table | mcp-server passes signals to evaluate |

---

## Downstream Dependencies (calls out)

| Service | Port | What for |
|---------|------|----------|
| mcp-server | 3000 | POST evaluated alert results |

---

## Database Write Authority

`alert_engine.db` — sole writer. Local alert cache.

mcp-server writes final alerts to `market.db` (schema-alerts.ts slice: alerts, alert_mutes, custom_alert_rules, price_alerts, broker_sanctions).

---

## Verdict Lifecycle

```
Signal fired → alert_engine evaluates → mcp-server stores alert
Agent reviews → writes verdict to fileStore (alertVerdictStore.ts)
verdictResolutionJob (hourly, minute=7) → reads fileStore → updates agent_signals.outcome
Outcomes: pending | confirmed | false_positive
```

Full policy: `.claude/knowledge/alert-policy.md`

---

## Known Invariants

1. Alert Commander is the ONLY agent that calls `write_alert_verdict` and `record_signal_outcome`.
2. Verified chain: requires 2+ independent agent confirmations before `verified_chain` signal fires.
3. Adaptive thresholds: enabled by default. Rolling window + sigma multipliers in `mcp.config.json` → `adaptiveThresholds`.
4. Phase 3c: taAlertScanJob + bbAlertScanJob run concurrently via `Promise.allSettled()` — 50% cycle time reduction (6-10s → 3-5s). Error isolation maintained.
5. Alert channels: HIGH/CRITICAL → Telegram `market` channel (Vietnamese). Diagnostic → `work` channel.
6. Cooldown + dedup window in `mcp.config.json` → `alertQuality`.
