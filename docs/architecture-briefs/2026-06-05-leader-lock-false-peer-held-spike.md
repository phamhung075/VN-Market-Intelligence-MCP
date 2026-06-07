---
brief_id: SPIKE-LEADER-LOCK-OWNER-SESSION
date: 2026-06-05
author: architect
zone: apps/mcp-server/ + docs/agents/cowork-team/flow/
status: FINDINGS-COMPLETE
severity: HIGH
recurring_fix_count: 4
prior_brief: docs/architecture-briefs/2026-06-02-cowork-leader-selflock.md
task_id: SPIKE-LEADER-LOCK-OWNER-SESSION
---

# SPIKE: Leader-Lock False-Peer-Held on 2026-06-05 08:15Z

## 0. Timebox Summary

READ-ONLY spike. No product code mutated. All evidence gathered from:
- `coordination.db` (docker cp from container volume)
- `docker inspect` / `docker logs`
- `docs/signals/processed/cowork-team-2026-06-05T08:*.json`
- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` L47-52
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` L356-384 (heartbeatTask)
- `docs/architecture-briefs/2026-06-02-cowork-leader-selflock.md` §3 (prior fix context)

---

## 1. VERDICT: A

**mcp-server process restarted between 08:00Z and 08:15Z, generating a new SERVER_SESSION_ID that did not match the DB lock row → heartbeat returned ok=false → false PEER-HELD.**

---

## 2. Raw Evidence (load-bearing)

### 2a. Lock row in coordination.db

```
task_id:       cowork-leader
owner_session: pid-1-ts-1780613414482
owner_agent:   cowork-dispatcher
claimed_at:    2026-06-05 08:00:44Z
expires_at:    2026-06-05 08:30:44Z   (ttl=1800s, not yet expired at 08:15Z)
heartbeat_at:  2026-06-05 08:00:44Z   (no heartbeat applied since claim)
```

### 2b. mcp-server container StartedAt (docker inspect)

```
StartedAt: 2026-06-05T08:11:38.474283919Z
```

The mcp-server process restarted at **08:11:38Z** — 10 minutes 54 seconds after the lock was claimed at 08:00:44Z and 3 minutes 22 seconds before the 08:15Z tick.

### 2c. ops-rebuild task in coordination.db

```
task_id:    task:ops-rebuild:mcp-server:2026-06-05
claimed_at: 2026-06-05 08:10:33Z   (dev-team claimed rebuild ~1min before restart)
```

This confirms the rebuild was intentional (FDA-1 DONE+LIVE deploy, git commit `25974094` at 08:13Z UTC).

### 2d. SERVER_SESSION_ID mismatch computation

`SERVER_SESSION_ID` is `pid-<pid>-ts-<Date.now()>` computed once at module load (coordinationTools.ts L47-52). After the 08:11:38Z restart:

| | Value |
|---|---|
| Lock row `owner_session` | `pid-1-ts-1780613414482` (startup 2026-06-04T22:50:14Z) |
| New `SERVER_SESSION_ID` after restart | `pid-1-ts-~1780647098474` (startup 2026-06-05T08:11:38Z) |
| Match? | **NO** |

`heartbeatTask` executes:
```sql
UPDATE task_locks SET ... WHERE task_id='cowork-leader' AND owner_session='pid-1-ts-1780647098474'
```
The DB row has `owner_session='pid-1-ts-1780613414482'` → `changes=0` → `ok=false`.

The 2026-06-02 fix design (brief §3) correctly identifies heartbeat-as-discriminator as the safety mechanism for the dup-spawn case. But the fix assumes that `SERVER_SESSION_ID` is stable for the life of the logical leader session. It is stable within a single OS process — but NOT across a process restart. A restart between claim and the next tick is indistinguishable from a concurrent peer.

### 2e. Cowork telemetry signals corroborate

`cowork-team-2026-06-05T08:01:12Z.json`:
- `leader_lock: "claimed_fresh_stolen_expired_ttl"` — 08:00Z tick claimed fresh (previous lock had expired), proceeded, won slots.

