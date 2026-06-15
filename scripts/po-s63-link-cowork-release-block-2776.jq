# po-s63-link-cowork-release-block-2776.jq
# Single-mutation, IDEMPOTENT triage: link a cowork analysis-agent RELEASE-block
# symptom (bctc-analyst "bug #2776" — CTG/VCB/D2D RELEASE BLOCKED, ~25 cycles,
# silent-suppressed) onto the EXISTING dev task that is its true root cause,
# WITHOUT creating a duplicate row and WITHOUT promoting past live WIP.
#
# Mechanism: stamp `cowork_release_block` (the analyst symptom linkage) onto the
# already-READY P0 `FIX-BCTC-ENRICH-SILENT-0ROWS` row so the next dispatcher knows
# clearing this P0 unblocks the CTG/VCB/D2D RELEASE gate and that the analyst's
# silent-suppress (no re-escalation) is JUSTIFIED, not a dropped signal.
#
# Idempotent: re-run is a no-op (guarded on `cowork_release_block` absence).
# Conservation: no array length change anywhere — pure in-place row annotation.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s63-link-cowork-release-block-2776.jq \
#       docs/data/orch/orch-state.json > /tmp/orch.tmp \
#   && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#   && mv /tmp/orch.tmp docs/data/orch/orch-state.json
# (commit orch-state by EXPLICIT PATH; PUSH held — PO deferred call after 06-16 gates.)

.task_board.ready |= map(
  if ((.id // .task_id) == "FIX-BCTC-ENRICH-SILENT-0ROWS")
     and (has("cowork_release_block") | not)
  then . + {
    cowork_release_block: {
      source: "cowork bctc-analyst (analysis-agent) — internal label 'bug #2776'",
      symptom: "RELEASE tickers BLOCKED ~25+ consecutive cycles, silent-suppressed (no re-escalation after c046): CTG (cycle 27, CRITICAL, watchlist bank), VCB (cycle 24, bank), D2D (cycle 24, real-estate). All show get_bctc_full = 'Chua co du lieu BCTC' / composite confidence 0.00-0.10.",
      raw_verified: "PO 2026-06-15: get_bctc_full(CTG) LIVE = 'Chua co du lieu BCTC' (block is REAL, not a stale flag). CTG+VCB are banks (B02-TCTD form) = the exact silent-0-rows root this task targets; D2D covered by generic_mandate (no per-ticker/per-form allowlist).",
      stale_premise_corrected: "Analyst keyed 'undeployed' off get_recent_fixes(10) absence of '#2776'. RAW: no #2776 fix at limit=50 either — because no committed fix EXISTS yet. This is NOT a deploy/rebuild-stall (nothing built to redeploy); it is this READY P0 awaiting dispatch behind live WIP=2. Escalation was NOT dropped: this task was minted 2026-06-15T17:19:55Z from OPS-BCTC-PIPELINE-RECON.",
      unblocks_on_done: "Clearing this P0 (done_verified = get_bctc_full returns REAL VARIED rows for CTG/VCB) releases the bctc-analyst CTG/VCB/D2D RELEASE gate; the analyst's silent-suppress policy is JUSTIFIED, not a dropped signal.",
      wip_disposition: "NOT promoted past live WIP=2 (ARCH-CRON-SCHEDULER-RELIABILITY + BA-VN-MACRO-TOOLING, both live as of board _updated_at). Remains #1 READY P0 — next dispatch slot.",
      linked_at: $now
    }
  }
  else . end
)
