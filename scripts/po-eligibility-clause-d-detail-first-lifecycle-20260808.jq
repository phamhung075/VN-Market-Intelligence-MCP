# scripts/po-eligibility-clause-d-detail-first-lifecycle-20260808.jq
#
# PO, 2026-08-08. Adds clause (d) to the ALREADY-OPEN P1 row
# FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE
# (backlog[], supervised, next_agent=architect, DRS-eligible — verified live).
#
# NO new row is minted deliberately: that row's own `note` states "same
# scripts/lib/devteam-eligibility.jq surface, concurrent edit = commit race"
# and "ALL THREE clauses land in ONE eligibility-library change". Clause (d)
# is a 4th defect on the SAME surface, so it folds in rather than racing.
#
# Usage (hot-file write contract — CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER):
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/po-eligibility-clause-d-detail-first-lifecycle-20260808.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board.backlog = [
  .task_board.backlog[]
  | if (.id == "FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE")
    then . + {
      updated_at: $now,
      updated_by: "po",
      po_clause_d_20260808: {
        headline: "(d) effective_next_agent()/effective_owner() DETAIL-FIRST precedence lets a COLD mint-time value silently outrank a lifecycle-flipped HOT board row.",
        mechanism: "docs/data/orch/archive/backlog-detail.json is a COLD mint-time store. Its ONLY writer (scripts/orch-backlog-stub.sh) runs on new-backlog-item write and documents 'existing cold wins' merge semantics — it NEVER re-syncs a cold entry after the hot row is later flipped by the implementing agent. So for EVERY row that moves past BACKLOG, cold .next_agent/.status are systematically stale, and detail-first makes that stale value authoritative over the live hot SSOT.",
        harm_two_sided: "Measured live 2026-08-08 (jq via scripts/lib/devteam-eligibility.jq against the live board): 6 review[] rows carried hot next_agent=='qa' but resolved to a stale cold agent. (i) FALSE-NEGATIVE, the bigger harm: scripts/devteam-review-claim-qa-drain.jq selects effective_next_agent=='qa', so all 6 were PERMANENTLY invisible to PRIMARY QA-Drain and could never be signed off — accreting in review[] forever, actively defeating the throughput goal of docs/architecture-briefs/2026-08-01-review-lane-drain-throughput-and-secondary-sweep.md. (ii) FALSE-POSITIVE: the same 6 sat in the SECONDARY-Drain pool (selects != 'qa'), which never lane-moves a claimed row, so it re-dispatches the WRONG agent every tick the row is oldest. Materialised twice: FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH -> 'developer' (2026-08-05T08:15:09Z) and FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW -> 'agent-father' (2026-08-08T17:26:17Z; agent-father returned 'already implemented, 9/9 tests, correctly parked for QA' — a full wasted dispatch).",
        symptom_already_patched: "The 6 stale COLD entries were repaired 2026-08-08T17:40Z by scripts/po-detail-resync-review-lifecycle-routing.sh (deletes cold .next_agent so the resolver falls through to the board; syncs cold .status/.route_to; preserves prior values under po_detail_resync_20260808). Predicate-driven, idempotent, gate-verified. That is a DATA patch for one lane — this clause is the actual fix.",
        do_not_blanket_flip: "A blanket board-first flip is a SAFETY REGRESSION and must NOT be shipped. 10 live backlog[] rows also carry a board-vs-cold next_agent conflict (board architect/agent-father/dev-mcp-server/pm/developer vs cold ba/architect) — e.g. FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE, FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD. Those are NOT lifecycle flips (still status BACKLOG), and there cold-first is the CONSERVATIVE direction: is_non_dev_next_agent_unrouted() currently gates them OUT of BOUNDED-1 unattended pickup. Board-first would make them auto-dispatchable, reopening exactly the class the 2026-07-09..07-16 gate fixes closed. The rule must be LIFECYCLE/STALENESS-aware, not a precedence swap — e.g. hot board wins when the row has moved past BACKLOG/TODO AND its own .next_agent is present-non-empty; cold fills gaps only.",
        acceptance_criteria: [
          "A review[]/qa[]/done[] row whose HOT .next_agent is present-non-empty resolves to that value regardless of any cold .next_agent.",
          "The 10 backlog[] board-vs-cold conflict rows retain their CURRENT conservative gating — assert explicitly, no silent widening of unattended auto-dispatch.",
          "Green after change: scripts/test-devteam-bounded1-supervised-flag.sh, -depends-on.sh, -epic-wrapper.sh, scripts/audits/bounded1-supervised-lane-report.sh, scripts/audits/devteam-review-lane-drain-report.sh.",
          "New regression test covering the cold-stale-vs-hot-flipped shape (cold next_agent='agent-father' + hot next_agent='qa' + hot status='REVIEW' -> resolves 'qa')."
        ],
        adjacent_defects_not_repaired: "scripts/orch-backlog-stub.sh:367 runs `$cold[0].items | keys` against an ARRAY-shaped .items, so it yields integer indices and the post-write hot/cold reconciliation can never match by id — same array-vs-object class as FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX (2026-07-09). Also backlog-detail.json .count==437 vs (.items|length)==442 (log-only field, never gated on equality). Both left untouched and reported, not silently folded into a routing-scoped change.",
        raised_by: "po (router session 165f4245), triage of agent-father SECONDARY-Drain finding on FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW"
      }
    }
    else . end
]
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
