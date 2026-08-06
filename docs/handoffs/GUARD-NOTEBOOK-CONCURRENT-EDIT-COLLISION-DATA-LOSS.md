---
sprint: DEVTEAM-20260806
branch: fix/notebook-concurrent-edit-guard
size: S
zone: cross-service/
priority: P1
depends_on: []
blocks: []
assignee_next_agent: pm
---

## TLDR
Concurrent notebook .md writes (Edit + full-doc Write) collide, destroying peer sections. Implement a collision-safe append primitive and read-before-write guard to preserve concurrent agent updates.

## [PM] Planning Context
- **Zone:** cross-service/ (affects PM + all agent notebooks)
- **Occurrence 2 this tick:** qa.md lost cycle-522/523 entries to Write full-overwrite; prior was tran-ngoc-bau.md via Edit collision
- **Acceptance Criteria:**
  - [ ] PM-safe append primitive (no full-doc overwrite, only scoped sections)
  - [ ] Write-guard detects peer edits in progress (CAS on mtime/checksum)
  - [ ] Verify qa.md + all agent notebooks survive parallel Agent+Router writes
- **Files to modify:**
  - `docs/policies/notebook-write-contract.md` (define primitive)
  - PM notebook + all agent notebook writers (enforce guard)
- **Dependencies:** none; coordinated multi-agent fix
- **Knowledge needed:** `.claude/skills/notebook-append-primitive/SKILL.md`

## Routing
**PM handles this one** — cross-service + notebook coordination is PM responsibility.
