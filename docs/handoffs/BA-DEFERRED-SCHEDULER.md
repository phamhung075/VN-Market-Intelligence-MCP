# Requirement Spec — BA-DEFERRED-SCHEDULER
## Sprint: DEFERRED-TASK-SCHEDULER-MVP

**BA task-id:** BA-DEFERRED-SCHEDULER
**Sprint goal entry:** sprint_goal.entries[18] — DEFERRED-TASK-SCHEDULER-MVP
**Architecture brief (SSOT, design LOCKED):** docs/architecture-briefs/2026-06-29-deferred-task-scheduler.md
**PO decision journal:** docs/agent-memory/decisions/sprint-DEFERRED-TASK-SCHEDULER-MVP-po.md
**Chain:** ba → po(review) → pm → dev-mcp-server → qa
**Date:** 2026-06-29

---

## 0. Scope Guardrail

**IN SCOPE (Verify-loop MVP):** All 8 STs below.
**OUT OF SCOPE (Phase-2 — do NOT implement):**
- Headless launchd 24/7 sweeper (one-shots fire ONLY while the cowork-team loop is live)
- Adaptive retry / self-rescheduling
- Replacing fixed crons with scheduled_tasks
- Automatic `firing`-state recovery sweeper (sweeper-crash recovery)
- Automatic terminal-row pruning (>14 days old)
- Retention enforcement (ops runs manual DELETE for now)

---

## 0.1 PO Review Directives (APPROVED 2026-06-29T20:56:06Z — binding on pm + dev-mcp-server)

