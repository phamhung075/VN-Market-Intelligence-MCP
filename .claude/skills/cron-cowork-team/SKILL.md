---
name: cron-cowork-team
description: >
  Session-start hook. Idempotently registers the master */15 * * * * CronCreate
  dispatcher that spawns cowork-team agents. Invoke after every Claude Code CLI
  session restart to re-arm the dispatcher. Second invocation is a no-op.
---

# cron-cowork-team — Master Dispatcher Registration Skill

**Trigger:** User types `/cron-cowork-team`
**Purpose:** Re-arm the `*/15 * * * *` CronCreate master dispatcher after any session reset.
**SSOT:** `docs/data/cowork-schedule.json`
**Dispatcher flow:** `docs/agents/cowork-team/flow/main.md`
**Runbook:** `docs/protocols/cowork-master-cron-runbook.md`

---

## Why this skill exists

The `cowork-team` master CronCreate dispatcher is **session-scoped** in Claude Code CLI. When the CLI session ends, the dispatcher evaporates. The 12 RemoteTriggers (sprint 1957a stopgap) provide persistence for the 12 guaranteed/hourly slots, but the `*/15` dispatcher covers sub-hourly market-hours slots (news-scout-market, market-watcher-market, alert-commander-market) and the general fan-out logic.

Invoking `/cron-cowork-team` at session start ensures the dispatcher is always live within one cron tick (≤15 min).

---

## Step 1 — Cross-session registration guard (FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.2/§2)

CronCreate/CronList are strictly per-CLI-session — a peer terminal's registration is invisible to
`CronList`. This step uses a cross-session marker (`task_id="cron-registration:cowork-team"`,
`task_kind="sprint-task"` reused per `coordinationStore.ts:446-451` precedent) so two sessions never
both `CronCreate` the same dispatcher, THEN runs the local `CronList` classify below.
Full mechanism spec: `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` §1.2-1.4.

**Step 1a — Fast path (cheap, blind heartbeat):**
```
hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cron-registration:cowork-team", owner_client_session: $CLAUDE_CODE_SESSION_ID
})
```
`hb.ok == true` → this session already owns the marker → **GOTO Step 1d** (local classify).
`hb.ok == false` → not found, or owned by someone else → continue to Step 1b.

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

**Step 1b.1 — Peer liveness cross-check (session-presence, primary staleness oracle):**
```
presence_rows = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "session-presence"})
# find the row whose owner_client_session matches the marker's owner_client_session
```
- **LIVE** (row found, unexpired) → compare the marker's `payload.jobs[].cron_expression` against
  canonical (Step 1d's Phase 2 table). All match → **STOP, no-op.** Log
  `"[cron-cowork-team] already armed by live peer session <SID>. No-op."`
  Any mismatch → **STOP** — do NOT register a 2nd copy (no cross-session `CronDelete`/`CronCreate`
  exists). Log + `send_telegram(channel="work", "[cron-cowork-team] peer session <SID> holds a live
  but stale-valued cowork-team registration — will self-heal next time that session re-runs the
  skill, or fix manually in that terminal.")`.
- **DEAD** (no presence row, or expired) →
  ```
  release = call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
    task_id: "cron-registration:cowork-team", owner_client_session: <marker's owner_client_session>,
    orphan_threshold_seconds: 7200
  })
  ```
  - `released:true` → **GOTO Step 1c** (register).
  - `released:false` (fresh heartbeat — race) → treat conservatively as LIVE → **STOP, no-op.**
  - `released:false` (lock not found — peer already rotated it) → re-read from Step 1b.

**Step 1c — Register the marker:**
```
claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: "cron-registration:cowork-team", task_kind: "sprint-task",
  owner_agent: "cron-cowork-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds: 691200,
  payload: {"jobs":[{"identity":"cowork-team master dispatcher","cron_expression":"*/15 * * * *"}],"registered_at":"<ISO8601 now>"}
})
```
`claim.claimed == true` → **GOTO Step 1d.** `claim.claimed == false` → a peer won a race between
Step 1b's read and this claim → abort, re-run from Step 1b.

**Step 1d — Local two-phase classify (stale-vs-missing guard fix, §2):**
```
CronList
```
Phase 1 — IDENTITY (stable, cadence-independent): find any live entry whose `description` contains
`"cowork-team master dispatcher"`.
Phase 2 — VALUE (only for identity-matched entries): compare `cron_expression` against
`*/15 * * * *` AND compare `prompt` for the `"TOMBSTONED"` fragment (the FIX-COWORK-FIRE-ELECTION-
TICK-TOMBSTONE content marker — its absence is exactly the stale-prompt bug this fix closes, see
rollout note below).

| Phase 1 | Phase 2 | Action |
|---|---|---|
| no match | — | genuinely missing → **Step 2** (CronCreate) |
| match | both values match | present-and-correct → **STOP, no-op.** Log `"[cron-cowork-team] Master dispatcher already registered (id=<id>). No-op."` |
| match | either value mismatches | present-but-WRONG → `CronDelete(id=<found_id>)` THEN **Step 2** (CronCreate canonical) — replace in place, never add a 2nd copy |

---

## Step 2 — Register the master CronCreate

Reached from Step 1d's "missing" or "mismatch" branch (mismatch branch runs `CronDelete` first,
immediately above).

