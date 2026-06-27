# Decision Journal — MAINT on-demand (router-flipped)

## router-S1 — MAINT-QA-NOTEBOOK-PRUNE-200L

**task-id:** MAINT-QA-NOTEBOOK-PRUNE-200L
**date:** 2026-06-27T16:27:17Z
**agent:** dev-team (router STEP — DJ-GATE-1, claude-manager-helper wrote no journal entry)
**decision:** Flip ready → done. claude-manager-helper pruned `docs/agent-memory/notebooks/qa.md` 207L → 195L (dropped 3 oldest cycles c247–c249, kept 78 incl. latest c324), commit `fe93258b` (1 file). Router RAW-verified `wc -l` = 195 ≤ 200 and commit touched only qa.md.
**recurrence flag:** claude-manager-helper assessed the breach as STRUCTURAL unbounded-append (QA notebook-write step appends each cycle without self-capping at 200L), not a one-off. If qa.md re-breaches after the next QA cycle, do NOT just re-prune — escalate QA's notebook-write spec to agent-father to add self-cap logic. Carried forward for PO/next-tick.

## router-S2 — QA-NOTEBOOK-200L recurrence MATERIALIZED → escalated (no re-prune)

**task-id:** MAINT-QA-NOTEBOOK-PRUNE-200L
**date:** 2026-06-27T18:32:47Z
**agent:** dev-team (router STEP — post-cycle qa.md watch, DJ-GATE-1)
**decision:** The router-S1 recurrence flag fired for real. After the next QA cycle (commit `a7befb0c`, +8L) `wc -l docs/agent-memory/notebooks/qa.md` = **203 > 200** — re-breached one cycle after the fe93258b prune to 195L. Per the router-S1 flag I did **NOT** re-prune (treadmill). Instead filed a structural escalation signal `docs/signals/repair-qa-notebook-selfcap-*.json` (type `repair_task_request`, to=`po`, dedup_key `qa-notebook-write-spec-selfcap-200L`, PLAN-ONLY) requesting agent-father add write-time self-cap/auto-trim logic to the QA agent's notebook-write step so the writer enforces the 200L cap (not an external janitor prune). The standing `context_bloat_breach` signal (to=claude-manager-helper) was left as-is — it only triggers another prune, which is the path the flag forbids.
**recurrence flag:** CLOSED for the router loop — escalation is filed with a dedup_key (no re-spam). Next owner = PO triage → agent-father. Until the self-cap ships, expect qa.md to keep re-breaching each QA cycle; do NOT re-file the escalation (dedup) and do NOT re-prune. Track via the dedup_key.
