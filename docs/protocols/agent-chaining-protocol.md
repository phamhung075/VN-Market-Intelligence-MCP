# Agent Chaining Protocol

**title:** Agent Chaining Protocol
**description:** Main terminal as permanent switch — how agents chain, pipeline maps, return templates, parallel spawn rules, and fixer ceiling.

---

**Main terminal = permanent switch.** Sub-agents cannot spawn each other — Claude Code blocks it. Main terminal stays alive, reads each agent's return value, and spawns the next agent with full context.

## How it works

```
main terminal
  ├─ spawn agent A  ←─ waits for return
  │     A does work, returns: "DONE: [what was done] | NEXT: [what is needed]"
  ├─ reads return → decides next agent from pipeline map
  ├─ spawn agent B with prompt built from A's return
  │     B does work, returns: "DONE: [...] | NEXT: [...]"
  ├─ reads return → spawns agent C ...
  └─ until return is "DONE: pipeline complete" → idle
```

## Pipeline Map

```
FIX      developer ──► qa ◄──► fixer (max 2 rounds)
SPRINT-S architect ──► pm ──► [developer ∥ developer] ──► qa ◄──► fixer
SPRINT-M ba ──► architect ──► pm ──► [developer ∥ developer] ──► qa ◄──► fixer
SPRINT-L same as M + architect post-merge review
UNBLOCK  {route_to} ──► done
```

## Rules

1. **Every agent must end its response with a structured return block** (see template below)
2. **Main terminal reads the return block** to decide next agent + build its prompt
3. **Main terminal never exits** until it receives `PIPELINE: complete` or `PIPELINE: blocked`
4. **Parallel by default**: spawn multiple agents in ONE message whenever tasks have no shared files/deps — Claude Code executes them concurrently
5. **Fixer ceiling**: 2 rounds max → still failing → main terminal spawns `architect`, opens new task
6. **Pipeline-state write is mandatory for dev-team pipeline agents**: Dev-team agents (developer, qa, fixer, pm, architect, ba, po) MUST write `docs/pipeline-state.json` before returning control to main terminal.
   - If handing off to next agent: set `status: "in_progress"`, populate `nextAgent`, `nextPrompt` (full spawn prompt — verbatim), `activeTaskId`, `updatedAt` (ISO8601 now), `updatedBy` (your agent id).
   - If sprint/pipeline is complete (PM or QA, no next agent): set `status: "idle"`, `nextAgent: null`, `nextPrompt: null`.
   - The write is non-optional. An agent that returns without writing this file breaks post-compact resume for the entire session.
   - **Stale-state recovery**: if `updatedAt` is >24h old AND `status` is `"in_progress"`, main terminal treats the state as crashed and resets to `idle`. Agents must write accurate timestamps.
   - **Cowork agents** (tran-ngoc-bau, unified-agent, alert-commander, news-scout, market-watcher, financial-analyst, report-analyzer, digest-predict, qa-responder) must NOT write `pipeline-state.json`. Use `docs/signals/` instead to request dev-team action.

## Parallel Spawn Rule

```
Independent tasks (different files, no deps) → spawn ALL in one message:
  Agent(developer, task A) + Agent(developer, task B)  ← runs concurrently

Dependent tasks → spawn sequentially:
  Agent(developer, task A) → read return → Agent(developer, task B)

Same pipeline stage, no conflict → always parallel:
  Agent(qa, task A) + Agent(qa, task B)  ← fine
  Agent(fixer, task A) + Agent(fixer, task B)  ← fine
```

## Agent Return Template

Every agent ends with:
```
## RETURN
DONE: [one sentence: what was completed]
NEXT: [agent name] | [one sentence: what it must do]
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
```

**Dev-team agents only** — append this block:
```
PIPELINE_STATE_WRITE: Write docs/pipeline-state.json NOW before this response ends.
  - If PIPELINE=continue: status="in_progress", nextAgent=<name>, nextPrompt=<full spawn prompt>, activeTaskId=<NNN>, updatedAt=<ISO8601>, updatedBy=<your-agent-id>
  - If PIPELINE=complete: status="idle", nextAgent=null, nextPrompt=null, activeTaskId=<NNN>, updatedAt=<ISO8601>, updatedBy=<your-agent-id>
```

**Cowork agents only** — append this block if requesting dev-team action:
```
SIGNAL_DROP: Write docs/signals/{agent-id}-{ISO-timestamp}.json
  { "from": "{agent-id}", "to": "po", "type": "{audit-handoff|bug-escalation}", "payload": "{handoff file path or one-line desc}", "priority": "{high|normal}", "createdAt": "{ISO}" }
```

## Absolute Path Rule (MANDATORY)

**All file writes must use absolute paths anchored to the project root.**

Never construct paths relative to CWD — agents frequently edit files in subdirectories (`apps/mcp-server/`) which shifts the implicit CWD and causes writes to land in the wrong location (e.g. `apps/mcp-server/docs/` instead of `docs/`).

**Before any file write, resolve the project root:**

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel)
```

Then construct all paths from `$PROJECT_ROOT`:

```
# WRONG — resolves against current CWD
docs/agent-memory/notebooks/developer.md

# CORRECT — absolute path derived from git root
$PROJECT_ROOT/docs/agent-memory/notebooks/developer.md
```

This applies to ALL file writes: session logs, handoffs, pipeline-state.json, task reports, notebooks, TASKS.md, etc.

---

## Cross-Team Signal Directory

Agents outside the dev-team pipeline (cowork agents like tran-ngoc-bau, unified-agent, etc.) communicate with dev-team via **signal files**:

```
docs/signals/{agent}-{ISO-timestamp}.json
```

```json
{
  "from": "agent-id",
  "to": "target-agent",
  "type": "audit-handoff|bug-escalation|feature-request",
  "payload": "path/to/handoff/file.md or inline text",
  "priority": "high|normal",
  "createdAt": "ISO timestamp"
}
```

**Rules:**
- One file per signal — no overwrite risk, no concurrent corruption
- Dev-team drains all signals at Step 0a (FIFO by `createdAt`)
- Processed signals move to `docs/signals/processed/` with `processedAt`, `processedBy`, `result` fields appended
- Processed files auto-pruned after 7 days
- `pipeline-state.json` is dev-team internal only — cowork agents must NOT write it

**Who can drop signals:** any agent that needs dev-team action (TNB audit findings, ops escalations, cowork bug reports).

---

## Main Terminal Spawn Template

When spawning next agent, use return block to build the prompt:
```
Task [NNN]. Handoff: docs/handoffs/TASK_NNN.md. [Previous agent DONE sentence]. [NEXT sentence — what you must do now.]
```
