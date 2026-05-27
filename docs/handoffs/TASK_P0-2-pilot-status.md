---
sprint: pilot-p0
branch: task/p0-2-pilot-status
size: S
zone: docs/data/
depends_on: []
blocks: []
pilot: technical-analysis
phase: 0
---

## TLDR
Create `docs/data/pilot-status.json` as the single source of truth for tracking all 12 pilot goals (G1-G12). Initialize all goals to `TBD` state. This file will be read by the PO flow to gate Phase 0 → Phase 1 transition and to track the decision matrix verdict.

## [PM] Planning Context
- **Zone:** `docs/data/`
- **Acceptance Criteria:**
  - [ ] File `docs/data/pilot-status.json` created with charter-specified schema
  - [ ] All 12 goals (G1-G12) initialized to `TBD` state
  - [ ] `decisionMatrix` fields (speed, trust, scale) all initialized to `TBD`
  - [ ] `status` field set to `ACTIVE`
  - [ ] `sprintKickoff` and `sprintDeadline` fields populated (PO will fill in actual sprint numbers at kickoff)
  - [ ] File is valid JSON and conforms to charter §Status Tracking schema
- **Files to read first:**
  - `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §Status Tracking (minimum schema provided)
- **Files to create:**
  - `docs/data/pilot-status.json` (SSOT for pilot goal tracking)
- **Files to modify:** None
- **Dependencies:** None
- **Knowledge needed:**
  - Charter: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §Status Tracking
  - Valid goal states: `TBD | IN-PROGRESS | YES | NO`
  - Valid status values: `ACTIVE | DONE | FAILED`

## Details
This task is **owned by architect** because it initializes the specification contract for the pilot. The file is read by the PO flow to determine whether all 12 goals have been verified before scaling to the next microservice.

The file must be checked into git at the end of Phase 0 so that the PO gate can lazy-load it without risk of stale state.

The `sprintKickoff` and `sprintDeadline` fields can be left as example strings (e.g., "TBD") or filled with placeholder sprint numbers by the PO at kickoff time.

## RETURN block
When task is complete:
```
DONE: docs/data/pilot-status.json created
  - Pilot: technical-analysis
  - Charter version: 1.0
  - Status: ACTIVE
  - Goals: 12 (all TBD)
  - Decision matrix: speed/trust/scale (all TBD)
FILES:
  - docs/data/pilot-status.json
NEXT: po
```
