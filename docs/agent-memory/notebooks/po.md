# PO Notebook
_overwritten 2026-06-18T22:31Z_

## Cycle po-s109 (2026-06-19T04:23Z) — FIX-AUTO-PUSH-TSC-GATE-HANG: kill hung run + bound the gate

**Symptom:** launchd `fleet-push` (PID 38269) classified OK (three-dot PROCEEDED) but `bun tsc --noEmit` (PID 39061) hung ~2h at 0.02s CPU → blocked, not slow. `StartInterval`=1800 won't start a new run while one hangs → auto-push DEAD until killed.
**Root cause:** Step 11 tsc gate resolves deps through the worktree node_modules SYMLINK (Step 10) → bun blocked. NOT inherently deadlocked (re-ran green in 47s in a faithful test worktree) — a transient lock/resolution contention with the concurrently-active main tree. The real defect was the UNBOUNDED gate: any hang starves every future launchd run.
**Fix (a+b together):** the tsc gate is REDUNDANT (commits already hook+CI gated; Step 7 hard-aborts on any code-touching behind-set). Wrapped it in `run_bounded $TSC_GATE_TIMEOUT` (180s) — a perl process-group watchdog (macOS has NO gtimeout/timeout). rc0=proceed; rc1=GENUINE red→hard abort; rc124=HUNG→SKIP gate + emit `tsc-gate-timeout-skipped` signal + PROCEED (bounded skip keeps push alive; hard-abort = same dead end-state as the hang — feedback_graceful_degrade_needs_bounded_fetch).
**Killed/cleaned:** PIDs 39061+38982+38969+38269 (verified fleet-push ancestry first); removed node_modules SYMLINKS via `unlink` (never rm -r) before `git worktree remove --force /private/tmp/fleet-push-wt-1781835844`; pruned. `git worktree list` = main only; main tree node_modules INTACT (28 entries).
**Verified:** run_bounded unit T1/T2/T3 (0/1/124, no orphan); faithful hang-site worktree → bounded gate GREEN in 47s, no orphan; default run = clean no-op exit0; test-fleet-push-classifier.sh = 12/12 (7 classifier + 5 watchdog). Note: real PUSH_THRESHOLD=0 run currently HARD-ABORTS at Step 7 (correct) — origin behind-set carries `CONTAM-7-ohlcv-unit-contam-integration.test.ts` (1 code file), needs reconcile before next auto-push.
**done_verified for FIX-AUTO-PUSH-TRIGGER-NOT-FIRING still WITHHELD** — requires an AUTONOMOUS launchd clean completion observed (not a manual run). launchd timer now safe to take over (gate can never hang it).

## Cycle po-s108 (2026-06-19T03:31Z) — CI-RED-ea9a3589-FIX: out-of-band cherry-pick+push, CI GREEN, done_verified

**Gateway-blind; all ground-truth via git/gh.** Router forbidden to push (strands-fleet) → PO out-of-band call.

**RAW-confirmed:** origin/main=ea9a3589 (merge), CI run 27801589546=FAILURE, only `bun test` job red (prior e0c700d0=SUCCESS → merge re-introduced RED). Fix 709703ee = test-only (+10/-4 CONTAM-7), absent upstream (`merge-base --is-ancestor`=NO), genuinely needed. Predicted conflict via `git diff 709703ee~1 origin/main -- <CONTAM-7 file>` = EMPTY → identical base → clean cherry-pick (brief expected conflict; was wrong, no conflict).

**Action (durable clean-worktree pattern, NO rebase of main tree):** `git worktree add -b ci-red-fix-709703ee /tmp/ci-red-fix ea9a3589` → `cherry-pick 709703ee` (exit 0, no conflict, → d220356c) → `bun install --frozen-lockfile` (CI-equivalent, exit 0) → `bun tsc --noEmit`=0 (RED-PREPUSH) → CONTAM-7 45/45, FIX-OHLCV-SCALE-X1000-AUTO-REPAIR 18/18, STRANDED-ROWS-REPAIR-P1 7/7 (guard NOT weakened) → `git push origin HEAD:main` fast-forward ea9a3589..d220356c (pre-push tsc gate passed, NO force) → `gh run watch 27803863101` = conclusion SUCCESS, all 8 jobs green incl `bun test` → `worktree remove` + branch -D.

**Only the single fix pushed** — session's 8 chore/orch/notebook commits NOT pushed (divergence churn reconciles via cloud chores; pushing risks conflict surface). Board done[184] → done_verified=true, resolved_sha d220356c, ci_green_run 27803863101, blocker cleared; committed orch-state ONLY (ba332e0b, local-only, not pushed).

**P2 (agree w/ router):** 2 auditor rows (orphaned lock esc-datacov:FPT, head/lock mismatch) — router verified TTL-expired heartbeat ok:false → both RESOLVED; no dev task. chef SKIPPED_BLIND_NO_BACKSTOP = USER-side .mcp.json gateway register; no dev task.

