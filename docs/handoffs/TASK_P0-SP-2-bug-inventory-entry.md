---
task_id: "P0-SP-2"
pilot: "stock-price"
phase: "0"
title: "Bug-inventory entry: stock_price_baseline (system-auditor)"
estimate: "1h"
owner: "system-auditor"
status: "READY"
date: "2026-05-24"
---

# TASK P0-SP-2 — Stock-Price Bug-Inventory Baseline

## Summary

Add a `stock_price_baseline` entry to `docs/data/bug-inventory.json` recording the baseline fix-cycle count for the stock-price service. This metric will be used by G10 (AI agent bug-fixability proof) to establish the acceptable cycle threshold for stock-price bug fixes.

Per charter §Baseline Metric Capture, if no stock-price-specific bugs exist in the past 60 days, the entry falls back to the **system-wide baseline of 1.5 cycles** (proven by macro-indicators pilot, carried from technical-analysis pilot). 

## Acceptance Criteria

### AC-1: Scan git log for stock-price bugs in past 60 days
- [ ] Run `git log --since="2026-03-25" --grep="stock-price\|stock_price\|apps/stock-price" -- apps/stock-price/ | head -50`
- [ ] Review commit messages for explicit bug fixes, error corrections, or hot-patches
- [ ] Count distinct bug-fix commits (ignore refactoring, test additions, documentation)
- [ ] If ≥2 bugs found: measure fix-cycle count (from bug open to fix merged) for each
- [ ] Calculate `baselineCycleCount` = average of all stock-price bugs found

### AC-2: Check agent notebooks for stock-price issues
- [ ] Scan `docs/agent-memory/notebooks/` for stock-price bug mentions (e.g., dev-stock-price.md if exists)
- [ ] Cross-ref with docs/signals/ for any bug-report signals related to stock-price
- [ ] Note any recurring issues or patterns (if any)

### AC-3: Record entry in bug-inventory.json
- [ ] Open `docs/data/bug-inventory.json` (existing file from Phase-0-P0-1 task, if not already present)
- [ ] Locate or create the `baselineCycleCount` (system-wide field at root level)
- [ ] Add entry under a `stock_price` section:
  ```json
  "stock_price": {
    "baselineCycleCount": <number>,
    "source": "<url or commit or 'system-wide-fallback'>",
    "scanWindow": "2026-03-25..2026-05-24",
    "bugsFound": <count>,
    "notes": "<comment if any>"
  }
  ```
- [ ] If no stock-price bugs found in 60d window: set `baselineCycleCount = 1.5` (system-wide inherited from macro-indicators)
- [ ] If bugs found: set `baselineCycleCount = average fix cycles`

### AC-4: Validate JSON schema
- [ ] Run `jq . docs/data/bug-inventory.json` (must exit 0, valid JSON)
- [ ] Verify `stock_price` entry is present and has all required fields

### AC-5: No source code changes
- [ ] Verify `git diff --stat` shows only `docs/data/bug-inventory.json` modified
- [ ] No changes to apps/stock-price/ or other zones

## Implementation Guidance

1. **Baseline source:** Macro-indicators pilot (completed 2026-05-23) recorded `baselineCycleCount=1.5` (from TA pilot carryover). If stock-price has no history, inherit 1.5.
2. **Fallback:** If `baselineCycleCount` field does not exist in bug-inventory.json root, create it with value 1.5 (system-wide average).
3. **File path:** `docs/data/bug-inventory.json` (gitignored but with explicit -f staging if modified)
4. **Forbidden reads:** do NOT read or modify bug details for other services; focus on stock-price only

## Handoff File Output

**File:** `docs/data/bug-inventory.json` (existing file, appended or updated)

**Modification structure:**
```json
{
  "_maintained_by": "system-auditor",
  "baselineCycleCount": 1.5,
  "_note": "System-wide average fix cycles. Per-service overrides below.",
  "technical_analysis": { ... },
  "macro_indicators": { ... },
  "stock_price": {
    "baselineCycleCount": 1.5,
    "source": "system-wide-fallback (no stock-price bugs in 60d window)",
    "scanWindow": "2026-03-25..2026-05-24",
    "bugsFound": 0,
    "notes": "Inherited from macro-indicators pilot (1.5); stock-price has no recorded bugs in past 60 days. G10 threshold for Phase 2 bug-injection will use 1.5 cycles as max acceptable."
  }
}
```

## Constraints

- **L84 explicit-file staging:** `git add -f docs/data/bug-inventory.json` (json file, gitignored)
- **No source code changes:** read-only scan of git log + notebooks
- **No git push:** local-only
- **Anchor held:** no tag/rewrite
- **Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §Baseline Metric Capture

## Hard Gates

- [ ] **Valid JSON:** `jq . docs/data/bug-inventory.json` exits 0
- [ ] **stock_price entry present:** baselineCycleCount field ≥ 1.0

## RETURN Block

**Signal to emit:** docs/signals/pm-p0-sp2-bug-inventory-entry-complete-<UTC>.json
- Status: DONE
- stock_price baselineCycleCount: 1.5 (or measured value if bugs found)
- bugsFound: 0 (or count)
- JSON valid: yes
- Next task: PM waits for all 6 Phase 0 deliverables before exit gate

**Expected timeline:** 2026-05-24 (same-day delivery, system-auditor)
