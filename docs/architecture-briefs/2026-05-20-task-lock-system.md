# Architecture Brief — SQLite Task-Lock System for Multi-Session Collision Prevention

**Date:** 2026-05-20
**Author:** agents-architect
**Status:** READY FOR IMPLEMENTATION
**Signal:** `docs/signals/task-lock-system-20260520.json` → agent-father

---

## Problem Statement

The user runs multiple Claude Code terminal sessions on the same machine. Each session independently schedules and fires the cowork-team and dev-team master dispatchers. Today there is no coordination layer between sessions:

- Both sessions fire `cowork-team/main.md` at the same `*/15` tick, spawning duplicate news-scout, market-watcher, and other cowork agents that do identical work and emit duplicate signals.
- Both sessions read `docs/signals/DASHBOARD.md` and mark the same `NEW` row `READ`, causing two agents to process the same cross-team signal.
- Both sessions claim the same `pending` TASKS.md row, resulting in conflicting commits and double-executed sprint work.
- A crashed session leaves a claimed task with no release. Without TTL enforcement, the task is permanently deadlocked.

The existing `scheduler_locks` table in `market.db` (`apps/mcp-server/src/infrastructure/db/schedulerLockStore.ts`) solves intra-session cron double-fire via a `job_name PRIMARY KEY` pattern. It does NOT span Claude Code sessions, does not carry a heartbeat, and does not discriminate between cowork-slot, sprint-task, and dashboard-row claim kinds. The new system extends this concept cross-session.

**Scope of collision risk (priority order):**
1. cowork-slot — highest frequency, fires every 15 min, no lock exists today
2. dashboard-row — medium frequency, NEW rows consumed by whichever session wakes first
3. sprint-task — low frequency, but highest cost collision (conflicting commits)

---

## §1 — Scope: Three Lock Kinds

One table, three `task_kind` discriminators. Identical semantics across all three.

| Kind | `task_id` format | Example | Collision scenario today |
|---|---|---|---|
| `cowork-slot` | `cowork-slot:<slot_id>:<nominal_tick>` | `cowork-slot:news-scout-pre-market:20260520T140000Z` | Two sessions fire same slot at same */15 tick |
| `sprint-task` | `task:<task_id>` | `task:1954b` | Two dev-* agents claim same TASKS.md row |
| `dashboard-row` | `dash:<recipient>:<row_id>` | `dash:po:1954-A-29-1` | Two drain-signals.md runs consume same NEW row |

The `<nominal_tick>` in `cowork-slot` is the rounded-down UTC minute (e.g. `14:00:00Z` for any fire between 14:00 and 14:14 inclusive). This is already computed by `.claude/scripts/cowork-match-slots.js` as `drift_min`; nominal_tick = fire_time minus drift_min seconds.

---

## §2 — Schema

### Database Decision: New `coordination.db`

**Recommendation: new dedicated `coordination.db` at `/app/data/coordination.db`.**

Rationale:
- `market.db` is the largest DB in the system (used by 5 microservices, contains all market intelligence). Adding cross-session agent coordination write traffic would introduce contention on the most critical path. The existing `scheduler_locks` table is intra-process only; it never handles concurrent writers from separate OS processes.
- Isolation: if `coordination.db` corrupts or is deleted, market data and all analytics are unaffected. Fail-loud fallback (§8) refuses all claims and logs BUG — duplicate work is the worst case, not data loss.
- Dedicated DB can use `journal_mode=WAL` + `synchronous=NORMAL` tuned for low-latency concurrent reads from multiple sessions. `market.db` WAL checkpoint job already runs every 30 min per `walCheckpointAlert` cron.
- Simpler migration path: zero risk to existing schema slices.

**Alternative rejected:** extending `market.db` via a new `schema-coordination.ts` slice. Rejected because the coordination write path originates from Claude Code agent sessions (outside the Docker container boundary), not from the mcp-server process. `coordination.db` must be accessible from the host filesystem, reachable by both MCP tool handlers (inside Docker via shared volume `/app/data/`) and potentially direct `bun:sqlite` reads by scripts.

### Table DDL

