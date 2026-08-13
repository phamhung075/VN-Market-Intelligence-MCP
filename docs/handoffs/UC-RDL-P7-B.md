---
sprint: UC-RDL-P7
branch: null
size: M
zone: developer/
depends_on: []
blocks: ["UC-RDL-P7-A"]
---

## TLDR
Create canonical `§ Branch Policy` section in `docs/policies/commit-convention.md` establishing main-only invariant, worktree-isolation carve-out, and post-commit hygiene checklist. Every agent-flow pointer in Group A references this section; Group B must land first (tier1) before Group A can land (tier2). Zero runtime behavior changes; pure policy documentation reconciliation.

## [PM] Planning Context

- **Zone:** developer/ (policy/reference docs)
- **Group:** B (tier1 of 2-group decomposition, Group A depends_on this)
- **Acceptance Criteria:**
  - [ ] FR-1: `docs/policies/commit-convention.md` new `## Branch Policy` section inserted (sibling to `## Type Vocabulary` section, before `## Scope Rules`), containing: (a) main-only invariant prose; (b) worktree-isolation carve-out with cite to `scripts/fleet-worktree-push.sh` + `.claude/settings.json` precedent; (c) post-commit hygiene 4-step checklist (no branch-delete step)
  - [ ] FR-12: `docs/policies/dev-standards.md` § Branch Hygiene rewritten in place (heading kept), dropping step-3 branch-delete, rewording step 4a (unconditional pre-merge gate, not branch-delete-adjacent), repointing `.claude/WORKFLOW.md#branch-hygiene-checklist` to new SSOT location
  - [ ] FR-12: `docs/policies/dev-standards.md` § Parallel Agent Dispatch — add one clarifying clause to `isolation: "worktree"` row: detached-at-`HEAD`, never named branch; cite `scripts/fleet-worktree-push.sh`
  - [ ] FR-13: `.claude/WORKFLOW.md` "Agent Chain" table row `"Code on task/NNN-* branch"` → `"Code committed to main"`, full "## Branch Hygiene" section collapsed to one-line pointer to `commit-convention.md § Branch Policy`
  - [ ] FR-13: `docs/references/bundles/bundle-developer.md` `## Branch Hygiene` section (lines 90-101) collapsed to one-line pointer
  - [ ] FR-13: `docs/references/bundles/bundle-qa.md` `## Branch Delete Commands` section (lines 87-91) → one-line pointer, heading dropped
  - [ ] All pointers in files above use consistent wording: `Full policy → docs/policies/commit-convention.md § Branch Policy`
  - [ ] Decision journal entry written (task_id: UC-RDL-P7-B, reason: NFR-1 SSOT tier1, prerequisite to Group A)
  - [ ] No intruder files in git status (verify commit zone: developer/)
  
- **Files to read first:**
  - `docs/handoffs/UC-RDL-P7-BA-spec.md` — BA spec, NFR-1 (SSOT requirement) + FR-1/FR-12/FR-13 detailed
  - `docs/architecture-briefs/2026-08-13-uc-rdl-p7-branch-policy-reconciliation.md` — §2 (FR-1 template content), §13 (FR-12/13 rewrites)
  - `docs/policies/commit-convention.md` — read existing sections to understand placement
  - `docs/policies/dev-standards.md` § Branch Hygiene + § Parallel Agent Dispatch — current state before rewrite
  
- **Files to create:** None (all rewrites in-place)

- **Files to modify:**
  - `docs/policies/commit-convention.md` — add new `## Branch Policy` section (architect spec §2 exact prose)
  - `docs/policies/dev-standards.md` — rewrite § Branch Hygiene (lines 1523-1534), add clause to § Parallel Agent Dispatch (lines 1507-1519)
  - `.claude/WORKFLOW.md` — rewrite "Agent Chain" row + "## Branch Hygiene" section
  - `docs/references/bundles/bundle-developer.md` — collapse `## Branch Hygiene` section
  - `docs/references/bundles/bundle-qa.md` — collapse `## Branch Delete Commands` section

- **Dependencies:** None (tier1, no blockers)

- **Knowledge needed:** 
  - `docs/handoffs/UC-RDL-P7-BA-spec.md` (NFR-1 context)
  - `docs/architecture-briefs/2026-08-13-uc-rdl-p7-branch-policy-reconciliation.md` (§2, §13, §18 coordination note)
  - `docs/policies/dev-standards.md` (existing policy docs)
  - Commit discipline: `docs/policies/commit-convention.md` (commit-format requirement for this sprint itself)

---

## Implementation Note

**Coordination:** This task creates the canonical SSOT (`§ Branch Policy` section) that Group A (UC-RDL-P7-A) will repoint all flow docs to reference. Group A cannot land until this section exists and is committed to `main`. Both groups must land in the same sprint cycle, but Group B strictly precedes Group A (see task_board depends).

**Sibling hook warning:** The FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR hook (READY, next_agent:pm) must not ship enforcing before Group A's VERIFY-line edits land, or M/L developer tasks will fail. Once both land, the hook and flow docs are in agreement by construction. (See architect brief §18 for full detail.)

**Testability:** No runtime test — grep-based regression (see architect brief §19).
