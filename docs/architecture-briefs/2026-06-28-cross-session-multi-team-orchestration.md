# Cross-Session Multi-Team Orchestration

**Date:** 2026-06-28
**Author:** agents-architect
**Status:** READY-FOR-PO-SIGNOFF
**Slug:** cross-session-multi-team-orchestration

---

## 0. Executive Summary

Multiple independent Claude Code sessions (two dev teams, two analysis teams, or more) running the
same agent role can each claim the same work item today because the ownership attribution layer does
not carry a per-session discriminator. The mutex primitive (`task_claim` INSERT-OR-IGNORE) is sound
across sessions. The bug is that **heartbeat, release, and "is-this-lock-mine?" probes all key on
`owner_agent` (a role string)** — which cannot distinguish two sessions running the same role. A
per-session identity already exists (`CLAUDE_CODE_SESSION_ID`, harness-injected UUID, verified live
`14f8039a-51ce-44f8-a7d9-0ddbe73b994e`) but is read nowhere in the codebase.

The fix is additive: thread `CLAUDE_CODE_SESSION_ID` into the lock row as `owner_client_session`,
rebind heartbeat/release/"is-mine" to this column, delete the self-held-heartbeat shortcut, and
insert a mandatory PRE-CLAIM gate into the router before any agent spawn. No new infra, no new
database, no new service.

**Hard constraint (must be honored everywhere):** Two sessions running the same role (two dev teams,
two analysis teams) share `owner_agent`. Therefore the authoritative ownership key MUST be the
per-session UUID (`owner_client_session = CLAUDE_CODE_SESSION_ID`). **Never `owner_agent`.**

---

## 1. Root Cause (Grounded in Live Code)

### 1.1 What is sound

`claimTask` (coordinationStore.ts:334-417) is purely `task_id`-PRIMARY-KEY-keyed:
`INSERT OR IGNORE` → stale-steal `UPDATE … WHERE expires_at < unixepoch('now')` → `SELECT
current_holder`. A second session claiming a held, non-expired lock deterministically gets
`{claimed:false, current_holder}`. **The mutex itself is cross-session-safe.**

### 1.2 Where the defeat actually lives

Three sites downstream of the claim — all caused by the absence of a per-session discriminator:

**Site 1 — Self-held heartbeat anti-pattern (root cause of cowork double-fire).**
`leader-lock.md:64-81`: when a session gets `{claimed:false}`, the protocol calls `task_heartbeat`
to check "is this my own prior lock?" `heartbeatTask` (coordinationStore.ts:439-490) matches on
`owner_agent`. Because every cowork dispatcher hard-codes `owner_agent="cowork-dispatcher"`, Session
2's heartbeat on Session 1's fresh lock returns `ok:true`, Session 2 concludes "self-held →
PROCEED", and both sessions fire. The claim said `claimed:false` correctly — the protocol discarded
that signal.

**Site 2 — Cross-session heartbeat and release interference.**
The same `owner_agent` match means Session 2 can renew or release Session 1's live lock.

**Site 3 — `owner_session` cannot discriminate.**
`SERVER_SESSION_ID = pid-${process.pid}-ts-${Date.now()}` (coordinationTools.ts:52-57) is minted
ONCE per mcp-server process. The mcp-server is ONE shared container (docker-compose.yml). Every
session shares one `owner_session`. The server cannot observe the client session: the gateway dials
a fresh SSE connection per call (server.ts:347); the deferred `RequestHandlerExtra.sessionId` wiring
was never shipped. The server cannot inject the right value — the client must supply it.

### 1.3 Modeling assumption: team == session (1:1)

Two dev teams = two Claude Code sessions = two distinct UUIDs. Extension point: if multiple teams
ever share one session, append a team-instance suffix (`$CLAUDE_CODE_SESSION_ID:team-B`). This
design does not block on that extension.

---

## 2. Session Identity Scheme

