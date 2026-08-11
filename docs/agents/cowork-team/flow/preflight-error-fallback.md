<!-- size-justification: ~180L — full original Steps 0a-6 pseudocode chain, split from main.md TE-T03 2026-08-11; reached only on Step 0 preflight verdict=ERROR (election-lock state undefined). -->
<!-- TOKEN-ECONOMY-TICK-PREFLIGHT WU-1 (2026-07-02): on the normal SILENT/WORK path this logic is
     replaced by scripts/agents-flow/cowork-tick-preflight.sh. This file is reached only on the
     script's ERROR verdict (see main.md § Step 0 JUMP-TO table) or a manual/ad-hoc full run — read
     from Step 0a onward as if the script never ran. Steps 0a and 0b.3 are hosted in the sibling
     work-tick.md (shared with main.md's own WORK-continuation direct calls). Kept verbatim — never
     deleted, history in git log. -->

# cowork-team — Preflight ERROR-verdict Fallback

**Parent flow:** `docs/agents/cowork-team/flow/main.md` (Step 0 — reached only on preflight verdict `ERROR`)

---

## Step 0a — Drain signal_queue

→ Run sub-flow: `docs/agents/cowork-team/flow/work-tick.md` § Step 0a

---

## Step 0b — Presence + Leader lock

<!-- P2-PRESENCE (TASK_1990): session-presence claim fires BEFORE leader-lock.
     Registers this cowork-dispatcher session for cross-session observability.
     dispatch-claim SKILL § Step 0a is authoritative — this is the cowork-team instantiation.
     Non-adoptable: presence row expiry = liveness GC, never orphan-signal. -->

**Step 0b.1 — Session-presence self-registration** (→ skill: `.claude/skills/dispatch-claim/SKILL.md` § Step 0a)

```
# P2-PRESENCE: register this dispatcher session before leader-lock
# task_id is session-unique — re-entrant across recurring ticks (heartbeat on re-entry)

presence_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  task_kind:            "session-presence",
  owner_agent:          "cowork-dispatcher",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          1800,
  payload:              {
    agent_id:     "cowork-team",
    host:         $(hostname),
    started_at:   $(date -u +"%Y-%m-%dT%H:%M:%SZ"),
    current_task: "dispatch-init"
  }
})

# Re-entrant tick: heartbeat to renew if already claimed by this session
if not presence_result.claimed:
  if presence_result.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id: "session-presence:" + $CLAUDE_CODE_SESSION_ID,
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
# Always proceed — presence result is NEVER a gate.

# FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.4: renewal heartbeat for the cross-session cron-registration
# marker (.claude/skills/cron-cowork-team/SKILL.md Step 1c). Best-effort, no-op if this session
# doesn't own it (or the marker was never claimed yet) — never a gate on dispatch.
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cron-registration:cowork-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
```

**Step 0b.2 — Fire-time election (P3)** → Run sub-flow: `docs/agents/cowork-team/flow/leader-lock.md`
<!-- P3: leader-lock.md now implements per-tick cron:cowork:<TICK> election (TTL=600s, no heartbeat).
     Session that wins proceeds to Step 0b.3. Loser EXITs cleanly. Release at end of Step 6 (telemetry.md).
     TICK variable set in leader-lock.md persists through Steps 0b.3–6 for the release call. -->

---

## Step 0b.3 — Drain Due One-Shot Scheduled Tasks

→ Run sub-flow: `docs/agents/cowork-team/flow/work-tick.md` § Step 0b.3

---

## Step 0c — Blind detection

→ Run sub-flow: `docs/agents/cowork-team/flow/blind-guard.md`

---

## Steps 1–4b — Slot matching

→ Run sub-flow: `docs/agents/cowork-team/flow/match-slots.md`

---

## Steps 4.2–4.3 — Pressure read + calendar suppression

→ Run sub-flow: `docs/agents/cowork-team/flow/pressure-read.md`

---

## Steps 4.4–4.5b — Cadence due-check + freshness downgrade

→ Run sub-flow: `docs/agents/cowork-team/flow/pressure-cadence.md`

---

## Steps 4.6–4.6b — Slot claim tokens + leader heartbeat

→ Run sub-flow: `docs/agents/cowork-team/flow/slot-claim.md`

---

## Step 4.7 — Tick snapshot

→ Run sub-flow: `docs/agents/cowork-team/flow/tick-snapshot.md`

---

## Step 4.8 — Pressure-state emit

→ Run sub-flow: `docs/agents/cowork-team/flow/pressure-emit.md`

---

## Step 5 — Parallel fan-out (background)

→ Run sub-flow: `docs/agents/cowork-team/flow/spawn-fanout.md`
<!-- BGFAN-1: spawn-fanout.md MUST set run_in_background=true on every Agent call — see inline markers there -->

---

## Step 5b — Batch last_fired write

→ Run sub-flow: `docs/agents/cowork-team/flow/last-fired.md`

---

## Step 6 + Error Guard — Telemetry + error boundary

→ Run sub-flow: `docs/agents/cowork-team/flow/telemetry.md`
