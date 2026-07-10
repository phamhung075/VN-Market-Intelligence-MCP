# Mint CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS -> backlog[]
#
# Discovered 2026-07-10T21:07Z dev-team cron tick, during routine WIP inspection
# (2 of 3 task_board.in_progress[] rows had owner:null/updated_at:null — no live
# lock on either via task_list_held). Router RAW-verified both via git log/git
# show/archive-detail cross-check (not assumed):
#
# 1. FIX-L2-FRESHNESS-DATAASOF-FIELDS — commit a384497a3 (2026-06-27, 13 days
#    ago) explicitly states "Closes FIX-L2-FRESHNESS-DATAASOF-FIELDS", diff
#    confirmed: data_asof added to all 5 handlers named in the row's own
#    verification_gate (marketDigestHandler/alertsHandler/priceHistoryHandler/
#    qualityChecklistHandler/vpsProxyHealthHandler), 20 new passing test
#    assertions, tsc clean, rows_no_asof 8->2. Board row never flipped —
#    shipped-but-never-closed.
#
# 2. FIX-SCHEMA-DRIFT-P5-SELFHEAL — its own detail_ref record (backlog-
#    detail.json) already carries status:"REWORK" with an explicit po-S19 note
#    (2026-06-09): "Stays REWORK -- superseded by FU-SCHEMA-DRIFT-P7 ... do NOT
#    re-dispatch it (direction abandoned)." The successor chain (P6->P7->P8)
#    has since closed twice more (P7 spike DONE, P8-IMPL disproven+freed,
#    commit efbab47b6). The live board row is a forgotten ancestor stub, still
#    IN_PROGRESS/board-desynced from its own detail record for >1 month.
#
# Neither row has ever been reconciled between task_board (thin) and its
# detail_ref (authoritative) copy -- both silently occupy WIP capacity that
# BOUNDED-1 correctly treats as "in use" (WIP=ready+in_progress>=1 no-ops the
# idle-capacity pickup), so live backlog work is blocked by 2 dead slots.
#
# Router does NOT flip either row itself (judgment call on AC-sufficiency /
# direction-abandonment belongs to po, matching established precedent commits
# 755c761a8 "po/board...REVIEW->REWORK" and efbab47b6 "po-S51...SUPERSEDED").
# This mint only surfaces the finding for po's normal board-hygiene triage.
#
# GUARD: refuse if a row with this ID already exists anywhere on the board.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-mint-clean-stale-inprogress-p5selfheal-l2freshness.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| ([.task_board[] | arrays[]? | select(type=="object" and .id=="CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS")] | length) as $exists
| if $exists > 0 then error("CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS already exists on board — refuse duplicate mint")
  else . end
| .task_board.backlog = ((.task_board.backlog // []) + [{
    id: "CLEAN-STALE-INPROGRESS-P5SELFHEAL-L2FRESHNESS",
    size: "S",
    status: "BACKLOG",
    title: "Close 2 stale in_progress[] rows: FIX-L2-FRESHNESS-DATAASOF-FIELDS (shipped a384497a3, never flipped) + FIX-SCHEMA-DRIFT-P5-SELFHEAL (abandoned direction, detail_ref already says REWORK/do-not-redispatch)",
    type: "CLEAN",
    zone: "docs/data/orch/",
    owner: "po",
    priority: "normal",
    depends: [],
    note: "Discovered 2026-07-10T21:07Z dev-team cron tick during routine WIP inspection — 2 of 3 in_progress[] rows had owner:null, updated_at:null, no live task_list_held lock. (1) FIX-L2-FRESHNESS-DATAASOF-FIELDS: commit a384497a3 (2026-06-27) diff-confirmed to add data_asof to all 5 handlers named in that row's own verification_gate, 20 passing tests, tsc clean, rows_no_asof 8->2 — commit message says \"Closes FIX-L2-FRESHNESS-DATAASOF-FIELDS\" but board row was never flipped, sat in_progress 13 days. (2) FIX-SCHEMA-DRIFT-P5-SELFHEAL: its own backlog-detail.json record already carries status REWORK with explicit po-S19 2026-06-09 note \"do NOT re-dispatch it (direction abandoned)\" — successor chain P6->P7->P8 has since closed twice more (P8-IMPL disproven+freed, commit efbab47b6), this ancestor stub was never reconciled, sat in_progress >1 month. Both silently consumed WIP capacity, blocking BOUNDED-1 idle-capacity pickup from claiming real backlog work (WIP=ready+in_progress already >=1 due to these 2 dead slots). Router did not flip either row itself — AC-sufficiency (row 1) and direction-abandonment confirmation (row 2) are po judgment calls, matching precedent commits 755c761a8 and efbab47b6. Also worth a systemic note: task_board (thin) vs detail_ref (archive/backlog-detail.json, authoritative) can silently desync with no reconciliation sweep — same failure shape as [[feedback_epic_wrapper_closeout_gap_no_auto_revisit]] but for plain (non-wrapper) rows whose implementation closed out-of-band.",
    created_at: $now,
    created_by: "router",
    source: "router discovery during routine dev-team cron tick WIP inspection, 2026-07-10T21:07Z, RAW-verified via git log/git show/archive-detail cross-check before minting"
  }])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "router"
