# agents-architect — Notebook

## 2026-07-08T21:29:52Z

**Brief:** `docs/architecture-briefs/2026-07-08-cowork-step5-stale-trigger-status.md`

FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS: `spawn-fanout.md` Step 5.0 keyed BACKSTOP_SLOTS on `trigger_status=="active"`, never resynced after the 2026-06-22/23 cloud RemoteTrigger retirement — masked 5-9 real guaranteed-slot misses per gateway-blind tick as "safe cloud-deferred" (confirmed live in-session by 3 cowork-team signals today). Fix: re-key discriminator to `_superseded_by==null` (live-maintained field) instead of `trigger_status` (dead field). Companion data fix splits the 9 stale-`active` slots by class (5 real-trigger → `"superseded"`; 4 never-had-a-trigger → field removed).

**Signal dropped:** `docs/signals/cowork-step5-stale-trigger-status-20260708T212952Z.json` → agent-father

---

## 2026-07-09T07:25:08Z

**Brief:** `docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md`

UNBLOCK-CLOSEGATE-STEP4-HEAD-SYNC (recurring-bug escalation, 2x router fixes f4afa0e03/b907a8ea6): root cause = ops's Docker Close Gate Step-4→qa handoff is the ONLY task-board transition point with no checked-in atomic `.head`+board jq helper — ops hand-rolls a fresh inline jq one-liner every close-gate that touches only `task_board.<lane>[]`, never `.head`; same missing-procedure gap also explains the uncommitted-artifacts + one-off-journal-filename defects (3 offenders found, listed in brief). Fix: (1) generalized `scripts/ops-closegate-handoff.jq` mirroring `devteam-backlog-claim-bounded1.jq` precedent (conditional `.head` sync, only when `.head.active_task_id==task_id`); (2) step-ends-only-on-commit invariant modeled on this agent's own Brief-Commit Invariant; (3) enforce decision-journal `STEP ops-Sn` filename pattern. Fanout: `FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT` + `FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE` minted to backlog for PO triage.

**Signal dropped:** `docs/signals/closegate-step4-atomic-handoff-20260709T072508Z.json` → agent-father

---

## 2026-07-09T17:58:13Z

**Brief:** `docs/architecture-briefs/2026-07-09-arch-headless-gateway-cowork-nopost-closure.md`

ARCH-HEADLESS-GATEWAY-COWORK-NOPOST: CLOSED as superseded, not designed. Verified-first (per dispatch instruction) whether the cloud-RemoteTrigger-fired-slots-no-post premise still holds — it does not: RemoteTrigger Layer A fully retired since the 2026-06-23 all-local cutover (STANDING `feedback_no_remote_trigger_all_local`), reconfirmed `enabled:false` live 2026-07-08T20:35Z, no cloud fallback left to redesign around. The related local-subagent gateway-blind mechanism the dispatch flagged as a possible live overlap already has the exact "detect + don't silently drop" principle shipped repeatedly (blind-guard.md Step 0c, spawn-fanout.md Step 5.0, cycle-bootstrap CONFIRMED-BLIND fallback, gateway-call-contract.md §6 Degraded Mode, root-caused client-side/not-repo-fixable in the 2026-07-08 SPIKE) — a fresh brief would duplicate, not add signal. Moved `task_board.in_progress[]→archive[]` (status DONE, mirrors `BPE-ARCH-1` zombie-closure precedent), `.head` reset to terminal (`status:done, active_task_id:null, next_agent:router`) via checked-in `scripts/architect-arch-headless-gateway-cowork-nopost-closure.jq` through `orch-apply.sh` — per this task's own explicit dispatch instruction, an exception to the normal architect-signals-only-po-flips-board pattern.

**Signal dropped:** `docs/signals/arch-headless-gateway-cowork-nopost-closure-20260709T175800Z.json` → po
