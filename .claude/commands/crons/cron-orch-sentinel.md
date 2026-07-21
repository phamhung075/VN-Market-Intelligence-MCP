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

---

## MODE=FULL — Weekly Deep Sweep (Sunday, VN market fully closed)

- **cron**: `15 3 * * 0` (03:15 UTC Sunday = 10:15 VN Sunday)
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=orch-sentinel). Read and execute docs/agents/orch-sentinel/flow/main.md
  MODE=FULL
  MCP: https://zenmidi.com/vn-market/mcp
  ```
- **Dimensions run:** OH-1 + OH-2 + OH-3 + OH-4
- **Rationale:** Sunday = VN market fully closed (zero market-hours collision risk). Clean slot — no
  other fleet cron scheduled at this boundary.

---

## MODE=LITE — Daily Plumbing Check (before VN market open)

- **cron**: `45 1 * * *` (01:45 UTC daily = 08:45 VN, before 09:00 VN market open)
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=orch-sentinel). Read and execute docs/agents/orch-sentinel/flow/main.md
  MODE=LITE
  MCP: https://zenmidi.com/vn-market/mcp
  ```
- **Dimensions run:** OH-1 only (fastest-moving dimension — signal_queue/task_board plumbing; OH-2/3/4
  track doc/code/registry state that changes on a weekly-or-slower cadence, so running them daily is
  pure token cost with zero new signal)
- **Rationale:** Scheduled 15min before system-auditor Tier-3 (`0 2 * * *`) to avoid host-load stacking
  at the same boundary.

---

## Resource Budget Reference

Full line-itemed template (RAM/disk/tick-cost/model-rationale) → brief §6. Summary: zero new Docker
service, zero incremental resident RAM (on-demand session, same as system-auditor/agents-architect),
2 Claude sessions/week (1 FULL + 7 LITE), model=sonnet (OH-2/OH-3 require doc-parsing + coverage-gap
judgment, not pure numeric threshold comparison).

## No Manual/On-Demand Mode for v1

Unlike D-FLEET's pilot-first design, all 4 orch-sentinel dimensions are read-only doc/data-plane
checks with an established §6 budget — no code-dependency gate blocks a live cron the way D-FLEET's
§2c did. If a future dimension needs a pilot gate of its own, that is a separate architecture brief.

## Manage
`CronList` | `CronDelete <id>`