<!-- BGFAN-1: The dispatcher that runs on each tick (cowork-team/flow/main.md → spawn-fanout.md) MUST spawn all cowork agents with run_in_background=true. Canonical rule → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate -->

> **TOKEN-ECONOMY-TICK-PREFLIGHT WU-2 (2026-07-13, TE-T01):** this prompt now mirrors dev-team
> Job 1 (`.claude/skills/cron-detect-loop/SKILL.md`) — the preflight script runs FIRST, directly
> from the cron prompt, so the ~80% of ticks that are SILENT/LOST_ELECTION/DEFER never pay the
> 15,916-byte `main.md` read at all. Rationale identical to dev-team's: `CronCreate` is LLM-narrated,
> unreachable from the script's own transport, so the script-first gate can only live in the prompt
> text, not inside main.md (main.md's own Step 0 — unchanged — remains the correct entry point for
> manual/ad-hoc invocations of this flow, e.g. testing or a direct operator run).

```
CronCreate(
  description : "cowork-team master dispatcher — fires every 15 min, fans out to schedule SSOT (agents spawned run_in_background=true per BGFAN-1)",
  cron        : "*/15 * * * *",
  prompt      : "Run: bash scripts/agents-flow/cowork-tick-preflight.sh (requires $CLAUDE_CODE_SESSION_ID) and read its one-line JSON verdict. On verdict=SILENT: done, no further reads needed (script already emitted pressure state and released the election lock). On verdict=WORK: read and execute docs/agents/cowork-team/flow/main.md starting at '§ WORK continuation' (script already handled presence/election/one-shot claims/blind guard/slot matching — do NOT re-run Steps 0b/0b.3/0c/1-4b, per main.md's own JUMP-TO table). On verdict=LOST_ELECTION: done, no further reads needed (script already sent the work-channel telegram — peer session leads this tick). On verdict=DEFER: done, no further reads needed (AF-1 backstop-window defer — retries automatically at the next 15-min tick). On verdict=TOMBSTONED: done, no further reads needed (pressure-state.json's tick_id already matched this nominal tick — a prior session already completed it; script made ZERO task_claim calls on cron:cowork:<tick>, suppressed before the election attempt — FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE FR-1/FR-3). On verdict=ERROR: read and execute docs/agents/cowork-team/flow/preflight-error-fallback.md starting at Step 0a (original inline pseudocode, unabridged fallback, hosted in this sibling file to main.md since TE-T03 2026-08-11 — do NOT re-run Step 0's preflight script, its result is undefined). On any other/unrecognized verdict string: done, EXIT — do NOT default to the WORK continuation path (stale prompt or script bug, neither justifies running the dispatch body).",
  durable     : true
)
```

**On success:** log `[cron-cowork-team] Master dispatcher registered. Next tick: <next UTC :00 or :15 or :30 or :45>. Dispatcher: docs/agents/cowork-team/flow/main.md`.

**On failure:** log error verbatim + send `send_telegram(channel="bug", "[cron-cowork-team] CronCreate FAILED: <error>")`. Do NOT retry. Report to user.

---

## Step 3 — Sanity verify

After creation, call `CronList` again. Confirm the new entry appears with `*/15 * * * *` and status active.

Log: `[cron-cowork-team] Verified — dispatcher live. id=<id>.`

---

## Manage — CronList / CronDelete

### List all active crons (inspect dispatcher health)

```
CronList
```

Expected output includes an entry with:
```
description : cowork-team master dispatcher
cron        : */15 * * * *
durable     : true
```

If this entry is ABSENT after a session reset → the dispatcher evaporated → invoke `/cron-cowork-team` to re-arm.

### Delete the master cron (admin only — requires explicit user intent)

```
# 1. Get the cron id from CronList output
CronDelete(id="<cron-id-from-CronList>")
# 2. Verify it no longer appears in CronList
CronList
```

**Warning:** deleting the master dispatcher silences all sub-hourly cowork slots (news-scout-market, market-watcher-market, alert-commander-market). The 12 RemoteTriggers continue to fire their hourly/guaranteed slots independently. Only delete if replacing with a new registration immediately.