```sql
-- Migration file: apps/mcp-server/src/infrastructure/db/migrations/20260520-coordination-task-locks.sql

CREATE TABLE IF NOT EXISTS task_locks (
  task_id          TEXT    NOT NULL,
  task_kind        TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row')),
  owner_session    TEXT    NOT NULL,   -- Claude Code session UUID, injected server-side
  owner_agent      TEXT    NOT NULL,   -- agent name, e.g. "cowork-team", "dev-mcp-server"
  claimed_at       INTEGER NOT NULL,   -- Unix epoch seconds UTC
  expires_at       INTEGER NOT NULL,   -- claimed_at + ttl_seconds
  heartbeat_at     INTEGER NOT NULL,   -- last successful heartbeat epoch seconds
  ttl_seconds      INTEGER NOT NULL DEFAULT 3600,
  payload          TEXT,               -- JSON blob: {slot_id?, task_title?, row_hash?, notes?}
  PRIMARY KEY (task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON task_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_task_locks_kind_agent ON task_locks(task_kind, owner_agent);
```

**Column notes:**
- `task_id` encodes kind implicitly (prefix), but `task_kind` is kept explicit for filtered queries (e.g. `task_list_held(kind='cowork-slot')`).
- `owner_session` is the Claude Code session UUID. The MCP gateway reads this from the transport context at request time (see §6). Agents cannot self-report session UUID — server injects it.
- `expires_at` and `heartbeat_at` both use Unix epoch integers (not ISO strings) to enable arithmetic comparisons without `strftime` overhead. SQLite stores them as INTEGER, comparisons are exact.
- `payload` is opaque JSON; no schema enforced at DB layer. Agents store enough context to resume or log collision details.

---

## §3 — Atomic Claim Protocol

No SELECT then UPDATE race window. All logic runs in two parameterized SQL statements, one after the other, relying on SQLite's file-level mutex for atomicity.

**Step 1 — Attempt INSERT:**
```sql
INSERT OR IGNORE INTO task_locks
  (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds, payload)
VALUES
  (?, ?, ?, ?, unixepoch('now'), unixepoch('now') + ?, unixepoch('now'), ?, ?)
;
```
Check `changes()` (SQLite rows-affected count):
- `changes() = 1` → claim succeeded. Return `{claimed: true}`.
- `changes() = 0` → row already exists. Proceed to stale-steal check.

**Step 2 — Stale-steal attempt (only if Step 1 returned 0):**
```sql
UPDATE task_locks
SET
  owner_session = ?,
  owner_agent   = ?,
  claimed_at    = unixepoch('now'),
  expires_at    = unixepoch('now') + ?,
  heartbeat_at  = unixepoch('now'),
  ttl_seconds   = ?
WHERE
  task_id    = ?
  AND expires_at < unixepoch('now')
;
```
Check `changes()`:
- `changes() = 1` → stale lock stolen. Return `{claimed: true, stolen: true}`.
- `changes() = 0` → lock is genuinely held (not yet expired). Read current holder for response.

**Step 3 — Read current holder (only if steal also returned 0):**
```sql
SELECT owner_session, owner_agent, claimed_at, expires_at, heartbeat_at
FROM task_locks
WHERE task_id = ?
;
```
Return `{claimed: false, current_holder: {owner_session, owner_agent, claimed_at, expires_at, heartbeat_at}}`.

**Why this is race-free:** SQLite's WAL mode allows concurrent readers but serializes writers at the file level. Both sessions attempting INSERT OR IGNORE on the same `task_id` at the same instant: one INSERT wins (changes=1), the other sees changes=0 and enters the steal path. The steal UPDATE's `WHERE expires_at < now` predicate ensures only a genuinely stale lock is overwritten. The two statements are not in a transaction — this is intentional. An aborted INSERT leaves no partial row. An aborted UPDATE leaves the original row intact (still held by original claimer). This matches the semantic goal: when in doubt, refuse the claim.

---

## §4 — Heartbeat Protocol

**Cadence:** every 5 minutes while the task is in-flight.

