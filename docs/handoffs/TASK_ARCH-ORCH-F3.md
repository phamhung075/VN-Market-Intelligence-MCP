---
sprint: ORCH-DASH-DECISION-DRILLDOWN
branch: task/orch-dash-f3-accordion-ui
size: M
zone: apps/frontend/
depends_on: [ARCH-ORCH-F2]
blocks: [ARCH-ORCH-QA]
---

## TLDR

Extend `apps/frontend/app/routes/dashboard.orchestration.tsx` to render a multi-open accordion on DONE task rows. Each row toggles independently to show decision journal entries (StepCard components) keyed by task_id or sprint_bucket. Add TypeScript types for `StepDto` and `DecisionsDto`. Implement keyboard accessibility (tabIndex, aria-expanded, Enter/Space). Rebuild frontend container.

## [PM] Planning Context

- **Acceptance Criteria:**
  - [ ] AC-F3-1: TypeScript types added: `StepDto`, `DecisionsDto`, extend `OrchState` with optional `decisions` field
  - [ ] AC-F3-2: `DoneTaskGroup` component receives `decisions?: DecisionsDto` and `sprintId: string` as props (optional, backward-compat)
  - [ ] AC-F3-3: DONE task rows are clickable; `cursor-pointer` class applied; `aria-expanded` attribute reflects open state
  - [ ] AC-F3-4: `onClick` on row calls toggle function; multi-open state maintained in `useState<Set<string>>`
  - [ ] AC-F3-5: Below each expandable row, `<DecisionAccordion>` component renders conditionally (hidden when closed)
  - [ ] AC-F3-6: `DecisionAccordion` shows task-specific STEP entries from `decisions.by_task[taskId][]` if present
  - [ ] AC-F3-7: If no task-specific entries, accordion shows sprint-level entries from `decisions.sprint_bucket[sprintId][]` with label "Sprint-level decisions"
  - [ ] AC-F3-8: If both empty, accordion shows "No decisions recorded for this task."
  - [ ] AC-F3-9: Each STEP rendered via inline `<StepCard>` component with fields: step_id, agent_id, timestamp (via `<ClientTimestamp>`), what_done, what_considered (as `<ul>`), why_decision, why_change
  - [ ] AC-F3-10: Chevron indicator (`▾` rotated -180 when expanded) visible on DONE task row
  - [ ] AC-F3-11: Keyboard accessibility: tabIndex={0} on row, onKeyDown handler for Enter/Space calls toggle
  - [ ] AC-F3-12: No `dangerouslySetInnerHTML` anywhere in accordion path; all fields rendered as plain text or mapped arrays
  - [ ] AC-F3-13: TaskBoardPanel threads `sprintId` down to `DoneTaskGroup` (required for sprint_bucket lookup)
  - [ ] AC-F3-14: Non-DONE task rows have no accordion affordance (inert)
  - [ ] AC-F3-15: `tsc` shows 0 errors; existing test suite (Playwright) still passes
  - [ ] AC-F3-16: frontend container rebuilt; `curl http://localhost:3001/dashboard/orchestration` loads without errors

- **Files to read first:**
  - `apps/frontend/app/routes/dashboard.orchestration.tsx` — existing `DoneTaskGroup` component (line 408), accordion state pattern (line 409), `ClientTimestamp` import (line 28)
  - `apps/frontend/app/routes/dashboard.orchestration.tsx` — `TaskBoardPanel` component to understand sprint context threading
  - `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` § F3 — full UX design, RULING-5 (multi-open Set pattern)
  - `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` — DTO shape (DecisionsDto, StepDto) to mirror in frontend types

- **Files to create:**
  - None (pure component modifications in existing dashboard.orchestration.tsx)

- **Files to modify:**
  - `apps/frontend/app/routes/dashboard.orchestration.tsx` — add types, extend `DoneTaskGroup` component, add `DecisionAccordion` + `StepCard` inline components, extend `TaskBoardPanel` to thread sprintId

- **Dependencies:** ARCH-ORCH-F2 (DTO contract must be merged first)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (client-side security: no dangerouslySetInnerHTML)
  - `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` § F3 (full design, RULING-5 multi-open pattern)

---

## Architecture Reference

Full design in `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` § F3.

