Create orch-sentinel crons with CronCreate (two modes: FULL weekly + LITE daily). Run both.

**Both entries point at `docs/agents/orch-sentinel/flow/main.md`** — never a sub-flow directly, per
`.claude/skills/dispatch/SKILL.md` Auto-Switch Protocol ("Cron skill files MUST point to `main.md`").
`main.md` extracts `MODE=FULL|LITE` from the spawn prompt and dispatches internally (same pattern as
system-auditor's `AUDIT_TIER=N` token).

**Fire-election:** both crons are FIXED-TIME (not `*/N` interval) per `.claude/skills/dispatch-claim/SKILL.md`
§ Fire-Time Election. `main.md` Step 0c computes `FIRE_TICK`/`FIRE_TASK_ID` and claims before any
dimension work runs — see `docs/agents/orch-sentinel/flow/main.md` § Step 0c for the full election
logic (same claimed/re-entrant/peer-collision branching as system-auditor's Step 0d).

**PO sign-off note (brief §6):** Resource Budget is proposed APPROVED in
`docs/architecture-briefs/2026-07-21-orchestration-health-agent.md` §6, but flagged for a PO
mandatory-critique pass before these crons go live, per the Host-Load Budget Rule. **This file
documents the cron shape only — agent-father does NOT arm/register any `CronCreate` itself; that is a
router/PO-gated action, reported as PENDING in agent-father's RETURN block.**

> ⚠️ **CronCreate fires at MACHINE-LOCAL time (France), NOT UTC.** Host = France (CEST=UTC+2
> summer / CET=UTC+1 winter); VN is fixed UTC+7. Both cron expressions below are corrected to
> their CEST value (current season) with the CET value alongside — switch at DST changeover
> (FIX-CRON-DST-LOCAL-EVAL-MOMENT-ANCHORED-EXPRESSIONS, 2026-08-06; originally authored as if
> evaluated in UTC — same defect class `cron-claude-manager-helper.md` / `cron-auditor-page-
> reverify.md` already document and correct). Neither cron is armed yet — fix landed before
> arming, per AC-4 of that task.

---

## MODE=FULL — Weekly Deep Sweep (Sunday, VN market fully closed)

- **cron**: `18 5 * * 0` (summer/CEST: 05:18 local = 03:18 UTC = 10:18 VN Sunday. Winter/CET:
  `18 4 * * 0` — same UTC/VN target)
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=orch-sentinel). Read and execute docs/agents/orch-sentinel/flow/main.md
  MODE=FULL
  MCP: https://zenmidi.com/vn-market/mcp
  ```
- **Dimensions run:** OH-1 + OH-2 + OH-3 + OH-4
- **Rationale:** Sunday = VN market fully closed (zero market-hours collision risk). `:18` stays off
  the `15,45 * * * *` db-data-integrity slots (that cron spawns its own system-auditor Claude
  subagent) and off all other fixed fleet minutes (`:00/:07/:12/:15/:27/:30/:37/:42/:45/:57`).

---

## MODE=LITE — Daily Plumbing Check (before VN market open)

**CADRAT-6 pre-gate (docs/architecture-briefs/2026-08-04-cadence-rationalization.md §8 item 7,
consistency only — no schedule change, timing unchanged per SS9 row 15):** the prompt below now
gives LITE the SAME `ALL_GREEN` + fresh-heartbeat shell pre-gate pattern system-auditor
Tier-1/2/3 already use, via `scripts/agents-flow/orch-sentinel-lite-probe.sh`. MODE=FULL (below)
is deliberately NOT gated.

- **cron**: `48 3 * * *` (summer/CEST: 03:48 local = 01:48 UTC = 08:48 VN daily, before 09:00 VN
  market open. Winter/CET: `48 2 * * *` — same UTC/VN target)
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Run: bash scripts/agents-flow/orch-sentinel-lite-probe.sh and read its exit code + one-line JSON verdict. If exit code = 0 (verdict=SKIP-SPAWN): done, log '[cron-orch-sentinel] LITE SKIP-SPAWN (infra ALL_GREEN + OH-STATE run_ts fresh, no plumbing check needed this tick)', do NOT spawn a subagent. FAIL-OPEN on anything else — exit code 1 (verdict=SPAWN, includes infra FAILURE/missing or stale OH-STATE run_ts/probe fault): proceed to the existing prompt body below unchanged.

  Launch subagent (subagent_type=orch-sentinel). Read and execute docs/agents/orch-sentinel/flow/main.md
  MODE=LITE
  MCP: https://zenmidi.com/vn-market/mcp
  ```
- **Dimensions run:** OH-1 only (fastest-moving dimension — signal_queue/task_board plumbing; OH-2/3/4
  track doc/code/registry state that changes on a weekly-or-slower cadence, so running them daily is
  pure token cost with zero new signal)
- **Rationale:** Scheduled 12min before system-auditor Tier-3 (02:00 UTC target — see
  `cron-system-auditor.md`, itself now CEST/CET dual for the same DST reason) and off the
  `15,45 * * * *` db-data-integrity slots (that cron spawns its own system-auditor Claude subagent),
  avoiding host-load stacking at either boundary.

---

## Resource Budget Reference

Full line-itemed template (RAM/disk/tick-cost/model-rationale) → brief §6. Summary: zero new Docker
service, zero incremental resident RAM (on-demand session, same as system-auditor/agents-architect),
8 Claude sessions/week (1 FULL + 7 LITE), model=sonnet (OH-2/OH-3 require doc-parsing + coverage-gap
judgment, not pure numeric threshold comparison).

## No Manual/On-Demand Mode for v1

Unlike D-FLEET's pilot-first design, all 4 orch-sentinel dimensions are read-only doc/data-plane
checks with an established §6 budget — no code-dependency gate blocks a live cron the way D-FLEET's
§2c did. If a future dimension needs a pilot gate of its own, that is a separate architecture brief.

## Manage
`CronList` | `CronDelete <id>`
