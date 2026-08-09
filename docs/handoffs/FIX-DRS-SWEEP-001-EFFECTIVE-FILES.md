---
sprint: FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
branch: task/FIX-DRS-SWEEP-001-effective-files
size: XS
zone: cross-service/
depends_on: []
blocks: [FIX-DRS-SWEEP-002-CLASSIFIER]
---

## TLDR
Add a new `effective_files` predicate to the shared library `scripts/lib/devteam-eligibility.jq`. This predicate resolves file lists with detail-first/board-fallback semantics (matching the existing `effective_owner`/`effective_next_agent` pattern), required for the board-drain classifier's file-scope safety checks.

## [PM] Planning Context

- **Zone:** cross-service/
- **Acceptance Criteria:**
  - [ ] New `effective_files($detail_items)` predicate added to `scripts/lib/devteam-eligibility.jq`
  - [ ] Predicate matches the brief's §2.2 implementation exactly (detail-first, board-fallback, empty-files conservative default)
  - [ ] Unit testable: verified against the 5 live spot-check rows documented in brief §2.2 (2 with empty files, 1 spanning owned+non-owned, 1 with supervised:true, 1 normal)
  - [ ] No new dependencies introduced
  - [ ] Consistent naming/style with existing `effective_*` predicates in the file

- **Files to read first:**
  - `docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md` §2.2 (predicate spec)
  - `scripts/lib/devteam-eligibility.jq` (existing `effective_owner`/`effective_next_agent` pattern reference)
  - `scripts/lib/po-manual-dispatch-eligibility.jq` (similar library conventions)

- **Files to create:** None

- **Files to modify:**
  - `scripts/lib/devteam-eligibility.jq` — add `effective_files` definition

- **Dependencies:** None

- **Knowledge needed:**
  - `docs/architecture-briefs/2026-08-09-agent-father-board-drain-and-ops-batch-widen.md` § 2.2-2.3 (spec, classifier use-case)
  - jq string/array operations and `type` introspection
  - Understanding of detail-first/board-fallback semantics already used in this library

**Note:** This is a pure library addition with no flow changes or live data mutations. The brief's §7 step 1 acceptance is "unit-testable against the 5 live spot-check rows" — manual verification against those real rows (from the task board) is the AC.

---

## RETURN
Task specification ready for developer. Blocking: FIX-DRS-SWEEP-002-CLASSIFIER (classifier uses this predicate).
