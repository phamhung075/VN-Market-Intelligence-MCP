## Task Report UC-MDH-P3

**Mode:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `branch:null` — committed straight to `main`, no `task/NNN-*` branch)
**Title:** memory-prune-sweep.sh wired into code-janitor (sessions >14d, dead health rechecks, legacy session-logs, root debris)
**Commits verified:** `d88c1bc6d` (impl + sweep + docs) · `2d5cfbf80` (developer notebook) — both confirmed on `main` ancestry via `git merge-base --is-ancestor`.

### changed
- `scripts/agents-flow/memory-prune-sweep.sh:1-177` (new)
- `scripts/agents-flow/memory-prune-sweep.test.sh:1-155` (new)
- `docs/agents/code-janitor/flow/main.md:69-110` (§ Memory Prune Sweep, new)
- `docs/policies/dev-standards.md:28-40` (§ Script Persistence CANONICAL pointer, new)
- `docs/agent-memory/sessions/archive/.retention.md:21-42` (extended, 4 new rules)
- 77 files total in `d88c1bc6d` incl. the live sweep's own moved/deleted paths (46 `health/team-tool-recheck-*.md` deleted, 15 `sessions/*.md` archived, 5 `session-logs/*.md` folded, 3 root `scheduled-task-execution-*.md` relocated, 1 `docs/signals/janitor-health-recheck-writer-retired-2026-07-23.json` payload)

### tests
`bash scripts/agents-flow/memory-prune-sweep.test.sh` — **12 pass / 0 fail** (re-run live, not accepted from prose). Sandboxed via `mktemp -d` + `trap cleanup EXIT`, `AGENT_MEMORY_ROOT`/`MPS_SIGNALS_DIR` env overrides point off-tree — confirmed zero live-tree writes from the test run itself (the one pre-existing `docs/signals/janitor-health-recheck-writer-retired-2026-07-23.json` deletion in `git status` was caused by an unrelated dev-team drain tick moving the file to `docs/signals/processed/`, independently confirmed via that file's presence there + a `signal_queue.rows[]` row already referencing the moved path).

`bash -n` syntax check: both scripts OK. `shellcheck`: 0 real findings (1 info-level SC2329 false positive on `cleanup()`, invoked indirectly via `trap`).

tsc: N/A (shell-only, zero `.ts` touched — Smart-Skip correctly applies) | ddd: PASS (zero `from.*infrastructure`/`from.*application` hits) | security: PASS (zero `process.env`/secrets hits)

### DDD / mock-guard / security
`bash scripts/audits/mock-guard.sh --files "scripts/agents-flow/memory-prune-sweep.sh scripts/agents-flow/memory-prune-sweep.test.sh docs/agents/code-janitor/flow/main.md docs/policies/dev-standards.md docs/agent-memory/sessions/archive/.retention.md"` → `No production source files to scan. PASS.`

### Verification detail (raw, at source)
1. **File-ops-ONLY, never touches orch-state.json** — grep-confirmed: the script's only 2 `orch-state` hits are comment lines documenting the exclusion; zero code path in the 177-line script references the file.
2. **Idempotent** — test harness Run 2 (same fixture, no reset) asserts `sessions_archived=0 health_deleted=0 session_logs_folded=0 scheduled_archived=0 signal_written=0` and no duplicate PO payload — PASS. Independently confirmed against the LIVE tree beyond the test harness: `session-logs/` dir gone, 0 root `scheduled-task-execution-*.md` remaining, 0 `team-tool-recheck-*.md` >30d remaining, 0 `sessions/*.md` >14d unarchived, and all `.log`/`.json` writers in `sessions/` root left untouched — matches the commit's claimed live-run counts (15/46/5/3/1) and `.retention.md`'s documented rules exactly.
3. **Four sweeps behave per spec** — read the full 177L source: (1) archives `sessions/*.md` >14d (`MPS_SESSION_MAX_AGE_DAYS`, default 14) into `sessions/archive/`, `-maxdepth 1 -name "*.md"` filter leaves `.log`/`.json` writers untouched; (2) deletes `health/team-tool-recheck-*.md` >30d (`MPS_HEALTH_MAX_AGE_DAYS`, default 30) + writes ONE idempotent PO-decision payload to `docs/signals/` (skipped on re-run once any prior payload exists — write-once-ever, not per-cycle); (3) folds `session-logs/*.md` into `sessions/archive/`, then `rmdir`s the now-empty dir; (4) relocates root `scheduled-task-execution-*.md` into `docs/agent-memory/archive/`. `AGENT_MEMORY_ROOT`/`MPS_SIGNALS_DIR`/`MPS_SESSION_MAX_AGE_DAYS`/`MPS_HEALTH_MAX_AGE_DAYS` all respected (source lines 60-69; exercised live by the test harness).
4. **code-janitor wiring** — `docs/agents/code-janitor/flow/main.md` § Memory Prune Sweep (new, lines 69-110) invokes the script every scan (before § Memory + State) and documents the SSOT-W1 boundary explicitly: the script writes the payload FILE only; the `.signal_queue.rows[]` append is the FLOW step's job via `.claude/skills/signal-dashboard/SKILL.md`. Verified this boundary held OPERATIONALLY, not just on paper — found the actual `signal_queue.rows[]` entry (`id: janitor-health-recheck-writer-retired-20260723`, `note: "dev-team drain durable delivery: file-only PO payload appended to signal_queue for PO triage"`) confirming a flow step (not the script) performed the append, exactly per the documented boundary.
5. **Docs** — `docs/agent-memory/sessions/archive/.retention.md` extended with all 4 new rules (sessions/*.md, health/team-tool-recheck-*.md, session-logs/, scheduled-task-execution-*.md), each naming the script + rationale. `docs/policies/dev-standards.md` § Script Persistence carries the CANONICAL pointer (lines 28-40), including the test-script pointer.
6. **Developer DJ-GATE-1** — `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-developer.md` STEP developer-S17, `task-id: UC-MDH-P3` present and matching.

No blocking issues found.

### verdict
**APPROVED** — direct-commit verify, no branch/merge (already on `main`).

### board disposition
`task_board.review[] -> task_board.done_verified[]` (status `REVIEW -> DONE_VERIFIED`), `qa_verdict=APPROVED`, `qa_verified_at=2026-07-23T04:58:09Z`, `qa_commit=d88c1bc6d`, `branch=null`, `next_agent` removed (terminal) — single `orch-apply.sh` write, Zod + conservation PASS (task_total 623=623, signal_total 108=108). `.head` synced to idle/`active_task_id:null`/`next_agent=pm` in the SAME write (CANONICAL:SSOT-STATUSFLIP-LANEMOVE).