PO sign-off is **APPROVED**: this spec is a faithful 1:1 transposition of the LOCKED brief — all 12 ACs traced to blocking gates, all 8 STs covered, Phase-2 correctly held OUT (§0 mirrors the brief's horizon list verbatim). No scope creep, no blockers. The 3 advisory questions in §9 are ruled below — these directives **supersede** the "recommended resolution" notes in §9 where they differ.

**D1 (rules Q1 — done vs fired):** MVP terminal success state is **`fired`**. Do NOT implement a `done`-write path and do NOT add a `mark_task_done` MCP tool. `done` STAYS in the CHECK enum (reserves the Phase-2 confirmation-callback value — harmless, never written by MVP code). **QA-critical:** AC-11 lifecycle-completeness must verify the **MVP terminal set = {`fired`, `failed`, `expired`, `cancelled`}**. The brief's AC-11 wording lists `done` instead of `fired` because it presumed a Phase-2 confirmation callback this MVP does not build — so the sweeper's success path ends in `fired`. ST-7 + QA verify `fired` as a valid terminal outcome; a row ending in `fired` is NOT a lifecycle-incompleteness failure.

**D2 (rules Q2 — privileged-helper registration; resolves a spec/brief contradiction):** §3.2/§4.4 say the 4 helpers (`claim_due_scheduled_tasks`, `complete_scheduled_task`, `expire_scheduled_task`, `fail_scheduled_task`) are "internal TypeScript, NOT registered as MCP tools" — but §5.2 (and the brief §d) call them via `call_tool(server="vn-market", tool="claim_due_scheduled_tasks", …)`. The cowork-team Step 0b.3 sweeper is an **LLM agent that can only act through the gateway `call_tool` wrapper** — it cannot invoke an in-process TypeScript function. The contradiction is resolved as follows, binding:
- The 4 helpers **MUST be gateway-reachable** by the sweeper (non-negotiable).
- The **public tool surface MUST remain EXACTLY the 3 tools** `schedule_task` / `cancel_scheduled_task` / `list_scheduled_tasks`. Ordinary agents MUST NOT be able to fire-claim or force-complete a scheduled row (no privilege escalation).
- **Mechanism is dev-mcp-server's choice:** either (a) register the 4 helpers in a privileged tool package excluded from the public/general agent packages, or (b) fold the whole claim→deadline-gate→complete/expire/fail sequence behind a single privileged orchestration tool (e.g. `drain_due_scheduled_tasks`) that the sweeper calls once. Either satisfies the invariant.
- **Relax the §4.4 verification wording** from "internal helpers do not appear in `list_server_tools`" to "the 4 helpers are absent from the **public agent tool packages** (ordinary agents cannot invoke them)." Gateway-reachability requires server registration, so the helpers MAY appear in the raw server registry; the testable invariant is that they are NOT in a normal agent's package and the public surface is the 3 tools. dev-mcp-server documents the final privileged boundary in ST-8.

**D3 (rules Q3 — long-prompt companion file):** RAW-verified `SignalRowSchema` (`apps/mcp-server/src/infrastructure/orchStateSchema.ts:175`) has **no `prompt`/`body` field**; it is `.passthrough()` but the consumer (dev-team Step 0a / signal-dashboard skill) reads **`payload_ref`** for the body. Therefore, drop the 500-char threshold: for the **DEV signal path, ALWAYS write the companion file** `docs/signals/one-shot-<task.id>.json` (`{task: <full row>}`) and set `payload_ref` to it; keep `summary` as the one-liner `[one-shot] <intent> → <agent>`. **NEVER embed the prompt in `summary`.** (COWORK path passes `prompt` directly to `Agent(prompt=…)` — no companion file.) If dev still wants a tiny-prompt embed optimization it MUST guarantee the full prompt is always retrievable by dev-team and document the rule in ST-8 — but companion-file-always is the directive.

**Full PO reasoning:** `docs/agent-memory/decisions/sprint-DEFERRED-TASK-SCHEDULER-MVP-po.md` § STEP po-S3.

---

## 1. Problem Statement (brief §a)

The fleet has `cron(8)` (recurring) but no `at(1)` (one-shot, deadline-bounded). Three confirmed gaps a recurring cron cannot close:

| Gap | Description |
|---|---|
| G1 — rebuild verify | 20 min after rebuild, confirm service healthy; if not, raise BUG |
| G2 — future info anchor | Wake at FOMC release 2026-07-30 18:05 UTC; fetch statement, run impact chain, post to MARKET |
| G3 — bug re-probe | At fix ETA+buffer, re-probe; if broken, re-escalate (feeds recurring-bug counter) |

---

## 2. Domain Model — Scheduled-Task Entity

**DDD Layer: Domain**

### 2.1 Entity: ScheduledTask

Core attributes (mapped to `scheduled_tasks` table in `coordination.db`):

| Field | Type | Invariant |
|---|---|---|
| `id` | UUID TEXT | Server-generated, PK, immutable |
| `agent` | TEXT | Validated against AGENT_TEAM_MAP at insert; fail-loud if unknown |
| `team` | COWORK \| DEV | Derived at insert from agent roster; sealed at insert, never recomputed |
| `intent` | TEXT ≤80 chars | Snake_case label; required |
| `prompt` | TEXT | Full spawn/signal body; required |
| `fire_at` | INTEGER epoch-seconds UTC | Never ISO8601; required |
| `deadline_at` | INTEGER epoch-seconds UTC \| NULL | If set, must be > fire_at |
| `dedup_key` | TEXT UNIQUE \| NULL | Idempotency key; collision returns existing row |
| `reason` | TEXT ≥10 chars | Human rationale; required |
| `origin_ref` | TEXT \| NULL | Back-ref to triggering task/signal |
| `max_attempts` | INTEGER DEFAULT 1 | MVP: always 1; >1 reserved for Phase-2 |
| `attempts` | INTEGER DEFAULT 0 | Incremented by sweeper on each claim |
| `status` | TEXT CHECK enum | See lifecycle below |
| `created_at` | INTEGER epoch-seconds UTC | Set at insert |
| `fired_at` | INTEGER epoch-seconds UTC \| NULL | Set by sweeper on pending→firing flip |
| `sweep_tick` | TEXT \| NULL | Tick label of firing sweep (audit trail) |
| `error` | TEXT \| NULL | Last error message if failed |

### 2.2 Lifecycle States

```
pending → firing   (atomic sweeper claim: UPDATE WHERE status='pending' AND fire_at<=:nowEpoch)
firing  → fired    (successful routing to team intake: COWORK spawn or DEV signal)
firing  → failed   (routing error; max_attempts=1 in MVP so no retry)
pending → expired  (sweeper: now_epoch > deadline_at at sweep time, before or at fire_at)
firing  → expired  (sweeper: now_epoch > deadline_at, claimed but deadline already past)
pending → cancelled (cancel_scheduled_task called before sweep)
firing  → cancelled (cancel_scheduled_task called during sweep window — accepted)
```

Terminal states: `done`, `failed`, `expired`, `cancelled` — rows retained 7–14 days, then pruned manually (Phase-2 automates).

**Note on `done` vs `fired`:** The brief defines `fired` as the status set when routing succeeds (spawn dispatched / signal emitted). `done` is a terminal alias. MVP can treat `fired` as terminal-equivalent for COWORK and DEV paths. The `complete_scheduled_task` internal helper sets `status='fired'` after routing. This is the terminal state for MVP; `done` is reserved for Phase-2 confirmation callback.

**AC mapping:** AC-11 (lifecycle completeness) requires every row exits via one of: `done`, `failed`, `expired`, `cancelled`. MVP operational note: a row stuck in `firing` (sweeper crashed after claim, before routing) is a known non-terminal edge. Mitigation: `list_scheduled_tasks({status:"firing"})` allows ops manual triage. Phase-2 recovery sweeper closes this.

---

## 3. Infrastructure Requirements

**DDD Layer: Infrastructure**

### 3.1 FR-INF-1: Migration 4 — scheduled_tasks Table (ST-1)

**File:** `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`

Add as Migration 4 in the existing migration runner. Same `coordination.db` as `task_locks`. No new DB file.

**DDL (verbatim from brief §c — do not paraphrase):**

```sql
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id             TEXT    NOT NULL PRIMARY KEY,
  agent          TEXT    NOT NULL,
  team           TEXT    NOT NULL CHECK(team IN ('COWORK','DEV')),
  intent         TEXT    NOT NULL,
  prompt         TEXT    NOT NULL,
  fire_at        INTEGER NOT NULL,
  deadline_at    INTEGER,
  dedup_key      TEXT    UNIQUE,
  reason         TEXT    NOT NULL,
  origin_ref     TEXT,
  max_attempts   INTEGER NOT NULL DEFAULT 1,
  attempts       INTEGER NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending','firing','fired','done','failed','expired','cancelled')),
  created_at     INTEGER NOT NULL,
  fired_at       INTEGER,
  sweep_tick     TEXT,
  error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status_fire_at
  ON scheduled_tasks(status, fire_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_dedup_key
  ON scheduled_tasks(dedup_key) WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_team_status
  ON scheduled_tasks(team, status);
```

**Blocking invariants (AC gates):**
- AC-1: All time columns (`fire_at`, `deadline_at`, `created_at`, `fired_at`) MUST be INTEGER epoch-seconds. `SELECT typeof(fire_at) FROM scheduled_tasks LIMIT 1` must return `'integer'`. Never TEXT ISO8601.
- AC-2: `dedup_key TEXT UNIQUE` MUST appear in the initial `CREATE TABLE` DDL — not via `ALTER TABLE ADD COLUMN ... UNIQUE` (SQLite silently drops the UNIQUE constraint on ADD COLUMN — fleet scar). Verify: `SELECT sql FROM sqlite_master WHERE name='scheduled_tasks'` contains `UNIQUE` on `dedup_key`.
- AC-7: No new `task_kind` on `task_locks`. This table is a separate entity; fire-election reuses `task_kind="sprint-task"` (already deployed); PRE-CLAIM reuses `task_kind="intent"` (already deployed). Zero enum-drift risk.
- AC-11: The 7-state CHECK enum must be present in `CREATE TABLE` so invalid transitions fail at the DB layer.

### 3.2 FR-INF-2: claim_due_scheduled_tasks — Internal Atomic Helper (ST-3)

**File:** `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (or new `scheduledTaskStore.ts`)

**NOT an MCP tool — internal TypeScript function only.**

```sql
UPDATE scheduled_tasks
  SET status = 'firing',
      fired_at = :nowEpoch,
      attempts = attempts + 1
WHERE status = 'pending'
  AND fire_at <= :nowEpoch
RETURNING id, agent, team, intent, prompt, deadline_at, dedup_key,
          reason, origin_ref, fired_at, sweep_tick, attempts, max_attempts;
```

Rules:
- `nowEpoch` = `Math.floor(Date.now() / 1000)` — bound INTEGER param. Never `datetime()` or string comparison (AC-1 / AC-3).
- The single `UPDATE ... RETURNING` is atomic on WAL-mode SQLite with `PRAGMA busy_timeout = 5000`.
- Two concurrent calls (belt-and-suspenders, fire election already prevents this) cannot double-claim the same row: `status='pending'` is the exclusive gate.
- After RETURNING, the sweeper (Step 0b.3) evaluates each row for deadline and routing — see §5.

**Internal helpers** (NOT MCP-exposed):
- `complete_scheduled_task(id, status: 'fired' | 'done')` — thin `UPDATE SET status=? WHERE id=?`
- `expire_scheduled_task(id)` — thin `UPDATE SET status='expired' WHERE id=?`
- `fail_scheduled_task(id, error: string)` — thin `UPDATE SET status='failed', error=? WHERE id=?`

These may be one function with a `status` param or separate helpers. They are internal TypeScript and must NOT be registered as MCP tools.

**AC gates:** AC-1 (epoch param), AC-3 (deadline eval after claim), AC-7 (no new task_kind)

### 3.3 FR-INF-3: AGENT_TEAM_MAP — Roster-Sourced Classification (ST-6)

**File:** `apps/mcp-server/src/` (a new classification helper, e.g. `agentTeamMap.ts`)

The `schedule_task` tool must resolve a target `agent` string to `'COWORK' | 'DEV'` at insert time.

Rules:
- Source of truth: `docs/data/system-map.json` and/or `docs/references/agent-roster.md`. Load at server startup or build a static registry derived from them.
- Never a hardcoded `if agent === "market-watcher" return "COWORK"` switch in application code (AC-8 fleet scar).
- Unknown agent id → `schedule_task` returns error `"unknown agent: <agent>"` and no row is inserted (fail-loud).
- The COWORK and DEV agent lists in the brief are documentation reference snapshots, not code.

**AC gate:** AC-8

---

## 4. Interface Requirements — MCP Tools

**DDD Layer: Interface**

All three tools registered in `apps/mcp-server/src/interface/mcp/tools/system/scheduledTaskTools.ts` and exposed via the gateway. Internal helpers (`claim_due_scheduled_tasks`, `complete_scheduled_task`, `expire_scheduled_task`, `fail_scheduled_task`) are NOT exposed.

### 4.1 FR-IF-1: schedule_task (ST-2)

**Input contract:**

| Field | Type | Rule |
|---|---|---|
| `fire_at` | number \| undefined | Epoch-seconds UTC. Mutually exclusive with `delay_seconds`. |
| `delay_seconds` | number \| undefined | Shorthand: `fire_at = Math.floor(Date.now()/1000) + delay_seconds`. Mutually exclusive with `fire_at`. |
| `agent` | string | Required. Validated against AGENT_TEAM_MAP. |
| `intent` | string | Required. ≤80 chars, snake_case label. |
| `prompt` | string | Required. Full spawn/signal body. |
| `deadline_at` | number \| undefined | Epoch-seconds UTC. If set, must be > fire_at. |
| `dedup_key` | string \| undefined | Idempotency key. |
| `reason` | string | Required. ≥10 chars. |
| `origin_ref` | string \| undefined | Back-ref to triggering task/signal. |
| `max_attempts` | number \| undefined | Default 1 for MVP. |

**Validation errors (reject with error, no row inserted):**
- Neither `fire_at` nor `delay_seconds` provided
- Both `fire_at` and `delay_seconds` provided
- Resolved `fire_at` < `now - 60` (in the past beyond 60s grace)
- `agent` not in AGENT_TEAM_MAP
- `deadline_at` < resolved `fire_at`
- `reason.length < 10`

**Idempotency:** If `dedup_key` already exists and the existing row is non-terminal, return the existing row's `id` with `dedup_existed: true`. No double-insert. If the existing row is terminal, treat as new insert (caller rescheduling is a new job).

**Output:**
```typescript
{
  id:            string,   // UUID of the scheduled_tasks row
  status:        "pending",
  fire_at:       number,   // actual epoch-seconds stored
  team:          "COWORK" | "DEV",
  dedup_existed: boolean
}
```

**Write boundary (AC-12):** `schedule_task` writes ONLY `scheduled_tasks` in `coordination.db`. It never touches `orch-state.json` at insert time. Signal emission happens only at fire time via `orch-apply.sh`.

**MCP tool description must include honest caveat (AC-9):**
> "One-shots fire only while the cowork-team */15 loop is live (same property as all fleet crons today). Set deadline_at to bound staleness after downtime. True 24/7 headless firing is Phase-2."

### 4.2 FR-IF-2: cancel_scheduled_task (ST-2)

**Input:**
```typescript
{ id?: string, dedup_key?: string }  // one of id or dedup_key required
```

**Cancellation rules:**
- Lookup by `id` OR `dedup_key`.
- If row in `pending` or `firing` → flip to `cancelled`. Return `{ ok: true, status: "cancelled", id }`.
- If row in terminal state (`done`/`failed`/`expired`/`cancelled`) → return `{ ok: false, status: "already_terminal" }`.
- If no row found → return `{ ok: false, status: "not_found" }`.

### 4.3 FR-IF-3: list_scheduled_tasks (ST-2)

**Input (all optional):**
```typescript
{
  status?:     "pending" | "firing" | "fired" | "done" | "failed" | "expired" | "cancelled",
  team?:       "COWORK" | "DEV",
  due_before?: number,   // filter: fire_at <= due_before (epoch-seconds)
  limit?:      number    // default 50
}
```

**Output (AC-10 audit mandate):**
```typescript
{
  tasks: Array<{
    id, agent, team, intent, status,
    fire_at, deadline_at, fired_at,  // all INTEGER or null
    sweep_tick, attempts, error,
    reason, origin_ref, created_at
  }>,
  count: number
}
```

`sweep_tick`, `fired_at`, `error`, and `status` are REQUIRED in the response for all terminal rows. This mirrors the `get_cron_health` audit pattern. After a one-shot fires, `list_scheduled_tasks({status: "fired"})` must return the row with non-null `fired_at`.

### 4.4 FR-IF-4: agentBootstrap Registration (ST-4)

Register `schedule_task`, `cancel_scheduled_task`, `list_scheduled_tasks` in `agentBootstrap.ts` tool packages so they are reachable via `call_tool(server="vn-market", tool="<name>", arguments={})`.

Internal helpers (`claim_due_scheduled_tasks`, `complete_scheduled_task`, `expire_scheduled_task`, `fail_scheduled_task`) MUST NOT appear in the bootstrap registration.

**Verify:** `call_tool(server="vn-market", tool="schedule_task")` resolves (no -32601 error). The 3 tools appear in `list_server_tools("vn-market")`. Internal helpers do not.

---

## 5. Cowork-Team Flow — Sweeper Step 0b.3

**DDD Layer: Interface (flow doc) / Infrastructure (routing)**

**File:** `docs/agents/cowork-team/flow/main.md`

### 5.1 FR-FLOW-1: Placement (ST-5)

Insert Step 0b.3 AFTER Step 0b (leader-lock WIN) so only the fire-election winner drains the one-shots. Update the JUMP-TO table.

```
| 0a   | Drain signal_queue                                      | inline         |
| 0b   | Session-presence + Fire-time election                   | leader-lock.md |
| 0b.3 | Drain due one-shot scheduled tasks (NEW)               | inline         |  ← INSERT
| 0c   | Blind detection — gateway preflight                    | blind-guard.md |
```

**AC-4 invariant:** Step 0b.3 is a step INSIDE the recurring `*/15` cron. It must never be converted to a scheduled_task row itself (self-deleting sweeper strands the queue).

### 5.2 FR-FLOW-2: Step 0b.3 Logic

```
due_tasks = call_tool(server="vn-market", tool="claim_due_scheduled_tasks", arguments={})
# Returns only rows atomically claimed from pending→firing in this sweep.
# Empty list = no-op.

for each task in due_tasks.tasks:
  # Gate 1: Deadline expiry check
  if task.deadline_at IS NOT NULL AND now_epoch > task.deadline_at:
    expire_scheduled_task(task.id)
    log "[cowork-team] one-shot " + task.id + " (" + task.intent + ") EXPIRED — past deadline"
    continue

  if task.team == "COWORK":
    # Gate 2: PRE-CLAIM intent gate (CLAUDE.md §2.5 — no dispatch bypass)
    preclaim = call_tool(server="vn-market", tool="task_claim", arguments={
      task_id:              "intent:one-shot:" + task.id,
      task_kind:            "intent",          # already in deployed enum — AC-7
      owner_agent:          task.agent,
      owner_client_session: $CLAUDE_CODE_SESSION_ID,
      ttl_seconds:          600,
      payload:              {site: "one-shot-sweeper", intent: task.intent, scheduled_task_id: task.id}
    })
    if not preclaim.claimed:
      log "[cowork-team] one-shot " + task.id + " PRE-CLAIM collision — skipping"
      # Row remains 'firing'; ops triage via list_scheduled_tasks({status:"firing"})
      continue

    try:
      Agent(task.agent, prompt=task.prompt, run_in_background=true)
      complete_scheduled_task(task.id, "fired")
    catch err:
      fail_scheduled_task(task.id, err.message)
    finally:
      call_tool(server="vn-market", tool="task_release", arguments={
        task_id: "intent:one-shot:" + task.id,
        owner_client_session: $CLAUDE_CODE_SESSION_ID
      })

  elif task.team == "DEV":
    # AC-6: Emit via orch-apply.sh with --argjson bound vars (NEVER raw write, NEVER shell-interpolate)
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
      payload_ref: <path if prompt is long, else null>
    }
    jq --argjson row '<signal_row>' --arg now "$NOW" \
      '.signal_queue.rows += [$row] | .signal_queue._updated_at = $now | .signal_queue._updated_by = "one-shot-sweeper"' \
      docs/data/orch/orch-state.json \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh"

    complete_scheduled_task(task.id, "fired")
