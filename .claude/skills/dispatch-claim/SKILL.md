# Skill: dispatch-claim

**Trigger:** router (or any dispatcher) about to spawn an agent for sprint-task, intent, or cowork-slot work

**Related:** `.claude/skills/task-lock/SKILL.md` (inner self-claim — the two tiers coexist)
**Full namespace spec:** `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §3.1
**Full design (outer wrap origin):** `docs/architecture-briefs/2026-05-21-task-lock-dispatcher-wrap.md`

---

## OWNERSHIP KEY — Authoritative

`owner_client_session = $CLAUDE_CODE_SESSION_ID` is the **sole** authoritative ownership key for
every claim, heartbeat, and release at the router scope. `owner_agent` is a human-readable role
label only (for logs and dashboards); it MUST NOT be used as the ownership discriminator.

Two sessions running the same role (two dev teams, two analysis teams) share `owner_agent`. The
per-session UUID (`CLAUDE_CODE_SESSION_ID`) is the only field that distinguishes them.

If `$CLAUDE_CODE_SESSION_ID` is unset, mint a stable fallback and log a warning:

```bash
if [ -z "$CLAUDE_CODE_SESSION_ID" ]; then
  CLAUDE_CODE_SESSION_ID="host-$(hostname)-pid-$$-ts-$(date +%s)"
  echo "[router-warn] CLAUDE_CODE_SESSION_ID unset, minting fallback: $CLAUDE_CODE_SESSION_ID"
fi
```

Never fall back to `owner_agent` alone.

---

## Canonical `task_id` Namespace (§3.1)

| Scope | Prefix | Period-key rule |
|---|---|---|
| Router user-intent dispatch | `intent:<agent-role>:<intent-key>` | N/A |
| Cron tick fire-time election | `cron:<flow-slug>:<YYYY-MM-DDTHH:MMZ>` | floor(fire_time) to scheduled boundary (ISO-8601 UTC, minute precision); see §Fire-Time Election below. DISTINCT from artifact dedup. |
| Sprint task (outer dispatcher) | `task:<task-id>` | must match inner self-claim key exactly |
| Published artifact dedup | `published:<kind>:<period-key>` | daily or weekly date-range string (e.g. `2026-06-23/2026-06-29`); never conflate with fire-time election key |
| Session presence | `session-presence:$CLAUDE_CODE_SESSION_ID` | per-session singleton |

**Key distinction (P3 addendum §A.4):**

| Property | `published:<kind>:<date-range>` | `cron:<flow>:<tick>` |
|---|---|---|
| Purpose | Prevent double-publish of same period artifact | Elect exactly one leader per cron fire |
| Granularity | Daily or weekly | Per cron tick (minute resolution) |
| TTL | 86400s / 691200s (never released) | 600s (explicit release at dispatch end) |
| task_kind | `cowork-slot` (existing) | `cowork-slot` (cowork) / `sprint-task` (dev-team, auditor) |

**Fire-time period-key examples (P3 fleet):**
```
cron:cowork:2026-06-28T14:30Z       # cowork */15 firing at 14:32 → floor to :30
cron:dev-team:2026-06-28T14:07Z     # dev-team 7,37 firing at 14:08 → floor to :07
cron:auditor-t1:2026-06-28T14:30Z   # auditor-t1 */30 firing at 14:32 → floor to :30
cron:auditor-t2:2026-06-28T12:00Z   # auditor-t2 0 */4 firing at 12:03 → floor to 12:00
cron:auditor-t3:2026-06-28T02:00Z   # auditor-t3 0 2 * * * — fixed time
```

Examples of `intent:` keys:
```
intent:dev-mcp-server:p1-mcp-1          # first migration task
intent:agent-father:p1-af-1             # CLAUDE.md gate
intent:qa:bctc-regression-suite         # QA regression tests
intent:cowork-team:digest-daily         # cowork daily digest intent
```

---

## § Fire-Time Election (P3 — TASK_1994)

**Purpose:** Replace the operator OBSERVE-ONLY convention with code-enforced per-tick leader election. Each cron tick claims `cron:<flow-slug>:<TICK>` atomically. Only `{claimed:true}` fires. The OBSERVE-ONLY conventions are superseded by this protocol once P3-QA (TASK_1995) smoke tests pass.

**Layer:** dispatcher-level (one election per tick per flow). Per-slot Step 4.6 claims remain as intra-dispatch dedup within an elected session — separate, unchanged.

**compute_tick_boundary helpers per cron expression:**

```
# */N minute interval (e.g. */15, */30):
CURRENT_MIN=$(date -u +%M)
BOUNDARY_MIN=$(( (CURRENT_MIN / N) * N ))
TICK=$(date -u +"%Y-%m-%dT%H:$(printf '%02d' $BOUNDARY_MIN)Z")

