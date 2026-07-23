# Developer — Notebook

**Last updated:** 2026-07-23 | **Cycle:** UC-GCP-P7 (/commit skill rescope — mutex-bound, main-only)

## Session 2026-07-23 — UC-GCP-P1 (BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** git-ci-publish-P1 RESCOPE — consolidate the 4 commit-convention docs into ONE SSOT documenting the format actually in use, PLUS reconcile the 2 coupled surfaces (audit script, tree-map DAG) the original CONFIRMED proposal missed.

**Actions taken:** Rewrote `docs/policies/commit-convention.md` as single-file SSOT (140L, was 265L/4 files) — slug task IDs, two-tier type vocab (behavior + role types, both empirically confirmed live via `git log`), `Task:`/`AC:` trailers required on feat/fix, `Sprint:` demoted optional. Carried forward the heredoc `git commit -m`-only/never-`-a` rule VERBATIM. Deleted the 3 sibling children. Fixed the 2 dangling `.claude/knowledge/commit-convention.md` path callers (audit script comment + 2026-05-17 audit brief). Deprecated `commit-convention-audit.sh` in place (banner header — confirmed zero live invocation paths) rather than rewriting its predicates. Collapsed tree-map.md's 4-file subtree to one node.

**Verification:** Post-change grep confirms zero refs to any deleted sibling doc or the nonexistent knowledge path outside historical/archival docs (2026-07-12 audit brief itself, old handoffs/specs — left untouched, not live callers). Tree-map subtree points to the one surviving path, verified on-disk. `/graphify docs --update --no-viz` hard-failed (no LLM API key in session env) — flagged in WORK.md, not silently skipped.