```

**DEV signal payload handling:** When `task.prompt` is long, the sweeper writes a companion file at `docs/signals/one-shot-<task.id>.json` containing `{task: <full row>}` and sets `payload_ref` on the signal row to that path. Dev-team Step 0a reads `payload_ref` per the existing signal-dashboard skill.

**AC gates for Step 0b.3:** AC-3 (deadline gate before routing), AC-4 (recurring, never self-scheduling), AC-5 (COWORK PRE-CLAIM before spawn), AC-6 (DEV via orch-apply.sh + bound vars, no injection), AC-7 (task_kind="intent" already deployed)

### 5.3 FR-FLOW-3: Concurrency Protection

Two layers, no new code required:
- **Layer 1 (cross-session):** Fire-time election `cron:cowork:<TICK>` (leader-lock.md) ensures at most one session runs Step 0b.3 per 15-min tick.
- **Layer 2 (within session):** `claim_due_scheduled_tasks` uses atomic `UPDATE WHERE status='pending' RETURNING`. Each `pending` row can only be claimed once even if two sessions somehow race.

---

## 6. Non-Functional Requirements — AC Trace Table

| AC | Requirement | Enforced in |
|---|---|---|
| AC-1 | Epoch-seconds INTEGER for all time cols; WHERE uses bound integer | ST-1 DDL, ST-3 query param |
| AC-2 | `dedup_key UNIQUE` in `CREATE TABLE` (NOT `ALTER TABLE ADD COLUMN`) | ST-1 DDL |
| AC-3 | Deadline gate after claim; expired rows → status='expired', no routing | ST-3 claim helper + ST-5 Step 0b.3 |
| AC-4 | Step 0b.3 is inside the recurring `*/15` cron; never a scheduled_task itself | ST-5 flow doc |
| AC-5 | COWORK spawns claim `intent:one-shot:<id>` (task_kind="intent") before Agent() | ST-5 Step 0b.3 |
| AC-6 | DEV signal via jq `--argjson` + `scripts/orch-apply.sh`; Zod tri-point passes | ST-5 Step 0b.3 |
| AC-7 | No new task_kind on task_locks; reuses sprint-task + intent (both deployed) | ST-1, ST-3, ST-5 |
| AC-8 | AGENT_TEAM_MAP sourced from system-map.json/agent-roster.md; unknown agent → error | ST-6 |
| AC-9 | Honest Phase-2 caveat in schedule_task tool description + ST-8 doc | ST-2, ST-8 |
| AC-10 | list_scheduled_tasks returns sweep_tick/fired_at/error/status for terminal rows | ST-2 |
| AC-11 | Every row exits via done/failed/expired/cancelled; firing-stuck = ops-triage only | ST-1 CHECK enum, ST-3 |
| AC-12 | schedule_task writes ONLY scheduled_tasks; never orch-state.json at insert | ST-2 |

---

## 7. Subtask Dependency DAG (dev-mcp-server owns all)

```
ST-1 (Migration 4 DDL)
  └── ST-3 (claim_due helper)
  └── ST-6 (AGENT_TEAM_MAP)
        └── ST-2 (3 MCP tools: schedule_task / cancel / list)
                  └── ST-4 (bootstrap registration)
                  └── ST-5 (cowork-team Step 0b.3 flow doc)
                  └── ST-7 (unit tests)
                  └── ST-8 (microservice doc)
