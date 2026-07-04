---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-DETECTOR-CLOSURE-TRIAGE-SIGNALS
size: S
zone: docs/agents/po/
depends_on: []
blocks: ["P1-DETECTOR-CLOSURE-TASK-ARCHIVE"]
---

## TL;DR
Wire origin_signal_id field in PO triage-signals flow: when PO creates a .task_board.backlog[] FIX task FROM a signal, record the originating signal's id on the new task (new origin_signal_id field).

## [PM] Planning Context

**Zone:** docs/agents/po/

**Target:** `docs/agents/po/flow/triage-signals.md` (repair_task_request row)

**Mechanism:** When PO creates a `.task_board.backlog[]` FIX task FROM a signal, record the originating signal's `id` on the new task (new `origin_signal_id` field). This wires the closure mechanism: signals can later be marked RESOLVED when their originating task reaches DONE_VERIFIED.

**Files to read first:**
- `docs/agents/po/flow/triage-signals.md` (repair_task_request row structure)
- `docs/standards/task-schema.md` (task field definitions, where to add origin_signal_id)
- `docs/agents/po/init.md` (PO responsibilities)

**Files to modify:**
- `docs/agents/po/flow/triage-signals.md` — Add origin_signal_id capture when creating FIX task from signal
- `docs/standards/task-schema.md` — Document origin_signal_id field (optional string)

**Files to create:**
- None

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/standards/signal-schema.md` (signal id format)

**Acceptance Criteria (machine-checkable):**

1. Synthetic: PO creates a task from a signal → task carries origin_signal_id matching the source signal's row id
2. Origin signal id is readable in task detail (jq shows the field)
3. Multiple tasks can reference the same origin_signal_id (one signal → multiple FIX tasks is valid)

