# 2026-06-24 — FEAT-PREDICTION-CLAIMS-DAILY-CADENCE sign-off + evidence-calibration assessment

task_id: FEAT-PREDICTION-CLAIMS-DAILY-CADENCE

## Context
Two board actions on the first-ever digest-daily fire (17:31Z 2026-06-24). Dispatcher framed
ACTION-1 as a clean done_verified flip; RAW board state contradicted the frame.

## What considered
- **ACTION-1 (sign-off):** dispatcher said "flip done_verified=YES, the no-op was a PASS, marker
  published:digest-daily:2026-06-24 SET." RAW board: task was REOPENED in_progress 17:39Z because the
  fire surfaced a real dedup-keying bug — the daily marker was keyed get_week_period.periodStart=2026-06-21
  (week-anchor, identical Mon-Sat) not today; 24h TTL races the 24h fire interval -> tomorrow's fire would
  be wrongly deduped. The "2026-06-24 marker SET" claim is wrong: my own task_heartbeat probe at 17:41Z
  CREATED that key with a fresh 24h TTL (heartbeat = create-if-absent) — it was not the fire's marker.
- The keying bug is FIXED + committed: e1e9d6ab (17:40Z, agent-father) — main.md Step pre-D now derives
  UTC_DATE from cycle-bootstrap UTC-now / get_current_date and FORBIDS periodStart. Clean, no dirty diff.
- Synthesis itself was correct: honest NO-OP (AC-5, bar not lowered, 0 fabricated). 15:05 catch-up wrote
  2 real claims (FPT id=10, VPB id=11) so the create path also works.

## Decision (why change from plan)
- ACTION-1: done_verified = **NO (withheld)**, NOT yes. Relocated in_progress -> done as CODE-COMPLETE
  (done_verified:false). The fixed keying is unproven until a clean DISTINCT-key next-day fire (2026-06-25
  ~17:30Z). Flipping done_verified now would violate verify-raw-not-badges + code-complete != done_verified
  when the gate is a future live behavior. Mechanism complete + first fire honest = code-complete, gate held.
- ACTION-2: evidence-fragment trust is **SYSTEMIC + REAL**, not a thin-day. RAW: get_evidence_summary
  FPT/VPB 2026-06-24 = every fragment foreign_flow_institutional LR=1.00 (n=0) [UNTRUSTED]; trust needs
  sample_size>=10 in evidence_likelihood_ratios; that table's SOLE writer baseRateComputationJob is ~20d
  dead. So every fragment is perpetually untrusted -> claims get created on raw scores but carry no
  evidence-calibrated lift. **Already tracked** = FIX-BASE-RATE-COMPUTATION-CRON-DEAD (P2 TODO backlog).
  No new mint (dedup). Annotated it in-place with the cross-feature value-limit (limits BOTH weekly
  digest-predict AND the new daily feature) + recommend P2->P1 once dev-mcp-server WIP clears. Upstream
  sibling FIX-EVIDENCE-PIPELINE-STARVED (CHANGES_REQUESTED, C3 accumulator gap) feeds the fragments.
  Distinct healthy layer: prediction-LEVEL Brier (get_calibration_report 2026-06-21 Brier=0.1379, 4
  resolved) — that calibration works; the dead layer is evidence-FRAGMENT LR.

## Outcome
- FEAT-PREDICTION-CLAIMS-DAILY-CADENCE -> done (code-complete, done_verified:false, gate=2026-06-25 fire).
- FIX-BASE-RATE-COMPUTATION-CRON-DEAD annotated (no dup mint).
- Feature verdict: mechanism HEALTHY (fires, no-ops honestly, creates real claims, keying now fixed);
  value LIMITED until evidence-LR calibration is seeded (baseRateComputationJob revived to n>=10).
