# WF-1 Dry-Run Trace — Livelock Closure Proof
**Sprint:** WORKFLOW-FLUIDITY
**Task:** WF-1
**Author:** agent-father
**Date:** 2026-06-06
**AC:** AC-WF1-8

---

## Scenario: Developer hits knowledge-load fail → STOP

### Before WF-1 (old flow — livelock path)

```
[T=0h] dev-team cron fires
  → Step 0b: head.status="idle" → fall through to Step 1
  → PO triage selects task WF-X (depends_on not satisfied)
  → PM claims sprint-task lock (TTL=3600s) at Step 2b
  → agent-chaining-protocol: writes head.status="in_progress", head.next_agent="developer"
  → developer spawned

[T=0h+2min] developer Step 5: load knowledge files → FAIL (file missing)
  OLD PATH:
    send_telegram(channel="bug", "[developer] Knowledge load failed: foo.md")
    EXIT  ← lock NOT released, head NOT reset

  State after EXIT:
    coordination.db: sprint-task lock held by developer, TTL=3600s remaining
    orch-state.json .head: {status:"in_progress", next_agent:"developer", updated_at: T+2min}
    orch-state.json .task_board: task WF-X status=IN_PROGRESS

[T=1h] dev-team cron fires (next tick)
  → Step 0b: head.status="in_progress" AND head.updated_at < 24h
    → S2 dispatcher-wrap: outer_claim = task_claim(resume_key)
    → spawns developer again
    → developer hits same STEP 5 FAIL again → same EXIT → lock held again (new TTL 3600s)

[T=2h] same as T=1h — futile spawn

... repeats until T=24h when the 24h stale-head guard fires and resets head.status="idle"

RESULT: 24 futile cron cycles. PO triage blocked for 24h.
```

### After WF-1 (new flow — livelock CLOSED)

```
[T=0h] dev-team cron fires
  → Step 0b: head.status="idle" → fall through to Step 1
  → PO triage selects task WF-X
  → PM claims sprint-task lock (TTL=3600s) at Step 2b
  → agent-chaining-protocol: writes head.status="in_progress", head.next_agent="developer"
  → developer spawned

[T=0h+2min] developer Step 5: load knowledge files → FAIL
  NEW PATH (WF-1 STOP-RELEASE block):
    1. call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:WF-X" })
       → ok=true (lock released immediately)
    2. jq atomic .head idle-reset:
         tmp=$(mktemp); now=2026-06-06T14:02:00Z
         jq '.head = {status:"idle", updated_at:"2026-06-06T14:02:00Z",
                       updated_by:"developer", active_task_id:null, next_agent:null}' \
           docs/data/orch/orch-state.json > "$tmp"
         [ -s "$tmp" ] && jq -e '.head' "$tmp" && mv "$tmp" docs/data/orch/orch-state.json
       → orch-state.json .head: {status:"idle", updated_at:"2026-06-06T14:02:00Z", ...}
    3. send_telegram(channel="bug", "[developer] STOP: knowledge load failed: foo.md — head reset idle")
    EXIT

  State after EXIT:
    coordination.db: sprint-task lock RELEASED (TTL used ~0s)
    orch-state.json .head: {status:"idle"} ← KEY CHANGE
    orch-state.json .task_board: task WF-X status=IN_PROGRESS (unchanged — PM/PO must update)

[T=1h] dev-team cron fires (next tick)
  → Step 0b: head.status="idle" (reset by developer STOP-RELEASE)
    → DOES NOT fire pipeline-resume
    → falls through to Step 1 (PO triage)
  → PO triage: sees BUG telegram from T+2min, task WF-X still IN_PROGRESS
    → PO creates BLOCKED signal for WF-X (depends_on not met)
    → moves WF-X to BLOCKED in task_board
    → routes to next available task

RESULT: 0 futile cron cycles. Pipeline-resume guard never fires for a stopped task.
        PO triage reclaims the slot at T+1h (next cron).
```

### Bonus: BLOCKED-task guard (AC-WF1-5) — second closure path

```
Scenario: task WF-X is already BLOCKED in task_board when the cron fires
  (e.g. dev-team set it BLOCKED after PO triage detected depends_on not met)

[T=2h] dev-team cron fires
  → Step 0b: head.status="in_progress" AND head.active_task_id="WF-X" AND head.updated_at < 24h
    → NEW: BLOCKED-task check (WF-1 AC-WF1-5):
        task_status=$(jq '.task_board.active_sprints[].tasks[]
          | select(.id == "WF-X") | .status' orch-state.json)
        → "BLOCKED"
        → jq atomic .head idle-reset (same pattern)
        → send_telegram(work, "[dev-team] head task WF-X is BLOCKED — head reset idle, routing to triage")
        → JUMP TO drain-signals  ← skips pipeline-resume, routes to PO triage immediately

RESULT: BLOCKED task NEVER triggers a futile re-spawn. Head cleared immediately.
        dev-team cron slot used for productive PO triage, not futile re-spawn.
```

---

## Livelock Closure Summary

| State | Before WF-1 | After WF-1 |
|---|---|---|
| Lock hold on STOP | ≤3600s | ~0s (released) |
| .head "in_progress" after STOP | ≤24h | ~0s (reset idle) |
| Futile cron re-spawns | Up to 24 | 0 |
| PO triage delay | Up to 24h | 1 cron tick (≤1h) |
| BLOCKED head blocked pipeline | Up to 24h | 0 (cleared immediately) |