# M1,M2 enumerated minutes (e.g. "7,37 * * * *"):
CURRENT_MIN=$(date -u +%M)
if [ "$CURRENT_MIN" -ge 37 ]; then BOUND="37"; else BOUND="07"; fi
TICK=$(date -u +"%Y-%m-%dT%H:${BOUND}Z")

# 0 */H hourly (e.g. "0 */4 * * *"):
CURRENT_HR=$(date -u +%H)
BOUNDARY_HR=$(( (CURRENT_HR / H) * H ))
TICK=$(date -u +"%Y-%m-%dT$(printf '%02d' $BOUNDARY_HR):00Z")

# Fixed time (e.g. "0 2 * * *"):
TICK=$(date -u +"%Y-%m-%dT02:00Z")
```

**Election pattern (generic):**
```
fire_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "cron:<flow-slug>:" + TICK,
  task_kind:            "<cowork-slot for cowork | sprint-task for dev-team/auditor>",
  owner_agent:          "<dispatcher-role>",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          600,
  payload:              {"site": "fire-election", "tick": TICK}
})
if not fire_result.claimed:
  if fire_result.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id: "cron:<flow-slug>:"+TICK, owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    # proceed (re-entrant)
  else:
    # peer leads; release any pre-acquired locks (e.g. dev-team SF-1) then EXIT
    EXIT
# Winner proceeds. Release at end of dispatch body (explicit task_release mandatory).
```

**Canonical implementations:** `docs/agents/cowork-team/flow/leader-lock.md` (cowork),
`docs/agents/dev-team/flow/main.md` §Step [3] (dev-team), `docs/agents/system-auditor/flow/main.md` §Step 0d (auditor tiers).

**OBSERVE-ONLY retirement gate:**
The operator conventions `feedback_router_cowork_defer_to_live_leader` and `feedback_router_manual_drive_overlaps_devteam_loop` are superseded by this fire-election protocol. They remain authoritative FALLBACK until P3-QA (TASK_1995) passes its 3 smoke tests. Memory-file retirement update is owed at TASK_1995 sign-off.

---

## Step 0a — Session-Presence Self-Registration

**Fire once at dispatcher startup** — before Phase A orphan-adoption probe and Phase B
PRE-CLAIM gate. Registers this running session in the coordination DB so peer sessions
can enumerate live dispatchers via `task_list_held(kind="session-presence")`.

`task_id = "session-presence:" + $CLAUDE_CODE_SESSION_ID` is per-session unique. On
recurring cron ticks the row is already held by this session — heartbeat to renew; no
re-create needed.

```
# Step 0a — Presence claim (session-level singleton)
# Fires at every dispatcher startup; re-entrant on recurring cron ticks.

started_at = $(date -u +"%Y-%m-%dT%H:%M:%SZ")   # wall-clock at this dispatcher tick

