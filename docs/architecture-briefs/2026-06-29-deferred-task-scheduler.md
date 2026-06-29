# Architecture Brief: Deferred One-Shot Task Scheduler — `at(1)` for the Fleet

**Date:** 2026-06-29T20:18:45Z
**Slug:** deferred-task-scheduler
**Author:** agents-architect
**Status:** READY → po (sprint decomposition)
**Scope:** Verify-loop MVP only. Phase-2 horizons noted inline; do not build.

---

## (a) Problem + the at-vs-cron Framing

Every fleet action today is a **recurring cron**. There is no primitive that says "once, at epoch T, wake the right agent for one specific job, then forget it." The fleet has `cron(8)` but no `at(1)`.

Three concrete gaps confirmed by the user:

| Gap | Description |
|---|---|
| G1 — result verify | 20 min after a rebuild, confirm service X is healthy; if not, raise BUG |
| G2 — future info | Anchor a wake to FOMC release 2026-07-30 18:05 UTC; fetch statement, run impact chain, post to MARKET |
| G3 — bug re-probe | Fix dispatched with ETA; re-probe at ETA+buffer; if broken, re-escalate (feeds recurring-bug counter) |

These are **one-shot, deadline-bounded, target-specific** jobs. A recurring cron cannot represent them:
- Adding a cron fires every N minutes forever, not once.
- There is no mechanism to say "cancel this after first successful fire."
- A cron expression cannot encode "30 minutes from now."

Confirmed gap: no `schedule/defer/run_once` tool exists in either the MCP-server scheduler (Layer A, `apps/mcp-server/src/scheduler/`, node-cron) or the CLI CronCreate layer (Layer B, cowork cron commands). This brief designs the MVP `at(1)` complement.

---

## (b) Addressed-Not-Picked Routing Model + Agent→Team Map

### Model

Every one-shot is **addressed to a team at creation time**, not dynamically picked. The team classification determines which native intake receives the fired task:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  schedule_task(fire_at, agent, intent, prompt, …)                            │
│    → row written to scheduled_tasks (coordination.db)                         │
│    → team derived from agent lookup (system-map / agent-roster)               │
│    → status = 'pending'                                                       │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │ at fire_at (±15min sweep window)
                       ▼
          ┌────────────────────────────────────────┐
          │   cowork-team Step 0a-1 (*/15 sweeper)  │
          │   claim_due_scheduled_tasks(now)         │
          │   atomic flip pending→firing             │
          └────────────┬──────────────┬─────────────┘
                       │              │
           team=COWORK │              │ team=DEV
                       ▼              ▼
          ┌────────────────┐  ┌──────────────────────────┐
          │ PRE-CLAIM gate │  │ scripts/orch-apply.sh     │
          │ (CLAUDE.md §2.5)│  │ SignalQueueSchema row     │
          │ spawn agent    │  │ → orch-state signal_queue │
          │ (run_in_bg=true)│  │ dev-team drains next tick  │
          └────────────────┘  └──────────────────────────┘
