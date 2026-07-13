# cron-detect-loop — Register (lazy-load detail)

Loaded from `.claude/skills/cron-detect-loop/SKILL.md` Step 1 ONLY when at least one of the 4
crons is missing — typically once per session restart, not on the ~46-48 no-op dev-team ticks/day
that re-read SKILL.md via Job 1's self-arm.

**SSOT:** This file (Step 2 below) is the operational SSOT — the `CronCreate` prompt bodies here
are exactly what gets registered on every re-arm. `.claude/commands/crons/cron-dev-team.md` +
`cron-system-auditor.md` are manual/ad-hoc reference docs for one-off cron setup outside this
auto-re-arm flow; their Job 1 / Tier-1 prompt text has diverged from this file's (see Step 2 note)
since 2026-07-02 (TOKEN-ECONOMY-TICK-PREFLIGHT WU-2/WU-3) — cadence (`cron` expression) values stay
identical across both, only prompt-body text may differ. Job 3/4 diverged too, 2026-07-04
(P1-IDLE-AUDITOR-CRON-WIRING) — see inline notes.

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

## Step 2 — Register missing crons

The `CronCreate` prompt bodies below ARE the operational SSOT — this is what `/cron-detect-loop`
actually registers. `.claude/commands/crons/cron-dev-team.md` + `cron-system-auditor.md` hold the
plain conceptual-shape prompts for manual/ad-hoc cron setup; Job 1 (dev-team) and Job 2
(system-auditor Tier-1) below have diverged from those files' simpler form (self-arm+script-branching
and shell-pre-gate+stale-heartbeat-guard logic respectively — see each Job's inline note) because
that logic only makes sense inside this auto-re-arm loop. Job 3/4 below now ALSO diverge from
`cron-system-auditor.md`'s plain form as of 2026-07-04 (P1-IDLE-AUDITOR-CRON-WIRING) — each runs
`auditor-tier1-probe.sh --tier=2`/`--tier=3` as a pre-gate, mirroring Job 2 (see inline notes).
Cron cadence (`cron` expression) values stay in sync across all files regardless — re-sync those
here if cadence changes in the command files.

Only execute CronCreate for entries NOT found in Step 1.

**Job 1 — dev-team every 30 min**

> TOKEN-ECONOMY-TICK-PREFLIGHT WU-2 (R6, 2026-07-02): this prompt diverges from the plain
> "Read and execute main.md" template in `.claude/commands/crons/cron-dev-team.md` — that file
> stays the simple manual/ad-hoc reference (see Step 2 SSOT note above); this file (the one
> actually re-armed) carries the extra logic. Rationale: `CronCreate`/`CronList`/
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
> full by the subagent whenever it is spawned. This diverges from `cron-system-auditor.md`'s plain
> Tier-1 form — that file stays the simple manual/ad-hoc reference (see Step 2 SSOT note above).

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

> P1-IDLE-AUDITOR-CRON-WIRING (2026-07-04): mirrors Job 2's shell pre-gate, but the tiered script
> (`run_tiered_probe --tier=2`) does the ALL_GREEN+fresh-heartbeat gating INSIDE the script, exit
> code `0`=SKIP-SPAWN, `1`=SPAWN, `2`=ERROR (bad --tier, shouldn't occur here). FAIL-OPEN mandatory:
> SKIP ONLY on exit 0. Exit 1/2/any-other-nonzero/unreadable → spawn as before — a probe fault must
> never suppress a legitimate auditor run.

```
CronCreate(
  description : "system-auditor Tier-2 freshness sweep",
  cron        : "0 */4 * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Run: bash scripts/agents-flow/auditor-tier1-probe.sh --tier=2 and read its exit code + one-line JSON verdict (fields: tier, checks_verdict, verdict, detail, last_healthy_at, fresh_threshold_minutes, heartbeat_age_minutes). If exit code = 0 (verdict=SKIP-SPAWN, meaning checks_verdict=ALL_GREEN AND heartbeat fresh): done, log '[cron-detect-loop] T2 SKIP-SPAWN (ALL_GREEN + fresh heartbeat)', do NOT spawn a subagent. FAIL-OPEN on everything else — exit code 1 (verdict=SPAWN), OR exit code 2 (verdict=ERROR), OR any other non-zero exit / unreadable output (never suppress a legitimate run on a probe fault): Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md\nAUDIT_TIER=2\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

**Job 4 — system-auditor Tier-3 (deep DB integrity)**

> P1-IDLE-AUDITOR-CRON-WIRING (2026-07-04): same pre-gate shape as Job 3, `--tier=3` (own heartbeat
> file + 2880min/2x24h threshold, computed inside the script). Same FAIL-OPEN contract: SKIP ONLY
> on exit 0 (SKIP-SPAWN); spawn on exit 1 (SPAWN), exit 2 (ERROR), or any other nonzero/unreadable.

```
CronCreate(
  description : "system-auditor Tier-3 deep DB integrity",
  cron        : "0 2 * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Run: bash scripts/agents-flow/auditor-tier1-probe.sh --tier=3 and read its exit code + one-line JSON verdict (fields: tier, checks_verdict, verdict, detail, last_healthy_at, fresh_threshold_minutes, heartbeat_age_minutes). If exit code = 0 (verdict=SKIP-SPAWN, meaning checks_verdict=ALL_GREEN AND heartbeat fresh): done, log '[cron-detect-loop] T3 SKIP-SPAWN (ALL_GREEN + fresh heartbeat)', do NOT spawn a subagent. FAIL-OPEN on everything else — exit code 1 (verdict=SPAWN), OR exit code 2 (verdict=ERROR), OR any other non-zero exit / unreadable output (never suppress a legitimate run on a probe fault): Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md\nAUDIT_TIER=3\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

On each success: log `[cron-detect-loop] Registered <job-name> (id=<id>).`

On each failure: log error verbatim +
`send_telegram(channel="bug", "[cron-detect-loop] CronCreate FAILED for <job-name>: <error>")`.
Do NOT retry. Continue with remaining jobs.

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
