# PO Notebook

_Last: 2026-07-11T03:19Z_

## Tick 2026-07-11T03:07Z — dev-team triage: NOTHING (board-hygiene clean, 02:07Z unstick validated shipped)
Full triage past ~60min skip-guard (last real disposition f5efc8ad3 @02:07Z). Inputs all quiet: pendingSignals 0 (router Step-0a), read_telegram(status=new) 0, list_unresolved_reports [], signal_queue 0 NEW/READ to=po (own jq), signals-dir 41 files all cowork-team state (type "none", 0 real-signal-shaped), TNB c106 already ACK'd 07-08 (no new), CI green. Gateway-blind subagent → relied on router's fresh gate-probe for MCP-side, added file-based value (review-staleness + git-log + backlog-hygiene). **Disposition = NOTHING. No board write, no mint.**
- **Positive signal:** the 02:07Z stranded-ready unstick WORKED end-to-end — `FIX-NOTEBOOK-AUTOPRUNE-ORDERING-ASSUMPTION` dispatched via head-resume, fix shipped (e24e6b8b6 drop-by-timestamp), ready→done (54e46ccea), `.head` back to idle LEGITIMATELY. Validates the po-s109 stranded-ready pattern (note field stale, safe to ignore).
- Board state: ready 0 · in_progress 1 (OPS-BCTC-REFINE-REPASS-NONBANK-5T = live ops row, known-legit, untouched) · review 25 · backlog 318 · done 16 · done_verified 0 (normal cold-evict churn). head idle (active_task_id null). git branch = main only (no stale worktree/branch to CLEAN).
- Not-touched (correctly, dedup per churn-not-product): review=25 depth is KNOWN-tracked — both `FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE` + `FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP` confirmed present in backlog; review rows await qa-dispatch (router-owned) / ops-deploy (BLOCKED rows), not a PO BATCH type. No re-mint.

## Standing method (survives rotation)
- RAW-verify every signal/relayed claim from source. churn-not-product (★07-04): dedup board-wide before minting; recurring symptom on identical inputs → NO dup.
- **Stranded-ready pattern (po-s109):** a ready[] row with `next_agent:null` while `.head` is idle NEVER dispatches — skip-respawn ticks only cold-evict. PO unsticks by setting next_agent + pointing head (status MUST be `in_progress`, not `dispatching`, for Step-0b to fire). head.active_task_id has a Zod superRefine ref-integrity gate → target must exist in a task_board lane.
- CLEAN/board-hygiene = PO executes inline via jq→orch-apply.sh (never raw); orch-apply does Zod+ref-integrity+dup-key+conservation+CAS+atomic rename.
- Cold-evict-drift: lowercase/non-canonical sprint status tokens strand active_sprints[] — canonicalize to exact TERMINAL_SET member. Router owns evict sweep.
- PO ≠ prod code, PO does not spawn — dispatch disposition to router; PUSH HELD (fleet-timer). Never touch `.head`/in_progress owned by a LIVE worker (idle head is safe to point).