**Mechanism:** The agent flow is responsible for heartbeating. Agents running long cycles (cowork agents average 10–20 min; dev-* agents can run 30–60 min) must call `task_heartbeat` on a 5-min cadence. This is a "prove-alive" signal, not a progress report.

**SQL:**
```sql
UPDATE task_locks
SET
  heartbeat_at = unixepoch('now'),
  expires_at   = unixepoch('now') + ttl_seconds
WHERE
  task_id      = ?
  AND owner_session = ?
;
```

The `AND owner_session = ?` predicate is a safety guard: if the lock was stolen by another session (edge case: crash then restart within TTL window), the heartbeat UPDATE quietly affects 0 rows, which the agent detects as a stolen-lock signal (see §8).

**Cadence implementation:** agents use a Claude Code `ScheduleWakeup` or a mid-cycle loop checkpoint. For cowork agents, the recommended pattern is: after each major processing step (e.g. after fetching news, before writing signals), call `task_heartbeat` if more than 5 min have elapsed since last heartbeat. No background thread is needed.

**Lost heartbeat consequence:** if no heartbeat arrives within `ttl_seconds` (1h default), `expires_at` passes. The next claimer's steal UPDATE succeeds. Worst case is duplicate work for the remaining portion of the task.

---

## §5 — Release Protocol

**Normal completion:**
```sql
DELETE FROM task_locks
WHERE task_id     = ?
  AND owner_session = ?
;
```
The `AND owner_session = ?` scoped delete prevents one session from accidentally releasing another session's lock. If `changes() = 0`, the lock was already stolen or expired — log at DEBUG level, not an error.

**Crash (no explicit release):** TTL expiry handles it. No distributed garbage collection needed. The next claimer stealing a stale lock is the recovery mechanism.

**Stale lock sweep (optional maintenance):** A weekly cleanup of rows where `expires_at < unixepoch('now') - 86400` (more than 24h expired) can be added to the existing `dataAuditWeekly` cron. This prevents unbounded table growth. Not required for correctness.

---

## §6 — MCP Tools

All four tools live in `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` and are exported from `apps/mcp-server/src/interface/mcp/tools/system/index.ts`.

**Session UUID injection:** The MCP server has access to the transport layer session context at request dispatch time. The `owner_session` field is populated from this context — agents pass `owner_agent` (their name), and the server stamps `owner_session` from the request session ID. This prevents spoofing: an agent cannot claim to be another session.

### Tool 1: `task_claim`

```
tool:         task_claim
description:  Claim a coordination lock before starting exclusive work. Returns whether
              the claim succeeded and, on failure, who currently holds the lock.
input:
  task_id     string  required  Globally unique lock ID. Format per §1 (cowork-slot:..., task:..., dash:...)
  task_kind   string  required  One of: cowork-slot | sprint-task | dashboard-row
  owner_agent string  required  Agent name, e.g. "cowork-team", "dev-mcp-server"
  ttl_seconds integer optional  Lock TTL in seconds. Default 3600 (1h). Min 60. Max 86400.
  payload     string  optional  JSON string with extra context (slot_id, task_title, row_hash)
output:
  {
    claimed:        boolean,
    stolen?:        boolean,              // true if a stale lock was replaced
    current_holder?: {                    // present only when claimed=false
      owner_session: string,
      owner_agent:   string,
      claimed_at:    number,             // Unix epoch
      expires_at:    number,
      heartbeat_at:  number
    }
  }
```

### Tool 2: `task_heartbeat`

```
tool:         task_heartbeat
description:  Renew a held lock to prove the owning session is still alive. Call every
              5 minutes during long-running tasks. A missed heartbeat after ttl_seconds
              allows the next claimer to steal the lock.
input:
  task_id     string  required
output:
  {
    ok:          boolean,   // false = lock not found or owner_session mismatch (stolen)
    expires_at:  number     // new expiry Unix epoch, or 0 if ok=false
  }
```

### Tool 3: `task_release`

```
tool:         task_release
description:  Release a coordination lock on task completion. Scoped to the calling
              session — cannot release another session's lock.
input:
  task_id     string  required
output:
  {
    ok:      boolean   // false = lock not found or session mismatch (already expired/stolen)
  }
```

