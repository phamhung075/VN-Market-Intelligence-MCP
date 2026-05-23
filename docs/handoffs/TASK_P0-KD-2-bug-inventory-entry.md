---
task_id: "P0-KD-2"
pilot: "kinh-dich"
phase: "0"
title: "Bug inventory baseline entry for kinh-dich (system-auditor)"
estimate: "1h"
owner: "system-auditor"
status: "READY"
date: "2026-05-24"
---

# TASK P0-KD-2 — kinh-dich Bug-Inventory Entry

## Summary

Add a `kinh_dich_baseline` entry to `docs/data/bug-inventory.json` to establish the AI-fixability baseline (G10) for the pilot. The entry records the 60-day fix-cycle count for this service or falls back to the system-wide default if below the threshold.

## Acceptance Criteria

### AC-1: Query bug history for kinh-dich
- [ ] Search `docs/data/bug-inventory.json` for any existing entries with `service: "kinh_dich_service"` or `module: "kinh-dich"`
- [ ] If entries exist: count bugs fixed in the 60-day window (from 2026-03-25 to 2026-05-24) with `status: "fixed"` or `resolved: true`
- [ ] If entries do not exist or count < 2: use fallback `baselineCycleCount: 1.5` (system-wide default per charter §G10)
- [ ] Document findings in handoff

### AC-2: Add kinh_dich_baseline block to bug-inventory.json
- [ ] Create a new top-level block:
```json
{
  "kinh_dich_baseline": {
    "service": "kinh-dich-service",
    "module": "kinh-dich",
    "baselineCycleCount": <int>,
    "baselineSource": "60d window <date_from> to <date_to> | system-wide fallback 1.5 if <2 bugs",
    "observedFixCount": <int or null>,
    "recordedAt": "<ISO timestamp>",
    "recordedBy": "system-auditor (phase-0 pilot kickoff)"
  }
}
```
- [ ] If bugs were found: `baselineCycleCount = observedFixCount` (rounded to nearest 0.5)
- [ ] If fallback applied: `baselineCycleCount: 1.5`, `observedFixCount: null`, `baselineSource: "system-wide fallback <60d window had <2 bugs>"`
- [ ] Insert block into the JSON (NOT at top-level root, but as a named field alongside any existing pilot entries like `stock_price_baseline`, `macro_indicators_baseline`)

### AC-3: Verify JSON syntax
- [ ] Run `jq '.' docs/data/bug-inventory.json` — exits 0 with no parse errors
- [ ] Paste the full `kinh_dich_baseline` block into handoff as evidence

### AC-4: Git staging (L84 explicit-file staging)
- [ ] Stage file with: `git add -f docs/data/bug-inventory.json` (gitignored, so `-f` required)
- [ ] Confirm staging: `git status | grep docs/data/bug-inventory.json`

## Implementation Guidance

1. **File location:** `docs/data/bug-inventory.json` (gitignored; use `-f` flag when staging)
2. **Query pattern:** Open file, search for service name matching `kinh_dich_service` or just `kinh-dich` in any bug entry
3. **Fallback logic:** Unless you find ≥2 distinct bugs with fix dates in the 60d window, use `baselineCycleCount: 1.5`
4. **Timestamp format:** ISO 8601 (e.g., `2026-05-24T12:34:56Z`)
5. **Agent placement:** If entry already exists from another earlier scan, update it; otherwise create new

## Constraints

- **L84 explicit-file staging:** must use `git add -f` for gitignored file
- **No git push:** local-only commit
- **JSON validity:** must parse as valid JSON (jq test)
- **Immutability until 12/12:** once recorded, do NOT mutate the baseline until charter closure (G10 reference)

## Hard Gates

- [ ] **JSON VALID:** `jq '.' docs/data/bug-inventory.json` exits 0
- [ ] **BASELINE SET:** `kinh_dich_baseline` block present with `baselineCycleCount` set (either from 60d query or fallback 1.5)

## RETURN Block

**Signal to emit:** docs/signals/pm-p0-kd2-bug-inventory-entry-complete-<UTC>.json
- Status: DONE | BLOCKED
- File: docs/data/bug-inventory.json path
- Baseline count: <int>
- Source: "60d window query" | "system-wide fallback"
- Observed bugs in 60d: <count or "none">
- Next task: PM waits for all 5 remaining Phase 0 deliverables before exit gate

**Expected timeline:** 2026-05-24 (same-day delivery, system-auditor)
