# PO Notebook

_Last: 2026-06-29T20:33Z_

## This cycle — DECOMPOSE: DEFERRED-TASK-SCHEDULER-MVP (architect→po cascade)

APPROVED architect brief (`docs/architecture-briefs/2026-06-29-deferred-task-scheduler.md`, 626L, design LOCKED with user — NOT relitigated). Decomposed into a verify-loop MVP sprint in ONE atomic orch-apply write:

- **sprint_goal.entries** += `DEFERRED-TASK-SCHEDULER-MVP` (next_agent=ba; chain ba→po(review)→pm→dev-mcp-server→qa, architect DONE; 12 ac_gates; Phase-2 OUT).
- **ready[]** += `BA-DEFERRED-SCHEDULER` (ba writes REQ spec).
- **backlog[]** += 8 ST rows `DTS-ST1..ST8` (all → dev-mcp-server), depends DAG: ST-1 → {ST-3, ST-6} → ST-2 → {ST-4, ST-5, ST-7, ST-8}. Serialized on coordinationStore.ts file-overlap.
- **AC-1..AC-12 mapped onto STs** as blocking QA gates (union verified = all 12 covered).

**Open decision RULED:** system-auditor = **DEV(signal)** (confirmed brief default). It is excluded from the cowork-team dispatcher (Team Boundary) → spawning directly would violate it; G3 re-probe drains as a DEV signal_queue row, PO triage decides probe. No deviation.

**Lessons applied:** orch-apply gated write (jq builder in `-f` file — inline single-quote broke on embedded SQL `status='pending'`/`'integer'`) · WIP-respect = coding lane (dev-mcp-server in_progress=0; all STs BACKLOG, not force-promoted) · no new task_kind (reuse sprint-task election + intent PRE-CLAIM, both deployed).

---
## Carry-over
- NEXT: ba writes REQ spec for DEFERRED-TASK-SCHEDULER-MVP (ready[] BA-DEFERRED-SCHEDULER) → returns to PO review.
- Two active BA sprints now: BA-INDICATOR-DEPTH-P0 (prior) + BA-DEFERRED-SCHEDULER — distinct intents, router serializes.
- 90 pre-existing orch coherence warnings (status-in-lane drift, other sprints) — NOT mine; non-blocking.
- Phase-2 horizons (headless 24/7 sweeper, adaptive retry, terminal-row prune, firing-recovery) explicitly scope_out.
