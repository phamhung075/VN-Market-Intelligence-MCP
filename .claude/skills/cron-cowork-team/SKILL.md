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

## Step 1 — Check if master cron already exists (idempotency guard)

```
CronList
```

Scan output for any entry matching ALL of:
- `cron_expression` = `*/15 * * * *`
- `description` contains `cowork-team`

**If found → STOP. Log:** `[cron-cowork-team] Master dispatcher already registered (id=<id>). No-op.`

Do NOT create a duplicate. This is the idempotency guarantee.

---

## Step 2 — Register the master CronCreate

Only execute this step if Step 1 found no existing entry.

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
  prompt      : "Run: bash scripts/agents-flow/cowork-tick-preflight.sh (requires $CLAUDE_CODE_SESSION_ID) and read its one-line JSON verdict. On verdict=SILENT: done, no further reads needed (script already emitted pressure state and released the election lock). On verdict=WORK: read and execute docs/agents/cowork-team/flow/main.md starting at '§ WORK continuation' (script already handled presence/election/one-shot claims/blind guard/slot matching — do NOT re-run Steps 0b/0b.3/0c/1-4b, per main.md's own JUMP-TO table). On verdict=LOST_ELECTION: done, no further reads needed (script already sent the work-channel telegram — peer session leads this tick). On verdict=DEFER: done, no further reads needed (AF-1 backstop-window defer — retries automatically at the next 15-min tick). On verdict=ERROR: read and execute docs/agents/cowork-team/flow/main.md starting at Step 0a (original inline pseudocode, unabridged fallback — do NOT re-run Step 0's preflight script, its result is undefined).",
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