**Board:** `task_board.in_progress[UC-GCP-P1]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Docs-only, no code/tests touched. Left ~15 historical handoffs/specs/reports referencing the old `.claude/knowledge/commit-convention.md` path untouched — archival record of past sprints, not live pointers; rewriting them would falsify history for zero operational benefit.

Zone health: commit-convention SSOT consolidated 4→1 file, dangling refs zero, audit script deprecated (was silently asserting dead vocab), tree-map DAG intact | HEALTHY

## Session 2026-07-23 — UC-GCP-P8 (dev-team BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** git-ci-publish-P8 RESCOPE — no converging owner exists for the dirty-tree categories (notebooks/decisions/sessions/scripts strand past cycle end); rescope spec: bounded Step 4.3 on post-cycle.md running `stranded-state-sweep.sh --plan`, 3-bucket classify (AUTO-COMMIT/OWNED-ELSEWHERE/UNKNOWN), cap 20 paths, commit-mutex:main, coordinate with UC-GCP-P2 + SYSREMAKE-P2 RC-GITSTATE ownership.

**Actions taken:** New `scripts/agents-flow/stranded-state-sweep.sh` — classifier-only (`--plan` emits JSON, makes zero git/orch-state writes itself, matching the memory-prune-sweep.sh script/flow split). Verified UC-GCP-P2 (DONE_VERIFIED — untracked signals.db/session-logs) and SYSREMAKE-P2 RC-GITSTATE (queued, owns `agent-memory/modules/*.json` + `coverage-state.json`) live before hardcoding the OWNED-ELSEWHERE skip-list, per coordination note. Wired as post-cycle.md § Step 4.3 (15L body, ≤20L rescope cap) between Step 4.2 and 4.5. CANONICAL pointer in `dev-standards.md`.

**Verification:** Paired `stranded-state-sweep.test.sh` — 19/19 PASS, sandboxed git repo (seeded tracked placeholders per dir so git doesn't collapse fully-untracked dirs into one porcelain line) — covers all 3 buckets, the 24h age gate, `D`-deletion age-exemption, sessions `*.md`-only gate, NUL-safe space-path parsing (live repo has one), the 20-path execution cap, dedup-skip true/false, and bad-usage exit 2. Dry-run against the live repo (`--plan`, read-only, no mutation) confirmed correct classification of the real 57-entry dirty tree: 9 owned-elsewhere, 2 auto-commit-eligible, 18 unknown surfaced (capped at 20 total considered).

**Board:** `task_board.in_progress[UC-GCP-P8]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Script is classifier-only per the rescope's script/flow split — the flow (not this developer cycle) performs the actual `git add`/commit and `.signal_queue.rows[]` write on its next live tick; no live sweep-commit executed here (would be acting outside this FIX's own scope, on a peer-owned dirty tree). Fixed a self-caught dedup bug pre-ship: the unknown-signal summary originally front-loaded the dynamic path count, which would break `startswith`-prefix dedup every tick — moved the count to a trailing `(N)` suffix.

Zone health: dev-team post-cycle tick now has a converging owner for stranded machine-state — 3-bucket classify verified against the live 57-entry dirty tree, RC-GITSTATE/UC-GCP-P2 boundaries respected, cap+dedup+mutex all test-proven | HEALTHY

## Session 2026-07-23 — UC-GCP-P3 (dev-team BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** git-ci-publish-P3 RESCOPE — drain commit's shell-glob path list silently dropped deletions of already-removed `docs/signals/*.json` files. Rescope spec: tracked-only `git add -u` staging scoped to `docs/signals/` + explicit `processed/` add + FP-safe post-commit clean invariant + commit-boundary RULE 1 cross-ref note. DROP the one-shot backfill (already landed df0b58bd9).

**Actions taken:** `drain-signals.md` §0a MANDATORY PERSIST GUARD staging changed to `git add -u -- docs/signals/ && git add -- docs/signals/processed/` (`-u` = tracked mods+deletions only, never sweeps peers' untracked mid-write inbox arrivals; second add picks up newly-moved untracked-new processed/ files). Added post-commit invariant: `git status --porcelain -- docs/signals/ | grep -v '^??' | grep -v signals.db | wc -l` must be 0, else bug-telegram naming residual paths. Cross-ref note added to `commit-boundary/SKILL.md` RULE 1 documenting the tracked-only exception is not a directory sweep. Commit `e77635933`.

**Verification:** Docs-only flow-spec change (no test surface) — verified via `git show --name-only HEAD` self-check (RULE 3), exactly the 2 intended files. No backfill re-run (df0b58bd9 already committed the 07-03/04 stranded deletions, verified `docs/signals/` has zero pending deletions today).

**Board:** `task_board.in_progress[UC-GCP-P3]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Implemented the verifier's RESCOPE text verbatim, no re-expansion. Left the CANONICAL script (`scripts/agents-flow/drain-signals.js`) untouched — the changed staging/invariant lives in the flow-doc commit step, not the script's fingerprint/move logic.

Zone health: drain commit deletion-drop hole closed — tracked-only sweep captures deletions without risking peer untracked-inbox sweep; FP-safe invariant guards against false bug-telegrams on legitimate mid-commit arrivals | HEALTHY

## Session 2026-07-23 — UC-GCP-P7 (dev-team BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** git-ci-publish-P7 RESCOPE — /commit skill (1) still has a Step 4 branch-merge/clean section contradicting the no-branches invariant, (2) takes the git index with no commit-mutex across a multi-category run, (3) has no stranded-peer-file guard, (4) hardcodes a stale `Co-Authored-By: Claude Sonnet 4.6` line, and (5) has a live duplicate surface (`.claude/commands/commit.md`) that still describes branch-merge behavior.

**Actions taken:** Rewrote `.claude/skills/commit/SKILL.md`: deleted Step 4 "Merge and clean branch" + all "merge and clean branch" phrasing (frontmatter description, intro line); replaced the whole-run duplicated push shell with a per-category `commit-mutex:main` acquire→critical-section→release wrapper (`→ skill: .claude/skills/commit-mutex/SKILL.md`), pointing at that skill's Step 3d-PUSH as the bounded rebase-retry SSOT instead of re-pasting it; added a Step 1 stranded-peer-file age guard (skip files in another agent's declared zone per `commit-boundary/SKILL.md` RULE 2 with mtime < 2h, list skipped files for router triage); replaced the hardcoded `Co-Authored-By: Claude Sonnet 4.6` line with a pointer to `docs/policies/commit-convention.md` as trailer SSOT. Reduced `.claude/commands/commit.md` to a one-line pointer at the skill so `/commit` has exactly one definition.

**Verification:** Grepped repo-wide for other live (non-archival) callers referencing the deleted Step 4 / "merge and clean branch" text or the skill's old line numbers — none found outside the architecture-brief audit record itself (historical, not a live pointer) and one PO-decision snapshot that only names the file, not its content. Confirmed the rescope's named `commit-convention-format.md`/`-exemptions.md` split no longer exists — UC-GCP-P1 already consolidated both into the live `docs/policies/commit-convention.md`; pointed there instead of the dead split names. Used `Write` (full-file rewrite, not multi-hunk `Edit`) for the SKILL.md change per the rescope's own risk note (Edit-tool hook strips multiline edits on this file class).

**Board:** `task_board.in_progress[UC-GCP-P7]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Touched exactly the 2 files named in the rescope (`.claude/skills/commit/SKILL.md`, `.claude/commands/commit.md`). No code/tests in scope (skill-doc-only FIX). Left the other live hardcoded `Co-Authored-By: Claude Opus 4.6` occurrence in `docs/references/bundles/bundle-developer.md` untouched — outside this task's named file scope.

Zone health: `/commit` now has one definition, no branch-merge dead code, per-category mutex scoping matches commit-mutex's own TTL=90s sizing, stranded-peer-file guard closes the dirty-board-capture class, no hardcoded model-name trailer | HEALTHY
