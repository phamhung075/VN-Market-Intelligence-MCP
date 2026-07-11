(.task_board.review[] | select(.id == "WATCHLIST-DB-SYSMAP-DRIFT-FIX")) |= (
  .qa_verdict = "CHANGES_REQUESTED"
  | .qa_round = 1
  | .qa_reviewed_at = "2026-07-11T12:10:00Z"
  | .qa_note = "AC-5 unmet on live serving: apps/technical-analysis (Go TA service, separate container, shares market_data volume DB_READONLY) resolves its watchlist ONCE at process startup (cmd/server/main.go:54-64 readWatchlistFromDB) and was never restarted after the DB resync/mcp-server swap -- Up 3 days, unchanged. Live-curled /ta/roc-momentum + /ta/money-flow-oscillators right now both return the OLD stale 41-ticker set verbatim, incl. the 5 pre-existing garbage orphans named in commit 91ef0ac74's own message (VDC/BDI/DLC/JSH/SIS) plus GAS/GVR/MBB/ACB/CTG/VPB/HSG/NKG/HVN/ACV/HCM/DHG/POW/PPC/TCH/VNH/REE/MWG/VEA -- zero overlap with the corrected 33-ticker SSOT set. mcp-server get_watchlist (33, correct) and direct DB probe (33, correct) are BOTH fine -- this is a second, separate serving surface the task's own TLDR/AC-5 named explicitly and nobody restarted. Minimum fix: ops restart (not rebuild -- no code/image change needed, technical-analysis code is already correct) technical-analysis container so it re-reads the now-corrected shared DB at startup; then re-curl both endpoints to confirm ticker-set match."
  | .next_agent = "ops"
)
