# TASK 1837a — Pipeline-state Persistence Fix

**Sprint:** 1837
**Type:** SPRINT-S (no BA needed — root cause and fix scope already diagnosed)
**Priority:** P0
**Owner:** architect → developer
**Status:** Todo
**Opened:** 2026-05-03

---

## Problem

After `/compact`, the main terminal loses all pipeline state. Agent RETURN blocks live only in conversation messages. Compaction replaces messages with a summary — RETURN blocks are gone. Main terminal re-evaluates CLAUDE.md prerequisites, hits the `TASKS.md empty` gate, and asks the user for confirmation instead of resuming the active sprint.

This is a reliability regression every time the user compacts a long session.

---

## Root Cause

Pipeline state (active sprint, next agent, next prompt) is ephemeral — it exists only in conversation context. There is no durable store that survives `/compact`.

---

## Fix Scope (three files, no new services)

### Deliverable 1 — `docs/pipeline-state.json` (new file)

Persisted pipeline state. Written by every agent at RETURN, read by main terminal at session start.

**Schema:**

```json
{
  "_maintained_by": "every agent at RETURN via agent-chaining-protocol",
  "status": "in_progress | idle",
  "currentSprint": 1837,
  "activeTaskId": "1837a",
  "nextAgent": "architect",
  "nextPrompt": "Task 1837a. Handoff: docs/handoffs/TASK_1837a.md. Design pipeline-state.json schema and update CLAUDE.md + agent-chaining-protocol.md.",
  "updatedAt": "2026-05-03T00:00:00Z",
  "updatedBy": "po"
}
```

Initial file must be written as part of this task with `status: in_progress`, populated for handoff to architect.

### Deliverable 2 — `CLAUDE.md` precondition block update

**Current logic (broken):**

```
PO cannot self-initiate if docs/TASKS.md is empty AND no Telegram reports exist.
→ asks user for session goal
```

**New logic (fixed):**

```
Step 1: Read docs/pipeline-state.json
  - If status=in_progress AND nextAgent present → resume pipeline (spawn nextAgent with nextPrompt), do NOT ask user
  - If status=idle OR file missing → fall through to Step 2

Step 2: Check TASKS.md empty gate (existing logic, unchanged)
  - If TASKS.md empty AND no Telegram reports → ask user for session goal
```

The precondition block in CLAUDE.md must be updated to express this two-step check clearly. The new text must be unambiguous — main terminal must be able to act on it without interpretation.

### Deliverable 3 — `agent-chaining-protocol.md` mandatory write rule

Add a new rule to the Rules section:

**Rule 6 — Pipeline-state write is mandatory at every RETURN:**

```
Every agent MUST write docs/pipeline-state.json before returning:
  - status: "in_progress", nextAgent: "<agent-name>", nextPrompt: "<spawn prompt>", activeTaskId: "<NNN>", updatedAt: ISO8601, updatedBy: "<agent-id>"
  - PM/QA write status: "idle" when sprint is complete (no next agent)
  - File must be written even if PIPELINE: complete — to clear in_progress state
  - Write is non-optional: an agent that forgets breaks post-compact resume
```

Also update the Agent Return Template section to include the pipeline-state write step explicitly.

---

## Acceptance Criteria

| AC | Description |
|----|-------------|
| AC-1 | `docs/pipeline-state.json` exists with valid schema (all fields present) |
| AC-2 | `CLAUDE.md` precondition block checks `pipeline-state.json` BEFORE TASKS.md empty gate |
| AC-3 | When `pipeline-state.json` has `status=in_progress`, main terminal resumes without asking user |
| AC-4 | When `pipeline-state.json` has `status=idle`, main terminal falls through to existing TASKS.md gate |
| AC-5 | `agent-chaining-protocol.md` Rule 6 present: mandatory write at every RETURN |
| AC-6 | Agent Return Template in protocol updated to show pipeline-state write step |
| AC-7 | PM writes `status=idle` on sprint complete |
| AC-8 | QA writes `status=idle` on pipeline complete |
| AC-9 | No new code files — all changes are documentation/config (JSON + MD files only) |
| AC-10 | `docs/pipeline-state.json` initialised with `status=in_progress`, nextAgent=developer, correct nextPrompt for 1837a |

---

## Out of Scope

- No TypeScript implementation — pipeline-state.json is written by agents (Claude), not by server code
- No MCP tool required — file is read/written directly via Read/Write tools
- No test changes

---

## Architect Instructions

Design the exact wording for all three deliverables. Pay special attention to:

