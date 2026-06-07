# Agent Chaining Protocol

<!-- size-justification: 221L — architect-managed SSOT: pipeline maps + return templates + parallel spawn rules + cross-team signal directory + DJ-GATE-1 journal gate are read as one unit by every chaining-related agent (PM, architect, dev-team). Excluded from split waves per zone-enforcement-and-split-policy brief § Excluded. -->

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
6. **Pipeline-state write is mandatory for dev-team pipeline agents**: Dev-team agents (developer, qa, fixer, pm, architect, ba, po) MUST write `docs/data/orch/orch-state.json` `.head` section before returning control to main terminal. Use atomic temp-file-then-rename write (see `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3`). Read the full file, modify only the `.head` section, write atomically — never overwrite sibling sections.
   - If handing off to next agent: set `.head.status: "in_progress"`, populate `.head.next_agent`, `.head.next_action` (≤20-word spawn prompt suffix), `.head.active_task_id`, `.head.updated_at` (ISO8601 now), `.head.updated_by` (your agent id).
   - If sprint/pipeline is complete (PM or QA, no next agent): set `.head.status: "idle"`, `.head.next_agent: null`, `.head.next_action: null`.
   - The write is non-optional. An agent that returns without writing this file breaks post-compact resume for the entire session.
   - **Stale-state recovery**: if `.head.updated_at` is >24h old AND `.head.status` is `"in_progress"`, main terminal treats the state as crashed and resets to `idle`. Agents must write accurate timestamps.
   - **Cowork agents** (tran-ngoc-bau, unified-agent, alert-commander, news-scout, market-watcher, financial-analyst, report-analyzer, digest-predict, qa-responder) must NOT write `orch-state.json`. Use `docs/signals/` instead to request dev-team action.

## Journal-before-DONE Gate (DJ-GATE-1 — operator directive 2026-06-07)

**Every task-board task MUST have a decision-journal entry stamped with its task-id before any agent flips status to REVIEW or DONE.**

Canonical skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry.

**Worker mandate (execute-tier spawn injection):** Every dev-* / ops / zone agent spawned by `execute-tier.md` receives this in its prompt:
> Before returning, run skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: <TASK_ID>] — DONE/REVIEW flip is INVALID without it.

**DONE-flip gate (pm + qa enforcement):**
```bash
# Run before flipping any task_board row to DONE (pm step 5, qa approved):
SPRINT_ID=$(jq -r '.sprint_goal.entries[]|select(.status=="active")|.sprint_id' \
  docs/data/orch/orch-state.json 2>/dev/null | tail -1)
PATTERN="docs/agent-memory/decisions/sprint-${SPRINT_ID}-*.md"
if ! grep -rl "task-id:\*\* ${TASK_ID}" $PATTERN 2>/dev/null | grep -q .; then
  # journal absent → stay REVIEW, add status_note, alert work channel
  status_note="journal-missing"   # write to task_board row
  send_telegram(channel="work", message="[DJ-GATE-1] journal absent for ${TASK_ID} — flipped to REVIEW, not DONE")
fi
```
If absent: status stays REVIEW, `status_note: "journal-missing"` written to task_board row.

**Scope exclusions:** cowork/ambient agents (tran-ngoc-bau, unified-agent, market-watcher, chef, news-scout, digest-predict, qa-responder, alert-commander, financial-analyst, report-analyzer, fb-market-poster, idea-forge, semble-search, all cron-cowork agents) are NOT subject to DJ-GATE-1 — they do not hold task_board rows.

## Background Spawn Mandate (BGFAN-1 — operator directive 2026-06-07)

**ALL Agent spawns from dispatcher flows MUST set `run_in_background: true`.**

Dispatcher flows: `docs/agents/dev-team/flow/main.md`, `drain-signals.md`, `drain-esc-dispatch.md`,
`execute-tier.md`, `docs/agents/cowork-team/flow/main.md`, `spawn-fanout.md`,
`.claude/skills/cron-cowork-team/SKILL.md`, and any future dispatcher flow.

**Background ≠ parallel.** The distinction:
- Independent tasks → background-spawn ALL concurrently in one message block (true parallel fan-out).
- Gated tasks (dev-team po→ba→architect→pm→dev→qa chain) → background-spawn each stage, then WAIT for its
  task notification before spawning the next gate. The dispatcher serializes on completion, not on the call.
