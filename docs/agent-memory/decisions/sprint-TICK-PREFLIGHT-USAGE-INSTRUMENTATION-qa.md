# Decision Journal — Sprint TICK-PREFLIGHT-USAGE-INSTRUMENTATION · qa

**Sprint goal:** Replace the engineering-estimate silent-tick cost with a measured number — WU-0 ships the shared jq-only usage-telemetry lib all 3 cron scripts will later wire into.
**Agent:** qa
**Started:** 2026-08-12T14:05:00Z

---

### STEP qa-S1 · qa · 2026-08-12T14:07:00Z
**task-id:** TICK-WU-0-TELEMETRY-LIB
**what-done:** Direct-commit verify (commits `053d8bf6e`+`98e97c4ce`) against `TASK_TICK-WU-0-TELEMETRY-LIB.md` AC-1..AC-11 and the architect's ratified blueprint. RAW-verified, not trusted from developer's own prose: re-ran `tick-telemetry.test.sh` (53/53) + all 3 pre-existing baseline suites (cowork 40/40, dev-team 124/124, auditor 181/181) myself; read AC-4/AC-5/AC-6 fault-injection tests (T8/T9/T10) and confirmed each genuinely exercises the mandated negative-control behavior; diffed both claimed architect-pseudocode bug-fixes (EPOCHREALTIME `10#` base-prefix, `_tt_log_path` fallback depth 2→3) against the actual ratified pseudocode in the BA-spec — both real, both correct, no silent deviation elsewhere; confirmed `git show --stat 053d8bf6e` touches none of the 3 target scripts nor `orch-state.json`; confirmed `.gitignore` entries match `_tt_log_path`/`_tt_rotate`'s actual write paths; confirmed `dev-standards.md` CANONICAL block format matches sibling blocks; ran shellcheck myself (clean at `-S warning`, only SC1091/SC2329 info at default).
**what-considered:**
- only path: every specific claim in the router's dispatch list was independently checked against source/live-run, not accepted from the developer's Implementation Record.
**why-decision:** All 11 ACs verified true against actual code/test-run evidence, both flagged deviations from architect pseudocode are real bugs correctly fixed within the architect's own stated design intent (no new subprocess, same resolution order), zero scope creep, zero regression to the 3 baseline suites. APPROVED — DONE_VERIFIED.
**why-change:** no change from plan.

---

### STEP qa-S2 · qa · 2026-08-12T14:07:30Z
**task-id:** TICK-WU-0-TELEMETRY-LIB
**what-done:** Flipped `TICK-WU-0-TELEMETRY-LIB` REVIEW→DONE_VERIFIED via `jq | scripts/orch-apply.sh` (attached `verification.raw_probe{tool,args,live_value_observed,observed_at}` per schema requirement — validator rejected the first attempt without it). `next_agent: pm` set on the row (pm's job to decompose/dispatch WU-1/WU-2, not qa's).
**what-considered:**
- Commit `docs/data/orch/orch-state.json` alongside my own status flip.
- Apply the flip live via orch-apply.sh but leave the file uncommitted, mirroring developer's own discipline (their commit 053d8bf6e explicitly excluded orch-state.json).
**why-decision:** the live file currently carries ~76 insertions/75 deletions of unrelated peer-agent dirt from other concurrent sessions (uncommitted). Committing the file now would sweep all of that unrelated state into a commit whose message only describes this one task's gate-flip — same class of problem this project's memory (`feedback_router_commit_captures_dirty_board`, `project_commit_zone_excluded_agent_ships_board_stays_stale`) warns against. Left uncommitted for a dedicated board-commit sweep; my own [QA] Review Record + this journal + notebook are committed separately, pathspec-scoped.
**why-change:** no change from plan — flow doc's default `verify-committed` lane-move step describes moving `qa[]→done_verified[]` array entries (this task lives in `active_sprints[].tasks[]` instead, a differently-shaped board location) and doesn't itself carry an explicit "commit orch-state.json" instruction either way; applied the stricter peer-dirt-avoidance discipline per the router's explicit instruction for this task.

---

