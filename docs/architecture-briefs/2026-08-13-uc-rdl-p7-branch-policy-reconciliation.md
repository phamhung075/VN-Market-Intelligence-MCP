# Architecture Brief — UC-RDL-P7 STEP2: Branch Policy Reconciliation (full lifecycle, main-only)

**Date:** 2026-08-13 | **Author:** architect | **Task:** `UC-RDL-P7` (P1/SPRINT-M, zone `multi`, sprint `ULTRACODE-AUDIT-FIXALL`)
**Input:** `docs/handoffs/UC-RDL-P7-BA-spec.md` (BA spec complete 2026-08-12, 21-file inventory, 13 FRs + 2 NFRs) + `docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md` (mandatory coordination read, §4)
**Status:** DESIGN COMPLETE — zero code, zero DB, zero deploy implications (BA's own EC-4, re-confirmed below).
**BUILD-STANDARD:** not-applicable (bug-fix/reconciliation class, no new service/primitive — Standard Detection matrix, `docs/agents/architect/flow/main.md`).

---

## 0. Verdict up front — the 3 open calls BA asked architect to resolve

1. **FR-7(b) `pipeline` vs `verify-committed` collapse:** **KEEP BOTH entry points; strip `pipeline`'s checkout/merge git-mechanics to the same main-only no-op `verify-committed` already performs.** Do NOT collapse outright. `pipeline`'s DDD-boundary grep + secret grep + BCTC eval gate + mock-guard are a materially richer first-pass sweep for **fresh, never-reviewed** code; `verify-committed` is a deliberately lighter **re-verify of already-shipped** code (QA-drain claims a `review[]` row days/weeks after it was committed). Collapsing the two would either bloat `verify-committed` with checks that don't belong on old code, or thin `pipeline` for new code — a real behavior change, which contradicts BA's own EC-4 ("zero live runtime behavior changes"). Only the git-checkout/merge/branch-delete *mechanics* were ever branch-specific; the check *content* is legitimately different missions and stays that way.
2. **FR-7(c)/FR-10 CLEAN-workflow retire-or-repurpose:** **RETIRE entirely** (not repurpose to worktree-only). The branch-half is dead by construction post-sprint (no `task/NNN-*` branch is ever created, nothing to enumerate/delete). The worktree-half is fully redundant with `docs/agents/dev-team/flow/main.md`'s own **unconditional, every-tick** PREFLIGHT T5 (`git worktree prune -v`) + T6 (24h worktree-lock-expiry sweep) — confirmed live in that file (lines ~131-139, ~163-169). Retiring removes a now-permanently-untriggerable dispatch path (dead code), consistent with CLAUDE.md's "detect then reduce debt, dead code" default.
3. **FR-13 delete-vs-repoint for orphaned bundle/WORKFLOW.md docs:** **REPOINT** (BA's own recommendation, ratified) — one-line pointer to `commit-convention.md § Branch Policy` in each of `.claude/WORKFLOW.md`, `bundle-developer.md`, `bundle-qa.md`. Confirmed **zero live consumer** for all three (repo-wide grep: no `init.md` or skill loads any of them as knowledge; the only references are cosmetic directory-tree illustrations in `tree-map.md`/`bundle-architect.md` and one dangling pointer in `dev-standards.md` that FR-12 itself removes). `bundle-architect.md`'s "branch" hit is tree-map-illustration text only (line 66, `├── .claude/WORKFLOW.md (dev workflow: branch hygiene, merge checklist)`) — leave as descriptive prose, no functional pointer to fix. `bundle-ba.md`/`bundle-fixer.md`/`bundle-pm.md` swept clean — zero branch content (BA's own instruction to sweep them confirmed, nothing found).

**New finding (not in BA's 21-file inventory):** `docs/agents/po/flow/main.md` (lines 21, 25, 27, 59) independently authors and routes a `type: "CLEAN"` triage classification tied to branch/worktree detection — this is the **source** that feeds dev-team's Step 2 Planning `CLEAN` row. BA's repo-wide grep missed it (it excluded no directory that should have caught `po/flow/main.md`). Folded into this design as **FR-14** below; it is a **hard sequencing partner of FR-7(c)/FR-10's CLEAN retirement**, not independent — shipping FR-7(c)/FR-10 without FR-14 leaves PO still emitting a `type:"CLEAN"` batch dev-team no longer has a section to route.

**Confirmed zero-runtime-impact (BA's EC-4, independently re-verified this cycle):** `.claude/worktrees/agent-ae9ed2cd6f04b3686/` exists on disk right now as a leftover linked worktree containing stale mirrored copies of several of these very files — this is itself live evidence *for* the sprint's own thesis (worktree hygiene needs the T5/T6 GC this design leans on), not a blocker; it is not one of the 22 files in scope and is not touched by this design (flagging for PM/ops visibility only, out of this row's scope per BA's own EC-1 boundary).

---

## 1. Zone

**Zone:** `multi` — no `apps/<service>/` file is touched (100% agent-orchestration prose + 2 root policy docs). PM must NOT route this as a single generic-`developer` task — the 22 files split cleanly across **two real commit-zone owners**, per `agent-father`'s own declared `commit_zone.allowed` (`docs/agents/`, `.claude/skills/`, `.claude/agents/` — confirmed from `agent-father/init.md` directly, same confirmation the sibling brief already made in its own §5) and CLAUDE.md's dispatch table ("create / edit / review / maintain agent → `agent-father`" — NOT `developer`):

| Group | Owner | Files |
|---|---|---|
| **A** (agent-flow prose) | `agent-father` | FR-2..FR-11 + **FR-14** (20 files: 4 developer-family flow docs, 10 `init.md`, qa/fixer/pm/dev-team `main.md`, `dispatch/SKILL.md`, `po/flow/main.md`) |
| **B** (policy/reference docs) | `developer` (generic — not agent-file lifecycle) | FR-1, FR-12, FR-13 (9 files: `commit-convention.md`, `dev-standards.md`, `.claude/WORKFLOW.md`, 2 bundle files with branch content) |

**Sequencing (PM decomposition guidance):** Group B lands first (creates the canonical `§ Branch Policy` section every Group-A pointer references) as tier1; Group A lands as tier2, `depends_on` tier1. **Group A must land as ONE atomic set internally** (NFR-2's own hazard — creation-half FR-2/3/4/6/14 and merge-half FR-7 straddling a live Developer→QA handoff — is entirely inside Group A; splitting Group A into its own sub-tiers would reintroduce exactly the hazard NFR-2 exists to prevent). Group B carries no such internal hazard (FR-1/FR-12/FR-13 are independent pointer/policy edits) and MAY land as one commit or several within its own tier.

**Standard Detection:** `BUILD-STANDARD: not-applicable` (bug-fix/reconciliation, no new service/primitive) — matches BA's EC-4 framing exactly.

---

## 2. FR-1 — `docs/policies/commit-convention.md` (new `## Branch Policy` section)

Insert as a new top-level section, sibling to the existing `## Format`/`## Type Vocabulary` sections (after `## Type Vocabulary`, before `## Scope Rules` — matches the doc's existing flow-through-a-commit ordering: format → vocabulary → branch/lifecycle → scope → trailers). Content (BA's NFR-1 minimum, made concrete):

```markdown
## Branch Policy

**Main-only invariant:** no `task/NNN-*` branch, or any other named branch, is ever created in
the shared/primary working directory. Every agent commits directly to `main` (pathspec-scoped,
per § Shell Pattern above). This supersedes the historical `task/NNN-*` branch-per-task lifecycle
still described in old flow-doc prose — that workflow has zero live usage (`git branch -a` shows
only `main` + `remotes/origin/main`, re-verified 2026-07-17/2026-07-31) and directly contradicted
CLAUDE.md's own standing `NO branches — all work stays on main` invariant. Ruling:
`docs/agent-memory/decisions/2026-07-17-UC-RDL-P7-branch-policy-main-only.md`.

**Worktree-isolation carve-out (PO-ratified):** when genuinely needed for disjoint-zone parallel
dispatch, a worktree runs **detached at `HEAD`** — never a named branch — and pushes back to
`main` via `scripts/fleet-worktree-push.sh` (the live, working precedent; do not re-describe its
mechanics here, read the script's own header). `.claude/settings.json` `.worktree.baseRef: "head"`
confirms the platform-level worktree mechanism already bases off `HEAD`, not a named branch.

**Post-commit hygiene** (after QA verifies, no merge step — the work is already on `main`):
1. `git branch --show-current` = `main`
2. `git status --short` = empty
3. Remove worktrees used for isolation: `git worktree remove --force <path>` (most tasks never use one)
4. Drop stashes from the working tree

No branch-delete step — none is ever created.
```

**Design decision:** exact placement + wording sourced from `dev-standards.md`'s current § Branch Hygiene + § Parallel Agent Dispatch (verified live) — this section supersedes both, they become pointers (FR-12).

---

## 3. FR-2 — `docs/agents/developer/flow/main.md`

- **Output (line 15) / Produces (line 29):** `Code + tests on task/NNN-* branch` → `Code + tests committed to main`.
- **Pre-code checklist step 2 (line 53):** currently a `SUPERSEDED` historical marker (2026-08-05 partial self-heal). Replace with a clean, non-historical instruction + pointer (no more "dead prose" framing — this is now the live instruction):
  ```
  2. Verify on `main`, clean tree — `git branch --show-current` must read `main`;
     `git status --short` must be empty before touching any file. Commit directly per
     §"After code" step 4 below (pathspec-scoped, never `-a`/`-am`).
     Full policy → `docs/policies/commit-convention.md` § Branch Policy.
  ```
- **RETURN (line 157):** `NEXT: qa | run full QA pipeline on branch task/NNN-kebab` → `NEXT: qa | run full QA pipeline`.
- **Untouched:** "Composes with" line's `isolation: "worktree"` language (line 31) — still valid, worktrees survive, only the named-branch-inside-them is dropped (BA's own note, confirmed correct on read).

---

## 4. FR-3 — `docs/agents/developer/flow/microservice-main.md`

- **Output (line 12) / Receives (line 24) / Produces (line 25) / Hand-off (line 26):** drop `on task/NNN-* branch` / `branch name` language → `Code + tests committed to main within zone`, Receives drops "branch name" from the AC/zone list.
- **Line 39 "three-branch dispatch" heading — VERIFIED, no edit needed.** Read the block (lines 39-54): it is a 3-way conditional over `BUILD-STANDARD` tags (`full`/`lean`/`not-applicable`), zero git-branch commands. "Three-branch" here means "3-way code branch" (conditional), not git branch — BA explicitly asked for this check before editing; confirmed accurate, leave as-is.
- **Pre-code checklist step 2 (lines 58-61):** replace the branch-exists/branch-missing/VERIFY block with:
  ```
  2. Verify on `main`, clean tree — `git branch --show-current` must read `main`;
     `git status --short` must be empty before touching any file.
     Full policy → `docs/policies/commit-convention.md` § Branch Policy.
  ```
  **Coordination note (§4 sibling row):** this VERIFY line is the exact line the sibling `FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR` brief flagged as the literal breakage point for its `post-checkout` hook — once this edit lands, the VERIFY line and the hook's own revert-to-`main` behavior are in agreement (both expect `main`) instead of contradicting each other. See §9 below.
- **RETURN (line 165):** `NEXT: qa | run full QA pipeline on branch task/NNN-kebab` → `NEXT: qa | run full QA pipeline`.

---

## 5. FR-4 — `docs/agents/dev-frontend/flow/main.md` (independent 3rd copy)

Same edit shape as FR-3, applied to this separate file (dev-frontend does not inherit `microservice-main.md`):
- **Receives (line 25) / Produces (line 26):** drop "branch name" language.
- **Pre-code checklist step 2 (lines 54-57):** identical replacement to FR-3's.
- **RETURN (line 204):** `NEXT: qa | run full QA pipeline on branch task/NNN-kebab` → `NEXT: qa | run full QA pipeline`.

---

## 6. FR-5 — `docs/agents/developer/flow/doc-review.md`

**Line 13** currently: `git diff --name-only task/NNN...HEAD -- apps/<service>/`. Replace with an explicit commit-range diff sourced from the handoff's own `[Developer] Implementation Record` — reuses the exact evidence pattern `qa/flow/main.md`'s Direct-Commit Verify already uses (`git show --stat "$COMMIT"`, § Direct-Commit Verify step 3), not a second invented pattern:

```markdown
## Step 1 — Identify changed DDD layers

Read the `[Developer] Implementation Record`'s own `Git commits:` list from the handoff (the
hash(es) developer just committed to `main`). For each hash:
`git diff-tree --no-commit-id --name-only -r <hash> -- apps/<service>/`
(mirrors `qa/flow/main.md` § Direct-Commit Verify's own per-commit evidence pattern — reused,
not reinvented). Union the per-commit file lists to identify touched DDD layers:
- `domain/` → domain-model.md
- ...(unchanged mapping below)
```

---

## 7. FR-6 — 10x agent `init.md` flow-catalog input line

Identical single-line find-and-replace across all 10 files (grep-verified exact current text this cycle):

| File | Line | Current | New |
|---|---|---|---|
| `developer/init.md` | 165 | `input: [TASK_NNN.md, task/NNN branch]` | `input: [TASK_NNN.md, commits on main]` |
| `fixer/init.md` | 87 | `input: [TASK_NNN.md (QA issues), task/NNN branch]` | `input: [TASK_NNN.md (QA issues), commits on main]` |
| `qa/init.md` | 110 | `input: [TASK_NNN.md, task/NNN branch]` | `input: [TASK_NNN.md, commits on main]` |
| `dev-mcp-server/init.md` | 92 | same | same pattern |
| `dev-stock-price/init.md` | 166 | same | same pattern |
| `dev-technical-analysis/init.md` | 134 | same | same pattern |
| `dev-api-gateway/init.md` | 132 | same | same pattern |
| `dev-rag-service/init.md` | 135 | same | same pattern |
| `dev-pdf-extractor/init.md` | 98 | same | same pattern |
| `dev-alert-engine/init.md` | 96 | same | same pattern |

Zero judgment calls — mechanical, uniform pass.

---

## 8. FR-7 — `docs/agents/qa/flow/main.md` (the hard prerequisite this row exists to fix)

### (a) Input/Role
- **Input (line 8):** `docs/handoffs/TASK_NNN.md with [Developer] Implementation Record, branch task/NNN-*` → `..., commit(s) on main`.
- **Role table Receives/Produces/Hand-off (lines 37-40):** drop `branch task/NNN-*` language throughout; Step-3 Receives becomes `docs/handoffs/TASK_NNN.md with [Developer] Implementation Record, commit(s) on main (see Implementation Record's Git commits: list)`.
- **DELETE the "Step-2 CLEAN spawn" row from the JUMP-TO table entirely** (line ~55) and **DELETE the `CLEAN workflow: for each branch...` line** in the Role section body (line 43) — per §0 call 2 (retire CLEAN).

### (b) `pipeline` — strip checkout/merge mechanics to a no-op, keep the entry point and its richer checks
- **First line of the `pipeline` bash block** (`git checkout task/NNN-kebab-description`) → replace with a no-op affirmation:
  ```
  git branch --show-current   # must read main — nothing to check out, commits already landed on main
  ```
  Everything below it in that block (`bun test`, `bun tsc --noEmit`, the two DDD-boundary greps, the two secret greps, `mock-guard.sh`) is **UNCHANGED** — this is `pipeline`'s differentiator from `verify-committed` and stays.
- **Approval → APPROVED merge block** (`git checkout main` / `git merge --no-ff task/NNN-kebab-description ...` / worktree-remove-by-branch-lookup / `git branch -d` / `git push origin --delete`) → replace with:
  ```bash
  git branch --show-current   # must read main — already on main, nothing to merge
  git push origin main        # developer committed locally; QA is often the actor that finally pushes
  ```
  Drop the worktree-remove-by-branch-lookup block (no branch to look up by) — if a worktree genuinely was used for isolation, its removal is covered by § Post-commit hygiene (FR-1) as a developer-side step, not QA's.
- **RETURN block (line ~232):** `DONE: Task NNN merged, pushed to main, branch deleted locally + remote, all tests green` → `DONE: Task NNN committed and pushed to main, all tests green` (drop "merged"/"branch deleted").

### (c) CLEAN workflow — RETIRED (§0 call 2)
Removed in (a) above. No separate section existed beyond the Role-line + JUMP-TO-table row — minimal removal footprint.

**Knock-on into FR-10 resolved by this (b) decision — see §11 below (EC-3's own ordering dependency, satisfied here first).**

---

## 9. FR-8 — `docs/agents/fixer/flow/main.md`

- **Receives (line 34):** `... same task/NNN-* branch developer used` → `... same commit(s) developer pushed to main`.
- **Hand-off (line 36):** `re-spawns qa for full re-run on same branch` → `re-spawns qa for full re-run`.
- **Trigger step 2 (line 60):** `git status | grep task/` — confirm on task branch` → `git branch --show-current` — confirm reads `main`; `git status --short` clean before fixing`.
- **RETURN (line 110):** `NEXT: qa | re-run full QA pipeline on branch task/NNN-kebab` → `NEXT: qa | re-run full QA pipeline`.

---

## 10. FR-9 — `docs/agents/pm/flow/main.md`

- **Handoff Triggers table (line 27, if present in this file's own table — re-verify at implementation time; this file's Step-5 Monitor line carries the equivalent live text):** `Code on task/NNN-* branch` → `Code committed to main`. Also fix the parallel Step-5 Monitor text found live this cycle: `return NEXT: qa | review Task NNN branch task/NNN-kebab` → `return NEXT: qa | review Task NNN (commits on main)`.
- **Handoff YAML frontmatter template (line 75):** `branch: task/NNN-kebab-name` → **DROP the field entirely** (do not rename it). Per BA/the sibling brief's own §1.3 finding: a `branch:` field surviving in a PM handoff template is the literal, live, grep-confirmed artifact behind the `FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE` incident (a handoff minted `branch: task/NNN-kebab-name` days after the 2026-07-17 ruling, developer honored it). Removing the field is the actual fix, not cosmetic — every other frontmatter field (`sprint`, `size`, `zone`, `depends_on`, `blocks`) is untouched.
- **RETURN wording (BA's cited "line 226"; this file is currently 247 lines — locate by content, not blind line number, since prior doc growth has shifted it):** any RETURN/return-block text mentioning "branch task/NNN" gets the same drop as above.

---

## 11. FR-10 — `docs/agents/dev-team/flow/main.md`

- **Step 2 Planning table:** **DELETE the `| CLEAN | — | S4: see dispatch block below | qa flow handles cleanup → EXIT |` row entirely** (line 988). §0 call 2.
- **DELETE the entire `**S4 CLEAN dispatch:**` block** (lines 1013-1034) — the `UNBLOCK` dispatch block immediately above it is untouched (different, unrelated `Type`).
- **Closeout checklist line 1111** (`Branch deleted by QA post-merge`) → **DROP the line** (nothing to delete, ever). Do not replace with a restatement of T5/T6 — that content already lives at its own PREFLIGHT location, restating it here would be a 2nd copy of the same fact (violates this sprint's own NFR-1 SSOT ethos).
- **HARD PREREQUISITE paragraphs (lines ~721, ~767, ~824)** — **resolved after FR-7(b) above** (this is EC-3's own ordering dependency; FR-7(b) is now finalized as "keep both entry points, strip mechanics" — so the contrast these paragraphs draw between "branch:null QA-drain rows" and "normal task/NNN-* rows" is now stale on TWO axes: (1) no row ever has a branch, full stop; (2) `pipeline` itself no longer requires a checkout, so it is no longer mechanically incompatible with a `branch:null` row either. Reword all three to state the now-universal main-only precondition and repoint the real remaining distinction to CHECK DEPTH, not branch existence:
  - **~721:** `Every row (fresh developer-DONE and review[]-lane QA-drain alike) is committed straight to main — no task branch is ever created (main-only invariant, docs/policies/commit-convention.md § Branch Policy). QA-drain-claimed rows still use the lighter verify-committed entry point (re-verify of already-shipped code, no DDD/secret re-sweep) rather than the heavier first-pass pipeline entry point (fresh code needs the full DDD-boundary/secret/BCTC-eval sweep) — the distinction that survives is CHECK DEPTH by row provenance, not branch existence.`
  - **~767:** `Do NOT spawn qa's normal pipeline mode — this row is a stale already-shipped commit being re-verified, not fresh code; pipeline's fuller first-pass sweep does not apply to an already-merged row and would waste QA-drain's lighter re-verify budget.`
  - **~824:** `REVIEW-lane, direct-commit on main (no task branch ever existed — same as every row post-sprint), same precondition as the PRIMARY qa-drain lane.`
- **Line 1023 (Step-2 CLEAN spawn context, `spawn qa with branch list`):** removed automatically as part of the S4 CLEAN dispatch block deletion above — no separate repoint needed.

---

## 12. FR-11 — `.claude/skills/dispatch/SKILL.md`

**Line 74** (Dev Team Handoff Chain table): `'.task_board' task status → DONE, branch merged` → `'.task_board' task status → DONE, commits on main verified`.

---

## 13. FR-12 — `docs/policies/dev-standards.md`

### § Branch Hygiene (lines 1523-1534) → rewrite in place (heading kept, minor rename for accuracy):
```markdown
## Branch Hygiene (after QA verify)

After QA verifies, no merge step (the work is already on `main`):
1. `git branch --show-current` = `main`
2. `git status --short` = empty
3. Remove worktrees: `git worktree remove --force .claude/worktrees/<name>` (only if one was used
   for isolation — most tasks never use one)
3a. If changed files include `vps-scripts/**` or `deploy-vinahost.sh`, run
    `./scripts/maybe-deploy-vps.sh` as an unconditional pre-merge-verification gate (not
    branch-delete-adjacent — nothing is ever deleted).
4. Drop stashes from the working tree

Full policy → `docs/policies/commit-convention.md` § Branch Policy.
```
Drops the old step-3 branch-delete (`git branch -d`/`push --delete`), rewords 4a per BA, replaces the `.claude/WORKFLOW.md#branch-hygiene-checklist` pointer with the new SSOT pointer (FR-13 retires that target as a knowledge destination, though the file itself survives repointed).

### § Parallel Agent Dispatch (lines 1507-1519)
Add one clarifying clause to the `isolation: "worktree"` row: worktree isolation is **detached-at-`HEAD`, never a named branch** — cite `scripts/fleet-worktree-push.sh` as the live precedent (per §1 infra note in the BA spec). Content otherwise unchanged (sequential-default, SSOT-file trigger list untouched — out of this row's scope).

---

## 14. FR-13 — Retire the orphaned duplicate-SSOT class (repoint, not delete)

- **`.claude/WORKFLOW.md`:** "Agent Chain" table's handoff-trigger row (`Code on task/NNN-* branch`) → `Code committed to main`. Full "## Branch Hygiene" section (lines 43-52) → collapse to:
  ```markdown
  ## Branch Policy

  Full policy → `docs/policies/commit-convention.md` § Branch Policy.
  ```
- **`docs/references/bundles/bundle-developer.md`:** `## Branch Hygiene (steps 1–5)` section (lines 90-101) → collapse to a one-line pointer: `Branch policy → docs/policies/commit-convention.md § Branch Policy.`
- **`docs/references/bundles/bundle-qa.md`:** `## Branch Delete Commands (after merge)` section (lines 87-91) → same one-line pointer, heading dropped (no branch-delete commands exist to document).
- **`bundle-architect.md` / `bundle-ba.md` / `bundle-fixer.md` / `bundle-pm.md`:** swept this cycle — `bundle-architect.md`'s only hit (line 66) is a directory-tree illustration entry (`├── .claude/WORKFLOW.md (dev workflow: branch hygiene, merge checklist)`), not a functional pointer; leave as descriptive prose (still true — the file still documents branch policy, now via a pointer). `bundle-ba.md`/`bundle-fixer.md`/`bundle-pm.md` — zero branch content found, no edit needed.
- **`docs/references/tree-map.md:149`** (same tree-illustration pattern as bundle-architect.md) — not in BA's inventory, not a functional pointer, no edit needed; flagged only for completeness.

---

## 15. FR-14 (NEW — architect-discovered) — `docs/agents/po/flow/main.md`

**Hard sequencing partner of FR-7(c)/FR-10's CLEAN retirement — must land in the SAME wave, not independently.**

- **Line 20 (Receives):** `... | git branch` — this is PO's own context-gathering input (reads `git branch` output as evidence during triage), independent of the CLEAN feature; leave as-is (harmless read-only context, not a branch-lifecycle assumption).
- **Line 21 (Produces):** `BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}]) where type ∈ {FIX, SPIKE, SPRINT-S, SPRINT-M, SPRINT-L, UNBLOCK, CLEAN}` → drop `CLEAN` from the enum: `type ∈ {FIX, SPIKE, SPRINT-S, SPRINT-M, SPRINT-L, UNBLOCK}`.
- **Line 25 (Priority order):** `Priority order: recurring bugs → UNBLOCK → FIX → CLEAN → SPRINT-S → SPRINT-M/L` → drop `CLEAN →`: `Priority order: recurring bugs → UNBLOCK → FIX → SPRINT-S → SPRINT-M/L`.
- **Line 27:** `CLEAN: flag any branch with 0 unmerged commits (git log main..<branch> --oneline empty) or stale worktree → route to qa.` → **DELETE the line entirely.** No replacement needed — dev-team's own unconditional PREFLIGHT T5/T6 (git worktree prune + 24h lock-expiry sweep) already covers the worktree half every tick, and the branch half is permanently moot.
- **Line 59** ("Never inline both pre-flight and a branch workflow — keep context lean.") — re-verify at implementation time whether this line still refers to a genuine "branch workflow" concept elsewhere in this file (it may pre-date the CLEAN removal and refer to something unrelated); if it turns out to reference ONLY the now-deleted CLEAN branch-detection logic, drop it; if it refers to a different, still-live workflow split, leave untouched. Flagged, not pre-judged — PM/developer should re-read this line's full context before touching it (single-line ambiguity, not worth architect re-reading the full 200+-line file for one word when the answer is a 30-second check at implementation time).

---

## 16. Reuse patterns

- FR-1's placement pattern mirrors the already-correct precedent in `dev-standards.md § Commit Format` (`"Full spec → docs/policies/commit-convention.md"`) — same pointer idiom applied to Branch Policy.
- FR-5's commit-range-evidence pattern reuses `qa/flow/main.md` § Direct-Commit Verify's own per-commit `git show --stat`/`git diff-tree` evidence gathering — not reinvented.
- FR-2/FR-3/FR-4's "verify on main, clean tree" replacement text is one shared idiom applied identically across all three creation-half files (single pattern, three call sites) — matches this codebase's own precedent of one shared checklist shape reused verbatim across the `developer`/`microservice-main`/`dev-frontend` family (e.g. the existing TDD-workflow/Simplicity-gate/decision-journal blocks already follow this convention).
- FR-7(b)'s "no-op affirmation instead of checkout" mirrors `verify-committed`'s own existing "no checkout — QA already runs on main" framing (line ~160 of the pre-edit file) — same sentence shape, reused not reinvented.

## 17. Risk flags

1. **NFR-2 straddle risk (the core hazard this whole row exists to close):** confined entirely to Group A (agent-father zone) per §1's split. PM must land all of FR-2/3/4/6/7/8/9/10/14 as one atomic wave — a partial land (e.g. FR-2/3/4 alone, without FR-7) reproduces the exact Developer→QA wedge the PO ruling warned about. Flagged prominently for PM's task-breakdown (not architect's call to enforce mechanically — PM's own remit).
2. **Sibling-hook sequencing (§4/§9 below):** the `FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR` hook (READY, `next_agent: pm`) must not ship enforcing before Group A's VERIFY-line edits land, or every M/L developer task's VERIFY line breaks against a hook-reverted `HEAD`. Not this row's artifact to fix — PM coordination call, restated below for visibility.
3. **PO handoff template drop (FR-9):** removing the `branch:` field from PM's handoff YAML is a schema-shape change to every future handoff file. No `docs/handoffs/*.md` frontmatter is Zod-validated (confirmed — free-form markdown), so this is a pure prose change with no validator to update; flagged only so a future reviewer doesn't go looking for a schema file that doesn't exist.
4. **FR-14 line 59 residual ambiguity** — see §15, single-line, deliberately deferred to implementation-time context check rather than architect re-reading the full file for one sentence.
5. **Live board rows with `.type == "CLEAN"`** (44 found this cycle, e.g. `TE-T23`, `CLEAN-COWORK-ROSTER-DRIFT`) are a **different, unrelated** namespace (persisted task-category label meaning "tech-debt/cleanup work") from PO's own ephemeral triage-time `BATCH()` `type` tag this design retires — confirmed independent by direct inspection of both. Retiring the triage-time CLEAN tag does not touch, orphan, or misroute any of these 44 rows.

---

## 18. Coordination — sibling row sequencing (§4 of BA spec, mandatory reading — restated for PM)

`FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR` (`READY`, `next_agent: pm`, brief `docs/architecture-briefs/2026-07-31-fix-subagent-branch-checkout-hijacks-shared-working-dir.md`) ships a `post-checkout` git hook defaulting to `MODE=enforce` (hard auto-revert to `main` on any non-`main` checkout in the shared working dir). That brief's own §5 explicitly asks PM to coordinate its rollout against this row. **Recommendation, restated with this design's own detail:**
- Land this row's **Group A** (the VERIFY-line removal, §1 above) **before or in the same wave as** the sibling hook, OR
- Sequence the hook to start in `MODE=warn` (env var, no code change) until Group A lands, then flip to `MODE=enforce`.

Once Group A lands, the hook and the flow docs are in agreement by construction — `docs/agents/developer/flow/microservice-main.md`'s VERIFY line (§4 above) now asserts `main`, the exact state the hook enforces. No further coordination artifact needed after that point; this is a one-time sequencing question for PM, not an ongoing dependency.

---

## 19. Test strategy

Pure prose/documentation change — no `bun test`/`tsc`/CI surface. Verification is manual re-read + grep-based regression:
- `grep -rn "task/NNN" docs/agents/ .claude/skills/dispatch/SKILL.md docs/policies/commit-convention.md docs/policies/dev-standards.md .claude/WORKFLOW.md docs/references/bundles/` should return **zero hits** in live (non-historical-marker) prose after all 22 files land — any remaining hit is either a stale doc-self-heal-worthy miss or a legitimate historical annotation (none expected; the old developer/main.md SUPERSEDED marker is itself being cleaned up by FR-2, so even that precedent disappears).
- `grep -n "CLEAN" docs/agents/qa/flow/main.md docs/agents/dev-team/flow/main.md docs/agents/po/flow/main.md` should return zero hits post-FR-7(c)/FR-10/FR-14.
- Spot-check one full read of the edited `qa/flow/main.md` `pipeline`/`approved` sections end-to-end (not just grep) before marking DONE — FR-7(b)'s edit is the highest-complexity single change in this set and deserves a full-file sanity read, not just line-targeted diffs.

## Scan clean: true ✓

---

## RETURN
DONE: Technical design complete — 22-file brownfield design (21 BA-inventoried + 1 architect-found, `docs/agents/po/flow/main.md`), 3 open calls resolved (§0), brief written to `docs/architecture-briefs/2026-08-13-uc-rdl-p7-branch-policy-reconciliation.md`.
ZONE: multi — Group A (`agent-father`: docs/agents/*, .claude/skills/dispatch/SKILL.md, 20 files) / Group B (`developer` generic: docs/policies/*, .claude/WORKFLOW.md, 2 bundle files, 9 files) — PM splits into 2 atomic tasks, Group B tier1 → Group A tier2 `depends_on` tier1.
BUILD-STANDARD: not-applicable
NEXT: pm | decompose into Group A (agent-father) + Group B (developer) atomic tasks per §1 sequencing; carry §18's sibling-hook coordination note into the decomposition
HANDOFF: docs/handoffs/UC-RDL-P7-BA-spec.md
PIPELINE: continue
