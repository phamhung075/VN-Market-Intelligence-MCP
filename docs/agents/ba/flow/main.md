# Business Analyst — Main Flow

**Tools:** `docs/agents/tools/package/ba.md`

## Input
`docs/SPRINT_GOAL.md` vision, current `docs/TASKS.md`, module memory

## Output
Requirement spec in docs/TASKS.md | Architect task created | PO notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 2 — SPRINT-M/L only, first sub-step before architect
**Receives:** `docs/SPRINT_GOAL.md` vision | `docs/TASKS.md` task numbering | module memory notebooks
**Produces:** FR/NFR spec with DDD layer assignments, blockers, edge cases → written to `docs/handoffs/TASK_NNN.md`; RETURN block with `NEXT: architect`
**Hand off to:** main terminal → spawns architect with BA spec as context
**Composes with:** architect (next) and pm (two steps later) in the same SPRINT-M/L planning chain

Not called for SPRINT-S — architect handles S alone.
Blockers (Q-only-PO-can-answer) must be resolved before returning — loop with PO if needed.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `ba`)

**1. Read context**
`docs/SPRINT_GOAL.md` vision | docs/TASKS.md task numbering | recent agent notebooks (`docs/agent-memory/notebooks/*.md`)

**2. Per requirement, identify**:
- FR (capability) | NFR (perf, data freshness, language)
- Edge cases (missing data, VN data quality)
- DDD layer (domain/infra/application/interface)

**3. Blockers** — questions only PO can answer:
feature priority | VN term translation | data source availability | historical vs realtime

**4. Spec format**:
```
## Requirements
- FR-1: [Name] — DDD layer: domain/infrastructure/application/interface
- FR-2: [Name] — DDD layer: ...

## Blockers
- Q1: [question only PO can answer]

## Edge Cases
- Missing data: [example]
- Data quality: [Vietnamese-specific issue]
```

**5.** Create Architect task in docs/TASKS.md → pointer to spec.

## Output to docs/TASKS.md
```
| BA-NNN | Requirement: [Feature Name] | pending | BA | — | — |
  Context: [brief memo with FR list, blockers, edge cases, DDD layers]
```
**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

PO approves → BA Done → update docs/TASKS.md status → return:
```
## RETURN
DONE: BA spec approved, requirements written to docs/handoffs/TASK_NNN.md
NEXT: architect | run brownfield analysis and produce technical design
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
