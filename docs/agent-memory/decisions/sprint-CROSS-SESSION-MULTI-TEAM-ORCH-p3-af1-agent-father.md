# Decision Journal — P3-AF-1 Fire-Time Leader Election Implementation

**task-id:** TASK_1994  
**sprint:** CROSS-SESSION-MULTI-TEAM-ORCH  
**phase:** P3  
**agent:** agent-father  
**session:** 14f8039a-51ce-44f8-a7d9-0ddbe73b994e  
**date:** 2026-06-28  
**status:** REVIEW  

---

## What Was Implemented

5 items per `docs/architecture-briefs/2026-06-28-fire-time-leader-election-P3-addendum.md`:

### 1. Period-Key Scheme

`cron:<flow-slug>:<YYYY-MM-DDTHH:MMZ>` where `TICK = floor(fire_time) to scheduled boundary`.

Corrected the dispatch-claim SKILL namespace table which incorrectly listed "date-range string (2026-06-23/2026-06-29)" as the cron tick period-key. That formula is for `published:<kind>:<period>` artifact dedup — a different purpose, different TTL, different table row. Now separated with clear property comparison.

### 2. Election Layer

Dispatcher-level: one claim per tick per flow. Per-slot Step 4.6 claims (slot-claim.md) preserved as intra-dispatch dedup — unchanged.

Rationale per addendum §B.3: cowork pipeline is stateful. Per-slot concurrent dispatch creates shared-state race on `cowork-schedule.json`, `tick-snapshot.md`, `pressure-state`. Dispatcher-level election gives one session exclusive ownership of the full pipeline.

### 3. Dev-Team SF-1 Integration

SF-1 first (session-level overlap guard, TTL=5400s), fire-election second (cross-session tick dedup, TTL=600s). On election LOSS: release SF-1 before EXIT.

Fire-election LOSS exits before `jump:end` (not via jump:end). SF-1 release is inline on the loss path. `jump:end` releases both SF-1 and FIRE_TICK (guarded by `if FIRE_TICK is set`).

### 4. Lease Semantics

TTL=600s on all fire-election locks. NO heartbeat (per-fire, no stickiness). Explicit `task_release` at every exit path:
- cowork: telemetry.md Step 6 end (normal) + Error Guard (error)
- dev-team: `jump:end` (guarded by FIRE_TICK)
- auditor: end-of-cycle before RETURN

### 5. OBSERVE-ONLY Retirement

Documented in 4 places as "superseded pending P3-QA (TASK_1995) sign-off":
- `docs/agents/cowork-team/flow/leader-lock.md` (header + inline comments)
- `.claude/skills/cron-cowork-team/SKILL.md § P3-OBSERVE-ONLY-RETIREMENT`
- `.claude/skills/cron-detect-loop/SKILL.md § P3-OBSERVE-ONLY-RETIREMENT`
- `.claude/skills/dispatch-claim/SKILL.md § Fire-Time Election`

OBSERVE-ONLY conventions remain as authoritative FALLBACK until TASK_1995 smoke tests pass. Memory-file retirement is owed at TASK_1995 sign-off.

---

## Activation Gate

The new fire-election protocol is the shipped standard from TASK_1994 merge. Live sessions started before this commit continue running the old protocol (they loaded the old leader-lock.md into memory). New sessions/ticks use the new file. This is the staged cutover — additive, not breaking.

The live peer session (eb8b5309, dev-team) is protected: dev-team/flow/main.md changes are additive in PREFLIGHT body; the peer is already past PREFLIGHT on its current tick. On next tick, the peer will execute the new Step [3].

---

## What Was NOT Changed

- `published:<kind>:<period>` artifact dedup keys — unchanged (separate purpose, TTLs)
- Per-slot Step 4.6 claims — unchanged (intra-dispatch dedup)
- SF-1 (`dev-team-cron-singleton`) — retained as session-level overlap guard
- AF-1 backstop-window defer gate — preserved in leader-lock.md, reattached to FIRE_CLAIM error path
- `apps/` code — no changes (sprint is docs-only per addendum)

---

## Blocks

TASK_1995 (P3-QA): 3 smoke tests on the fire-election protocol before OBSERVE-ONLY retirement is finalized.
