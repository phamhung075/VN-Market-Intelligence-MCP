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
dev-team drain-signals.md → PO triage-signals.md → `orch-state.json .task_board.backlog[]`.

The loop is only live when ALL 4 crons are registered. This skill eliminates
the need for the operator to manually re-trigger them after every restart.

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

If any subset is missing → proceed to Step 2 for ONLY the missing entries.

---

## Step 2 — Register missing crons

SSOT: `.claude/commands/crons/cron-dev-team.md` + `cron-system-auditor.md`
— re-sync if cadence changes there. Values below are verbatim copies.

Only execute CronCreate for entries NOT found in Step 1.

**Job 1 — dev-team every 30 min**

> TOKEN-ECONOMY-TICK-PREFLIGHT WU-2 (R6, 2026-07-02): this prompt now diverges from the plain
> "Read and execute main.md" template in `.claude/commands/crons/cron-dev-team.md` — this is the
> ONE deliberate exception to that file's "verbatim copy" rule. Rationale: `CronCreate`/`CronList`/
> `CronDelete` are Claude Code CLI-native tools, unreachable from `scripts/agents-flow/
> dev-team-tick-preflight.sh`'s curl transport, so self-arm can only be LLM-narrated — it must run
> FIRST, on every tick (RUN and SKIP alike), independent of which session wins the SF-1/fire-election
> locks. `main.md` Step 0-PREFLIGHT no longer reads this skill itself (see `docs/agents/dev-team/
> flow/main.md` jump:preflight-fallback annotation).

```
CronCreate(
  description : "dev-team every 30 min — signal drain + task planning",
  cron        : "7,37 * * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Self-arm FIRST (idempotent): read and execute .claude/skills/cron-detect-loop/SKILL.md (re-registers this session's own crons). Then run: bash scripts/agents-flow/dev-team-tick-preflight.sh (requires $CLAUDE_CODE_SESSION_ID) and read its one-line JSON verdict. On verdict=RUN: read and execute docs/agents/dev-team/flow/main.md starting at the gcc-preflight anchor (script already handled presence/SF-1/fire-election locks — do NOT re-run those steps). On verdict=SKIP: done, no further reads needed. On verdict=ERROR: read and execute docs/agents/dev-team/flow/main.md from the top (original inline pseudocode, unabridged fallback).\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

**Job 2 — system-auditor Tier-1 (runtime ping)**

> TOKEN-ECONOMY-TICK-PREFLIGHT WU-3 (R9/R10, 2026-07-02): this prompt now runs a PURE SHELL
> pre-gate (`scripts/agents-flow/auditor-tier1-probe.sh` — docker/curl/df, no MCP calls, no
> `mcp-call.sh`) FIRST; the `system-auditor` subagent is launched only on a non-`ALL_GREEN`
> verdict OR a stale heartbeat (passive-health-masking guard below — a silently dead probe must
> not look healthy). `docs/agents/system-auditor/flow/tier1-probe.md` is unchanged and is read in
> full by the subagent whenever it is spawned.

```
CronCreate(
  description : "system-auditor Tier-1 runtime ping",
  cron        : "*/30 * * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Run: bash scripts/agents-flow/auditor-tier1-probe.sh and read its one-line JSON verdict (fields: verdict, detail, last_healthy_at). Passive-health-masking guard (check every tick, even after ALL_GREEN — stale green is not green): read docs/data/auditor-tier1-last-healthy.json's .last_healthy_at (jq -r), compute its age in minutes against the current UTC time. If verdict=ALL_GREEN AND heartbeat age <= 60min (~2 tick periods): done, log '[cron-detect-loop] T1 ALL_GREEN (heartbeat fresh)', do NOT spawn a subagent. Otherwise (verdict=FAILURE, OR verdict=ALL_GREEN but heartbeat age > 60min, OR the script/heartbeat file is unreadable): Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md\nAUDIT_TIER=1\nMCP: https://zenmidi.com/vn-market/mcp"
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

---

## P3-OBSERVE-ONLY-RETIREMENT (TASK_1994 — activation gate: TASK_1995)

**What is superseded:**

The operator convention `feedback_router_manual_drive_overlaps_devteam_loop` ("pick ONE owner — don't manually drive dev-team when cron loop is running") is superseded by the code-enforced SF-1 + fire-time election in `docs/agents/dev-team/flow/main.md`.

Under P3:
- Any session attempting dev-team claims SF-1 (`dev-team-cron-singleton`, TTL=5400s) first.
- Then claims the fire-time election (`cron:dev-team:<TICK>`, TTL=600s).
- SF-1 prevents one session from running two overlapping ticks.
- Fire-election prevents two different sessions from both running the same tick.
- The loser EXITs cleanly after releasing SF-1 — no operator discipline required.

**Activation gate:**
Same as cron-cowork-team skill: supersession takes effect in code from TASK_1994 merge. MEMORY.md retirement update owed at P3-QA (TASK_1995) sign-off.

**dev-team period-key formula (reference):**
`cron:dev-team:<TICK>` where `TICK` = largest scheduled minute in {07, 37} ≤ current_minute → `YYYY-MM-DDTHH:MMZ`.
Example: fire at 14:09Z → TICK = "2026-06-28T14:07Z" (±2min jitter absorbed).

**system-auditor period-key formulas (reference):**
```
Tier-1 (*/30): floor(minute/30)*30 → YYYY-MM-DDTHH:MMZ
Tier-2 (0 */4): floor(hour/4)*4 → YYYY-MM-DDTHH:00Z
Tier-3 (0 2 *): fixed YYYY-MM-DDT02:00Z
```
See `docs/architecture-briefs/2026-06-28-fire-time-leader-election-P3-addendum.md` §A for full spec.
