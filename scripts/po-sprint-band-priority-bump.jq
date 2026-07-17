# scripts/po-sprint-band-priority-bump.jq
#
# PO reusable, IDEMPOTENT priority bump for a named sprint's backlog band.
# First minted for the user-approved ULTRACODE-AUDIT-FIXALL band bump
# (2026-07-17) so the BOUNDED-1 dev-team auto-pickup loop
# (scripts/devteam-backlog-promote-bounded1.jq) drains that sprint's
# dev-eligible rows ahead of same-or-lower-urgency non-sprint backlog.
#
# WHY A SCRIPT (not a one-off jq): the promote lane picks by priority_rank
# ascending then FIFO backlog-index tiebreak. A sprint band that shares the
# competitors' rank (e.g. all P2) loses the FIFO tiebreak to earlier-indexed
# rows forever. Raising the band's rank by one tier is the durable, re-runnable
# way to win the pick without fragile array reordering.
#
# RULE (idempotent — target computed from CURRENT priority + plan_only, never
# incremental, so re-running is a no-op for rows already at target):
#   plan_only == true : P3 -> P2 ; keep P2/P1/P0
#       (plan-verify / recon / UNVERIFIED-umbrella rows CAP at P2 — never
#        inflated to P1: they are verify-contracts over already-shipped work,
#        deliberately one tier below the concrete fix rows.)
#   plan_only != true : P2 -> P1 ; P3 -> P2 ; keep P0/P1
#       (concrete fix rows bumped one tier, CAP at P1 — never inflated to P0,
#        which is reserved for genuine criticals.)
#
# SCOPE: only rows where .sprint == $sprint AND .status in {BACKLOG, TODO}.
# Rows already in ready/in_progress/review/qa/done* lanes are never touched
# (this filter runs on .task_board.backlog[] only). Non-sprint rows untouched.
#
# PROVENANCE: stamps priority_bumped_from / priority_bumped_at / priority_bumped_by
# on rows whose priority ACTUALLY changes. A row already at its computed target
# (current == target) is left byte-identical — its prior stamp (if any) is
# preserved, so bumped_from always reflects the TRUE pre-bump priority across
# repeated runs. TaskSchema is .passthrough() (orchStateSchema.ts) so these
# extra provenance keys validate cleanly.
#
# DOES NOT: convert plan_only rows to fix rows, touch next_agent/owner/
# supervised/depends, or move rows between lanes. Deploy-gate / ungate / hold
# annotations are deliberately OUT of scope here — they are per-row one-time
# edits the caller applies as a separate targeted write.
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg sprint "ULTRACODE-AUDIT-FIXALL" --arg now "$NOW" \
#      --arg by "po/uc-audit-priority-bump" \
#      -f scripts/po-sprint-band-priority-bump.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/policies/dev-standards.md § Script Persistence (PO reusable
# triage scripts) + docs/agents/po/flow/scripts-registry.md.

# Coarse priority tier (mirrors devteam-backlog-promote-bounded1.jq priority_rank
# vocabulary: the messy P0..P3 / critical|high|medium|normal|low mix, case-insensitive).
def rank5:
  (. // "") | ascii_downcase
  | if   test("^p0$|^critical$")           then 0
    elif test("^p1$|^high$")               then 1
    elif test("^p2$|^med(ium)?$|^normal$") then 2
    elif test("^p3$|^low$")                then 3
    else 9
    end;

# `.` = the backlog row. Returns the TARGET priority string per the rule above.
def target_priority($plan_only):
  (.priority | rank5) as $r
  | if $plan_only then
      (if $r == 3 then "P2" else .priority end)
    else
      (if   $r == 2 then "P1"
       elif $r == 3 then "P2"
       else .priority end)
    end;

.task_board.backlog |= [
  .[]
  | if (.sprint == $sprint) and ((.status == "BACKLOG") or (.status == "TODO")) then
      ((.plan_only // false) == true) as $po
      | (target_priority($po)) as $tp
      | if $tp != .priority then
          . + { priority: $tp,
                priority_bumped_from: .priority,
                priority_bumped_at: $now,
                priority_bumped_by: $by }
        else . end
    else . end
]