### STEP qa-S3 · qa · 2026-08-12T14:30:00Z
**task-id:** TICK-WU-1-COWORK-WIRING / TICK-WU-2-DEVTEAM-WIRING
**what-done:** Direct-commit verify of both, dispatched as a router-independent RAW-verify cycle (not trusting developer's self-report prose). For each: (1) `git show --stat`/`git show` on the production commit (`976e7c5b7`/`ac53ec856`) — confirmed the diff is EXACTLY the claimed 1 new source line + trailer swap + comment block inside the `.sh`, and a pure-append (0 deletions) test-file diff; zero touches inside `run_preflight()`/`_emit_verdict()`/Step 5.5/any `return` site, zero touch to `orch-state.json`. (2) Re-ran both test suites myself: cowork 58/58, dev-team 146/146 — exact match to claim. (3) Independently re-verified the AC-10 PRE-EDIT baseline (not trusted from the developer/WU-0-QA journal chain alone) by checking out the immediate parent commit into a disposable `git worktree` and running both suites there: 40/40 and 124/124 — exact match. (4) `shellcheck -S warning` on all 4 touched files myself — clean, exit 0. (5) `grep`-confirmed `CLAUDE_CODE_SESSION_ID` never appears inside either script's `log_tick_usage`/`tt_capture_and_log` call path — the only references are each script's own pre-existing presence/error-message logic, untouched by this diff. (6) Live standalone smoke-run of BOTH wired trailers beyond the test suite's stubbed calls (`bash <script>.sh` directly, `CLAUDE_CODE_SESSION_ID` exported, `PREFLIGHT_ROOT` pointed at a scratch tree): both produced exactly one valid JSON stdout document, exit codes matched their real verdicts (cowork ERROR→1, dev-team SKIP→0), telemetry lines were written with the correct 7-key shape, and `grep` of the exported session-id against the log files found zero matches. (7) Confirmed `docs/agents/cowork-team/flow/main.md`/`docs/agents/dev-team/flow/main.md` still show the identical single-bash-call invocation line — no new tool call added to the LLM-visible silent/skip path. (8) `grep`-confirmed zero `python3` invocations in any touched file (jq-only, matches claim). (9) Read WU-2's T-LOG6 R6 test source directly — confirmed it genuinely overrides `_step55_run_validate` (the correct, still-unfixed R6 site, distinct from the already-fixed `_step55_run_cold_evict`) and asserts a real leak-reaches-stdout negative control before asserting the graceful `verdict:"UNKNOWN"` degrade — not a fabricated/synthetic test.
**what-considered:**
- only path: every specific claim in the router's dispatch list (test counts, shellcheck, diff scope, session-id absence, stdout/exit-code byte-identity, no-new-tool-call) was independently checked against source/live-run, not accepted from developer's Implementation Record prose.
**why-decision:** All hard constraints upheld: `CLAUDE_CODE_SESSION_ID` never logged; verdict/exit-code/stdout/lock behavior byte-for-byte unchanged (confirmed both structurally via diff and empirically via live smoke-run + AC-2/AC-3 byte-identity test T-LOG4 on both); zero new tool call on the silent/skip path; jq-only. Both test suites pass at the exact claimed counts, both re-verified pre-edit baselines match independently. APPROVED — DONE_VERIFIED for both.
**why-change:** no change from plan.

---

### STEP qa-S4 · qa · 2026-08-12T14:30:30Z
**task-id:** TICK-WU-1-COWORK-WIRING / TICK-WU-2-DEVTEAM-WIRING
**what-done:** Appended `[QA] Review Record` to both `docs/handoffs/TASK_TICK-WU-1-COWORK-WIRING.md` and `docs/handoffs/TASK_TICK-WU-2-DEVTEAM-WIRING.md`. Flipped both `REVIEW→DONE_VERIFIED` via a single `jq | scripts/orch-apply.sh` transform (attached `verification.raw_probe{tool,args,live_value_observed,observed_at}` per this sprint's established validator requirement, `commit_sha`, `qa_verified_by`, `qa_verified_at`, `next_agent: pm` — mirrors WU-0's own QA-cycle row shape exactly). `orch-apply.sh` Stage 1g surfaced 16 pre-existing unrelated dependency-resolution warnings (non-fatal, none touching this sprint) — expected noise, not caused by this write.
**what-considered:**
- Commit `docs/data/orch/orch-state.json` alongside my own status flip.
- Apply the flip live via orch-apply.sh but leave the file uncommitted, mirroring WU-0's QA-cycle discipline.
**why-decision:** the live file still carries substantial unrelated uncommitted peer-agent dirt from other concurrent sessions (per router's own note this sprint). Committing it now would sweep that unrelated state into a commit whose message only describes this gate-flip — same class of problem `feedback_router_commit_captures_dirty_board`/`project_commit_zone_excluded_agent_ships_board_stays_stale` warn against. Left uncommitted for a dedicated board-commit sweep; my own [QA] Review Record entries + this journal + notebook are committed separately, pathspec-scoped to my own files only.
**why-change:** no change from plan — same discipline as qa-S2 (WU-0 cycle).
