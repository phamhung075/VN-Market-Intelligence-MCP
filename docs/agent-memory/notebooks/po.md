# PO Notebook

_Last: 2026-07-11T02:24Z_

## Tick 2026-07-11T02:07Z — dev-team triage: UNSTICK stranded HIGH-pri recurring-data-loss ready row
Full triage past ~60min skip-guard (last real triage 383563cc2 @00:57Z). Inputs quiet: pendingSignals 0, signal_queue 0 NEW/READ, telegram 0-new/0-unresolved, orphan probe empty, TNB handoff (c106) already ACK'd 07-08 (no new), CI green. **Disposition = 1 board-hygiene dispatch-unstick inline via jq→orch-apply.sh (Zod+ref-integrity+dup-key PASS, conservation 456=456); NO new mint.**
- **Finding:** `FIX-NOTEBOOK-AUTOPRUNE-ORDERING-ASSUMPTION` sat in ready[] with `next_agent:null` + `.head` idle since router escalation 07-10T17:48Z ("promote for immediate dispatch") — undispatched through 4+ skip-respawn ticks (those ticks only cold-evict, don't dispatch ready[]). HIGH-pri, 3x-confirmed silent data-loss: notebook-auto-prune.sh PostToolUse hook drops the PHYSICALLY-first ## section on newest-first notebooks (deletes the JUST-ADDED entry). Every idle tick = ongoing notebook data-loss risk fleet-wide.
- **Fix:** M1 set `next_agent=claude-manager-helper` (=owner; notebook/memory hygiene domain) on ready row + dispatch stamp; M2 point top-level `.head` {status:in_progress, active_task_id, next_agent} so dev-team Step-0b head-resume fires (po-s109 rule: ready dispatches ONLY when head=in_progress + spawnable next_agent). FIX/size-S → direct to owner, no ba/pm. PO does NOT spawn — router adopts head next tick.
- Not-touched (correctly): review=25 already-tracked (STATUSFLIP-LANEMOVE + EPIC-WRAPPER-AUTOCLOSE-SWEEP); active_sprints=6 all ACTIVE (legit non-terminal); in_progress OPS-BCTC-REFINE-REPASS-NONBANK-5T = live ops row, untouched. Self-committed explicit paths, PUSH HELD → fleet-timer (ahead 15 < 20).

## Standing method (survives rotation)
- RAW-verify every signal/relayed claim from source. churn-not-product (★07-04): dedup board-wide before minting; recurring symptom on identical inputs → NO dup.
- **Stranded-ready pattern (po-s109):** a ready[] row with `next_agent:null` while `.head` is idle NEVER dispatches — skip-respawn ticks only cold-evict. PO unsticks by setting next_agent + pointing head (status MUST be `in_progress`, not `dispatching`, for Step-0b to fire). head.active_task_id has a Zod superRefine ref-integrity gate → target must exist in a task_board lane.
- CLEAN/board-hygiene = PO executes inline via jq→orch-apply.sh (never raw); orch-apply does Zod+ref-integrity+dup-key+conservation+CAS+atomic rename.
- Cold-evict-drift: lowercase/non-canonical sprint status tokens strand active_sprints[] — canonicalize to exact TERMINAL_SET member. Router owns evict sweep.
- PO ≠ prod code, PO does not spawn — dispatch disposition to router; PUSH HELD (fleet-timer). Never touch `.head`/in_progress owned by a LIVE worker (idle head is safe to point).