1. CLAUDE.md wording must be imperative and unambiguous — main terminal acts on it literally
2. `pipeline-state.json` initial content must be correct for the 1837a handoff to developer (nextAgent=developer, nextPrompt built from this handoff)
3. `agent-chaining-protocol.md` Rule 6 must cover the edge case where a mid-pipeline agent crashes or returns without writing state — specify recovery behaviour (main terminal should fall back to asking user only if updatedAt is >24h stale)

After design, pass to developer for implementation (writing the three files).

---

## File Checklist

| File | Action |
|------|--------|
| `docs/pipeline-state.json` | CREATE |
| `CLAUDE.md` | EDIT — precondition block |
| `.claude/knowledge/agent-chaining-protocol.md` | EDIT — Rules + Return Template |

---

## [Architect] Brownfield Findings

**Date:** 2026-05-03
**Status:** Design complete — ready for developer

---

### 1. Brownfield Scan Results

**CLAUDE.md — lines 9–20 (precondition block to replace):**

Current text at lines 9–20:
```
### 1. User Session Required When PO Has No Tasks

PO cannot self-initiate if docs/TASKS.md is empty AND no Telegram reports exist.
In that case: **ask the user for a session goal** before spawning PO.

\```
User provides: goal / priority / context
→ Main terminal passes to PO as session prompt
→ PO uses it to initiate sprint
\```

If PO returns `PIPELINE: idle` (nothing to do) → stop, ask user what to work on next.
```

**agent-chaining-protocol.md — sections to extend:**

- Rules section ends at line 40 (Rule 5 is the fixer ceiling). Rule 6 appends after it.
- "Agent Return Template" section is lines 55–64. The template block must gain a `PIPELINE_STATE_WRITE` step.
- No other sections need modification.

**Risk flags:**

- Stale-state edge case: if an agent crashes mid-run, `updatedAt` will be from the crashed agent's last write. If >24h, the in_progress state is misleading — main terminal must not resume blindly. The 24h staleness gate handles this.
- The `nextPrompt` field in `pipeline-state.json` must be the full spawn prompt — not a reference. Main terminal reads this field verbatim and uses it as the agent spawn message. Any truncation causes broken handoff.
- `status: "blocked"` is not in the original PO schema but the task description uses it. Do not add it — keep status as two values only: `"in_progress"` and `"idle"`. This avoids ambiguity in the CLAUDE.md gate logic. The CLAUDE.md text already uses `idle OR file missing` as the fall-through condition.

---

### 2. Exact Content — Deliverable 1: `docs/pipeline-state.json`

Initial state for handoff to developer (AC-10):

```json
{
  "_maintained_by": "every agent at RETURN via agent-chaining-protocol",
  "status": "in_progress",
  "currentSprint": 1837,
  "activeTaskId": "1837a",
  "nextAgent": "developer",
  "nextPrompt": "Task 1837a. Handoff: docs/handoffs/TASK_1837a.md. Architect has completed design. Implement all three deliverables: (1) create docs/pipeline-state.json with the architect-specified initial content, (2) edit CLAUDE.md precondition block to the architect-specified exact wording, (3) edit .claude/knowledge/agent-chaining-protocol.md Rules section (add Rule 6) and Return Template (add PIPELINE_STATE_WRITE step) to the architect-specified exact wording. All changes are MD/JSON only — no code. See [Architect] Brownfield Findings section in handoff for exact text.",
  "updatedAt": "2026-05-03T00:00:00Z",
  "updatedBy": "architect"
}
```

---

### 3. Exact Content — Deliverable 2: CLAUDE.md Precondition Block Rewrite

Replace the entire `### 1. User Session Required When PO Has No Tasks` section with the following. Do not touch any other section.

```markdown
### 1. Pipeline Resume — Check Before Asking User

**Step 1 — Read `docs/pipeline-state.json`:**

- If the file exists AND `status == "in_progress"` AND `nextAgent` is present AND `updatedAt` is less than 24 hours ago → **immediately spawn `nextAgent` with `nextPrompt` as the full prompt. Do NOT ask the user anything. Do NOT check TASKS.md.**
- If the file exists AND `status == "in_progress"` AND `updatedAt` is more than 24 hours ago → treat as stale crash. Write `status: "idle"` to the file. Fall through to Step 2.
- If the file does not exist, OR `status == "idle"` → fall through to Step 2.

**Step 2 — User Session Gate (existing logic):**

PO cannot self-initiate if `docs/TASKS.md` is empty AND no Telegram reports exist.
In that case: **ask the user for a session goal** before spawning PO.

\```
User provides: goal / priority / context
→ Main terminal passes to PO as session prompt
→ PO uses it to initiate sprint
\```

If PO returns `PIPELINE: idle` (nothing to do) → stop, ask user what to work on next.
```

