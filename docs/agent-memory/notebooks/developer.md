# Developer — Notebook

**Last updated:** 2026-07-16 | **Cycle:** UC-GCP-P4 (sprint ULTRACODE-AUDIT-FIXALL, git-ci-publish-P4)

## Session 2026-07-15 — FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP (router dispatch, zone `cross-service/` = scripts/agents-flow/) — IN_PROGRESS→REVIEW

**Task:** `scripts/agents-flow/cowork-tick-preflight.sh` Step 2 heartbeated `session-presence:<session>` without ever claiming it first, so a fresh session's tick-1 (no presence row exists yet) got `ok=false` → verdict `ERROR` → full LLM fallback — inverting `docs/agents/cowork-team/flow/main.md` Step 0b.1's already-correct claim-first/never-a-gate contract. Origin: `docs/handoffs/2026-07-15-cowork-preflight-presence-claim-gap.md` (signal `cow-20260715T184053`).

**Actions taken:** Rewrote Step 2 to claim-first — `task_claim(session-presence:<session>, task_kind:"session-presence", owner_agent:"cowork-dispatcher", ttl_seconds:1800)`; if `claimed:false` and `current_holder.owner_client_session == session`, `task_heartbeat` renews TTL; proceeds unconditionally otherwise (peer-held or transport error). Removed both prior ERROR branches for presence. Updated header comment (L13 block). Test suite: rewrote old gating T3, added `T3-presence-fresh` / `T3-presence-reentrant` / `T3-presence-peer` (all assert SILENT, never ERROR), and tagged the stub's call-log with `task_kind`/`task_id` so tests can prove the presence claim never leaks into a `cowork-slot`-kind lock (exactly 1 `task_claim|cowork-slot` per run = the election only).

**Verification:** `bash scripts/agents-flow/cowork-tick-preflight.test.sh` — 27/27 GREEN (was 20/20 baseline; net +7 across rewritten/new presence cases). `bash -n` syntax-clean on both files. Live-verified twice against the real MCP server with disposable dummy `CLAUDE_CODE_SESSION_ID`s — verdict `SILENT` both times (not `ERROR`); `task_list_held(task_kind="cowork-slot")` showed no orphaned row from either smoke session. Decision journal: `sprint-FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP-developer.md`.

**Board:** NOT moved by developer this cycle — router explicitly holds the IN_PROGRESS→REVIEW flip on return (task pre-claimed by router session, do-not-self-flip per dispatch instruction).

**Scope discipline:** Touched only the two named files (`cowork-tick-preflight.sh`, `cowork-tick-preflight.test.sh`) + `docs/WORK.md` one-liner + this notebook + the decision journal. Did not touch the live-sourced script mid-tick (whole-file atomic Edit, no partial states). Did not chase the graphify incremental-update step this cycle — flagged, not silently skipped: `graphify-out/graph.json` is ~2 months stale project-wide, making a full `--update` disproportionate to a 2-line `WORK.md` touch on an `S`-size FIX; left for a dedicated doc-graph maintenance pass.

Zone health: `scripts/agents-flow/` cowork preflight — presence contract now matches `main.md` Step 0b.1; no other drift observed | HEALTHY

## Session 2026-07-16 — UC-GCP-P2 (dev-team BOUNDED-1 auto-pickup, zone `cross-service/`) — IN_PROGRESS→REVIEW

**Task:** `git-ci-publish-P2` (CONFIRMED) — signals.db + runtime logs + test debris were tracked and churned the tree every dev-team tick (228+ signals.db commits, ~20 preflight-lsof logs tracked despite an existing but too-narrow ignore rule).

**Actions taken:** `git rm --cached docs/signals/signals.db` (*.db rule already covers it going forward) + 5 churn session logs (fb-daily-firer(.error).log, fleet-push(.error).log, pm.log) + 13 preflight-lsof-*.log. Widened `.gitignore:20` `preflight-lsof-*.log` → `docs/agent-memory/sessions/*.log`. Deliberately did NOT rm --cached the frozen incident-evidence logs (headlock-h1-live-evidence-*, indexlock-race-evidence-*, ops-1912*) per the audit's own non-blocking nit — verified `git check-ignore` reports a tracked file as NOT ignored (with index consulted) even though the pattern textually matches, so no negation pattern was needed. Appended `.test-notebook-prune-debug/` + `/scratchpad_*.txt` debris patterns. Edited `drain-signals.md` MANDATORY-PERSIST-GUARD to drop `signals.db` from the commit-path list (kept the mtime freshness check) — verified `git add docs/signals/signals.db` exits 1 pre-fix, confirming the edit is load-bearing.

