# ARCH BRIEF — Cowork Blind-Session Fabrication Guard

**Brief ID:** cowork-blind-session-guard
**Date:** 2026-06-18T07:40:13Z
**Author:** agents-architect
**Priority:** P1 (confirmed live incident — fabricated data written to served briefs)
**Owner (implement):** agent-father (Agent .md factory rule — no flow .md edits outside agent-father)
**Incident refs:** `docs/handoffs/FIX-COWORK-BLIND-SESSION-GUARD-2026-06-18.md`, `docs/handoffs/GATEWAY-BLIND-USER-ACTION-2026-06-18.md`
**Memory refs:** `feedback_local_cowork_subagents_gateway_blind` · `feedback_no_fake_data_real_fetch`

---

## Problem

The `*/15` cowork master dispatcher (`docs/agents/cowork-team/flow/main.md` →
`spawn-fanout.md`) fans out by locally Agent-spawning data agents. When `.mcp.json`
`mcpServers` is `{}`, spawned subagents do NOT inherit `mcp__gateway__call_tool` — they
are gateway-blind. A blind subagent cannot fetch and either no-ops or FABRICATES.

Confirmed live 2026-06-18: a blind news-scout spawn wrote fabricated 06-18 sentiment into
5 analysis briefs and uniformly fake-stamped `last_covered_news_scout=2026-06-18T05:00:00Z`
across all 62 tickers in `docs/data/coverage-state.json`. PO reverted and quarantined. Root
is NOT a gatherer bug — it is a structural flow gap: the dispatcher has no preflight to
detect blindness before spawning.

Guaranteed/hourly slots survive via 12 cloud RemoteTrigger backstops (fresh, wired sessions).
The gap is the local fan-out: it must DETECT blind and refuse to spawn data agents.

---

## Required Architecture

### New sub-flow: `docs/agents/cowork-team/flow/blind-guard.md` (Step 0c)

Insert as **Step 0c** in `main.md`'s JUMP-TO table, BEFORE match-slots.md (Steps 1–4b). It
must be gateway-free so the guard never depends on the tool it is testing.

**Pseudocode:**

```
Step 0c — Blind detection (gateway-free preflight)

1. PRIMARY CHECK (jq, shell, no MCP):
   BLIND_COUNT = shell: jq '.mcpServers | length' .mcp.json
   if BLIND_COUNT == "0" → SESSION_BLIND=true

2. BELT-AND-SUSPENDERS (one-shot, optional — primary is sufficient):
   If SESSION_BLIND=false after step 1:
     attempt: call_tool(server="vn-market", tool="list_server_tools", arguments={})
     on "No such tool available" / not-connected error → SESSION_BLIND=true
     on success → SESSION_BLIND=false (confirmed wired)

3. EXPORT SESSION_BLIND to all downstream sub-flows (match-slots → spawn-fanout).
   Pass as a variable in the running context (inline in main.md dispatch chain).

4. If SESSION_BLIND=true:
   Log: "[cowork-team] BLIND — mcpServers={}; subagent spawns blocked. Backstops deliver."
   → CONTINUE to Step 0b and Steps 1–4b (slot matching, cadence bookkeeping, pressure state).
     These steps are dispatcher-local (no subagent gateway calls) → still run for state coherence.
   → skip spawn-fanout.md Step 5 spawn loop (enforced via SESSION_BLIND gate therein)
   → still run Step 5b (last-fired batch) and Step 6 (telemetry)

RETURN: SESSION_BLIND (bool), passed to spawn-fanout.md
```

**File size target:** ≤ 50L. Thin — decision only, no business logic.

---

### Edits to `docs/agents/cowork-team/flow/spawn-fanout.md` (Step 5 gate)

Add a **SESSION_BLIND gate** at the top of the per-slot spawn loop, as a second enforcement
point. The guard is belt-and-suspenders: blind-guard.md is the primary, spawn-fanout.md is
the final enforcement so a future main.md edit cannot accidentally skip the guard.

**Insert at the start of Step 5 (before the WON_SLOTS spawn loop):**

