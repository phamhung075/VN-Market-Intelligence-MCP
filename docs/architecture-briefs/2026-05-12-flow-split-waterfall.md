# Flow Split + Waterfall Knowledge Discovery — Design Brief

**Date:** 2026-05-12
**Author:** agents-architect
**Status:** Ready for implementation

---

## Current State Summary

16 flow `main.md` files. Total: 1,987 lines. Avg: 124 lines. Max: 340 lines (`dev-team`).

| Flow | Lines | Distinct task branches | Split candidate? |
|------|-------|----------------------|-----------------|
| dev-team | 340 | 5 (FIX / SPRINT-S / SPRINT-M/L / UNBLOCK / CLEAN) | YES — high |
| tran-ngoc-bau | 239 | 1 (single audit loop, phased) | NO — already linear |
| po | 215 | 4 (channel-audit-only / bug-triage / sprint-plan / sprint-signoff) | YES — high |
| system-auditor | 124 | 1 | NO |
| claude-manager-helper | 117 | 2 (organize / cleanup) | MAYBE |
| qa | 109 | 2 (task-review / clean-branch) | NO — borderline |
| pm | 107 | 3 (plan / monitor / archive) | YES — medium |
| market-analyst | 105 | 4 (morning / news-event / financials / sector) | YES — medium |
| ops | 97 | 1 (incident protocol + recovery) | NO |
| developer | 92 | 1 | NO |
| cowork-refactory-expert | 80 | 1 | NO |
| code-janitor | 78 | 1 | NO |
| architect | 77 | 1 | NO |
| idea-forge | 76 | 1 | NO |
| fixer | 69 | 1 | NO |
| ba | 62 | 1 | NO |

---

## Problem

**Token cost.** Every agent loads their entire `main.md` before knowing which branch applies. For `dev-team` (340 lines), roughly 60% of the flow is irrelevant for any given invocation — the signal-drain + SQLite dedup spec alone (80 lines) is loaded on every CLEAN or FIX cycle where it is unused.

**Cognitive cost.** The agent reads branch conditions mid-flow (e.g. `if FIX → skip to Step 3`, `if SPRINT-M/L → do 1+2+3`) embedded in prose. It must hold the full branch map in context to find its own path. When the flow changes, every branch author must mentally verify they haven't broken the others.

**Pre-branching doc loads (worst case in PO, 215 lines):** PO reads TNB handoff check, channel audit, fix-history cross-check, deploy-gap matrix, and no-task guard — all before knowing whether this cycle is a channel-clean idle or a full sprint-plan invocation. These reads are not wasted individually, but they are forced sequential: the agent cannot begin parallel doc reads for its actual work until it finishes the mandatory preamble.

Estimated overhead: 3–4 unnecessary doc reads per cycle on multi-branch flows, compounded by the fact that agents re-read the same main.md on every invocation (no in-memory cache across spawns).

---

## Proposal

### Pattern: Router + Sub-Flows

`main.md` becomes a thin dispatcher (target: ≤50 lines):