| Property | Decision |
|---|---|
| Source | `CLAUDE_CODE_SESSION_ID` (harness-injected UUIDv4). Reuse — do not mint new infra. |
| Stability across spawns | Inherited by subagents (`CLAUDE_CODE_CHILD_SESSION=1` with same UUID). |
| Uniqueness | UUIDv4. Verified distinct: this session `14f8039a-…` vs lockfile `3c6a79d7-…`. |
| Fallback if unset | Dispatcher mints `host-$(hostname)-pid-$$-ts-$(epoch)` once and exports it. Never fall back to `owner_agent`. |
| Composite stamp on every lock row | `owner_client_session` = `$CLAUDE_CODE_SESSION_ID` (authoritative) + `owner_agent` (role, for human readability, unchanged) + server-injected `owner_session` (diagnostic only — detects mcp-server reboots). |

**Why caller-supplied is acceptable:** the threat model is cooperative internal agents, not
adversaries. `owner_agent` is already caller-supplied and trusted. The server cannot derive the
client session. Spoofing risk is unchanged.

**Propagation to spawned specialists:** the dispatcher (sole gateway-holder, per INV-GATEWAY-1 in
task-lock SKILL.md:95-113) passes its `$CLAUDE_CODE_SESSION_ID` **explicitly in the spawn prompt**.
Do not rely on env inheritance — subagent UUID propagation is unverified and agents may refuse to
echo env vars (operational note: a subagent refused to echo `$CLAUDE_CODE_SESSION_ID` treating it
as credential exfiltration). Frame it as a coordination parameter in all SKILL/flow text, never as a
credential.

---

## 3. Atomic Claim Protocol

**Tool:** existing `task_claim` (reuse). New parameter: `owner_client_session: string`.

```
task_claim(
  task_id              = "<namespaced key>",         # see §3.1
  task_kind            = "sprint-task|cowork-slot|dashboard-row|commit-mutex|session-presence",
  owner_agent          = "<logical role>",            # unchanged
  owner_client_session = "$CLAUDE_CODE_SESSION_ID",  # NEW — the fix
  ttl_seconds          = <per-kind>,
  payload              = '{"agent_id":"<role>","started_at":<epoch>,"intent":"<short>"}'
)
```

**Contention semantics (this is where the bug is fixed):**

| Result | Action |
|---|---|
| `{claimed:true}` | **You own it exclusively. PROCEED.** No heartbeat probe. The self-held-heartbeat shortcut is DELETED. |
| `{claimed:true, stolen:true}` | Prior holder's TTL had expired; stale-steal succeeded. PROCEED. |
| `{claimed:false}` + `current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID` | Your own prior lock (re-entrant within session). Call `task_heartbeat` to renew, then PROCEED. |
| `{claimed:false}` + `current_holder.owner_client_session != $CLAUDE_CODE_SESSION_ID` + `heartbeat_at` fresh | Live peer in another session. **DEFER: do NOT spawn, log SKIP to WORK, EXIT.** |
| `{claimed:false}` + stale `heartbeat_at` | Race-loser within same tick (stale-steal would have fired if truly expired). DEFER. |
| `{claimed:false, error:"db_unavailable"}` | Fail-closed: do NOT spawn. |

**Critical change:** `claimed:false` triggers a session-id comparison, not a heartbeat call.
`claimed:true` is now unconditionally trusted. This deletes the self-held-heartbeat anti-pattern.

### 3.1 Canonical `task_id` Namespace

The cowork (`cowork-slot:*`, `published:*`) and dev-team (`sprint-task:<id>`,
`dev-team-cron-singleton`) namespaces must not drift. Standardize across all substrates:

| Scope | Canonical prefix | Period-key rule |
|---|---|---|
| Router user-intent dispatch | `intent:<agent-role>:<intent-key>` | N/A |
| Cron tick (fire-time claim) | `cron:<flow-slug>:<period-key>` | date-range string (`2026-06-23/2026-06-29`), never ISO week label (per guaranteed-slot double-post lesson) |
| Sprint task (outer dispatcher) | `sprint-task:<task-id>` | must match inner self-claim exactly (closes `sprint-task:` vs `task:` mismatch in dispatch-claim SKILL.md:60-71) |
| Published artifact dedup | `published:<kind>:<period-key>` | same period-key contract as cron |
| Session presence | `session-presence:$CLAUDE_CODE_SESSION_ID` | per-session singleton |

### 3.2 Router Gate — Step 2.5

Insert a mandatory step into the router constitution (CLAUDE.md:4-10):

