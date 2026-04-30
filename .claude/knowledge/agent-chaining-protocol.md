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

## Main Terminal Spawn Template

When spawning next agent, use return block to build the prompt:
```
Task [NNN]. Handoff: docs/handoffs/TASK_NNN.md. [Previous agent DONE sentence]. [NEXT sentence — what you must do now.]
```