presence_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  task_kind:            "session-presence",           # REQUIRED — 7th enum kind (TASK_1989)
  owner_agent:          "<dispatcher-role>",           # e.g. "dev-team", "cowork-dispatcher"
  owner_client_session: $CLAUDE_CODE_SESSION_ID,      # REQUIRED — authoritative ownership key
  ttl_seconds:          1800,                          # 30 min; heartbeat every TTL/3 = 600s
  payload:              {
    agent_id:     "<dispatcher-id>",                   # e.g. "dev-team", "cowork-team"
    host:         $(hostname),                         # machine identity for multi-host visibility
    started_at:   started_at,                          # wall-clock at claim time (stable for session)
    current_task: "dispatch-init"                      # advisory — see § Updating current_task
  }
})

if presence_result.claimed == true:
  log "[<dispatcher>] session-presence registered: " + $CLAUDE_CODE_SESSION_ID

else:
  if presence_result.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
    # Re-entrant tick within same session — heartbeat to renew TTL only
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    log "[<dispatcher>] session-presence renewed (re-entrant tick)"

  else:
    # IMPOSSIBLE: task_id embeds $CLAUDE_CODE_SESSION_ID — no peer session can hold it.
    # If this path fires: $CLAUDE_CODE_SESSION_ID is unset or env is misconfigured.
    # Non-fatal — log BUG and PROCEED (presence is advisory, never a gate).
    log "[<dispatcher>] WARN session-presence collision on session-presence:" + $CLAUDE_CODE_SESSION_ID + " — check env var"

# Presence claim result is NEVER a gate — ALWAYS proceed to Phase A and Phase B.
```

### Updating `payload.current_task` mid-session

`task_heartbeat` renews TTL only — it does **not** update payload fields (no payload_patch
in the current MCP surface). To refresh `current_task` when the active task changes, use
the release+reclaim pattern. Since `task_id` embeds `$CLAUDE_CODE_SESSION_ID`, no peer
can steal it in the race window:

```
# Optional advisory update — release then immediately reclaim with new current_task
call_tool(server="vn-market", tool="task_release", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  task_kind:            "session-presence",
  owner_agent:          "<dispatcher-role>",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          1800,
  payload:              { agent_id: "...", host: "...", started_at: "...", current_task: "<active-task-id>" }
})
```

This is **optional and advisory** — the primary liveness signal is `heartbeat_at` freshness
(is this session alive?). `current_task` is a best-effort observability field.

### Non-Adoptable — Presence Rows Are NOT Work Locks

> **P2 INVARIANT (do not break):** `session-presence` rows are explicitly excluded from
> the reaper's `ORPHAN_EMIT_ALLOW_LIST` (coordinationStore.ts:392 — "NOT adoptable work").
> When a session dies, its presence row stops receiving heartbeats and **simply EXPIRES/GCs —
> it is NEVER converted to an `orphan-signal`, NEVER adopted, NEVER re-dispatched.**
>
> Presence row expiry = normal liveness signalling: "that session is gone."
> It is NOT abandoned work. Do NOT treat a stale presence row as a signal to rescue work.
>
> Only `sprint-task`, `cowork-slot`, and `dashboard-row` generate `orphan-signal` rows (P1.5).
> The Phase A orphan-adoption probe will never encounter `session-presence` rows in its results
> (the reaper never emits them for that kind).

---

## Pattern — Router-Scope Dispatch Wrap (CLAUDE.md step 2.5)

```
# Step 2.5 — PRE-CLAIM before Agent() spawn (router constitution)
# See: CLAUDE.md §"BEFORE spawning any agent — MANDATORY"

outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "intent:<agent>:<intent-key>",   # canonical namespace
  task_kind:            "intent",
  owner_agent:          "<dispatcher-role>",              # role label, NOT ownership key
  owner_client_session: $CLAUDE_CODE_SESSION_ID,          # REQUIRED — authoritative key
  ttl_seconds:          600,
  payload:              '{"site":"router","intent":"<intent-key>"}'
})

if outer_claim.claimed == true:
  # Exclusively owned. Spawn inside try/finally.
  try:
    Agent(subagent_type=<agent>, prompt="run docs/agents/<agent>/flow/main.md
          coordination_session=$CLAUDE_CODE_SESSION_ID task=<intent-key>")
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={
      task_id:              "intent:<agent>:<intent-key>",
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })

