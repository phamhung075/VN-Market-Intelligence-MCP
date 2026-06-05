# EMIT-DARK-RECURRING — Root Cause Brief (v2 — DEFINITIVE)

**Date v1:** 2026-06-05T16:37Z  
**Date v2 (supersedes v1):** 2026-06-05T18:09Z  
**Author:** agents-architect  
**Escalation reason:** Option B (d6738df3) live-falsified by 18:01:29Z FIRE evidence  
**Scope:** Corrected root cause + definitive fix recommendation

---

## 1. Evidence Summary (cumulative)

**Still dark after d6738df3 (Option B):** `docs/data/pressure-state.json` ABSENT.
`docs/data/cycle-snapshot-latest.json` ABSENT.

**Post-d6738df3 FIRE at 18:01:29Z confirms three facts:**

1. The cowork dispatcher fires from disk-fresh flow files (cron prompt re-reads main.md every tick — confirmed in v1). The 18:01Z tick was after d6738df3 landed at ~17:26Z.

2. The cowork-team signal file `cowork-team-2026-06-05T18:01:29Z.json` WAS written with correct resolved values (`"matched_slots": ["bctc-analyst-slot-2"]`, `"won_slots": ["bctc-analyst-slot-2"]`, `"spawned": [...]`).

3. `pressure-state.json` is STILL absent, despite the Option B design placing its `cat > ...pressure-state.json.tmp <<PS_EOF` heredoc BEFORE the signal write within the same fenced bash block (lines 9–101 of telemetry.md), with no intervening guard that could conditionally skip pressure-state while continuing to the signal.

**Smoking gun — template placeholders resolved in signal output:**

The live signal at `docs/signals/cowork-team-2026-06-05T18:01:29Z.json` contains:
```json
"matched_slots": ["bctc-analyst-slot-2"]
```

The telemetry.md template literally reads:
```
"matched_slots": [<slot_ids from MATCHES>]
```

That is a PROSE PLACEHOLDER — not a shell variable, not a bash-expandable expression. If the `cat > ... <<EOF` heredoc had been executed by a real bash interpreter, the output would contain the literal string `[<slot_ids from MATCHES>]`. Instead it contains the interpreted semantic value.

CONCLUSION: the cowork dispatcher never ran bash at all. It read the heredoc template, substituted values from its in-context knowledge (LLM narration), and produced the signal JSON via its own Write tool call. The pressure-state heredoc was silently skipped because its inputs require real shell computation (see §3 below).

---

## 2. Corrected Root Cause (DEFINITIVE)

**The cowork dispatcher is a pure NARRATION engine. It does not execute fenced bash.**

