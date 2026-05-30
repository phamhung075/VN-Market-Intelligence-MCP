<!-- size-justification: 130L — ops runbook for Phase 2 leader-lock dark window; single-concern document covering dark-window mechanics, recovery checklist, monitoring, and explicit do-not-do list. All sections are load-bearing for DWF-QA acceptance. -->

# DWF Ops Runbook — Phase 2 Leader-Lock Dark Window

**Sprint:** DYN-WF-FOUNDATION  
**Status:** ACTIVE  
**Audience:** ops / developer / user — troubleshooting after mcp-server force-recreate  
**Related files:**  
- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § R2 Ops Runbook  
- `docs/REQ_DYN-WF-FOUNDATION.md` § R2  
- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` — SERVER_SESSION_ID

---

## Overview

Phase 2 of DYN-WF-FOUNDATION closes the duplicate-dispatch SPOF via two mechanisms:

1. **Leader lock (`cowork-leader`)** — exactly one session leads each 15-min tick. One Docker process, one active leader at a time.
2. **Per-work-item idempotent token (`cowork-slot:<slot_id>`)** — each schedule slot can only be claimed once until its TTL expires or it is released.

The leader lock uses a **process-level session discriminator** (`SERVER_SESSION_ID = pid-<pid>-ts-<startupMs>`) set at mcp-server startup. This discriminator is stable for the container lifetime but **resets on every Docker restart**.

**Operational consequence:** A `docker compose up --force-recreate` of the mcp-server container triggers a **leader-lock dark window** — a bounded period during which cowork dispatch ticks fire but no session can claim the leader role. This runbook documents what to expect and what to do (or not do).

---

## Leader-Lock Dark Window After mcp-server force-recreate

### What it is

When the mcp-server container is force-recreated:

1. The old process dies; its `SERVER_SESSION_ID` (e.g. `pid-12345-ts-1716000000000`) is gone.
2. The old leader lock row in the `task_locks` table remains, with `owner_session = pid-12345-ts-1716000000000` and `expires_at = <up to 1800s from last heartbeat>`.
3. The new process starts with a new PID, a new `SERVER_SESSION_ID` (e.g. `pid-67890-ts-1716001800000`).
4. When the next cowork tick fires, the new process calls `task_claim(key="cowork-leader")`. This is an `INSERT OR IGNORE` — it fails because the stale row already exists.
5. The stale-steal path requires `expires_at < now` — which is not yet true (the old lock is still valid).
6. Result: `task_claim` returns `claimed: false`. The new process logs `"[cowork] leader lock held by peer — silent exit"` and exits without dispatching.

This continues on every tick until the stale row's `expires_at` passes.

### When it occurs

Any time the mcp-server container is force-recreated:

- Standard wedge-recovery procedure: `docker compose up --force-recreate mcp-server`
- Container restart after write-wedge (see `project_mcp_server_write_wedge.md`)
- Any Docker restart that assigns a new PID to the mcp-server process

### Duration

**Maximum dark window = leader lock TTL at the moment of restart = 1800 seconds = 30 minutes.**

The leader TTL is set explicitly to `ttl_seconds: 1800` (2 × 15-min heartbeat interval) per AC-P2-5-3. Relying on the default 3600s is forbidden by the spec — so the maximum is bounded at 30 min.

In practice the dark window may be shorter. If the last heartbeat was 20 min ago when the container restarted, the stale lock expires after 10 more minutes.

### What you see during the dark window

On every cowork tick (every 15 min) while the dark window is active:

- Log message: `"[cowork] leader lock held by peer — silent exit"` — **this is expected, not a bug**
- No spawns are made
- No WORK Telegram messages (silent exit does not send)
- Telemetry signal (`docs/signals/cowork-team-*.json`) is still written with `silent: true`

The cron continues to fire normally (`*/15 * * * *`). The dispatcher is not broken — it is correctly deferring to the stale lock.

---

## Operational Steps

1. **Note the time of force-recreate.** The dark window began at that moment.

2. **Compute the maximum end time:** `dark_window_end = restart_time + 1800 seconds` (30 min from restart, absolute worst case).

3. **During the dark window — expect silent ticks.** Every 15-min tick will log `"[cowork] leader lock held by peer — silent exit"`. This is correct behavior. No action needed.

4. **Wait for TTL natural expiry.** The stale lock row expires on its own. No manual intervention is required or recommended.

5. **Confirm dark window end.** After the expected window, verify the new process has claimed the leader lock:

   ```
   call_tool(server="vn-market", tool="task_list_held", arguments={
     kind: "cowork-slot"
   })
   ```

   Look for the `cowork-leader` key. Check `owner_session`:
   - New session (e.g. `pid-67890-ts-NNNN`) → dark window ended, leader elected
   - Old session (e.g. `pid-12345-ts-NNNN`) → dark window still active, wait longer

6. **Resume normal monitoring.** Once the new leader session appears, dispatch resumes automatically on the next tick. No restart of the cron is needed.

---

## Recovery Checklist

- [ ] Note the exact time of `force-recreate`
- [ ] Verify mcp-server container restarted successfully (new PID visible in `docker ps`)
- [ ] Confirm cowork cron continues to fire (`*/15` — check Claude Code terminal)
- [ ] Observe log messages `"[cowork] leader lock held by peer — silent exit"` on each tick (expected during dark window)
- [ ] After at most 30 min, run `task_list_held(kind="cowork-slot")` to check `cowork-leader` owner_session
- [ ] Confirm `owner_session` matches new process PID discriminator (`pid-<new_pid>-ts-<startupMs>`)
- [ ] Verify next cowork tick produces normal dispatch (WON_SLOTS non-empty, spawns fire)

---

## Do NOT

- **Do NOT manually delete the stale lock row.** The `task_locks` table uses `INSERT OR IGNORE`. A concurrent `task_claim` attempt from a legitimate process running at the same moment could race against a manual deletion, leaving both sides thinking they won. Wait for TTL expiry — it is safe, bounded, and automatic.

- **Do NOT restart the cron to speed things up.** The cron continues to fire correctly during the dark window. Restarting introduces a new session with potentially the same issue, and risks a double-dispatch burst when both the restarted cron and the natural TTL expiry resolve at the same moment.

- **Do NOT try to patch the stale row's `expires_at` directly.** Raw SQL edits to the coordination store bypass the `owner_session` predicate and can corrupt the lock table.

- **Do NOT treat the silent-exit log messages as errors.** `"[cowork] leader lock held by peer"` is the correct and expected log during a dark window. Alerting on this message during the first 30 min after a known force-recreate is a false positive.

---

## Published Marker Interaction

The published marker (`published:<slot_id>:<YYYY-MM-DD>`) is independent of the leader lock. It lives in the same `task_locks` table but is owned by the spawned agent, not the dispatcher. During a dark window, no spawns occur, so no published markers are set. When the dark window ends and dispatch resumes, the first tick claims fresh published markers for that day's content — no stale-marker risk from the dark window.

Weekly slot markers (digest-sunday, tnb-audit): TTL is ~8 days (see coordinationStore TTL cap). These persist across the dark window without issue.

---

## Acceptable Risk / Known Limitation

The dark window is a consequence of the **process-level session discriminator** (`pid-<pid>-ts-<startupMs>`). This discriminator was chosen because the `MCP SDK` does not yet expose a stable per-session ID that survives reconnects. Using a process-level ID is the safest available option.

This limitation is acceptable because:

1. The mcp-server is a **single Docker process** — there is no distributed state to reconcile.
2. Force-recreate is a **recovery-only operation** (wedge recovery), not routine. Normal container restarts (e.g., `docker compose restart`) also reset the PID and trigger a dark window, but the same 30-min bound applies.
3. The maximum duration is **bounded at 30 min** — acceptable for a background dispatch system where a missed tick delays analysis reports by at most one cycle.

Future improvement path: when the MCP SDK exposes a stable `sessionId` that persists across reconnects, `SERVER_SESSION_ID` in `coordinationTools.ts` can be replaced with the SDK value, eliminating the dark window entirely. This is marked as Phase 3+ work, out of scope for DYN-WF-FOUNDATION.

---

## Monitoring / Alerting

During a dark window (expected for up to 30 min after force-recreate):

- Log `"[cowork] leader lock held by peer — silent exit"` appears on every tick — **expected, do not alert**

After dark window ends (expected behavior):

- Log `"[cowork] leader lock held by peer"` should NOT appear during normal operation

Potential alert rule (optional, Phase 3+): if `"[cowork] leader lock held by peer"` appears for more than 35 consecutive minutes, the dark window has exceeded the 30-min maximum. This suggests the leader lock was never claimed (possible DB issue or mcp-server crash loop). Escalate to ops.
