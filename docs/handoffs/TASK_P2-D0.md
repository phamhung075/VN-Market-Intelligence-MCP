---
task_id: P2-D0
title: "Preflight: verify bug-inventory.json has ≥1 TA candidate"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G10"]
files_touched: []
status: "PENDING"
blocked_by: []
unblocks: ["P2-D1"]
estimate_hours: 0.167
ac_count: 4
---

# P2-D0 — Preflight: verify bug-inventory.json has ≥1 TA candidate

**Goal:** G10 (AI agent fixes a primitive bug without looping)

**Description:**
QA verifies that the bug-inventory.json file exists and contains at least one technical-analysis bug for use in G10 proof. This is a quick preflight check (no new work needed if file exists).

---

## Files Touched

None (read-only verification)

---

## Architect Findings (Verified 2026-05-23)

`docs/data/bug-inventory.json` EXISTS. Contains two technical-analysis bugs:

- `1970-TA-OHLCV-MISSING` — fixCycles: 1, resolved: true
- `1968d-wave1-anchor-format` — fixCycles: 2, resolved: true

**Baseline:** `baselineCycleCount: 1.5` (measured TA average from resolved bugs). This REPLACES the charter's system-wide 4-6 cycle estimate with a more accurate TA-specific baseline.

---

## Critical Implication for G10

The charter states agent must fix in ≤2 cycles vs the 4-6 baseline. With the actual TA baseline at 1.5 cycles, the goal remains ≤2 cycles (same target). The baseline number to record in evidence is **1.5 cycles** (TA-specific), not 4-6 (system-wide).

---

## Acceptance Criteria

1. **AC-1**: `docs/data/bug-inventory.json` exists and is valid JSON
2. **AC-2**: At least one bug has `"module": "technical-analysis"` (currently 2 bugs: 1970, 1968d)
3. **AC-3**: `baselineCycleCount` field is present (value: 1.5 for TA-specific bugs)
4. **AC-4**: QA records in handoff: "P0-1 complete. bug-inventory.json exists. TA baseline = 1.5 cycles. G10 target = ≤2 cycles."

---

## Smoke Check

```bash
jq '.baselineCycleCount, [.bugs[] | select(.module == "technical-analysis")] | length' docs/data/bug-inventory.json
# Must print: 1.5 \n 2 (or higher)
```

---

## Atomic Commit Format

No commit — verification only. Result recorded in handoff.

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G10  | IN-PROGRESS (preflight gate passed) |

---

## Dependencies

**Upstream:** None (can start immediately)
**Downstream:** P2-D1 (bug-injection spec design)

---

## Notes

- Reference: `docs/architecture-briefs/2026-05-22-refactor/phase-2-task-plan-go.md` §P2-D0 (lines 491–521)
- If bug-inventory.json does NOT exist, this becomes a BLOCKER and P2-D needs to be replanned.