```
BEFORE spawning any agent — MANDATORY
  1. Read dispatch table (.claude/skills/dispatch/SKILL.md)
  2. Match intent → agent
  2.5 PRE-CLAIM:
       task_claim(task_id="intent:<agent>:<intent-key>",
                  owner_client_session=$CLAUDE_CODE_SESSION_ID, …)
       claimed:true  → continue to step 3 (spawn inside try/finally → task_release)
       claimed:false + peer (owner_client_session ≠ self) → SKIP, log to WORK, EXIT
  3. Spawn `run docs/agents/<agent>/flow/main.md`
     Pass $CLAUDE_CODE_SESSION_ID in spawn prompt as coordination parameter
```

This is the single code-enforced gate that currently exists only as operator memory ("read
task_list_held before dispatch", "pick ONE owner", "cowork OBSERVE-ONLY").

---

## 4. Heartbeat + Stale Reclaim

**Liveness proof:** the holding agent calls
`task_heartbeat(task_id, owner_client_session=$CLAUDE_CODE_SESSION_ID)` every ≤ TTL/3.
Server renews `expires_at` and `heartbeat_at` **WHERE `task_id=? AND owner_client_session=?`
AND `expires_at >= now`** (cannot resurrect an expired lock).

**TTL per kind (unchanged values, now session-attributed):**
- commit-mutex: 60s
- cowork-slot: 180s
- leader/cron: 1800s
- sprint-task: 3600s
- published daily/weekly: 100800s / 691200s

**Stale threshold:** `expires_at < now` (TTL elapsed without heartbeat). Crash-safe and
rebuild-safe: a crashed session stops heartbeating → lock expires → next claimer's stale-steal takes
it.

**Matching ladder in `heartbeatTask` and `releaseTask` (backward-compat):**
1. If `owner_client_session` provided → match on it (canonical)
2. Else if `owner_agent` provided → legacy `owner_agent` match (un-migrated callers)
3. Else `owner_session` (deepest legacy)

Migrate callers up the ladder incrementally; the new path is strictly safer.

**`releaseTask` return shape change:** currently returns `ok:false` (indistinguishable from "lock
absent") when the owner doesn't match, silently orphaning for the full TTL. Change to
`{ok:true, released: 0|1}` — `released:0` is a clean idempotent no-op (you didn't own it). This
makes releasing the wrong session's lock **impossible by construction** (WHERE clause won't match).

**Two known failure modes closed by this design:**

- *Orphaned lock after mcp-server rebuild* (`feedback_lock_orphaned_by_rebuild`): today
  `owner_session` rotates on container rebuild → legacy locks become unreleasable zombies. Fixed:
  `owner_client_session` is the client UUID and survives any server rebuild. The same live session
  keeps renewing/releasing across a server restart.

- *Release-by-wrong-owner* (`feedback_task_release_owner_agent_mismatch_orphans_lock`): today
  `ok:false` is indistinguishable from "lock absent", silently orphaning. Fixed: `released:0` is a
  clean no-op with `ok:true`; callers stop treating `ok:false` as "lock gone."

**`task_force_release_orphan` change:** rebind match from `owner_agent` to `owner_client_session` OR
heartbeat-age-only. A peer can recover a dead session's lock by staleness, but cannot force-release
a live session's lock (refuses while `heartbeat_age ≤ 120s`).

---

## 5. Presence Registry

**Reuse `task_locks` — no new table.** Add one `task_kind` value: `session-presence`, via the
existing `migrateCoordinationTable` CHECK-enum-widen pattern (precedent:
`20260524-coordination-add-commit-mutex.sql`).

At dispatch time each session claims:

```
task_claim(
  task_id              = "session-presence:$CLAUDE_CODE_SESSION_ID",
  task_kind            = "session-presence",
  owner_agent          = "<dispatcher role>",
  owner_client_session = "$CLAUDE_CODE_SESSION_ID",
  ttl_seconds          = 1800,
  payload              = '{"agent_id":"<role>","host":"<hostname>",
                           "started_at":<epoch>,"current_task":"<task_id>"}'
)
```

The session heartbeats this for the full session lifetime, updating `payload.current_task` when
tasks change.

**Query surface:** extend `task_list_held` output to include `owner_client_session` + `payload`:

- `task_list_held(kind="session-presence")` → live-sessions roster:
  `[{session_id, agent_role, host, started_at, last_heartbeat, current_task}]`
- `task_list_held(kind="sprint-task")` → per-task ownership with the session that holds it

This satisfies requirement #2 (register id + start-time, visible to other sessions) with **one new
enum value and one output-field addition — no new infra.**

**Why not orch-state.json:** `orch-state.json` is a CAS-guarded ~2.46 MB hot file with a `.strict()`
10-key schema (orchStateSchema.ts:340-360). Presence belongs in the epoch-seconds lease store, not
the board. No `orch-apply.sh` involvement in P1/P2. (Optional P3 read-only projection: see §7.)

---

## 6. Write-Path Contract

The lock/presence layer writes `coordination.db` exclusively through MCP tools. It does NOT write
`orch-state.json`. No `orch-apply.sh` involvement in P1/P2.

If P3 adds session attribution to the board (optional), every such write MUST:
- Route through `jq '<transform>' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`
- Add the field to Zod first: `claimed_by_session: z.string().optional()` on `TaskSchema`
  (orchStateSchema.ts:81-119, already `.passthrough()` but make explicit + validated) and/or
  `active_session` on `HeadSchema` (orchStateSchema.ts:220-233). `OrchStateSchema` is `.strict()`
  at root (340-360) — no new root key without a schema edit; keep additions inside existing
  sub-schemas.
- Pass the tri-point validator (Stage-0 dup-key, Stage-1 safeParse, Stage-1c ref-integrity) and
  server-runtime `atomicWriteOrchState`.

**Recommendation: do NOT mirror session ownership onto the board in P1/P2.** The lock table is the
authoritative presence SSOT; mirroring invites the dual-write drift the hot-cold-split brief warns
about. Treat any board projection as read-derived (P3) only.

---

## 7. Phased Rollout

### P1 — Attribution Fix (The Unblocker)

**Goal:** make `claimed:true` trustworthy across N sessions of the same role.

**Ships:**
- `owner_client_session` TEXT column in `task_locks` (nullable, NOT UNIQUE)
- `owner_client_session` parameter in `task_claim`, `task_heartbeat`, `task_release`,
  `task_force_release_orphan`
- Matching-ladder rebind in `heartbeatTask`/`releaseTask`/`releaseOrphanTask`
- `releaseTask` → `{ok:true, released:0|1}` return shape
- **Delete** the self-held-heartbeat shortcut in `leader-lock.md:64-81`; replace with: trust
  `claimed:true`, compare `owner_client_session` on `claimed:false`
- CLAUDE.md step 2.5 PRE-CLAIM gate + lift `dispatch-claim` skill to the router scope
- Thread `$CLAUDE_CODE_SESSION_ID` through all dispatcher flows via spawn-prompt passing

**Migration sequence (MANDATORY — migration before matching-ladder switch):**
1. Apply SQL: `ALTER TABLE task_locks ADD COLUMN owner_client_session TEXT` (nullable, NOT UNIQUE —
   heed `feedback_sqlite_add_column_unique_silent_noop`: UNIQUE is silently dropped on ADD COLUMN)
2. Existing rows get NULL → matching ladder falls through to `owner_agent` (no regression)
3. Deploy updated tool schema with `owner_client_session` as OPTIONAL
4. Roll out client-side caller changes (CLAUDE.md + SKILLs + flow files)
5. Once all callers pass the field, make `owner_client_session` REQUIRED in the tool schema

**Owning agents for P1 tasks:**
- `dev-mcp-server` — coordinationStore.ts column + matching-ladder rebind + release return shape +
  coordinationTools.ts caller param drop (stop server-side injection of ownership) + migration SQL
- `agent-father` — CLAUDE.md step 2.5 + lift dispatch-claim SKILL to router scope + rebind
  leader-lock.md + task-lock SKILL + delete self-held-heartbeat anti-pattern + update spawn-prompt
  convention to pass CLAUDE_CODE_SESSION_ID as a coordination parameter
- `pm` — decompose into atomic FRs; sequence migration SQL task before matching-ladder switch task

**P1 failure-mode tests:**

| Test | Method | Pass criterion |
|---|---|---|
| Double-claim race | Two sessions `task_claim` same `task_id` concurrently | Exactly one `{claimed:true}`; the other `{claimed:false}` with `current_holder.owner_client_session` ≠ self |
| Self-held false-positive (cowork double-fire) | Two `cowork-dispatcher` sessions, same tick, same leader key | Loser sees `claimed:false` + peer session UUID → EXITs. Must NOT proceed via heartbeat probe — that path is deleted. |
| Stale reclaim after crash | Session 1 claims, is killed (stops heartbeat), session 2 claims after TTL | Session 2 gets `{claimed:true, stolen:true}`, row carries session 2's `owner_client_session` |
| Reclaim after mcp-server rebuild | Claim, rebuild container (rotates `owner_session`), same Session 1 heartbeats | Heartbeat succeeds (matched on `owner_client_session`, not `owner_session`) — no zombie |
| Release by wrong session | Session 2 tries to release Session 1's live lock | `{ok:true, released:0}`, lock untouched; Session 1's own release → `{ok:true, released:1}` |
| Clock source | Inspect all writes | Only `unixepoch('now')` server-side; no client `Date.now()`/ISO crosses the wire |
| DB unavailable (F3) | Unreadable `coordination.db` | `{claimed:false, error:"db_unavailable"}` → dispatcher fails closed (no spawn) |
| Read-before-fire cadence race | Two sessions on `*/15`, claim mid-tick | `claimed:true` is authoritative → second EXITs; protocol trusts the claim, not a pre-read |

### P2 — Presence Registry

**Goal:** any session can see who is working on what before dispatching.

**Depends on:** P1 (session UUID must be in the claim row before presence rows are meaningful).

**Ships:**
- `session-presence` enum value via `migrateCoordinationTable` table-recreate transaction (existing
  pattern in coordinationStore.ts:159-206)
- Dispatcher self-registers at startup + heartbeats for session lifetime; updates `payload.current_task`
- `task_list_held` output extended with `owner_client_session` + `payload` fields
- Router step 2.5 extended: read `task_list_held(kind="session-presence")` roster first, confirm no
  peer already owns the intent key, then PRE-CLAIM

**Owning agents for P2 tasks:**
- `dev-mcp-server` — enum migration + tool output field extension
- `agent-father` — registry read/write protocol in dispatch + task-lock SKILLs; wire roster read
  into step 2.5

**P2 failure-mode tests:**

| Test | Method | Pass criterion |
|---|---|---|
| Presence row visible across sessions | Session A registers; Session B reads roster | `task_list_held(kind="session-presence")` returns Session A's row with correct `owner_client_session` |
| Presence row expires on crash | Session A stops heartbeating; TTL elapses; Session B reads | Roster is empty (or shows Session A as expired, not as live) |
| Stale reclaim doesn't break presence | Session A crashes; Session B steals a sprint-task lock | Session A's presence row expires independently; no interference |

### P3 — Fire-Time Leader Election for Crons

**Goal:** replace the operator-level "OBSERVE-ONLY / defer to live leader" convention with a code-enforced gate.

**Depends on:** P1 + P2 live.

**Mechanism:** cron arming is session-local (CronList can't see peers). Dedup moves to fire-time:
each cron tick, the session claims `cron:<flow>:<period-key>`. Only `{claimed:true}` fires; all
other sessions EXIT for that tick. Period-key is the `get_week_period` date-range for weekly, the
`work_date` for daily — never an ISO week label (guaranteed-slot double-post lesson).

**This replaces:**
- Non-authoritative `cowork-leader` heartbeat election in leader-lock.md
- The operator-level "OBSERVE-ONLY" and "defer to live leader" conventions in router memory files
- The router-manual-drive-overlaps-devteam pattern

**Ships:**
- Redesign `leader-lock.md` / cron flows + `cron-cowork-team` / `cron-detect-loop` SKILLs to elect
  at fire-time using `claimed:true`
- Specify the period-key contract (date-range, never ISO week label) in the cron skill
- Optional P3b: read-only orch-state projection of live roster for dashboard visibility (via
  orch-apply.sh + optional `HeadSchema` field `active_session`); purely derived, not authoritative

**Owning agents for P3 tasks:**
- `agents-architect` — redesign leader-lock.md + cron SKILL specs
- `agent-father` — implement per-spec
- `dev-mcp-server` — any tool schema tweaks for fire-time election (likely none if P1/P2 is complete)
- `po` — owns the standing decision that supersedes the manual "single human owner of cowork"
  convention once P3 is code-enforced
- `dev-frontend` — optional P3b roster projection on dashboard (read-only, PLAN-ONLY until P2 shipped)

**P3 failure-mode tests:**

| Test | Method | Pass criterion |
|---|---|---|
| Cron double-fire prevention | Two sessions with same cron schedule fire at same tick | Exactly one `{claimed:true}` for `cron:<flow>:<period>` → exactly one fires |
| Period-key collision across weeks | Two ticks in same week, different day | Period-key (date-range `YYYY-MM-DD/YYYY-MM-DD`) is identical for both → dedup works correctly |
| Stale leader reclaim | P3-leader session crashes mid-week | Next cron tick: stale-steal fires, new leader takes the period key |

---

## 8. Concrete Follow-On Tasks

### dev-mcp-server

All tasks below require a RAW-verify step against the live Docker named volume (`coordination.db` in
the named volume — host `./data/coordination.db` is a stale decoy, do not probe it).

**P1-MCP-1 (migration SQL — FIRST, before any matching-ladder change):**
```sql
ALTER TABLE task_locks ADD COLUMN owner_client_session TEXT;
-- nullable, NOT UNIQUE (UNIQUE silently dropped on ADD COLUMN in SQLite)
```
Wrap in `migrateCoordinationTable` transaction. Verify via `task_list_held` that existing rows
survive with NULL in new column.

**P1-MCP-2 (coordinationStore.ts — column + matching-ladder rebind):**
- `claimTask` (lines 334-417): add `owner_client_session` to INSERT column list and stale-steal UPDATE column list; add to `current_holder` SELECT.
- `heartbeatTask` (lines 439-490): matching ladder — (1) if `owner_client_session` provided, match on it; (2) else `owner_agent`; (3) else `owner_session`.
- `releaseTask` (lines 512-545): same matching ladder; change return from `ok:boolean` to `{ok:true, released: 0|1}`.
- `releaseOrphanTask` (lines 614-694): match on `owner_client_session` OR heartbeat-age-only; refuse if `heartbeat_age ≤ 120s` (live lock guard unchanged).

**P1-MCP-3 (coordinationTools.ts — caller param + stop server-side injection):**
- Add `owner_client_session: z.string().optional()` to tool input schemas for `task_claim`, `task_heartbeat`, `task_release`, `task_force_release_orphan`.
- Remove `owner_client_session` from the server-side injection block (lines 52-57 mint `SERVER_SESSION_ID`; keep `owner_session = SERVER_SESSION_ID` as diagnostic only).
- Thread the caller-supplied `owner_client_session` into the corresponding `coordinationStore` call.

**P2-MCP-1 (session-presence enum + task_list_held output):**
- `migrateCoordinationTable` (lines 159-206): enum-widen to add `session-presence` value.
- `listHeldTasks`: extend SELECT and output to include `owner_client_session` and `payload` fields.

### agent-father

**P1-AF-1 (CLAUDE.md — step 2.5 PRE-CLAIM gate):**
Edit `CLAUDE.md` lines 4-10 to insert step 2.5 between "Match intent → agent" and "Spawn". See
§3.2 verbatim block above. Route through agent-md-factory discipline.

**P1-AF-2 (dispatch-claim SKILL — lift to router scope):**
Edit `.claude/skills/dispatch-claim/SKILL.md` lines 10-71 to: (a) normalize the `task_id` namespace
per §3.1; (b) require `owner_client_session = $CLAUDE_CODE_SESSION_ID` on every claim; (c) document
spawn-prompt passing convention (`$CLAUDE_CODE_SESSION_ID` as a coordination parameter, not a
credential). Route through agent-md-factory discipline.

**P1-AF-3 (leader-lock.md — delete self-held-heartbeat anti-pattern):**
Delete `docs/agents/cowork-team/flow/leader-lock.md:64-81` (the heartbeat-on-`claimed:false`
shortcut). Replace with: compare `current_holder.owner_client_session` to `$CLAUDE_CODE_SESSION_ID`
from the spawn prompt; if equal → renew + PROCEED; if different → EXIT. Route via agent-md-factory.

**P1-AF-4 (task-lock SKILL — rebind owner key):**
Edit the task-lock SKILL to declare `owner_client_session` as the authoritative key for all
ownership probes. Remove the `owner_agent` ownership path from the "is-it-mine?" check. Retain
`owner_agent` as a human-readable role label only.

**P3-AF-1 (leader-lock.md + cron SKILLs — fire-time election):**
Redesign `leader-lock.md` and `cron-cowork-team` / `cron-detect-loop` SKILLs to elect at fire-time
via `task_claim(task_id="cron:<flow>:<period-key>", owner_client_session=…)`. After P1 and P2 land.

---

## 9. Reuse vs New Infra Table

| Concern | Decision |
|---|---|
| Session identity | Reuse `CLAUDE_CODE_SESSION_ID` (harness, verified live) |
| Mutex primitive | Reuse `task_locks` + `task_claim` 3-step (verified sound) |
| Heartbeat/TTL/stale-steal | Reuse existing infrastructure |
| Clock | Reuse server-side `unixepoch('now')` — never client `Date.now()`/ISO |
| Presence registry | Reuse `task_locks` + new `session-presence` enum value |
| Claim-before-spawn gate | Reuse + lift `dispatch-claim` skill to router |
| **New code only** | `owner_client_session` column; tool param; matching-ladder rebind; `{ok, released}` return shape; `session-presence` enum; `task_list_held` output fields; CLAUDE.md step 2.5 |

No new database. No new service. No new file format.

---

## 10. Key File Anchors for Implementers

- Mutex primitive (verified sound): `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:334-417` (claim), `:439-490` (heartbeat), `:512-545` (release), `:614-694` (orphan), `:159-206` (enum-widen migration)
- Session-id injection site: `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts:52-57` (mint), `:113-121` (injection)
- Router gate insertion: `CLAUDE.md:4-10`
- Dispatch-claim SKILL: `.claude/skills/dispatch-claim/SKILL.md:10-71`
- Self-held anti-pattern to delete: `docs/agents/cowork-team/flow/leader-lock.md:64-81`
- Board write contract (P3 only): `scripts/orch-apply.sh:43-138` + `apps/mcp-server/src/infrastructure/orchStateSchema.ts:81-119` (TaskSchema), `:220-233` (HeadSchema), `:340-360` (strict root)
- Migration precedent: `20260524-coordination-add-commit-mutex.sql`

---

## 11. Probe Still Needed (Deferred to P1 Test Phase)

- **Subagent UUID inheritance:** does `Agent()`-spawned subagent inherit `CLAUDE_CODE_SESSION_ID` or get a fresh UUID? Design holds either way (dispatcher passes UUID explicitly in spawn prompt), but this decides whether env-read alone suffices for specialists. Probe: from a dispatcher, spawn a trivial subagent that reads (NOT echoes) `$CLAUDE_CODE_SESSION_ID` and passes it as a tool parameter; confirm equality.
- **Live duplicate `owner_agent` rows:** two `dev-team` and two `digest-predict` rows currently live in `task_list_held` — are they two live sessions or one session's stale + fresh? After P1 lands, `owner_client_session` makes them distinguishable without probing. Useful for P1 test fixture design.

---

## Sequencing Summary

```
P1 FIRST (unblocker — makes claimed:true trustworthy):
  P1-MCP-1 (migration SQL) → P1-MCP-2 (matching-ladder) → P1-MCP-3 (tool param)
  in parallel: P1-AF-1 (CLAUDE.md) + P1-AF-2 (dispatch-claim) + P1-AF-3 (leader-lock) + P1-AF-4 (task-lock)
  pm: decompose into atomic FRs; gate MCP-2/MCP-3 on MCP-1 completion

P2 AFTER P1 (presence registry — independent of P3):
  P2-MCP-1 (enum + output) then P2-AF-1 (roster read in step 2.5)

P3 AFTER P1+P2 (fire-time cron election — closes the last cross-session gap):
  P3-AF-1 (leader-lock + cron SKILLs redesign) then implement
```

**PO signoff needed on:** P1 scope + sequencing before any code lands. P3 standing decision
(supersedes manual "single cowork owner" convention).
