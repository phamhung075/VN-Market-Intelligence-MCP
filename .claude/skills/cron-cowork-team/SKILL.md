---
name: cron-cowork-team
description: >
  Session-start hook. Idempotently registers the master */15 * * * * CronCreate
  dispatcher that spawns cowork-team agents. Invoke after every Claude Code CLI
  session restart to re-arm the dispatcher. Second invocation is a no-op.
---

# cron-cowork-team — Master Dispatcher Registration Skill

**Trigger:** User types `/cron-cowork-team` · **Purpose:** re-arm the `*/15 * * * *` CronCreate
master dispatcher after any session reset. **SSOT:** `docs/data/cowork-schedule.json` ·
**Dispatcher flow:** `docs/agents/cowork-team/flow/main.md` · **Runbook:**
`docs/protocols/cowork-master-cron-runbook.md`

---

## Why this skill exists

The master dispatcher is **session-scoped** — it evaporates when the CLI session ends. Invoking
`/cron-cowork-team` at session start ensures it is live within one tick (≤15 min). Full 3-layer
durability inventory → `register.md` § Why this skill exists (silence-incident diagnosis only,
never needed for Step 1 below).

---

## Step 1 — Cross-session registration guard (FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.2/§2)

CronCreate/CronList are strictly per-CLI-session — a peer terminal's registration is invisible to
`CronList`. This step uses a cross-session marker (`task_id="cron-registration:cowork-team"`,
`task_kind="sprint-task"`) so two sessions never both `CronCreate` the dispatcher, THEN runs the
local `CronList` classify below. Full spec: `2026-08-06-cron-rearm-cross-session-dedup.md` §1.2-1.4
(`docs/architecture-briefs/`).

**Step 1a — Fast path (per-process fingerprint compare, FIX-COWORK-CRON-SIBLING-PROCESS-DEFER;
fp_version-aware per liveness-oracle brief R4/AC-7):**

Compute once per invocation — guards two sibling OS processes sharing one session ID (`CronCreate`/
`CronList` are strictly per-OS-process). `LC_ALL=C` wraps BOTH `ps` and `date` (brief §4.6 R3;
`$PPID` here is the `claude` CLI process, verified):
```bash
FP_PID="$PPID"
FP_START_RAW="$(LC_ALL=C ps -p "$PPID" -o lstart= 2>/dev/null)"
FP_START_EPOCH="$(LC_ALL=C date -j -f "%a %b %d %T %Y" "$FP_START_RAW" +%s 2>/dev/null)"
FP_COMM="$(LC_ALL=C ps -p "$PPID" -o comm= 2>/dev/null)"; FP_COMM="${FP_COMM##*/}"
```
```
hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cron-registration:cowork-team", owner_client_session: $CLAUDE_CODE_SESSION_ID
})
```
`hb.ok == false` → continue to Step 1b.
`hb.ok == true` → session UUID matches, but a sibling process could too — compare fingerprints:
```
marker_rows = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "sprint-task"})
# filter client-side for task_id == "cron-registration:cowork-team"
STORED_FP = marker_row.payload.registering_process   # absent / a string / an object
```
- `STORED_FP` absent, a plain string (pre-v2 `"ppid-…-start-…"`), or an object with `fp_version !=
  2` → pre-v2 marker → **one-time backfill, never a fresh claim** (brief R4 — a fresh claim would
  steal a live peer's marker): `task_release` then `task_claim` (Step 1c fields, incl. the v2
  `registering_process` object) → **GOTO Step 1d**.
