# Orphan-adoption terminal guard — first live reproduction (2026-08-25)

**Evidence doc.** Filed by dev-team (router-executed tick 06:37Z, session `036ceaf1`).
This is NOT a new work item. Existing coverage already owns the fix:

| Row | Lane | Status | Note |
|---|---|---|---|
| `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` | `backlog[]` | BLOCKED (P0 epic wrapper) | "Orphan-adoption board-state guard (both paths) + stop false-orphaning long agents + clearable reaper orphans" |
| `FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD` | `ready[21]` | READY, P1, `dispatch_lane: null` | "implement FR-4 read-guard + FR-5 board-flip write in dev-team/flow/main.md" — **this is the exact guard that would have fired** |

## What happened

The FR-4 read-guard has never had a recorded live trigger. It got one today.

1. Docker Desktop VM hard-failed 05:47:39Z (`FATAL: running services: running fs: injecting event blocked for 60s`), recovered 06:32:52Z — 45m13s of gateway blindness.
2. During the outage, session `036ceaf1`'s lock `task:TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY` expired on TTL. Nothing crashed; the holder simply could not reach the gateway to heartbeat.
3. **06:33:55Z — 63 seconds after the daemon returned** — server-reaper minted `orphan-signal:task:TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY`, `redispatch_count=1`, `last_payload={"site":"SECONDARY-DRAIN","spawning":"dev-mcp-server"}`.
4. That task is **terminal**: `status=DONE_VERIFIED`, `next_agent=null`. By the time of adoption it had also been evicted out of the hot board entirely, into `docs/data/orch/archive/2026-08.json`.

## Why Phase A would have re-shipped it

`.claude/skills/dispatch-claim/CARD.md` Phase A gates adoption on exactly one condition:

```
if s.payload.redispatch_count >= N_MAX:   # 1 >= 3  ->  false
```

There is no terminal-state check. With that gate passed, Phase A proceeds straight to
`task_claim(original_task_id)` and then `spawn(agent, mode=adopt-resume)` — i.e. it would have
spawned `dev-mcp-server` against already-shipped, QA-verified, archived work.

Adoption was withheld by hand this tick. Nothing automatic prevented it.

## One design note the FR-4 implementation must not miss

The row was **not resolvable in the hot board** at the moment of adoption — it had already been
cold-evicted. A hot-only read-guard would see `not found`, not `terminal`.

**`not found` must not be treated as adoptable.** The guard has to consult the cold archive
(`docs/data/orch/archive/YYYY-MM.json`) as well, or treat unresolvable-in-hot as a hard refuse.
This is the same archive-blindness class as the PO promote-dedup defect that re-minted an
already-shipped fix 7h after it landed.

## Release path (worked, worth recording)

Orphan-signal rows carry `owner_client_session = NULL` by design (server-reaper-owned), so a
normal release no-ops with `{ok:true, released:0}`. The FR-2 ladder needs **three** fields, with
`original_owner_client_session` distinct from `owner_client_session`:

```
task_release(task_id="orphan-signal:task:<id>",
             owner_client_session=$SID,               # caller identity, always required
             owner_agent="dev-team",                  # must equal the row's own owner_agent
             original_owner_client_session=$SID)      # must echo payload.original_owner_client_session
-> {ok:true, released:1}
```

## Secondary observation (not this row's scope)

`FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD` carries `dispatch_lane: null`, the shape
previously recorded as yielding an unspawnable head that re-strands each turn. It sits at
`ready[21]` of 109 with 8 P0s ahead of it in band, at ~1 dispatched row per turn.
Prioritisation is PO's call, not dev-team's — flagging position only, no promotion performed.
