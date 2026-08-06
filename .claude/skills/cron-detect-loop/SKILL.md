---
name: cron-detect-loop
description: >
  Session-start hook. Idempotently registers the 4 CronCreate entries that
  drive the anomaly-detection→dev-team-planning loop: dev-team hourly cron +
  system-auditor Tier-1/Tier-2/Tier-3. Invoke after every Claude Code CLI
  session restart. Second invocation is a no-op.
---

# cron-detect-loop — Detect→Plan Loop Re-Arm Skill

**Trigger:** `/cron-detect-loop`
**Purpose:** Re-arm 4 session-scoped crons for the anomaly-detection→dev-team-planning loop.
**Detail (lazy-load — read ONLY when Step 1 finds a missing entry):** background rationale, the
SSOT/divergence note, and the 4 `CronCreate` prompt bodies (Job 1-4) + P3-OBSERVE-ONLY-RETIREMENT
section now live in `.claude/skills/cron-detect-loop/register.md`. The common all-4-registered
path (the ~46-48 of 48 dev-team ticks/day where nothing is missing) never needs that file.

---

## Step 1 — Cross-session registration guard (FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.2/§2)

CronCreate/CronList are strictly per-CLI-session — a peer terminal's registration is invisible to
`CronList`. This step uses a cross-session marker (`task_id="cron-registration:detect-loop"`,
`task_kind="sprint-task"` reused per `coordinationStore.ts:446-451` precedent, ONE marker for all
4 jobs) so two sessions never both `CronCreate` the same job, THEN runs the local `CronList`
classify below. This step self-arms on EVERY dev-team tick (~48/day) — Step 1a's fast path keeps
that cheap (one `task_heartbeat` call) on every tick after the first each session. Full mechanism
spec: `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` §1.2-1.4.

**Step 1a — Fast path (cheap, blind heartbeat):**
```
hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cron-registration:detect-loop", owner_client_session: $CLAUDE_CODE_SESSION_ID
})
```
`hb.ok == true` → this session already owns the marker → **GOTO Step 1d** (local classify).
`hb.ok == false` → not found, or owned by someone else → continue to Step 1b.

**Step 1b — Read the marker + resolve the holder:**
```
marker_rows = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "sprint-task"})
# no task_id filter exists on this tool — filter client-side for
# task_id == "cron-registration:detect-loop"
```
- No matching row → **GOTO Step 1c** (register).
- Matching row, `owner_client_session == $CLAUDE_CODE_SESSION_ID` → race with Step 1a — heartbeat it
  again, **GOTO Step 1d**.
- Matching row, peer session owns it → continue to Step 1b.1.

**Step 1b.1 — Peer liveness cross-check (session-presence, primary staleness oracle):**
```
presence_rows = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "session-presence"})
# find the row whose owner_client_session matches the marker's owner_client_session
```
- **LIVE** (row found, unexpired) → compare the marker's `payload.jobs[].cron_expression` (all 4)
  against canonical (Step 1d table). All match → **STOP, no-op.** Log
  `"[cron-detect-loop] already armed by live peer session <SID>. No-op."`
  Any mismatch → **STOP** — do NOT register a 2nd copy (no cross-session `CronDelete`/`CronCreate`
  exists). Log + `send_telegram(channel="work", "[cron-detect-loop] peer session <SID> holds a live
  but stale-valued detect-loop registration — will self-heal next time that session re-runs the
  skill, or fix manually in that terminal.")`.
- **DEAD** (no presence row, or expired) →
  ```
  release = call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
    task_id: "cron-registration:detect-loop", owner_client_session: <marker's owner_client_session>,
    orphan_threshold_seconds: 7200
  })
  ```
  - `released:true` → **GOTO Step 1c** (register).
  - `released:false` (fresh heartbeat — race) → treat conservatively as LIVE → **STOP, no-op.**
  - `released:false` (lock not found — peer already rotated it) → re-read from Step 1b.

**Step 1c — Register the marker:**
```
claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: "cron-registration:detect-loop", task_kind: "sprint-task",
  owner_agent: "cron-detect-loop", owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds: 691200,
  payload: {"jobs":[
    {"identity":"dev-team/flow/main.md","cron_expression":"7,37 * * * *"},
    {"identity":"AUDIT_TIER=1","cron_expression":"*/30 * * * *"},
    {"identity":"AUDIT_TIER=2","cron_expression":"0 */4 * * *"},
    {"identity":"AUDIT_TIER=3","cron_expression":"0 4 * * *"}
  ],"registered_at":"<ISO8601 now>"}
})
```
`claim.claimed == true` → **GOTO Step 1d.** `claim.claimed == false` → a peer won a race between
Step 1b's read and this claim → abort, re-run from Step 1b.

**Step 1d — Local two-phase classify (stale-vs-missing guard fix, §2 — identity anchors all
already unique, no anchor change needed for this skill):**
```
CronList
```
For each of the 4 jobs below: Phase 1 — IDENTITY (stable, cadence-independent prompt substring);
Phase 2 — VALUE, only for identity-matched entries (compare `cron_expression`).

| Job | Phase 1 identity anchor | Phase 2 canonical `cron_expression` |
|---|---|---|
| 1 (dev-team) | prompt contains `dev-team/flow/main.md` | `7,37 * * * *` |
| 2 (auditor T1) | prompt contains `AUDIT_TIER=1` | `*/30 * * * *` |
| 3 (auditor T2) | prompt contains `AUDIT_TIER=2` | `0 */4 * * *` |
| 4 (auditor T3) | prompt contains `AUDIT_TIER=3` | `0 4 * * *` |

Per job: no identity match → missing → CronCreate (read `register.md` Step 2, this job only).
Identity match + value match → present-and-correct, no-op. Identity match + value mismatch →
present-but-WRONG → `CronDelete(id=<found_id>)` THEN CronCreate the canonical entry (read
`register.md` Step 2, this job only) — replace in place, never add a 2nd copy.

**If ALL 4 present-and-correct → STOP. Log:**
`[cron-detect-loop] All 4 crons already registered. No-op.`

If any subset is missing-or-stale → read `.claude/skills/cron-detect-loop/register.md` and execute
its Step 2 for ONLY those entries (after any required `CronDelete` per the table above).

---

## Step 3 — Verify

```
CronList
```

Confirm all 4 entries now appear. Log:
`[cron-detect-loop] Verified — detect→plan loop live. Jobs: <id1>, <id2>, <id3>, <id4>.`

If any entry still missing after CronCreate reported success → log WARN +
`send_telegram(channel="bug", "[cron-detect-loop] WARN: CronCreate success but entry absent in CronList: <job>")`.
