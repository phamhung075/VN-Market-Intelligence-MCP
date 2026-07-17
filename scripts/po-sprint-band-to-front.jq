# scripts/po-sprint-band-to-front.jq
#
# PO reusable, IDEMPOTENT partition: move a named sprint's backlog rows to the
# FRONT of .task_board.backlog (preserving each partition's internal relative
# order). Non-sprint rows keep their relative order, after the band.
#
# WHY: scripts/devteam-backlog-promote-bounded1.jq picks the eligible row with
# the lowest [priority_rank, backlog-array-index]. Array index is the ONLY
# tiebreak within a priority tier. When a sprint band shares its priority tier
# with a co-equal competitor sprint (e.g. ULTRACODE-AUDIT-FIXALL vs the live
# TOKEN-ECONOMY-AUDIT P1 band, 2026-07-17), the competitor's LOWER array index
# wins every tiebreak, so a same-tier priority bump alone never changes the
# next pick. Moving the band to the front is the ONLY lever (short of P0
# over-inflation) that makes the band win the intra-tier tiebreak.
#
# SAFETY: this ONLY reorders the tiebreak. It NEVER beats a genuinely
# higher-priority row: the promote script sorts by [rank, idx], so any eligible
# P0/critical row (rank 0) still outranks this band's P1 rows (rank 1)
# regardless of array position. Row count, lane membership, and all row fields
# are byte-identical — only order changes. Fully reversible.
#
# IDEMPOTENT: re-running is a no-op — the band is already at the front, so the
# partition reproduces the identical array. Survives concurrent peer drains
# (draining a competitor row shrinks the tail; the band stays at front) and
# peer appends (new rows land at the tail, after the band).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   jq --arg sprint "ULTRACODE-AUDIT-FIXALL" \
#      -f scripts/po-sprint-band-to-front.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Compose AFTER scripts/po-sprint-band-priority-bump.jq when you want both the
# priority bump AND the intra-tier lead:
#   jq -f scripts/po-sprint-band-priority-bump.jq ... \
#     | jq --arg sprint "$SPRINT" -f scripts/po-sprint-band-to-front.jq \
#     | bash scripts/orch-apply.sh
#
# Pointer: docs/policies/dev-standards.md § Script Persistence (PO reusable
# triage scripts) + docs/agents/po/flow/scripts-registry.md.

.task_board.backlog = (
  ([.task_board.backlog[] | select(.sprint == $sprint)])
  + ([.task_board.backlog[] | select(.sprint != $sprint)])
)
