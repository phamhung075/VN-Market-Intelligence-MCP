<!-- size-justification: 105L — Step 5: parallel fan-out with published-marker gate contract. Child of main.md. -->

## Step 5 — Parallel fan-out

<!-- Published marker gate (FR-P2-7, DWF-DEV-CROSS-4 Phase 2 — ARCH-DECIDE-C):
     The spawned agent flow MUST claim a published marker BEFORE calling send_telegram.
     This is belt-and-suspenders with the per-work-item token: the token prevents duplicate
     spawns; the publish marker prevents duplicate sends if a spawn somehow executes twice.

     Pattern each spawned agent MUST follow (in its own flow, before send_telegram):
       1. Compute work_date = current VN date (GMT+7) in YYYY-MM-DD format
       2. Claim the published marker:
          publish_claim = call_tool(server="vn-market", tool="task_claim", arguments={
            task_id:     "published:" + slot_id + ":" + work_date,
            task_kind:   "cowork-slot",
            owner_agent: "<agent_id>",
            ttl_seconds: 100800   # 28h per ARCH-DECIDE-D (daily slots)
          })
       3. if publish_claim.claimed == false:
            log "[cowork] publish blocked — already published work-id=" + slot_id + ":" + work_date
            EXIT (do not call send_telegram)
       4. if publish_claim.claimed == true:
            proceed with send_telegram(...)
     Weekly slots (digest-sunday, tnb-audit): use work_date = ISO week (YYYY-WW) + ttl_seconds=691200 (8d).
     The publisher owns the marker — the dispatcher (this flow) does NOT call publish markers. -->

**Important — Published marker gate (FR-P2-7):** Each spawned agent MUST check and set a
published marker BEFORE calling `send_telegram`. This is the final belt-and-suspenders
defense against duplicate Telegram posts: the per-work-item token (Step 4.6) prevents
duplicate spawns; the published marker prevents duplicate sends if a spawn somehow executes
twice (e.g. retry under transport lag).

The key identifies CONTENT, not the dispatch attempt: `published:<slot_id>:<YYYY-MM-DD>`.
A new date = genuinely new content = new key, so the next day's dish is never blocked.

```
# In the spawned agent flow — BEFORE send_telegram:

WORK_DATE=$(TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d)   # VN date (GMT+7)
PUBLISHED_KEY="published:<slot_id>:${WORK_DATE}"

MARKER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     PUBLISHED_KEY,
  task_kind:   "cowork-slot",
  owner_agent: "<agent_id>",
  ttl_seconds: 100800    # 28h for daily slots (ARCH-DECIDE-D)
                         # Weekly slots (digest-sunday, tnb-audit): ttl_seconds = ~8 days
                         # (see coordinationStore TTL cap)
}))

if MARKER_CLAIM.claimed != true:
  log "[cowork] publish blocked — already published work-id=<slot_id>:<WORK_DATE>"
  EXIT   # Do NOT call send_telegram — already published today

# Marker claimed → proceed with send_telegram
send_telegram(channel, message, ...)
```

TTL values:
- **Daily slots** (`ttl_seconds: 100800` = 28 hours): covers the full 24h content cycle
  with a 4h buffer against timezone drift. A 24h TTL risks a same-day retry leaking through
  at a 23h59m gap.
- **Weekly slots** (`ttl_seconds` = ~8 days, see coordinationStore TTL cap): digest-sunday
  and tnb-audit use ISO week as `work_date` (`YYYY-WW` format, e.g. `2026-W22`).

Where this gate lives: inside each spawned agent's own flow, co-located with `send_telegram`.
The dispatcher (this file) does NOT set published markers — the publishing agent is responsible.
See `docs/protocols/dwf-ops-runbook.md` § Published Marker Interaction for ops context.

Fire **all** WON_SLOTS simultaneously in a single Agent tool message block. No sequential gating.

For each slot in WON_SLOTS:

```
subagent_type : <slot.agent>
prompt        : "run <slot.flow_path>  slot=<slot.slot_id>"
description   : "<slot.slot_id> dispatch"
```

Track spawn results: success (no error) vs failure (agent tool returns error).

**On spawn failure for any slot:**
- Log to `errors[]` in telemetry (Step 6).
- `send_telegram(channel=work, "[cowork-team] spawn failed: <slot.slot_id> — <one-line error>")`
- Continue remaining spawns. R4: one slot failure never blocks others.

**On flow path missing** (slot.flow_path does not exist as a file — verify before spawn):
- `send_telegram(channel=work, "[cowork-team] flow missing: <slot.slot_id> → <slot.flow_path>")`
- Add to `errors[]`. Skip this slot's spawn.

**After each spawn attempt (success OR failure) — release per-work-item token immediately (try/finally):**

```
try:
  spawn agent for slot
finally:
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id: "cowork-slot:" + slot.slot_id
  })
  # ok=false is acceptable (already expired, stolen, or crashed) — ignore release errors
  # NOTE: key uses slot.slot_id (suffix-free) matching the claim in Step 4.6
```
