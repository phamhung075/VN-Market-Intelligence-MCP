---
sprint: DYN-WF-FOUNDATION
task: DWF-DEV-CROSS-5
branch: task/dwf-dev-cross-5-published-marker-docs
size: S
zone: developer
depends_on: [DWF-DEV-CROSS-4]
blocks: [DWF-QA]
---

# DWF-DEV-CROSS-5 — Published Marker Documentation + Ops Runbook

## TLDR

Document the published marker pattern in `docs/agents/cowork-team/flow/main.md` Step 5 instructions. Create ops runbook `docs/protocols/dwf-ops-runbook.md` explaining the leader-lock dark window after mcp-server force-recreate. Phase 2 documentation deliverable.

## [PM] Planning Context

**Zone:** `developer` (cross-service)

**Acceptance Criteria:**

- [ ] **AC-P2-7-1..4:** (Already covered by DWF-DEV-CROSS-4 test suite DV-P2-7)
- [ ] **AC-R2-1:** `docs/protocols/dwf-ops-runbook.md` exists and documents the leader-lock dark window behavior.
- [ ] **AC-R2-2:** Runbook explains when a dark window occurs (after mcp-server force-recreate).
- [ ] **AC-R2-3:** Runbook specifies the maximum dark-window duration (`ttl_seconds: 1800s = 30 min`).
- [ ] **AC-R2-4:** Runbook explains monitoring steps: observe `task_list_held` return new `owner_session` on `cowork-leader` key.
- [ ] **AC-R2-5:** Runbook explicitly forbids manual row deletion (race risk) and recommends waiting for TTL expiry.
- [ ] **AC-R2-6:** Flow Step 5 (spawned agents) includes instruction text for published marker gate pattern (before send_telegram).

**Files to read first:**

- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § R2 Ops Runbook Location (verbatim content + dark-window mechanics)
- `docs/REQ_DYN-WF-FOUNDATION.md` § R2 — Ops Runbook (detailed spec)
- `docs/agents/cowork-team/flow/main.md` § Step 5 (spawned agents context; where to add published marker instruction)

**Files to modify:**

- `docs/agents/cowork-team/flow/main.md` — Add instruction text to Step 5:
  ```
  **Note on published marker (FR-P2-7):** Before each spawned agent calls `send_telegram`,
  it MUST first check and set a published marker:
  
  ```
  PUBLISHED_KEY="published:<slot_id>:<YYYY-MM-DD>"
  MARKER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: PUBLISHED_KEY,
    kind: "cowork-slot",
    ttl_seconds: 100800,  # 28 hours for daily slots
    owner_agent: "<agent_id>"
  }))
  
  if [ "$(echo "$MARKER_CLAIM" | jq -r '.claimed')" != "true" ]; then
    log "[<agent>] publish blocked — already published work-id=<slot_id>:<date>"
    EXIT  # Skip send_telegram, already published today
  fi
  
  # Proceed with send_telegram
  send_telegram(channel, message, ...)
  ```
  
  This belt-and-suspenders dedup: if a spawn somehow executes twice, the second send is blocked.
  ```

**Files to create:**