else:
  # claimed:false — compare sessions
  if outer_claim.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
    # Re-entrant: own prior lock. Heartbeat to renew, then spawn.
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id:              "intent:<agent>:<intent-key>",
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    # → continue to spawn (same try/finally pattern above)

  else:
    # Peer session holds it — do NOT spawn
    log "[router] PRE-CLAIM collision intent:<agent>:<intent-key> — held by peer session"
    send_telegram(channel="work", "[router] SKIP: intent:<agent>:<intent-key> held by peer session")
    EXIT   # no spawn, no cost
```

---

## Sprint-Task Outer Wrap (unchanged from Phase 4)

For sprint-task dispatch (dev-team, pm fan-out), the same principle applies with the `task:` id-prefix (task_kind stays `sprint-task`):

```
outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "task:<task_id>",   # must match inner self-claim key
  task_kind:            "sprint-task",
  owner_agent:          "<dispatcher-agent>",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   # REQUIRED
  ttl_seconds:          3600,
  payload:              '{"target_agent":"X","flow":"Y"}'
})
```

The outer claim key MUST match the inner self-claim key used by the spawned agent. Mismatch = two
independent locks = no protection. Align on the `task:` id-prefix everywhere; `task_kind` stays
`sprint-task` — id-prefix and kind are different axes.

---

## Passing `$CLAUDE_CODE_SESSION_ID` to Subagents

**DO:** pass it in the spawn prompt as a coordination parameter:
```
"run docs/agents/dev-team/flow/main.md
 coordination_session=$CLAUDE_CODE_SESSION_ID task=<task_id>"
```

**DO NOT:** echo or log it as a credential. Frame it as an operational coordination parameter in all
SKILL/flow text. A subagent may refuse to echo env vars for security reasons — that posture is
correct and must be preserved. Never instruct subagents to `echo $CLAUDE_CODE_SESSION_ID` or dump it
to logs.

**Inheritance note:** subagents spawned via `Agent()` may inherit `CLAUDE_CODE_SESSION_ID` via env.
Design holds either way: the dispatcher passes it explicitly in the spawn prompt so the subagent
does not need to read it from env.

---

## Two-Tier Model (both layers required)

| Tier | Phase | Who holds it | Prevents |
|---|---|---|---|
| Outer wrap (this SKILL) | Phase 4 / 1962c | Dispatcher (dev-team, pm, router) | Duplicate Agent() spawn |
| Inner self-claim | Phase 3 / 1960c | Spawned agent itself | Stolen-lock work continuation |

Do NOT remove either tier. They protect different race windows.

---

## Orphan-Adoption Probe (P1.5-AF-1 — Fire BEFORE PRE-CLAIM)

**Sprint:** CROSS-SESSION-MULTI-TEAM-ORCH · TASK_1986  
**Spec:** `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §6.5.3–§6.5.6

> **Honest bound:** zero live sessions = zero execution; the reaper only makes work ADOPTABLE, it never self-heals execution.

Before the router executes Step 2.5 PRE-CLAIM for any new dispatch, it MUST run this adoption probe
to drain orphaned work from dead peer sessions first.