### Tool 4: `task_list_held`

```
tool:         task_list_held
description:  List currently held task locks. For debugging, auditing, and stale-lock
              monitoring. Does not modify any locks.
input:
  kind        string  optional  Filter by task_kind
  owner_agent string  optional  Filter by owner_agent
  expired     boolean optional  If true, return only locks where expires_at < now
output:
  {
    locks: [{
      task_id:      string,
      task_kind:    string,
      owner_session: string,
      owner_agent:  string,
      claimed_at:   number,
      expires_at:   number,
      heartbeat_at: number,
      ttl_seconds:  number,
      payload:      string | null
    }],
    count: number
  }
```

---

## §7 — Flow Integration Changes

### `.claude/flows/cowork-team/main.md` — insert Step 4.6

**Insertion point:** between Step 4b (collision-detection guard) and Step 5 (parallel fan-out).

**New Step 4.6 — Lock cowork slots before spawning:**

```
For each slot in MATCHES:
  slot_key = "cowork-slot:" + slot.slot_id + ":" + nominal_tick
    where nominal_tick = ISO8601 of (NOW_ISO rounded down to slot's cron minute)

  result = task_claim(
    task_id     = slot_key,
    task_kind   = "cowork-slot",
    owner_agent = "cowork-team",
    ttl_seconds = 900,          // 15 min — one scheduler cycle; cowork slots must complete before next fire
    payload     = JSON({slot_id: slot.slot_id, flow_path: slot.flow_path, fire_time: NOW_ISO})
  )

  if result.claimed = false:
    send_telegram(channel=work, "[cowork-team] SKIP " + slot.slot_id + " — held by session " + result.current_holder.owner_session[0:8] + " expires " + result.current_holder.expires_at)
    remove slot from MATCHES (do not spawn)
    continue

After filtering, proceed to Step 5 with remaining (unclaimed) slots.
```

**Note on TTL for cowork-slot:** 900 seconds (15 min) is the right TTL here, not 1h. A cowork slot runs within one 15-min scheduler window. If the session that claimed the slot dies, the next scheduler tick (15 min later) will naturally get a fresh nominal_tick and a fresh lock key. No stale-steal needed for this kind. However, the TTL still protects against the edge case where a session stalls and the slot key persists past the next tick calculation.

**Nominal tick calculation (add to flow):**
```bash
NOMINAL_TICK=$(node -e "
  const now = new Date('${NOW_ISO}');
  // Match the slot's cron minute pattern; cowork-match-slots.js already knows drift_min
  const driftMin = ${DRIFT_MIN};
  const nominal = new Date(now.getTime() - driftMin * 60000);
  nominal.setSeconds(0, 0);
  process.stdout.write(nominal.toISOString().replace(/[-:\.]/g,'').replace('Z','Z').substring(0,16) + '00Z');
")
```

### `.claude/flows/dev-team/drain-signals.md` — insert in Step 0a-D before marking NEW→READ

**Insertion point:** after identifying a NEW row, before `NEW → READ` mark.

```
For each NEW row in DASHBOARD.md:
  row_key = "dash:" + section_name + ":" + row.id

  result = task_claim(
    task_id     = row_key,
    task_kind   = "dashboard-row",
    owner_agent = "dev-team",
    ttl_seconds = 1800,         // 30 min — enough for drain + PO triage cycle
    payload     = JSON({row_id: row.id, from: row.from, type: row.type})
  )

  if result.claimed = false:
    // Another session is processing this row — skip without marking READ
    log: "[dev-team] SKIP dashboard row " + row.id + " — held by " + result.current_holder.owner_agent
    continue  // Do NOT add to pendingSignals[], do NOT mark READ

  // Claim succeeded — proceed with existing drain logic
  mark row NEW → READ
  append to pendingSignals[]
  // On drain complete, task_release(row_key) — scoped to this session
```

**Same pattern applies in `.claude/flows/cowork-team/main.md` Step 0a** for cowork-addressed sections (po, tran-ngoc-bau, unified-agent, alert-commander rows).

### Developer agent — sprint-task claim (`.claude/flows/developer/main.md` or execute-tier equivalent)