```

**Critical path:** ST-1 → ST-3 + ST-6 → ST-2 → [ST-4, ST-5, ST-7, ST-8] in parallel.

ST-5 edits `docs/agents/cowork-team/flow/main.md`. If agent-father review is required for the flow doc change, dev-mcp-server submits the change and agent-father reviews before merge. This is a purely additive edit (new step + JUMP-TO row).

---

## 8. Acceptance-Test Outline (G1 / G2 / G3)

### AT-G1: Rebuild Verify (ops → DEV signal path)

**Precondition:** `schedule_task` callable via gateway.

1. Call `schedule_task({delay_seconds: 1200, agent: "ops", intent: "verify-mcp-server-rebuild-healthy", prompt: "...", deadline_at: now+3600, dedup_key: "rebuild-verify-mcp-server-test1", reason: "post-rebuild health gate"})`.
2. Verify: returns `{status: "pending", team: "DEV", dedup_existed: false}`.
3. Verify: `SELECT typeof(fire_at) FROM scheduled_tasks WHERE id=<id>` returns `'integer'`.
4. Advance clock past `fire_at` (test: insert with `fire_at=now-10`).
5. Run `claim_due_scheduled_tasks(nowEpoch)` — row transitions to `firing`.
6. deadline gate: `deadline_at=now+3600` → not expired, proceed.
7. team=DEV → orch-apply.sh emits signal row. Verify: `bash scripts/orch-apply.sh` exits 0, Zod tri-point passes, signal_queue has the new row.
8. `complete_scheduled_task(id, "fired")`.
9. `list_scheduled_tasks({status:"fired"})` returns the row with `fired_at` non-null and `sweep_tick` non-null.
10. Second call with same `dedup_key` → returns `dedup_existed: true`, no new row.

### AT-G2: FOMC Anchor (market-watcher → COWORK spawn path)

1. Call `schedule_task({fire_at: 1753898700, agent: "market-watcher", intent: "fomc-release-2026-07-30", prompt: "...", deadline_at: 1753912800, dedup_key: "fomc-2026-07-30", reason: "FOMC release impact analysis"})`.
2. Verify: `team: "COWORK"`.
3. Sweeper runs at `fire_at` (test: insert with `fire_at=now-10`, `deadline_at=now+14400`).
4. `claim_due_scheduled_tasks` → row in `firing`.
5. Deadline check: `now < deadline_at` → not expired.
6. PRE-CLAIM: `task_claim({task_id:"intent:one-shot:<id>", task_kind:"intent"})` → `claimed: true`.
7. Agent spawn succeeds (test mode: verify PRE-CLAIM happened; actual Agent() call optional in unit test).
8. `task_release` called.
9. `complete_scheduled_task(id, "fired")`.
10. **Stale-sweep guard test:** Insert row with `fire_at=now-1000, deadline_at=now-100` → sweeper claims it → deadline gate: `now > deadline_at` → `expire_scheduled_task(id)`. `list_scheduled_tasks({status:"expired"})` shows row. No spawn, no signal.

### AT-G3: Bug Re-probe (system-auditor → DEV signal path)

1. Call `schedule_task({delay_seconds: 5400, agent: "system-auditor", intent: "re-probe-bug-TASK-2043", prompt: "...", deadline_at: now+14400, dedup_key: "bug-reprobe-TASK-2043", reason: "Post-fix re-probe for TASK_2043"})`.
2. Verify: `team: "DEV"` (system-auditor is explicitly DEV per PO decision journal — excluded from cowork dispatcher).
3. Sweeper drains at fire_at → DEV path → signal_queue row emitted via orch-apply.sh.
4. `list_scheduled_tasks({status:"fired"})` shows row with `fired_at` set.

### AT-Unit: DDL Invariants (ST-7)

Five mandatory unit tests in `apps/mcp-server/src/__tests__/scheduledTasks.test.ts`:

| Test | AC |
|---|---|
| `typeof(fire_at)` in sqlite_master = integer | AC-1 |
| `SELECT sql FROM sqlite_master WHERE name='scheduled_tasks'` contains `UNIQUE` on `dedup_key` | AC-2 |
| Insert `{fire_at=now-10, deadline_at=now-5}` → sweeper expires, does NOT route | AC-3 |
| `dedup_key` collision → existing id returned, no duplicate row inserted | (idempotency) |
| Two concurrent `claim_due_scheduled_tasks` calls → each row claimed exactly once | (atomicity) |

---

## 9. Open Questions / Blockers for PO

**No blocking PO decisions required.** The architect brief is LOCKED with the user. All design decisions were made in the brief (§b–h) and confirmed in the PO decision journal.

The following items are noted as implicit/advisory (dev-mcp-server should confirm with brief):

**Q1 (implicit — non-blocking):** `done` vs `fired` terminal state. The brief's status CHECK enum includes both `done` and `fired`. The sweeper pseudocode sets `status='fired'` after routing. When does a row transition to `done`? The brief does not define a separate caller-confirmation callback (Phase-2). **Recommended resolution:** MVP treats `fired` as the terminal state for the sweeper path. `done` is available for a future Phase-2 confirmation mechanism. Dev-mcp-server should not add a `mark_task_done` MCP tool in MVP.

**Q2 (implicit — non-blocking):** `claim_due_scheduled_tasks` — should it be exposed as a gateway-reachable MCP tool or remain a pure internal TypeScript function? The brief says "NOT exposed as an MCP tool" (§c). The sweeper in Step 0b.3 calls it as a tool via `call_tool(server="vn-market", tool="claim_due_scheduled_tasks")`. If it is NOT registered in the bootstrap, the flow step cannot call it via the gateway. **Recommended resolution:** `claim_due_scheduled_tasks` is registered in the mcp-server tool registry (reachable only by cowork-team in Step 0b.3) but excluded from the public-facing tool packages so ordinary agents cannot invoke it. Dev-mcp-server must decide registration scope and document it in ST-8. This is an implementation detail, not a design reversal.

**Q3 (implicit — non-blocking):** Long `prompt` payloads — the brief mentions a companion file at `docs/signals/one-shot-<task.id>.json` when the prompt is long. What is the length threshold triggering a companion file vs embedding in the signal row summary? **Recommended resolution:** If `prompt.length > 500 chars`, write companion file and set `payload_ref`. Otherwise embed. Dev-mcp-server can pick the threshold and document it in ST-8.

---

## 10. Microservice Doc Update (ST-8)

`docs/architecture/microservice/mcp-server/` must record:
- New `scheduled_tasks` table schema (columns, indexes, lifecycle)
- Three new MCP tools (`schedule_task`, `cancel_scheduled_task`, `list_scheduled_tasks`)
- Internal helpers (not MCP-exposed): `claim_due_scheduled_tasks`, `complete_scheduled_task`, `expire_scheduled_task`, `fail_scheduled_task`
- Addressed-not-picked routing model (team sealed at insert, sweeper routes to intake)
- Phase-2 honest caveat: one-shots fire only while cowork loop is live; 24/7 headless = Phase-2

---

## 11. Handoff Summary

| ST | Zone | Owner | Depends | AC gates |
|---|---|---|---|---|
| ST-1 | `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` | dev-mcp-server | — | AC-1, AC-2, AC-7, AC-11 |
| ST-3 | `apps/mcp-server/src/infrastructure/db/` | dev-mcp-server | ST-1 | AC-1, AC-3, AC-7 |
| ST-6 | `apps/mcp-server/src/` | dev-mcp-server | ST-1 | AC-8 |
| ST-2 | `apps/mcp-server/src/interface/mcp/tools/system/scheduledTaskTools.ts` | dev-mcp-server | ST-1, ST-3, ST-6 | AC-8, AC-9, AC-10, AC-12 |
| ST-4 | `apps/mcp-server/src/` (agentBootstrap.ts) | dev-mcp-server | ST-2 | — |
| ST-5 | `docs/agents/cowork-team/flow/main.md` | dev-mcp-server | ST-3, ST-2 | AC-3, AC-4, AC-5, AC-6, AC-7 |
| ST-7 | `apps/mcp-server/src/__tests__/scheduledTasks.test.ts` | dev-mcp-server | ST-1, ST-3, ST-2 | AC-1, AC-2, AC-3 |
| ST-8 | `docs/architecture/microservice/mcp-server/` | dev-mcp-server | ST-2 | AC-9 |

**PO sign-off status:** APPROVED 2026-06-29T20:56:06Z (see §0.1 PO Review Directives D1/D2/D3)
**Next in chain:** pm (atomic task breakdown) → dev-mcp-server → **qa**

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` — ST-1 Migration 4 DDL + ST-3 internal helpers (+350L)
  - `apps/mcp-server/src/interface/mcp/tools/system/scheduledTaskTools.ts` — ST-2 7 MCP tools (NEW, +380L)
  - `apps/mcp-server/src/interface/mcp/tools/system/agentTeamMap.ts` — ST-6 AGENT_TEAM_MAP (NEW, +75L)
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — ST-4 register scheduledTaskTools (+2L)
  - `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` — ST-4 add 3 public tools to dev_team + unified_coordinator (+9L)
  - `docs/agents/cowork-team/flow/main.md` — ST-5 Step 0b.3 inline + JUMP-TO row (+60L)
  - `docs/architecture/microservice/mcp-server/system.md` — ST-8 full DTS section (+70L)
  - `docs/data/tool-registry.json` — regenerated (173 tools)
  - `docs/data/project-stats.json` — toolCount 166→173
  - `docs/data/orch/orch-state.json` — all DTS-ST* DONE, head→qa
