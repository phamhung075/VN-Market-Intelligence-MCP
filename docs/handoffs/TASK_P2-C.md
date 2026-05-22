---
task_id: P2-C
title: "G9 async user verification gate (PO-owned)"
phase: "2"
pilot: "technical-analysis"
owner: "po"
goals: ["G9"]
files_touched: []
status: "PENDING"
blocked_by: []
unblocks: []
estimate_hours: 999
ac_count: 5
---

# P2-C — G9 Async user verification gate (PO-owned)

**Goal:** G9 (Dashboard is the trust contract)

**Description:**
PO sends a Telegram message to the user with the dashboard URL and a YES/NO question confirming the dashboard serves as the trust contract. PO records the user's async reply and updates pilot-status.json.

---

## Files Touched

None (async gate, PO-managed externally)

---

## Deliverables (PO-owned, async mechanism)

1. **Telegram WORK message sent to user:** dashboard URL + YES/NO question
2. **Signal file dropped:** `docs/signals/po-{timestamp}.json`
3. **User reply tracked** in `docs/po-decisions/2026-05-23-g9-user-confirmation.md`
4. **On YES:** `pilot-status.json` `goals[G9].status = "YES"` + `verifiedAt` + `verifiedBy = "po (user verbal async confirmation)"`
5. **On NO:** triage into dashboard-polish task

---

## Acceptance Criteria

1. **AC-1**: Telegram WORK message sent with dashboard URL and YES/NO question
2. **AC-2**: User reply received and documented in po-decisions file
3. **AC-3**: `pilot-status.json` updated with user decision and timestamp
4. **AC-4**: Signal file dropped (docs/signals/po-{timestamp}.json)
5. **AC-5**: G9 decision recorded (YES → proceed; NO → re-scope)

---

## Note on Blocking

**G9 does NOT block Phase 2 dev work.** This is an async gate running in parallel with technical tasks (P2-A through P2-F). User reply is tracked separately. If user reply is negative, decision matrix gates Phase 3 (per charter).

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G9   | IN-PROGRESS (awaiting async user confirmation) |

---

## Dependencies

**Upstream:** None (can start immediately, async)
**Downstream:** None for Phase 2 dev (gates Phase 3 decision matrix)

---

## Rationale

Per pilot-charter.md §G9 verification method, user must verbally confirm the dashboard is the trust contract. This is an async gate that does not hold up parallel dev work. Decision mechanism: Telegram async + signal file (MARKET channel write forbidden for PO per permissions).