The LLM agent reads the flow prose, fills template placeholders from in-context knowledge, and produces outputs via its own tool calls: Write (for the signal file), Agent (for spawns), call_tool (for MCP tools). It interprets the telemetry.md `cat > ... <<EOF` heredoc as a template for what to write, selects the recognized deliverable of Step 6 (the cowork-team signal file — git-committed, uniquely named, the dispatcher's "proof of work"), and writes it via Write tool with LLM-resolved field values.

**Why the signal file is written but pressure-state is not:**

| Deliverable | Why LLM writes it | Why LLM skips it |
|---|---|---|
| `cowork-team-${ISO}.json` | Flow-context values only; `matched_slots`, `won_slots`, `pressure_mode` are all in-context from prior steps. The LLM treats this as the primary observable deliverable. | — |
| `pressure-state.json` | — | Requires COMPUTED values the LLM cannot produce without real shell: `signal_backlog=$(ls docs/signals/*.json \| grep -v cowork-team \| wc -l)`, `dev_queue_depth=$(jq ... orch-state.json)`, `host_headroom_mb` from `vm_stat` + integer arithmetic. The LLM recognises these as shell-only computations and skips the block. |

**Why Option B could never work:** "Make the bash unconditional" only constrains how a bash interpreter executes. When no bash interpreter runs at all, the constraint is moot. Option B's premise ("telemetry Step 6 demonstrably executes because its cowork-team signal is git-committed every tick") confused the LLM's Write-tool narration of the signal with actual bash execution of the fence. The smoking-gun placeholder evidence proves they are different execution paths.

This is the THIRD failed code fix of the same class: 545aae11 (re-org bash fences), 29d7e944 (pre-step isolation), d6738df3 (unconditional anchor in telemetry). All three assumed bash runs. None does.

---

## 3. Option Evaluation

### Option C — MCP tool `emit_pressure_state` (RECOMMENDED)

Add a single tool to the vn-market MCP server that:
- Accepts flow-context fields from the dispatcher (those it already holds in-context)
- Computes server-side the shell-only fields (`signal_backlog`, `dev_queue_depth`, `host_headroom_mb`)
- Writes `docs/data/pressure-state.json` (atomic tmp-rename) and promotes `cycle-snapshot-latest.json`
- Returns a structured result confirming write success

Replace the bash heredoc in telemetry.md with a single `call_tool` instruction. The LLM dispatcher DEMONSTRABLY executes `call_tool` (it calls `is_trading_day`, `task_claim`, `get_cycle_bootstrap` every tick — these are proven execution paths). This is not a narration-vs-execution ambiguity: `call_tool` is a REAL tool invocation, not a prose step.

**Rationale for Option C over alternatives:**

- Reliable: `call_tool` is mechanically executed, not narrated. The LLM dispatcher provably uses it.
- Minimal flow change: one `call_tool` instruction replaces ~90 lines of bash in telemetry.md.
- No CronCreate change, no shell script, no new agent.
- Server-side computation is correct locus for `vm_stat`/`jq` ops; they are infra queries, not agent logic.
- The tool can be idempotent (safe to call multiple times per tick) and fail-safe (never throws into the dispatcher on error — logs internally and returns `{success: false, reason: "..."}`).

**Cost:** One MCP tool addition (dev-mcp-server work). Medium-complexity, bounded scope (30–60 LOC Go/TS depending on server language). No schema migration — pressure-state.json shape is unchanged.

---

### Option D — Spawn a tiny emit sub-agent

Spawns a Bash-capable sub-agent whose sole job is to run the computation + write pressure-state.json. Spawns DEMONSTRABLY happen (Option B's signal was written; sub-agents are spawned from the same dispatcher).

**Verdict: NOT RECOMMENDED.**

Cost: one 15-min-tick agent spawn for a file write. That is ~$0.01–0.03/tick x 96 ticks/day = unnecessary overhead for what should be an atomic side-effect. Also: the sub-agent would run the bash block in its own context, which is correct (it has real bash), but adds latency (~30–60s sub-agent spin-up) to every tick. Disproportionate to the problem.

---

### Option E — Retire the adaptive cadence machinery

Honest assessment of cost/benefit:

**Against retirement:**
- The cadence-policy.json and pressure-read.md machinery are fully implemented and code-correct.
- The feature goal (suppress gatherer slots on weekends/holidays, throttle during low-backlog off-market periods) is operationally valuable: it prevents redundant spawns during dead windows.
- The feature has never produced incorrect FIRES (only ever falls back to legacy cron when pressure-state is absent — AC-P1-6-1 is working correctly).
- Fix via Option C is bounded and one-shot. Retirement would require removing ~5 flow files, cadence-policy.json, pressure-read.md, pressure-cadence.md, pressure-emit.md, tick-snapshot.md — higher edit surface than adding one tool.

**For retirement:**
- Legacy fixed-cadence has run for 2.5+ days with zero harm.
- The feature has NEVER operated in adaptive mode since initial deploy (pressure-state was dark from day 1).
- Three engineers have failed to fix the same class of bug.

**Verdict: NOT RECOMMENDED, but only marginally.** The option is legitimate IF the team decides the feature is not worth the maintenance burden. However Option C's fix is simpler than retirement (1 tool + 1 telemetry.md edit vs. 5+ file deletes + schedule regression testing), so Option E should only be chosen if Option C fails. Record this as an explicit contingency.

---

## 4. Definitive Recommendation: Option C

### Tool Contract — `emit_pressure_state`

**Server:** vn-market (MCP)

**Tool name:** `emit_pressure_state`

**Arguments (all optional — server computes what it can; dispatcher fills what it knows):**

```json
{
  "calendar_status": "open | weekend | holiday | half_day | unknown",
  "tick_id": "2026-06-05T18:00:00Z",
  "fire_time": "2026-06-05T18:01:29Z",
  "pressure_mode": "adaptive | legacy",
  "last_regime": "bull | bear | sideways | unknown",
  "last_volatility_level": "high | low | medium | unknown"
}
```

All fields optional. Server fills defaults ("unknown") for absent fields.

**Server-computed fields (shell-only — why this tool exists):**

| Field | Computation |
|---|---|
| `signal_backlog` | `ls docs/signals/*.json \| grep -v /cowork-team- \| wc -l` (relative to repo root, adjusted for server's CWD) |
| `dev_queue_depth` | `jq '[.task_board.active_sprints[].tasks[] \| select(.status=="IN_PROGRESS" or .status=="TODO")] \| length' docs/data/orch/orch-state.json` |
| `host_headroom_mb` | `vm_stat` (macOS) or `free -m` (Linux) free-pages calc; `null` if unavailable |
| `emitted_at` | server UTC timestamp at time of write |

**Output written:** `docs/data/pressure-state.json` (atomic tmp-rename: `.tmp` → final).

**Cycle-snapshot promotion:** If `docs/data/cycle-snapshot-HH:MM.json` (keyed by `tick_id` HH:MM) exists, promote it to `docs/data/cycle-snapshot-latest.json` (atomic cp + rename).

**Return value:**

```json
{
  "success": true,
  "emitted_at": "2026-06-05T18:01:31Z",
  "pressure_state_path": "docs/data/pressure-state.json",
  "cycle_snapshot_promoted": true | false
}
```

On any internal error:
```json
{
  "success": false,
  "reason": "<one-line error description>",
  "partial": { "fields_written": ["..."] }
}
```

**Fail-safe invariant:** the tool NEVER throws/panics into the dispatcher. It catches all errors internally, logs to server stderr, and returns `{success: false, reason: "..."}`. The dispatcher continues regardless of return value — consistent with the existing `fail_loud: false` semantics.

**Idempotency:** Multiple calls per tick are safe. The file write is atomic; concurrent writes will produce one winner with no corruption.

---

### telemetry.md Change (1-line replacement)

Replace the entire bash fence (lines 9–101 of telemetry.md) with:

```
call_tool(server="vn-market", tool="emit_pressure_state", arguments={
  "calendar_status": "<CALENDAR_STATUS from Step 4.3>",
  "tick_id": "<TICK_ID>",
  "fire_time": "<ISO>",
  "pressure_mode": "<adaptive|legacy>",
  "last_regime": "<LAST_REG or unknown>",
  "last_volatility_level": "<LAST_VOL or unknown>"
})
```

The signal file write (the conditional `cat > docs/signals/cowork-team-${ISO}.json`) remains — it is correctly produced by LLM narration and should stay as-is (the placeholder-resolution is working correctly for this deliverable).

---

## 5. Definition of Done

The fix is LIVE-VERIFIED when all three are true on the NEXT cowork FIRE after deployment:

1. `docs/data/pressure-state.json` EXISTS with `emitted_at` timestamp ≤ 2 minutes before the fire signal's `createdAt`.
2. `pressure_mode` in the cowork-team signal shows `"adaptive"` (not `"legacy"`), proving pressure-read.md Step 4.2 found a fresh pressure-state.json.
3. `docs/data/cycle-snapshot-latest.json` EXISTS (promoted by the tool if a per-HH:MM snapshot was available).

These are all externally observable without access to tool logs.

---

## 6. Files to Change

### dev-mcp-server (developer agent)

1. **New tool:** `emit_pressure_state` in the vn-market MCP server codebase (exact path depends on server language — likely `apps/mcp-server/src/tools/` or equivalent). Tool must be registered in the server's tool registry.

### agent-father

2. `docs/agents/cowork-team/flow/telemetry.md` — replace bash fence (pressure-state block, lines 9–55) with `call_tool(emit_pressure_state, ...)` instruction. Retain the conditional signal-file write block unchanged.

3. `docs/agents/cowork-team/flow/main.md` — update Step 4.8 description from "no-op stub — moved to Step 6" to a pointer note clarifying that Step 6 uses `call_tool emit_pressure_state` (documentation only, no logic change).

---

## 7. Sequencing

1. dev-mcp-server builds + deploys `emit_pressure_state` tool (can be done without touching flow files)
2. agent-father edits telemetry.md + main.md after tool is live (otherwise the call_tool hits a 404)
3. Next cowork FIRE after both steps → DoD check (§5 above)

---

## 8. Option E Contingency

If Option C fails (tool not buildable, server not accessible, or MCP gateway routing broken for this tool): retire the adaptive cadence by removing `pressure-read.md`, `pressure-cadence.md`, `pressure-emit.md`, `tick-snapshot.md` from main.md's dispatch table, deleting the four sub-flow files, and reverting main.md Steps 4.2–4.5b to the legacy `CADENCE_MATCHES = MATCHES` single-line. cadence-policy.json and pressure-state.json files can stay on disk without effect. This is a clean fallback with no behavioral regression (legacy has been running correctly for 2.5 days).

---

## 9. Verdict Table (updated)

| Hypothesis | Status |
|---|---|
| H1: stale session | RULED OUT (v1) |
| H3: early-exit before 4.7/4.8 | RULED OUT (v1) |
| H2: agent-interpreted steps silently skipped | CONFIRMED (v1) |
| Option B premise ("telemetry runs because signal is committed") | FALSIFIED (v2) — LLM narrates the signal without running bash |
| Corrected root cause: LLM is a pure narration engine; bash never runs | CONFIRMED (v2) |

**Action required:** dev-mcp-server adds `emit_pressure_state` tool. agent-father edits telemetry.md. No operator action.

---

**Signals:**
- `docs/signals/emit-dark-option-c-20260605T180900Z.json` → dev-mcp-server (tool build)
- `docs/signals/emit-dark-telemetry-patch-20260605T180900Z.json` → agent-father (flow edit, gated on tool deploy)
