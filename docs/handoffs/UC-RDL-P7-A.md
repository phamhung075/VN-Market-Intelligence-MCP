---
sprint: UC-RDL-P7
branch: null
size: L
zone: agent-father/
depends_on: ["UC-RDL-P7-B"]
blocks: []
---

## TLDR
Repoint all 20 agent-flow files (developer/microservice/dev-frontend/qa/fixer/pm/dev-team flow docs, 10× agent init.md, po/flow/main.md, dispatch/SKILL.md) to reference the canonical `§ Branch Policy` section from UC-RDL-P7-B, and strip all in-flow branch-creation/checkout/merge/delete mechanics. Creation half (FR-2/3/4): verify on main, clean tree (no branch checkout step). Merge half (FR-7): replace pipeline checkout/merge with no-op affirmation + lighter QA checks. Retire CLEAN workflow (FR-7(c)/FR-10/FR-14). One atomic wave — NFR-2 straddle risk (creation-half + merge-half spanning Developer→QA handoff) confined entirely inside Group A; splitting it would reintroduce the hazard this sprint closes.

## [PM] Planning Context

- **Zone:** agent-father/ (docs/agents/**, .claude/skills/**, docs/agents/po/flow/main.md)
- **Group:** A (tier2 of 2-group decomposition, depends_on UC-RDL-P7-B; must land as ONE atomic wave)
- **Acceptance Criteria:**
  - [ ] FR-2: `docs/agents/developer/flow/main.md` — Output/Produces s/task/NNN-\*/main, line 53 SUPERSEDED marker → clean instruction + pointer to § Branch Policy, RETURN s/branch task/NNN//, worktree isolation language untouched
  - [ ] FR-3: `docs/agents/developer/flow/microservice-main.md` — Output/Receives/Produces/Hand-off s/task/NNN-\*// , line 39 "three-branch" verified (BUILD-STANDARD conditional, not git branches), pre-code checklist line 58-61 → "verify on main, clean tree" block, RETURN s/branch task/NNN//
  - [ ] FR-4: `docs/agents/dev-frontend/flow/main.md` — identical edits to FR-3 (separate file, independent 3rd copy)
  - [ ] FR-5: `docs/agents/developer/flow/doc-review.md` line 13 `git diff --name-only task/NNN...HEAD` → commit-range from handoff's Implementation Record, reusing qa/flow/main.md § Direct-Commit Verify pattern
  - [ ] FR-6: All 10 init.md files (developer, fixer, qa, dev-mcp-server, dev-stock-price, dev-technical-analysis, dev-api-gateway, dev-rag-service, dev-pdf-extractor, dev-alert-engine) — single find-and-verify: `input: [TASK_NNN.md, task/NNN branch]` → `input: [TASK_NNN.md, commits on main]`
  - [ ] FR-7(a): `docs/agents/qa/flow/main.md` Input/Role (lines 7, 36-38) s/branch task/NNN-\*// , DELETE "Step-2 CLEAN spawn" row + "CLEAN workflow" line from Role section
  - [ ] FR-7(b): `docs/agents/qa/flow/main.md` pipeline first line `git checkout task/NNN-kebab-description` → `git branch --show-current # must read main`, unchanged checks (bun test, tsc, 2× DDD-grep, 2× secret-grep, mock-guard); approval merge block `git checkout main / git merge --no-ff / worktree-remove-by-branch / git branch -d / git push --delete` → `git branch --show-current # must read main` + `git push origin main` (drop worktree-remove-by-branch, covered by post-commit hygiene)
  - [ ] FR-7 RETURN s/merged/committed/, s/branch deleted//
  - [ ] FR-8: `docs/agents/fixer/flow/main.md` Receives s/same task/NNN-\* branch/same commit(s)/, Hand-off s/re-spawns qa.*same branch/re-spawns qa/, line 60 s/git status \| grep task\//git branch --show-current — confirm reads main; git status --short clean/, RETURN s/pipeline on branch task/NNN/pipeline/
  - [ ] FR-9: `docs/agents/pm/flow/main.md` Handoff Triggers table s/Code on task/NNN-\*/Code committed to main/, handoff YAML template DROP `branch: task/NNN-kebab-name` field entirely (not rename, DELETE), Step-5 Monitor text s/review Task NNN branch task/NNN-kebab/review Task NNN (commits on main)/, RETURN text s/branch task/NNN//
  - [ ] FR-10: `docs/agents/dev-team/flow/main.md` Step 2 Planning table DELETE the `| CLEAN | ...` row, DELETE entire `**S4 CLEAN dispatch:**` block (lines 1013-1034), Closeout checklist s/Branch deleted by QA post-merge//, HARD PREREQUISITE paragraphs (~721/767/824) reworded to state now-universal main-only precondition (not contrast `branch:null` vs normal rows), drop stale branch-existence language
  - [ ] FR-11: `.claude/skills/dispatch/SKILL.md` line 74 table s/branch merged/commits on main verified/
  - [ ] FR-14: `docs/agents/po/flow/main.md` line 21 Produces drop `CLEAN` from `type ∈ {...}` enum, line 25 Priority order s/CLEAN →//, DELETE line 27 CLEAN triage classification entirely, line 59 context-check re-verify whether "branch workflow" still refers to CLEAN-only (flag for implementation if ambiguous, do NOT pre-judge)
  - [ ] All FR-2..FR-11 files carry consistent "verify on main, clean tree" replacement text (single idiom, 3 call sites: FR-2/3/4)
  - [ ] All files repoint to SSOT: `Full policy → docs/policies/commit-convention.md § Branch Policy` (where applicable)
  - [ ] Decision journal entry written (task_id: UC-RDL-P7-A, reason: atomicity requirement NFR-2, coordination note on sibling hook)
  - [ ] No intruder files in git status (verify commit zone: agent-father/ per CLAUDE.md dispatch table)

- **Files to read first:**
  - `docs/handoffs/UC-RDL-P7-BA-spec.md` — §4 mandatory coordination note (sibling hook FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR sequencing)
  - `docs/architecture-briefs/2026-08-13-uc-rdl-p7-branch-policy-reconciliation.md` — §3..§15 (FR-2 through FR-14 detailed edit shapes), §18 sibling hook coordination (mandatory read before RETURN)
  - Live flow files listed in Files to Modify below — read one instance of each edit pattern before generalizing

- **Files to create:** None (all rewrites in-place)

- **Files to modify:** (20 files total, agent-father zone)
  - `docs/agents/developer/flow/main.md` (FR-2)
  - `docs/agents/developer/flow/microservice-main.md` (FR-3)
  - `docs/agents/dev-frontend/flow/main.md` (FR-4)
  - `docs/agents/developer/flow/doc-review.md` (FR-5)
  - `docs/agents/developer/init.md` (FR-6)
  - `docs/agents/fixer/init.md` (FR-6)
  - `docs/agents/qa/init.md` (FR-6)
  - `docs/agents/dev-mcp-server/init.md` (FR-6)
  - `docs/agents/dev-stock-price/init.md` (FR-6)
  - `docs/agents/dev-technical-analysis/init.md` (FR-6)
  - `docs/agents/dev-api-gateway/init.md` (FR-6)
  - `docs/agents/dev-rag-service/init.md` (FR-6)
  - `docs/agents/dev-pdf-extractor/init.md` (FR-6)
  - `docs/agents/dev-alert-engine/init.md` (FR-6)
  - `docs/agents/qa/flow/main.md` (FR-7)
  - `docs/agents/fixer/flow/main.md` (FR-8)
  - `docs/agents/pm/flow/main.md` (FR-9)
  - `docs/agents/dev-team/flow/main.md` (FR-10)
  - `.claude/skills/dispatch/SKILL.md` (FR-11)
  - `docs/agents/po/flow/main.md` (FR-14, architect-discovered)

- **Dependencies:** UC-RDL-P7-B (tier1) must be committed to `main` before this task starts implementation

- **Knowledge needed:**
  - `docs/handoffs/UC-RDL-P7-BA-spec.md` (§4 coordination, full context)
  - `docs/architecture-briefs/2026-08-13-uc-rdl-p7-branch-policy-reconciliation.md` (§0 three open calls, §1-15 all FR details, §18 sibling hook sequencing — MANDATORY before RETURN)
  - `docs/policies/commit-convention.md § Branch Policy` (the canonical SSOT this task points all flow docs to)
  - Commit discipline: `.claude/skills/commit-boundary/SKILL.md` (agent-father zone enforcer)

---

## Implementation Note

**Critical atomicity requirement (NFR-2):** This task MUST land as one atomic commit/PR. The creation-half (FR-2/3/4/6/14) and merge-half (FR-7) span the Developer→QA handoff chain; a partial land (e.g. FR-2/3/4 alone without FR-7) reproduces the exact "Developer commits to main, QA still tries git checkout task/NNN-*" wedge that the PO ruling warned against. Once both halves land, the chain is coherent by construction.

**Sibling hook coordination (§18 architect brief):** The `FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR` hook (READY, `next_agent: pm`) must land before or in the same wave as Group A's VERIFY-line edits (FR-2/3/4), OR that hook must start in `MODE=warn` until Group A lands. Shipping the hook enforcing after this task launches (but before it lands) will break every M/L developer task's VERIFY line. PM must orchestrate the sequencing. After both land, no further coordination needed — the hook and flow docs will be in agreement by construction (both expect `main`).

**FR-7(b) depth distinction (§0 architect verdict):** Keep both `pipeline`/`verify-committed` entry points with their different check depths (pipeline: fresh code full sweep; verify-committed: already-shipped re-verify). Strip only the git-mechanics (checkout/merge/branch-delete), NOT the check *content* — do not collapse the entry points. This is the distinction architect ratified after noting EC-4 (zero runtime behavior changes).

**EC-3 ordering note:** HARD PREREQUISITE paragraphs in FR-10 (dev-team/flow/main.md, lines ~721/767/824) reword after FR-7(b) is finalized (here). They reference the old "branch:null vs normal row" contrast; once pipeline no longer requires checkout, that contrast becomes stale. Simplify to main-only precondition language (see architect brief §11 example rewording).

**Test strategy:** Pure documentation change — no `bun test`/`tsc` surface. Verify by (1) full end-to-end read of edited qa/flow/main.md pipeline/approved sections (§19 architect brief), (2) grep for `task/NNN` in all 20 files — should return zero hits in live prose (historical markers already cleaned in FR-2, so none remain), (3) spot-check line-by-line one edit from each pattern (FR-2 vs FR-3 vs FR-4 consistency, FR-7 pipeline/approved blocks, FR-10 HARD PREREQUISITE rewording).
