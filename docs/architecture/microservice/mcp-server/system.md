# Tool Group: system (mcp-server)

**Module path:** `src/interface/mcp/tools/system/`
**Scheduler:** `src/scheduler/system/` (2 jobs)
**Domain services:** rateLimiter, sourceHealthTracker, stockSearch, stockAliases

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `get_system_status` | Unified system health: MCP server, VPS, data freshness, error summary. Each of the 4 sections is guarded by a 3 000 ms per-section deadline (`withSectionDeadline`). A slow section degrades to honest "timeout/unknown" — never hangs the caller. | — | market.db (cron_job_runs) + VPS health checks |
| `get_vps_proxy_health` | VPS proxy health and staleness check | — | market.db (market_prices.updated_at) |
| `get_vps_service_health` | Individual VPS service status | service? | SSH health check (operator only) |
| `restart_vps_service` | Restart a VPS systemd service | service | vps/sshExec.ts (operator only) |
| `get_cron_health` | Cron job health — last run, missed windows | — | market.db (cron_job_runs) |
| `get_rate_limit_status` | Rate limit status across all data sources | — | rateLimiter domain svc |
| `get_pending_ask_questions` | /ask queue — pending user questions | — | market.db (ask_queue) |
| `answer_ask_question` | Answer a pending /ask question | question_id, answer | market.db + send_telegram |
| `run_qa_responder` | Run QA responder cycle | — | QA responder use case |
| `get_pipeline_health` | Full pipeline health report | — | All health checks combined |
| `get_sla_status` | SLA compliance for scheduled jobs | — | market.db (cron_job_runs) |
| `get_agent_work_log` | Agent work log entries | agent?, days? | market.db (agent_work_log) |
| `log_agent_work` | Log agent work entry | agent_name, summary | market.db |
| `log_fix` | Log a dev-team fix | summary, task_id? | market.db (agent_work_log) |
| `post_agent_signal` | Post inter-agent signal | signal_type, payload | market.db (agent_signals) |
| `get_agent_signals` | Get signals for an agent | agent_name, unread_only? | market.db (agent_signals) |
| `get_cycle_bootstrap` | Bootstrap data for agent cycle start | agent_name | All: signals + context + status |
| `submit_feedback` | Submit user feedback | feedback_text | market.db |
| `trigger_price_vps_fetch` | Manually trigger VPS price fetch | — | VPS service |
| `trigger_news_vps_fetch` | Manually trigger VPS news fetch | — | VPS service |
| `trigger_sbv_vps_fetch` | Manually trigger VPS SBV fetch | — | VPS service |
| `trigger_foreign_flow_vps_fetch` | Manually trigger VPS foreign flow fetch | — | VPS service |
| `get_analysis_history` | Historical analysis log for a ticker | ticker, days? | market.db |
| `smart_compact` | Compact a cowork session context | — | cowork agent helper |
| `get_evidence_summary` | Evidence items for open chain findings | chain_id? | market.db (evidence_items) |

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `askQueueCheckJob` | Every 5min | Check /ask queue for pending questions |
| `devTeamHeartbeatJob` | Every 1h | Dev-team heartbeat — confirm pipeline alive |

---

## Invariants

1. `get_cycle_bootstrap` is mandatory as Step 0 for ALL agents. Replaces: `get_agent_signals` + `get_market_context` + `get_system_status`.
2. `get_system_status` consolidates: `get_source_health` (removed), `get_data_freshness` (removed), `get_error_summary` (removed).
3. `restart_vps_service`: operator-level only (dev-team CLI cron). Never called from Cowork agents.
4. VPS staleness watchdog: 45-min threshold (vpsProxyWatchdogJob) + 6h market-hours threshold (priceUpdateWatchdogJob). Dual-layer coverage.
5. Telegram /ask bot commands routing: `docs/protocols/ask-queue-protocol.md` + `docs/standards/telegram-commands.md`.
6. `smart_compact` invokes a spawned compact sub-agent for Cowork context management.
7. `get_system_status` per-section deadline: `withSectionDeadline(label, work, 3000ms)` wraps EVERY async section generically (no source allowlist). Max wall time ≈ 4 × 3s = 12s, well under the 60s gateway limit. Exported from `systemTools.ts` for unit-testing (FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD).
