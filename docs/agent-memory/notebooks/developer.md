# Developer — Notebook

**Last updated:** 2026-07-23 | **Cycle:** UC-GCP-P8 (stranded machine-state sweep)

## Session 2026-07-23 — UC-MDH-P4 (dev-team BOUNDED-1 auto-pickup, cross-service/) — REVIEW

**Task:** memory-docs-hygiene-P4 (P1 FIX) — `docs/data/file-size-caps.json` had promised "Archived → docs/archive/decisions/ at sprint close by pm" since inception; no script and no flow step ever implemented it. RESCOPE spec: new `decision-journal-archive.sh` (longest-match closed-vs-active, never bare prefix glob) + pm/task-archive.md pointer.

**Actions taken:** New `scripts/agents-flow/decision-journal-archive.sh` — stdin mode (per-cycle diff) + `--all` backfill mode + `--dry-run` (added for safe live verification, not in the rescope contract). Wired as `pm/task-archive.md` Step 5.5 (after Step 5, not the earlier Sprint-Eviction orch-apply block, since sprints close via both paths) + extended Step 6's commit pathspec for the old+new journal paths. CANONICAL pointer in `dev-standards.md`.

**Verification:** Paired `decision-journal-archive.test.sh` — 26/26 PASS, fully sandboxed (`DJA_GIT_MV=0`, mktemp -d fixture, never touches live `docs/agent-memory/decisions/`) — covers the live `OHLCV-UNIT-CONTAM`/`OHLCV-UNIT-CONTAM-WHOLEROW-LT1000` prefix-collision shape, stdin scoping, `--all`, bare+agent-suffixed forms, no-orch-record files left+counted, mtime-independence, idempotency, and collision safety. `--dry-run` against the live repo confirmed 202/431 eligible with zero mutation (`git status`/file-count unchanged before/after).

**Board:** `task_board.in_progress[UC-MDH-P4]` → `review`, `next_agent=qa`, `.head` synced, via `orch-apply.sh`.

**Scope discipline:** File-ops-only, no orch-state.json write (jq reads only). Did NOT run the one-time live backfill (mutating, out of this FIX's scope) — left as a follow-up PO-routed action; only a read-only `--dry-run` was executed live.

Zone health: sprint-journal archival promise now real — `docs/agent-memory/decisions/` 431 files, 202 backfill-eligible (verified dry, not moved), 24 correctly excluded as still-active, 205 have no orch record (left in place, reported) | HEALTHY

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
