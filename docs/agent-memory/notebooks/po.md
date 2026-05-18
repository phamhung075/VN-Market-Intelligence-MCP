# PO Notebook

## Last updated: 2026-05-18T08:56:00Z · Cycle: c186 — Sprint 1947 OPEN (user goal: closed-loop auto-improvement)

### c186 session summary

**Spawn context:** User-triggered PO flow via Stop-hook feedback. New goal request (verbatim): "add to goal — compare system to real result with historic analysis for auto improve recheck and improve continue loop workflow". WIP=0 (slot open), Backlog had no actionable items, six OBSERVE gates carrying from Sprint 1946.

**Assessment of request:**
- Maps to a 5-step active control loop: detect (read accuracy history) → hypothesize (gap → likely cause) → dispatch (auto-spawn FIX tasks) → recheck (re-measure) → loop.
- Existing primitives are the building blocks: `signal_outcomes` (1926a) + `alert_accuracy` (1945a) + `AccuracyDigestStats` endpoint + `AccuracyDigestCard` frontend (1945b) + six OBSERVE gates. User is asking for the **active loop on top** of the measurement substrate.
- Architectural scope — design decisions (host: microservice vs job vs agent; auto-dispatch vs human-gate; safety/runaway prevention; phasing) cannot be spec'd directly. Routing per flow rule (c): spawn architect spike first.

**Decision: Open Sprint 1947 with SPIKE-1947 as anchor.**
- Sprint 1947 is design-only; no code ships. Output = SPIKE doc + architect brief recommending Sprint 1948 Phase 1 scope.
- Time-box: 3h (vs SPIKE-1946's 2h — wider scope).
- Deadline 2026-05-20T08:00Z, aligning with the post-1945-scored-pct OBSERVE gate so the spike can read fresh accuracy data as empirical input.
- WIP=1 (within ≤2 cap).

**Files updated this cycle:**
- `docs/SPRINT_GOAL.md` — Sprint 1947 section prepended above Sprint 1946 DONE. Full vision, 10 design questions, 5 ACs, sequencing, scope IN/OUT.
- `docs/TASKS.md` — `SPIKE-1947` row added to Todo (HIGH SPIKE, architect, deadline 2026-05-20T08:00Z).
- `docs/data/project-stats.json` — `currentSprint` set to 1947 (active), `previousSprint` stays 1946 (DONE), `sprintGoal` + `lastFixApplied` + `currentSprintNotes` refreshed for c186.
- This notebook overwritten.

**Notes on scope discipline:**
- Six existing OBSERVE gates carry through unchanged. SPIKE-1947 must READ them as input data, not modify or re-scope them.
- The user request implies auto-dispatch. The recurring-bug-escalation rule (≥2 fix commits same module → architect rethink) implies safety gates needed. Brief must reconcile both.
- Phased rollout (shadow → manual-dispatch → auto-dispatch) is the obvious safe path; spike will recommend Sprint 1948 starts with shadow-mode.

### Carry-over for next cycle

- **Highest priority:** SPIKE-1947 needs architect pickup. Routing: when a cron tick or user prompt re-enters PO/dev-team flow, the SPIKE-1947 row in Todo is the next task. Architect spawn should follow standard dispatch.
- **Concurrent gate:** `post-1944-financial-reports-q1-2026` fires at 12:00Z today (~3h after sprint open). If financial_reports Q1-2026 = 0 rows → spawn 1945d-reparse-pipeline-gap to dev-mcp-server. This will push WIP to 2 (still within cap).
- **Concurrent gate:** `post-1942-fa-verify` (~23Z tonight). Likely passes (1942b shipped 94% cashflow coverage).
- **48h gates:** post-1945-scored-pct + bug-storm at 2026-05-20T07:22Z. These coincide with SPIKE-1947 AC-1 deadline. If scored_pct ≥60% → spike has positive reference data. If miss → spike has live evidence of the gap the auto-loop must close.
- **USER-ACTION blockers unchanged:** 1907a (Claude Desktop restart), 1897b (Docker .git/ exclusion). Both still pending in Backlog.
- **WIP:** 1 (SPIKE-1947). Will rise to 2 if 1945d fires at 12:00Z gate.