- `STORED_FP` is an object with `fp_version == 2` → compare the full triple, never `pid` alone
  (PID-reuse guard, brief R2): `pid`/`start_epoch`/`comm` all match `FP_PID`/`FP_START_EPOCH`/
  `FP_COMM`:
  - All three agree → same OS process, unchanged happy path → **GOTO Step 1d**.
  - Any differs → **SIBLING-PROCESS mismatch.** `age_seconds = now - marker_row.heartbeat_at`
    (renewed only by the fingerprinted process's own `cowork-tick-preflight.sh` Step 2):
    - `age_seconds <= 1800` → **DEFER**: log + `send_telegram(channel="work", "[cron-cowork-team]
      sibling-process collision — session <SID> already armed by another live terminal sharing this
      session ID. This terminal will NOT register its own */15 dispatcher.")`. **STOP** — no
      Step 1d/1b/`Cron*` calls this invocation.
    - `age_seconds > 1800` → sibling presumed dead — self-heal: `task_claim` (Step 1c fields, incl.
      the v2 object) + a `note` recording the steal/age → **GOTO Step 1d**.

Full spec: `docs/architecture-briefs/2026-08-15-cowork-cron-registration-sibling-process-defer.md` §2.

**Step 1b — Read the marker + resolve the holder:**
```
marker_rows = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "sprint-task"})
# no task_id filter exists on this tool — filter client-side for
# task_id == "cron-registration:cowork-team"
```
- No matching row → **GOTO Step 1c** (register).
- Matching row, `owner_client_session == $CLAUDE_CODE_SESSION_ID` → race with Step 1a — heartbeat it
  again, **GOTO Step 1d**.
- Matching row, peer session owns it → continue to Step 1b.1.

**Step 1b.1 — Peer liveness cross-check (process-observing oracle, replaces the old self-reported
session-presence check; liveness-oracle brief §2-§4 — neither old oracle observed the OS):**
```bash
bash scripts/agents-flow/cron-marker-liveness-probe.sh --family cowork-team
```
Read the stdout JSON line: `{verdict, family, marker_owner_session, evidence:{o1,o2,o3},
recommended_action}`. Trichotomy (brief §4.1) — `DEAD` (O1: recorded PID absent, or its
`(pid,start_epoch,comm)` triple disagrees — no blind window), `LIVE` (O2: transcript mtime proves
live, or O1's triple agrees), `UNKNOWN` (neither proves anything — never guessed).

- **`LIVE`** → compare `payload.jobs[].cron_expression` against canonical (Step 1d Phase 2). All
  match → **STOP, no-op.** Log `"[cron-cowork-team] already armed by live peer session <SID>
  (probe evidence in the JSON line). No-op."` Mismatch → **STOP** (no cross-session `CronDelete`/
  `CronCreate` exists) — log + `send_telegram(channel="work", "[cron-cowork-team] peer session
  <SID> holds a live but stale-valued registration — will self-heal next re-run, or fix manually.")`.
- **`DEAD`** →
  ```
  release = call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
    task_id: "cron-registration:cowork-team", owner_client_session: <marker's owner_client_session>,
    orphan_threshold_seconds: 120
  })
  ```
  No longer a liveness decision (brief §4.4) — probe already proved DEAD via O1; this is now only
  a write-side CAS guard ("has anything changed since I read the marker"), tool minimum `120`,
  uniform across all three families.
  - `released:true` → **GOTO Step 1c** (register).
  - `released:false` (fresh heartbeat — race) → transient write conflict, **never** a
    re-interpretation as LIVE. Retry the probe once after the remaining window (≤120 s). Still
    `released:false` → treat as `UNKNOWN` (below). Never falls through to `STOP, no-op`.
  - `released:false` (lock not found — peer already rotated it) → re-read from Step 1b.
- **`UNKNOWN`/`ERROR`** → for `UNKNOWN` the probe already wrote its own `docs/signals/` row +
  `send_telegram(channel="bug")`, deduped on `(family, marker_owner_session)` (brief §4.3) — do not
  double-alarm. Act on `recommended_action` (computed from the probe's own `has_fire_election_mutex`
  table — SSOT; never restate this family's disposition as a literal here):
  - `"steal"` → **GOTO Step 1c** — a second armed copy is harmless for this family.
  - `"defer"` → **STOP, no-op**. Log `"[cron-cowork-team] liveness UNKNOWN — deferred, alarm
    already raised by the probe. Will retry next re-arm."`
  `ERROR` (probe itself failed — transport/script, not ambiguity): the probe does **not** alarm
  internally — this skill must log + `send_telegram(channel="bug", "[cron-cowork-team] liveness
  probe ERROR — could not determine peer marker liveness. No registration attempted.")`, then
  follow the same `recommended_action` branch above.
- **`NO_MARKER`/`SELF`** → race between Step 1b's read and this probe call. `NO_MARKER` → re-read
  from Step 1b. `SELF` → **GOTO Step 1d**.

**Step 1c — Register the marker:**

Build the v2 process fingerprint (brief §4.5/§4.6 — `LC_ALL=C` wraps BOTH `ps` and `date`; retires
the old locale-dependent, unparseable `"ppid-…-start-…"` string):
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
  task_id: "cron-registration:cowork-team", task_kind: "sprint-task",
  owner_agent: "cron-cowork-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds: 691200,
  payload: {"jobs":[{"identity":"cowork-team master dispatcher","cron_expression":"*/15 * * * *"}],"registered_at":"<ISO8601 now>","registering_process": REGISTERING_PROCESS_V2}
})
```
`claim.claimed == true` → **GOTO Step 1d.** `claim.claimed == false` → a peer won a race between
Step 1b's read and this claim → abort, re-run from Step 1b.

**Step 1d — Local two-phase classify (stale-vs-missing guard fix, §2):**
```
CronList
```
Phase 1 — IDENTITY: find any live entry whose `description` contains `"cowork-team master
dispatcher"`. Phase 2 — VALUE (identity-matched entries only): compare `cron_expression` against
`*/15 * * * *` AND `prompt` for the `"TOMBSTONED"` fragment (register.md § FIX-COWORK-FIRE-ELECTION-
TICK-TOMBSTONE — its absence is the stale-prompt bug that fix closes).

| Phase 1 | Phase 2 | Action |
|---|---|---|
| no match | — | genuinely missing → **Step 2** (CronCreate) |
| match | both values match | present-and-correct → **STOP, no-op.** Log `"[cron-cowork-team] Master dispatcher already registered (id=<id>). No-op."` |
| match | either value mismatches | present-but-WRONG → `CronDelete(id=<found_id>)` THEN **Step 2** (CronCreate canonical) — replace in place, never add a 2nd copy |

---

## Step 2 — Register the master CronCreate

Reached from Step 1d's "missing"/"mismatch" branch (mismatch runs `CronDelete` first, above). Read
`register.md` § Step 2 and execute the `CronCreate` call there verbatim.

**Success:** log `[cron-cowork-team] Master dispatcher registered. Next tick: <next :00/:15/:30/:45 UTC>. Dispatcher: docs/agents/cowork-team/flow/main.md`. **Failure:** log error + `send_telegram(channel="bug", "[cron-cowork-team] CronCreate FAILED: <error>")`. Do NOT retry. Report to user.

---

## Step 3 — Sanity verify

Call `CronList` again. Confirm the entry appears with `*/15 * * * *` and status active. Log:
`[cron-cowork-team] Verified — dispatcher live. id=<id>.`

---

## Manage / Notes / History (lazy-load)

`CronList`/`CronDelete` admin ref, `durable`/Layer-C notes, the superseded FIX-COWORK-FIRE-
ELECTION-TICK-TOMBSTONE rollout note, P3-OBSERVE-ONLY-RETIREMENT, and Sibling-Process-Defer all
live in `register.md`. Dispatcher entry ABSENT after a session reset → invoke `/cron-cowork-team`,
Step 1 handles it.