**Insertion point:** wherever a developer or dev-* agent picks up a TASKS.md row and sets `status=in_progress`.

```
Before setting status=in_progress on task <task_id>:

  result = task_claim(
    task_id     = "task:" + task_id,
    task_kind   = "sprint-task",
    owner_agent = <current_agent_name>,   // e.g. "dev-mcp-server"
    ttl_seconds = 3600,                   // 1h default per user ask
    payload     = JSON({task_title: row.title, zone: row.zone})
  )

  if result.claimed = false:
    log: "[<agent>] SKIP task " + task_id + " — already claimed by " + result.current_holder.owner_agent
    + " (expires " + new Date(result.current_holder.expires_at * 1000).toISOString() + ")"
    send_telegram(channel=work, "[<agent>] Task " + task_id + " collision — skipped. Held by: " + result.current_holder.owner_agent)
    move to next available task
    continue

  // Claim succeeded — proceed with status=in_progress update
```

**Heartbeat during long tasks (all agents doing sprint work):**
```
Every 5 minutes of active work:
  hb = task_heartbeat(task_id = "task:" + task_id)
  if hb.ok = false:
    // Lock was stolen — another session took over (crash recovery scenario)
    send_telegram(channel=bug, "[<agent>] ABORT task " + task_id + " — lock stolen mid-task. Committing partial state.")
    commit any safe partial state
    EXIT task (do not mark done)
```

**On completion:**
```
  task_release(task_id = "task:" + task_id)
  then: update TASKS.md status=done
```

---

## §8 — Failure Modes

### F1: Heartbeat fails (coordination.db locked or unavailable)

Retry 3 times with exponential backoff: 1s, 2s, 4s.

If all 3 fail:
- `send_telegram(channel=bug, "[<agent>] heartbeat failed for task:<id> after 3 retries — lock will auto-expire in <remaining>s. Continuing work (duplicate risk).")`
- Continue work. The lock will expire on TTL. Worst case: another session picks up the task after TTL — duplicate work occurs for the tail of the task, not data corruption.

Do NOT abort the task on heartbeat failure. The heartbeat is a liveness signal, not a gate.

### F2: Stolen lock detected mid-task (heartbeat UPDATE changes()=0)

This means another session stole the lock (which only happens after TTL expiry, i.e. this session was already assumed crashed). The stale-steal by the other session is the recovery path working correctly.

- Commit any partial state that is idempotent (e.g. partial TASKS.md updates with clear status notes).
- `send_telegram(channel=bug, "[<agent>] Lock stolen on task:<id> mid-execution — session assumed crashed by peer. Partial state committed. Aborting.")`
- EXIT immediately. Do NOT fight the steal — the other session now owns the task.

### F3: DB corruption on `coordination.db`

Follow `docs/protocols/fail-loud-protocol.md`:
- `send_telegram(channel=bug, "[<agent>] coordination.db corrupt — failing loud. All task claims refused.")`
- Return `{claimed: false}` from ALL claim attempts (fail-refuse-all mode).
- Do NOT fall back to an in-memory lock or a file-based lock — those would not span processes.
- Effect: agents run without collision protection. Duplicate work is the degraded mode. Market data is unaffected.

Detection: any `SQLITE_CORRUPT`, `SQLITE_NOTADB`, or unreadable DB on `task_claim` → switch to refuse-all mode for the duration of the server process.

### F4: Clock skew between terminals

No risk. Both sessions run on the same macOS host. System clock is shared. `unixepoch('now')` in SQLite returns the same value regardless of which session calls it. If Docker container clock drifts from host: MCP tools run inside Docker, so all coordination.db writes use the container clock consistently.

### F5: `coordination.db` does not exist yet (Phase 1 not deployed)

Agents calling `task_claim` receive a tool-not-found or DB-not-open error. Fail mode is identical to F3: refuse-all mode. Agents log BUG and continue without locking. No agent should hard-fail if coordination tools are absent during the Phase 1 window.

---

## §9 — Migration & Rollout

### Phase 1 — DB + MCP tools only (no flow changes)

