# EMIT-DARK-RECURRING — Root Cause Brief

**Date:** 2026-06-05T16:37Z  
**Author:** agents-architect  
**Escalation reason:** 2 prior code fixes (545aae11 + 29d7e944) did not resolve live symptom  
**Scope:** Bounded diagnosis only — no implementation  

---

## 1. Evidence Summary

**Confirmed dark:** `docs/data/pressure-state.json` ABSENT on disk. `docs/data/cycle-snapshot-latest.json` ABSENT. Most recent cycle-snapshot-HH:MM file is from 2026-06-03T02:04Z (3 days old). Zero new cycle-snapshot files written today despite FIRE ticks at 15:01Z, 16:02Z.

**Confirmed ticks ran Steps 4.7/4.8:** Telemetry signals `cowork-team-2026-06-05T15:01:15Z.json` and `cowork-team-2026-06-05T16:02:04Z.json` both carry `"pressure_mode": "legacy"` — which Step 4.2 only sets when `pressure-state.json` is missing/stale. Since Steps 4.7/4.8 are the sole writers of those files, this closes the loop: they ran post Step 4.6, yet produced no output.

**Fix re-read confirmed:** CronCreate prompt is `"run docs/agents/cowork-team/flow/main.md"` — the agent re-reads main.md from disk on every fire. Sub-flows referenced by `→ Run sub-flow:` directives are also read fresh per tick. The 15:01Z and 16:02Z ticks fired AFTER the fix commits (13:23Z, 13:29Z) — the running agent had the updated flow files available.

---

## 2. H1 — Stale session (RULED OUT)

CronCreate re-reads `main.md` on every prompt. Sub-flow `.md` files are read at runtime by the agent. The two post-fix FIRE ticks at 15:01Z and 16:02Z occurred 90+ minutes after the fixes were committed and would have read the updated flow files. H1 is ruled out.

Operator refresh at 13:09Z may not have been applied, but it is irrelevant because the cron fires a fresh prompt regardless of session state.

---

## 3. H3 — Early-exit before Step 4.7 (RULED OUT)

Step 4 (silent-exit) fires only when `MATCHES is empty`. The telemetry signals show `won_slots` non-empty and agents spawned — Steps 4.7/4.8 were NOT bypassed by the silent-exit path. The `WON_SLOTS is non-empty` guard in tick-snapshot.md and pressure-emit.md was satisfied.

---

## 4. H2 — CONFIRMED ROOT CAUSE: Agent-interpreted prose steps are silently skipped

The DEFINITIF root cause is that Steps 4.7 and 4.8 are **agent-interpreted flow prose**, not mechanically enforced execution. The executing agent narrates these steps and silently does not run the bash or MCP calls, then proceeds to Step 5. Evidence:

**Structural tell:** The same pattern that was identified in DSI sprint memory: "a step is inert as agent-interpreted prose unless wired into the mechanical flow the agent executes." Steps 4.7 and 4.8 are described as "additive instrumentation — failure never blocks spawns." The LLM agent treats this as license to skip or summarize rather than execute. No assertion, no mandatory check, no observable side-effect that would surface in the telemetry signal.

**Corroborating evidence:**
- Both pressure-emit.md and tick-snapshot.md have `fail_loud: false` semantics — "never blocks spawns on failure." The agent interprets this as "optional."
- Neither file produces any git-committed output (files are gitignored), so there is zero visibility into whether the steps ran.
- The telemetry signal at Step 6 carries `pressure_mode` — if Step 4.7 ran, cycle-snapshot would exist for Step 4.8 to read `last_regime` from. It shows `"last_regime": "unknown"` implying cycle-snapshot was absent. Yet Step 4.8 ALSO failed to write pressure-state.json. Both failed in the same tick — consistent with both being skipped by the agent before proceeding to spawn.
- The pre-step pattern (agent-interpreted plain fence → then bash) was introduced as the "fix" for call_tool-in-bash. But the pre-step itself is also agent-interpreted prose. On an LLM agent, a "pre-step" in a plain fence is equally skippable. The fix corrected the structural defect (call_tool in bash) but did not change the fundamental problem: all of Step 4.7 and 4.8 run inside the agent's interpretive context, which has no enforcement mechanism.

