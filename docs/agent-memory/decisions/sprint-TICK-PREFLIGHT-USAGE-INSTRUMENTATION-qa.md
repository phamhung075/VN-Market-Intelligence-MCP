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
