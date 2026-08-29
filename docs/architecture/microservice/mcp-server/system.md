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
| `get_vps_proxy_health` | VPS proxy health and staleness check. Demand-driven routes (bctc) with a confirmed-empty own work queue report `idle-no-work`, not proxy-down — see `docs/agents/tools/list/get_vps_proxy_health.md` §Notes | — | market.db (market_prices.updated_at, vps_push_log, bctc_vps_queue) |
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
| `emit_pressure_state` | Writes `docs/data/pressure-state.json` (9-key, atomic tmp→rename) with server-computed infra metrics for the cowork dispatcher's MANDATORY telemetry Step 6.0 call — `emitPressureStateTool.ts`, injectable `EmitPressureStateDeps` seam. Server-computed: `signal_backlog`, `dev_queue_depth`, `container_vm_headroom_mb`, and (TASK_2008a FR-A1) `calendar_status` via `computeCalendarStatusFn` default `isVnTradingDay(getTodayVnDate()).session_status`. `calendar_status` override handling (FR-A2): in-domain value (`SESSION_STATUSES` in `vnTradingCalendar.ts`) honored as-is; out-of-domain value is `console.warn`'d and discarded in favor of the server-computed value — deliberately NOT a Zod-boundary reject, to preserve the tool's documented never-throws contract `telemetry.md` Step 6.0 depends on. Also promotes `cycle-snapshot-<HH:MM>.json` → `cycle-snapshot-latest.json` (freshness-gated, `SNAPSHOT_MAX_STALENESS_MS`=4h). NEVER throws — `{success:false, reason}` on any internal error. | calendar_status?, tick_id?, fire_time?, pressure_mode?, last_regime?, last_volatility_level? (all optional) | docs/data/pressure-state.json + docs/signals/*.json + orch-state.json (read-only) |

---

## Deferred One-Shot Scheduler (DEFERRED-TASK-SCHEDULER-MVP, 2026-06-29)

### Table: `scheduled_tasks` (coordination.db — Migration 4)

Same `coordination.db` as `task_locks`. DDL (`CREATE TABLE scheduled_tasks`) added as Migration 4 in `coordinationStore.ts`; the query/mutation functions (`claimDueScheduledTasks`, `completeScheduledTask`, etc.) live in `scheduledTaskStore.ts`, re-exported from `coordinationStore.ts` for backward compatibility (split 2026-08-08, FIX-CI-SIZELINT-COORDINATIONSTORE-BASELINE-1388L).

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

**FIX-SCHEDULER-DOUBLE-REGISTRATION (2026-07-29) — same-second duplicate-fire
guard.** `recoverMissedExecutions: true` (the missed-fire fix above) has a
flip side: `node_modules/node-cron@3.0.3`'s `Scheduler.matchTime()` compares
its "already executed" guard at full millisecond precision, not whole-second
granularity, so ordinary ~1s `setTimeout`-loop jitter (no stall required) can
cause the SAME scheduled second to be detected twice by consecutive polls —
each detection independently fires the job. RAW-verified LIVE against
`cron_job_runs` before any code change: this affected `vnIndexRefreshJob`
(13.04%/7d), `vpsServiceHealthJob` (10.33%/7d), and `walCheckpointJob`
(3.74%/7d) — a shared scheduler-layer defect, not specific to the two jobs
named in the original bug report (`pollNewsJob`'s apparent "2x/30min" was
separately traced to `newsHeadlinesRefreshJob`'s by-design double push to
`/api/push-news`, Bloomberg then Reuters — not a scheduler bug, left
untouched). Registration itself was already singular (`startScheduler()`'s
`__vnMarketSchedulerStarted` guard; every job appears exactly once in
`buildJobTable()`/`registerBespokeJobs()`) — the defect was execution-level,
not registration-level. Fix: `dedupeCronTick()` (`startupHelpers.ts`) wraps
every `scheduleCron()` callback (the single canonical registration point —
`registerJobTable`, `registerBespokeJobs`, and `summaryJobs.ts` all funnel
through it) with a per-registration whole-second last-fired guard; a second
detection of an already-fired second is skipped, a genuinely new second still
fires. `recoverMissedExecutions` stays enabled — the missed-fire class above
is not reverted.

**FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD (2026-08-29) —
monthly-cadence startup catch-up + T4 dedup guard.** `monthlySignalQualityAuditJob`
(1st of month 00:00 UTC) missed the 2026-07-01 AND 2026-08-01 fires with zero
recovery (RAW-verified live: last real `cron_job_runs` success 2026-06-01; both
`recoverMissedExecutions:false` opt-out and a flip-to-true alone are PROVEN no-ops
— node-cron's recovery re-seeds `lastExecution` from boot time and can never replay
a fire that fell inside a process restart/downtime window). Three-layer fix:
(a) `shouldRunCatchup()` gained a `cadence: 'day' | 'month'` parameter — the
per-day dedup window generalised to per-cadence-period, with SUCCESS-only dedup for
monthly cadence (an error row is a miss that must be retried on the next boot, never
skipped for a month); (b) `startScheduler.ts` gained a startup catch-up probe that
fires the audit once per month on boot when no success row exists for the current
calendar month (any fire within a month resolves to the same prior-month target, so
it recovers the most recent missed month); (c) the registration's
`recoverMissedExecutions` flipped false→true as defence-in-depth, safe because
`runMonthlySignalQualityJob()` now carries the `shouldSkipMonthlyReplay()` T4 guard
(per-target-month dedup — a replay/catch-up can never double-send the WORK report).
The one-shot historical backfill for months older than the most-recent missed one
(June 2026) is `scripts/migrations/backfill-monthly-signal-quality-audit.ts`
(dry-run default, `--apply` sends, month-filtered + marker-row idempotent).

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
8. `task_release` / `task_force_release_orphan` (coordination task-lock system, `coordinationStore.ts` `releaseTask()`/`releaseOrphanTask()`): UNCONDITIONAL release-refusal for any `task_id` starting with `"published:"` (`domain/services/publishedMarkerImmunity.ts`'s `isPublishedMarkerTaskId()`), fired as the FIRST statement of both functions — before any owner-match or heartbeat-staleness check. Refusal shape: `{ok:true, released:0, reason:"published_marker_immune"}` (`releaseTask`) / `{released:false, reason:"published_marker_immune"}` (`releaseOrphanTask`) — never `released:1`/`true`, for ANY caller (correct owner, wrong owner, or orphan-sweep). `coordinationTools.ts`'s call sites (`./coordination/taskReleaseTool.ts`, `./coordination/taskForceReleaseOrphanTool.ts`) need zero changes — both JSON-stringify the store's return value directly, so the additive `reason` field flows through unmodified. UC-CCA-P3 FR-5 (AC-CODE-GATE), code-enforced backstop after 3x prose-gate oscillation on `published:*` marker release (2026-07-02/07-03/07-15) — `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` §6.
