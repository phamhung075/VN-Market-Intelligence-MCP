# Tool Group: alerts (mcp-server)

**Module path:** `src/interface/mcp/tools/alerts/`
**Scheduler:** `src/scheduler/alerts/` (3 jobs)
**Domain services:** alertGenerator, alertCooldown, alertDedup, alertGrouper, alertMuteChecker, customAlertEvaluator, convictionScorer, chainSynthesizer, recencyWeighter

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `get_alerts` | Retrieve alerts by type/severity/ticker | type?, severity?, ticker? | market.db (alerts) |
| `mark_alert_read` | Mark an alert as reviewed | alert_id | market.db |
| `manage_alert_mute` | Mute/unmute alerts for a ticker | action: "mute"\|"unmute", ticker | market.db (alert_mutes) |
| `list_alert_rules` | List custom alert rules | — | market.db (custom_alert_rules) |
| `send_alert_digest` | Send Telegram digest of current alerts | channel | Telegram notifier |
| `get_alert_accuracy` | Alert precision/recall stats | days? | market.db (agent_signals) |
| `get_signal_effectiveness` | Signal-to-outcome effectiveness stats | — | market.db (agent_signals) |
| `get_cascade_metrics` | See news-analysis.md | — | — |
| `get_cascade_outcomes` | See news-analysis.md | — | — |
| `get_open_chain_findings` | See news-analysis.md | — | — |
| `get_crisis_early_warning` | Crisis indicators (velocity spike, correlation break) | — | market.db |
| `get_signal_rejection_summary` | Summary of suppressed/rejected signals | — | market.db (agent_signals) |
| `write_alert_verdict` | Record verdict for a signal (Alert Commander only) | signal_id, verdict | fileStore (alertVerdictStore.ts) |
| `record_signal_outcome` | Record signal outcome after resolution | signal_id, outcome | market.db (agent_signals.outcome) |

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `alertDigestJob` | Daily 08:30 VN | Send morning alert digest to Telegram |
| `bbAlertScanJob` | Every 30min | Scan Bollinger Band breach alerts |
| `cronHealthAlertJob` | Every hour | Alert if any scheduled job missed its window |

---

## Verdict Lifecycle

```
Signal posted → market.db (agent_signals, outcome=NULL)
Alert Commander reviews → write_alert_verdict → fileStore
verdictResolutionJob (hourly, minute=7) → reads fileStore → updates agent_signals.outcome
Pruning: 30d TTL on resolved verdicts; 24h guard on re-resolution
```

Full policy: `docs/policies/alert-policy.md`

---

## Invariants

1. `write_alert_verdict` and `record_signal_outcome`: Alert Commander agent ONLY.
2. Alert Commander exclusivity: verified chain synthesis is Alert Commander's domain — no other agent fires cross-validated alerts.
3. Cooldown: configurable in `mcp.config.json` → `alertQuality.cooldownMinutes`.
4. Dedup window: `mcp.config.json` → `alertQuality.dedupWindowMinutes`.
5. Max alerts/day: `mcp.config.json` → `alertQuality.maxAlertsPerDay`.
6. Severity escalation thresholds: `mcp.config.json` → `alerts.severityEscalation`.
7. FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK (2026-07-03): `write_alert_verdict` (`interface/mcp/tools/alerts/alertVerdictTools.ts`) skips appending a new pending row when one already exists for the same `(ticker, alertSource)` pair — response echoes the existing row with `duplicate:true` instead. A different `alertSource`, or the same pair after prior resolution to `confirmed`/`false_positive`, is never suppressed.
8. FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION (2026-07-29): `generateAlerts()` (`domain/services/alertGenerator.ts`) now sets `Alert.fingerprint` unconditionally via `computeGenericAlertFingerprint()` (`domain/services/alertDedup.ts`) — `(actionCode, sorted signal types, message, minute-bucket of detectedAt)` hashed with djb2. Closes the one alert-generation path (`scanMarket.ts`, "otherwise" fallback of `chooseAlertId` for signal-type combos that are neither a single price-movement type nor a single `news_mention`) that previously had NO dedup protection against a re-entrant scheduler double-fire — `computeAlertFingerprint` existed in `alertDedup.ts` since Task 131 but had zero production callers until this fix. Deliberately a narrow minute-bucket (unlike `computeScanAlertFingerprint`'s day-bucket) so a genuinely-recurring one-time event on a later cycle is never suppressed; feeds the existing `alerts.fingerprint` UNIQUE partial index (`idx_alerts_fingerprint`, `schema-alerts.ts`) already used by `taAlertScanJob`/`bbAlertScanJob`/`foreignFlowAlertJob`/`predictionMarketJob`.
9. FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION (2026-07-29): `agent_signals` carries a new data-layer backstop, `idx_agent_signals_dedup_identical` (partial `UNIQUE` index, `schema-news.ts`) — see infrastructure.md § agent_signals for the full key/exclusion rationale. `postSignal()` (`agentSignalStore.ts`) now issues `INSERT OR IGNORE` and returns `-1` (the same sentinel the Task 1862g `dedupWindowMinutes` path already used) when a row is silently suppressed by this or any other UNIQUE constraint on the table.