`cowork-team-2026-06-05T08:18:14Z.json`:
- `leader_lock: "held_by_peer_heartbeat_rejected_suspect_false_peer"` — 08:15Z tick: `task_claim` returned `claimed=false` (lock alive from 08:00Z), `task_heartbeat` returned `ok=false` → PEER-HELD path taken → chef-intraday silently dropped.
- Note: `held_by_other: ["chef-intraday"]` and `reason: "leader_held_peer_heartbeat_rejected_suspect_false_peer"` — the slot token showed no real peer, consistent with false-peer.

`cowork-team-2026-06-05T08:46:12Z.json`:
- `leader_lock: "claimed_fresh_stolen_expired_ttl"` (stolen:true) — 08:45Z tick: the 08:00Z lock had now expired (>1800s) → TTL-expired stale-steal succeeded → chef-eod fired clean. This confirms the lock was genuinely alive at 08:15Z (it expired only at 08:30:44Z), ruling out hypothesis C (the 08:15Z call was NOT a fresh post-expiry claim).

### 2f. Hypothesis C is ruled out

The 08:15Z heartbeat failure happened while the lock's `expires_at = 08:30:44Z` was still in the future. The slot token `cowork-slot:chef-intraday claimed=true` showed no competing peer claimed a per-slot lock. The 08:15Z call was a genuine own-held lock with a mismatched `owner_session` — not a post-expiry fresh claim. The signal's stated mechanism ("gateway regenerates per-call") is incorrect (confirmed: SERVER_SESSION_ID is module-load singleton), but the identified SYMPTOM is real. The signal's note "suspected root cause: owner_session not stable across gateway-proxied per-tick calls" is PARTLY CORRECT in that it identifies the instability — but the instability is caused by process restart, not per-call regeneration.

---

## 3. Root-Cause Classification

**Verdict A confirmed.** This is the same structural class as the 2026-06-02 self-lock defect — both trace to `SERVER_SESSION_ID` being process-bound — but a DIFFERENT trigger:

| Trigger | 2026-06-02 defect | 2026-06-05 defect |
|---|---|---|
| Mechanism | TTL 1800s > tick gap 900s → same process can't reclaim its own live lock | Process restart between claim and heartbeat → new process can't heartbeat old process's lock |
| Symptom | `task_claim` fails with `claimed=false` → old code exited without heartbeat probe | `task_heartbeat` returns `ok=false` on own lock → new fix's discriminator misidentifies as peer |
| Fixed by 2026-06-02? | Yes | **No** |

