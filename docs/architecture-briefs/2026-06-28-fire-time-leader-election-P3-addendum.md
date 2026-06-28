# P3 Design Addendum — Fire-Time Leader Election for Sub-Daily Crons

**Date:** 2026-06-28
**Author:** agents-architect
**Status:** READY-FOR-AGENT-FATHER (P3-AF-1)
**Slug:** fire-time-leader-election-P3-addendum
**Companion brief:** `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §7-P3
**Blocks:** TASK_1994 (P3-AF-1)
**Sprint:** CROSS-SESSION-MULTI-TEAM-ORCH / P3

---

## Context Summary

The base brief §7-P3 defines the goal: replace the operator OBSERVE-ONLY / defer-to-live-leader convention with a code-enforced fire-time election. Each cron tick claims `cron:<flow>:<period-key>`; only `{claimed:true}` fires. The base brief specifies the weekly/daily period-key contract but explicitly defers sub-daily granularity. This addendum closes that gap with EXACTLY the 5 items the task requires. No scope beyond them.

**P1 is a hard prerequisite:** `owner_client_session` column in `task_locks` must exist and the matching-ladder must be rebound before any P3 code ships. The fire-time election is meaningless without per-session attribution.

---

## §A — Sub-Daily Fire-Time Period-Key

### A.1 The gap

The base brief §3.1 assigns cron ticks the period-key `date-range string (2026-06-23/2026-06-29)`. This is a WEEKLY date-range — it is the RIGHT key for the `published:<kind>:<period>` ARTIFACT dedup (prevent double-publishing the same weekly report). It is the WRONG key for fire-time leader election: two cowork ticks on the same Monday (`14:30` and `14:45`) would share the same weekly date-range, meaning only the first tick of the week ever elects a leader and all subsequent ticks fail the claim unconditionally.

Sub-daily fires require a TICK-BOUNDARY period-key: one key per actual cron fire, distinct from all other fires.

### A.2 Tick-boundary period-key formula

**Definition:** the period-key for fire-time election is the **floor of the actual fire timestamp to the cron's scheduled boundary**, expressed in ISO 8601 UTC at minute precision: `YYYY-MM-DDTHH:MMZ`.

The "floor to scheduled boundary" is defined per cron type:

| Expression | Algorithm | Period-key |
|---|---|---|
| `*/N` (regular interval) | `floor(current_minute / N) * N` → boundary minute | `YYYY-MM-DDTHH:{boundary_MM}Z` |
| `M1,M2 * * * *` (enumerated minutes) | largest scheduled minute ≤ current_minute in same hour | `YYYY-MM-DDTHH:{scheduled_MM}Z` |
| `0 */H * * *` (every H hours at :00) | `floor(current_hour / H) * H` → boundary hour | `YYYY-MM-DDTHH:00Z` (H-aligned) |
| `0 HH * * *` (specific hour daily) | the fixed `HH:00` | `YYYY-MM-DDTHH:00Z` |

Implementation note: the running session computes this locally with `date -u`. CronCreate fires within ±2 min of the scheduled time, so the floor formula deterministically converges multiple sessions firing on the same tick to the SAME period-key string.

### A.3 Concrete examples for the live fleet

**Fleet cron schedules** (from `.claude/skills/cron-detect-loop/SKILL.md`):

| Flow | Expression | Fires at | Period-key for session firing at 14:32 UTC |
|---|---|---|---|
| cowork-team | `*/15 * * * *` | :00, :15, :30, :45 | `cron:cowork:2026-06-28T14:30Z` |
| dev-team | `7,37 * * * *` | HH:07, HH:37 | `cron:dev-team:2026-06-28T14:07Z` |
| auditor-t1 | `*/30 * * * *` | :00, :30 | `cron:auditor-t1:2026-06-28T14:30Z` |
| auditor-t2 | `0 */4 * * *` | 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 | `cron:auditor-t2:2026-06-28T12:00Z` |
| auditor-t3 | `0 2 * * *` | 02:00 UTC | `cron:auditor-t3:2026-06-28T02:00Z` |

Edge cases:
- Session fires at 14:07 for dev-team `7,37`: current_minute=07 ≥ first_scheduled(7) → period-key = `cron:dev-team:2026-06-28T14:07Z`
- Session fires at 14:08 (2 min jitter): current_minute=08, largest scheduled ≤ 08 in {7,37} = 7 → same key `cron:dev-team:2026-06-28T14:07Z`. Jitter is absorbed.
- Session fires at 14:40 for dev-team: largest scheduled ≤ 40 in {7,37} = 37 → `cron:dev-team:2026-06-28T14:37Z`.

### A.4 Distinct from artifact dedup

`published:<kind>:<date-range>` and `cron:<flow>:<tick>` serve different purposes and MUST NOT be conflated:

| Property | `published:<kind>:<date-range>` | `cron:<flow>:<tick>` |
|---|---|---|
| Purpose | Prevent double-publish of same period artifact | Elect exactly one leader per cron fire |
| Granularity | Daily or weekly date-range | Per cron tick (minutes resolution) |
| TTL | 86400s (daily) / 691200s (weekly) | 600s (dispatch window only) |
| task_kind | `cowork-slot` (existing) | `cowork-slot` (cowork) / `sprint-task` (dev-team, auditor) |
| Who queries `task_list_held`? | CHEF publisher gate (prevent re-publish) | Not queried — election is claim-only |
| Released? | Never (expires naturally) | Yes — explicit `task_release` after dispatch |

Both live in `task_locks`. The task_id prefix disambiguates them in log output and any future queries.

### A.5 Canonical task_id scheme

```
cron:<flow-slug>:<YYYY-MM-DDTHH:MMZ>
```

where `<flow-slug>` is:
- `cowork` — cowork-team master dispatcher
- `dev-team` — dev-team cron orchestration flow
- `auditor-t1` — system-auditor Tier-1
- `auditor-t2` — system-auditor Tier-2
- `auditor-t3` — system-auditor Tier-3

Examples:
```
cron:cowork:2026-06-28T14:30Z
cron:dev-team:2026-06-28T14:07Z
cron:auditor-t1:2026-06-28T14:30Z
cron:auditor-t2:2026-06-28T12:00Z
cron:auditor-t3:2026-06-28T02:00Z
```

---

## §B — Election Layer: Dispatcher-Level (Recommended)

### B.1 Two options

**Option 1 — Dispatcher-level election:** The cron dispatcher as a whole claims `cron:<flow>:<tick>`. Only the winner runs the full dispatch pipeline (Steps 0c–6 for cowork; Steps 0a–exit for dev-team). Exactly one session per tick does all work.

**Option 2 — Per-slot election:** Each cowork work slot (`news-scout`, `market-watcher`, etc.) independently claims `cron:cowork:<slot-id>:<tick>`. Multiple sessions could fire concurrently, each winning some slots.

### B.2 Tradeoff matrix

| Dimension | Dispatcher-level | Per-slot |
|---|---|---|
| Complexity | LOW — one claim per tick; mirrors existing leader-lock design | HIGH — N claims per tick (N = matching slots); each session must coordinate shared pressure-state reads |
| Correctness | HIGH — one session owns the full stateful pipeline (pressure-read → cadence → snapshot → fanout) | RISK — multiple sessions touching `docs/data/cowork-schedule.json` cadence state and `tick-snapshot.md` concurrently; scheduling decisions may conflict |
| Latency | One election per tick adds ~50ms latency (single tool call) | N elections per tick; net latency similar but with more failure points |
| Availability | Single-leader crash = missed tick; P1.5 orphan-signal or natural re-queue at next tick | Higher per-slot availability in theory; negated by shared-state race risks |
| Audit / debug | One lock row per tick in `task_locks`; trivial to read election history | N lock rows per tick; harder to diagnose |
| Compatibility with existing slot-claim.md | Slot claims (Step 4.6) remain as intra-dispatch per-slot dedup; no conflict | Would overlap with Step 4.6 slot claims — two dedup layers with different semantics |

### B.3 Recommendation: DISPATCHER-LEVEL

The cowork dispatcher is a stateful pipeline. The shared state it writes (`tick-snapshot.md` output, `last_fired` in `cowork-schedule.json`, `pressure-state`) is designed for a SINGLE writer per tick. Per-slot election would require full shared-state locking for the pipeline state, multiplying complexity with no material reliability gain (crash recovery is already covered by P1.5 orphan-signals and natural per-slot re-queue via cadence).

The existing Step 4.6 per-slot claims remain unchanged — they are intra-dispatch dedup gates (prevent the same dispatcher from double-firing the same slot within one tick), not cross-session election. P3 adds the outer dispatcher-level election BEFORE Step 4.6 is ever reached.

### B.4 Lock granularity

One claim per tick per flow:

```
# cowork main.md Step 0b (replaces leader-lock.md current design)
TICK = floor_to_15min(UTC_now)   # e.g. "2026-06-28T14:30Z"
FIRE_CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "cron:cowork:" + TICK,
  task_kind:            "cowork-slot",
  owner_agent:          "cowork-dispatcher",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          600,
  payload:              {"site": "fire-election", "tick": TICK}
})
```

Non-elected sessions see `{claimed:false, current_holder.owner_client_session != self}` → EXIT. No heartbeat probe, no self-held check — the anti-pattern is already deleted by P1-AF-3.

### B.5 Implication for TASK_1991 roster read

The elected dispatcher is the SOLE reader/writer of the tick pipeline (match-slots, pressure, snapshot, fanout). Non-elected sessions EXIT at the fire-time election and never reach any of those steps. TASK_1991's roster read (reading `cowork-schedule.json` in spawn-fanout.md) is therefore executed by exactly one session per tick — no coordination needed there.

---

## §C — Dev-Team SF-1 Integration

### C.1 The two guards

Dev-team has a pre-existing session-singleton guard (SF-1) that is DIFFERENT from the fire-time election:

| Guard | task_id | TTL | Purpose |
|---|---|---|---|
| SF-1 (existing) | `dev-team-cron-singleton` | 5400s | Session-level overlap guard: prevents one session from running two overlapping ticks |
| Fire-time election (P3 new) | `cron:dev-team:<tick>` | 600s | Cross-session dedup: prevents two different sessions from both running the same tick |

They are complementary. Neither replaces the other.

### C.2 Integration: ordering within Step 0-PREFLIGHT

```
# dev-team/flow/main.md Step 0-PREFLIGHT (current + P3 additions marked NEW)

