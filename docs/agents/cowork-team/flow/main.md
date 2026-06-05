<!-- size-justification: 109L — thin dispatcher; full logic extracted to 10 child sub-flows. JUMP-TO table routes each step. Step 0a drain inline (7L). NB-COWORK-MAIN-SPLIT refactor 2026-06-03. EMIT-DARK-v2 2026-06-05: telemetry.md Step 6.0 uses call_tool emit_pressure_state (Option C). -->

# cowork-team — Master Cron Dispatcher

## Team Boundary (Sprint 1951c)

This dispatcher spawns ONLY cowork-team agents per `docs/data/cowork-schedule.json`:
- **scheduled:** news-scout, market-watcher, financial-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau, refine_bctc_md
- **demand-spawnable:** report-analyzer, qa-responder, market-analyst

NEVER spawn dev-team agents (po, ba, architect, pm, developer, qa, fixer, dev-*, ops) from this dispatcher.

Cross-team work: write a signal row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md`. Dev-team drains the signal_queue at its next cycle.

Maintenance agents (agent-father, agents-architect, claude-manager-helper, code-janitor, system-auditor, cowork-refactory-expert, idea-forge) are invoked by main terminal or self-cron — NEVER spawned by this dispatcher.

Fires every 15 min via `*/15 * * * *` CronCreate. Reads `docs/data/cowork-schedule.json`, matches UTC ±2min, parallel fan-out matching subagents in one message block.

<!-- decision: OQ-1 — agent_id maps 1:1 to subagent_type. Spawn prompt = "run <flow_path> slot=<slot_id>". -->
<!-- decision: OQ-2 — Collision guard in match-slots.md Step 4b (WARNING only, R3 allows multi-slot). -->

**SSOT:** `docs/data/cowork-schedule.json`  **Fail-loud:** `docs/protocols/fail-loud-protocol.md`

---

## Dispatch — JUMP-TO table

| Step | What | Sub-flow |
|---|---|---|
| 0a | Drain signal_queue | inline below |
| 0b | Claim cowork-leader lock | `leader-lock.md` |
| 1–4b | Resolve UTC, match slots, drift guard, silent-exit, collision guard | `match-slots.md` |
| 4.2–4.3 | Read pressure-state, calendar suppression | `pressure-read.md` |
| 4.4–4.5b | Cadence due-check, freshness downgrade, rebind MATCHES | `pressure-cadence.md` |
| 4.6–4.6b | Per-work-item slot claim tokens, leader heartbeat | `slot-claim.md` |
| 4.7 | Write shared tick snapshot | `tick-snapshot.md` |
| 4.8 | Pressure-state emit (no-op stub — Step 6 uses call_tool emit_pressure_state, EMIT-DARK-v2 Option C) | `pressure-emit.md` |
| 5 | Parallel fan-out + published-marker gate contract | `spawn-fanout.md` |
| 5b | Batch last_fired write | `last-fired.md` |
| 6 + Error Guard | Write telemetry signal; Step 6.0 call_tool emit_pressure_state (mandatory, un-skippable); Step 6.1 conditional signal write; unhandled error boundary | `telemetry.md` |

---

## Step 0a — Drain `docs/data/orch/orch-state.json .signal_queue` (cross-team inbox)

Read `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md` § READ.
Find all cowork-addressed rows (`to` ∈ {po, tran-ngoc-bau, unified-agent, alert-commander}).
Collect `status=NEW` rows → load payload_ref → route to matching agent slot at Step 5 or log for PO.
Mark each processed row `NEW → READ` (atomic write). If orch-state.json missing → log `"[cowork-team] signal_queue skip"` and continue. Never fail-loud on this step.

---

## Step 0b — Leader lock

→ Run sub-flow: `docs/agents/cowork-team/flow/leader-lock.md`

---

## Steps 1–4b — Slot matching

→ Run sub-flow: `docs/agents/cowork-team/flow/match-slots.md`

---

## Steps 4.2–4.3 — Pressure read + calendar suppression

→ Run sub-flow: `docs/agents/cowork-team/flow/pressure-read.md`

---

## Steps 4.4–4.5b — Cadence due-check + freshness downgrade

→ Run sub-flow: `docs/agents/cowork-team/flow/pressure-cadence.md`

---

## Steps 4.6–4.6b — Slot claim tokens + leader heartbeat

→ Run sub-flow: `docs/agents/cowork-team/flow/slot-claim.md`

---

## Step 4.7 — Tick snapshot

→ Run sub-flow: `docs/agents/cowork-team/flow/tick-snapshot.md`

---

## Step 4.8 — Pressure-state emit

→ Run sub-flow: `docs/agents/cowork-team/flow/pressure-emit.md`

---

## Step 5 — Parallel fan-out

→ Run sub-flow: `docs/agents/cowork-team/flow/spawn-fanout.md`

---

## Step 5b — Batch last_fired write

→ Run sub-flow: `docs/agents/cowork-team/flow/last-fired.md`

---

## Step 6 + Error Guard — Telemetry + error boundary

→ Run sub-flow: `docs/agents/cowork-team/flow/telemetry.md`
