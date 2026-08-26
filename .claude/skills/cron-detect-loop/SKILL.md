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

**Step 1b.1 — Peer liveness cross-check (process-observing oracle — replaces the old self-reported
session-presence check; `docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md`
§2-§4, root cause: neither of the old oracles observes the OS):**
```bash
bash scripts/agents-flow/cron-marker-liveness-probe.sh --family detect-loop
```
Read the single line of stdout JSON: `{verdict, family, marker_owner_session, evidence:{o1,o2,o3},
recommended_action}`. Trichotomy (brief §4.1) — `DEAD` (O1: recorded PID absent from `ps`, or its
`(pid,start_epoch,comm)` triple disagrees — no threshold, no blind window), `LIVE` (O2: transcript
mtime proves live, or O1's full triple agrees), `UNKNOWN` (neither proves anything — never guessed).

- **`verdict:"LIVE"`** → compare the marker's `payload.jobs[].cron_expression` (all 4) against
  canonical (Step 1d table). All match → **STOP, no-op.** Log `"[cron-detect-loop] already armed by
  live peer session <SID> (probe evidence: o1/o2 in the JSON line). No-op."` Any mismatch →
  **STOP** — do NOT register a 2nd copy (no cross-session `CronDelete`/`CronCreate` exists). Log +
  `send_telegram(channel="work", "[cron-detect-loop] peer session <SID> holds a live but
  stale-valued detect-loop registration — will self-heal next time that session re-runs the skill,
  or fix manually in that terminal.")`.
- **`verdict:"DEAD"`** →
  ```
  release = call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
    task_id: "cron-registration:detect-loop", owner_client_session: <marker's owner_client_session>,
    orphan_threshold_seconds: 120
  })
  ```
  `orphan_threshold_seconds` is no longer a liveness decision (brief §4.4) — the probe already
  proved DEAD by observing the OS (O1). This call is now only a write-side CAS guard — "has
  anything changed since I read the marker" — so it takes the tool minimum, `120`, uniform across
  all three families.
  - `released:true` → **GOTO Step 1c** (register).
  - `released:false` (fresh heartbeat — race) → A `DEAD` verdict followed by `released:false` is a
    transient write conflict, **never** a re-interpretation as LIVE. Retry the probe once after the
    remaining window (bounded, ≤120 s). Still `released:false` → treat as `UNKNOWN` (below). Under
    no circumstance does this path fall through to `STOP, no-op`.
  - `released:false` (lock not found — peer already rotated it) → re-read from Step 1b.
- **`verdict:"UNKNOWN"` or `verdict:"ERROR"`** → for `UNKNOWN` the probe has already written its own
  `docs/signals/` row and attempted `send_telegram(channel="bug")` internally, deduped on
  `(family, marker_owner_session)` (brief §4.3) — do not raise a second alarm for `UNKNOWN`. Act on
  `recommended_action`, which the probe computes from its own `has_fire_election_mutex` table
  (`scripts/agents-flow/cron-marker-liveness-probe.sh` — SSOT; never restate this family's
  disposition as a literal here):
  - `"steal"` → **GOTO Step 1c** (register) — a second armed copy is harmless for this family.
  - `"defer"` → **STOP, no-op** this invocation. Log `"[cron-detect-loop] liveness UNKNOWN —
    deferred, alarm already raised by the probe. Will retry next re-arm."`
  For `verdict:"ERROR"` specifically (the probe itself could not run — transport/script failure,
  not a liveness ambiguity), the probe does **not** alarm internally — this skill must: log +
  `send_telegram(channel="bug", "[cron-detect-loop] liveness probe ERROR — could not determine peer
  marker liveness this invocation. No registration attempted.")`, then follow the same
  `recommended_action` branch above.
- **`verdict:"NO_MARKER"` or `verdict:"SELF"`** → race between Step 1b's read and this probe call.
  `NO_MARKER` (peer already rotated the marker) → re-read from Step 1b. `SELF` (ownership already
  transferred to this session) → **GOTO Step 1d**.

**Step 1c — Register the marker:**

Build the v2 process fingerprint (brief §4.5/§4.6 — `LC_ALL=C` wraps BOTH `ps` and `date`; this
family carried **no** process fingerprint at all before this fix — O1 had zero wiring here):
```bash
FP_PID="$PPID"
FP_START_RAW="$(LC_ALL=C ps -p "$PPID" -o lstart= 2>/dev/null)"
FP_START_EPOCH="$(LC_ALL=C date -j -f "%a %b %d %T %Y" "$FP_START_RAW" +%s 2>/dev/null)"
FP_COMM="$(LC_ALL=C ps -p "$PPID" -o comm= 2>/dev/null)"; FP_COMM="${FP_COMM##*/}"
FP_HOST="$(hostname)"
FP_TRANSCRIPT="$(find "$HOME/.claude/projects" -maxdepth 2 -name "${CLAUDE_CODE_SESSION_ID}.jsonl" 2>/dev/null | head -1)"
REGISTERING_PROCESS_V2=$(jq -n \
  --arg pid "$FP_PID" --arg se "$FP_START_EPOCH" --arg comm "$FP_COMM" \
  --arg host "$FP_HOST" --arg sid "$CLAUDE_CODE_SESSION_ID" --arg tr "$FP_TRANSCRIPT" \
  '{fp_version:2, pid:($pid|tonumber), start_epoch:($se|tonumber), comm:$comm,
    host:$host, session_id:$sid, transcript:$tr}')
```
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
  ],"registered_at":"<ISO8601 now>","registering_process": REGISTERING_PROCESS_V2}
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
