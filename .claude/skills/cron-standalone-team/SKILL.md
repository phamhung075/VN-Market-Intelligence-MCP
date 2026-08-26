---
name: cron-standalone-team
description: >
  Session-start hook. Idempotently registers the 6 CronCreate entries for the
  5 standalone crons that sit outside the cowork-team/dev-team/system-auditor
  loops: db-data-integrity (2 entries, post-CADRAT-2 schedule split),
  agent-father, claude-manager-helper, code-janitor, market-db-journal-guard.
  Invoke after every Claude Code CLI session restart. Second invocation is a
  no-op.
---

# cron-standalone-team — Standalone Crons Re-Arm Skill

**Trigger:** `/cron-standalone-team`
**Purpose:** Re-arm 6 session-scoped `CronCreate` entries covering the 5 standalone crons that
had **zero** automated re-arm coverage before this skill (confirmed by grep — neither
`cron-cowork-team` nor `cron-detect-loop` names any of them):
`.claude/commands/crons/cron-db-data-integrity.md` (2 entries post-CADRAT-2 split),
`cron-agent-father.md`, `cron-claude-manager-helper.md`, `cron-code-janitor.md`,
`cron-market-db-journal-guard.md` (added 2026-08-06,
`FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED` AC-1).

**Why a NEW skill, not an extension of `cron-detect-loop`:** PO decision — full rationale → `register.md` § Why a NEW skill.

**Detail (lazy-load — read ONLY when Step 1 finds a missing entry):** the 6 `CronCreate` prompt
bodies (Job 1-6), the Manage (`CronList`/`CronDelete`) reference, and the Notes (SSOT divergence
discipline, fire-election scope) all live in `.claude/skills/cron-standalone-team/register.md`.
The common all-6-registered path never needs that file.

---

## Step 1 — Cross-session registration guard (FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.2/§2)

CronCreate/CronList are strictly per-CLI-session — a peer terminal's registration is invisible to
`CronList`. This step uses a cross-session marker (`task_id="cron-registration:standalone-team"`,
`task_kind="sprint-task"` reused per `coordinationStore.ts:446-451` precedent, ONE marker for all
6 jobs) so two sessions never both `CronCreate` the same job, THEN runs the local `CronList`
classify below. Full mechanism spec:
`docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` §1.2-1.4.

**Step 1a — Fast path (cheap, blind heartbeat):**
```
hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cron-registration:standalone-team", owner_client_session: $CLAUDE_CODE_SESSION_ID
})
```
`hb.ok == true` → this session already owns the marker → **GOTO Step 1d** (local classify).
`hb.ok == false` → not found, or owned by someone else → continue to Step 1b.

**Step 1b — Read the marker + resolve the holder:**
```
marker_rows = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "sprint-task"})
# no task_id filter exists on this tool — filter client-side for
# task_id == "cron-registration:standalone-team"
```
- No matching row → **GOTO Step 1c** (register).
- Matching row, `owner_client_session == $CLAUDE_CODE_SESSION_ID` → race with Step 1a — heartbeat it
  again, **GOTO Step 1d**.
- Matching row, peer session owns it → continue to Step 1b.1.