```

No "picking" logic in the sweeper — the team was sealed when the row was inserted. The sweeper only routes into the team's native intake:
- **COWORK** → spawn directly through the existing PRE-CLAIM intent gate; no dispatch bypass.
- **DEV** → emit a `SignalRowSchema`-conformant row into `.signal_queue.rows[]` via `scripts/orch-apply.sh`; dev-team Step 0a drains it natively on its next tick (already implemented — zero new dev-side code).

### Agent→Team Map (sourced from `docs/references/agent-roster.md` + `docs/data/system-map.json`)

Do **not** hardcode this list in application code. Sweeper must derive team at creation time by reading the authoritative roster. The list below is the classification used for MVP; it is a documentation snapshot, not code.

**COWORK (spawn at fire_at):**
`market-watcher`, `news-scout`, `unified-agent`, `digest-predict`, `alert-commander`,
`fb-market-poster`, `bctc-analyst`, `refine_bctc_md`, `tran-ngoc-bau`, `qa-responder`,
`report-analyzer`, `market-analyst`

**DEV (signal at fire_at):**
`po`, `ba`, `pm`, `developer`, `fixer`, `qa`, `ops`, `system-auditor`, `code-janitor`,
`agent-father`, `claude-manager-helper`, `agents-architect`, `cowork-refactory-expert`,
`idea-forge`, `dev-mcp-server`, `dev-api-gateway`, `dev-stock-price`, `dev-technical-analysis`,
`dev-macro-indicators`, `dev-kinh-dich`, `dev-alert-engine`, `dev-pdf-extractor`,
`dev-rag-service`, `dev-frontend`, `dev-mainserver-crawls`, `dev-vps-crawls`, `dev-news-fetch`

**system-auditor explicit classification (confirmed DEV/signal):**
`system-auditor` runs in the detect/dev terminal (maintenance lane of `docs/agents/dev-team/flow/main.md`). It is explicitly excluded from the cowork-team dispatcher (`docs/agents/cowork-team/flow/main.md` § Team Boundary: "Maintenance agents … system-auditor … are invoked by main terminal or self-cron — NEVER spawned by this dispatcher"). MVP recommendation: **DEV(signal)**; the cascade (PO triage) decides whether to spawn a probe.

### Validation at insert time

When `schedule_task` is called, the server must validate that `agent` is a known agent id (exists in an allowlist derived from the roster — not hardcoded, but loaded from system-map or an enum baked at build time). An unknown agent id must return an error; the row must not be inserted.

---

## (c) SQLite Table DDL + Tool Contracts

### Table: `scheduled_tasks` — Migration 4 in `coordinationStore.ts`

Database: `coordination.db` (same DB as `task_locks` — already open at tool-call time).
No new DB file. Add as Migration 4 in `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`.

```sql
-- Migration 4: scheduled_tasks table (deferred one-shot scheduler)
-- fire_at / deadline_at = INTEGER (epoch seconds UTC). NEVER ISO8601 text.
-- dedup_key UNIQUE declared HERE in CREATE TABLE — NEVER via ADD COLUMN (silent no-op scar).
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id             TEXT    NOT NULL PRIMARY KEY,        -- UUID v4 (server-generated)
  agent          TEXT    NOT NULL,                    -- target agent id
  team           TEXT    NOT NULL CHECK(team IN ('COWORK','DEV')),
  intent         TEXT    NOT NULL,                    -- short label, e.g. "verify-rebuild-healthy"
  prompt         TEXT    NOT NULL,                    -- full spawn/signal body
  fire_at        INTEGER NOT NULL,                    -- epoch-seconds UTC; NEVER ISO8601
  deadline_at    INTEGER,                             -- epoch-seconds UTC; NULL = no expiry
  dedup_key      TEXT    UNIQUE,                      -- idempotency key; collision → return existing id
  reason         TEXT    NOT NULL,                    -- human rationale (for audit log)
  origin_ref     TEXT,                                -- back-ref to triggering task/signal id (nullable)
  max_attempts   INTEGER NOT NULL DEFAULT 1,
  attempts       INTEGER NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending','firing','fired','done','failed','expired','cancelled')),
  created_at     INTEGER NOT NULL,                    -- epoch-seconds UTC
  fired_at       INTEGER,                             -- epoch-seconds UTC (set by sweeper on flip)
  sweep_tick     TEXT,                                -- tick label of firing sweep (audit)
  error          TEXT                                 -- last error if failed
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status_fire_at
  ON scheduled_tasks(status, fire_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_dedup_key
  ON scheduled_tasks(dedup_key) WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_team_status
  ON scheduled_tasks(team, status);
```

**Lifecycle states:**
```
pending → firing (atomic sweep claim) → fired → done | failed
pending → expired  (sweep: now > deadline_at before fire_at reached or at sweep time)
pending → cancelled (cancel_scheduled_task called)
firing  → failed   (spawn/signal emission error, max_attempts exhausted)
```

Terminal states (`done`, `failed`, `expired`, `cancelled`) are retained for 7–14 days then pruned by a maintenance job (Phase-2 detail; MVP leaves pruning as a manual jq + DELETE task for ops).

### Tool 1: `schedule_task`

```typescript
// MCP tool: schedule_task
// Callable by ANY agent through the gateway — no main-session coupling.
// Returns existing id if dedup_key already exists (idempotent, no double-insert).

Input: {
  fire_at?:       number,   // epoch-seconds UTC (mutually exclusive with delay_seconds)
  delay_seconds?: number,   // shorthand: fire_at = now() + delay_seconds
  agent:          string,   // target agent id — validated against roster
  intent:         string,   // ≤80 chars, snake_case label
  prompt:         string,   // full prompt/payload for spawn or signal body
  deadline_at?:   number,   // epoch-seconds UTC; task expires if now > deadline_at at sweep time
  dedup_key?:     string,   // optional idempotency key
  reason:         string,   // ≥10 chars, human rationale
  origin_ref?:    string,   // optional back-ref
  max_attempts?:  number,   // default 1 (MVP: always 1; >1 reserved for future)
}

Output: {
  id:           string,   // UUID of the scheduled_tasks row
  status:       "pending",
  fire_at:      number,   // actual epoch-seconds stored
  team:         "COWORK" | "DEV",
  dedup_existed: boolean  // true if dedup_key collision → existing row returned
}

Error cases:
  - Neither fire_at nor delay_seconds provided → validation error
  - fire_at in the past (< now - 60s) → error "fire_at is in the past"
  - agent not in known roster → error "unknown agent: <agent>"
  - deadline_at < fire_at → error "deadline_at must be after fire_at"
```

### Tool 2: `cancel_scheduled_task`

```typescript
// MCP tool: cancel_scheduled_task
// Cancels a pending (or firing) scheduled task by id or dedup_key.
// Terminal rows (done/failed/expired/cancelled) cannot be cancelled — returns already_terminal.

Input: {
  id?:        string,   // scheduled_tasks.id (UUID)
  dedup_key?: string,   // alternative lookup; one of id or dedup_key required
}

Output: {
  ok:     boolean,
  status: "cancelled" | "not_found" | "already_terminal",
  id?:    string   // the row id that was cancelled (when ok=true)
}
```

### Tool 3: `list_scheduled_tasks`

```typescript
// MCP tool: list_scheduled_tasks
// Mirrors the get_cron_health audit pattern (cronHealthTools.ts) so
// "did my scheduled verify run?" is answerable.

Input: {
  status?:     "pending" | "firing" | "fired" | "done" | "failed" | "expired" | "cancelled",
  team?:       "COWORK" | "DEV",
  due_before?: number,   // epoch-seconds UTC filter: fire_at <= due_before
  limit?:      number,   // default 50
}

Output: {
  tasks: Array<{
    id:          string,
    agent:       string,
    team:        string,
    intent:      string,
    status:      string,
    fire_at:     number,
    deadline_at: number | null,
    fired_at:    number | null,
    sweep_tick:  string | null,
    attempts:    number,
    error:       string | null,
    reason:      string,
    origin_ref:  string | null,
    created_at:  number
  }>,
  count: number
}
```

### Internal: `claim_due_scheduled_tasks(nowEpoch: number)`

Called ONLY by the cowork-team sweeper (Step 0a-1). NOT exposed as an MCP tool.

```sql
-- Atomic pending→firing flip for all due rows (single-winner per row via primary-key uniqueness).
-- Returns the claimed rows for routing.
-- nowEpoch = Math.floor(Date.now() / 1000)

UPDATE scheduled_tasks
  SET status = 'firing',
      fired_at = :nowEpoch,
      attempts = attempts + 1
WHERE status = 'pending'
  AND fire_at <= :nowEpoch
RETURNING id, agent, team, intent, prompt, deadline_at, dedup_key,
          reason, origin_ref, fired_at, sweep_tick, attempts, max_attempts;
```

After RETURNING, the sweeper evaluates each row:
1. If `deadline_at IS NOT NULL AND nowEpoch > deadline_at` → UPDATE status='expired', skip routing.
2. Otherwise → route by team (COWORK spawn / DEV signal).
3. On successful routing → UPDATE status='fired'.
4. On routing error → UPDATE status='failed', error=<message>. If attempts < max_attempts → reset to 'pending' for retry on next sweep (MVP: max_attempts=1, so no retry).
5. Update sweep_tick = current tick label (e.g. "2026-07-30T18:15Z").

The atomic UPDATE ensures that even if two cowork-team sessions somehow both run Step 0a-1 in the same window (fire-time election already prevents this, but as belt-and-suspenders), each row can only be claimed once.

---

## (d) Sweeper-Step Design: Step 0a-1 in cowork-team/flow/main.md

### Placement

Insert a new **Step 0a-1** in `docs/agents/cowork-team/flow/main.md` between Step 0a (signal_queue drain) and Step 0b (presence + leader-lock). Update the JUMP-TO table.

```
| 0a   | Drain signal_queue                                         | inline          |
| 0a-1 | Drain due one-shot scheduled tasks                        | inline (new)    |  ← INSERT
| 0b   | Session-presence self-register + Fire-time election       | …               |
```

Step 0a-1 runs AFTER the fire-time election is won (Step 0b), but the election already runs in 0b. So the actual order is:

Wait — the fire-time election (cron:cowork:<TICK>) is in Step 0b (leader-lock.md). Step 0a-1 must run AFTER the election is won so only the winning session drains the one-shots. **Correct placement: Step 0a-1 runs immediately after Step 0b (after leader-lock.md returns WIN).**

Revised placement:
```
| 0a   | Drain signal_queue                                         | inline          |
| 0b   | Session-presence self-register + Fire-time election       | leader-lock.md  |
| 0b.3 | Drain due one-shot scheduled tasks (NEW)                  | inline (new)    |  ← INSERT
| 0c   | Blind detection — gateway preflight                       | blind-guard.md  |
```

The step is inline in main.md (not a sub-flow file) because it is short and references only one tool + one conditional routing block.

### Step 0b.3 Pseudocode (to be authored in main.md)

```
## Step 0b.3 — Drain Due One-Shot Scheduled Tasks

# Only the fire-election winner reaches this step.
# nowEpoch = current Unix epoch seconds (server-side in claim_due_scheduled_tasks).

due_tasks = call_tool(server="vn-market", tool="claim_due_scheduled_tasks", arguments={})
# Returns: {tasks: [...]} — only rows atomically claimed from pending→firing in this sweep.
# Empty list = no-op, proceed to Step 0c.

for each task in due_tasks.tasks:
  # Gate 1: Deadline check
  if task.deadline_at is not null AND now_epoch > task.deadline_at:
    call_tool(server="vn-market", tool="expire_scheduled_task", arguments={id: task.id})
    log "[cowork-team] one-shot " + task.id + " (" + task.intent + ") EXPIRED — past deadline"
    continue

  if task.team == "COWORK":
    # Gate 2: PRE-CLAIM intent gate (CLAUDE.md §2.5 — no dispatch bypass)
    preclaim_result = call_tool(server="vn-market", tool="task_claim", arguments={
      task_id:              "intent:one-shot:" + task.id,
      task_kind:            "intent",
      owner_agent:          task.agent,
      owner_client_session: $CLAUDE_CODE_SESSION_ID,
      ttl_seconds:          600,
      payload:              {site: "one-shot-sweeper", intent: task.intent, scheduled_task_id: task.id}
    })
    if not preclaim_result.claimed:
      log "[cowork-team] one-shot " + task.id + " PRE-CLAIM collision — skipping (peer holds)"
      # Row remains 'firing'; sweeper does not flip back — manual ops recovery or TTL expiry.
      # This should not occur because fire-election is already a single-winner guard.
      continue

    try:
      Agent(task.agent, prompt=task.prompt, run_in_background=true)
      call_tool(server="vn-market", tool="complete_scheduled_task", arguments={id: task.id, status: "fired"})
    catch err:
      call_tool(server="vn-market", tool="complete_scheduled_task", arguments={
        id: task.id, status: "failed", error: err.message
      })
    finally:
      call_tool(server="vn-market", tool="task_release", arguments={
        task_id: "intent:one-shot:" + task.id,
        owner_client_session: $CLAUDE_CODE_SESSION_ID
      })

  elif task.team == "DEV":
    # Emit signal_queue row via scripts/orch-apply.sh (NEVER raw write — SSOT-W1)
    # Conforms to SignalRowSchema (orchStateSchema.ts ~175-189)
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    signal_row = {
      id:          "one-shot-" + task.id,
      summary:     "[one-shot] " + task.intent + " → " + task.agent,
      severity:    "INFO",
      status:      "NEW",
      ts:          NOW,
      from:        "cowork-team/one-shot-sweeper",
      to:          task.agent,
      type:        "deferred_task",
      payload_ref: null
      # Full task.prompt embedded in summary or a companion file at docs/signals/one-shot-<id>.json
    }
    jq --argjson row '{signal_row}' \
      '.signal_queue.rows += [$row] | .signal_queue._updated_at = $NOW | .signal_queue._updated_by = "one-shot-sweeper"' \
      docs/data/orch/orch-state.json \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh"

    call_tool(server="vn-market", tool="complete_scheduled_task", arguments={id: task.id, status: "fired"})

# Step 0b.3 complete — continue to Step 0c (blind-guard.md)
```

Note: `expire_scheduled_task` and `complete_scheduled_task` are thin wrappers around
`UPDATE scheduled_tasks SET status=? WHERE id=?` — they can be the same internal function with a
`status` param, or folded into `claim_due_scheduled_tasks`'s RETURNING handler. The brief recommends
**not** exposing them as separate MCP tools; keep them as internal TypeScript helpers called within the
sweeper's tool handler.

### DEV signal payload handling

When the full `task.prompt` is long, the sweeper writes a companion file at
`docs/signals/one-shot-<task.id>.json` containing `{task: <full row>}` and sets
`payload_ref` on the signal row to that path. Dev-team Step 0a reads `payload_ref` per the
existing signal-dashboard skill.

### The sweeper is NOT a one-shot

The cowork-team `*/15` cron is the one irreducible heartbeat. The one-shot drain step (0b.3) runs
inside the recurring sweeper. If the sweeper itself were a one-shot, it would self-delete and the
entire queue would be stranded. The sweeper is and must remain a recurring cron.

---

## (e) Concurrency / No-Double-Fire

### Guard Layer 1: Fire-Time Election (cross-session)

`cron:cowork:<TICK>` (TTL=600s) already ensures at most one cowork-team session leads any given
15-min tick. Only the session that wins this election reaches Step 0b.3. Two concurrent cowork-team
sessions on the same host will have exactly one winner. Source:
`docs/agents/cowork-team/flow/leader-lock.md` + P3-FIRE-ELECTION addendum brief
(`docs/architecture-briefs/2026-06-28-fire-time-leader-election-P3-addendum.md`).

### Guard Layer 2: Atomic Row Claim (within winning session)

`claim_due_scheduled_tasks` uses `UPDATE WHERE status='pending' RETURNING`. SQLite serializes
writes on the WAL-mode database (WAL journal + `PRAGMA busy_timeout = 5000`). A single
`UPDATE ... RETURNING` is atomic: the rows flipped are exclusive to this call. Even if two sweeper
invocations somehow race (which Layer 1 prevents), each `pending` row can only be claimed once.

### Do we need a new task_kind?

**No.** The row-claim is a `scheduled_tasks.status` flip via SQL UPDATE, not a `task_locks` row.
The only lock reused is the existing fire-time election (`task_kind="sprint-task"`,
`task_id="cron:cowork:<TICK>"`). No new `task_kind` enum value is needed, which means no
recreate-migration on `task_locks` and no QA-live-verify risk from enum-drift.

The PRE-CLAIM intent gate for COWORK spawns uses `task_kind="intent"` (already in the
deployed enum since Migration 3). No enum widening required.

**Conclusion:** Two layers of no-double-fire protection (fire election + atomic SQL), zero new enum
values, zero new task_kinds.

---

## (f) Three MVP Verify Use Cases — End-to-End

### Use Case 1 — Verify Rebuild Result (G1)

**Trigger:** ops agent completes a `docker-compose up --build` for `mcp-server`.

**Schedule call (from ops):**
```
call_tool(server="vn-market", tool="schedule_task", arguments={
  delay_seconds: 1200,   // 20 minutes
  agent:         "ops",
  intent:        "verify-mcp-server-rebuild-healthy",
  prompt:        "Check mcp-server container health via docker inspect + last cron_job_runs row.
                  If healthy → log [ops] mcp-server rebuild verified. Else → raise BUG signal.",
  deadline_at:   <now + 3600>,   // 1 hour hard cutoff
  dedup_key:     "rebuild-verify-mcp-server-" + <rebuild_job_id>,
  reason:        "Post-rebuild health gate for mcp-server rebuild <rebuild_job_id>",
  origin_ref:    <rebuild_task_id>
})
```

**Route:** `ops` is DEV → signal_queue row emitted at fire_at.

**Flow at fire_at (±15min):**
1. Sweeper fires: `claim_due_scheduled_tasks` claims the row.
2. Deadline check: fire_at + 20min < deadline_at=now+60min → OK.
3. team=DEV → jq emits signal row `{id: "one-shot-<id>", to: "ops", type: "deferred_task", …}` via orch-apply.sh.
4. Dev-team Step 0a drains on next tick (7,37 pattern): PO triage reads the signal → spawns ops.
5. ops checks `docker inspect mcp-server` + `SELECT * FROM cron_job_runs ORDER BY started_at DESC LIMIT 1`.
6. Healthy → log. Unhealthy → `submit_feedback(severity="HIGH", title="mcp-server unhealthy 20min post-rebuild")`.

### Use Case 2 — FOMC Release Anchor (G2)

**Trigger:** PO schedules in advance (or market-watcher schedules when it detects an upcoming FOMC date).

**Schedule call:**
```
call_tool(server="vn-market", tool="schedule_task", arguments={
  fire_at:    1753898700,   // 2026-07-30T18:05:00Z epoch-seconds UTC
  agent:      "market-watcher",
  intent:     "fomc-release-2026-07-30",
  prompt:     "FOMC statement released at 18:05 UTC. Fetch FED statement. Run macro impact chain
                on VN equities (VN30F, VCB, FPT). Emit chain_catalyst signal for alert-commander.
                Post summary to MARKET channel.",
  deadline_at: 1753912800,   // 2026-07-30T22:00:00Z — stale after 4 hours
  dedup_key:  "fomc-2026-07-30",
  reason:     "FOMC release impact analysis"
})
```

**Route:** `market-watcher` is COWORK → spawned at fire_at.

**Flow at fire_at (first sweep on or after 18:05 UTC, i.e. 18:15 sweep):**
1. Sweeper fires: claim row, deadline check (18:15 < 22:00) → OK.
2. team=COWORK → PRE-CLAIM intent gate: claim `intent:one-shot:<id>` (task_kind="intent").
3. Agent spawn: `market-watcher` with full prompt (run_in_background=true).
4. `complete_scheduled_task` → status='fired'.
5. market-watcher runs impact chain, posts to MARKET.

**Stale-sweep guard:** If the loop was down between 18:05–22:00 UTC and the first sweep fires at 22:15,
`now_epoch (22:15) > deadline_at (22:00)` → status='expired'. No stale FOMC analysis posted.

### Use Case 3 — Bug Re-Probe at Fix ETA (G3)

**Trigger:** QA approves a fix; dev-team flow writes the scheduled task before releasing the sprint lock.

**Schedule call:**
```
call_tool(server="vn-market", tool="schedule_task", arguments={
  delay_seconds: 5400,   // 90 min (fix ETA + 30min buffer)
  agent:         "system-auditor",
  intent:        "re-probe-bug-TASK-2043",
  prompt:        "Re-probe TASK_2043 fix: verify alert_id FK integrity via NOT-EXISTS query.
                  If broken → submit_feedback(severity='HIGH') and increment recurring-bug counter.
                  Else → log [system-auditor] TASK_2043 fix confirmed.",
  deadline_at:   <now + 14400>,   // 4-hour window
  dedup_key:     "bug-reprobe-TASK-2043",
  reason:        "Post-fix re-probe for TASK_2043 (alert_id orphan-FK, fixed 2026-06-29)",
  origin_ref:    "TASK_2043"
})
```

**Route:** `system-auditor` is DEV → signal_queue row at fire_at.

**Flow at fire_at:**
1. Sweeper fires, deadline OK.
2. team=DEV → signal row emitted → dev-team picks up → PO routes to system-auditor.
3. system-auditor probes the NOT-EXISTS query.
4. If FK violation found → `submit_feedback` + increment recurring-bug counter → PO re-opens sprint.
5. If clean → log confirmation. Scheduled task status='done'.

---

## (g) Acceptance Criteria — Hard Rules

The following rules derived from fleet scars are **blocking AC** for this sprint. Any implementation that violates one is not shippable.

**AC-1: Epoch-seconds storage (SQLite iso8601 bypass scar)**
`fire_at`, `deadline_at`, `created_at`, `fired_at` MUST be stored as `INTEGER` (epoch seconds UTC).
The sweeper MUST use `WHERE fire_at <= :nowEpoch` with a bound integer parameter.
NEVER store ISO8601 strings and compare with `datetime()` or string operators.
Verify: `SELECT typeof(fire_at) FROM scheduled_tasks LIMIT 1` returns `'integer'`.

**AC-2: dedup_key UNIQUE in CREATE TABLE (ADD COLUMN unique silent no-op scar)**
`dedup_key TEXT UNIQUE` MUST be declared in the initial `CREATE TABLE` DDL or in a table-recreate migration.
NEVER `ALTER TABLE scheduled_tasks ADD COLUMN dedup_key TEXT UNIQUE` — SQLite silently drops the UNIQUE constraint on ADD COLUMN.
Verify: `SELECT sql FROM sqlite_master WHERE name='scheduled_tasks'` contains `UNIQUE` on `dedup_key`.

**AC-3: deadline_at expiry gate in sweeper**
After claiming a row (`firing`), sweeper MUST check `now_epoch > deadline_at` before routing.
Expired rows → status='expired', no spawn, no signal. Log the expiry.
Verify with test: insert a row with `fire_at=now-10, deadline_at=now-5` → sweeper must expire it, not route.

**AC-4: Sweeper is a recurring step, not a one-shot**
Step 0b.3 in `cowork-team/flow/main.md` MUST be a step inside the recurring `*/15` cron.
NEVER make the sweeper itself a scheduled_task row (self-deleting sweeper strands the queue).

**AC-5: COWORK delivery via PRE-CLAIM intent gate**
Every COWORK-team one-shot spawn MUST claim `intent:one-shot:<task.id>` (task_kind="intent") before spawning.
No dispatch bypass. task_kind="intent" is already in the deployed CHECK enum (Migration 3) — no enum-drift risk.
Verify: task_claim for the intent key must succeed before Agent() call.

**AC-6: DEV delivery via orch-apply.sh + SignalRowSchema**
Every DEV-team one-shot MUST produce a SignalRowSchema-conformant row via `scripts/orch-apply.sh`.
NEVER raw-write orch-state.json. NEVER interpolate task.prompt or task.agent into a shell command (injection scar).
Use jq `--argjson` or `--arg` bound variables only.
Verify: `bash scripts/orch-apply.sh` exits 0; Zod tri-point validation passes.

**AC-7: No new task_kind required**
The implementation MUST NOT add a new task_kind to `task_locks`. The `scheduled_tasks` table is a separate
entity; the fire-time election reuses `task_kind="sprint-task"` (already deployed); PRE-CLAIM reuses
`task_kind="intent"` (already deployed). If during implementation a new kind is discovered to be
unavoidable, it MUST be added in a full recreate-migration AND QA-live-verified against the deployed enum.
Require explicit architect sign-off before adding any new kind.

**AC-8: agent→team mapping sourced from roster, not hardcoded in code**
The `schedule_task` tool implementation MUST look up the team classification from a source-of-truth
(system-map.json loaded at startup, or a static registry derived from agent-roster.md).
NEVER a hardcoded `if agent == "market-watcher" return "COWORK"` switch in application code.
An agent not found in the roster MUST return an error (fail-loud, not silent default to DEV).

**AC-9: Honest caveat communicated to caller**
The `schedule_task` tool response and docs MUST state: "One-shots fire only while the cowork-team loop
is live. deadline_at bounds staleness. True 24/7 firing (launchd headless sweeper) is Phase-2."
This caveat must appear in the MCP tool's description field.

**AC-10: list_scheduled_tasks auditable**
`list_scheduled_tasks` MUST return `sweep_tick`, `fired_at`, `error`, and `status` for all terminal rows
within the retention window (7–14 days). This mirrors the `get_cron_health` audit capability.
Verify: after a one-shot fires, `list_scheduled_tasks({status: "fired"})` returns the row with non-null `fired_at`.

**AC-11: Lifecycle completeness**
Every row MUST exit via one of the terminal statuses: `done`, `failed`, `expired`, `cancelled`.
A row stuck in `firing` (sweeper crashed after claiming) is a bug. MVP mitigation: `list_scheduled_tasks({status: "firing"})` used by ops for manual triage. Phase-2 can add a recovery sweeper.

**AC-12: No orch-state.json write from schedule_task tool**
`schedule_task` writes ONLY to `scheduled_tasks` in coordination.db. NEVER touches orch-state.json at insert time. Signal emission happens ONLY at fire time via orch-apply.sh.

---

## (h) Subtask Routing for Implementation

This brief is architecture-only. All file edits are routed as follows:

| Subtask | Scope | Route to |
|---|---|---|
| ST-1: `scheduled_tasks` Migration 4 | `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` | dev-mcp-server |
| ST-2: `schedule_task`, `cancel_scheduled_task`, `list_scheduled_tasks` MCP tools | `apps/mcp-server/src/interface/mcp/tools/system/` (new file: `scheduledTaskTools.ts`) | dev-mcp-server |
| ST-3: `claim_due_scheduled_tasks` internal helper | `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` or new `scheduledTaskStore.ts` | dev-mcp-server |
| ST-4: Agent bootstrap allowlist (`agentBootstrap.ts`) | Register new tool names; add to applicable tool packages | dev-mcp-server |
| ST-5: Sweeper step 0b.3 in flow doc | `docs/agents/cowork-team/flow/main.md` (JUMP-TO table + inline step) | dev-mcp-server (doc owner: cowork-team flow — route to agents-architect or agent-father if needed, but since it's a flow doc change, route to dev-mcp-server under direction of this brief) |
| ST-6: Agent roster classification helper | Read `docs/data/system-map.json` at tool registration; surface as `AGENT_TEAM_MAP` constant | dev-mcp-server |
| ST-7: Tests | `apps/mcp-server/src/__tests__/` — unit tests for Migration 4 DDL (AC-2 UNIQUE verify), claim_due atomic test, deadline expiry test (AC-3), dedup_key collision test | dev-mcp-server |
| ST-8: `docs/architecture/microservice/mcp-server/` doc update | Record new table + tools in microservice doc | dev-mcp-server (doc_owner) |

**ST-5 clarification:** `docs/agents/cowork-team/flow/main.md` is a flow doc, not production code.
Ownership is shared (cowork-team team). The edit is purely additive (insert new step 0b.3 inline, update
JUMP-TO table). Dev-mcp-server should make this edit as part of the same sprint to avoid a
cross-agent file-ownership conflict. If agent-father needs to review the flow edit, route ST-5 as a
sub-task under agent-father review.

**Phase-2 horizons (do not build in MVP):**
- Self-rescheduling / adaptive retry loops
- Replacing fixed recurring crons with scheduled_tasks
- Headless launchd sweeper (true 24/7 firing)
- Automatic `firing` recovery sweep for sweeper-crash cases
- Automatic pruning of terminal rows (>14 days old)

---

## RETURN

```
DONE: Architecture brief authored — deferred-task-scheduler
NEXT: po — sprint decomposition
HANDOFF: docs/architecture-briefs/2026-06-29-deferred-task-scheduler.md
PIPELINE: continue

SUBTASKS → dev-mcp-server (ST-1 through ST-8)
SIGNAL → docs/signals/deferred-task-scheduler-20260629T201845Z.json

PHASE-2 SCOPE (deferred — do not build):
  - Headless launchd sweeper (true 24/7)
  - Adaptive retry / self-rescheduling
  - Automatic terminal-row pruning
  - firing-state recovery sweeper

HONEST CAVEAT (embed in MCP tool description):
  "One-shots fire only while the cowork-team */15 loop is live (same property as all fleet crons
   today). Set deadline_at to bound staleness after downtime. True 24/7 headless firing is Phase-2."
```
