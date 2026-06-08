# PO Notebook

## c · 2026-06-08T21:20Z — Triage tick: CI re-fix #1 FAILED + TNB false-positive + 9 signals

**CI re-fix (CI-RED-RECONCILE / FIX-CI-COVERAGE-OOM-CRASH) — attempt #1 BROKEN, re-scoped architect-first.**
- Shipped fix c2ab2cea `bun test --coverage=false` died at ARG-PARSE on CI run 27167284935 (`--coverage does not take a value`). bun `--coverage` is ENABLE-ONLY boolean; `=false` invalid. po-S8 assumed a value-flag that doesn't exist. Suite NEVER ran.
- 2nd failed CI fix on same ci.yml test step => RECURRING-BUG => routed through architect SPIKE (SPIKE-CI-COVERAGE-OFF-MECHANISM), NOT straight to dev. FIX-CI-COVERAGE-OOM-CRASH -> BLOCKED, owner=architect-spike->dev-mcp-server impl.
- **PO VERIFIED the mechanism vs real bun 1.3.13** (exact pinned CI ver, installed locally) so the spike is confirmation not exploration. Matrix: bunfig coverage=false => bare `bun test`=NO table (CI works) BUT `bun test --coverage` does NOT re-enable in 1.3.13 (flag ignored) => Approach-1 local-opt-in partly broken; `-c`/BUN_CONFIG_FILE do NOT override [test] coverage with local bunfig present => Approach-2 dead; `--coverage=false`=parse error. Architect picks A1 + a `test:cov` script for local coverage, weighing memory soft-pref. HARD GATE in spec: re-fix proven against bun 1.3.13 (`bun --version` + dry-run exact CI cmd) BEFORE DONE — no more unverified flags.
- Verification gate (unchanged): CI bun-test emits clean `Ran N tests ... N fail` on subsequent push (no crash/parse-error); MAY stay RED on real fails. Router holds drain-commit push until corrected ci.yml lands. Router owns push.

**TNB c91 F-SUNDAY-SCHEDULER-FIRE (CRITICAL) — REJECTED, false positive (calendar error).**
- RAW: `2026-06-08` is a **MONDAY** (Sat=06 Sun=07 Mon=08; `date -u` + `getUTCDay()===1`). NOT Sunday. Chef slots `* * 1-5` firing on Monday = CORRECT. Tested SSOT `scripts/agents-flow/cowork-match-slots.js`: `cronMatches("13 2-8 * * 1-5", Sunday)===false`, `dowMatch()` honors `1-5`. NO dev FIX (auditor-false-positive-destructive guard). Calendar correction -> TNB c92. Dish-text "Sunday" = unified-agent day-LABEL bug (LOW) -> folds into SPIKE-UNIFIED-NB-GAP.

**9 drained signals triaged:**
- bctc-analyst bug-escalation (CTG cycle26+, 6 tickers stored-PDF-but-get_bctc_full-empty): NO new task — covered by active BCTC-FETCH-CORRECTNESS (cover-letter-not-statement = root) + BCTC-LAYOUT-FIRST + TNB F2 blocker. Re-escalation of in-flight work. pendingObservation.
- tnb audit-handoff: ACK'd (see above).
- context-bloat dev-mcp-server.md ×2 (214L then 227L, breached twice this tick = recurring): MAINTENANCE lane -> claude-manager-helper prune (not dev WIP). >200L cap.
- signals 5-9 (bctc_signal_*_pending, FPT_routine, cowork-team×3): null-field blackboard snapshots, non-actionable, already in processed/. No-op (verified).

## Carry-over
- **CI BLOCKED on architect spike:** SPIKE-CI-COVERAGE-OFF-MECHANISM must pick + bun-1.3.13-verify the no-coverage CI run mechanism, then dev-mcp-server impl. PO matrix attached to task note. Router holds push (drain + corrected ci.yml = one push).
- pendingObservation: bctc CTG/6-ticker stored-but-not-extracted — re-escalated; feeds BCTC-FETCH-CORRECTNESS, not a new sprint. Watch c034/c035 result.
- MAINTENANCE: dev-mcp-server.md 227L (breached 2x/tick = recurring) -> claude-manager-helper prune.
- Foreign dirty files NOT touched: tool-usage-stats.json, ba.md, pm.md, sprint-CI-RED-RECONCILE-ops.md, DEEPFETCH handoff.
- Journal: sprint-CI-RED-RECONCILE-po.md (steps po-S1..S10).