---

## 5. Definitif Fix Direction

**The fix is NOT another prose/fence rearrangement.** The correct fix is to move the emit steps out of the agent-interpreted dispatch flow entirely and into a mechanical execution path that CANNOT be skipped.

Two viable approaches:

### Option A — Shell script invoked by CronCreate (RECOMMENDED)

Extend the CronCreate prompt or add a shell script step that is guaranteed to run outside the LLM interpretive layer:

```
prompt: "bash docs/scripts/agents-flow/cowork-pre-dispatch.sh && run docs/agents/cowork-team/flow/main.md"
```

`cowork-pre-dispatch.sh` writes pressure-state.json and cycle-snapshot-latest.json using the same bash logic currently in Steps 4.7/4.8. Because it runs as a real shell command before the LLM agent begins, it cannot be narrated away. The LLM agent's main.md still reads these files in Step 4.2 — the read path is unchanged.

Caveat: the MCP gateway calls (is_trading_day, get_cycle_bootstrap) cannot be called from a shell script — they require the LLM. Option A gives you pure-bash fields (emitted_at, tick_id, signal_backlog, dev_queue_depth, host_headroom_mb) but NOT calendar_status or market_context. That is acceptable for Phase 0 — pressure-read.md already handles missing/unknown calendar_status conservatively (AC-P0-4-6).

### Option B — Self-write via telemetry (ALTERNATIVE)

Embed the pressure-state write inside the telemetry.md Step 6 as a mandatory side-effect of writing the telemetry signal. Step 6 is guaranteed to run on every tick (telemetry is committed to git, so its execution is observable). The pressure-state payload can be computed inline from fields already present in the telemetry signal (fire_time, won_slots, pressure_mode, calendar_status, signal_backlog). This eliminates the separate Step 4.8 and anchors the write to a step that MUST execute.

This is architecturally cleaner (no new shell script, no CronCreate change) and works within the agent-interpreted context because Step 6 has an observable committed artifact that makes skipping detectable.

### Option C — Mandatory bash gate step (LOW CONFIDENCE)

Insert a mandatory `assert_emit_complete` bash step between Step 4.8 and Step 5 that checks `[ -f docs/data/pressure-state.json ]` and fails loud if absent. This makes skipping Step 4.8 visible but does not prevent it — the agent could skip both 4.8 AND the assert. Not recommended as standalone fix.

**Recommended sequence:** Option B (anchor to telemetry Step 6) as the definitif fix. Option A (shell script) as belt-and-suspenders for the pure-bash fields. Both require agent-father to edit telemetry.md and optionally create a pre-dispatch shell script. No main.md change required.

---

## 6. Verdict

| Hypothesis | Status |
|---|---|
| H1: stale session | RULED OUT — cron re-reads flow files on every fire |
| H3: early-exit before 4.7/4.8 | RULED OUT — won_slots non-empty, Step 5 spawned |
| H2: agent-interpreted steps silently skipped | CONFIRMED ROOT CAUSE |

**Action type:** Code change (not operator action). Operator refresh will NOT resolve this.

---

## 7. Files to Change (agent-father scope)

1. `docs/agents/cowork-team/flow/telemetry.md` — add mandatory pressure-state write as Step 6 side-effect (Option B)
2. `scripts/agents-flow/cowork-pre-dispatch.sh` — NEW: pure-bash pre-dispatch emit (Option A belt-and-suspenders)
3. `docs/agents/cowork-team/flow/main.md` — if CronCreate prompt is changed for Option A pre-dispatch

Secondary (monitoring):
4. `docs/agents/cowork-team/flow/telemetry.md` — add `tick_snapshot_written: true/false` field to telemetry payload to make Step 4.7 outcome observable

**Priority:** LOW-harm (legacy cadence works, no outage). Can be batched with next dev-team tick.

---

**Signal:** `docs/signals/emit-dark-root-cause-20260605T163744Z.json` → agent-father