**Goal:** Ship `coordination.db` and the 4 tools. Validate that the tools can be called from agent sessions and that `INSERT OR IGNORE` + steal UPDATE work correctly under concurrent writers.

**Deliverables:**
- Migration SQL file
- `coordinationTools.ts` with 4 tool handlers
- `coordinationStore.ts` (DB layer in `infrastructure/db/`)
- Registration in `system/index.ts`
- `docs/data/system-map.json` updated with `coordination.db` entry
- `docs/standards/mcp-tools.md` updated with 4 tool entries
- `docs/protocols/task-lock-protocol.md` created

**Validation:** call `task_claim`, verify claim/skip logic, call `task_release`, verify row deleted. Can be done manually or via a new test file.

### Phase 2 — cowork-team slot locking

**Goal:** eliminate the highest-frequency collision (two sessions firing the same 15-min slot).

**Deliverables:**
- `.claude/flows/cowork-team/main.md` Step 4.6 inserted
- `.claude/tools/package/cowork-team.md` updated with `task_claim`, `task_heartbeat`, `task_release`
- Observe: after next 24h of dual-session operation, `docs/signals/` should show zero duplicate `cowork-fire` signals for the same slot at the same nominal_tick

### Phase 3 — dev-team task + dashboard-row locking

**Goal:** eliminate sprint-task double-claim and dashboard-row dual-drain.

**Deliverables:**
- `.claude/flows/dev-team/drain-signals.md` Step 0a-D updated with dashboard-row claim
- Developer/dev-* agent flow (wherever sprint-task status=in_progress is set) updated with task claim + heartbeat + release
- `.claude/tools/package/` updated for all dev-* agents
- Heartbeat pattern documented in a shared agent skill: `.claude/skills/task-lock/SKILL.md`

Each phase is a separate sprint task. Phase 1 is the unblock for Phases 2 and 3.

---

## §10 — Implementation Checklist for agent-father

**Read before acting:**
- Existing tool directory structure (confirmed at brief authoring time):
  - Tools: `apps/mcp-server/src/interface/mcp/tools/system/` (matches pattern: `*Tools.ts`, `index.ts`)
  - DB layer: `apps/mcp-server/src/infrastructure/db/` (flat directory, `*Store.ts` pattern)
  - No `tools/coordination/` subdirectory exists — place coordination tools in `system/` to match existing pattern. Name: `coordinationTools.ts`.
- Existing `schedulerLockStore.ts` — new `coordinationStore.ts` is a sibling, NOT a replacement. `schedulerLockStore.ts` remains for intra-process cron dedup.

**File list (exactly, no guessing):**

| File | Action | Notes |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/migrations/20260520-coordination-task-locks.sql` | CREATE | DDL per §2 |
| `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` | CREATE | Claim, heartbeat, release, list functions using `bun:sqlite`. Opens `coordination.db` as a separate DB instance. |
| `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` | CREATE | 4 tool registrations: `task_claim`, `task_heartbeat`, `task_release`, `task_list_held`. Session UUID injected from transport context. |
| `apps/mcp-server/src/interface/mcp/tools/system/index.ts` | EDIT | Add `export { registerCoordinationTools } from "./coordinationTools.js"` |
| `apps/mcp-server/src/interface/mcp/server.ts` | EDIT | Register `registerCoordinationTools(server)` in the tool registration block |
| `docs/standards/mcp-tools.md` | EDIT | Add 4 tool rows to the Tools Per Agent table (available to all agents). Tool count: do NOT hardcode — reference `docs/data/project-stats.json#toolCount` as SSOT. |
| `docs/data/system-map.json` | EDIT | Add to `infrastructure.databases[]`: `{ "id": "coordination", "engine": "sqlite", "path": "/app/data/coordination.db", "used_by": ["mcp-server"], "purpose": "cross-session agent task lock coordination" }` |
| `docs/protocols/task-lock-protocol.md` | CREATE | Contract doc for agents: claim/heartbeat/release sequence, TTL table, failure modes. Load trigger: any agent implementing task locks. ~60 lines. |
| `.claude/skills/task-lock/SKILL.md` | CREATE | Agent-callable skill for claim/heartbeat/release pattern. Agents lazy-load this when doing long tasks. ~40 lines. |
| `.claude/tools/package/cowork-team.md` | EDIT | Add `task_claim`, `task_heartbeat`, `task_release` (Phase 2) |
| `.claude/tools/package/dev-mcp-server.md` | EDIT | Add `task_claim`, `task_heartbeat`, `task_release`, `task_list_held` (Phase 3) |
| `.claude/tools/package/<all-other-dev-*-agents>.md` | EDIT | Add `task_claim`, `task_heartbeat`, `task_release` (Phase 3) — dev-api-gateway, dev-stock-price, dev-technical-analysis, dev-macro-indicators, dev-kinh-dich, dev-alert-engine, dev-pdf-extractor, dev-rag-service, dev-frontend |
| `.claude/flows/cowork-team/main.md` | EDIT | Insert Step 4.6 per §7 (Phase 2) |
| `.claude/flows/dev-team/drain-signals.md` | EDIT | Step 0a-D dashboard-row claim per §7 (Phase 3) |
| Developer / dev-* execute flow | EDIT | Sprint-task claim + heartbeat + release per §7 (Phase 3) — agent-father to identify exact insertion point in `execute-tier.md` or equivalent |