- `docs/protocols/dwf-ops-runbook.md` — Comprehensive runbook for Phase 2 operations:

  **Outline:**
  1. **Overview:** Phase 2 closes duplicate-dispatch SPOF via leader lock + per-work-item tokens. Dark window is a known operational behavior after mcp-server recovery.
  
  2. **Leader-Lock Dark Window After mcp-server force-recreate:**
     - **What:** SERVER_SESSION_ID in coordinationTools.ts = `pid-<pid>-ts-<startupMs>` (process-level, changes on Docker restart)
     - **When:** force-recreate mcp-server container (standard wedge-recovery procedure)
     - **Duration:** Maximum = leader lock TTL at moment of restart = 1800s (30 min)
     - **Behavior:** During dark window, no session wins leader election. Cowork dispatcher ticks (every 15 min) fire but find no leader and skip dispatch. Ticks are silent, not error.
     - **Root cause:** New process cannot renew old leader lock because `task_heartbeat` WHERE `owner_session = ?` no longer matches stale row's old session_id.
  
  3. **Operational Steps:**
     1. When performing mcp-server force-recreate (wedge recovery): note the current time.
     2. The dark window begins immediately and ends at `current_time + 1800s` (at most 30 min).
     3. During dark window:
        - Cowork ticks fire normally (*/15 min cron)
        - Leader election step finds stale lock row with old owner_session
        - `task_claim(key="cowork-leader")` fails (INSERT OR IGNORE against stale row; stale-steal requires expires_at < now)
        - Dispatch is silently skipped (no error, no dispatch)
        - Log message: "[cowork] leader lock held by peer — silent exit" will appear on every tick (expected, not a bug)
     4. No manual intervention required. Stale row TTL expires naturally.
     5. After dark window ends (watch wall clock or next cowork tick that succeeds):
        - New process claims leader lock
        - Dispatch resumes normally
     6. To confirm dark window end: run `task_list_held(kind="cowork-slot", key="cowork-leader")`
        - Should return new process's owner_session (pid-NNN-ts-MMM where NNN is new PID)
        - If old owner_session still returned, dark window still active
  
  4. **Recovery Checklist:**
     - [ ] Note time of force-recreate
     - [ ] Verify mcp-server container restarted (new PID)
     - [ ] Confirm cowork ticks fire (*/15 cron continues)
     - [ ] Observe log messages "[cowork] leader lock held by peer — silent exit" (expected)
     - [ ] After 30 min, re-run `task_list_held` to confirm new leader session
     - [ ] Resume monitoring normal cowork dispatch
  
  5. **Do NOT:**
     - Manually delete the stale lock row (race condition risk with concurrent claim attempts)
     - Try to speed up dark window by killing the process (mcp-server process is not running; it's the stale row in DB that expires naturally)
     - Restart the cron (cron continues to fire; ticks are silently skipped)
  
  6. **Acceptable Risk / Known Limitation:**
     - Dark window is a consequence of using process-level session discriminator
     - Acceptable because: (1) mcp-server is single Docker process (not distributed); (2) force-recreate is rare (recovery-only); (3) max duration is 30 min (bounded)
     - Future improvement: integrate with SDK sessionId when available (Phase 3+ work, out of scope for DYN-WF-FOUNDATION)
  
  7. **Monitoring / Alerting (Phase 3+):**
     - Log "[cowork] leader lock held by peer" on every tick during dark window
     - Could alert if this log appears for > 35 min (exceeded expected 30-min max), suggesting the recovery failed
     - Post-recovery, expected no such logs for normal operation

**Dependencies:**

- Depends on DWF-DEV-CROSS-4 (Phase 2 implementation must be complete before documenting)
- Blocks DWF-QA (QA reads this runbook as part of acceptance verification)

**Knowledge needed:**

- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § R2 Ops Runbook (detailed spec + dark-window mechanics)
- `docs/REQ_DYN-WF-FOUNDATION.md` § R2 (operational invariant)
- `docs/policies/dev-standards.md` — Documentation standards
- Coordination Store internals (SERVER_SESSION_ID, task_claim TTL mechanics)

**Implementation notes:**

1. **Runbook placement:** `docs/protocols/dwf-ops-runbook.md` is a new file in the protocols directory (same level as BCTC extraction runbook, etc.)

2. **Audience:** This runbook is for ops / developer / user troubleshooting after mcp-server force-recreate. Should be clear and non-technical where possible.

3. **Published marker instruction in flow Step 5:**
   - Add as a **Note** or **Important** section
   - Include the code example above
   - Emphasize: "Belt-and-suspenders with per-work-item token; published marker is the final defense against duplicate sends"

4. **TTL values to cite:**
   - Leader lock: `ttl_seconds: 1800` (30 min = 2 × 15-min heartbeat interval)
   - Per-work-item token: `ttl_seconds: 180` (3 min ≈ one flow step)
   - Published marker: `ttl_seconds: 100800` (28 hours for daily slots) or `ttl_seconds: 691200` (8 days for weekly slots)

5. **Runbook structure:**
   - Use markdown headings (## Overview, ## Dark Window, ## Steps, ## Do NOT, ## Monitoring)
   - Include checklist for recovery
   - Add examples of log messages seen during dark window
   - Link to `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` and `coordinationStore.ts` source for deeper context

---

## RETURN

Upon completion, developer will commit with trailers:

```
docs(ops): add dwf-ops-runbook.md (Phase 2 leader-lock dark window)

Document expected behavior after mcp-server force-recreate: leader-lock dark window
(max 30 min, silent tick skip, no manual intervention needed). Add recovery checklist
and monitoring guidance. Update cowork-team flow Step 5 with published-marker gate
instruction before send_telegram. Belt-and-suspenders dedup: per-work-item token +
published marker.

Task: DWF-DEV-CROSS-5
AC: AC-R2-1, AC-R2-2, AC-R2-3, AC-R2-4, AC-R2-5, AC-R2-6
```

Then PM will unblock DWF-QA (final acceptance verification).