```
## Step 5.0 — Blind guard (second enforcement point)

if SESSION_BLIND == true:

  # Classify each matched slot by backstop coverage
  BACKSTOP_SLOTS   = [s for s in WON_SLOTS if s.trigger_id != null AND s.trigger_status == "active"]
  NO_BACKSTOP_SLOTS = [s for s in WON_SLOTS if s.trigger_id == null OR s.trigger_status != "active"]
  # Source of truth: cowork-schedule.json .slots[].trigger_id + .trigger_status (read-only, no hardcode)

  For each slot in BACKSTOP_SLOTS:
    log: "[cowork-team] BLIND — deferred to cloud backstop: <slot_id>"
    # backstop RemoteTrigger will deliver the real post; skip local spawn

  For each slot in NO_BACKSTOP_SLOTS:
    log: "[cowork-team] BLIND — UNDELIVERABLE this tick (no cloud backstop): <slot_id>"
    append to errors[]: {slot_id: <slot_id>, error: "undeliverable-gateway-blind"}
    # telemetry Step 6 picks up errors[]

  # Emit ONE work-channel summary per tick (not per slot)
  WORK_MSG = "[cowork-team] gateway-blind session — " +
    len(BACKSTOP_SLOTS) + " slots deferred to backstop, " +
    len(NO_BACKSTOP_SLOTS) + " undeliverable; " +
    "durable fix = register gateway in .mcp.json + reconnect (see docs/handoffs/GATEWAY-BLIND-USER-ACTION-2026-06-18.md)"
  call_tool(server="vn-market", tool="send_telegram", arguments={channel: "work", message: WORK_MSG})

  EXIT Step 5 — skip all subagent spawns. Proceed to Step 5b (last-fired) and Step 6 (telemetry).

# SESSION_BLIND == false → fall through to normal fan-out (behavior unchanged)
```

**Backstop classification note (no hardcoding):** derive BACKSTOP_SLOTS from
`cowork-schedule.json` `.slots[].trigger_id` + `.trigger_status`. `trigger_id != null AND
trigger_status == "active"` = has a live RemoteTrigger backstop. Do NOT hardcode slot
names — the SSOT is the schedule file.

---

### Edits to `docs/agents/cowork-team/flow/main.md` (JUMP-TO table)

Insert one row in the JUMP-TO table after Step 0b and before Steps 1–4b:

```
| 0c | Blind detection — gateway preflight | `blind-guard.md` |
```

Update the size-justification comment (currently `111L`) to reflect the new row (+1 table
row + 1 blank = ~113L).

---

## Files in scope for agent-father

| File | Action | Zone |
|---|---|---|
| `docs/agents/cowork-team/flow/blind-guard.md` | CREATE (new sub-flow, ≤50L) | agent-father |
| `docs/agents/cowork-team/flow/spawn-fanout.md` | EDIT (add Step 5.0 blind gate, ~30L insert) | agent-father |
| `docs/agents/cowork-team/flow/main.md` | EDIT (add 0c row to JUMP-TO table + bump size-comment) | agent-father |

**No other files modified.** `docs/data/cowork-schedule.json` is READ-ONLY in this guard;
the guard derives backstop coverage from it at runtime via jq — no structural edits needed.

---

## Behavioral invariants (DoD — read-verified, not badge-trusted)

1. **No spawn when blind:** in a SESSION_BLIND=true tick, no Agent tool call is made for
   any data-producing slot (news-scout, market-watcher, financial-analyst, alert-commander,
   digest-predict, unified-agent, tran-ngoc-bau, refine_bctc_md). Verify by reading the
   spawn-fanout gate, not by trusting a green-tick log.

2. **Single WORK summary per tick:** exactly one `send_telegram(channel="work")` call
   emitted from spawn-fanout.md Step 5.0 when blind. Not one per slot.

3. **Undeliverable slots in telemetry:** `errors[]` in telemetry (Step 6) contains one
   entry per NO_BACKSTOP slot classified under SESSION_BLIND.

4. **Backstops still fire:** the cloud RemoteTrigger backstops are independent of this
   guard; this guard is a no-op for them (they run in wired sessions). Do not disable
   backstops.

5. **Wired session: no behavior change:** SESSION_BLIND=false → guard is a no-op; normal
   fan-out proceeds unchanged. The guard must NOT alter the happy path.

6. **Dispatcher state coherent when blind:** Steps 0a/0b (signal drain, leader lock), 1–4b
   (slot match, pressure, cadence), 4.6–4.8 (claim tokens, tick snapshot, pressure emit),
   5b (last-fired), and 6 (telemetry) still execute on a blind tick. Only the spawn loop
   in Step 5 is skipped.

---

## Sequencing

BG-1 (agent-father, can start immediately):
  - Create `blind-guard.md` (no dependencies)
  - Edit `spawn-fanout.md` Step 5.0 (depends only on SESSION_BLIND variable contract from BG-1)
  - Edit `main.md` JUMP-TO table (trivial, 2 lines)

All three are agent-father zone, single PR, no dev-mcp-server dependency. No rebuild needed
(flow .md files, no compiled assets).

---

## Out of scope

- Restoring gateway connectivity: user/harness action — see
  `docs/handoffs/GATEWAY-BLIND-USER-ACTION-2026-06-18.md`.
- Cloud RemoteTrigger backstop management: unchanged.
- news-scout/market-watcher flow changes: not needed; the guard prevents blind spawns at
  the dispatcher level, making agent-level guards redundant for this failure class.
