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
| `trigger_price_vps_fetch` | Manually trigger VPS price fetch | tickers?, verbose?, dry_run? | vpsDebugSshTrigger.ts → vps/sshExec.ts |
| `trigger_news_vps_fetch` | Manually trigger VPS news fetch | verbose?, dry_run? | vpsDebugSshTrigger.ts → vps/sshExec.ts |
| `trigger_sbv_vps_fetch` | Manually trigger VPS SBV/FX fetch | verbose?, dry_run? | vpsDebugSshTrigger.ts → vps/sshExec.ts |
| `trigger_bctc_vps_fetch` | Manually trigger VPS BCTC PDF fetch | tickers?, verbose?, dry_run? | vpsDebugSshTrigger.ts → vps/sshExec.ts + bctc_vps_queue |
| `trigger_foreign_flow_vps_fetch` | Manually trigger VPS foreign flow fetch | tickers?, verbose?, dry_run? | vpsDebugSshTrigger.ts → vps/sshExec.ts |
| `get_analysis_history` | Historical analysis log for a ticker | ticker, days? | market.db |
| `smart_compact` | Compact a cowork session context | — | cowork agent helper |
| `get_evidence_summary` | Evidence items for open chain findings | chain_id? | market.db (evidence_items) |

---

## Deferred One-Shot Scheduler (DEFERRED-TASK-SCHEDULER-MVP, 2026-06-29)

### Table: `scheduled_tasks` (coordination.db — Migration 4)

Same `coordination.db` as `task_locks`. Added as Migration 4 in `coordinationStore.ts`.

**All time columns are INTEGER epoch-seconds UTC** (AC-1 scar: NEVER ISO8601 strings).
**`dedup_key TEXT UNIQUE` declared in `CREATE TABLE`** (AC-2 scar: NEVER `ALTER TABLE ADD COLUMN ... UNIQUE` — SQLite silently drops the UNIQUE constraint).

Lifecycle states: `pending → firing → fired` (success) | `expired` (deadline gate) | `failed` (routing error) | `cancelled`. Terminal success state = `fired` (D1: `done` is reserved for Phase-2 confirmation callback).

### Public MCP Tools (3 — in public skill packages)

| Tool | Purpose | AC gates |
|------|---------|----------|
| `schedule_task` | Create a deferred one-shot task (fire_at or delay_seconds). Validates agent against AGENT_TEAM_MAP. Idempotent on dedup_key. Honest Phase-2 caveat in description (AC-9). | AC-8, AC-9, AC-12 |
| `cancel_scheduled_task` | Cancel a pending/firing task by id or dedup_key. | — |
| `list_scheduled_tasks` | Audit query — returns sweep_tick, fired_at, error, status for all rows (AC-10). Mirrors `get_cron_health` pattern. | AC-10 |

### Privileged Gateway-Only Tools (4 helpers — NOT in public skill packages)

Gateway-reachable via `call_tool(server="vn-market", tool=<name>)` by the cowork-team Step 0b.3 sweeper.
Ordinary agents cannot access these via skill-gated sessions (D2 mechanism: privileged boundary enforced by SKILL_MANIFEST absence).

| Tool | Purpose |
|------|---------|
| `claim_due_scheduled_tasks` | Atomic `UPDATE WHERE status='pending' AND fire_at<=:nowEpoch RETURNING` — sweeper-only |
| `complete_scheduled_task` | Mark `fired` or `done` after successful routing |
| `expire_scheduled_task` | Mark `expired` after deadline gate fires |
| `fail_scheduled_task` | Mark `failed` after routing error |

### AGENT_TEAM_MAP (AC-8)

File: `agentTeamMap.ts`. Static map derived from `docs/references/agent-roster.md`.
COWORK agents → spawned by cowork-team dispatcher. DEV agents → signal_queue row via orch-apply.sh.
Unknown agent id → `schedule_task` returns error (fail-loud, no silent default).
**NEVER a hardcoded switch statement** — declarative map only.

### Routing Model (Addressed-Not-Picked)

Team is sealed at insert time (not at fire time). The sweeper just routes to the sealed team's intake:
- `team=COWORK` → PRE-CLAIM `intent:one-shot:<id>` (task_kind="intent", already deployed) → `Agent(prompt, run_in_background=true)` → `complete_scheduled_task(id, "fired")`
- `team=DEV` → ALWAYS write companion file `docs/signals/one-shot-<id>.json` with `{task: <full row>}` → emit `SignalRowSchema` row via `orch-apply.sh` with `payload_ref` → dev-team Step 0a drains natively

**D3 BINDING**: DEV path ALWAYS writes companion file (no char-count threshold). `summary` = one-liner `[one-shot] <intent> → <agent>` ONLY. Full prompt in companion file via `payload_ref`.

### Phase-2 Honest Caveat (AC-9)

One-shots fire ONLY while the cowork-team `*/15` loop is live. `deadline_at` bounds staleness after downtime. True 24/7 headless firing (launchd sweeper) is Phase-2 and NOT implemented in MVP.

### Sweeper Step (cowork-team flow doc)

Step 0b.3 added to `docs/agents/cowork-team/flow/main.md` after the fire-time election WIN (Step 0b.2). The sweeper is a recurring step INSIDE the `*/15` cron — NEVER converted to a `scheduled_tasks` row itself (AC-4: self-deleting sweeper strands the queue).

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `askQueueCheckJob` | Every 12min | Check /ask queue for pending questions |
| `devTeamHeartbeatJob` | Sunday 07:00 UTC (weekly) | Dev-team heartbeat — confirm pipeline alive |

