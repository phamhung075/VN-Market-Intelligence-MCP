# PO Notebook
_overwritten 2026-06-18T12:24Z_

## Cycle po-s105 (2026-06-18T12:24Z) — FIX-AUTO-PUSH-TRIGGER-NOT-FIRING: pivot to launchd timer + manual push 32-ahead

**Router DEFINITIVE: auto-push backstop never fires autonomously despite qa done_verified. False-done — qa tested the SCRIPT in isolation (5/5 green), NOT the production trigger. Diagnosed, fixed, board corrected, pushed.**

**FAILURE MODE = (a) step never reached.** Instrumented the spawn chain, did not guess:
- `cowork-schedule.json` 16 slots, NONE po/dev-team → PO not on */15 cadence.
- dev-team `flow/main.md` Step 1 spawns PO ONLY (via 7 * * * * router) as a BACKGROUND TRIAGE SUB-AGENT (return BATCH/NOTHING).
- PO main.md dispatch routes a dev-team spawn → `tnb-audit` → triage sub-flow.
- Each po sub-flow (channel-audit/triage-signals/sprint-kickoff/sprint-signoff) has its OWN `## RETURN` block handing control to the dev-team router — control NEVER routes back up to main.md Step PUSH-BACKSTOP. The ~58L tick-exit step is dead code on the only autonomous path. (dev-team Step 4.8 fallback sits on the router path but only :07 cron + skipped on SF-1/session-gate exits.)

**FIX = PIVOT to Option-A dedicated launchd timer (no-new-cron was the wrong call).**
- Installed `com.vn-market.fleet-push` (`launchd/com.vn-market.fleet-push.plist`, StartInterval 1800s + RunAtLoad) → runs `bash scripts/fleet-worktree-push.sh` directly. Safe: script fully self-guarding (threshold no-op / worktree-isolated / code-divergence abort→BUG / tsc gate / self-clean). `launchctl list` shows it registered (last exit 0); RunAtLoad fire RAW-verified in `fleet-push.log` (correct no-op at ahead=0).
- `docs/standards/cron-jobs.md` § Push Backstop rewritten → Option-A timer authoritative; flow-steps demoted to harmless SECONDARY best-effort (annotated in po main.md Step PUSH-BACKSTOP).

**MANUAL PUSH (32-ahead) — origin ADVANCED.** Worktree merge: 6 origin code files genuinely diverged (origin NEWER — NOT cloud-chore noise as briefed; script CORRECTLY aborted on them). Merge clean except orch-state.json → resolved `--ours` (board mutations authoritative). tsc gate GREEN. Pushed `414c0b9f → 1110651a` (fast-forward, no force). ahead now 0.

**BOARD CORRECTED (honesty over green badge)** — `scripts/po-s105-*.jq` (conservation+idempotency guarded, applied + re-run delta 0):
- M1 MINT `FIX-AUTO-PUSH-TRIGGER-NOT-FIRING` → done[] DONE/done_verified:false. REAL gate = AUTONOMOUS-FIRE (origin advances on a timer tick with NO human/router invoking it — NOT isolated-script-green). qa owns gate; done_verified WITHHELD.
- M2 ANNOTATE 4 false-done rows (`TASK-AUTO-PUSH-B-PO`/`B-DT`/`C` + `ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP`) `trigger_corrected` — script/doc work retained, only TRIGGER was structurally wrong.

**Lesson:** a flow-step "fires at every tick exit" is a LIE when the agent runs as a bg triage sub-agent whose sub-flows RETURN to the spawning router — the step is never reached. Verify the actual spawn/RETURN path, not the prose claim. For an autonomous backstop, a dumb self-guarding launchd timer ("actually fires") beats a flow-step ("no new cron"). qa gate must test the PRODUCTION trigger autonomously, never the script in isolation.

## Carry-over
- `FIX-AUTO-PUSH-TRIGGER-NOT-FIRING` done_verified WITHHELD → qa must observe origin advance on a launchd tick (ahead>20) with no human invoking it. Until then, NOT done_verified.
- launchd `com.vn-market.fleet-push` needs `launchctl load ~/Library/LaunchAgents/com.vn-market.fleet-push.plist` after machine restart (documented in cron-jobs.md).
- 295-task backlog sprint kickoff still deferred; WIP managed by dev-team router.
