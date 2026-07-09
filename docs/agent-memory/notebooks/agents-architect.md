# agents-architect — Notebook

## 2026-07-07T20:44:10Z

**Brief:** `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md`

COWORK-GUARANTEED-SLOT-DURABILITY: ruled Option A (generalize existing launchd firer via `cowork-match-slots.js` SSOT reuse, `guaranteed===true` filter, no hardcoded per-slot branches) over Option B (VPS has no LLM runtime/credentials — larger security surface, no benefit) for the 73h session-scoped dispatcher outage (07-04→07-07) that silenced all chef/digest/fb guaranteed slots. New finding beyond PO's payload: `fb-daily-firer.plist` was loaded and firing correctly 07-01→07-04, then silently unloaded with nothing detecting it — added a Tier-1 auditor self-check as required hardening, or the outage recurs even after the fix ships. Flagged `docs/protocols/cowork-master-cron-runbook.md` as stale (still describes retired RemoteTrigger Layer A as active/deletion-locked). Token cost ≈0 marginal (bash/node pre-gate, cold one-shot invocations, no session accumulation). `F-GATHERER-OFFHOURS-STALL-0704` explicitly closed as same root cause — no separate fix.

**Signal dropped:** `docs/signals/cowork-guaranteed-slot-durability-20260707T204410Z.json` → po

---

## 2026-07-08T21:29:52Z

**Brief:** `docs/architecture-briefs/2026-07-08-cowork-step5-stale-trigger-status.md`

FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS: `spawn-fanout.md` Step 5.0 keyed BACKSTOP_SLOTS on `trigger_status=="active"`, never resynced after the 2026-06-22/23 cloud RemoteTrigger retirement — masked 5-9 real guaranteed-slot misses per gateway-blind tick as "safe cloud-deferred" (confirmed live in-session by 3 cowork-team signals today). Fix: re-key discriminator to `_superseded_by==null` (live-maintained field) instead of `trigger_status` (dead field). Companion data fix splits the 9 stale-`active` slots by class (5 real-trigger → `"superseded"`; 4 never-had-a-trigger → field removed).

**Signal dropped:** `docs/signals/cowork-step5-stale-trigger-status-20260708T212952Z.json` → agent-father

---

## 2026-07-09T07:25:08Z

**Brief:** `docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md`

UNBLOCK-CLOSEGATE-STEP4-HEAD-SYNC (recurring-bug escalation, 2x router fixes f4afa0e03/b907a8ea6): root cause = ops's Docker Close Gate Step-4→qa handoff is the ONLY task-board transition point with no checked-in atomic `.head`+board jq helper — ops hand-rolls a fresh inline jq one-liner every close-gate that touches only `task_board.<lane>[]`, never `.head`; same missing-procedure gap also explains the uncommitted-artifacts + one-off-journal-filename defects (3 offenders found, listed in brief). Fix: (1) generalized `scripts/ops-closegate-handoff.jq` mirroring `devteam-backlog-claim-bounded1.jq` precedent (conditional `.head` sync, only when `.head.active_task_id==task_id`); (2) step-ends-only-on-commit invariant modeled on this agent's own Brief-Commit Invariant; (3) enforce decision-journal `STEP ops-Sn` filename pattern. Fanout: `FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT` + `FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE` minted to backlog for PO triage.

**Signal dropped:** `docs/signals/closegate-step4-atomic-handoff-20260709T072508Z.json` → agent-father
