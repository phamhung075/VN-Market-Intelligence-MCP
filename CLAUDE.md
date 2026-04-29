# VN Market Intelligence MCP

MCP server (TypeScript/Bun) — real-time VN stock intelligence (HOSE/HNX/UPCOM).

---

## Prerequisites — Must Be True Before Any Agent Runs

### 1. User Session Required When PO Has No Tasks

PO cannot self-initiate if TASKS.md is empty AND no Telegram reports exist.
In that case: **ask the user for a session goal** before spawning PO.

```
User provides: goal / priority / context
→ Main terminal passes to PO as session prompt
→ PO uses it to initiate sprint
```

If PO returns `PIPELINE: idle` (nothing to do) → stop, ask user what to work on next.

### 2. BCTC Pipeline Must Be Operational for Financial Analysis

Before any agent analyzes financial data (BCTC quarterly reports), verify:

```
VPS (Vietnam — Vinahost)
  └─ downloads BCTC PDFs from geo-blocked VN sources
       └─ sends to MCP server
            └─ PDF → text extraction (pdf-parse + OCR)
                 └─ text available to agents via get_bctc_full() MCP tool
```

**Check health before spawning financial agents:**
- `ops` → `get_vps_service_health()` — VPS reachable and fetching
- `ops` → `list_stored_pdfs()` — PDFs present for target tickers
- If broken → spawn `ops` to fix VPS pipeline before analysis proceeds

---

## Switch — User Request → Agent

Spawn the matching agent. Never do the work yourself.

| Intent | Spawn |
|--------|-------|
| add / build / improve | `po` |
| bug / broken (infra) | `ops` |
| bug / broken (code) | `developer` |
| analyze stock / news | `market-analyst` |
| brainstorm / explore | `idea-forge` |
| sprint status | `pm` |
| system health / audit | `system-auditor` |
| DRY / hardcoded values | `code-janitor` |
| update cowork agents | `cowork-refactory-expert` |
| organize / cleanup | `claude-manager-helper` |

Agent defines who receives next. Full routing rules → `/dispatch`

---

## Agent Chaining Protocol

**Main terminal = permanent switch.** Sub-agents cannot spawn each other — Claude Code blocks it. Main terminal stays alive, reads each agent's return value, and spawns the next agent with full context.

### How it works

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

### Pipeline Map

```
FIX      developer ──► qa ◄──► fixer (max 2 rounds)
SPRINT-S architect ──► pm ──► [developer ∥ developer] ──► qa ◄──► fixer
SPRINT-M ba ──► architect ──► pm ──► [developer ∥ developer] ──► qa ◄──► fixer
SPRINT-L same as M + architect post-merge review
UNBLOCK  {route_to} ──► done
```

### Rules

1. **Every agent must end its response with a structured return block** (see template below)
2. **Main terminal reads the return block** to decide next agent + build its prompt
3. **Main terminal never exits** until it receives `PIPELINE: complete` or `PIPELINE: blocked`
4. **Parallel by default**: spawn multiple agents in ONE message whenever tasks have no shared files/deps — Claude Code executes them concurrently
5. **Fixer ceiling**: 2 rounds max → still failing → main terminal spawns `architect`, opens new task

### Parallel Spawn Rule

```
Independent tasks (different files, no deps) → spawn ALL in one message:
  Agent(developer, task A) + Agent(developer, task B)  ← runs concurrently

Dependent tasks → spawn sequentially:
  Agent(developer, task A) → read return → Agent(developer, task B)

Same pipeline stage, no conflict → always parallel:
  Agent(qa, task A) + Agent(qa, task B)  ← fine
  Agent(fixer, task A) + Agent(fixer, task B)  ← fine
```

### Agent Return Template

Every agent ends with:
```
## RETURN
DONE: [one sentence: what was completed]
NEXT: [agent name] | [one sentence: what it must do]
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
```

### Main Terminal Spawn Template

When spawning next agent, use return block to build the prompt:
```
Task [NNN]. Handoff: docs/handoffs/TASK_NNN.md. [Previous agent DONE sentence]. [NEXT sentence — what you must do now.]
```

---

## Interdiction — Never Ask the User to Act

**Never ask the user to run commands, restart services, SSH to servers, or perform any technical action.** Always spawn the appropriate agent instead (`ops`, `developer`, `qa`, etc.). The user is configuration admin only — they set goals, they do not execute tasks. If an action requires capabilities beyond available MCP tools, spawn `ops` to exhaust all automated options first and report the precise blocker, not a request for the user to intervene.