**Verification:** `scripts/agents-flow/drain-signals.test.js` 15/15 PASS (unaffected fixture suite — script never git-adds the DB). `bun tsc --noEmit` clean. Pre-push hook tsc OK, pushed `40727dc17..c34b7fcc9`. Self-caught a pathspec-commit bug mid-task: first commit (`git commit -m ... -- <pathspec>`) silently re-synced the index from the CURRENT WORKING TREE for the listed deletion paths, undoing the `--cached` removals (still on disk); caught via `git ls-files` + `git diff HEAD~1 HEAD` showing zero change. Corrective commit re-ran `git rm --cached` + committed with a bare `git commit -m` (index independently verified scoped to only this task's paths first).

**Board:** Moved `task_board.in_progress[UC-GCP-P2]` → `task_board.review[]` (status REVIEW, next_agent=qa) + `.head`/`.task_board.head` synced to idle, via `orch-apply.sh` (conservation OK, task_total unchanged at 543). Commits: `476c331d4` (gitignore+flow-doc), `c34b7fcc9` (corrective untrack). Decision journal: `sprint-ULTRACODE-AUDIT-FIXALL-developer.md` STEP developer-S8.

**Scope discipline:** Touched only `.gitignore`, `docs/agents/dev-team/flow/drain-signals.md`, and the 15 rm --cached deletions. Did NOT touch `tool-usage-stats.json`/`coverage-state.json` (SYSREMAKE-P2 RC-GITSTATE's scope) or any of the 40+ peer-dirty files already in the tree (cowork notebooks, analysis-briefs, session logs, orch-state.json edits from other agents).

Zone health: repo-root git-state plane — signals.db + churn logs now correctly untracked; drain path verified intact | HEALTHY

## Session 2026-07-16 — UC-GCP-P4 (dev-team BOUNDED-1 auto-pickup, zone `cross-service/`) — IN_PROGRESS→REVIEW

**Task:** `git-ci-publish-P4` (CONFIRMED) — every push (even doc/notebook/orch-state-only, ~68% of commits) paid the full `pnpm --filter vn-market check` tsc (~94s wall-clock, over the commit-mutex 90s TTL), stranding the fleet on unrelated red and letting a peer `task_claim` win mid-push.

**Actions taken:** `scripts/git-hooks/pre-push` now loops ALL stdin ref lines, computes `git diff --name-only <remote>..<local>` per line, and skips the full tsc only if NO line matches `^(apps|packages|scripts)/.*\.(ts|tsx|js|mjs|json)$` or root `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml` (docs/ excluded). All 4 mandatory hardenings: (a) fail-open full tsc if `git diff` fails, guarded inside an `if` so it never hits the bare `set -e` abort; (b) all-zero local-sha (branch-delete) lines skipped; (c) ANY code-touching line across multiple stdin refs forces full tsc (drains all stdin, no early break); (d) root dependency files added to the code-touching set. Zero-remote-sha (new branch) always runs full tsc.

**Verification:** `bash -n` + `shellcheck` clean (one SC2034 on the intentionally-unused `remote_ref` field silenced inline — documents the 4-field stdin protocol). 9 simulated stdin scenarios against a throwaway repo + fake-pnpm stub: doc-only→skip/no-call, code-touching→full-tsc/call, fail-open (bogus remote sha)→full-tsc, new-branch (zero remote sha)→full-tsc, branch-delete (zero local sha)→skip, multi-line doc+code→full-tsc (ANY-rule), `PRE_PUSH_SKIP_TSC=1`→skip untouched, no-pnpm-on-PATH→WARN untouched, root `package.json`→full-tsc. All matched spec.

**Board:** Moving `task_board.in_progress[UC-GCP-P4]` → `task_board.review[]` (status REVIEW, next_agent=qa) + `.head`/`.task_board.head` synced to idle, via `orch-apply.sh`.

**Scope discipline:** Touched ONLY `scripts/git-hooks/pre-push` (sole in-scope file) + `docs/WORK.md` one-liner + this notebook + decision journal. Shell-only hook edit, no `.ts` touched — no tsc/full-suite run needed per the task's own verification bar. Did not touch commit-mutex TTL/SKILL.md — the residual code-touching-push mutex-overrun (~94s > 90s TTL) is an explicit out-of-scope follow-up per the brief.

Zone health: `scripts/git-hooks/` pre-push tsc gate — path-filter live, escape hatch + no-pnpm WARN branches intact; no other drift observed | HEALTHY
