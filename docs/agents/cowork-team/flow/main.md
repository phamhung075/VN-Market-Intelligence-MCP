<!-- size-justification: ~100L — thin dispatcher; TE-T03 2026-08-11 extracted the fallback/WORK-continuation body (~2/3 of file) into work-tick.md (Step 0a + 0b.3, shared) and preflight-error-fallback.md (full ERROR chain). -->
<!-- BGFAN-1: ALL Agent spawns from this dispatcher MUST use run_in_background=true. Cowork agents are independent → genuine parallel background fan-out. Canonical rule → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate -->

# cowork-team — Master Cron Dispatcher

## Team Boundary (Sprint 1951c)

This dispatcher spawns ONLY cowork-team agents per `docs/data/cowork-schedule.json`:
- **scheduled:** news-scout, market-watcher, financial-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau, refine_bctc_md, fb-market-poster
- **demand-spawnable:** report-analyzer, qa-responder, market-analyst

NEVER spawn dev-team agents (po, ba, architect, pm, developer, qa, fixer, dev-*, ops) from this dispatcher.

Cross-team work: write a signal row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md`. Dev-team drains the signal_queue at its next cycle.

Maintenance agents (agent-father, agents-architect, claude-manager-helper, code-janitor, system-auditor, cowork-refactory-expert, idea-forge) are invoked by main terminal or self-cron — NEVER spawned by this dispatcher.

Fires every 15 min via `*/15 * * * *` CronCreate. Reads `docs/data/cowork-schedule.json`, matches UTC ±2min, parallel fan-out matching subagents in one message block.

<!-- decision: OQ-1 — agent_id maps 1:1 to subagent_type. Spawn prompt = slot.trigger_prompt
     (falls back to composed "run <flow_path> slot=<slot_id>" only if trigger_prompt is
     absent — corrected FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE
     2026-07-29; see spawn-fanout.md Step 5.2 for the full consistency-check contract). -->
<!-- decision: OQ-2 — Collision guard in match-slots.md Step 4b (WARNING only, R3 allows multi-slot). -->

**SSOT:** `docs/data/cowork-schedule.json`  **Fail-loud:** `docs/protocols/fail-loud-protocol.md`

---

## Dispatch — JUMP-TO table

| Step | What | Sub-flow |
|---|---|---|
| 0a | Drain signal_queue | `work-tick.md` § Step 0a (ERROR path) / direct call from § WORK continuation (WORK path) |
| 0b | Session-presence self-register + Fire-time election (P3 — cron:cowork:<tick>) | `preflight-error-fallback.md` § Step 0b.1 (ERROR path only) then `leader-lock.md` |
| 0b.3 | Drain due one-shot scheduled tasks (DEFERRED-TASK-SCHEDULER-MVP) | `work-tick.md` § Step 0b.3 (ERROR path) / direct call from § WORK continuation (WORK path) |
| 0c | Blind detection — gateway preflight | `blind-guard.md` |
| 1–4b | Resolve UTC, match slots, drift guard, silent-exit, collision guard | `match-slots.md` |
| 4.2–4.3 | Read pressure-state, calendar suppression | `pressure-read.md` |
| 4.4–4.5b | Cadence due-check, freshness downgrade, rebind MATCHES | `pressure-cadence.md` |
| 4.6–4.6b | Per-work-item slot claim tokens, leader heartbeat | `slot-claim.md` |
| 4.7 | Write shared tick snapshot | `tick-snapshot.md` |
| 4.8 | Pressure-state emit (no-op stub — Step 6 uses call_tool emit_pressure_state, EMIT-DARK-v2 Option C) | `pressure-emit.md` |
| 5 | Parallel fan-out + published-marker gate contract + spawn-identity preamble (5.2) + off-flow router-latch detector (5.3) | `spawn-fanout.md` |
| 5b | Batch last_fired write | `last-fired.md` |
| 6 + Error Guard | Write telemetry signal; Step 6.0 call_tool emit_pressure_state (mandatory, un-skippable); Step 6.1 conditional signal write; Step 6.2 commit tick artifacts (mutex-guarded, pathspec-scoped); unhandled error boundary | `telemetry.md` |
| ERROR (any step) | Preflight script transport/tool/local-guard failure — full original Steps 0a-6 chain | `preflight-error-fallback.md` |

---

## Step 0 — Cowork Preflight (TOKEN-ECONOMY-TICK-PREFLIGHT WU-1)

Run the deterministic preflight script FIRST and capture its one-line JSON verdict — on the
common SILENT/WORK path this replaces the LLM-narrated Steps 0a-4b below entirely (~80% of
ticks are silent off-hours/no-due-work; this cuts that to one bash call + a short JSON reply).

```bash
VERDICT_JSON=$(bash "$PROJECT_ROOT/scripts/agents-flow/cowork-tick-preflight.sh")
PREFLIGHT_RC=$?
VERDICT=$(echo "$VERDICT_JSON" | jq -r '.verdict')
```

Script SSOT: `scripts/agents-flow/cowork-tick-preflight.sh` (uses shared `scripts/agents-flow/mcp-call.sh`). Requires `$CLAUDE_CODE_SESSION_ID` in the environment.

### JUMP-TO table (preflight verdict)

| Verdict | Action |
|---|---|
| `SILENT` | Done. Script already emitted pressure state (Step 8) and released the election lock. No LLM read of Steps 0a-6 needed. EXIT. |
| `WORK` | Election lock is HELD by this session. Continue at **§ WORK continuation** below — do NOT re-run Steps 0b/0b.3/0c/1-4b, they are already satisfied by the script's Steps 2-6. |
| `LOST_ELECTION` | Done. Script already sent the `work`-channel telegram (peer session leads this tick). EXIT. |
| `DEFER` | Done. AF-1 backstop-window defer — retries automatically at the next 15-min tick. EXIT. |
| `ERROR` | Script hit a transport/tool/local-guard failure (`$VERDICT_JSON.detail` has why). Election lock state is undefined. Fall back to → Run sub-flow: `docs/agents/cowork-team/flow/preflight-error-fallback.md` (full original Steps 0a-6 chain — unchanged, never deleted) — read from **Step 0a** onward as if the script never ran. |
| `TOMBSTONED` | Done. `pressure-state.json`'s `tick_id` already matched this nominal tick — a prior session already completed it. Script made ZERO `task_claim` calls on `cron:cowork:<tick>` (suppressed before the election attempt, FR-1/FR-3). No re-elect, no re-run. EXIT. |
| *(any other/unrecognized verdict string)* | **Fail-safe (NFR-5):** do NOT default to the WORK continuation path. Treat as done/EXIT, same as SILENT/LOST_ELECTION/DEFER — an unrecognized verdict means either a stale caller (e.g. an armed cron prompt that predates a verdict this script now emits) or a script bug; neither justifies running the dispatch body. |

### § WORK continuation

The script already: registered presence (Step 2), won the fire-time election (Step 3 — lock
HELD, released later by `telemetry.md` Step 6 P3 release, unchanged), claimed due one-shots
(Step 4 — `$VERDICT_JSON.one_shots[]` carries the FULL claimed task objects, R2), confirmed the
gateway is not blind (Step 5), and matched slots (Step 6 — `$VERDICT_JSON.slots[]` carries full
slot objects). **Do NOT re-call `claim_due_scheduled_tasks` or `cowork-match-slots.js`** —
re-claiming would find the rows already flipped to `firing`, orphaning them (R2).

1. **Drain signal_queue** — the script only did a READ-ONLY count for the SILENT gate (R4); run
   the real drain-and-route-and-mark-READ body → `work-tick.md` § Step 0a, against the live
   `.signal_queue.rows[]`.
2. **Route one-shots** — for each object in `$VERDICT_JSON.one_shots[]`, run the routing body →
   `work-tick.md` § Step 0b.3 (deadline gate → PRE-CLAIM intent gate + background spawn for
   `team=="COWORK"` rows / signal_queue emission for `team=="DEV"` rows → `complete_scheduled_task`)
   directly on the already-claimed object — skip the `claim_due_scheduled_tasks` call itself
   (already done).
3. **Slots** — treat `$VERDICT_JSON.slots[]` as `MATCHES` and `$VERDICT_JSON.drift_min` as
   `DRIFT_MIN`; run Step 4b (collision-detection guard) only — skip Steps 1-3 and Step 4 silent-exit
   (already computed by the script; WORK implies at least one of slots/one_shots/new_signals is non-empty).
4. **Continue unchanged** at Steps 4.2-4.3 (`pressure-read.md`), 4.4-4.5b (`pressure-cadence.md`),
   4.6-4.6b (`slot-claim.md`), 4.7 (`tick-snapshot.md`), 4.8 (`pressure-emit.md`), 5
   (`spawn-fanout.md`), 5b (`last-fired.md`), 6 (`telemetry.md` — the P3 election-lock release
   stays the single release point on the WORK path).

---

## ERROR Fallback

Preflight verdict `ERROR` → Run sub-flow: `docs/agents/cowork-team/flow/preflight-error-fallback.md` (full original Steps 0a-6 pseudocode chain, read from Step 0a onward as if the script never ran — unchanged, never deleted, now hosted there per TE-T03 2026-08-11).
