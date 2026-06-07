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

```
CronCreate(
  description : "cowork-team master dispatcher — fires every 15 min, fans out to schedule SSOT (agents spawned run_in_background=true per BGFAN-1)",
  cron        : "*/15 * * * *",
  prompt      : "run docs/agents/cowork-team/flow/main.md",
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
