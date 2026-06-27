# Decision Journal — MAINT on-demand (router-flipped)

## router-S1 — MAINT-QA-NOTEBOOK-PRUNE-200L

**task-id:** MAINT-QA-NOTEBOOK-PRUNE-200L
**date:** 2026-06-27T16:27:17Z
**agent:** dev-team (router STEP — DJ-GATE-1, claude-manager-helper wrote no journal entry)
**decision:** Flip ready → done. claude-manager-helper pruned `docs/agent-memory/notebooks/qa.md` 207L → 195L (dropped 3 oldest cycles c247–c249, kept 78 incl. latest c324), commit `fe93258b` (1 file). Router RAW-verified `wc -l` = 195 ≤ 200 and commit touched only qa.md.
**recurrence flag:** claude-manager-helper assessed the breach as STRUCTURAL unbounded-append (QA notebook-write step appends each cycle without self-capping at 200L), not a one-off. If qa.md re-breaches after the next QA cycle, do NOT just re-prune — escalate QA's notebook-write spec to agent-father to add self-cap logic. Carried forward for PO/next-tick.
