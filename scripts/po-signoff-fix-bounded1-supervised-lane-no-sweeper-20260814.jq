# PO sign-off — FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER review[] -> done_verified[]
# + mint FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER into ready[] (RLC lane
# per docs/agents/po/flow/zone-routing.md Step A2: non-dev next_agent => ready, not backlog).
# Usage: jq -f scripts/po-signoff-...jq --arg now "$NOW" docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# One-off closeout transform; persisted per docs/policies/dev-standards.md § Script Persistence.

( .task_board.review[] | select(.id == "FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER") ) as $row
| .task_board.review |= map(select(.id != "FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER"))
| .task_board.done_verified += [
    ($row | del(.next_agent)) + {
      status: "DONE_VERIFIED",
      closed_at: $now,
      reviewed_at: $now,
      reviewed_by: "po",
      updated_by: "po-signoff-20260814",
      verification: {
        raw_probe: {
          tool: "bash scripts/audits/bounded1-supervised-lane-report.sh",
          args: "no args; reads live docs/data/orch/orch-state.json + archive",
          live_value_observed: "exit=0 [PASS] — PRIMARY (supervised AND plan_only) 5 rows, dispatch-lane=none:0; SECONDARY (XOR) 77 rows, dispatch-lane=none:0; READY-PRIMARY 0 rows none:0; BACKLOG-XOR-GAP 37; REVIEW-SUP-PO 23. Second probe: bash scripts/audits/po-manual-dispatch-sweep-verify.sh exit=0, 24/24 controls green incl. BACKLOG-XOR-GAP positive/negative + DRS disjointness + flag_reentrant.",
          observed_at: "2026-08-14T03:32:12Z",
          verdict: "PASS"
        }
      },
      po_signoff_20260814: ("PO DONE_VERIFIED " + $now + ". Verified at source, not from architect's note: is_backlog_xor_gap live at scripts/lib/po-manual-dispatch-eligibility.jq:143, wired as 3rd candidate class in manual-dispatch-sweep.md Step 1, mirrored in dev-standards.md + zone-routing.md A2 xref. PRIOR HOLD SATISFIED (status_note + router_source_verified_20260722 both forbade sign-off on the instrument alone, required a live fire+drain): this row's OWN history is that evidence — SLS promoted it 08-07T19:52:24Z and claimed it 08-07T20:54:43Z live, architect shipped, review-lane secondary-drain claimed it 08-14T03:26:11Z and routed it here; review[] 99->96 across 01:26Z-03:22Z. HONESTY QUALIFIER: the PRIMARY gate was RED (exit=1, FIX-RAG-COMPACTION-DISK-AMPLIFICATION dispatch-lane=none) when PO first ran it this tick. It is green because of the mechanism AND a 4-row next_agent repair PO made this tick, each derived from the row's own zone field (never invented). Architect's SUB-Q1/SUB-Q2 answers ACCEPTED: AND->OR and flag-collapse correctly rejected (would reopen the ratified human-gate ruling / destroy a live distinction); the 3rd-option BACKLOG-XOR-GAP fold is the right shape. RECURRENCE PREVENTION NOT SHIPPED HERE — minted FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER (ready[], architect).")
    }
  ]
| .task_board.ready += [
    {
      id: "FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER",
      type: "FIX",
      status: "READY",
      priority: "P2",
      size: "S",
      zone: "cross-service/",
      owner: "architect",
      next_agent: "architect",
      supervised: false,
      plan_only: false,
      created_at: $now,
      created_by: "po (signoff FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER)",
      title: "A task row carrying supervised and/or plan_only while owner AND next_agent are both null claims a deliberate-dispatch lane no mechanism can route it through — 4 live rows aged 15-58d, hand-repaired 2026-08-14, nothing prevents the next one",
      evidence: "MEASURED live 2026-08-14T03:27Z via scripts/audits/bounded1-supervised-lane-report.sh: 4 rows with dispatch-lane=none — FIX-RAG-COMPACTION-DISK-AMPLIFICATION (sup+plan, PRIMARY gate FAIL, 15d), AUDIT-FETCH-COMPLETE (sup-only, 58d), UC-RDL-P4 (sup-only, next_agent=\"\", 31d), DEBT-SCRIPTS-MIGRATIONS-TSC-COVERAGE (plan_only-only, 31d). Architect flagged a 4-row cohort of the same shape on 2026-08-07 (all minted 07-29); 3 of those left the class only incidentally (2 lane-moved to review[] acquiring a next_agent, 1 cold-evicted DONE_VERIFIED) — not by any mechanism. EVERY one of the 4 live rows carried a zone that deterministically implies its handler via zone-routing.md Step A, so the missing field was derivable at mint time and simply never derived.",
      question: "owner:null + next_agent:null is a LEGITIMATE documented state (zone-routing.md Step A2 row 4: 'genuinely parked, no handler yet' -> consumed by nothing, intentional). So the invariant is NOT 'every row needs a handler'. It is narrower: setting supervised or plan_only ASSERTS the row wants deliberate dispatch (SLS / BACKLOG-XOR-GAP territory), which is incompatible with 'parked, no handler'. DECIDE the enforcement point — (1) non-fatal REPORT stage in scripts/orch-validate.mjs alongside the existing Stage-1g dangling-dependency report, (2) a superRefine in apps/mcp-server/src/infrastructure/orchStateSchema.ts (fatal — check the live blast radius first, this WILL reject writes), or (3) auto-derive next_agent from zone at mint time. Do NOT make it fatal without first counting live violators.",
      deliverable: "AC: an executable proves that no task row can carry supervised or plan_only with both owner and next_agent unresolved, and that the parked-no-flags state stays legal. Evidence = a live run plus a negative control (a parked flagless row must NOT trip the check). Reuse the report script's own predicates; do not reimplement lane resolution.",
      baseline_pass: "bash scripts/audits/bounded1-supervised-lane-report.sh exits 0 (2026-08-14T03:32:12Z) with dispatch-lane=none:0 in PRIMARY and SECONDARY — that is the post-hand-repair baseline this row must make self-sustaining.",
      files: [
        "scripts/orch-validate.mjs",
        "apps/mcp-server/src/infrastructure/orchStateSchema.ts",
        "scripts/audits/bounded1-supervised-lane-report.sh",
        "docs/agents/po/flow/zone-routing.md"
      ],
      refs: ["FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER", "FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH"]
    }
  ]
