# PO datapoint 2026-07-29T11:52Z — premature signal_queue eviction observed.
# Recorded, deliberately NOT minted. Idempotent (marker-key guarded).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-datapoint-20260729T1152-premature-signal-evict.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board.backlog |= map(
  if (.id? // "") == "FIX-ORCHSTATE-SIGNALQUEUE-UNCOMMITTED-ROWS-LOST-TO-PEER-FULLDOC-WRITE"
     and (has("po_datapoint_premature_evict_20260729T1152") | not)
  then . + {
    "po_datapoint_premature_evict_20260729T1152": "DATAPOINT, NOT AN ESCALATION, and deliberately NOT a new row — filed here because this is the nearest signal_queue-integrity owner and the next observer should find it rather than re-derive it. OBSERVED: PO marked two po-addressed signal rows NEW->READ at 11:31Z (dev-20260729T104938, row ts 2026-07-29T10:49:38Z; cow-20260729T111055Z, row ts 2026-07-29T11:10:55Z). Between two consecutive orch-apply runs of mine (signal_total 133 at 11:42:52Z, 131 at 11:48:56Z) a peer process removed both from .signal_queue.rows[]. The documented PRUNE criterion is status IN (READ, RESOLVED, SUPERSEDED) AND row ts older than 24h; these rows were about 40 minutes and about 10 minutes old, so the 24h age gate was not honoured. WHY THIS IS A DATAPOINT AND NOT AN INCIDENT: I verified both rows landed in docs/data/orch/archive/2026-07.json (2 hits) — EVICTED, not destroyed, which is categorically different from the defect this row owns (uncommitted rows lost to a peer full-doc write, absent from both rows[] and archive[]). Both had also been fully triaged before eviction, with their dispositions durably recorded on board rows (a corroboration on FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION, and the mint FIX-BCTC-REFINE-DIACRITIC-COLLAPSE-A-BREVE-ACUTE), so nothing was lost in substance. NOT ESTABLISHED, and this is exactly why I am not minting: I did NOT identify which process evicted them and did NOT read its predicate, so I cannot say whether the age gate is absent, mis-evaluated, or deliberately bypassed for already-READ rows — and that last possibility would make the behaviour CORRECT rather than defective. Minting on an unestablished mechanism after a harmless instance is the churn I declined elsewhere this tick. WHAT WOULD MAKE IT A ROW: the harmful variant is eviction of NEW/untriaged rows, which DID occur earlier today and required a live repair (commit 3d171d196, restore 2 prematurely-evicted po-addressed signal rows to NEW, around 11:19Z). That is two premature evictions in one day, one of them harmful. A third — specifically another NEW row going early — triggers the standing recurring-bug rule; mint then, WITH the evicting process identified and its predicate read, not before. Related memory: feedback_coldevict_no_age_gate_orphans_unread_po_escalation.",
    "updated_at": $now,
    "updated_by": "po/triage-20260729T1152-datapoint"
  }
  else . end
)
