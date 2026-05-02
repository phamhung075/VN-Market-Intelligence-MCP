# Smart Compact Protocol

Context management system. Hooks fire automatically — agents must respond correctly.

## How Token Count Works

- Token count is read **directly from JSONL session files** (exact API usage data)
- Fields summed: `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
- This matches exactly what Claude Code status bar shows
- No estimation — 100% accurate

## Hook Overview

| Hook | Event | Threshold | What Happens |
|---|---|---|---|
| `UserPromptSubmit` | Every user message | always | Calibrate iTerm2 session ID + overhead tokens (once per session) |
| `PostToolUse:TaskUpdate` | Task marked `completed` | ctx > 20% | Inject offload instructions only — no auto-compact (unsafe mid-sprint) |
| `Stop` | Every response end | ctx > 30% | Inject soft warning into session |
| `Stop` | Every response end | ctx > 40% | Inject urgent instructions + auto-type `/compact` in iTerm2 |

## Auto-Compact Mechanism (iTerm2 Only)

When context exceeds 50%:

1. `calibrate-ctx-overhead.sh` saved the iTerm2 unique session ID at session start via osascript
2. `stop-context-advisor.sh` uses that saved ID to target the **exact iTerm2 tab** (not frontmost)
3. osascript types `/compact` into that tab automatically

**osascript** = macOS tool to run AppleScript, which controls Mac apps that expose an AppleScript API.

**Supported terminals for auto-compact:**
- iTerm2 ✓ (has full AppleScript dictionary — can target specific tab by unique ID)
- Terminal.app ✓ (partial — opens new tab instead of existing session)
- Zed IDE terminal ✗ (no AppleScript API — Electron app)
- VS Code integrated terminal ✗ (no AppleScript API — Electron app)

**If running in Zed/VS Code:** Auto-compact does not fire. The `decision: block` warning still injects into agent context — agents must offload manually via MCP tools.

## When Hook Fires — Agent MUST

1. Call `log_agent_work` or `append_session_record` to offload current state to MCP
2. Write current working state to own notebook: `docs/agent-memory/notebooks/<agent-id>.md`
3. Stop re-reading files already processed this session
4. Stop inlining large data — store via MCP tool, reference by key only

## What Agents CANNOT Do

- Run `/compact` — user CLI command only, not callable by agents
- Ignore the hook message — it is a hard blocker (`decision: block`)
- Compact mid-tier when parallel developer agents are still running — finish the tier first

## Where `/compact` Actually Runs

`/compact` runs on the **main terminal only** — never inside a sub-agent.

**Why sub-agents cannot compact:**
- Sub-agents are spawned via the `Agent` tool and run as sub-processes of the main session
- They have no iTerm2 session ID of their own — `calibrate-ctx-overhead.sh` captures the **main terminal's** tab ID at session start
- `stop-context-advisor.sh` targets that saved ID → auto-types `/compact` into the main terminal tab
- `/compact` is a Claude Code CLI command scoped to the current REPL session — sub-agents have no REPL

**What happens when a sub-agent hits the hook:**
1. Hook injects `decision: block` warning into the sub-agent's context
2. Sub-agent MUST offload state (`log_agent_work` + notebook) then return to main terminal
3. Main terminal receives the return, then gets `/compact` auto-typed (or user types it)
4. After compact, main terminal resumes the flow via the Resume Protocol above

Sub-agents offload → return → main terminal compacts → main terminal resumes.

---

## Dev-Team Orchestration: Compaction-Aware Behavior

### Flow State to Preserve at Each Step

When hooks fire during `.claude/flows/dev-team/main.md`, the **main terminal** MUST offload:

| Step | State to preserve | Where |
|---|---|---|
| Step 1 (PO Triage) | BATCH output: type, id, title, desc, size, files, baseline_pass | `log_agent_work` with tag `po-triage` |
| Step 2 (Planning) | architect decisions + pm task list + dep map | `append_session_record` with step label |
| Step 3 (Execution) | Current tier index, completed task IDs, failed task IDs | `log_agent_work` with tag `dev-loop-tier-N` |
| Step 4 (Scan) | Processed report IDs, leftover branches | `append_session_record` |

### Per-Agent Offload Targets

| Agent | State to offload on hook | Target |
|---|---|---|
| `po` | BATCH decisions, idle/active signal | `log_agent_work` → notebook |
| `architect` | Design decisions, ADRs, file targets | `append_session_record` → notebook |
| `pm` | Task list JSON, dep map, WIP count | `log_agent_work` → docs/TASKS.md flush → notebook |
| `developer` | Branch name, changed files, test status | `log_agent_work(branch, files_changed, tests_pass)` → notebook |
| `qa` | Test counts (pass/fail/skip), branch cleanup log | `log_agent_work` → notebook |
| `fixer` | Patch description, file + line targets | `log_agent_work` → notebook |

Notebook path per agent: `docs/agent-memory/notebooks/<agent-id>.md` — read at start, overwrite at end of each session.

### Parallel Spawn Safety

When multiple developers are running in the same tier (parallel Agent calls):

- **Do NOT initiate compaction** while parallel agents are in-flight
- Wait for all agents in the tier to return before offloading state
- If context hits 40% before tier finishes: offload what is already complete; do not abort in-flight agents
- If context hits 60%+: post `send_telegram(work, "Context critical — pausing after current tier")` then compact

### Resume Protocol After `/compact`

After `/compact` fires, the main terminal resumes by:

1. Read notebook: `docs/agent-memory/notebooks/main.md` (main terminal working memory)
2. Call `get_agent_work_log(tag="dev-loop-tier-N")` to find last completed tier
3. Re-read docs/TASKS.md for current task states
4. Skip already-Done tasks — spawn only Pending/In-Progress tasks for the current tier
5. Continue from Step 3 at the correct tier index — do not restart from Step 1

### Context Budget Targets per Step

| Step | Max ctx to spend | Action if exceeded |
|---|---|---|
| Step 1 (PO Triage) | 15% | Offload BATCH and compact before planning |
| Step 2 (Planning) | 20% | Offload plan and compact before execution |
| Step 3 per tier | 25% | Finish tier, offload, compact between tiers |
| Step 4 (Scan) | 5% | Minimal — just tool calls, no inline data |

### Proactive Compact Between Sprints

Auto-compact (50% threshold) is a reactive emergency trigger — it fires too late after large sprints.

**After Step 4 exits cleanly, before re-entering Step 1:**

```
if ctx > 25%:
  1. log_agent_work(tag="sprint-boundary", state=current_sprint_id)
  2. Write main terminal notebook: docs/agent-memory/notebooks/main.md
  3. send_telegram(work, "Sprint boundary — offloaded state, ctx at N%")
  4. Return