```
N_MAX = 3   # poison-task threshold — configurable per task_kind; global default is 3

# --- Phase A: Orphan-Adoption Probe (BEFORE PRE-CLAIM) ---
orphan_signals = call_tool(server="vn-market", tool="task_list_held", arguments={
  kind:        "orphan-signal",
  owner_agent: <dispatcher-role>   # e.g. "router", "dev-team", "cowork-dispatcher"
})
# task_list_held is READ-ONLY — NEVER use task_heartbeat/task_claim to probe published artifacts
# DoD-P15-2: use task_list_held (read-only) to check published:<kind>:<period> artifacts at adoption time

for each signal in orphan_signals:
  original_task_id      = signal.payload.original_task_id
  original_task_kind    = signal.payload.original_task_kind
  redispatch_count      = signal.payload.redispatch_count   # DoD-P15-3: must carry forward
  last_payload          = signal.payload.last_payload       # durable checkpoint

  if redispatch_count >= N_MAX:
    # --- Escalation path (idempotent) ---
    if signal.payload.status == "ESCALATED":
      # Already escalated by a prior adopter — skip silently; do NOT re-telegram
      continue

    # First escalation: alert BUG, extend TTL to +86400s, mark ESCALATED
    send_telegram(channel="bug",
      message="[orch] Orphan task {original_task_id} exceeded N_MAX=3 re-dispatches — ESCALATED. Last owner: {signal.payload.original_owner_client_session}. Manual intervention required.")
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id:              "orphan-signal:" + original_task_id,
      owner_client_session: $CLAUDE_CODE_SESSION_ID,
      ttl_seconds:          86400,       # keep ESCALATED row visible for 24h
      payload_patch:        {"status": "ESCALATED"}   # extend + mark
    })
    # Do NOT re-dispatch — stop here for this signal
    continue

  # --- Adoption path (redispatch_count < N_MAX) ---
  adopt_result = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:              original_task_id,       # stale-steal succeeds: reaper deleted original
    task_kind:            original_task_kind,
    owner_agent:          <dispatcher-role>,
    owner_client_session: $CLAUDE_CODE_SESSION_ID,   # REQUIRED — authoritative key
    ttl_seconds:          3600,
    payload:              {"site": "orphan-adoption",
                           "adopted_from": signal.payload.original_owner_client_session,
                           "redispatch_count": redispatch_count}   # DoD-P15-3: carry forward
  })

  if adopt_result.claimed:
    # Read checkpoint from signal payload per §6.5.5 resume-contract table
    # sprint-task    → last_payload.git_sha (CONTINUE from last commit; do NOT restart)
    # cowork-slot    → task_list_held(task_id="published:<kind>:<period>") — if present, skip (DoD-P15-2)
    # dashboard-row  → re-compute + re-write (idempotent by design; no checkpoint needed)

    # DoD-P15-1: router DEFERS tree-hygiene to dev-team Step 0a (P1.5-AF-2)
    # Router routes, never implements. For sprint-task adoptions, spawn dev-team with checkpoint
    # and let dev-team perform git status + git checkout revert BEFORE resuming.
    try:
      spawn <agent-for-original_task_kind>(
        run docs/agents/<agent>/flow/main.md
        coordination_session=$CLAUDE_CODE_SESSION_ID
        task=<original_task_id>
        checkpoint=<last_payload>
        redispatch_count=<redispatch_count>
        mode=adopt-resume
      )   # run_in_background=true (BGFAN-1 mandate)
    finally:
      call_tool(server="vn-market", tool="task_release", arguments={
        task_id:              "orphan-signal:" + original_task_id,
        owner_client_session: $CLAUDE_CODE_SESSION_ID
      })
      # Release the ORIGINAL task_id claim AFTER dev-team confirms resume (or on failure)
      # Inner self-claim inside the agent will heartbeat the original lock

  else:
    # Another live session adopted it concurrently — log and skip
    log "[router] orphan-signal:{original_task_id} — adoption lost to peer; skip"

# --- Phase B: PRE-CLAIM gate (existing Step 2.5) — runs AFTER adoption probe clears ---
# Proceed with standard intent PRE-CLAIM as defined above (Pattern section)
```

