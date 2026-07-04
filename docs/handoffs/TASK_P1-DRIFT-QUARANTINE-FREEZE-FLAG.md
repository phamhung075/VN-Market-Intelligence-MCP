---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-DRIFT-QUARANTINE-FREEZE-FLAG
size: XS
zone: docs/data/
depends_on: []
blocks: []
---

## TL;DR
Quarantine the recurringBugEscalationFlag field in docs/data/project-stats.json by adding `_maintained_by: "DEPRECATED — see RC-CONVERGE machine-owned freeze flag (Phase 2)"` comment. No deletion yet; just mark as dead so new code doesn't trust it.

## [PM] Planning Context

**Zone:** docs/data/

**Target:** `docs/data/project-stats.json` `recurringBugEscalationFlag`/`escalationReason` fields

**Mechanism:** Quarantine only in this phase — add `_maintained_by: "DEPRECATED — see RC-CONVERGE machine-owned freeze flag (Phase 2)"` so nothing new starts trusting a field already proven to have zero readers. Full redesign (RC-CONVERGE) is Phase 2's job, not duplicated here.

**Files to read first:**
- `docs/data/project-stats.json` (current structure, recurringBugEscalationFlag location)
- Memory note on `recurringBugEscalationFlag` usage (confirm zero readers via grep)

**Files to modify:**
- `docs/data/project-stats.json` — Add deprecation marker to recurringBugEscalationFlag

**Files to create:**
- None

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md`

**Acceptance Criteria (machine-checkable):**

1. `grep -rn "recurringBugEscalationFlag" . --include="*.ts" --include="*.md" --include="*.sh"` returns zero readers (or only historical comments)
2. `docs/data/project-stats.json` contains `_maintained_by: "DEPRECATED..."` marker on recurringBugEscalationFlag
3. No code is broken by the marker addition (JSON schema still valid)