The 2026-06-02 fix introduced the heartbeat-as-discriminator to solve the self-lock case. That fix WORKS when the process is stable. But it creates a NEW failure mode: if the process restarts between claim and heartbeat, the discriminator correctly identifies the new process as "not the lock holder" (which is technically true — the new process didn't claim it) and takes the peer-held path. The logical leader identity (cowork-dispatcher) is the same; the OS identity (pid+startupTs) changed.

**This is the 4th touch on this subsystem.** Per `feedback_recurring_bug_escalation`: the recurrence class must be closed structurally, not patched again.

---

## 4. Recurrence Class Root Cause

The structural problem is that `SERVER_SESSION_ID` serves dual purpose:
1. **Dup-spawn discriminator** — prevents two concurrent OS processes from both leading (correct use)
2. **Own-held identity** — lets a session recognize its own lock across ticks (FRAGILE: breaks on restart)

These two requirements are in tension. Purpose (1) needs a process-ephemeral token (change on restart = good). Purpose (2) needs a stable logical-leader token (change on restart = bad).

The 2026-06-02 fix conflated them into a single `owner_session` field. As long as the process never restarts between claim and next-tick heartbeat, the conflation works. But deploy cycles, crashes, and scheduled restarts break purpose (2) while preserving purpose (1).

---

## 5. Scoped Fix Recommendation

### Fix type: Durable Leader Identity — separate logical-leader token from process discriminator

**Zone: both `apps/mcp-server/` (coordinationStore + coordinationTools) and `docs/agents/cowork-team/flow/leader-lock.md`.**

### Design

Introduce a `logical_leader_id` concept, separate from `owner_session`:

**Option A (preferred — minimal schema change): persist leader identity token in coordination.db**

Add a `meta_locks` table (or reuse a known `task_locks` row) as a durable leader-identity store:

```sql
-- Simple: use a dedicated well-known task_id as a durable leader-identity token
-- "cowork-leader-id" row: never expires (TTL=∞ or 8d), set once by first claimer,
-- reset on explicit force-recreate only.
-- Stores a logical leader token = hash(owner_agent + date) or a random UUID written
-- at first-claim time.
```

When cowork-dispatcher claims `cowork-leader` successfully (fresh claim), it also reads or writes a `cowork-leader-id` row containing a `logical_id` field (e.g. `"cowork-dispatcher-YYYYMMDD"` or a UUID). This `logical_id` is returned to the flow and stored in-flow for that session.

On subsequent ticks: if `task_claim` returns `claimed=false`, the flow reads `current_holder.logical_id` (new field in `current_holder`) and compares with the stored `logical_id`. Match = own-held → heartbeat-probe skipped or used for TTL renewal only. Mismatch = peer-held → silent exit.

**Simpler Option B (no schema change): restart-aware cowork-flow leader re-claim**

The flow detects process restart by checking whether the lock's `claimed_at` predates any known restart signal. On `task_heartbeat ok=false`, instead of immediately taking the peer-held path:
1. Try `task_release` of the old lock (will fail — different `owner_session` — but returns `ok:false`, not error)
2. Force-steal: call `task_claim` with a new `ttl_seconds` but ONLY if `current_holder.owner_agent == "cowork-dispatcher"` AND `current_holder.heartbeat_at` is stale (>600s old — no heartbeat since the crashed process)
3. If force-steal succeeds → proceed (the old process is dead, no dup-spawn risk)

**Preferred: Option B is simpler** and requires NO schema change. The key safety gate for dup-spawn remains: if the old lock's `heartbeat_at` is recent (≤600s), a live peer holds it → do NOT steal. Only steal if `heartbeat_at` is stale (old process died without releasing).

The steal predicate: `current_holder.owner_agent == "cowork-dispatcher" AND now - current_holder.heartbeat_at > 600s` — this is a safe proxy for "process died, lock is an orphan."

**Exact pseudocode for leader-lock.md Step 0b (Option B)**:

```
LEADER_CLAIM=$(task_claim "cowork-leader" ttl=1800 owner_agent="cowork-dispatcher")

if LEADER_CLAIM.claimed == true:
  log "[cowork] leader lock claimed fresh — proceeding"
  PROCEED

else:
  HOLDER = LEADER_CLAIM.current_holder
  if HOLDER is absent:
    EXIT  # should not happen

  now_unix = <current Unix epoch>
  heartbeat_age = now_unix - HOLDER.heartbeat_at

  if heartbeat_age > 600:
    # Lock held by a stale/dead process (no heartbeat for 10+ min)
    # Safe to steal: dead process can't dup-spawn
    log "[cowork] leader lock orphaned (heartbeat_age=" + heartbeat_age + "s, last=" + HOLDER.heartbeat_at + ") — force-stealing"
    STEAL=$(task_claim "cowork-leader" ttl=1800 owner_agent="cowork-dispatcher")
    # Note: task_claim Step 2 (UPDATE WHERE expires_at < now) won't match because lock is still alive
    # → Need a FORCE-RELEASE + RECLAIM path, OR a dedicated tool parameter
    # → See implementation note below
    if STEAL.claimed == true:
      PROCEED
    else:
      EXIT  # someone else stole it first

  else:
    # Heartbeat is recent — a live peer (different process) holds the lock
    # Could also be restart within last 600s — this is an acceptable 10-min suppression window
    LEADER_HB=$(task_heartbeat "cowork-leader")
    if LEADER_HB.ok == true:
      # Same process (pid+startupTs) — own-held confirmed
      PROCEED
    else:
      # Different live process — genuine peer
      log "[cowork] leader lock held by live peer — silent exit"
      EXIT
```

**Implementation note on force-steal**: `task_claim` Step 2 only steals expired locks (`expires_at < now`). For an orphaned-but-alive lock, coordinationStore needs either:
- A new `force` flag on `claimTask` that skips the `expires_at` guard when `owner_agent` matches and `heartbeat_at` is stale, OR
- The flow calls a new `task_force_release(task_id, owner_agent, max_heartbeat_age_seconds)` tool that deletes the row if `owner_agent=X AND heartbeat_at < now-N`, then re-claims normally.

The `task_force_release` approach is cleaner (minimal callers surface, explicit safety gate).

### Files to modify

| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` | Add `releaseOrphanTask(task_id, owner_agent, max_stale_seconds)` function |
| `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` | Register new `task_force_release_orphan` tool (or add `force` param to `task_release`) |
| `docs/agents/cowork-team/flow/leader-lock.md` | Update Step 0b with heartbeat-age-aware orphan-steal path |
| `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts` | Add AC-SL-6 (orphan-steal after process restart) + AC-SL-7 (live-peer still blocked when heartbeat_age < 600s) |

### Preserve the 2026-06-02 dup-spawn safety property

The 2026-06-02 brief (§3) proved that `owner_session` mismatch is the correct dup-spawn guard. The new design preserves this:
- When `heartbeat_age ≤ 600s`: the existing heartbeat-probe discriminator still runs. If a live concurrent session (same or different process) holds the lock with a fresh heartbeat, the new code takes the same peer-held path.
- The orphan-steal path is only triggered when `heartbeat_age > 600s` — meaning no process has heartbeated the lock for 10 min. At that point, the holding process is definitively dead. No dup-spawn risk from a dead process.
- The `owner_agent == "cowork-dispatcher"` guard on orphan-steal prevents one agent from stealing another agent's orphan lock.

**The dup-spawn window does not re-open:** two concurrent live sessions would both have recent heartbeats (`heartbeat_age ≤ 600s`), so neither takes the orphan-steal path. The 2026-06-02 heartbeat-probe discriminator remains the gatekeeper for the concurrent-session case.

---

## 6. Observability Gap (contributed by this incident)

The cowork-flow's 08:15Z signal self-diagnosed `suspect_false_peer` and correctly flagged it — but it was still a silent dispatch drop (no BUG Telegram). The 08:15Z signal note is in `docs/signals/processed/`, not in the WORK channel.

Add a BUG telegram (one-line) whenever the peer-held exit path is taken AND the per-slot token shows no competing peer (`held_by_other` is populated but `won_slots` is empty for a guaranteed slot). This is the signal of a false-peer miss, not a legitimate collision, and warrants operator visibility.

---

## 7. What This Spike Rules Out

- **Hypothesis C (RETRACT)**: NOT applicable. The lock was alive at 08:15Z (`expires_at=08:30:44Z`), the 08:15Z heartbeat failure was not a fresh post-expiry claim. The `held_by_other: ["chef-intraday"]` slot token was indeed stale evidence from the prior tick (chef-intraday was already claimed by the pre-restart session). The slot-token contradiction cited in the signal was a red herring; the lock-row evidence is authoritative.
- **Per-call SERVER_SESSION_ID regeneration**: NOT the cause. Server code confirmed singleton at module load. Signal's stated mechanism was wrong; the symptom was real.

---

## 8. Impact Assessment

- chef-intraday 08:15Z: DROPPED (benign — already fired at 07:16Z)
- chef-eod 08:45Z: FIRED CLEAN (lock expired naturally by 08:30:44Z)
- Overall: 1 slot missed in a 2h window. Acceptable for this incident, but the next deploy-during-dispatch window would repeat the miss.

---

## 9. DoD for developer (agent-father implementation)

1. Add `releaseOrphanTask(task_id: string, owner_agent: string, max_stale_seconds: number): ReleaseResult` to `coordinationStore.ts` — DELETE WHERE `task_id=? AND owner_agent=? AND heartbeat_at < unixepoch('now') - ?`
2. Register `task_force_release_orphan` MCP tool in `coordinationTools.ts` with params `{task_id, owner_agent, max_stale_seconds (default 600, min 120)}`
3. Update `leader-lock.md` Step 0b per Option B pseudocode above
4. Add tests AC-SL-6 (orphan steal after 600s stale) and AC-SL-7 (live peer with fresh heartbeat blocks)
5. Update `docs/architecture-briefs/2026-06-02-cowork-leader-selflock.md` §3 to reference this brief

---

*Brownfield scan complete. One new tool proposed (`task_force_release_orphan`) — no existing tool covers orphan-steal with owner_agent-scoped safety gate.*