**P3 held (confirmed still-blocked, NO re-dispatch):** FIX-ALERT-ENGINE-RSI-SINGLEDIGIT=REVIEW (live alert-cycle gate), FIX-BCTC-ENRICH-SILENT-0ROWS=REVIEW (BCTC VPS outage, USER ssh), ARCH-SHIP-WAVE-REAUDIT=PARKED (since 06-11). None git-resolvable; gateway-blind so no live probe possible this tick.

**Lesson reinforced:** brief's "CONTAM-7 WILL conflict" was a prediction, not a fact — RAW `git diff <fix-parent> origin -- <file>` proved identical base. Always verify predicted-conflict before assuming rebase risk; clean-worktree cherry-pick of a test-only fix off the exact origin tip is low-risk and the right durable path vs deferring to user.

## Cycle po-s107 (2026-06-18T22:31Z) — LIVE VNM OHLCV garbage: annotate+bump+promote FIX-OHLCV-SCALE-X1000-AUTO-REPAIR

**Router RAW-confirmed (20260618T223046Z) a live data-integrity finding; PO gateway-blind → on-disk board only. Router will RAW-verify this edit, run the interim DB repair, dispatch the durable fix.**

**RAW ground truth:** `get_technical_indicators(VNM)` serves GARBAGE NOW — MA20=3,680,960 (~62x), BB Upper=35,257,301 vs price=59,200. Root = exactly ONE bad row in named-vol `daily_ohlcv` (VNM, 2026-06-01): high=close=72,500,000, vol=0, data_env=NULL (~1225x, NOT a clean x1000; vol=0 = a WRITER wrote a bad bar). In 20-day window, outside 5-day → poisons MA20/BB, MA5 clean. Math checks: (19×~59k + 72.5M)/20 ≈ 3.68M = reported MA20 exactly. VNM-only, 1 row (no other ticker >5M). NOT fleet-wide, NOT a regression of a done task.

**Dedup:** maps to the UNBUILT `FIX-OHLCV-SCALE-X1000-AUTO-REPAIR` (backlog[273], the write-time scale auto-repair meant to catch this class). STRANDED-ROWS-REPAIR-P1 done_verified (one-time sweep, row missed/post-dates); UNIT-CONTAM closed; ARCH-OHLCV-WRITER-SSOT-DURABLE design-only DONE. → live un-repaired instance, NOT a new task.

**Decision — NO dup mint; annotate+bump+promote (`scripts/po-s107-*.jq`, conservation+placement+idempotency guarded, applied, re-run delta 0):**
- ANNOTATE the task with the RAW bad row + the actively-garbage served metric (`live_garbage_evidence`).
- BUMP P3→P1, user_impact LOW→HIGH ([no-fake-data] STANDING GOAL violated — a served metric is wrong NOW; the prior "incident already healed" assessment no longer holds).
- WIDEN scope+gate: the live bar is NOT a clean x1000 — it's ~1225x, vol=0, data_env=NULL. Auto-repair must reject/repair an IMPLAUSIBLE-MAGNITUDE / abnormal (vol=0, data_env=NULL) bar regardless of clean-power-of-1000, AND per [feedback_ohlcv_startup_purge_defeated_by_backfill_seeder] TRACE THE WRITER that emitted it (fix the writer = root, not just the normalizer residue).
- PROMOTE backlog→ready, status=READY, next_agent=dev-mcp-server (zone apps/mcp-server/, OHLCV write/normalize owner). WIP was 0 → now 1 (respects WIP≤2). po does NOT spawn; router dispatches via next_agent + head.

**Interim repair — WARRANTED, recorded as router/ops action item (`task.interim_action`):** named volume reachable only by gateway/docker-capable router. Recommended surgical, no-fabrication delete: `DELETE FROM daily_ohlcv WHERE code='VNM' AND trade_date='2026-06-01' AND close=72500000 AND volume=0;` (matched-on-garbage predicate = safe). Leave an honest 1-day gap, never a fabricated bar; re-probe get_technical_indicators(VNM) to confirm MA20/BB return to a price-consistent band. Durable writer-fix stays the root.

**head** set: active_task_id=FIX-OHLCV-SCALE-X1000-AUTO-REPAIR, next_agent=dev-mcp-server.

## Carry-over
- Router TODO this tick: (1) RAW-verify board edit, (2) run interim one-row DB delete on named-vol daily_ohlcv, re-probe VNM TA, (3) dispatch dev-mcp-server for the durable widened fix.
- done_verified WITHHELD until: live get_technical_indicators(VNM) plausible + synthetic vol=0/implausible-magnitude bar rejected-at-write + the emitting writer identified & hardened + CI green + rebuild.
- FIX-AUTO-PUSH-TRIGGER-NOT-FIRING done_verified still WITHHELD (qa must observe autonomous launchd push); launchd com.vn-market.fleet-push needs reload after machine restart.
- 295-task backlog sprint kickoff still deferred; WIP managed by dev-team router (now 1 with this promotion).