---

## Notes

- The dispatcher reads `docs/data/cowork-schedule.json` at each tick and fans out only to slots whose `next_fire_at ≤ now` (±2 min window via `scripts/agents-flow/cowork-match-slots.js`).
- `durable: true` makes the cron persist across CLI process restarts within the same session. It does NOT survive session-end (CLI exit / restart). That is why this skill exists.
- The 12 RemoteTriggers (registered in claude.ai, not CLI) are the session-independent backstop for guaranteed slots. They fire independently of this dispatcher.
- Full silence-detection + recovery procedure: `docs/protocols/cowork-master-cron-runbook.md`.
- **TOKEN-ECONOMY-TICK-PREFLIGHT WU-1 (2026-07-02) → superseded by WU-2 (2026-07-13, TE-T01):**
  WU-1 shipped the deterministic `scripts/agents-flow/cowork-tick-preflight.sh` script and wired
  it into `main.md`'s own Step 0, but left the `CronCreate prompt:` text pointing straight at
  `main.md` — so every tick still paid the full 15,916-byte file read before Step 0 ever ran the
  script. WU-2 (Step 2 above) moves the script call into the prompt itself, so SILENT/LOST_ELECTION/
  DEFER ticks (~80% of fires) skip the `main.md` read entirely. main.md's own Step 0 and § Step 0
  JUMP-TO table are unchanged and still serve as the entry point for manual/ad-hoc runs of this flow.

---

## FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE rollout note (NFR-5(b)/(c)) — SUPERSEDED

**SUPERSEDED by FIX-CRON-REARM-CROSS-SESSION-DEDUP (2026-08-06/07).** Step 1d's two-phase
classify now checks Phase 2 VALUE for the `"TOMBSTONED"` prompt fragment specifically — a bare
`/cron-cowork-team` re-run correctly detects a stale `prompt:` (identity match + value mismatch)
and self-heals via `CronDelete` + `CronCreate`, closing the gap this note originally flagged. The
history below is kept for incident record; the manual rollout requirement it describes no longer
applies going forward.

**A bare `/cron-cowork-team` re-run BEFORE this fix shipped was a no-op.** The OLD Step 1
idempotency guard found the already-registered `*/15 * * * *` entry (matched by `cron_expression` +
`description` only) and STOPped — it did **not** diff or re-propagate the `prompt:` text, so the
live armed cron kept running the OLD prompt string (no `TOMBSTONED` clause, no defensive fallback)
until it was explicitly replaced.

**Rollout requires an explicit `CronDelete` + `CronCreate` re-arm — this is a required
post-merge deployment step, not optional cleanup:**
```
CronDelete(id=<current-id-from-CronList>)
```
then re-run Step 2 above to `CronCreate` with the updated `prompt:`.

Who runs this: main terminal (or whoever holds `CronCreate`/`CronDelete` tool access) — this
dispatcher's cron is session-scoped and is not spawnable by dev-team agents.

---

## P3-OBSERVE-ONLY-RETIREMENT (TASK_1994 — activation gate: TASK_1995)

**What is superseded:**

The operator convention `feedback_router_cowork_defer_to_live_leader` ("Router cowork OBSERVE-ONLY — parallel terminal owns cowork") is superseded by the code-enforced fire-time election in `docs/agents/cowork-team/flow/leader-lock.md`.

Under P3:
- Any session attempting the cowork dispatcher claims `cron:cowork:<TICK>` atomically.
- Only the winner fires the full dispatch pipeline (Steps 0c–6).
- The loser EXITs cleanly — no operator discipline required.
- Cross-session mutual exclusion is now code-enforced, not operator-enforced.

**Activation gate:**
This supersession takes effect in code from TASK_1994 merge. The MEMORY.md pointer for `feedback_router_cowork_defer_to_live_leader` is marked SUPERSEDED ONLY after P3-QA (TASK_1995) passes its 3 smoke tests:
1. Two sessions fire cowork tick simultaneously → exactly one {claimed:true}.
2. Session loses fire-election → EXITs cleanly with WORK telegram.
3. Dispatch completes → lock released → next tick elects fresh.

Until TASK_1995 sign-off, the operator convention remains as FALLBACK (if the code gate fails, the operator convention prevents double-dispatch).

**Period-key formula (reference):**
`cron:cowork:<TICK>` where `TICK = floor(current_minute / 15) * 15 → YYYY-MM-DDTHH:MMZ`.
See `docs/architecture-briefs/2026-06-28-fire-time-leader-election-P3-addendum.md` §A for full spec.