[1] Self-arm cron-detect-loop (existing)
[2] SF-1 claim (existing):
    sf_result = task_claim(task_id="dev-team-cron-singleton", task_kind="sprint-task",
                  owner_client_session=$CLAUDE_CODE_SESSION_ID, ttl_seconds=5400, ...)
    if not sf_result.claimed:
      peer_session = sf_result.current_holder.owner_client_session
      if peer_session == $CLAUDE_CODE_SESSION_ID:
        # Re-entrant — own prior tick still running. Skip this tick. (existing behavior)
      else:
        # Peer session holds SF-1 — another session is mid-tick. Skip. (existing behavior)
      JUMP TO end

[3] NEW — Fire-time election:
    TICK = compute_tick_boundary(cron_expression="7,37 * * * *", now=UTC_now)
    # e.g. "2026-06-28T14:07Z"
    fire_result = task_claim(task_id="cron:dev-team:" + TICK, task_kind="sprint-task",
                   owner_agent="dev-team",
                   owner_client_session=$CLAUDE_CODE_SESSION_ID,
                   ttl_seconds=600,
                   payload={"site":"fire-election","tick":TICK})
    if not fire_result.claimed:
      log "[dev-team] fire-time election SKIP — peer session leads tick " + TICK
        + " (holder: " + fire_result.current_holder.owner_client_session + ")"
      send_telegram(channel="work", "[dev-team] fire-election SKIP tick=" + TICK)
      # Release SF-1 so this session is free for future ticks
      task_release(task_id="dev-team-cron-singleton", owner_client_session=$CLAUDE_CODE_SESSION_ID)
      JUMP TO end

