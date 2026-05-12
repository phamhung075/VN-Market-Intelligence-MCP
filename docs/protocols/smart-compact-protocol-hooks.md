> Parent: [./smart-compact-protocol.md](./smart-compact-protocol.md)

# Smart Compact Protocol — Hook Mechanics

How hooks fire, when auto-compact triggers, and sub-agent behavior.

## Auto-Compact Mechanism (iTerm2 Only)

When context exceeds 50%:

1. `calibrate-ctx-overhead.sh` saved the iTerm2 unique session ID at session start via osascript
2. `stop-context-advisor.sh` uses that saved ID to target the **exact iTerm2 tab** (not frontmost)
3. osascript types `/compact` into that tab automatically

**osascript** = macOS tool to run AppleScript, which controls Mac apps that expose an AppleScript API.

### Supported Terminals

- iTerm2 ✓ (has full AppleScript dictionary — can target specific tab by unique ID)
- Terminal.app ✓ (partial — opens new tab instead of existing session)
- Zed IDE terminal ✗ (no AppleScript API — Electron app)
- VS Code integrated terminal ✗ (no AppleScript API — Electron app)

**If running in Zed/VS Code:** Auto-compact does not fire. The `decision: block` warning still injects into agent context — agents must offload manually via MCP tools.

---

## Where `/compact` Actually Runs

`/compact` runs on the **main terminal only** — never inside a sub-agent.

### Why Sub-Agents Cannot Compact

- Sub-agents are spawned via the `Agent` tool and run as sub-processes of the main session
- They have no iTerm2 session ID of their own — `calibrate-ctx-overhead.sh` captures the **main terminal's** tab ID at session start
- `stop-context-advisor.sh` targets that saved ID → auto-types `/compact` into the main terminal tab
- `/compact` is a Claude Code CLI command scoped to the current REPL session — sub-agents have no REPL

### Sub-Agent Hook Behavior

What happens when a sub-agent hits the hook:

1. Hook injects `decision: block` warning into the sub-agent's context
2. Sub-agent MUST offload state (`log_agent_work` + notebook) then return to main terminal
3. Main terminal receives the return, then gets `/compact` auto-typed (or user types it)
4. After compact, main terminal resumes the flow via the Resume Protocol

Sub-agents offload → return → main terminal compacts → main terminal resumes.

---

## What Agents CANNOT Do

- Run `/compact` — user CLI command only, not callable by agents
- Ignore the hook message — it is a hard blocker (`decision: block`)
- Compact mid-tier when parallel developer agents are still running — finish the tier first

---

## "Stop hook error" Label

Normal. Claude Code labels any `decision: block` hook output as "error" in the UI — this is just UI terminology, not an actual failure. The hook is working correctly when you see this.

---

## Hook Scripts (global — apply to all projects)

| File | Hook type |
|---|---|
| `~/.claude/hooks/calibrate-ctx-overhead.sh` | UserPromptSubmit |
| `~/.claude/hooks/post-task-compact-advisor.sh` | PostToolUse:TaskUpdate |
| `~/.claude/hooks/stop-context-advisor.sh` | Stop |

All registered in `~/.claude/settings.json` — active for every session (terminal + agents).

---

## Delta Throttle Behavior

- Below HIGH threshold: hook fires only if tokens grew by ≥ `CTX_ADVISOR_DELTA_PCT` since last fire
- Above HIGH threshold (>50%): delta check bypassed — hook fires every response until compacted
