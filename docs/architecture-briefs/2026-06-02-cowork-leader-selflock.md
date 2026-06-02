---
brief_id: COWORK-LEADER-SELFLOCK
date: 2026-06-02
author: architect
zone: docs/agents/cowork-team/flow/
status: READY-FOR-IMPL
severity: HIGH
prior_fix_commits: [288e8888, c502b88b]
---

# COWORK-LEADER-SELFLOCK — Leader-Lock Self-Blocking Fix

## 1. Defect Summary (PO-verified, load-bearing)

Every tick where the dispatcher WON slots (Step 4.6b) the leader lock is heartbeated
to `+1800s` from the current moment. On the NEXT tick (~15 min later), Step 0b calls
`task_claim("cowork-leader", ...)` again. But the lock is still LIVE (1800 > 900).
`task_claim` is not re-entrant: it returns `{claimed:false, current_holder:{...}}` even
when the caller is the same logical dispatcher. Step 0b treats any `claimed != true` as
"peer holds the lock" → silent EXIT, no dispatch, no spawns.

**Confirmed impact:** 05:03Z WON tick heartbeated leader to 05:34Z.
The 05:18Z chef-morning tick arrived with the lock still held.
Step 0b got `claimed:false` → silent-exit → **chef-morning MARKET dish dropped (2026-06-02)**.

Shadow window per tick: up to 2 ticks (1800s TTL / 900s effective inter-tick gap).
Any guaranteed slot whose cron falls in that shadow is silently dropped.

---

## 2. Recurring-Bug Escalation Analysis

This is the THIRD fix on the leader-lock subsystem:
- `288e8888` — Phase-2 leader lock (original design, Step 0b introduced)
- `c502b88b` — Two live defects in pressure-state emitter and tick-snapshot
- **This brief** — self-lock caused by non-re-entrant claim on own still-held lock

Per `feedback_recurring_bug_escalation`: root-cause, not patch-on-patch.

**Root cause of the recurrence class:**

The Phase-2 design (DWF-DEV-CROSS-4 brief) only documented the lose-to-peer path.
It never specified self-held behavior because `task_claim` was assumed to be re-entrant
(a reasonable but incorrect assumption). The claim + heartbeat interplay was also
underdocumented: Step 4.6b heartbeats to +1800s, which means the lock outlives the
next tick by a factor of 2. No alert or log fires when Step 0b exits silently — so
the bug accumulated in shadow without any observability signal.

**Why fix: heartbeat-own-held-then-proceed does not re-open the dup-spawn hole:**
See Section 3. The discriminator must be `owner_session` (per-process PID token),
not `owner_agent` (shared literal). The argument is fully worked below.

---

## 3. Own-Held Discriminator Decision

### The available fields

When `task_claim` returns `{claimed:false}`, `current_holder` is populated with:

```
current_holder: {
  owner_session: "pid-<pid>-ts-<startupTimestamp>",  // server-injected per OS process
  owner_agent:   "cowork-dispatcher",                // caller-supplied name — shared literal
  claimed_at:    <unix epoch>,
  expires_at:    <unix epoch>,
  heartbeat_at:  <unix epoch>
}
```

`owner_session` is stamped SERVER-SIDE by `coordinationTools.ts` using
`SERVER_SESSION_ID = "pid-<pid>-ts-<startupTs>"` — a value derived from `process.pid`
and `Date.now()` at server startup. Two distinct Claude Code terminal sessions
= two distinct OS processes = two distinct PIDs = two DIFFERENT `owner_session` values.
This is NOT caller-supplied; it cannot be spoofed from the agent flow.

### Why `owner_agent` alone is UNSAFE

If Step 0b detects own-held by checking `current_holder.owner_agent == "cowork-dispatcher"`,
two concurrent sessions sharing that string would BOTH see themselves as own-held
and BOTH proceed past the leader-lock gate — re-opening exactly the duplicate-spawn
hole Phase 2 closed.

**Decision: use `owner_session` as the discriminator.**

The flow cannot read `owner_session` directly (it is a server-internal value),
but the `current_holder.owner_session` field is RETURNED in the false-claim result.
Step 0b must compare `current_holder.owner_session` against a session token
that is unique per OS process but stable within a session.

### How to obtain the per-session token in the flow

The flow calls `task_heartbeat("cowork-leader")` on a WON lock. `heartbeatTask`
is guarded with `AND owner_session = SERVER_SESSION_ID` — it only succeeds for the
session that holds the lock. Therefore: **`task_heartbeat` returning `ok=true` IS the
own-held proof**, because only the holding session can heartbeat its own lock.

