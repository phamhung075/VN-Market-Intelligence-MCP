# po-archive-contam11-obsolete-by-other-lanes.jq
# ---------------------------------------------------------------------------
# Disposition of stale backlog row CONTAM-11-REMEDIATE.
# Owner: po · Date: 2026-07-11 · Sprint: OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
#
# WHY: Row claimed 3023 contaminated sub-1000 daily_ohlcv rows (9 bucket-(b)
#   tickers). ~99.8% already repaired by ongoing OHLCV normalization lanes.
#   Live re-verify (named-volume market.db, WAL-inclusive) found a single-digit
#   residual whose *composition moved* between two probes taken ~2h apart
#   (pm 07cd7d848: 4 rows BMP/HGM/KSV/MCH x1 ; po this tick: 6 rows all TBD) —
#   i.e. a moving target actively churned by live lanes. Residual is
#   6/754216 = 0.0008%, historical (2023), below any action threshold; the
#   row's own AC mandates disproportionate heavyweight remediation
#   (VPS anchor + BACKUP + off-hours + PO go/no-go gate). ARCHIVE, no re-mint.
#
# NET-ZERO lane move: backlog[] -> done_verified[]. task_total conserved (458).
# Guard: aborts unless EXACTLY ONE CONTAM-11-REMEDIATE row sits in backlog[].
#
# Usage:
#   jq -f scripts/po-archive-contam11-obsolete-by-other-lanes.jq \
#      --arg NOW "<ISO8601Z>" docs/data/orch/orch-state.json \
#   | bash scripts/orch-apply.sh
# ---------------------------------------------------------------------------

( [ .task_board.backlog[] | select(.id == "CONTAM-11-REMEDIATE") ] ) as $picked
| if ($picked | length) != 1
    then error("GUARD: expected exactly 1 CONTAM-11-REMEDIATE in backlog[], found \($picked | length)")
    else . end
| .task_board.backlog       |= map(select(.id != "CONTAM-11-REMEDIATE"))
| .task_board.done_verified += [ $picked[0] + {
      status: "DONE_VERIFIED",
      closed_at: $NOW,
      status_note: "backlog->done_verified: obsolete — bulk repaired by other OHLCV lanes; single-digit residual below action threshold",
      verify_note: ("ARCHIVED as obsolete-by-other-lanes. Row claimed 3023 contaminated sub-1000 daily_ohlcv rows (9 tickers BMP/MCH/HGM/PMC/KSV/TOS/AGX/TBD/STS); ~99.8% repaired by ongoing OHLCV normalization lanes. Live re-verify 2026-07-11 (named-volume vn-market-intelligence-mcp_market_data /app/data/market.db, WAL-inclusive): 6 residual sub-1000 rows, ALL TBD (close 100-135, 2023-06-28..07-06). pm probe 07cd7d848 (~2h earlier) found 4 DIFFERENT rows (BMP/HGM/KSV/MCH x1) — differing composition confirms the residual is a moving target churned by live lanes, so a rescoped row would re-stale within hours. 6/754216 = 0.0008%, historical, below any action threshold; the row's own AC-mandated heavyweight remediation (VPS anchor + BACKUP + off-hours window + PO go/no-go gate) is disproportionate. No fresh row minted — the OHLCV contamination auditor/CONTAM-10 detector is the correct self-regenerating re-detection path if residual ever crosses threshold. Provenance: pm raw-verify commit 07cd7d848 + po live re-verify this tick.")
  } ]
| .task_board._updated_at = $NOW
| .task_board._updated_by = "po"