**Step 1b.1 — Peer liveness cross-check (process-observing oracle, replaces the old self-reported
session-presence check; liveness-oracle brief §2-§4 — neither old oracle observed the OS):**
```bash
bash scripts/agents-flow/cron-marker-liveness-probe.sh --family standalone-team
```
Read the stdout JSON line: `{verdict, family, marker_owner_session, evidence:{o1,o2,o3},
recommended_action}`. Trichotomy (brief §4.1) — `DEAD` (O1: recorded PID absent, or its
`(pid,start_epoch,comm)` triple disagrees — no blind window), `LIVE` (O2: transcript mtime proves
live, or O1's triple agrees), `UNKNOWN` (neither proves anything — never guessed).

- **`LIVE`** → compare `payload.jobs[].cron_expression` (all 6) against canonical (Step 1d table).
  All match → **STOP, no-op.** Log `"[cron-standalone-team] already armed by live peer session
  <SID> (probe evidence in the JSON line). No-op."` Mismatch → **STOP** (no cross-session
  `CronDelete`/`CronCreate` exists) — log + `send_telegram(channel="work", "[cron-standalone-team]
  peer session <SID> holds a live but stale-valued registration — will self-heal next re-run, or
  fix manually.")`.
- **`DEAD`** →
  ```
  release = call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
    task_id: "cron-registration:standalone-team", owner_client_session: <marker's owner_client_session>,
    orphan_threshold_seconds: 120
  })
  ```
  **No longer a liveness decision** (rewritten rationale, brief §4.4 — previously justified here as
  "no renewal hook, session-presence is the entire staleness signal", which presented a write-race
  window as a liveness argument and was never sound; see brief §2 for why session-presence proves
  neither LIVE nor DEAD). The probe already proved DEAD via O1; this is now only a write-side CAS
  guard ("has anything changed since I read the marker"), tool minimum `120`, uniform across all
  three families (this family already used `120` — value unchanged, justification is not).
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
  - `"defer"` → **STOP, no-op**. Log `"[cron-standalone-team] liveness UNKNOWN — deferred, alarm
    already raised by the probe. Will retry next re-arm."` **This family's current disposition**
    (no cross-session per-tick fire-election mutex exists across `cron-agent-father.md` /
    `cron-claude-manager-helper.md` / `cron-db-data-integrity.md`; `cron-code-janitor.md` has only
    a local SKIP/SPAWN preflight, not a cross-session mutex — brief §4.2): temporary and narrowing
    — today wrong in both directions, after this fix wrong in at most one, and loudly. Durable fix
    is a per-tick mutex, tracked as `FOLLOWUP-CRON-STANDALONE-PER-TICK-FIRE-ELECTION-MUTEX` (brief
    R6) — **not** a blocker for this skill.
  `ERROR` (probe itself failed — transport/script, not ambiguity): the probe does **not** alarm
  internally — this skill must log + `send_telegram(channel="bug", "[cron-standalone-team]
  liveness probe ERROR — could not determine peer marker liveness. No registration attempted.")`,
  then follow the same `recommended_action` branch above.
- **`NO_MARKER`/`SELF`** → race between Step 1b's read and this probe call. `NO_MARKER` → re-read
  from Step 1b. `SELF` → **GOTO Step 1d**.

**Step 1c — Register the marker:**

Build the v2 process fingerprint (brief §4.5/§4.6 — `LC_ALL=C` wraps BOTH `ps` and `date`; this
family carried **no** fingerprint at all before this fix — O1 had zero wiring here):
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
  task_id: "cron-registration:standalone-team", task_kind: "sprint-task",
  owner_agent: "cron-standalone-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds: 691200,
  payload: {"jobs":[
    {"identity":"CADRAT-2 Job A","cron_expression":"15,45 4-11 * * 1-5"},
    {"identity":"CADRAT-2 Job B","cron_expression":"0 0 * * *"},
    {"identity":"agent-father/flow/main.md","cron_expression":"23 14 * * *"},
    {"identity":"claude-manager-helper/flow/main.md","cron_expression":"30 19 * * 1,4"},
    {"identity":"code-janitor/flow/main.md","cron_expression":"0 */6 * * *"},
    {"identity":"verify-market-db-journal-mode.sh","cron_expression":"*/15 * * * *"}
  ],"registered_at":"<ISO8601 now>","registering_process": REGISTERING_PROCESS_V2}
})
```
`claim.claimed == true` → **GOTO Step 1d.** `claim.claimed == false` → a peer won a race between
Step 1b's read and this claim → abort, re-run from Step 1b.

**Step 1d — Local two-phase classify (stale-vs-missing guard fix, §2 — Job1/Job2 identity anchor
FIXED here, see note below):**
```
CronList
```
For each of the 6 jobs below: Phase 1 — IDENTITY (stable, cadence-independent); Phase 2 — VALUE,
only for identity-matched entries (compare `cron_expression`).

| Job | Phase 1 identity anchor | Phase 2 canonical `cron_expression` |
|---|---|---|
| 1 (db-integrity weekday) | `description` contains `"CADRAT-2 Job A"` | `15,45 4-11 * * 1-5` |
| 2 (db-integrity off-hours) | `description` contains `"CADRAT-2 Job B"` | `0 0 * * *` |
| 3 (agent-father) | prompt contains `agent-father/flow/main.md` | `23 14 * * *` |
| 4 (claude-manager-helper) | prompt contains `claude-manager-helper/flow/main.md` | `30 19 * * 1,4` |
| 5 (code-janitor) | prompt contains `code-janitor/flow/main.md` | `0 */6 * * *` |
| 6 (market-db-journal-guard) | prompt contains `verify-market-db-journal-mode.sh` | `*/15 * * * *` |

**Job1/Job2 identity anchor fix (§2):** both jobs' `prompt` is byte-identical (both contain
`db-integrity-probe.sh`), so the OLD guard (which told them apart via `cron_expression`, the
field that can be stale) is replaced with `description`: `"CADRAT-2 Job A"` (Job1) vs `"CADRAT-2
Job B"` (Job2).

Per job: no identity match → missing → CronCreate (read `register.md` Step 2, this job only).
Identity match + value match → present-and-correct, no-op. Identity match + value mismatch →
`CronDelete(id=<found_id>)` THEN CronCreate the canonical entry (read `register.md` Step 2) —
replace in place, never add a 2nd copy.

**If ALL 6 present-and-correct → STOP. Log:** `[cron-standalone-team] All 6 crons already
registered. No-op.` Otherwise read `register.md` and execute its Step 2 for ONLY the
missing/stale entries (after any required `CronDelete` per the table above).

---

## Step 3 — Verify

```
CronList
```

Confirm all 6 entries appear. Log: `[cron-standalone-team] Verified — standalone crons live.
Jobs: <id1..id6>.` Any still missing after a reported-success CronCreate → log WARN +
`send_telegram(channel="bug", "[cron-standalone-team] WARN: CronCreate success but entry absent in CronList: <job>")`.

---

## Manage / Notes (lazy-load)

`CronList`/`CronDelete` admin reference (delete only with explicit user intent — each of the 5
crons is an independent maintenance sweep), the fire-election-out-of-scope rationale, the
`durable: true` session-scoping note, and the SSOT divergence discipline for Job 1-6 all live in
`register.md` (§ Manage, § Notes).
