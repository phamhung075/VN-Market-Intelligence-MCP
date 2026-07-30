# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FIX-SCRIPTS-MIGRATIONS-MARKETDB-WAL-REARM-SAME-DEFECT

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

## Session 2026-07-30 — FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-OVERWRITE — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`), PO ratification `ruling-20260730T0906Z-po-triage-po.md` STEP po-4. Three dev-team claim scripts (`devteam-backlog-claim-bounded1.jq`, `devteam-backlog-claim-supervised-lane-sweep.jq`, `devteam-backlog-claim-ready-lane-consumer.jq`) performed an UNCONDITIONAL `.head` replace instead of a conditional guard — confirmed LIVE risk: `.head` was genuinely occupied by an in-flight supervised task (`FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD`) at the exact tick this row was minted, while all 3 scripts sat live in the same head-idle fall-through dispatch chain.

**Actions:** Mirrored the already-shipped, PO-ratified `$head_free` conditional-guard shape from `devteam-backlog-claim-design-router-sweep.jq` (DRS) onto all 3 scripts, exactly as instructed — no new pattern invented. SLS needed the guard in BOTH its PRIMARY and FALLBACK `.head` write branches (2 call sites, one shared `$head_free` computed once). Happy path (head idle/done/active_task_id-null) behavior unchanged; when a DIFFERENT task is genuinely live in `.head`, the write is now skipped instead of clobbering the live resume pointer.

**Verify-live catch:** the live board's own `.head` was occupied by THIS task itself while running this fix — a real (not synthetic) exercise of the guard's busy-branch at the one live BOUNDED-1 call site, though the isolated fixture tests below are what actually prove the negative-control case (a DIFFERENT task's `.head` byte-identical after claim).

**Verification:** Extended `scripts/audits/devteam-dispatch-gate-satisfiability.sh` with 8 new isolated single-row-fixture assertions (AC-BOUNDED1-HEAD-GUARD, AC-SLS-HEAD-GUARD PRIMARY+FALLBACK, AC-RLC-HEAD-GUARD — each with a positive half proving the row still moves `ready[]→in_progress[]` while `.head` stays untouched). Full suite 48/48 PASS, never writes to the live file. No `apps/` TS/Go source touched (zone `cross-service/`, pure jq+bash) — `bun test`/`tsc` structurally N/A.

**Board:** flipped `IN_PROGRESS`→`REVIEW`, `next_agent:"qa"`, lane-moved `in_progress[]`→`review[]`, and reset `.head` to `{status:"idle", active_task_id:null, next_agent:"router"}` in the SAME `orch-apply.sh` write (branch:null direct-execute path, per `execute-tier.md`'s `CANONICAL:SSOT-STATUSFLIP-LANEMOVE`).

**Zone note:** No MCP/gateway tool grant this session (Read/Edit/Write/Glob/Grep/Bash only, confirmed at Step 0) — could not `task_release`/`send_telegram`; flagged for the coordinating dev-team session (`owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to release `task:FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-OVERWRITE` on my behalf.

## Session 2026-07-30 — FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST — REVIEW

**Task:** dev-team BOUNDED-1 idle-capacity dispatch (`cross-service/`), PO-triaged P1 root-cause fix for the recurring (3x today, this notebook) same-day tie-break defect: `notebook-auto-prune.sh`'s lossy 17-char ts_key ties multiple date-only headings, and the old stable-sort-then-`head -1` always dropped the physically-first tied section — correct only for an oldest-first/append notebook, wrong (drops the newest) for a newest-first/prepend one like this file.

**Actions:** Tie-break now resolves the minimum-key GROUP direction-aware: drop physically-LAST for newest_first (this file), physically-FIRST for oldest_first. Direction derives from the file's own distinguishable section timestamps first (43/46 live notebooks need zero config); new `docs/data/notebook-section-order.json` declares the 3 confirmed-ambiguous files (developer.md=newest_first, dev-frontend.md/dev-mcp-server.md=oldest_first, each verified via `git log -1 -p`). Unresolved+no-override now fails loud (`notebook_tiebreak_direction_unresolved_breach` signal, no truncation) instead of guessing.

**Verify-live catch:** RED→GREEN A/B against a REAL padded copy of THIS file: pre-fix script wrongly kept only the oldest section (would have dropped this very entry once written); post-fix keeps only the newest (physically-first) section under identical multi-drop pressure.

**Verification:** `notebook-auto-prune.test.sh` 7/7 PASS (T1-T4 pre-existing unaffected + new T5 prepend/T6 append/T7 unresolved-safe-fail). Sibling legacy `test-notebook-auto-prune.sh` 5/5 unaffected (untouched, flagged as a likely stale duplicate for code-janitor, out of scope). shellcheck: same 1 pre-existing unrelated info-only finding, none new. No `apps/` touched — `bun test`/`tsc` N/A.

**Board:** `task_board.in_progress[FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Zone note:** No MCP/gateway tool grant this session (Read/Edit/Write/Bash only, confirmed at Step 0) — could not `task_release`/`send_telegram`; flagged for the coordinating dev-team session (`owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to release `task:FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST` on my behalf.

Zone health: closes the recurring misfire flagged in this notebook's own prior 3 sections today ("3rd occurrence today, same file") — first cycle this class gets a root-cause fix instead of a same-cycle manual workaround.
