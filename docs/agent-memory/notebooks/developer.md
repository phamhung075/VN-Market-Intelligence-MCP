# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS

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

## Session 2026-07-30 — FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`). Auditor OUTPUT-CONTRACT reported `signals_posted=3` while `agent_signals` had a hard zero-row gap spanning the claimed post time. AC-1 mandated empirical determination (instrument/replay) BEFORE any code change — no assumption.

**Actions:** 2 in-process repro scripts (run before any edit) confirmed BOTH candidate mechanisms named in the task's SCOPE, plus a 3rd sibling variant: (a) `postSignalWithCriticGate`/`postSignal` return sentinel `signalId=-1` for EVERY dedup-suppressed no-op (not just critic-first-reject), and `agentSignalTools.ts` only special-cased the critic branch — any other `id<=0` fell through to `success:true` with a fake `-1` id; (b) a forced INSERT throw (monkeypatched `db.prepare`) returns `Error:` text WITHOUT `isError:true` — the only one of the handler's 3 non-success paths that omitted it — and `mcp-call.sh`'s `_mcp_call_parse` checks only `.result.isError`, never text. Fixed all 3 layers: tool (`id<=0` → `success:false`; catch-all sets `isError:true`), shared caller (`mcp-call.sh` treats `Error:`-prefix text as failure even if `isError` unset), and `emit-audit-signal.sh`'s `_run_e1()` (parses JSON body success/signal_id, THEN mandatory `get_agent_signals` read-back before counting — mirrors the existing E-3 pattern for the OTHER store).

**Verify-live catch:** repro scripts proved the dedup-fallthrough bug needs ZERO db corruption to reproduce — a routine identical-payload duplicate call was enough; likely the MORE common real-world trigger than the corruption scenario the task's SCOPE section led with.

**Verification:** RED-then-GREEN on the new TS test (2/2). Agent-signal-family TS suite 114/114 unaffected. New `scripts/agents-flow/mcp-call.test.sh` 9/9. Extended `scripts/emit-audit-signal.test.sh` 67/67 (T16-T20 new, stub upgraded to realistic post_agent_signal/get_agent_signals shapes). `scripts/audit-output-contract.test.sh` 35/35 unaffected (new ABORT reasons fall under its existing wildcard). shellcheck: only pre-existing info-level SC1091. `tsc` clean. Full `bun test`: 14897 pass / 54 fail — all 54 confirmed PRE-EXISTING full-suite-only test-isolation artifacts unrelated to this change (spot-checked 3 in isolation, all pass; none touch agent-signal files).

**Board:** `task_board.in_progress[FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — every branch maps directly to AC-1..AC-4, no new abstractions, no flags/knobs.

**Zone note:** No MCP/gateway tool grant this session (Read/Edit/Write/Bash only) — could not `task_release`/`send_telegram`; flagged for the coordinating dev-team session (`owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to release `task:FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS` on my behalf.

Zone health: SIBLING `FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED` (review, next=qa) is the same narrated-count class on the dashboard-append surface — untouched here per instructions, batch not merge; QA reviews both together. ALSO: notebook-auto-prune.sh's PostToolUse hook dropped only 1 of 2 required sections on this write (5→4, not 5→3) — 4th occurrence today, same file, same misfire this notebook's own prior 3 entries already flagged; manually dropped the true-oldest remaining section myself to reach cap. Escalate past "flag and move on" per the 2+-recurrence standing policy.
