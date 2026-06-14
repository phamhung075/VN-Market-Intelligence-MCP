# Task-Lock Protocol

<!-- size-justification: ~80L — full claim/heartbeat/release contract + TTL table + failure modes. All agents implementing task locks load this once. Cannot split: phases reference each other. -->

**Load trigger:** any agent implementing task_claim, task_heartbeat, or task_release (lazy, not startup).
**Source:** architecture brief `docs/architecture-briefs/2026-05-20-task-lock-system.md`

---

## Purpose

Prevent multi-session agent collisions when two Claude Code terminals fire the same task concurrently. The lock coordinates via `coordination.db` (a dedicated SQLite DB separate from market.db).

---

## Four Lock Kinds

| `task_kind` | `task_id` format | Example | Default TTL |
|-------------|-----------------|---------|-------------|
| `cowork-slot` | `cowork-slot:<slot_id>:<nominal_tick>` | `cowork-slot:news-scout-pre-market:20260520T140000Z` | 900s (15 min) |
| `sprint-task` | `task:<task_id>` | `task:1954b` | 3600s (1h) |
| `dashboard-row` | `dash:<recipient>:<row_id>` | `dash:po:1954-A-29-1` | 1800s (30 min) |
| `commit-mutex` | `commit-mutex:main` | `commit-mutex:main` (singleton) | 60s |

### commit-mutex

Fleet-wide singleton lock that serializes the `git add → git diff verify → git commit` critical
section. Eliminates the verify→commit race on the shared git index (design brief:
`docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md`).

**Rules:**
- Exactly one row (`commit-mutex:main`) ever exists — singleton per fleet.
- TTL=60s (commit window is 2–10s; 60s provides 6× headroom + crash recovery).
- No heartbeat required (too short to need it; TTL is the crash-recovery mechanism).
- Backoff: exponential + jitter (±20%), 6 retries, ~125s max wait before give-up.
- **Fail-CLOSED (C-2):** if `task_claim` errors (MCP/DB unavailable), SKIP the commit
  entirely — NEVER stage without holding the mutex.
- Give-up action: `send_telegram(channel="bug", ...)` + skip commit + retry next cron tick.
- Full acquire/release protocol: `.claude/skills/commit-mutex/SKILL.md`
- PO ratification: `docs/po-decisions/2026-05-24-commit-mutex-ratification.md` (C-1..C-4)

---

## Claim Grammar

```
BEFORE starting exclusive work:

result = task_claim(
  task_id:     "<kind>:<id>",
  task_kind:   "cowork-slot" | "sprint-task" | "dashboard-row",
  owner_agent: "<your-agent-name>",
  ttl_seconds: <see TTL table above>,
  payload:     JSON({...context})   // optional
)

if result.claimed = false:
  log: "SKIP <task_id> — held by " + result.current_holder.owner_agent
  send_telegram(channel=work, "SKIP <task_id> — held by agent " + result.current_holder.owner_agent)
  → abort this task, move to next

if result.claimed = true:
  → proceed with work
  → call task_heartbeat every 5 min (see below)
  → call task_release on completion (see below)
```

### Session-Singleton Subclass (TTL-only release)

A **session-singleton lock** is a special use of `task_kind: "sprint-task"` that gates an entire cron session — not a single task — against concurrent overlap. Key properties:

- **task_id** is a bare singleton key (e.g. `"dev-team-cron-singleton"`) rather than `"task:<id>"`.
- **TTL-only release semantic:** no `owner_session` binding. The lock is held purely by TTL clock. This is intentional: a cron session's session-id changes after an mcp-server restart, making owner-session matching unreliable for the full 60–90 min session window.
- **`task_release` returning `ok:false` after an mcp-server restart is EXPECTED and NOT an error.** The lock was either already expired by TTL or the restart minted a new server session that cannot match the prior owner. Log at DEBUG only; do not alert.
- **Claim at preflight, SKIP-exit if not claimed, release at session end (`JUMP TO end` path).** Heartbeat mid-cycle (e.g. at Step 3 entry) to extend TTL for long ticks.
- **Sibling instance:** `docs/agents/cowork-team/flow/leader-lock.md` implements the equivalent pattern for the cowork-team dispatcher, using `task_kind: "cowork-slot"` with `owner_session` heartbeat re-bind (more sophisticated — see that file for the orphan-recovery variant).

Pattern reference: `docs/agents/dev-team/flow/main.md` § Step 0-PREFLIGHT (SF-1 implementation).

---

## Heartbeat Cadence

Heartbeat every **5 minutes** while task is in-flight. Missing heartbeats after `ttl_seconds` allow the next claimer to steal the lock (crash recovery).

```
Every 5 minutes of active work:

hb = task_heartbeat(task_id: "<your-task-id>")

if hb.ok = false:
  // Lock was stolen — another session took over (crash recovery)
  send_telegram(channel=bug, "Lock stolen on <task_id> mid-execution. Committing partial state. Aborting.")
  → commit safe partial state (idempotent writes only)
  → EXIT immediately (do not fight the steal)
```

