# Skill: dispatch-claim

<!-- size-justification: ~593L — TE-T12 lazy-load split (2026-07-31). This file is no longer the
     hot-path read: CLAUDE.md step 2.5 now points at .claude/skills/dispatch-claim/CARD.md (<=40L —
     ownership key, Phase A orphan-probe, Phase A.5 roster, Phase B PRE-CLAIM try/finally). This SKILL.md
     stays large intentionally as the full lazy-loaded reference (namespace spec, Fire-Time Election,
     Step 0a presence self-registration detail, sprint-task task: wrap, session-id passing, two-tier
     model) — read only when CARD.md's edge-path pointers send an agent here for a section, not on
     every dispatch. Reference Commits (Sprint 1962c SHAs) trimmed to a one-line git-log pointer.
     FIX-ORPHAN-FR1-FR3-FR6-SKILL-DISPATCH-CLAIM 2026-08-07 (+95L, 498→593, incl. this header
     delta note): (1) fixed the stale "no payload_patch in the current MCP surface" prose under
     § Updating payload.current_task
     mid-session — now accurately states payload_patch/ttl_seconds/owner_agent are backend-landed
     (FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER) but NOT YET exposed on the live task_heartbeat
     Zod schema, gated on FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS + NFR-3 container
     rebuild; (2) implemented the FR-3 board-state guard in § Orphan-Adoption Probe — runs once
     per sprint-task signal before the redispatch_count>=N_MAX branch, batch-reads .task_board
     once per tick (both flat lanes and active_sprints nesting), classifies by lane membership
     per the architect's backlog+BLOCKED=TERMINAL ruling; (3) added owner_agent to the escalation
     task_heartbeat call (FR-6), annotated NOT-YET-LIVE pending the same interface/rebuild gate.
     TASK-COWORK-MUTEX-001 2026-08-14 (+77L, 593→670): added `## Step 2.4 — Cowork-Slot Cross-Path
     Collision Probe` section (FR-1..FR-4 — COWORK_AGENTS recognition, AGENT_SLOTS/TARGET_SLOTS
     resolution, single `task_list_held(kind="cowork-slot")` probe with client-side prefix match,
     symmetric peer-collision response reusing Phase B's exact text) placed after § Phase A.5 to
     match its own "fires AFTER Phase A.5, BEFORE Phase B" header convention; added a 4-line
     forward-pointer at the top of § Pattern (Phase B) so a reader landing there first still finds
     Step 2.4. CARD.md unchanged (out of scope per architect brief §3 file-level design table —
     Step 2.4 stays in this lazy-loaded reference, same split already used for Step 0a).
     FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE 2026-08-26 (+56L, 678->730):
     revised Step 2.4's FR-3 block from a bare prefix match to a cadence-bounded prefix match —
     Axis D (age-bound, `docs/data/cowork-schedule.json` `.slots[].publish_date_basis` ->
     CADENCE_SEC_BY_BASIS lookup, closes AC-1 unconditionally for both daily 86400s and weekly
     604800s slots, digest-sunday's latent weekly-scale overlap included) landed together with
     Axis C (stale-owner, reuses the Phase A.5 `roster` read already in scope, closes AC-3) per
     architect ruling docs/architecture-briefs/2026-08-23-fix-cowork-published-marker-ttl-cadence-
     mismatch-design.md §3. MARKER_TTL constants and the prefix-match shape itself are UNCHANGED
     (PO's rejected exact-match recommendation stays rejected); only the staleness test is new. -->

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

`task_heartbeat` renews TTL only, by default. FR-1 (`FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER`,
landed 2026-08-07) added an optional `payload_patch` (shallow-merge into the existing `payload`
JSON) at the **backend** layer (`coordinationStore.ts` `heartbeatTask()`), but that param is
**NOT YET reachable through this MCP tool** — the live `task_heartbeat` Zod schema
(`coordinationTools.ts`) still only accepts `task_id`/`owner_client_session`. Exposing
`ttl_seconds`/`payload_patch`/`owner_agent` at the tool-schema layer is
`FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS` (open, unclaimed as of this write), and
per NFR-3 the change is not LIVE until the `apps/mcp-server/` container is rebuilt after that
task ships and its test-before-ship live round-trip gate passes. Until both land, any
`payload_patch`/`ttl_seconds`/`owner_agent` argument passed to `task_heartbeat` (e.g. the
escalation call below) is a documented-but-currently-inert no-op at the tool boundary — use
the release+reclaim pattern to refresh `current_task` today. Since `task_id` embeds
`$CLAUDE_CODE_SESSION_ID`, no peer can steal it in the race window:

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

> **Cowork-slot agents only:** if `<agent>` is one of the 9 cowork-slot agents
> (`docs/data/cowork-schedule.json` `.slots[].agent`), § Step 2.4 — Cowork-Slot Cross-Path
> Collision Probe (below) runs BEFORE this Phase B claim. Non-cowork-slot agents are unaffected
> (FR-5) — proceed directly to Phase B as shown below.

```
# Step 2.5 — PRE-CLAIM before Agent() spawn (router constitution)
# See: CLAUDE.md §"BEFORE spawning any agent — MANDATORY"

outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "intent:<agent>:<intent-key>",   # canonical namespace
  task_kind:            "intent",
  owner_agent:          "<dispatcher-role>",              # role label, NOT ownership key
  owner_client_session: $CLAUDE_CODE_SESSION_ID,          # REQUIRED — authoritative key
  ttl_seconds:          600,
  payload:              {"site": "router", "intent": "<intent-key>"}   # object literal — normalized
                                                                        # to match every other call
                                                                        # site in this skill (was the
                                                                        # one string-form outlier;
                                                                        # payload now accepts either)
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

# --- FR-3 (EC-8): batch-read `.task_board` ONCE per dispatcher tick, BEFORE the signal loop —
# never per-signal. One jq pass covers every flat lane (EC-2 — 95%+ of the board) AND the nested
# `active_sprints[].tasks[]` shape in the same read. Only run when orphan_signals is non-empty
# (the common zero-signal tick pays zero extra board-read cost). ---
board_snapshot = $(jq -c '{
  backlog:        [.task_board.backlog[]?        | {id, status}],
  ready:          [.task_board.ready[]?          | {id, status}],
  in_progress:    [.task_board.in_progress[]?    | {id, status}],
  review:         [.task_board.review[]?         | {id, status}],
  qa:             [.task_board.qa[]?             | {id, status}],
  done:           [.task_board.done[]?           | {id, status}],
  done_verified:  [.task_board.done_verified[]?  | {id, status}],
  active_sprints: [.task_board.active_sprints[]?.tasks[]? | {id, status}]
}' docs/data/orch/orch-state.json)

for each signal in orphan_signals:
  original_task_id      = signal.payload.original_task_id
  original_task_kind    = signal.payload.original_task_kind
  redispatch_count      = signal.payload.redispatch_count   # DoD-P15-3: must carry forward
  last_payload          = signal.payload.last_payload       # durable checkpoint

  # --- FR-3: Board-State Guard — runs ONCE per signal, BEFORE the redispatch_count >= N_MAX
  # branch (EC-3: an already-terminal task must skip BOTH escalation and adoption uniformly —
  # no BUG-telegram noise for a task that's already done, no re-dispatch). Scope:
  # original_task_kind == "sprint-task" ONLY (EC-4) — `cowork-slot`/`dashboard-row` already have
  # kind-appropriate completion checks (published:<kind>:<period> probe / idempotent re-run — see
  # Resume Contract table below) and fall straight through this guard unchanged. ---
  if original_task_kind == "sprint-task":
    bare_id = ltrimstr(original_task_id, "task:")   # EC-1 — original_task_id always carries the outer "task:" wrap; bare .task_board ids never do

    # Single pass over the already-fetched board_snapshot (no re-read of orch-state.json per signal, EC-8).
    lane_hit = null
    for lane in ["backlog", "ready", "in_progress", "review", "qa", "done", "done_verified", "active_sprints"]:
      match = board_snapshot[lane] | select(.id == bare_id) | first
      if match != null:
        lane_hit = {lane: lane, row: match}
        break

    if lane_hit == null:
      board_class = "terminal"   # not found in ANY lane → archived/cold-evicted/detail_ref-only row.
                                  # NEVER default to "active" on absence — an absent row must never re-dispatch.
    elif lane_hit.lane in ["ready", "in_progress"]:
      board_class = "active"
    elif lane_hit.lane in ["review", "qa", "done", "done_verified"]:
      board_class = "terminal"
    elif lane_hit.lane == "backlog":
      board_class = "terminal"   # not-yet-dispatched. Architect ruling (2026-07-22 design brief §2):
                                  # backlog+BLOCKED is TERMINAL — no active carve-out (TASK_2005 precedent:
                                  # "paused pending an external precondition", not "resume automatically").
    elif lane_hit.lane == "active_sprints":
      if lane_hit.row.status in ["TODO", "IN_PROGRESS", "READY", "BLOCKED"]:
        board_class = "active"
      elif lane_hit.row.status in ["REVIEW", "DONE", "DONE_VERIFIED", "CANCELLED", "DEFERRED", "SKIPPED"]:
        board_class = "terminal"
      else:
        board_class = "terminal"   # unrecognized/corrupt status — never default to active. Defense-in-depth:
                                    # orch-validate.mjs Stage-1b checkLaneCoherence() is a HARD FAIL going
                                    # forward, but this guard may still read pre-hard-fail-era corruption
                                    # or a write that bypassed orch-apply.sh.

    if board_class == "terminal":
      log "[<dispatcher-role>] orphan-signal:" + original_task_id + " — board-state guard: " +
          (lane_hit.lane ?? "not-found") + " is terminal, skip (no re-dispatch, no escalation)"
      call_tool(server="vn-market", tool="task_release", arguments={
        task_id:              "orphan-signal:" + original_task_id,
        owner_client_session: $CLAUDE_CODE_SESSION_ID
      })   # best-effort — pre-FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS + NFR-3 rebuild
           # this is a documented no-op ({ok:true, released:0}, sole-key match can't hit a NULL
           # owner_client_session column); becomes a real release via FR-2's null-session ladder
           # once that task ships and the container rebuilds. See NOT-YET-LIVE note above § "Updating
           # payload.current_task mid-session".
      continue   # skip BOTH escalation and adoption branches uniformly for this signal (EC-3)
  # --- End FR-3 guard. board_class == "active" (or original_task_kind != "sprint-task", EC-4
  # out-of-scope) falls through to the existing redispatch_count branch below, unchanged. ---

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
      owner_agent:          <dispatcher-role>,   # FR-6 — required so FR-2's null-session ladder has
                                                  # the owner_agent it needs to match this orphan-signal
                                                  # row (row.owner_agent == the original claim's
                                                  # owner_agent, i.e. this same dispatcher role — see
                                                  # coordinationStore.ts gcExpiredLocks orphan-emit).
                                                  # NOT YET LIVE on this call — see NOT-YET-LIVE note
                                                  # above § "Updating payload.current_task mid-session".
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

## Step 2.4 — Cowork-Slot Cross-Path Collision Probe

**Sprint:** COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS · TASK-COWORK-MUTEX-001
**Spec:** `docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md` §2 (FR-1..FR-5).
**Ruling:** `docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md`
(Candidate A, refined — kind-scoped read probe, zero date-basis duplication).

**Fires:** AFTER Phase A.5 (presence roster), BEFORE Phase B (PRE-CLAIM gate) — cowork-slot agents
ONLY. Non-cowork-slot agents short-circuit immediately at FR-1 and see zero behavior change (FR-5).

**Purpose:** Router `intent:<agent>:<intent-key>` PRE-CLAIM and the cowork dispatcher's
`published:<slot_id>:<period>` guard are disjoint `task_id` strings — `task_claim` gives zero mutual
exclusion across them by construction (confirmed root cause, 3 live occurrences, BA spec §0). This
probe adds one read-only cross-path check before the router spawns a cowork-slot agent, so a router
dispatch cannot double-fire a slot the cowork dispatcher already holds mid-work-window.

```
# --- FR-1: recognize cowork-slot agents — never hardcoded (CLAUDE.md § System Data) ---
COWORK_AGENTS = jq -r '[.slots[].agent] | unique | .[]' docs/data/cowork-schedule.json
# 9 agents / 23 slots as of this write: alert-commander, bctc-analyst, digest-predict,
# fb-market-poster, market-watcher, news-scout, refine_bctc_md, tran-ngoc-bau, unified-agent

if <agent> not in COWORK_AGENTS:
  # FR-5 — byte-identical behavior. Proceed straight to Phase B PRE-CLAIM (§ Pattern above).
  goto Phase B

# --- FR-2: resolve intent-key -> TARGET_SLOTS (multi-slot resolution rule) ---
AGENT_SLOTS = jq --arg a "<agent>" '[.slots[] | select(.agent==$a) | .slot_id]' docs/data/cowork-schedule.json

if <intent-key> in AGENT_SLOTS:
  TARGET_SLOTS = [<intent-key>]   # unambiguous — mirrors the existing trigger_prompt convention
                                   # "run <flow_path> slot=<slot_id>" already used by all 23 slots
else:
  TARGET_SLOTS = AGENT_SLOTS      # generic/manual intent-key — conservative ALL-SLOTS fallback:
                                   # check every slot this agent owns (cost asymmetry: one skipped
                                   # manual spawn is cheaper than a reproduced double-dispatch)

# --- FR-3: cadence-bounded prefix probe — Axis D (age-bound) + Axis C (stale-owner), landed
# together per architect ruling (docs/architecture-briefs/2026-08-23-fix-cowork-published-
# marker-ttl-cadence-mismatch-design.md §3, FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-
# DAILY-CADENCE). Root cause this closes: a bare prefix match has no notion of "which period" —
# MARKER_TTL=100800s (28h, deliberate — ARCH-DECIDE-D, catch-up flow needs it, NOT shortened
# here) outliving a 24h/604800s cadence guarantees a live PRIOR-period marker at the exact
# moment the next fire dispatches (confirmed: chef-evening blocked 100% of fires). Axis D
# bounds the prefix match to markers still inside their OWN slot's cadence window — closes
# AC-1 unconditionally, daily and weekly (digest-sunday's identical latent 24h/week overlap
# included). Axis C reuses the roster this file already read at Phase A.5 (zero extra round
# trip) to also catch a current-period marker whose claiming dispatcher session died — a case
# axis D alone does not cover. Neither axis alone satisfies the full AC set (brief §3). The
# MATCH shape (prefix, not exact period-key) is UNCHANGED — PO's rejected exact-match
# recommendation (po_rescope_note, telegram report 4861) stays rejected; only the staleness
# test is new.
CADENCE_SEC_BY_BASIS = {
  "utc_date": 86400, "vn_date": 86400,
  "iso_week_period": 604800, "vn_date_saturday_anchor": 604800
}

held = call_tool(server="vn-market", tool="task_list_held", arguments={ kind: "cowork-slot", expired: false })
# cron:cowork:<TICK>, cowork-slot:<slot_id>, and published:<slot_id>:<period> all share
# task_kind "cowork-slot" (BA spec §0 table) — one round trip returns every live cowork-side lock.
now = <current unix epoch seconds, e.g. `date -u +%s`>   # `claimed_at` (task_list_held row) is
                                                          # stored as a unixepoch INTEGER
                                                          # (coordinationStore.ts) — same unit,
                                                          # no timezone/date-string conversion.
roster_session_ids = [row.owner_client_session for row in roster]   # `roster` = Phase A.5's own
                                                                     # read (this same cycle,
                                                                     # already in scope) — zero
                                                                     # extra round trip.

collision = null
for slot_id in TARGET_SLOTS:
  SLOT_RECORD = jq --arg s "$slot_id" '.slots[] | select(.slot_id==$s)' docs/data/cowork-schedule.json
  CADENCE_SEC = CADENCE_SEC_BY_BASIS[SLOT_RECORD.publish_date_basis]   # null if basis absent/unmapped

  for row in held:
    if row.task_id == "cowork-slot:" + slot_id: collision = row; break

    if row.task_id starts_with "published:" + slot_id + ":":
      if CADENCE_SEC == null:
        # No known cadence for this slot (the non-guaranteed / non-publish-gate slots whose
        # `publish_date_basis` is null, confirmed live against docs/data/cowork-schedule.json) —
        # byte-identical PRE-FIX prefix-match behavior. This fix is scope-bound to the slots the
        # row's evidence covers; do not silently relax slots never analyzed for this defect.
        collision = row; break

      AGE_SEC = now - row.claimed_at
      if AGE_SEC >= CADENCE_SEC:
        continue   # AXIS D — prior-period marker; structurally cannot describe the CURRENT
                   # window (AC-1/AC-6). No date/timezone/period-string computed — pure
                   # arithmetic on an already-returned field. Keep scanning: a genuinely
                   # current-period marker for this same slot, if one exists, must still block.

      # AGE_SEC < CADENCE_SEC — marker IS within the current period (AC-2, no regression).
      if row.owner_client_session not in roster_session_ids:
        continue   # AXIS C / AC-3 — current-period marker, but the claiming dispatcher
                   # session is absent from the presence roster already read this cycle
                   # (zero extra round trip) → treat as abandoned, not live.

      collision = row; break
  if collision: break
    # Prefix match itself retained deliberately (07-29 ruling) — cadence-agnostic, zero
    # date-basis duplication (EC-4). Only the STALENESS test changed.

# --- FR-4: symmetric response — reuse the EXACT Phase B peer-collision text, same lock class ---
if collision != null:
  log "[router] PRE-CLAIM collision (cowork-slot) " + collision.task_id + " — held by peer session " + collision.owner_client_session
  send_telegram(channel="work", "[router] SKIP: cowork-slot " + collision.task_id + " held by peer session")
  EXIT   # no spawn, no cost — Phase B's own intent: claim is never attempted

# No collision found -> fall through to Phase B PRE-CLAIM unchanged.
```

**Residual risk — bounded, not closed by this probe (architect brief §1, accepted for this row):**
1. Probe-to-spawn TOCTOU: sub-second gap between this read and the router's own Phase B claim +
   `Agent()` call — 1-2 orders of magnitude smaller than the 33s/41s windows in all 3 confirmed
   incidents.
2. Cowork spawn-to-first-gate window (pre-existing, not created by this fix): between the cowork
   dispatcher releasing its own `cowork-slot:<slot_id>` token and the spawned agent's own flow
   reaching its `published:` claim step, neither key is held, so this probe sees no collision. Not
   observed in any of the 3 confirmed occurrences (all had `published:` already held at collision
   time). Out of scope for this row — flagged to PM as an optional future row.

---

**LIFTED TO ROUTER SCOPE:** sprint CROSS-SESSION-MULTI-TEAM-ORCH (TASK_1977) —
rebinds from agent-scope `sprint-task:` to router-scope `intent:` namespace; requires
`owner_client_session` on all claims. See brief §3.1. (Reference-commit SHAs for the
Sprint 1962c outer-wrap origin — dev-team execute-tier.md/main.md, developer.md, ba.md,
pm fan-out — dropped from this always-relevant file; recoverable via `git log --follow`
on those paths or `docs/architecture-briefs/2026-05-21-task-lock-dispatcher-wrap.md`.)
