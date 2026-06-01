# Agent Spawn Template

<!-- size-justification: 122L — operational quick-reference for all spawn scenarios: sequential chains, parallel tiers, conditional branching, RETURN block schema. All scenarios kept together for at-a-glance lookup during dispatch; splitting by scenario type would require cross-reference jumps defeating the template purpose. -->

Operational reference for the main terminal. Defines how to build spawn prompts from agent RETURN blocks and when to run agents in parallel vs sequentially.

Source: CLAUDE.md "Agent Chaining Protocol" section (canonical prose lives there; this file is the SSOT for quick agent lookup).

---

## Main Terminal Spawn Template

When the main terminal reads a RETURN block and decides to spawn the next agent, it builds the prompt using this format:

```
Task [NNN]. Handoff: docs/handoffs/TASK_NNN.md. [Previous agent DONE sentence]. [NEXT sentence — what the next agent must do now.]
```

Fields:
- `Task [NNN]` — sprint/task identifier matching the handoff file
- `Handoff: docs/handoffs/TASK_NNN.md` — path the receiving agent must read first
- `[Previous agent DONE sentence]` — copied verbatim from the RETURN block `DONE:` line
- `[NEXT sentence]` — copied verbatim from the RETURN block `NEXT:` line (strip the agent name prefix)

---

## Agent Return Template

Every agent ends its response with this block (required):

```
## RETURN
DONE: [one sentence: what was completed]
NEXT: [agent name] | [one sentence: what it must do]
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
```

---

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

Decision rule: if task A writes a file that task B reads, they are dependent — sequential. If they touch different files with no shared state, they are independent — parallel.

---

## Worked Examples

### Example 1 — Sequential spawn (architect to pm)

Agent return block received from architect:

```
## RETURN
DONE: Architect completed design for Sprint 1409 with 6 tasks across 2 tiers.
NEXT: pm | Create handoff files for all 6 tasks and update docs/data/orch/orch-state.json .task_board.
HANDOFF: docs/handoffs/TASK_1409-arch.md
PIPELINE: continue
```

Main terminal builds the pm spawn prompt:

```
Task 1409. Handoff: docs/handoffs/TASK_1409-arch.md. Architect completed design for Sprint 1409 with 6 tasks across 2 tiers. Create handoff files for all 6 tasks and update docs/data/orch/orch-state.json .task_board.
```

Why sequential: pm must read the architect handoff before it can create the 6 task files. The handoff does not exist until architect finishes.

---

### Example 2 — Parallel spawn (Tier 1 tasks with no shared files)

PM has created handoffs for tasks 1409b, 1409c, 1409d, 1409e. None share files or dependencies.

Main terminal spawns all four in a single message:

```
Agent(claude-manager-helper, 1409b) + Agent(claude-manager-helper, 1409c) + Agent(developer, 1409d) + Agent(claude-manager-helper, 1409e)
```

Each receives its own prompt built from the pm RETURN block:

- 1409b: "Task 1409b. Handoff: docs/handoffs/TASK_1409b.md. PM created Sprint 1409 handoffs. Execute audit task 1409b per handoff."
- 1409c: "Task 1409c. Handoff: docs/handoffs/TASK_1409c.md. PM created Sprint 1409 handoffs. Execute audit task 1409c per handoff."
- 1409d: "Task 1409d. Handoff: docs/handoffs/TASK_1409d.md. PM created Sprint 1409 handoffs. Execute audit task 1409d per handoff."
- 1409e: "Task 1409e. Handoff: docs/handoffs/TASK_1409e.md. PM created Sprint 1409 handoffs. Execute audit task 1409e per handoff."

Why parallel: each task writes to a different file (different knowledge files, different targets). Claude Code executes them concurrently.

---

## Notes

- Always source the previous agent's DONE sentence verbatim from its RETURN block.
- The NEXT sentence is the NEXT line of the previous RETURN block, re-addressed to the new agent.
- Include the handoff file path so the receiving agent has full context without re-reading `docs/data/orch/orch-state.json`.
- **Before creating any file**: check `docs/policies/docs-organization.md` for canonical location.
  Wrong location = duplication debt. When in doubt: `reports/` for task reports, `docs/handoffs/` for handoffs, never at project root.

---

## Pipeline Map Reference

```
FIX      developer ──► qa ◄──► fixer (max 2 rounds)
SPRINT-S architect ──► pm ──► [developer ∥ developer] ──► qa ◄──► fixer
SPRINT-M ba ──► architect ──► pm ──► [developer ∥ developer] ──► qa ◄──► fixer
SPRINT-L same as M + architect post-merge review
UNBLOCK  {route_to} ──► done
```

Fixer ceiling: 2 rounds max. Still failing after 2 → main terminal spawns `architect`, opens new task.
