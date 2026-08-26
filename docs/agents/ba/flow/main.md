# Business Analyst — Main Flow

**Tools:** `docs/agents/tools/package/ba.md`

## Input
`docs/data/orch/orch-state.json` `.sprint_goal` vision, current `.task_board`, module memory

## Output
Requirement spec in `docs/data/orch/orch-state.json .task_board` | Architect task created | PO notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 2 — SPRINT-M/L only, first sub-step before architect
**Receives:** `docs/data/orch/orch-state.json` `.sprint_goal` vision | `.task_board` task numbering | module memory notebooks
**Produces:** FR/NFR spec with DDD layer assignments, blockers, edge cases → written to `docs/handoffs/TASK_NNN.md`; RETURN block with `NEXT: architect`
**Hand off to:** main terminal → spawns architect with BA spec as context
**Composes with:** architect (next) and pm (two steps later) in the same SPRINT-M/L planning chain

Not called for SPRINT-S — architect handles S alone.
Blockers (Q-only-PO-can-answer) must be resolved before returning — loop with PO if needed.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `ba`)

**1. Read context**
`docs/data/orch/orch-state.json` `.sprint_goal` vision | `.task_board` task numbering | recent agent notebooks (`docs/agent-memory/notebooks/*.md`)

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

**FR behavior predicate (P0/P1 `apps/` FRs only, FIX-BEHAVIORAL-VERIFICATION-GATE-MINT-SIDE 2026-08-26):** for any FR above whose DDD-layer implementation lands in an `apps/<service>/` zone AND whose eventual task row will carry `priority: P0`/`P1`, add one line under that FR: `Behavior predicate: <shell one-liner> expect <value>`. This is the same `verification.behavior_predicate:{cmd,expect}` field PO mints onto the row at kickoff (`docs/agents/po/flow/main.md`, `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md` §5a/§9) — ba supplies the candidate command here so PO does not have to invent one cold. **Cutoff:** `BEHAVIOR_PREDICATE_CUTOFF = "2026-08-26T19:57:54Z"` — FRs whose dispatching row was minted before that instant are exempt, the field did not exist yet. NFR-only FRs and non-`apps/` FRs never need one.

**5.** If the task row that dispatched you already exists in `.task_board` (the normal case — dev-team/po promoted it with `next_agent: "ba"`), UPDATE that SAME row in place: add `ba_spec_complete: true`, `ba_handoff: "<spec path>"`, `ba_completed_at: "<ISO-8601 UTC now>"`, and set `next_agent` to `"po"` (if blockers) or `"architect"` (if clean). Do NOT mint a duplicate row in `.task_board.backlog[]` — a prior cycle (BA-IND-P1-MOMENTUM-RS) did this and left the real `ready[]` row un-transitioned, requiring router reconciliation to remove the dup. Only create a brand-new `.task_board.backlog[]` row when BA is originating a requirement with no existing dispatching row (rare — e.g. an unprompted discovery).

## Output to `docs/data/orch/orch-state.json .task_board`

Canonical shape per `docs/standards/task-schema.md`:
```json
{
  "id": "BA-NNN",
  "title": "Requirement: [Feature Name] — [brief memo with FR list, blockers, edge cases, DDD layers]",
  "owner": "ba",
  "status": "TODO",
  "zone": "docs/agents/",
  "created_at": "<ISO-8601 UTC now>",
  "priority": "high"
}
```
**Decision journal** (mandatory — before marking task DONE):
→ skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<active BA task_id, e.g. BA-NNN>"]
Write at minimum ONE entry stamped with the task-id. Routine work: `what-considered: "only path: <reason>"`, `why-change: "no change from plan"`.

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`

PO approves → BA Done → update `.task_board` task status (atomic write per §2.3) → return:
```
## RETURN
DONE: BA spec approved, requirements written to docs/handoffs/TASK_NNN.md
NEXT: architect | run brownfield analysis and produce technical design
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
