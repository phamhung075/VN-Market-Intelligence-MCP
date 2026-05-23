---
task_id: "P0-SP-4"
pilot: "stock-price"
phase: "0"
title: "Set anchor commit + update pilot-status SSOT (PM)"
estimate: "1h"
owner: "pm"
status: "READY"
date: "2026-05-24"
---

# TASK P0-SP-4 — Anchor Commit + SSOT Update

## Summary

PM records the Phase 0 anchor commit SHA in the stock-price pilot SSOT (`docs/data/pilot-status-stock-price.json`). This frozen anchor commit becomes the baseline for all subsequent phase-0 and phase-1 contract enforcement (G4 fence freeze, pre-revert tags, etc.).

Per charter §Constraints, once an anchor is frozen, no rewriting, retags, or force-pushes are allowed on the anchor or any of its descendants.

## Acceptance Criteria

### AC-1: Current commit SHA recorded
- [ ] Run: `git rev-parse HEAD` → capture SHA (e.g., `a1b2c3d4`)
- [ ] This is the anchor commit (Phase 0 baseline, all G4/G5/G10 contracts measured from here)
- [ ] Record in task RETURN block: `anchor_sha="a1b2c3d4"`

### AC-2: Update pilot-status SSOT
- [ ] Open `docs/data/pilot-status-stock-price.json`
- [ ] Locate field: `root.anchor` (currently "TBD")
- [ ] Set: `"anchor": "<SHA from AC-1>"`
- [ ] Also set: `root.phase0.exit_gate.verification_commit_sha_architect` = same SHA (for architect signal reference)
- [ ] Verify: JSON still valid after edit: `jq . docs/data/pilot-status-stock-price.json` exits 0

### AC-3: Record anchor in PM notebook
- [ ] Update `docs/agent-memory/notebooks/pm.md` 
- [ ] Add entry to current cycle section (e.g., "c282 cycle-XX"):
  ```
  **Anchor Set:** P0-SP-4 anchored commit [SHA] at Phase 0 open gate. 
  Frozen until Phase 0 close (architect verification signal). 
  All G4/G5/G10 contracts measured from this anchor forward.
  ```

### AC-4: No source code changes
- [ ] Verify `git diff --stat` shows only:
  - `docs/data/pilot-status-stock-price.json` (1 anchor field)
  - `docs/agent-memory/notebooks/pm.md` (1 cycle entry)
- [ ] No changes to any app code or flows

### AC-5: Anchor verification
- [ ] Run: `git merge-base --is-ancestor <anchor-sha> HEAD` (exit 0 = anchor is ancestor of HEAD, valid)
- [ ] This confirms anchor is in the commit chain and valid for future ancestor checks

## Implementation Guidance

1. **Timing:** Run after all other Phase 0 tasks are DONE (brownfield, bug-inventory, agent-flow)
2. **SHA capture:** Use `git rev-parse HEAD` (current working directory)
3. **SSOT path:** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/pilot-status-stock-price.json`
4. **Staging:** `git add docs/data/pilot-status-stock-price.json docs/agent-memory/notebooks/pm.md` (explicit per L84)
5. **Anchor discipline:** Once committed, this SHA is FROZEN. No force-push, no retags, no rewriting.

## Handoff File Output

**Files modified:**
- `docs/data/pilot-status-stock-price.json` (root.anchor field + phase0.exit_gate.verification_commit_sha_architect)
- `docs/agent-memory/notebooks/pm.md` (cycle entry)

**SSOT update (example):**
```json
{
  "anchor": "a1b2c3d4e5f6g7h8",
  "phase0": {
    "exit_gate": {
      "verification_commit_sha_architect": "a1b2c3d4e5f6g7h8"
    }
  }
}
```

## Constraints

- **L84 explicit-file staging:** 2 files (JSON + markdown)
- **No code changes:** SSOT/notebook only
- **No git push:** local-only
- **Anchor frozen:** Once this commit is made, no rewrites forward
- **Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §Constraints (anchor discipline)

## Hard Gates

- [ ] **SHA recorded:** anchor field in SSOT is non-TBD and 40-char hex
- [ ] **JSON valid:** `jq . docs/data/pilot-status-stock-price.json` exits 0
- [ ] **Ancestor check:** `git merge-base --is-ancestor <sha> HEAD` exits 0

## RETURN Block

**Signal to emit:** docs/signals/pm-p0-sp4-anchor-commit-complete-<UTC>.json
- Status: DONE
- anchor_sha: [40-char hex]
- JSON valid: yes
- Ancestor check: PASS
- Next task: PM waits for all 6 Phase 0 deliverables before exit gate

**Expected timeline:** 2026-05-24 (same-day delivery, PM)
