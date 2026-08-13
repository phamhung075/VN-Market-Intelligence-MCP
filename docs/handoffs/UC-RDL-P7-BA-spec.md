# BA Spec — UC-RDL-P7 STEP2 (branch-policy reconciliation, full lifecycle, main-only)

**Task:** `UC-RDL-P7` · P1 · SPRINT-M · zone `multi` · supervised:false (STEP1 po-gate resolved 2026-07-17)
**BA date:** 2026-08-12
**po_decision_ref:** `docs/agent-memory/decisions/2026-07-17-UC-RDL-P7-branch-policy-main-only.md` — ruling: DROP the worktree/task-branch exception, main-only invariant wins.
**Verdict:** Spec complete. **Zero PO blockers.** STEP1 already answered the only PO-level question (keep vs drop the exception). **NEXT: architect.**

---

## 0. What changed since the 2026-07-12 audit / 2026-07-17 ruling (re-verified live, not assumed)

1. `docs/agents/developer/flow/main.md` received a **partial** self-heal on 2026-08-05: pre-code checklist step 2 (line 53) is marked `SUPERSEDED` with a pointer to the `NO branches` invariant. This is the **only** file of the whole inventory that has moved at all — every other file below is untouched since the 07-12 audit / 07-17 ruling.
2. A **sibling row already did independent, deeper discovery** on 2026-07-31: `FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR` (`READY`, `next_agent: pm`, architect brief `docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md`). That brief independently grep-confirmed the same 5-file branch-creation/merge core this spec covers, live-tested a `post-checkout` hard-revert-to-`main` git hook as the **mechanical backstop**, and flagged **in writing** that shipping that hook with zero coordination will break `developer/main.md` + `developer/microservice-main.md`'s own `VERIFY: git branch --show-current must equal task/NNN-kebab-description` line — the exact same "wedges the chain if only one half moves" hazard this row's own note warns about, reproduced through a hook instead of mixed doc state. **This is not a duplicate — it is the mechanical enforcement layer for the policy this spec rewrites; §4 Coordination below is mandatory reading for architect and PM.**
3. Two more copy-paste sites were found this cycle that neither the 07-12 audit nor the 07-31 brief named: `docs/agents/dev-frontend/flow/main.md` (an **independent third copy** of the developer branch-checkout logic, distinct from `microservice-main.md`) and `docs/references/bundles/bundle-developer.md` / `bundle-qa.md` (orphaned "single-load bundle" docs that literally re-paste the Branch Hygiene delete-commands — zero live consumer references them from any `init.md`, confirmed by repo-wide grep).
4. `.claude/WORKFLOW.md` is a **4th competing home** for branch/commit policy (its own "Agent Chain" + "Handoff Triggers" table + a full "Branch Hygiene" section) that nothing in `docs/agents/` loads as knowledge — `docs/policies/dev-standards.md` is the only live pointer to it (`§Branch Hygiene` → `.claude/WORKFLOW.md#branch-hygiene-checklist`). It independently drifted from both `dev-standards.md` and `commit-convention.md` and must fold into the same single source this row creates, not stay a silent 4th copy.

Full grep-verified file inventory (21 files touching `task/NNN`/branch-merge/branch-hygiene text, repo-wide, excluding `archive/`, `handoffs/`, `decisions/`, `architecture-briefs/`, notebooks — historical records, not live flow docs) is folded into the FRs below.

---

## 1. DDD layer mapping

