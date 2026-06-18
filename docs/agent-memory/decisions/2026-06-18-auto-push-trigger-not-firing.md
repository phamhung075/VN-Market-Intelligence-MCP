# Decision Journal — Auto-Push Trigger Not Firing (PIVOT to launchd timer)

**task-id:** FIX-AUTO-PUSH-TRIGGER-NOT-FIRING
**by:** po
**at:** 2026-06-18T12:26:24Z

## Context
Router RAW-confirmed (twice) the auto-push backstop never fires autonomously: local
went 23 → 32 ahead across multiple po-ticks (13:37/12:33/12:19) and dev-team ticks
(13:43/12:38), origin received 0 fleet-push merges. qa had marked the program done_verified
having tested `scripts/fleet-worktree-push.sh` in ISOLATION (5/5 green) — NOT the production
trigger. False-done_verified.

## What-considered
1. (b) Guard-2 commit-mutex fail-closes on the gateway-binding gap → make it degrade to a
   file-lock check.
2. (a) Step never reached → the flow-step-at-tick-exit approach is structurally wrong for
   autonomous execution; needs a dedicated minimal trigger (cron/launchd/RemoteTrigger).

## Diagnosis (instrumented, not guessed)
Read the spawn chain end-to-end:
- `docs/data/cowork-schedule.json`: 16 slots, NONE are po/dev-team → PO is NOT on the */15 cadence.
- `docs/agents/dev-team/flow/main.md` Step 1: PO spawned ONLY by the 7 * * * * router as a
  BACKGROUND TRIAGE SUB-AGENT (contract: return BATCH/NOTHING).
- `docs/agents/po/flow/main.md` dispatch table: a dev-team triage spawn routes to `tnb-audit`
  → triage sub-flow.
- po sub-flows (channel-audit / triage-signals / sprint-kickoff / sprint-signoff) EACH have
  their own `## RETURN` block handing control back to the dev-team router — they NEVER route
  back up through main.md Step PUSH-BACKSTOP. Confirmed mode **(a) step-never-reached**.
- dev-team Step 4.8 fallback sits on the router's own path but only runs on the :07 cron and
  is bypassed when the tick SKIPs (SF-1) or exits at the session-gate before post-cycle.

## Why-change (from plan: Option-B no-new-cron)
"No new cron" was the wrong call — the step structurally cannot run on the autonomous path.
"Actually fires" beats "no new cron." PIVOT to Option-A: a dedicated launchd timer.

## Decision
- Installed launchd timer `com.vn-market.fleet-push` (`launchd/com.vn-market.fleet-push.plist`,
  StartInterval 1800s + RunAtLoad) running `bash scripts/fleet-worktree-push.sh` directly.
  Safe because the script is fully self-guarding (threshold no-op / worktree-isolated /
  code-divergence abort / tsc gate / self-clean). RAW-verified RunAtLoad fire (no-op at ahead=0).
- Updated `docs/standards/cron-jobs.md` § Push Backstop → Option-A launchd timer (Option-B retired
  as trigger; flow-steps retained as harmless secondary best-effort).
- Re-opened the program as `FIX-AUTO-PUSH-TRIGGER-NOT-FIRING` (done/done_verified:false) with the
  REAL gate (AUTONOMOUS-FIRE) + annotated the 4 false-done flow-step rows (trigger_corrected).
- Manual worktree push NOW: 32-ahead reconciled, origin advanced 414c0b9f → 1110651a.

## False-green / silent-swallow risk
The new gate is NOT gameable by the script passing in isolation — it requires observing origin
ADVANCE on a timer tick with NO human invoking it. qa owns that gate; done_verified WITHHELD.