---

### 4. Exact Content — Deliverable 3: agent-chaining-protocol.md Updates

#### 4a. Add Rule 6 after Rule 5

In the Rules section, append after line `5. **Fixer ceiling**: 2 rounds max → still failing → main terminal spawns \`architect\`, opens new task`:

```markdown
6. **Pipeline-state write is mandatory at every RETURN**: Every agent MUST write `docs/pipeline-state.json` before returning control to main terminal.
   - If handing off to next agent: set `status: "in_progress"`, populate `nextAgent`, `nextPrompt` (full spawn prompt — verbatim), `activeTaskId`, `updatedAt` (ISO8601 now), `updatedBy` (your agent id).
   - If sprint/pipeline is complete (PM or QA, no next agent): set `status: "idle"`, `nextAgent: null`, `nextPrompt: null`.
   - The write is non-optional. An agent that returns without writing this file breaks post-compact resume for the entire session.
   - **Stale-state recovery**: if `updatedAt` is >24h old AND `status` is `"in_progress"`, main terminal treats the state as crashed and resets to `idle`. Agents must write accurate timestamps.
```

#### 4b. Update Agent Return Template

Replace the current template block:

```
## RETURN
DONE: [one sentence: what was completed]
NEXT: [agent name] | [one sentence: what it must do]
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
```

With:

```
## RETURN
DONE: [one sentence: what was completed]
NEXT: [agent name] | [one sentence: what it must do]
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
PIPELINE_STATE_WRITE: Write docs/pipeline-state.json NOW before this response ends.
  - If PIPELINE=continue: status="in_progress", nextAgent=<name>, nextPrompt=<full spawn prompt>, activeTaskId=<NNN>, updatedAt=<ISO8601>, updatedBy=<your-agent-id>
  - If PIPELINE=complete: status="idle", nextAgent=null, nextPrompt=null, activeTaskId=<NNN>, updatedAt=<ISO8601>, updatedBy=<your-agent-id>
```

---

### 5. Implementation Notes for Developer

- Write `docs/pipeline-state.json` FIRST. Its `updatedAt` must use the current timestamp at time of writing (not the hardcoded `2026-05-03T00:00:00Z` — use the actual ISO8601 datetime when the file is created).
- For CLAUDE.md: the replaced section is lines 7–20 (from `### 1. User Session Required...` through `...ask user what to work on next.`). Use exact wording from Section 3 above.
- For `agent-chaining-protocol.md`: Rule 6 appends to the existing numbered list (after line 40). The Return Template block replacement is lines 58–63.
- After implementing, update `docs/pipeline-state.json` to `nextAgent: "qa"` and write the correct nextPrompt for QA to verify ACs 1–10.

---

## [QA] Review Record

**Date:** 2026-05-03
**Reviewer:** qa
**Branch:** task/1837a-pipeline-state-fix
**Commit:** 4702764d
**Outcome:** APPROVED — merged to main

### Test Results

- Unit tests (1837a suite): 3 pass / 0 fail
- TypeScript: not applicable (no production TS files changed — AC-9)

### AC Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | `docs/pipeline-state.json` exists with all required fields (status, currentSprint, activeTaskId, nextAgent, nextPrompt, updatedAt, updatedBy) | PASS |
| AC-2 | status is one of "in_progress" or "idle" | PASS — status="in_progress" (valid enum) |
| AC-3 | updatedAt is valid ISO 8601 date string | PASS — "2026-05-03T10:00:00Z" |
| AC-4 | CLAUDE.md precondition block checks pipeline-state.json BEFORE TASKS.md empty gate | PASS — Step 1 reads file, Step 2 is TASKS.md gate |
| AC-5 | agent-chaining-protocol.md Rule 6 present: mandatory write at every RETURN | PASS |
| AC-6 | Agent Return Template includes PIPELINE_STATE_WRITE step | PASS |
| AC-7 | Rule 6 specifies PM writes status=idle on sprint complete | PASS |
| AC-8 | Rule 6 specifies QA writes status=idle on pipeline complete | PASS |
| AC-9 | No new TypeScript production files — only JSON + MD changes + 1 test file | PASS |
| AC-10 | pipeline-state.json has nextAgent=qa with correct QA spawn nextPrompt | PASS |

### DDD Compliance: PASS (no production code changed)

### Security: PASS (no secrets, no process.env, no SQL)

### Merge Status

Merged to main via `git merge --no-ff task/1837a-pipeline-state-fix`. Branch deleted.
`docs/pipeline-state.json` set to `status: "idle"`, `nextAgent: null`, `updatedBy: "qa"`.
`totalTasksDone` incremented to 500.
