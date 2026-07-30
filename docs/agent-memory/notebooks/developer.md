# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL

## Session 2026-07-30 — FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL — REVIEW

**Task:** dev-team BOUNDED-1 idle-capacity auto-pickup (`cross-service/`), two arms. Arm 1: `dev-team-tick-preflight.sh:454-455` bare `git commit` (2x/hourly actuator). Arm 2: 31-file `chore(memory/<agent-id>)` notebook-commit long-tail, deferred by an agent-father completion note to "a separate PM-tracked cleanup pass" that was never minted onto the board.

**Actions:** Arm 1 — RAW-checked the live file BEFORE implementing (per `feedback_known_failure_shape_pattern_matched_without_reading_call_order`): already fixed pre-existing by commit `fc8a8d4f1` (6h after PO's own measurement this task was minted from). No code change — re-doing it would be pure churn. Arm 2 — found the deferred note (`agent_father_completion_20260729` field on the LAYER2 row, not `po_closure_20260730`), grepped `docs/agents/`+`.claude/skills/` for `chore(memory` sites: 34 total, 3 already pathspec-scoped, 31 genuinely bare — exact match to PO's count. Implemented directly (mechanical, identical pattern to the 3 already-fixed reference sites) rather than minting a new row: appended `-- <exact own path(s)>` to all 31, backslash-continuation form for the 4 multi-path sites, shell-glob `docs/signals/processed/*` for `unified-agent/chef.md` (architecture brief §2.3 forbids literal directory pathspecs on the commit line).

**Decisive finding:** `docs/agents/bctc-analyst/flow/stage-log-notify.md` had an unrelated peer-written unstaged hunk mid-task. Isolated my hunk via `git apply --cached` (verified staged==mine, unstaged==peer's), then ran the mandated `git commit -- <path>` anyway swept BOTH hunks into one commit — reproduced cleanly in a scratch repo: `git commit -m ... -- <path>` uses git's own `--only`-when-pathspec-given semantics, reading the WORKING TREE (not the index) for the named path. Pathspec-scoped single-file commits — the exact pattern this whole sweep-guard family ships as "safe" — do NOT protect against same-file intra-file hunk sweep, only cross-file peer-staged sweep. Not destructive (content fully recoverable, `git show 2f16eea16`), but flagged to PO as load-bearing for the fleet-wide `GIT_SWEEP_GUARD_MODE=reject` decision.

**Verification:** `scripts/audits/verify-commit-sweep-discriminator.sh` VERDICT PASS (git 2.49.0); `scripts/git-hooks/pre-commit.test.sh` 6/6 PASS; `bash -n` clean on the (unchanged) preflight script; post-fix re-grep of all 34 sites confirms 0 bare remain. No `apps/` TS/Go touched (zone `cross-service/`, pure md+bash+jq) — `bun test`/`tsc` N/A.

**Board:** `task_board.in_progress[FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL]` → `review` (`next_agent: po` — parent-close + same-file-sweep-gap judgment call), lane-moved `in_progress[]→review[]`, `.head` reset to idle, same `orch-apply.sh` write.

**Also flagged, out of this row's scope, not fixed:** `docs/agents/tools/package/cowork-refactory-expert.md:57` has a distinct bare-commit-with-directory-add example (`git add .claude/cowork/ && git commit -m "..."`) — different message shape, not part of the 31/34-count grep, not named in either arm; left untouched per "never touch files outside assigned task scope."

**Zone note:** No MCP/gateway tool grant this session (Read/Edit/Write/Bash only) — could not `task_release`/`send_telegram`; flagged for the coordinating dev-team session (`owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to release `task:FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL` on my behalf.

## Session 2026-07-30 — FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS — REVIEW

**Task:** dev-team BOUNDED-1 idle-capacity auto-pickup (`cross-service/`), PO triage `chore(po): triage 2026-07-30T19:07Z` mint. `wip_in_progress` (`scripts/lib/devteam-eligibility.jq`) was a bare `.task_board.in_progress|length` — a row flipped IN_PROGRESS→BLOCKED and left parked in `in_progress[]` (live: `FU-CNYVND-DEAD-FIELD-REMOVE`) consumed a full concurrency slot forever, freezing BOUNDED-1/SLS/RLC/DRS fleet-wide for ~2.5h at wip=2=cap.

**Actions:** READ side — `wip_in_progress` now excludes BLOCKED/`TERMINAL_SET` rows (relocated the existing `is_terminal_task_status`/`normalize_task_status` defs earlier in the file, reused not re-hardcoded). Grepping `main.md` found its own WIP/WIP2/WIP3/WIP4 gate checks were bare `jq` calls, NEVER `include`-ing the shared lib — fixed all 4 call sites to actually call `wip_in_progress` (AC-2's "no duplicate logic" required this, else the lib fix would be dead code against the live gates). WRITE side — added an explicit BLOCKED-disambiguation bullet to `execute-tier.md`'s CANONICAL:SSOT-STATUSFLIP-LANEMOVE clause (target lane = `backlog[]`, matching PO's own live containment action); WF-1's BLOCKED-task check now lane-moves `in_progress[]→backlog[]` as a self-healing backstop, and its status lookup was widened from active_sprints-only (which actively crashes on the live board's null-`.tasks` sprint-stub shape) to also scan the flat `in_progress[]` lane.

**Verify-live catch:** the OLD WF-1 status query, run directly against the LIVE `orch-state.json`, threw `jq: error ... Cannot iterate over null` — it wasn't just missing flat-lane rows silently, it was structurally broken against the live board's shape.

**Verification:** `scripts/audits/devteam-dispatch-gate-satisfiability.sh` 54/54 PASS (was 48/48; +6 new `AC-WIP-BLOCKED-*` assertions: BLOCKED+IN_PROGRESS mix reads `wip_in_progress=1` not raw-2, SLS non-vacuously fires under it; 2×IN_PROGRESS still reads 2). 5 sibling `devteam-eligibility.jq` consumer scripts re-run clean; one pre-existing `bounded1-supervised-lane-report.sh` exit=1 (5 unrelated live-data rows) confirmed byte-identical via `git stash` A/B. `bun scripts/orch-validate.mjs` on the live board still PASS. No `apps/` TS/Go touched (zone `cross-service/`, pure jq+bash+md) — `bun test`/`tsc` N/A.

**Board:** `task_board.in_progress[FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS]` → `review` (`next_agent: qa`), lane-moved `in_progress[]→review[]`, `.head` reset to idle, same `orch-apply.sh` write.

**Zone note:** No MCP/gateway tool grant this session (Read/Edit/Write/Bash only) — could not `task_release`/`send_telegram`; flagged for the coordinating dev-team session (`owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to release `task:FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS` on my behalf.

## Session 2026-07-30 — FIX-SCRIPTS-MIGRATIONS-MARKETDB-WAL-REARM-SAME-DEFECT — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`scripts/`). Sibling fix `FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION` (apps/mcp-server/schema.ts's DELETE-mode mitigation) found the IDENTICAL defect shape surviving in 4 `scripts/migrations/*.ts` files, each opening its own raw connection to `market.db` and unconditionally re-arming WAL for the duration of its run.

**Actions:** Removed `db.exec("PRAGMA journal_mode = WAL")` from all 4 sites (run-finalize-bctc-refine.ts:36, dedupe-mislabeled-bctc-period.ts:368, resync-watchlist-sysmap-2026-07-11.ts:266, carry-forward-bctc-orphaned-rows.ts:361). Considered importing schema.ts's `getDb()`/`closeDb()` singleton, but 3/4 files' own header comments document `docker cp <file> .../app/` flat-invocation as their live-DB path — a relative up-tree import to apps/mcp-server/src breaks there (resync-watchlist's own comment says so explicitly); chose the simpler, uniform fix (delete the line) since journal_mode persists in the DB file itself, not per-connection.

**Verify-live catch:** ran all 4 fixed scripts in their own read-only verify/dry-run mode (no `--apply`) against the LIVE bind-mounted `data/live/market.db` (host path, same inode the container serves) to prove empirically — not just trivially — that none re-arms WAL: journal_mode stayed `delete` and no fresh `-wal`/`-shm` pair appeared after each of the 4 runs.

**Verification:** `bash scripts/audits/verify-market-db-journal-mode.sh` → PASS, exit 0, re-run 5x (baseline + once after each of the 4 scripts executed). Did not touch coordination.db or any test fixture (out of scope per task).

**Board:** `task_board.in_progress[FIX-SCRIPTS-MIGRATIONS-MARKETDB-WAL-REARM-SAME-DEFECT]` → dev-team's job (board flip, lane move, `.head` reset, lock release) — no MCP/gateway tool grant this session (Read/Edit/Write/Bash only).

**Zone note:** flagged for the coordinating dev-team session (`owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to release `task:FIX-SCRIPTS-MIGRATIONS-MARKETDB-WAL-REARM-SAME-DEFECT` and flip board status on my behalf.
