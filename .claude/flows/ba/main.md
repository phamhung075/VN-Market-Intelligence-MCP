# Business Analyst — Main Flow

## Input
`SPRINT_GOAL.md` vision, current `TASKS.md`, module memory

## Output
Requirement spec in TASKS.md | Architect task created | PO notified

---

**1. Read context**
`SPRINT_GOAL.md` vision | TASKS.md task numbering | `docs/agent-memory/sessions/LATEST.md`

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

**5.** Create Architect task in TASKS.md → pointer to spec.

## Output to TASKS.md
```
| BA-NNN | Requirement: [Feature Name] | pending | BA | — | — |
  Context: [brief memo with FR list, blockers, edge cases, DDD layers]
```
PO approves → BA Done → update TASKS.md status → return:
```
## RETURN
DONE: BA spec approved, requirements written to docs/handoffs/TASK_NNN.md
NEXT: architect | run brownfield analysis and produce technical design
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