**`coordinationStore.ts` — key implementation notes for agent-father:**
- Open `coordination.db` as a separate `Database` instance from `market.db`. Use `DATABASE_PATH` env var pattern similar to existing DB init, resolved to `/app/data/coordination.db`.
- Expose `ensureCoordinationTable(db)`, `claimTask(...)`, `heartbeatTask(...)`, `releaseTask(...)`, `listHeldTasks(...)` functions.
- All SQL uses parameterized queries (no string interpolation). Mirror `schedulerLockStore.ts` patterns.
- `claimTask` runs the two-statement protocol from §3: INSERT OR IGNORE then (if changes=0) UPDATE WHERE expires_at < unixepoch('now'). Return discriminated union result.
- `coordinationStore.ts` must handle DB-unavailable by returning `{claimed: false, error: 'db_unavailable'}` — never throw to the tool handler in production.

**`coordinationTools.ts` — session UUID injection:**
The MCP SDK provides request context via the `RequestHandlerExtra` parameter on tool handlers. The `sessionId` is available on the transport session object. Pattern to follow: look at how `server.ts` routes requests — the session context is accessible at the handler level. If session UUID is not available from SDK context in the current transport version, fall back to a stable hash of the process PID + startup timestamp as a session discriminator. Document the fallback in the tool's inline comment.

---

## §11 — NEXT Directive

```
NEXT: agent-father | implement Phase 1 (coordination.db + 4 MCP tools) immediately.
      Phase 2 + Phase 3 as follow-on sprint tasks under pm triage.
```

Rationale for routing to agent-father (not pm): Phase 1 is a pure infrastructure addition — new DB, new tool file, 2 edit-file changes (index.ts + server.ts), 3 new doc files. No flow changes, no agent behavior changes, no sprint risk. agent-father can ship Phase 1 in one dev cycle. PM routing would add a sprint planning round-trip for a task with no ambiguous requirements.

Phase 2 and Phase 3 involve editing live flows and agent tool packages — those carry regression risk and should be sprint tasks so QA can verify each phase before the next lands.

---

## Context References

- `docs/data/system-map.json` — DB list (6 existing SQLite DBs; `coordination.db` is #7)
- `apps/mcp-server/src/infrastructure/db/schedulerLockStore.ts` — existing intra-process lock pattern (DO NOT replace)
- `apps/mcp-server/src/interface/mcp/tools/system/` — tool placement location (confirmed)
- `docs/protocols/fail-loud-protocol.md` — DB corruption failure behavior
- `docs/policies/commit-convention.md` — commit format for implementation PRs
- `.claude/flows/cowork-team/main.md` Step 4b and Step 5 — insertion point for Step 4.6
- `.claude/flows/dev-team/drain-signals.md` Step 0a-D — insertion point for dashboard-row claim
- `docs/data/project-stats.json` — tool count SSOT (do not hardcode)
