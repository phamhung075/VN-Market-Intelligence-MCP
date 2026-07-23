# Developer — Notebook

**Last updated:** 2026-07-23 | **Cycle:** FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY (shape-filter the dev-team mandatory persist guard)

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

## Session 2026-07-23 — TE-T17 (dev-team direct-execute, zone=multi) — REVIEW

**Task:** ops.md notebook hit 701L (3.5x cap) — PostToolUse auto-prune hook only matches Write|Edit, Bash-heredoc writes (07-11 Docker incidents) bypass it; class bug across all 30 notebooks.

**Actions taken:** (1) ops.md 1197L→29L (had grown past the 701L in the original finding) — 23 `## ` sections moved verbatim to new `docs/incidents/<date>-<slug>.md` files, one-line pointer left per incident. (2) New `scripts/agents-flow/notebook-linecap-sweep.sh` wired into `code-janitor/flow/main.md`'s existing 6h cron — sweeps all notebooks, delegates over-cap files to `notebook-auto-prune.sh`'s own drop-oldest logic via synthetic PostToolUse JSON (no duplicated pruning code, write-path-agnostic). (3) Blocking `wc -l` pre-commit gate added to ops's notebook-commit step. (4) `.test-notebook-prune-debug/` already absent — verified no-op.

**Verification:** `wc -l` ops.md = 29 (≤200L). 5/5 pre-existing `test-notebook-auto-prune.sh` cases still GREEN after the cross-reference comment edit. New `notebook-linecap-sweep.test.sh` 7/7 GREEN (fixture scoped via `NOTEBOOK_SWEEP_PATTERN` — never touches real notebooks), idempotent second run clean.

**Board:** `task_board.in_progress[TE-T17]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Two OTHER real notebooks (`agent-father.md` 303L, `system-auditor.md` 204L) are currently also over cap — left untouched (out of this task's named scope; will be caught by the new sweep on its next 6h cron fire) rather than expanding scope mid-task.

Zone health: notebook prune-bypass class closed — hot notebook (ops) under cap, sweep mechanism proven against synthetic fixtures + reuses tested hook logic, ops commit path gated | HEALTHY

## Session 2026-07-23 — FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY (dev-team BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** dev-team MANDATORY PERSIST GUARD counted RAW `docs/signals/*.json` files, not drainable (from/type-shaped) signals — cowork telemetry/tick residue (55 files live, e.g. `cowork-team-*`/`price_anomaly_*`) inflated the count past the >50 threshold and forced a full drain every tick even with nothing routable, feeding Step-1 triage starvation.

**Actions taken:** Extracted `drain-signals.js`'s inline "SKIP non-signal shape" check into a shared `isDrainableShape()` + new read-only `--count-drainable` subcommand (zero DB/file mutation). `drain-signals.md` guard item 1 and `dev-team-tick-preflight.sh` Step 5 idle-check field (a) both now call it instead of a raw `ls | wc -l` — single predicate, not forked, per the task's explicit instruction. Added `DRAIN_SIGNALS_DIR_OVERRIDE` env seam (mirrors `ORCH_APPLY_LIVE_FILE_OVERRIDE`) so preflight's isolated test fixtures reach the shared script.

**Verification:** Live-confirmed against the real inbox: raw=55, drainable=0 (matches the reported symptom exactly). 3 new fixtures in `drain-signals.test.js` (residue-only→0, genuine+litter mixed→1 negative control, missing-dir→0) — 31/31 GREEN. `dev-team-tick-preflight.test.sh`: T14 fixture upgraded `{}`→genuine `from`+`type` signal (negative control, still trips RUN); new T32 proves litter-only `SIGNALS_DIR` resolves RUN-IDLE — 91/91 GREEN. Self-caught mid-verification: first `sed \+` extraction is GNU-only BRE, silently no-op on BSD/macOS `sed` (this host) — always returned empty, masking the fix; replaced with portable bash parameter-expansion prefix-strip.

**Board:** `task_board.in_progress[FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** Touched exactly the 3 named root-cause files + their paired tests + `drain-signals.md` guard line + `docs/WORK.md` — no fork of the shape predicate, no live `docs/signals/` mutation from `--count-drainable` (read-only by design).

Zone health: dev-team persist-guard no longer litter-sensitive — drainable-only count verified against real inbox (55 raw / 0 drainable) and both fixture directions (litter-only no-trip, genuine signal still-trips) test-proven | HEALTHY