**Interface layer** (agent-to-agent dispatch protocol — 100% of this sprint's edit surface; these are prose contracts between agent flows, the direct analogue of an interface/API contract in code):
- All 21 files in §3 below (agent `flow/main.md`, `init.md`, `.claude/skills/dispatch/SKILL.md`, `docs/policies/dev-standards.md`, `.claude/WORKFLOW.md`, `docs/references/bundles/*.md`).

**Infrastructure layer** (read-only evidence this sprint relies on but does **not** edit — flag to architect only if a chosen mechanism needs one of these to change):
- `scripts/fleet-worktree-push.sh` — already the live, working precedent for "worktree isolation without a named branch, pushed straight to `main`" (detached HEAD, linked worktree only, never the primary working dir). This is the pattern any surviving worktree-isolation prose should point to, not re-derive.
- `.claude/settings.json` `.worktree.baseRef: "head"` — confirms the platform-level worktree mechanism already bases off `HEAD`, not a named branch; no runtime/settings change needed.
- `scripts/git-hooks/post-checkout` (not yet shipped — sibling row's own deliverable, `developer` zone) — this row's edits must not assume its existence, but must be sequenced against its rollout (§4).

**Domain layer:** none. Zero market-data/business logic touched.

---

## 2. Requirements

### NFR-1 — Single canonical source (SSOT), everything else is a pointer
**DDD:** interface
The reconciled branch/commit policy text lives in **exactly one place**: `docs/policies/commit-convention.md`, as a new `## Branch Policy` section (sibling to its existing `## Format`/`## Type Vocabulary` sections). Content, at minimum: (a) the main-only invariant — no `task/NNN-*` or any other named branch is ever created in the shared/primary working directory; (b) the worktree-isolation carve-out per the PO ruling — when genuinely needed for disjoint-zone parallel dispatch, a worktree runs **detached at `HEAD`** (never a named branch) and pushes back to `main` via `scripts/fleet-worktree-push.sh` (cite it as the working precedent, do not re-describe its mechanics); (c) the post-merge hygiene checklist (verify on `main`, clean tree, remove worktrees, drop stashes — **no branch-delete step**, since none is ever created). Every other file in §3 becomes a **pointer** to this section (`Full policy → docs/policies/commit-convention.md § Branch Policy`), never a re-paste. This mirrors the existing, already-correct precedent in `dev-standards.md § Commit Format` (`"Full spec → docs/policies/commit-convention.md"`) — apply the identical pattern to Branch Hygiene, which currently does the opposite (re-describes + points to a 4th competing copy, `.claude/WORKFLOW.md`).

### NFR-2 — Both halves land together, same commit/session
**DDD:** interface
Per the PO ruling's explicit warning: editing the branch-**creation** half (developer/microservice/dev-frontend) without the QA-**merge** half (qa/flow/main.md) in the same landing wedges the Developer→QA handoff (developer commits straight to `main`, QA still tries `git checkout task/NNN-*` against a branch that was never created). FR-2/3/4/5/6 (creation half) and FR-7 (merge half) — plus FR-8/9/10/11 (fixer/pm/dev-team/dispatch, all of which reference the same branch field/language) — are one atomic edit set. Do not ship a subset that leaves any hop of Developer→QA→PM→dev-team straddling two policies.

### FR-1 — Write the canonical Branch Policy section
**DDD:** interface — `docs/policies/commit-convention.md`
New `## Branch Policy` section per NFR-1's content list. This is the FR that makes NFR-1 concrete; every other FR below repoints to it instead of describing branch policy locally.

### FR-2 — Finish `docs/agents/developer/flow/main.md` reconciliation
**DDD:** interface
Line 53's `SUPERSEDED` marker (2026-08-05 partial self-heal) is a historical annotation, not a clean rewrite — replace with a direct pointer to FR-1's section. Also fix the **un-healed** lines: `Output`/`Produces` (lines 15, 29) still read `"Code + tests on task/NNN-* branch"` → `"Code + tests committed to main"`; `Composes with` (line 27) keeps `isolation: "worktree"` language unchanged (still valid — worktrees survive, only the named-branch-inside-them is dropped); RETURN (line 157) drops `"on branch task/NNN-kebab"`.

### FR-3 — `docs/agents/developer/flow/microservice-main.md` full reconciliation
**DDD:** interface
Untouched since the audit — the **full** checkout/creation logic is still live: lines 12, 21, 24-26 (Output/Receives/Produces/Hand-off all describe branch flow), 39 ("three-branch dispatch" heading needs a name check — verify it refers to a BUILD-STANDARD tag, not literal git branches, before editing wording), 55-61 (`git checkout task/NNN-kebab-description` / `git checkout -b` / `VERIFY: git branch --show-current must equal task/NNN-kebab-description`) → `verify on main + clean tree` per FR-1's checklist, 165 (RETURN). Every `dev-<service>` zone agent (dev-mcp-server, dev-stock-price, dev-technical-analysis, dev-api-gateway, dev-rag-service, dev-pdf-extractor, dev-alert-engine) inherits this file — one edit, seven agents fixed.

### FR-4 — `docs/agents/dev-frontend/flow/main.md` full reconciliation (independent 3rd copy, newly found)
**DDD:** interface
Not named in either the 07-12 audit or the 07-31 sibling brief. Lines 25-27 (Receives/Produces/Hand-off) and 55-57 (identical checkout/create/VERIFY block to FR-3) and 204 (RETURN) — same edit shape as FR-3, applied to this separate file (dev-frontend does not inherit `microservice-main.md`).

### FR-5 — `docs/agents/developer/flow/doc-review.md` diff-base
**DDD:** interface
Line 13: `git diff --name-only task/NNN...HEAD -- apps/<service>/` → an explicit commit-range diff sourced from the handoff's own `[Developer] Implementation Record` commit hash(es) (same evidence source `qa/flow/main.md`'s Direct-Commit Verify entry point already uses for branch:null rows — reuse that pattern, do not invent a second one).

### FR-6 — 10x agent `init.md` flow-catalog input line
**DDD:** interface
Identical line `input: [TASK_NNN.md, task/NNN branch]` in the flow catalog entry of: `developer/init.md`, `fixer/init.md`, `qa/init.md`, `dev-mcp-server/init.md`, `dev-stock-price/init.md`, `dev-technical-analysis/init.md`, `dev-api-gateway/init.md`, `dev-rag-service/init.md`, `dev-pdf-extractor/init.md`, `dev-alert-engine/init.md` → `input: [TASK_NNN.md, commits on main]`. Mechanical, uniform, zero judgment calls — a single find-and-verify pass across all 10.

### FR-7 — QA merge half (`docs/agents/qa/flow/main.md`) — the hard prerequisite this row exists to fix
**DDD:** interface
(a) Input/Role lines 7, 36-38 drop `branch task/NNN-*` language. (b) `pipeline` JUMP-TO's first line (`git checkout task/NNN-kebab-description`, line 115) and the merge block (lines 216-229: `git checkout main` / `git merge --no-ff task/NNN-kebab-description` / worktree-remove / `git branch -d` / `git push origin --delete`) → replace with verification of the Implementation Record's commit hash(es) already on `main` — **this makes `pipeline` structurally identical to the existing `verify-committed` entry point** (§ Direct-Commit Verify, added 2026-07-22 for `branch:null` Review-Lane rows). Architect must decide: collapse `pipeline` into `verify-committed` outright (since after this sprint **every** row is `branch:null`-equivalent — no row is ever on a task branch), or keep both entry points with `pipeline`'s checkout/merge stripped to the same no-op `verify-committed` already performs. Do not invent a third shape. (c) CLEAN workflow (lines 42-43, 54): today deletes stale task branches — after this sprint there are none to delete; repurpose to stale **worktree** cleanup only (`git worktree remove --force` + `git worktree prune`, no `git branch -d`), or flag to architect as fully redundant with `dev-team/flow/main.md`'s own PREFLIGHT T5/T6 worktree GC (if redundant, retiring CLEAN entirely is in scope — architect's call, not BA's).

### FR-8 — `docs/agents/fixer/flow/main.md`
**DDD:** interface
Lines 34, 36 (Receives/Hand-off — "same `task/NNN-*` branch developer used" / "re-spawns qa for full re-run on same branch"), line 60 (`git status | grep task/` — confirm on task branch) → confirm on `main` + clean tree per FR-1, line 110 (RETURN).

### FR-9 — `docs/agents/pm/flow/main.md`
**DDD:** interface
Line 27 (Handoff Triggers table: `"Code on task/NNN-* branch"` → `"Code committed to main"`), line 75 (handoff YAML frontmatter template `branch: task/NNN-kebab-name` — **drop the field entirely**, do not rename it; a `branch:` field in a PM handoff is the literal trigger the sibling row's own evidence names for the `FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE` incident — removing the field is the actual fix, not cosmetic), line 226 (RETURN wording).

### FR-10 — `docs/agents/dev-team/flow/main.md`
**DDD:** interface
Closeout checklist line 1111 (`"Branch deleted by QA post-merge"`) → drop or repoint to FR-1's checklist (no branch ever exists to delete). The Direct-Commit Verify "HARD PREREQUISITE" paragraphs (lines ~721/767/824) that contrast `branch:null` QA-drain rows against "normal" `task/NNN-*` rows become **stale distinctions** once FR-7 lands — every row is `branch:null`-equivalent after this sprint. Simplify that language to state the (now-universal) main-only precondition rather than a contrast that no longer exists; do not delete the section wholesale without architect confirming FR-7's collapse decision first (ordering dependency, not a blocker). Line 1023 (Step-2 CLEAN spawn context, `"spawn qa with branch list"`) → repoint per FR-7(c)'s CLEAN resolution.

### FR-11 — `.claude/skills/dispatch/SKILL.md`
**DDD:** interface
Line 74 table row: `"'.task_board' task status → DONE, branch merged"` → `"'.task_board' task status → DONE, commits on main verified"`.

### FR-12 — `docs/policies/dev-standards.md` § Branch Hygiene + § Parallel Agent Dispatch
**DDD:** interface
§ Branch Hygiene (lines 1448-1459): drop step 3 (`git branch -d task/NNN-*` + push --delete — nothing to delete), reword step 4a (VPS-deploy trigger currently reads "before deleting the task branch" — reword to an unconditional pre-merge-verification gate, not branch-delete-adjacent), replace the `.claude/WORKFLOW.md#branch-hygiene-checklist` pointer (FR-13 retires that target) with a pointer to FR-1's `commit-convention.md § Branch Policy`. § Parallel Agent Dispatch (lines 1432-1444): `isolation: "worktree"` row gains one clarifying clause — worktree isolation is detached-at-`HEAD`, never a named branch (cite `scripts/fleet-worktree-push.sh` as the live precedent per §1 infra note) — content unchanged otherwise (sequential-default, SSOT-file trigger list are untouched, out of this row's scope).

### FR-13 — Retire the orphaned duplicate-SSOT class
**DDD:** interface
`.claude/WORKFLOW.md` (whole file — "Agent Chain" table's `"Code on task/NNN-* branch"` row, full "Branch Hygiene" section) and `docs/references/bundles/bundle-developer.md` (`## Branch Hygiene` section) + `bundle-qa.md` (`## Branch Delete Commands`) are **zero-live-consumer** duplicates (repo-wide grep confirms no `init.md` knowledge-load or flow reference to any of the three). Recommend: repoint each to FR-1's `commit-convention.md § Branch Policy` (one line) rather than delete outright — `WORKFLOW.md` is still linked from `dev-standards.md` (FR-12 removes that link) and the bundle files may still exist as a historical single-load convenience pattern architect should confirm is genuinely dead before deleting wholesale. While touched, sweep the remaining bundle files (`bundle-architect.md`, `bundle-ba.md`, `bundle-fixer.md`, `bundle-pm.md`) for the same stale text — `bundle-architect.md` also contains a `branch` mention per this cycle's grep, not yet read line-by-line.

---

## 3. Full file inventory (21 files, repo-wide grep-verified this cycle, excluding archive/handoffs/decisions/architecture-briefs/notebooks)

| # | File | FR |
|---|---|---|
| 1 | `docs/policies/commit-convention.md` | FR-1 (new section) |
| 2 | `docs/agents/developer/flow/main.md` | FR-2 |
| 3 | `docs/agents/developer/flow/microservice-main.md` | FR-3 |
| 4 | `docs/agents/dev-frontend/flow/main.md` | FR-4 |
| 5 | `docs/agents/developer/flow/doc-review.md` | FR-5 |
| 6-15 | `developer/init.md`, `fixer/init.md`, `qa/init.md`, `dev-mcp-server/init.md`, `dev-stock-price/init.md`, `dev-technical-analysis/init.md`, `dev-api-gateway/init.md`, `dev-rag-service/init.md`, `dev-pdf-extractor/init.md`, `dev-alert-engine/init.md` | FR-6 |
| 16 | `docs/agents/qa/flow/main.md` | FR-7 |
| 17 | `docs/agents/fixer/flow/main.md` | FR-8 |
| 18 | `docs/agents/pm/flow/main.md` | FR-9 |
| 19 | `docs/agents/dev-team/flow/main.md` | FR-10 |
| 20 | `.claude/skills/dispatch/SKILL.md` | FR-11 |
| 21 | `docs/policies/dev-standards.md` | FR-12 |
| — | `.claude/WORKFLOW.md`, `docs/references/bundles/bundle-{developer,qa,architect,ba,fixer,pm}.md` | FR-13 |

---

## 4. Coordination — mandatory reading for architect + PM (not a PO blocker)

`FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR` (`READY`, `next_agent: pm`, `docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md`) ships a `post-checkout` git hook that hard-reverts any non-`main` checkout in the shared/primary working dir. That brief's own §5 routing note explicitly asks PM to coordinate its rollout against **this row** ("accelerate/scope-down UC-RDL-P7 STEP2 to land in the same wave... or sequence the hook to start in `MODE=warn` until that slice lands") — because shipping the hook before FR-2/FR-3's `VERIFY: git branch --show-current must equal task/NNN-kebab-description` lines are removed will make every M/L developer task fail that VERIFY line (the hook will have already reverted `HEAD` to `main` before it runs). **This spec is the "accelerated slice" that brief asked for** — recommend PM sequence developer implementation of FR-2/FR-3/FR-4 (creation half) to land **before or in the same wave as** that hook, or confirm the hook ships `MODE=warn` first. Do not treat the two rows as independent; do not duplicate work — that row's own AC-3 already drew this exact boundary and does not touch any of the 21 files above.

---

## 5. Edge cases

- **EC-1:** `apps/mcp-server` code/tests/hooks are **not** in scope — repo-wide script grep this cycle found zero `scripts/*.sh` hardcoding `task/NNN-*` branch assumptions (the sibling row's `post-checkout` hook is the one exception, and it is additive/new, not an edit to something this row touches).
- **EC-2:** `SPIKE-C44-PARALLEL-PROOF` (BACKLOG, permission-widening spike for real per-agent worktree isolation) is explicitly out of scope, per the sibling brief's own AC-3 boundary — this row's `isolation: "worktree"` clarification (FR-12) does not implement or gate that spike, only documents the *existing* detached-HEAD mechanism.
- **EC-3:** FR-7(b)'s `pipeline`-vs-`verify-committed` collapse decision has a knock-on into FR-10 (dev-team's HARD PREREQUISITE language) — architect must resolve FR-7 before finalizing FR-10's wording, not in parallel.
- **EC-4:** This sprint changes **zero live runtime behavior** — `git branch -a` has shown zero `task/*` branches since at least 2026-07-17, re-confirmed 2026-07-31. Every edit here removes dead/contradicting prose; it does not need a rebuild, a deploy gate, or REAL-DATA verification (`PUSH-AUTONOMY-1` step 5 does not apply — no `confidence`/`score`/`impact`/`magnitude`/`probability` field is touched).

---

## 6. Blockers

**Zero.** STEP1 (PO ruling, 2026-07-17) already resolved the only PO-level question. §4's coordination note is a routing/sequencing flag for PM, not a business/priority question only PO can answer.

---

## RETURN
DONE: BA spec complete, zero PO blockers. 21-file inventory (13 FRs + 2 NFRs), DDD-mapped, mandatory coordination note for the FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR sibling row folded in.
NEXT: architect — resolve FR-7(b) pipeline/verify-committed collapse, FR-7(c)/FR-10 CLEAN-workflow retire-or-repurpose call, FR-13 delete-vs-repoint call for the orphaned bundle/WORKFLOW.md docs, then produce brownfield file-level design across the 21-file inventory in §3.
HANDOFF: docs/handoffs/UC-RDL-P7-BA-spec.md
PIPELINE: continue

---

## [Architect] Brownfield Findings

**Full design:** `docs/architecture-briefs/2026-08-13-uc-rdl-p7-branch-policy-reconciliation.md` — read that file in full before implementation; this section is a pointer + summary, not a duplicate.

- **Zone:** `multi` — no `apps/<service>/` touched. Two real commit-zone owners, per `agent-father`'s own `commit_zone.allowed` (`docs/agents/`, `.claude/skills/`, `.claude/agents/`) and CLAUDE.md's dispatch table:
  - **Group A** (`agent-father`, 20 files): FR-2..FR-11 + FR-14 (developer/microservice-main/dev-frontend/doc-review flow docs, 10× `init.md`, qa/fixer/pm/dev-team `main.md`, `.claude/skills/dispatch/SKILL.md`, `docs/agents/po/flow/main.md`).
  - **Group B** (`developer` generic, 9 files): FR-1, FR-12, FR-13 (`commit-convention.md`, `dev-standards.md`, `.claude/WORKFLOW.md`, `bundle-developer.md`, `bundle-qa.md`).
  - PM: split into 2 atomic tasks. Group B tier1 (creates the canonical `§ Branch Policy` section every Group-A pointer references) → Group A tier2 `depends_on` tier1. Group A must land as ONE atomic set internally — NFR-2's straddle hazard is entirely inside Group A (creation-half + merge-half), splitting it into sub-tiers reproduces the exact hazard the row exists to close.
- **3 open calls resolved** (full rationale in the architecture brief §0):
  1. FR-7(b): **keep both `pipeline`/`verify-committed` entry points**, strip `pipeline`'s checkout/merge git-mechanics to the same main-only no-op `verify-committed` already performs — do NOT collapse outright (the two check DIFFERENT depths: fresh-code full sweep vs already-shipped re-verify; collapsing would be a real behavior change EC-4 rules out).
  2. FR-7(c)/FR-10: **retire the CLEAN workflow entirely** (not repurpose to worktree-only) — branch-half dead by construction, worktree-half fully redundant with `dev-team/flow/main.md`'s own unconditional every-tick PREFLIGHT T5/T6 worktree GC.
  3. FR-13: **repoint** (not delete) `.claude/WORKFLOW.md` + `bundle-developer.md`/`bundle-qa.md` — confirmed zero live consumer for all three; `bundle-architect.md`/`bundle-ba.md`/`bundle-fixer.md`/`bundle-pm.md` swept clean (only `bundle-architect.md` has a hit, a harmless tree-illustration line, no edit needed).
- **New finding — FR-14 (22nd file, not in BA's inventory):** `docs/agents/po/flow/main.md` (lines 21/25/27/59) independently authors the `type: "CLEAN"` triage classification that feeds dev-team's Step 2 Planning CLEAN row — BA's repo-wide grep missed this live file. **Hard sequencing partner of FR-7(c)/FR-10's CLEAN retirement, must land in the same wave** (Group A) — shipping the CLEAN retirement without this file leaves PO still emitting a `type:"CLEAN"` batch dev-team no longer routes.
- **Reuse patterns:** FR-1 placement mirrors the existing `dev-standards.md § Commit Format` pointer idiom; FR-5's commit-range evidence reuses `qa/flow/main.md` § Direct-Commit Verify's own per-commit `git diff-tree` pattern (not reinvented); FR-2/3/4's "verify on main, clean tree" replacement text is one shared idiom applied at 3 call sites.
- **Design decisions:** DDD layer — 100% interface (agent-to-agent dispatch protocol prose), matches BA's own §1 mapping, zero domain/infrastructure edits beyond the read-only precedent citations (`scripts/fleet-worktree-push.sh`, `.claude/settings.json`). No new interfaces/ports — pure prose reconciliation to the existing `commit-convention.md § Branch Policy` SSOT (FR-1).
- **Risk flags:** (1) NFR-2 straddle risk confined to Group A — PM must land it as one atomic wave. (2) Sibling-hook sequencing (`FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR`, READY/pm) — land Group A before/with the hook, or hook ships `MODE=warn` first; full detail in brief §18. (3) FR-9's `branch:` field drop from PM's handoff template has no schema to update (handoffs are free-form markdown, not Zod-validated) — prose-only fix. (4) 44 live `task_board` rows carrying `.type=="CLEAN"` are a different, unrelated namespace (persisted tech-debt category label) from PO's retired triage-time `CLEAN` tag — confirmed independent, none touched by this design.
- **BUILD-STANDARD:** not-applicable (bug-fix/reconciliation, no new service/primitive).
- **Scan clean:** true ✓

## RETURN
DONE: Technical design complete — 22-file brownfield design (21 BA-inventoried + 1 architect-found), 3 open calls resolved, full detail in `docs/architecture-briefs/2026-08-13-uc-rdl-p7-branch-policy-reconciliation.md`.
ZONE: multi — Group A (agent-father, 20 files) / Group B (developer generic, 9 files), Group B tier1 → Group A tier2 depends_on tier1.
NEXT: pm | decompose into Group A + Group B atomic tasks per sequencing above; carry the sibling-hook coordination note into the decomposition
HANDOFF: docs/handoffs/UC-RDL-P7-BA-spec.md
PIPELINE: continue