`devTeamHeartbeatJob` (and 3 sibling Sunday jobs — `integrityCheckJob`,
`bondMaturityPollerJob`, `predictionOutcomeJob`) get a startup-catchup probe
(FIX-CRON-SUNDAY-STARTUP-CATCHUP, 2026-07-22): `recoverMissedExecutions`
(scheduleCron's default) only replays ticks missed by in-process event-loop
lag — it can never see a scheduled time that already passed BEFORE the process
existed. A weekly job gets exactly one window per week; if the container is
down at that exact moment, the whole week silently drops with no replay unless
a startup catch-up covers it. See `apps/mcp-server/src/scheduler/startScheduler.ts`
§ FIX-CRON-SUNDAY-STARTUP-CATCHUP and `shouldRunCatchup()`'s `requiredUtcDay`
param in `startupHelpers.ts`.

---

## VPS Debug-Trigger Tools — SSH Execution Boundary

`trigger_price_vps_fetch` / `trigger_news_vps_fetch` / `trigger_sbv_vps_fetch` /
`trigger_bctc_vps_fetch` / `trigger_foreign_flow_vps_fetch` (FIX-VPS-SSH-TRIGGER-
FAIL-LOUD, 2026-07-22): in `dry_run=false` ("live") mode these tools now call
the REAL `sshExec()` (`apps/mcp-server/src/infrastructure/vps/sshExec.ts`) via
the shared `apps/mcp-server/src/interface/mcp/vpsDebugSshTrigger.ts` executor.

**Before this fix:** none of the 5 tools ever called `sshExec()`, `Bun.spawn`,
or any process launch — they only string-built a `ssh root@$VINAHOST_IP ...`
command and appended prose ("SSH trigger will be executed by server.ts" /
"fire-and-forget") to `log_tail`, while `attempted`/`success`/`failed` stayed
hardcoded `[]` in every mode. A live call that executed NOTHING returned a
success-shaped empty-everything payload — the exact defect a cron audit found.

**After this fix:** `attempted`/`success`/`failed` reflect the REAL ssh exit
code. Ticker input is sanitized (`^[A-Z0-9]{1,10}$` allowlist) before reaching
the remote command string — `ssh user@host "<command>"` hands `command` to the
VPS's default shell, so an unvalidated ticker is not safe to concatenate into
it. Invalid tickers are rejected into `failed` without ever attempting SSH.

**Container dependency:** the image previously had NO `ssh` client binary
(`apps/mcp-server/Dockerfile` now installs `openssh-client` — Ubuntu apt). Env
vars `VPS_HOST` / `VPS_SSH_USER` / `VPS_SSH_KEY_PATH` were already correctly
configured in `docker-compose.yml` with a real mounted key — this was a
missing-client problem, not a missing-credential one. `restart_vps_service`
already depended on the same `sshExec()` path and has the same binary
dependency.

**Second layer found while verifying (2026-07-22):** even with the client
installed, `sshExec.ts` passed `-o StrictHostKeyChecking=yes` with
`BatchMode=yes` (no interactive fallback) — and the live container has no
`/root/.ssh/known_hosts` at all, confirmed via `docker exec`. That combination
refuses EVERY connection from a fresh container regardless of client
availability, so `restart_vps_service` could never have succeeded either,
since inception. Changed to `StrictHostKeyChecking=accept-new` (trust-on-first-
use — auto-accepts + caches an unseen host key, still rejects a CHANGED key on
any later connection, i.e. the real MITM protection is preserved). Appropriate
for a single, stable, operator-controlled VPS. A hardcoded `ssh-keyscan` at
build time was considered and rejected: it would bake the VPS IP into the
Dockerfile (hardcode debt) and turn an optional runtime feature into a
build-time network dependency (image build would fail if the VPS happens to be
unreachable during `docker build`).

**Residual, unverifiable from this zone:** whether the real ssh handshake
actually succeeds end-to-end (network reachability, key auth) can only be
confirmed by an operator-executed rebuild + live probe — this is exactly what
the mandatory post-push REAL-DATA verification task (PUSH-AUTONOMY-1) is for.

---

## Invariants

1. `get_cycle_bootstrap` is mandatory as Step 0 for ALL agents. Replaces: `get_agent_signals` + `get_market_context` + `get_system_status`.
2. `get_system_status` consolidates: `get_source_health` (removed), `get_data_freshness` (removed), `get_error_summary` (removed).
3. `restart_vps_service`: operator-level only (dev-team CLI cron). Never called from Cowork agents.
4. VPS staleness watchdog: 45-min threshold (vpsProxyWatchdogJob) + 6h market-hours threshold (priceUpdateWatchdogJob). Dual-layer coverage.
5. Telegram /ask bot commands routing: `docs/protocols/ask-queue-protocol.md` + `docs/standards/telegram-commands.md`.
6. `smart_compact` invokes a spawned compact sub-agent for Cowork context management.
7. `get_system_status` per-section deadline: `withSectionDeadline(label, work, 3000ms)` wraps EVERY async section generically (no source allowlist). Max wall time ≈ 4 × 3s = 12s, well under the 60s gateway limit. Exported from `systemTools.ts` for unit-testing (FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD).