- Cowork agents are independent of each other → genuinely parallel background fan-out is desired.

**Commit-mutex serialization is preserved.** Parallel background workers still serialize commits via
`task_claim(task_kind:"commit-mutex")` — background spawn does not relax the concurrent-commit-race protection
(concurrent workers share ONE git index). Claim the mutex before `git add/commit`; release in finally.

```
# Correct pattern — every Agent call in a dispatcher flow:
Agent(<agent-id>, prompt=..., run_in_background=true)

# After spawning gated chain members — wait for notification before next gate:
# (dispatcher blocks on task notification / TaskOutput, not on the spawn call)
```

Each spawn instruction in the 6 dispatcher files carries the inline marker `(background)` at the point of use.

## Parallel Spawn Rule

```
Independent tasks (different files, no deps) → spawn ALL in one message:
  Agent(developer, task A, run_in_background=true) + Agent(developer, task B, run_in_background=true)

Dependent tasks → spawn sequentially (wait for completion notification, then spawn next):
  Agent(developer, task A, run_in_background=true) → await notification → Agent(developer, task B, run_in_background=true)

Same pipeline stage, no conflict → always parallel:
  Agent(qa, task A, run_in_background=true) + Agent(qa, task B, run_in_background=true)
  Agent(fixer, task A, run_in_background=true) + Agent(fixer, task B, run_in_background=true)
```

## Parallel Isolation

Parallel developer spawns MUST use the SDK-native `isolation: "worktree"` parameter on each Agent tool call. This gives each agent its own git worktree (isolated HEAD, branch, and working directory) — preventing the shared-HEAD race that caused c37.

**When to use `isolation: "worktree"`:**
- Tasks with disjoint file scopes (no file appears in both agents' write sets)
- Different service zones (e.g. `apps/stock-price/` + `apps/alert-engine/`)

**When NOT to use (force sequential instead):**
- Overlapping file scopes — any file written by both agents
- Tasks that write shared SSOT files: `docs/data/orch/orch-state.json`, `docs/data/project-stats.json`, any agent `.md` file

**Invariant preserved:** Main terminal remains the only spawner — sub-agents cannot spawn each other. Worktree isolation does not change this constraint.

**Sequential mandate:** Sequential dispatch remains MANDATORY until c44 verification (Phase 3 of the roadmap). After c44+c45 pass, Phase 4 relaxes this mandate.

Source: `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md`

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
PIPELINE_STATE_WRITE: Write docs/data/orch/orch-state.json .head NOW before this response ends (atomic temp→rename per §2.3).
  - If PIPELINE=continue: .head.status="in_progress", .head.next_agent=<name>, .head.next_action=<≤20-word suffix>, .head.active_task_id=<NNN>, .head.updated_at=<ISO8601>, .head.updated_by=<your-agent-id>
  - If PIPELINE=complete: .head.status="idle", .head.next_agent=null, .head.next_action=null, .head.active_task_id=<NNN>, .head.updated_at=<ISO8601>, .head.updated_by=<your-agent-id>
  - Read full orch-state.json → modify only .head → write atomically. Never overwrite .task_board / .signal_queue / .narrative siblings.
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

This applies to ALL file writes: session logs, handoffs, docs/data/orch/orch-state.json, task reports, notebooks, etc.

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
- Dedup: `SELECT 1 FROM signals_processed WHERE fingerprint = ? LIMIT 1` in `docs/signals/signals.db` (O(log N)); replaces old O(N) `processed/` dir scan. Dual-record write on new signal: DB INSERT (SSOT index) + filesystem move to `docs/signals/processed/` (human audit copy). Spec: `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md`
- DB unavailable (ENOENT/locked after 3×200ms retry): log WARN, skip dedup, preserve inbox, retry next cycle
- Processed files auto-pruned after 7 days (DB DELETE + parallel filesystem prune)
- `docs/data/orch/orch-state.json` `.head` section is dev-team internal only — cowork agents must NOT write it

**Who can drop signals:** any agent that needs dev-team action (TNB audit findings, ops escalations, cowork bug reports).

---

## Main Terminal Spawn Template

When spawning next agent, use return block to build the prompt:
```
Task [NNN]. Handoff: docs/handoffs/TASK_NNN.md. [Previous agent DONE sentence]. [NEXT sentence — what you must do now.]
```