```

The agent does NOT need to explicitly trigger compact — `stop-context-advisor.sh` fires automatically on every response end and handles it:
- ctx >40% → osascript types `/compact` into main terminal iTerm2 tab (path check: `SESSION_FILE != */subagents/*`)
- ctx 30-40% → injects `decision: block` warning into next turn
- ctx <30% → hook exits silently — no compact needed

This keeps the main terminal fresh at the start of every sprint rather than accumulating context across multiple sprints until the 50% emergency fires mid-execution.

## "Stop hook error" Label

Normal. Claude Code labels any `decision: block` hook output as "error" in the UI — this is just UI terminology, not an actual failure. The hook is working correctly when you see this.

## Thresholds (configurable in `~/.claude/settings.json` env)

| Var | Default | Meaning |
|---|---|---|
| `CTX_ADVISOR_TASK_COMPACT_PCT` | 20% | Min ctx% to fire on task completion |
| `CTX_ADVISOR_MOD_PCT` | 30% | Soft warning threshold |
| `CTX_ADVISOR_HIGH_PCT` | 40% | Urgent inject + auto-compact threshold |
| `CTX_ADVISOR_DELTA_PCT` | 10% | Min % growth between Stop hook fires (bypassed above HIGH) |
| `CTX_ADVISOR_MAX_TOKENS` | 200000 | Sonnet max context tokens |

## Hook Scripts (global — apply to all projects)

| File | Hook type |
|---|---|
| `~/.claude/hooks/calibrate-ctx-overhead.sh` | UserPromptSubmit |
| `~/.claude/hooks/post-task-compact-advisor.sh` | PostToolUse:TaskUpdate |
| `~/.claude/hooks/stop-context-advisor.sh` | Stop |

All registered in `~/.claude/settings.json` — active for every session (terminal + agents).

## Delta Throttle Behavior

- Below HIGH threshold: hook fires only if tokens grew by ≥ `CTX_ADVISOR_DELTA_PCT` since last fire
- Above HIGH threshold (>50%): delta check bypassed — hook fires every response until compacted