# Both SF-1 and fire-election claimed — proceed with full tick.
[4] HEAD.lock guard + worktree GC (existing)
[5] GCC-PREFLIGHT, drain, ... (existing)
```

### C.3 Why SF-1 first, then fire-election

1. SF-1 failure means this session is already mid-tick (own prior lock) OR another session is mid-tick. Either way this session cannot safely run another tick. No point attempting fire-election.
2. Passing SF-1 means the session is free. Then fire-election determines whether THIS session leads THIS specific tick.
3. On fire-election loss, SF-1 MUST be released so the session can win SF-1 on the next tick without fighting a stale self-held lock.

### C.4 Deadlock analysis

No deadlock possible:
- SF-1 and fire-election are independent rows in `task_locks`; they do not depend on each other for acquisition order.
- Session A holds SF-1 + fire-election → proceeds. Session B tries SF-1 → fails (A holds it) → EXITS before fire-election. No cross-contention.
- Session A long-running (holds SF-1 for 90 min) while session B fires at next tick: session B's SF-1 claim fails (A holds it). This is CORRECT behavior — session A is running; session B skips. Under P3 this is unchanged from pre-P3 behavior.

### C.5 Flow diagram (prose)

```
Session B cron tick fires (14:37):
  SF-1 claim → {claimed:false, peer=A} → EXIT (session A is mid-tick; B skips entirely)

