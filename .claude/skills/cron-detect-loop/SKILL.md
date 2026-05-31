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
**SSOT cron values:** `.claude/commands/crons/cron-dev-team.md` + `cron-system-auditor.md`

---

## Why this skill exists

CronCreate is **session-scoped** in Claude Code CLI — crons evaporate on session
exit regardless of `durable` flag (confirmed live, not a doc assumption).

`anomaly-task-bridge` (commit 5d5097d5) wired the full detect→plan loop:
system-auditor Tier-2/3 → anomaly-task-bridge → `repair_task_request` signal →
dev-team drain-signals.md → PO triage-signals.md → TASKS.md BACKLOG.

The loop is only live when ALL 4 crons are registered. This skill eliminates
the need for the operator to manually re-trigger them after every restart.

---

## Step 1 — Idempotency guard

```
CronList
```

Scan output for existing entries. Check for ALL 4 of:
1. `cron_expression` = `7 * * * *`  AND prompt contains `dev-team/flow/main.md`
2. `cron_expression` = `*/30 * * * *` AND prompt contains `AUDIT_TIER=1`
3. `cron_expression` = `0 */4 * * *`  AND prompt contains `AUDIT_TIER=2`
4. `cron_expression` = `0 2 * * *`    AND prompt contains `AUDIT_TIER=3`

**If ALL 4 found → STOP. Log:**
`[cron-detect-loop] All 4 crons already registered. No-op.`

If any subset is missing → proceed to Step 2 for ONLY the missing entries.

---

## Step 2 — Register missing crons

SSOT: `.claude/commands/crons/cron-dev-team.md` + `cron-system-auditor.md`
— re-sync if cadence changes there. Values below are verbatim copies.

Only execute CronCreate for entries NOT found in Step 1.

**Job 1 — dev-team hourly**
```
CronCreate(
  description : "dev-team hourly — signal drain + task planning",
  cron        : "7 * * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Read and execute docs/agents/dev-team/flow/main.md\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

**Job 2 — system-auditor Tier-1 (runtime ping)**
```
CronCreate(
  description : "system-auditor Tier-1 runtime ping",
  cron        : "*/30 * * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md\nAUDIT_TIER=1\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

**Job 3 — system-auditor Tier-2 (freshness sweep)**
```
CronCreate(
  description : "system-auditor Tier-2 freshness sweep",
  cron        : "0 */4 * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md\nAUDIT_TIER=2\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

**Job 4 — system-auditor Tier-3 (deep DB integrity)**
```
CronCreate(
  description : "system-auditor Tier-3 deep DB integrity",
  cron        : "0 2 * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md\nAUDIT_TIER=3\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

On each success: log `[cron-detect-loop] Registered <job-name> (id=<id>).`

On each failure: log error verbatim +
`send_telegram(channel="bug", "[cron-detect-loop] CronCreate FAILED for <job-name>: <error>")`.
Do NOT retry. Continue with remaining jobs.

---

## Step 3 — Verify

```
CronList
```

Confirm all 4 entries now appear. Log:
`[cron-detect-loop] Verified — detect→plan loop live. Jobs: <id1>, <id2>, <id3>, <id4>.`

If any entry still missing after CronCreate reported success → log WARN +
`send_telegram(channel="bug", "[cron-detect-loop] WARN: CronCreate success but entry absent in CronList: <job>")`.