---

## Release Semantics

```
On task completion (normal path):

task_release(task_id: "<your-task-id>")
→ result.ok = true: lock released, row deleted
→ result.ok = false: already expired/stolen (not an error — log at DEBUG level only)
```

Always call `task_release` in the completion path. If the agent crashes, TTL expiry is the fallback — no manual cleanup needed.

---

## Failure Modes (brief §8)

| Mode | Symptom | Response |
|------|---------|---------|
| **F1: heartbeat fails** (DB locked) | 3x retry: 1s, 2s, 4s backoff. All fail → BUG telegram. | Continue work (duplicate risk is acceptable). Do NOT abort. |
| **F2: lock stolen mid-task** | heartbeat returns ok=false | Commit idempotent partial state → BUG telegram → EXIT |
| **F3: coordination.db corrupt** | task_claim returns db_unavailable error | Log BUG, return claimed=false for all claims. Agents run without collision protection — duplicate work is degraded mode, not data loss. |
| **F5: Phase 1 not deployed** | tool-not-found error | Same as F3: agents log BUG and continue. |

---

## TTL Reference

| Agent / kind | Recommended TTL | Rationale |
|--------------|----------------|-----------|
| cowork-slot (any cowork agent) | 900s | One 15-min scheduler cycle |
| sprint-task (dev-* agents) | 3600s | 1h per user request |
| sprint-task / session-singleton (`dev-team-cron-singleton`) | 5400s | 1.5× observed 99th-pct tick duration (90 min); TTL-only, no owner-session pin. `task_release ok:false` after restart is EXPECTED. Heartbeat at Step 3 extends for long ticks. |
| dashboard-row (dev-team drain) | 1800s | 30 min: drain + PO triage cycle |
| commit-mutex (fleet-wide singleton) | 60s | Commit window is 2–10s; 60s = 6× headroom; crash recovery via TTL |

---

## Phase Availability

A phase is **NOT shipped** until the last two columns are populated. Source-code registration ≠ live availability — container age must be checked (see Deployment-verified ritual below).

| Phase | What ships | Code-committed SHA | Smoke-pass date | Container-rebuild SHA | Gateway-tools-callable date |
|-------|-----------|--------------------|-----------------|-----------------------|-----------------------------|
| Phase 1 | DB + 4 MCP tools (`task_claim`, `task_heartbeat`, `task_release`, `task_list_held`) | b144f560 (Sprint 1959a tsc fix) | 2026-05-20 (1961b live MCP probe — image digest sha256:598b94c7) | b144f560 (rebuilt 2026-05-20T19:41Z via Sprint 1961a, image digest sha256:598b94c7d7efe70b2d5710ce03d850c62ecfe413f9d50c35d7246af4be99043a) | 2026-05-20 |
| Phase 2 | cowork-team slot locking (main.md Step 4.6) | 8b23795a (Sprint 1955a) | 2026-05-20 (1961c live re-smoke 9/9 PASS) | b144f560 (Sprint 1961a rebuild) | 2026-05-20 |
| Phase 3 | dev-team drain + sprint-task locking | 448eb7f3…31c47ea5 (Sprint 1960c, 10 commits) | 2026-05-20 (1961c live re-smoke 10/10 PASS) | b144f560 (Sprint 1961a rebuild) | 2026-05-20 |

Agents calling these tools in Phases 2/3 MUST load this protocol doc first.
Skill shortcut: `.claude/skills/task-lock/SKILL.md`

---

## Deployment-verified Ritual

**Why:** Sprint 1961 deployment gap — Phase 1 tools registered in `registry.ts:103,208` (commit `b144f560`) but the live `mcp-server` container was 11h old at Sprint 1960 close, predating the tsc fix that unblocked the coordination build. Sprint 1960 declared 10/10 smoke PASS against a stale image while gateway tools were uncallable; cowork-team ran F3 fallback for ~11h.

**Rule:** Source code registration ≠ live availability. Container age MUST be checked.

After any sprint that adds/modifies MCP tools or coordination logic, **before** marking the sprint Done, the closing agent MUST:

1. Run `docker compose up -d --build <affected-service>` — OR document in the sprint-close signal why no rebuild is required (e.g. doc-only change).
2. Verify the container reports `Up <minutes>` (not hours) and `healthy` via `docker compose ps`.
3. Call each new/modified tool against the live gateway via `mcp__claude_ai_gateway__call_tool` and record the actual response in the sprint-close signal.
4. Only then populate the **Container-rebuild SHA** and **Gateway-tools-callable date** columns in the Phase Availability table above and mark the phase shipped.

Smoke against the developer's local build or against a container older than the latest relevant commit is **not** a valid sign-off.