Session A completes tick, releases SF-1 (14:52):
  Next tick fires (15:07):
  Session B SF-1 claim → {claimed:true} (A released it)
  Session B fire-election claim → {claimed:true} (new tick key "cron:dev-team:2026-06-28T15:07Z")
  → Session B proceeds with full tick

Session C fires at 15:07 concurrently:
  Session C SF-1 claim → {claimed:false, peer=B} → EXIT
  (or: C wins SF-1 before B; then B's SF-1 fails; then C does fire-election and wins if B lost SF-1)
```

The cross-session dedup is guaranteed: SF-1 + fire-election together ensure at most one session runs per tick, even in a 3+ session fleet.

---

## §D — Lease Semantics During Dispatch Window

### D.1 TTL specification

**Recommended TTL: 600 seconds for all fire-time election locks.**

Rationale:
- Cowork dispatch (Steps 0c–6) completes in 30–120s in the steady state; 600s is 5× the observed p99.
- Dev-team preflight and drain (Steps 0a through session-gate) complete in 30–180s before spawning sub-agents; 600s covers this window.
- Auditor tiers are lighter; 600s is amply generous.
- 600s is well within the minimum inter-tick interval (cowork: 900s, dev-team: 1800s). A stale-stolen fire-election lock from a crashed session is reclaimed before the next tick.
- Contrast with the current `cowork-leader` TTL=1800s: that was a STICKY 2-tick leadership design. P3 is per-fire — no stickiness needed, hence shorter TTL.

TTL table:

| Flow | Cron interval | Fire-election TTL | Ratio TTL/interval |
|---|---|---|---|
| cowork | 900s (15 min) | 600s | 0.67 — fires stale-expire before next tick |
| dev-team | 1800s (30 min) | 600s | 0.33 |
| auditor-t1 | 1800s (30 min) | 600s | 0.33 |
| auditor-t2 | 14400s (4 h) | 600s | 0.04 |
| auditor-t3 | 86400s (24 h) | 600s | 0.007 |

### D.2 Heartbeat: NOT NEEDED

The fire-time election lock is held for the duration of the dispatch window only. Key argument:

- TTL=600s covers the full dispatch window with margin. No single dispatch body runs longer than 600s before spawning sub-agents into the background.
- Adding a heartbeat would require the dispatcher to time its own body duration and interleave tool calls — significant complexity for zero gain.
- The `cowork-leader` TTL=1800s heartbeat (at Step 4.6b) was needed because the sticky leader held the lock across TWO 15-min tick cycles. P3's per-fire lock has no inter-tick stickiness — it is scoped to one dispatch act.
- Conclusion: **no heartbeat for fire-time election locks.** If a dispatch body genuinely approaches 600s (pathological slowness), the TTL expires → stale-steal by the next firing session → idempotent duplicate-dispatch attempt → per-slot `published:<kind>:<period>` dedup and per-tick `cron:<flow>:<tick>` ensure correct behavior.

### D.3 Explicit release (mandatory)

The elected session MUST call `task_release` on `cron:<flow>:<tick>` at the end of the dispatch body. TTL is the crash-safety backstop, not the normal exit path.

Release points:
- **cowork:** after Step 6 (telemetry) completes — the last step in `cowork-team/flow/main.md`
- **dev-team:** at the `jump:end` Session Exit block, alongside SF-1 release
- **auditor tiers:** at the end of their respective flows

On crash: TTL=600s expires; the `cron:<flow>:<tick>` key is stale-stolen by nobody (it's a fire-time key unique to that tick; the next tick will use a new key). The original tick's work items are recovered via P1.5 orphan-signals (sprint-tasks) or natural re-queue via cadence (cowork slots).

### D.4 Stale leader reclaim: timing relative to next fire

```
Tick T:      session A claims cron:cowork:2026-06-28T14:30Z  (TTL=600s)
             session A crashes at t=60s (40s into dispatch)
             lock expires at t=60+600=660s from claim time
             stale-steal available from t=660s onward

Next tick T+1:
             fires at t=900s (T+15min relative to T)
             Session B claims cron:cowork:2026-06-28T14:45Z  ← NEW key, no contention
             Session B simultaneously queries for orphan-signals (P1.5) for missed work
             tick T's lock key is irrelevant at tick T+1 — different task_id
```

The stale lock from tick T is GC'd by the server-side reaper (600s interval per P1.5-MCP-3). It never blocks tick T+1. This is the P1.5 liveness connection: per-tick keys make the orphan detection window bounded by TTL+300s grace = 900s — safely within one inter-tick interval for cowork (900s interval).

---

## §E — Retirement Path for OBSERVE-ONLY Conventions

### E.1 Inventory of patterns to retire

Three classes of OBSERVE-ONLY / defer patterns exist in the codebase and memory files:

**Pattern 1 — `feedback_router_cowork_defer_to_live_leader` (memory file)**
Convention: "Router cowork OBSERVE-ONLY — parallel terminal owns cowork."
Effect: the router session manually refrains from dispatching cowork when another terminal is running.
Location: MEMORY.md pointer (not in executable flow); enforced by human discipline only.
Superseded by: P3 fire-time election for cowork (any session attempts the election; only the winner fires; the router session cannot accidentally double-dispatch because it would lose the election).

**Pattern 2 — `feedback_router_manual_drive_overlaps_devteam_loop` (memory file)**
Convention: "pick ONE owner" — don't manually drive dev-team when cron loop is running.
Effect: operator picks which terminal is the "manual drive" owner.
Location: MEMORY.md pointer; enforced by human discipline only.
Superseded by: SF-1 + fire-time election for dev-team (any session attempting to run dev-team when a peer holds SF-1 exits cleanly without operator intervention).

**Pattern 3 — Sticky `cowork-leader` lock (executable flow — `leader-lock.md`)**
Convention: TTL=1800s sticky leadership. The PEER-HELD path (`owner_client_session != self → DEFER`) is P1-correct but relies on the 1800s sticky window rather than per-tick election.
Effect: the session holding `cowork-leader` for up to 30 min leads all ticks within that window.
Location: `docs/agents/cowork-team/flow/leader-lock.md` (executable — this is AGENT-FATHER's zone to modify)
Superseded by: P3 per-tick `cron:cowork:<tick>` election. The `cowork-leader` task_id and its 1800s TTL are retired. leader-lock.md is redesigned into a fire-election step (see §B).

### E.2 Retirement sequence

The retirement follows a strict activation gate:

```
Gate: P1 SHIPPED + P2 QA-VERIFIED (per task handoff constraint)
  → P3-AF-1 ships fire-election code (agent-father task, out of scope for this brief)
  → Smoke test: two sessions fire cowork tick simultaneously; verify exactly one {claimed:true}
  → Smoke test: session loses fire-election; verify it EXITs cleanly with WORK telegram
  → Smoke test: cowork dispatch completes; verify lock released; next tick elects fresh
  THEN:
  → Mark feedback_router_cowork_defer_to_live_leader as SUPERSEDED in next MEMORY.md update
  → Mark feedback_router_manual_drive_overlaps_devteam_loop as SUPERSEDED
  → Archive cowork-leader TTL=1800s comment in leader-lock.md (agent-father handles this as part of P3-AF-1)
```

Do NOT retire the convention files before the smoke tests pass. The OBSERVE-ONLY memory files serve as the fallback until the code gate is proven.

### E.3 Cross-module dependencies

The cowork-team OBSERVE affects dev-team Step 1 dispatch indirectly: the human operator avoids manually routing tasks to the cowork dispatcher when a parallel terminal holds the leader. Under P3:
- Dev-team does NOT run the cowork dispatcher — that boundary is enforced by `docs/agents/cowork-team/flow/main.md`'s Team Boundary clause ("NEVER spawn dev-team agents from this dispatcher" + mirror: dev-team "NEVER spawn the cowork-team dispatcher flow").
- The fire-time election governs sessions that ARE the cowork dispatcher or dev-team dispatcher.
- No change needed to dev-team Team Boundary.

The router's PRE-CLAIM gate (CLAUDE.md step 2.5) already handles the router-level collision. Under P3, the same gate applies when the router attempts to spawn a cowork or dev-team dispatcher: the PRE-CLAIM for `intent:cowork-team:<intent-key>` would fail if a peer holds it. This is the router's own layer, independent of the intra-cron fire-time election.

### E.4 What is NOT retired

- The `published:<kind>:<period>` artifact dedup keys: these remain active and unchanged. They prevent double-publish of work artifacts, orthogonal to fire-time election.
- Per-slot claims in Step 4.6 (`slot-claim.md`): these remain as intra-dispatch dedup within an elected session.
- SF-1 (`dev-team-cron-singleton`): retained as the session-level overlap guard (§C). It is NOT superseded by fire-time election.
- The backstop-window defer gate in `leader-lock.md` (AF-1 logic): the error path (lock call itself errors) is independent of whether the election is per-tick or sticky. The backstop defer gate must be preserved in the redesigned flow.

---

## P3-MCP Verdict

**P3-MCP: NOT NEEDED. Reuse existing surface.**

Analysis:
- Fire-time election uses `task_claim` + `task_release` with existing parameters. P1 already adds `owner_client_session` to the tool schema — P3 needs no additional parameters.
- `task_kind` values: reuse existing enum.
  - Cowork fire-time election: `task_kind: "cowork-slot"` — consistent with the existing `cowork-leader` claim in `leader-lock.md`.
  - Dev-team fire-time election: `task_kind: "sprint-task"` — consistent with the existing SF-1 (`dev-team-cron-singleton`) in dev-team/flow/main.md.
  - Auditor fire-time election: `task_kind: "sprint-task"`.
- No `task_list_held` queries needed for the fire-time election itself: the election is claim-only. Sessions do not need to enumerate who won prior ticks; they only need `{claimed:true/false}` on their own attempt.
- No new columns, no new tables, no new tools, no new enum values.

The semantic distinction between `cron:<flow>:<tick>` and `cowork-slot:<slot-id>:<period>` is preserved via the `task_id` prefix, not via `task_kind`. `task_list_held(kind="cowork-slot")` will mix fire-time election locks and per-slot claims, but fire-time locks are short-lived (TTL=600s) and their `task_id` prefix (`cron:`) makes them trivially distinguishable in any log or manual inspection.

If a future monitoring need arises (e.g., a dashboard showing active fire-time elections), a new `cron-fire` task_kind would enable `task_list_held(kind="cron-fire")` queries. That is a P3b/P4 concern — not blocking P3.

**Router action: skip P3-MCP task mint.**

---

## Implementation Contract for TASK_1994 (P3-AF-1)

Agent-father must implement the following changes. Scope: `docs/agents/` + `.claude/skills/`. No `apps/` code.

### P3-AF-1-a: Redesign `docs/agents/cowork-team/flow/leader-lock.md`

Replace the sticky `cowork-leader` (TTL=1800s) design with a fire-time election:

```
# Step 0b — Fire-time election (replaces leader-lock.md current design)

TICK = compute_tick_boundary(cron_expression="*/15 * * * *", now=UTC_now)
# e.g. "2026-06-28T14:30Z"

FIRE_CLAIM = task_claim(
  task_id:              "cron:cowork:" + TICK,
  task_kind:            "cowork-slot",
  owner_agent:          "cowork-dispatcher",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          600,
  payload:              {"site": "fire-election", "tick": TICK}
)

# Backstop-window defer gate (AF-1 — Root A fix) PRESERVED:
# When task_claim call ITSELF errors/times-out → apply backstop-window logic (unchanged)
# See docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md §Primitive-1

if FIRE_CLAIM.claimed == true:
  log "[cowork] fire-election WON tick=" + TICK + " → proceeding"
  → PROCEED (continue to Step 0c)

else:
  peer = FIRE_CLAIM.current_holder.owner_client_session
  if peer == $CLAUDE_CODE_SESSION_ID:
    # Own prior lock for this tick (re-entrant — restart within same session mid-tick)
    log "[cowork] fire-election RE-ENTRANT tick=" + TICK + " → renew + proceed"
    task_heartbeat(task_id="cron:cowork:"+TICK, owner_client_session=$CLAUDE_CODE_SESSION_ID)
    → PROCEED
  else:
    # Peer session leads this tick
    log "[cowork] fire-election LOST tick=" + TICK + " — peer=" + peer + " → EXIT"
    send_telegram(channel="work", "[cowork] fire-election SKIP tick=" + TICK)
    EXIT

# At end of Step 6 (telemetry), release:
task_release(task_id="cron:cowork:"+TICK, owner_client_session=$CLAUDE_CODE_SESSION_ID)
```

**REMOVE:** the old `cowork-leader` sticky task_id, TTL=1800s, and the `# Backstop-Window Defer Gate` trigger on error must be re-attached to the FIRE_CLAIM call (not the old claim).
**PRESERVE:** the backstop-window defer gate logic (AF-1) for the error case. Attach it to the new `task_claim` call on the `FIRE_CLAIM call errored` branch.

### P3-AF-1-b: Add fire-time election to `docs/agents/dev-team/flow/main.md` Step 0-PREFLIGHT

Insert Step [3] as described in §C.2. Place it AFTER SF-1 claim, BEFORE HEAD.lock guard. On fire-election loss: release SF-1 + EXIT.

Add `compute_tick_boundary` invocation with expression `"7,37 * * * *"`.

On dev-team Session Exit (`jump:end`): release fire-election lock alongside SF-1 release.

### P3-AF-1-c: Add fire-time election to auditor tier flows

For each system-auditor tier, add a fire-time election claim before the main audit body:

```
# system-auditor Tier-1 (*/30 * * * *):
TICK = compute_tick_boundary(cron_expression="*/30 * * * *", now=UTC_now)
FIRE_CLAIM = task_claim(task_id="cron:auditor-t1:"+TICK, task_kind="sprint-task",
               owner_agent="system-auditor", owner_client_session=$CLAUDE_CODE_SESSION_ID,
               ttl_seconds=600, ...)
if not FIRE_CLAIM.claimed: EXIT

# system-auditor Tier-2 (0 */4 * * *):
TICK = compute_tick_boundary(cron_expression="0 */4 * * *", now=UTC_now)
FIRE_CLAIM = task_claim(task_id="cron:auditor-t2:"+TICK, task_kind="sprint-task",
               owner_agent="system-auditor", owner_client_session=$CLAUDE_CODE_SESSION_ID,
               ttl_seconds=600, ...)
if not FIRE_CLAIM.claimed: EXIT

# system-auditor Tier-3 (0 2 * * *):
TICK = "cron:auditor-t3:" + $(date -u +"%Y-%m-%dT02:00Z")   # fixed-time, simpler
FIRE_CLAIM = task_claim(task_id=TICK, task_kind="sprint-task",
               owner_agent="system-auditor", owner_client_session=$CLAUDE_CODE_SESSION_ID,
               ttl_seconds=600, ...)
if not FIRE_CLAIM.claimed: EXIT
```

### P3-AF-1-d: Define `compute_tick_boundary` as an inline helper

Add to `.claude/skills/cron-cowork-team/SKILL.md` and/or `.claude/skills/cron-detect-loop/SKILL.md` the period-key computation helpers per §A.2 above. Each flow that uses fire-time election references this helper inline.

### P3-AF-1-e: Update release points in all flows

Each flow must release its fire-time lock on EVERY exit path (clean exit and error exit). Use `try/finally` pattern where the language supports it; for flow markdown, list the release call in all labeled `EXIT` and `JUMP TO end` blocks.

---

## Decision Rationale Summary

| Item | Decision | Key Reason |
|---|---|---|
| §A Period-key | Floor to scheduled boundary → `YYYY-MM-DDTHH:MMZ` | Only formula that converges sessions firing within ±2min jitter to the same key, for all cron expressions in the fleet |
| §A Distinct from artifact dedup | Separate `task_id` prefixes; different TTLs and purposes | Conflating would either under-dedup ticks or over-dedup artifacts (both are failures) |
| §B Layer | Dispatcher-level | The cowork pipeline is stateful; per-slot concurrent dispatch creates shared-state race; complexity far outweighs marginal availability gain |
| §C SF-1 integration | SF-1 first, fire-election second; fire-election loss releases SF-1 | Preserves existing session-level overlap prevention; adds cross-session dedup without deadlock risk |
| §D TTL | 600s; no heartbeat | Covers dispatch window with 5× margin; per-fire design eliminates the need for stickiness or mid-dispatch renewal |
| §E Retirement | Two-step: P3-AF-1 ships code → smoke tests pass → memory conventions marked SUPERSEDED | Never retire the convention before the code gate is confirmed |
| P3-MCP | Not needed | Fire-time election reuses `task_claim` + existing task_kinds; no new tool surface required |

---

## Open Questions for PO Review

1. **Auditor tier fire-time election scope:** The base brief's P3 scope only mentions cowork and dev-team explicitly. Should auditor tiers (Tier-1/Tier-2/Tier-3) be included in P3-AF-1, or deferred to P3b? Recommendation: include Tier-1 and Tier-2 (they have multi-session overlap risk); Tier-3 fires daily at 02:00 and is unlikely to face multi-session race — include for completeness but low priority.

2. **`compute_tick_boundary` shared skill:** Should this be a standalone `.claude/skills/tick-boundary/SKILL.md`, or inlined into the cron arming skills? Recommendation: inline in each flow's existing skill (avoids a new skill file for a 5-line formula); document the algorithm once in this addendum as the canonical reference.

3. **Cowork-leader TTL=1800s retirement timing:** The sticky cowork-leader was referenced by the backstop-window defer gate. The AF-1 backstop logic MUST be preserved in the redesigned flow (it handles the error case of an unreadable lock, not the election itself). PO confirm: the AF-1 backstop behavior survives the redesign and is reattached to the new fire-election claim.