- **Tests written:** `apps/mcp-server/src/__tests__/scheduledTasks.test.ts` — 23 assertions, all GREEN
- **Git commits:** 588b1031, 4847cab1
- **Type check:** clean (bun tsc --noEmit)
- **bun test:** 125 pass / 0 fail (core coordination + registry + scheduled-tasks suite)
- **Tool count:** 173 tools — 168 old + 7 new (+3 public, +4 privileged gateway-only)
- **Scheduler count:** 2 cron.schedule entries — unchanged
- **Docs updated:** `docs/architecture/microservice/mcp-server/system.md` — new DTS section | `docs/agents/cowork-team/flow/main.md` — Step 0b.3
- **AC gate coverage:**
  - AC-1: fire_at = INTEGER (verified in test: typeof(fire_at)='integer')
  - AC-2: dedup_key UNIQUE in CREATE TABLE sql (verified in test: sqlite_master sql contains UNIQUE)
  - AC-3: deadline expiry — fire_at=now-10,deadline_at=now-5 → expires not routes (test passes)
  - AC-4: Step 0b.3 is inside recurring */15 cron in cowork-team flow doc
  - AC-5: COWORK path claims intent:one-shot:<id> (task_kind=intent) in step 0b.3 doc
  - AC-6: DEV path uses orch-apply.sh with --argjson bound vars (doc + code)
  - AC-7: no new task_kind on task_locks (reuses intent + sprint-task)
  - AC-8: AGENT_TEAM_MAP sourced from roster; unknown agent → error (test passes)
  - AC-9: Phase-2 caveat in schedule_task description
  - AC-10: list_scheduled_tasks returns sweep_tick/fired_at/error/status (test passes)
  - AC-11: terminal set = {fired,failed,expired,cancelled} (tests pass; fired is D1 success state)
  - AC-12: schedule_task writes only scheduled_tasks (no orch-state.json write at insert)
  - D1: terminal success = 'fired'; done reserved for Phase-2; no mark_task_done tool
  - D2: 4 helpers registered in server (gateway-reachable by sweeper) but absent from public SKILL_MANIFEST packages
  - D3: DEV signal path ALWAYS writes companion file docs/signals/one-shot-<id>.json, payload_ref set, full prompt never in summary
- **Graphify:** skipped (no SSOT knowledge-graph docs impacted)