1. Run project-root + notebook-read skills (invariant — always required, 2 lines).
2. Detect task type from spawn context (input: signal type, Telegram report, pipeline-state, or caller's explicit `mode=` parameter).
3. Dispatch: `→ load sub-flow flows/<agent>/<task-type>.md`.

Each sub-flow declares its own minimal `docs_required` block at the top. The agent reads all listed docs in a single parallel tool call — waterfall style — before executing any logic.

### Worked Example: `pm`

**Before (107 lines, 3 interleaved branches):**
- Steps 1-3c: task decomposition (new sprint)
- Step 4: status update (in-flight monitoring)
- Steps 5-6: monitoring + archive (cycle monitor)

All three branches share the same Read steps at the top (TASKS.md + architect notebook + developer notebook) even though archive only needs TASKS.md.

**After: `flows/pm/main.md` (router, ~30 lines)**
```markdown
# PM — Router

Step 0a: project-root skill
Step 0b: notebook-read skill (agent-id: pm)

Task type detection:
  input has architect handoff → "plan"
  TASKS.md has Review tasks → "monitor"
  called with archive trigger → "archive"
  default → "monitor"

→ load flows/pm/<task-type>.md
```

**After: `flows/pm/plan.md` (~45 lines)**
```markdown
# PM — Sprint Plan

docs_required (read in parallel):
  - docs/TASKS.md
  - docs/agent-memory/notebooks/architect.md
  - docs/agent-memory/notebooks/developer.md
  - docs/handoffs/TASK_NNN.md (from input)

[Steps 2, 3, 3b, 3c from current main.md]
```

**After: `flows/pm/monitor.md` (~30 lines)**
```markdown
# PM — Cycle Monitor

docs_required (read in parallel):
  - docs/TASKS.md

[Steps 4, 5 from current main.md]
```

**After: `flows/pm/archive.md` (~30 lines)**
```markdown
# PM — Archive

docs_required (read in parallel):
  - docs/TASKS.md
  - docs/TASKS_ARCHIVE.md

[Step 6 from current main.md]
```

Result: 107 lines → 30 (router) + 45 + 30 + 30 = 135 lines total, but each invocation loads only 30 + ~40 = 70 lines instead of 107. More importantly, doc reads happen in parallel at the sub-flow head.

### Parallel Doc Discovery Pattern

Convention for every sub-flow header:

```markdown
# <Agent> — <Task Type>

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- path/to/doc-a.md          # why: [one phrase]
- path/to/doc-b.json        # why: [one phrase]
- path/to/doc-c.md          # why: [one phrase — conditional: only if X]
```

Rule: `docs_required` is the ONLY place where file reads are declared. No ad-hoc reads mid-flow unless the path is only known at runtime (e.g. `docs/handoffs/TASK_NNN.md` where NNN comes from input).

---

## Migration Plan

### Phase 1 — High-impact (3 flows)

| Flow | Current lines | Est. sub-flows | Reason |
|------|--------------|----------------|--------|
| dev-team | 340 | 5 (drain, triage, plan, execute, scan) | Largest file; drain/SQLite spec is loaded on every cycle even for CLEAN tasks |
| po | 215 | 4 (channel-audit, bug-triage, sprint-plan, sprint-signoff) | Channel audit is always run but its cross-check section (50 lines) is irrelevant when channels are clean |
| market-analyst | 105 | 4 (morning, news-event, financials, sector) | 4 fully independent task types; regime bootstrap already scoped to top — clean split boundary |

### Phase 2 — Medium-impact

| Flow | Action |
|------|--------|
| pm | Split into 3 sub-flows (plan / monitor / archive) |
| tran-ngoc-bau | Keep monolithic — already linear, phases are always sequential |
| system-auditor | Keep monolithic — single task type |
| claude-manager-helper | Optional split into organize/cleanup if growth continues |
| All others (≤92 lines, 1 branch) | No action — already simple |

### Risk: stale path references

Current agent `.md` files reference `flows/<agent>/main.md` via `flow:` YAML field. Sub-flow dispatch is internal to `main.md` — the router still lives at `main.md`, so no agent definition files need updating. The only risk is if agent-father hard-codes sub-flow paths in agent definitions, which he must not do.

### Estimated token savings

Phase 1 alone: ~200 lines of context eliminated per cycle for dev-team, ~100 for po. With a 16-agent team and multi-cycle cron, this compounds to roughly 40-50% reduction in flow-context tokens for the three targeted agents.

---

## Open Questions for User

1. **Task-type detection mechanism**: Should the router detect task type from the spawn prompt text (heuristic, fragile) or require the spawning agent to pass an explicit `mode=` parameter? Explicit is safer but requires updating all spawn call-sites in `dev-team/main.md`.

2. **Shared preamble steps**: Steps 0a (project-root) and 0b (notebook-read) appear identically in every flow. Should these be pulled into the router (`main.md`) so sub-flows are pure business logic, or kept in each sub-flow for self-containedness?

3. **Sub-flow file location convention**: Propose `flows/<agent>/<task-type>.md` (kebab-case). Does this conflict with any existing automation that globs `flows/**/main.md` specifically?