This avoids the need to expose `SERVER_SESSION_ID` to the flow at all.

### Step 0b own-held detection (safe version)

```
if LEADER_CLAIM.claimed != true:
  # Fast path: expired or no holder
  if LEADER_CLAIM.current_holder is absent:
    EXIT   # lock gone, shouldn't happen; let next tick retry

  # Attempt heartbeat — only succeeds if THIS process holds the lock
  HB = call_tool(server="vn-market", tool="task_heartbeat", arguments={
    task_id: "cowork-leader"
  })

  if HB.ok == true:
    # Own-held confirmed: THIS session's process holds the lock, heartbeat renewed it
    log "[cowork] leader lock self-held — heartbeated, proceeding"
    → PROCEED with dispatch body (continue to Step 1)
  else:
    # Heartbeat rejected: a DIFFERENT session holds the lock
    log "[cowork] leader lock held by peer (owner_agent=" + LEADER_CLAIM.current_holder.owner_agent + ") — silent exit"
    EXIT
```

### Why two-concurrent-session scenario is provably safe

Assume Session A (pid=100, ts=1000) holds the lock. Session B (pid=101, ts=2000)
arrives, gets `{claimed:false, current_holder:{owner_session:"pid-100-ts-1000"}}`.

Session B calls `task_heartbeat("cowork-leader")`. `heartbeatTask` runs:
```sql
UPDATE task_locks SET ... WHERE task_id='cowork-leader' AND owner_session='pid-101-ts-2000'
```
The row has `owner_session='pid-100-ts-1000'` → `changes=0` → `{ok:false}`.

Session B sees `HB.ok == false` → takes the peer-held path → silent EXIT.
Session A is the only session that can heartbeat its own lock (`changes=1`) → proceeds.

**Proof: no dup-spawn.** Even if Session B's `owner_agent` string matches ("cowork-dispatcher"),
the `heartbeat` call rejects via `owner_session` mismatch. The discriminator is the PID-bound
server-internal token — the agent flow contributes zero trust to the decision.

---

## 4. Precise Step 0b Logic Change (pseudocode)

Replace the existing Step 0b logic block in
`docs/agents/cowork-team/flow/main.md` (currently L46-60):

### BEFORE (current — broken)

```
LEADER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "cowork-leader",
  task_kind:   "cowork-slot",
  ttl_seconds: 1800,
  owner_agent: "cowork-dispatcher"
}))

if LEADER_CLAIM.claimed != true:
  log "[cowork] leader lock held by peer — silent exit"
  EXIT
```

### AFTER (fixed)

```
LEADER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "cowork-leader",
  task_kind:   "cowork-slot",
  ttl_seconds: 1800,
  owner_agent: "cowork-dispatcher"
}))

if LEADER_CLAIM.claimed == true:
  # Fresh claim — this session just won the lock; proceed
  log "[cowork] leader lock claimed fresh — proceeding"
  → PROCEED (continue to Step 1)

else:
  # Lock held by someone. Disambiguate: own-held vs peer-held via heartbeat probe.
  LEADER_HB=$(call_tool(server="vn-market", tool="task_heartbeat", arguments={
    task_id: "cowork-leader"
  }))

  if LEADER_HB.ok == true:
    # Heartbeat succeeded — THIS process holds the lock (renewed +1800s from now)
    log "[cowork] leader lock self-held — heartbeated to " + LEADER_HB.expires_at + ", proceeding"
    → PROCEED (continue to Step 1)

  else:
    # Heartbeat rejected — a different process holds the lock
    log "[cowork] leader lock held by peer — silent exit"
    EXIT
```

---

## 5. What Stays Unchanged

- **Step 4.6b** (heartbeat after dispatch body): keep as-is. It remains the primary
  renewal mechanism when the lock was freshly claimed in the same tick.
- **Step 4.6** (per-work-item slot tokens): no change.
- **Step 5** published-marker gate: no change.
- **Peer-held path** still silent-exits with no WORK message — this is the correct
  Phase-2 behavior and must be preserved.
- **TTL = 1800s** on `task_claim` stays. Do not shorten: it must cover the full
  dispatch body + any slow WON-slot processing.

---

## 6. Comment Update for Step 0b

The inline comment block must be updated to reflect the three outcomes:

