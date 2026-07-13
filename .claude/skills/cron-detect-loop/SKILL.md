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

## Step 1 — Idempotency guard

```
CronList
```

Scan output for existing entries. Check for ALL 4 of:
1. `cron_expression` = `7,37 * * * *`  AND prompt contains `dev-team/flow/main.md`
2. `cron_expression` = `*/30 * * * *` AND prompt contains `AUDIT_TIER=1`
3. `cron_expression` = `0 */4 * * *`  AND prompt contains `AUDIT_TIER=2`
4. `cron_expression` = `0 2 * * *`    AND prompt contains `AUDIT_TIER=3`

**If ALL 4 found → STOP. Log:**
`[cron-detect-loop] All 4 crons already registered. No-op.`

If any subset is missing → read `.claude/skills/cron-detect-loop/register.md` and execute
its Step 2 for ONLY the missing entries.

---

## Step 3 — Verify

```
CronList
```

Confirm all 4 entries now appear. Log:
`[cron-detect-loop] Verified — detect→plan loop live. Jobs: <id1>, <id2>, <id3>, <id4>.`

If any entry still missing after CronCreate reported success → log WARN +
`send_telegram(channel="bug", "[cron-detect-loop] WARN: CronCreate success but entry absent in CronList: <job>")`.
