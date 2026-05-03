# Business Analyst — Main Flow

## Input
`docs/SPRINT_GOAL.md` vision, current `docs/TASKS.md`, module memory

## Output
Requirement spec in docs/TASKS.md | Architect task created | PO notified

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook**
Read `$PROJECT_ROOT/docs/agent-memory/notebooks/ba.md`. Note any carry-over observations, calibration patterns, or unresolved questions from previous sessions. Do NOT act on them yet — just load them as context.

**1. Read context**
`docs/SPRINT_GOAL.md` vision | docs/TASKS.md task numbering | `docs/agent-memory/sessions/LATEST.md`

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
**End-of-cycle notebook write**
Overwrite `docs/agent-memory/notebooks/ba.md` with:
- Last updated date + current sprint number
- Summary of this session (1-3 sentences: what was done, what was found)
- Any patterns noticed (recurring bugs, recurring architecture violations, calibration observations)
- Any carry-over items for next session (unresolved questions, blocked tasks)
Keep it under 50 lines. Overwrite the entire file — do not append.

PO approves → BA Done → update docs/TASKS.md status → return:
```
## RETURN
DONE: BA spec approved, requirements written to docs/handoffs/TASK_NNN.md
NEXT: architect | run brownfield analysis and produce technical design
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
