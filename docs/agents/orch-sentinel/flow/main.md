# Orch Sentinel — Main Flow (Thin Dispatcher)

## Boundary — observe + report, NEVER fix

Same PLAN-ONLY posture as system-auditor's AUD-ND-1, generalized to the doc/coordination plane.
Full boundary → `docs/agents/orch-sentinel/init.md` `boundary_rules` + `constraints.plan_only_invariant`.
Never edits another agent's `.md`/flow/cron file. Never touches `.task_board`/`.head`/`.sprint_goal`.
Never flips status on any signal_queue row — own or another agent's.

---

**Tools:** `docs/agents/tools/package/orch-sentinel.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`
> (fail-loud carve-out: a single unreadable source skips that ONE check — mark `TOOL-UNAVAILABLE`
> in the scorecard — it never aborts the whole cycle; see `init.md` `boundary_rules.on_error`.)

## Input
- `MODE` variable: `FULL` | `LITE` (default: `LITE` if not set)
- Live doc/data-plane state (system-map.json, tool-registry.json, orch-state.json, all agent notebooks/flow docs)

## Output
- `docs/data/orch-sentinel-scorecard.md` regenerated in full (self-diffed against its own prior write)
- `docs/agent-memory/notebooks/orch-sentinel.md` full-overwrite (≤80L, OVERWRITE class)
- `docs/data/orch/orch-state.json .signal_queue.rows[]` rows via `scripts/orch-apply.sh` (anti-flood deduped)

---

**Step 0a — Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read prior scorecard** — Read `docs/data/orch-sentinel-scorecard.md` fully into memory (seeded shell on first run). Extract the trailing `<!-- OH-STATE: {json} -->` fenced block — this is the ONLY history mechanism (notebook is OVERWRITE-class and holds none). Hold in memory for OH-2.2/OH-4.2/OH-4.3 delta computation inside the dimension sub-flows.

---

## MODE Extraction (mandatory — run before any other step)

Scan the spawn prompt verbatim for the token `MODE=<value>`.
- Found `MODE=FULL` → set MODE=FULL
- Found `MODE=LITE` → set MODE=LITE
- Not found or unrecognized → **default MODE=LITE** (log: `"[MODE-DISPATCH] MODE not set — defaulting to LITE"`)

The extracted MODE MUST propagate to: (1) the dispatch branch below, (2) the notebook cycle heading, (3) the RETURN line.

---

## Step 0c — Fire-Time Election

Per `.claude/skills/dispatch-claim/SKILL.md` § Fire-Time Election (fixed-time pattern — both crons are fixed-time, not `*/N` intervals). Runs AFTER MODE extraction, BEFORE any dimension work.

```
if MODE == "FULL":
  # cron expression: 15 3 * * 0 (fixed: 03:15 UTC Sunday)
  FIRE_TICK = $(date -u +"%Y-%m-%dT03:15Z")
  FIRE_TASK_ID = "cron:orch-sentinel-full:" + FIRE_TICK
elif MODE == "LITE":
  # cron expression: 45 1 * * * (fixed: 01:45 UTC daily)
  FIRE_TICK = $(date -u +"%Y-%m-%dT01:45Z")
  FIRE_TASK_ID = "cron:orch-sentinel-lite:" + FIRE_TICK

fire_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: FIRE_TASK_ID, task_kind: "sprint-task", owner_agent: "orch-sentinel",
  owner_client_session: $CLAUDE_CODE_SESSION_ID, ttl_seconds: 600,
  payload: {"site": "fire-election", "mode": MODE, "tick": FIRE_TICK}
})

if fire_result.claimed == false:
  peer = fire_result.current_holder.owner_client_session
  if peer == $CLAUDE_CODE_SESSION_ID:
    log "[orch-sentinel] fire-election RE-ENTRANT mode=" + MODE + " tick=" + FIRE_TICK
    call_tool(server="vn-market", tool="task_heartbeat", arguments={task_id: FIRE_TASK_ID, owner_client_session: $CLAUDE_CODE_SESSION_ID})
    # proceed
  else:
    log "[orch-sentinel] fire-election SKIP mode=" + MODE + " tick=" + FIRE_TICK + " — peer=" + peer
    call_tool(server="vn-market", tool="send_telegram", arguments={channel: "work",
      message: "[orch-sentinel] " + MODE + " fire-election SKIP tick=" + FIRE_TICK + " (peer session leads)"})
    EXIT   # clean exit — no work, no orphan signals
# else: claimed=true → won the election → proceed
```

Release convention: `task_release(task_id=FIRE_TASK_ID, owner_client_session=$CLAUDE_CODE_SESSION_ID)` at the very end of the cycle (inside `emit-scorecard.md`, after notebook write + commit). TTL=600s is the crash-safety backstop; explicit release is the normal exit path.

---

## Mode Dispatch

- **MODE=LITE** → run `docs/agents/orch-sentinel/flow/dim-oh1-feedback-loop.md` + `docs/agents/orch-sentinel/flow/dim-oh2-verification-coverage.md` (§ OH-2.4 section ONLY — skip OH-2.1–2.3, still FULL-only; FIX-BEHAVIORAL-VERIFICATION-GATE-OH24-CADENCE 2026-08-26, `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md` §6 "Cadence") → `docs/agents/orch-sentinel/flow/emit-scorecard.md` (label: LITE) → RETURN
- **MODE=FULL** → run `docs/agents/orch-sentinel/flow/dim-oh1-feedback-loop.md` + `docs/agents/orch-sentinel/flow/dim-oh2-verification-coverage.md` (full — OH-2.1 through OH-2.4) + `docs/agents/orch-sentinel/flow/dim-oh3-auditor-blindspot.md` + `docs/agents/orch-sentinel/flow/dim-oh4-capability-utilization.md` (in that order) → `docs/agents/orch-sentinel/flow/emit-scorecard.md` (label: FULL) → RETURN

Each dimension sub-flow returns its findings as an in-memory list of `{check_id, severity, metric, summary}` rows — no dimension sub-flow writes to disk itself. `emit-scorecard.md` is the sole writer (notebook + scorecard + signal_queue), collecting all dimension outputs from this cycle.

---

## Agent-Specific Error Cases
- All MCP tool calls fail → report CRITICAL-source-unavailable for this cycle (mcp-server likely down) → EXIT after BUG alert. Do not attempt file-only degraded mode — signal_queue write requires the gateway.
- `docs/data/orch/orch-state.json` unreadable → skip OH-1/OH-2 checks depending on it, mark `TOOL-UNAVAILABLE`, continue with remaining checks.

## RETURN

```
DONE: orch-sentinel cycle complete mode-MODE — N findings (H high, M med, L low, I info) | K dedup-skipped
NEXT: po (via signal_queue) | idle (if clean)
PIPELINE: complete
QUALITY: full | partial (if any source marked TOOL-UNAVAILABLE)
[OUTPUT-CONTRACT] signal_queue_rows_written=N | dedup_skipped=K | scorecard_regenerated=true|false | notebook_written=true|false
```
The `[OUTPUT-CONTRACT]` line is MANDATORY — full contract defined in `emit-scorecard.md`.