**Dispatch scope for orphan-adoption:** the router fires the adoption probe for its own dispatcher
role (e.g. `owner_agent="router"` or the role that spawned the dead session's work).
`dev-team` orphan-signals are drained in dev-team Step 0a (TASK_1987), not here.
The router adoption probe covers: `intent:*` claims and any router-owned sprint-task dispatches.

**Resume contract summary (§6.5.5):**

| original_task_kind | Checkpoint field | Resume action |
|---|---|---|
| `sprint-task` | `last_payload.git_sha` | Spawn dev-team with checkpoint SHA; dev-team performs tree-hygiene (DoD-P15-1) |
| `cowork-slot` | probe `published:<kind>:<period>` via `task_list_held` | If published: skip (DoD-P15-2). Else resume from first unpublished sub-step |
| `dashboard-row` | None — idempotent by design | Re-compute + re-write directly |

---

## Phase A.5 — Presence Roster Read (READ-ONLY advisory)

**Sprint:** CROSS-SESSION-MULTI-TEAM-ORCH · TASK_1991  
**Fires:** AFTER Phase A orphan-adoption probe, BEFORE Phase B PRE-CLAIM gate.  
**Purpose:** Surface the live cross-team roster so the router sees who is working across all sessions before locking a new intent.

```
# Phase A.5 — Read presence roster (advisory; non-blocking)
roster = call_tool(server="vn-market", tool="task_list_held", arguments={
  kind: "session-presence"
})

# Result row structure:
# {
#   task_id:              "session-presence:<session-uuid>",
#   task_kind:            "session-presence",
#   owner_agent:          "<dispatcher-role>",          # e.g. "dev-team", "cowork-dispatcher"
#   owner_client_session: "<session-uuid>",              # identity key
#   payload: {
#     agent_id:     "<dispatcher-id>",                   # e.g. "dev-team", "cowork-team"
#     host:         "<hostname>",
#     started_at:   "<ISO8601>",
#     current_task: "<task-id or 'dispatch-init'>"      # advisory, best-effort
#   },
#   heartbeat_at: "<ISO8601>",
#   expires_at:   "<ISO8601>"
# }

# Log compact roster for observability
roster_summary = []
for each row in roster:
  roster_summary.append(row.payload.agent_id + "/" + row.payload.host + "/" + row.payload.current_task)

log "[router] session-presence roster: [" + join(roster_summary, ", ") + "]"

# Cross-session collision detection — same agent_id in multiple live sessions
agent_id_counts = count_by(roster, field="payload.agent_id")
for each (agent_id, count) in agent_id_counts:
  if count > 1:
    log "[router] WARN: " + agent_id + " active in " + count + " sessions — potential overlapping work"

# Roster read is READ-ONLY advisory — ALWAYS proceed to Phase B regardless of result.
# Zero rows = no peer sessions live (single-team / fresh startup) — proceed silently.
# Same agent_id in N sessions = expected during multi-team ops (cowork-team parallel runs);
# warn but allow.  Phase B PRE-CLAIM is the authoritative hard gate.
```

**Example log output (2 teams live):**
```
[router] session-presence roster: [dev-team/host-1/TASK_1990, cowork-dispatcher/host-1/dispatch-init, dev-team/host-2/TASK_500]
[router] WARN: dev-team active in 2 sessions — potential overlapping work
```

**What this is NOT:**
- Not a gate — never blocks dispatch, even on duplicate agent_id warning.
- Not a replacement for Phase B PRE-CLAIM (that is the authoritative hard mutex).
- Not an adoption probe — stale presence rows simply expire; they are never adopted (P2 INVARIANT in § Step 0a).

---

## Reference Commits (Sprint 1962c — outer wrap origin)

- `docs/agents/dev-team/flow/execute-tier.md` (S1) — `592fe1c4`
- `docs/agents/dev-team/flow/main.md` (S2/S3/S4) — `348443d1`
- `.claude/agents/developer.md` (S5) — `587f4265`
- `.claude/agents/ba.md` (S6) — `7ae26e3b`
- pm fan-out (S7) — `5ecf426c`

**LIFTED TO ROUTER SCOPE:** sprint CROSS-SESSION-MULTI-TEAM-ORCH (TASK_1977) —
rebinds from agent-scope `sprint-task:` to router-scope `intent:` namespace; requires
`owner_client_session` on all claims. See brief §3.1.