```
<!-- Leader lock: ensures exactly one session leads each tick.
     WIN (claimed=true)            → proceed immediately.
     OWN-HELD (claimed=false + heartbeat ok=true) → renew + proceed.
       Own-held arises when Step 4.6b extended TTL beyond the next tick (1800s > 900s gap).
       Heartbeat probe is the discriminator: only the holding OS process can renew it
       (server-side owner_session = pid-<pid>-ts-<startupTs>; caller cannot spoof it).
     PEER-HELD (claimed=false + heartbeat ok=false) → silent exit, no dispatch.
     TTL = 1800s (2 × 15-min heartbeat). MUST be explicit — never rely on default 3600s (AC-P2-5-3). -->
```

---

## 7. Implementation DoD for agent-father

### File to modify

`docs/agents/cowork-team/flow/main.md` — Step 0b block only (~L46-60).
No other file changes required.

### Acceptance criteria

**AC-SL-1 (must prove — two-tick sequence):**
Simulate two consecutive ticks on the same session:
- Tick T1: `task_claim` succeeds (fresh claim) → WON → Step 4.6b heartbeats leader to T1+1800s
- Tick T2 (within 1800s): `task_claim` returns `claimed:false` (lock still held)
  → `task_heartbeat` returns `ok:true` → dispatcher PROCEEDS (no silent-exit)
- Verify WON_SLOTS is populated and spawns fire on Tick T2.

**AC-SL-2 (must prove — dup-spawn safety):**
Simulate two concurrent sessions (two in-memory DB connections sharing one DB file):
- Session A wins lock at T0
- Session B calls `task_claim` at T0+1s → `claimed:false`
- Session B calls `task_heartbeat` → `ok:false` (pid mismatch)
- Session B takes silent-exit path. No spawn from Session B.
Confirm: zero duplicate spawns.

**AC-SL-3 (prove the old silent-drop is gone):**
In a test: claim lock, heartbeat to T+1800, then call `task_claim` again from same
in-memory session (same `owner_session`). Old code would exit. New code:
`task_heartbeat` → `ok:true` → proceeds. Assert no EXIT.

**AC-SL-4 (no regression on peer-held):**
Session A holds lock. Session B (different pid/owner_session) calls `task_claim` →
`claimed:false`, then `task_heartbeat` → `ok:false`. Assert SESSION B takes EXIT path.

**AC-SL-5 (telemetry):**
The `log "[cowork] leader lock self-held — heartbeated..."` line is emitted when
own-held path is taken. Verify it appears in the tick telemetry signal (Step 6).
(Test: parse the telemetry JSON and confirm the log entry string is present in a
`leader_lock_decision` field, or verify it appears in the stdout of the dispatcher run.)

### Test file

Add to `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts`:
- `DV-SL-1`: two-tick own-held sequence (AC-SL-1)
- `DV-SL-2`: concurrent-session dup-spawn blocked (AC-SL-2)
- `DV-SL-3`: no-regression peer-held (AC-SL-4)

Use `_injectCoordinationDb(new Database(':memory:'))` (existing test pattern).
Manipulate `owner_session` via raw SQL for the dual-session scenario
(`UPDATE task_locks SET owner_session='pid-OTHER-ts-0' WHERE task_id='cowork-leader'`).

### Commit message template

```
fix(cowork-team): COWORK-LEADER-SELFLOCK — own-held leader lock causes silent dispatch drop

Step 0b re-claimed a still-heartbeated leader lock and treated claimed=false as peer-held
→ silent EXIT → guaranteed slots dropped (chef-morning 2026-06-02).

Fix: when task_claim returns claimed=false, probe with task_heartbeat before exiting.
Heartbeat ok=true → own process holds lock → renew and proceed.
Heartbeat ok=false → genuinely different session → silent exit (peer-held, unchanged).

Discriminator is server-side owner_session (pid+startupTs), not owner_agent string.
Two-concurrent-session dup-spawn hole remains closed: Session B's heartbeat hits
owner_session mismatch → changes=0 → ok=false → peer-held path.

Zone: docs/agents/cowork-team/flow/
AC: AC-SL-1, AC-SL-2, AC-SL-3, AC-SL-4, AC-SL-5
```

---

## 8. Observability Gaps (non-blocking, flag for PO backlog)

1. Step 0b currently emits NO telemetry on silent-exit. A silent dispatcher
   producing zero spawns for a guaranteed slot is invisible until the next human
   check. **Recommendation:** emit a Step-6-class `{type:"leader-silent-exit"}` signal
   whenever the peer-held path is taken. PO to open a backlog item.

2. `task_heartbeat` does not return `expires_at` on `ok=false`. The flow cannot
   log how long the peer still holds. Minor; not a correctness gap.

---

*Brownfield scan complete. Zero new interfaces proposed — fix reuses existing
`task_heartbeat` call (already in Step 4.6b) as a per-process discriminator.*