**Type Definitions (add at top of component file):**
```typescript
interface StepDto {
  step_id: string;
  agent_id: string;
  timestamp: string;
  task_id: string | null;
  what_done: string;
  what_considered: string[];
  why_decision: string;
  why_change: string;
}

interface DecisionsDto {
  by_task: Record<string, StepDto[]>;
  sprint_bucket: Record<string, StepDto[]>;
}

// Extend OrchState (backward-compat: optional)
interface OrchState {
  // ... existing fields unchanged ...
  decisions?: DecisionsDto;
}
```

**Multi-Open State Pattern (RULING-5):**
```typescript
const [openTaskIds, setOpenTaskIds] = useState<Set<string>>(new Set());

const toggle = (id: string) =>
  setOpenTaskIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
```

**DoneTaskGroup Signature (before):**
```typescript
<DoneTaskGroup tasks={tasks} />
```

**DoneTaskGroup Signature (after):**
```typescript
<DoneTaskGroup 
  tasks={tasks}
  decisions={decisions}
  sprintId={sprintId}
/>
```

**TaskBoardPanel threads sprintId:**
For each active sprint, pass `sprintId={sprint.id}` to `<DoneTaskGroup>`.

**DecisionAccordion Logic (pseudo-code):**
```typescript
function DecisionAccordion({ taskId, sprintId, decisions }) {
  const taskSteps = decisions?.by_task[taskId] ?? [];
  const sprintSteps = decisions?.sprint_bucket[sprintId] ?? [];

  if (taskSteps.length === 0 && sprintSteps.length === 0) {
    return <div>No decisions recorded for this task.</div>;
  }

  return (
    <div>
      {taskSteps.length > 0 && (
        <div>
          {taskSteps
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map(step => <StepCard key={step.step_id} step={step} />)}
        </div>
      )}
      {taskSteps.length === 0 && sprintSteps.length > 0 && (
        <div>
          <p>Sprint-level decisions (no task-id assigned)</p>
          {sprintSteps
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map(step => <StepCard key={step.step_id} step={step} />)}
        </div>
      )}
    </div>
  );
}
```

**StepCard Component (inline in same file):**
```typescript
function StepCard({ step }) {
  return (
    <div style={{ borderLeft: '3px solid #e5e7eb', paddingLeft: '1rem', marginBottom: '1rem' }}>
      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
        {step.step_id} · {step.agent_id}
      </div>
      <ClientTimestamp iso={step.timestamp} />
      <div>
        <strong>What was done:</strong> {step.what_done}
      </div>
      {step.what_considered.length > 0 && (
        <div>
          <strong>What was considered:</strong>
          <ul>
            {step.what_considered.map((item, idx) => <li key={idx}>{item}</li>)}
          </ul>
        </div>
      )}
      <div>
        <strong>Why this decision:</strong> {step.why_decision}
      </div>
      <div>
        <strong>Why it changed:</strong> {step.why_change}
      </div>
    </div>
  );
}
```

**DONE Task Row — Before:**
```typescript
<div>{task.title}</div>
```

**DONE Task Row — After:**
```typescript
<div
  role="button"
  tabIndex={0}
  onClick={() => toggle(task.id)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(task.id);
    }
  }}
  aria-expanded={openTaskIds.has(task.id)}
  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
>
  <span style={{ transform: openTaskIds.has(task.id) ? 'rotate(0deg)' : 'rotate(-180deg)', marginRight: '0.5rem' }}>
    ▾
  </span>
  {task.title}
</div>
{openTaskIds.has(task.id) && (
  <DecisionAccordion
    taskId={task.id}
    sprintId={sprintId}
    decisions={decisions}
  />
)}
```

**EC-5 Guard (overflow-wrap for mobile):**
Wrap accordion content in a container with `overflow-wrap: break-word` and reasonable max-width (~90vw on mobile, ~600px on desktop).

---

## Sign-off Criteria

- Types `StepDto` and `DecisionsDto` match F2 DTO schema exactly
- DONE task rows are clickable and toggle accordion independently
- Chevron rotates on open/close
- Both `by_task[taskId][]` and `sprint_bucket[sprintId][]` entries render correctly
- Empty state "No decisions recorded for this task." displays when both empty
- All STEP fields (what_done, what_considered, why_decision, why_change) visible in accordion
- Keyboard: Enter/Space on focused row toggles accordion
- No `dangerouslySetInnerHTML` anywhere
- Non-DONE rows inert (no accordion affordance)
- `tsc` shows 0 errors
- frontend container rebuilt; dashboard loads without errors
- Single atomic commit: `feat(frontend): ARCH-ORCH-F3 — decision accordion on orchestration dashboard`
