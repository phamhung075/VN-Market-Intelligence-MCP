# scripts/architect-fix-orchstate-mint-flagged-row-design-20260823.jq
#
# Architect design-complete stamp for FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-
# RESOLVABLE-HANDLER (ready[], PO-mint, no BA spec). Decision: PHASED
# enforcement -- non-fatal REPORT stage in scripts/orch-validate.mjs first
# (mirrors orchStateSchema.ts:658-661's own "standalone-report-first,
# superRefine-later" precedent for this exact class of invariant), reusing
# bounded1-supervised-lane-report.sh's dispatch_lane() predicate. Single-
# owner (developer, scripts/ only) -- no split needed unlike the other two
# rows in this session.
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/architect-fix-orchstate-mint-flagged-row-design-20260823.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

(.task_board.ready | map(.id == "FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER") | index(true)) as $idx
| if $idx == null then error("FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER not found in .task_board.ready[]") else . end
| .task_board.ready[$idx] += {
    architect_design_complete: true,
    architect_completed_at: $now,
    architect_handoff: "docs/architecture-briefs/2026-08-23-fix-orchstate-mint-flagged-row-no-handler.md",
    architect_review_note: "DESIGN COMPLETE 2026-08-23 (architect). Decision: PHASED, not a single choice among the row's 3 options -- land (1) a non-fatal REPORT stage in scripts/orch-validate.mjs first (mirrors Stage 1g's own shape, AND orchStateSchema.ts:658-661's own in-file precedent: 'standalone function... so the validator CLI can call it... Promote to a superRefine once [gating conditions] land' -- the exact same migration pattern this codebase already uses for a related invariant). Predicate reused, not reinvented: scripts/audits/bounded1-supervised-lane-report.sh's inline dispatch_lane($detail_items;$roster_map) (itself built on scripts/lib/devteam-eligibility.jq's effective_supervised/effective_plan_only/effective_owner/effective_next_agent) is the SSOT -- port ONLY the 2-line detail-first/board-fallback owner/next_agent lookups into JS (not a new resolution algorithm), citing the jq file as the mirrored SSOT. Scope: backlog[]/ready[]/review[] (matches the live report script's own coverage exactly). Trigger: EITHER flag alone, not AND-only -- 3 of the row's own 4 live-repaired violators carried only ONE flag. Option 3 (auto-derive next_agent from zone at mint time) REJECTED: zone-detect's own Tier-2/3 fallback is not confident enough to silently auto-fill a DELIBERATE-dispatch-asserting row, and doing so would remove the only visible signal of a mint-time gap. Negative control required (row 4 Step A2, 'genuinely parked, no handler yet' with NEITHER flag set) must NOT be reported -- this is the row's own explicit non-goal. Promotion-to-fatal path specified as an explicit, gated follow-up (14 consecutive clean write cycles), not done now -- the baseline (0 violators) proves the REPLAY is clean, not that every future write-time position is. Full design + test cases + risk flags: see architect_handoff.",
    next_agent: "developer",
    updated_by: "architect"
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "architect (FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER design)"
