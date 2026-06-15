# Router 2026-06-15T11:4xZ — FIX-MARKET-HEXAGRAM-TOOL-MISSING: record router RAW-verify + dispatch ops rebuild.
# In-place enrich of the review[] entry (dev already self-moved in_progress->review, conservation-clean). NO lane move.
#
# DEV RETURN (dev-mcp-server a385cdd3): root-cause class (a) — get_market_hexagram was DEREGISTERED 2026-05-31
# (TSH-1, kinh-dich-service /market returns 501) but still referenced by 3 agent bootstraps + digest-predict flow.
# Fix re-registers it with LOCAL COMPUTE ONLY (encodeHaos + resolveHexagram + computeMacroIndicatorScore/computeMacroScore),
# NO HTTP call => does NOT re-introduce the 501. Commits a8711e35 (code+test) + 89a3aaad (SSOT 163->164) + 5f79b5f0 (memory+board).
#
# ROUTER RAW VERIFY (re-run, NOT relayed):
#   * commit hygiene: a8711e35 = 2 files apps/mcp-server/ zone (kinhDichTools.ts +155, 285-test +20); 89a3aaad = 3 SSOT
#     files; 5f79b5f0 = memory + orch-state (board diff scope = ONLY hexagram status IN_PROGRESS->REVIEW + metadata,
#     no foreign task swept). No -A/secret. Linear on router-d71 0c85e8f1.
#   * NO-501-PATH confirmed: new handler imports haoEncoder/hexagramResolver + calls computeMacro* locally; grep of
#     the + diff shows zero getMarketHexagram/http/fetch//market call. Comment: "kinh-dich-service /market returns 501;
#     derive hexagram from local DB signals" — same pattern as explain_hexagram.
#   * TESTS (router-run bun): src/__tests__/285-kinhdich-tools.test.ts => 29 pass / 0 fail / 49 expect. tsc --noEmit
#     exit 0, 0 error TS. (Full-suite Bun-JIT teardown panic is the known pre-existing condition, not this change.)
#   * SSOT coherence: project-stats toolCount 163->164; tool-registry totalCount 163->164 + kinhdich count 5->6;
#     system-map live_evidence stale 156 -> 164 (reconciled). All 3 SSOTs aligned at 164 (honors toolcount-drift lesson).
#   * GENERIC /goal#2: 6 market-wide hao dimensions from local SQLite (VN-Index z, USD/VND inv, brent inv, gold inv,
#     foreign-flow breadth, macro composite); no hardcoded date/ticker; works every Sunday.
#
# REBUILD_REQUIRED: YES — mcp-server ONLY (tool registration is runtime). Tool will NOT appear in /health toolCount
#   until force-recreate. NEVER docker compose down (named-vol market.db + peers). Router dispatches ops.
#
# LIVE GATE (router RAW-verifies AFTER rebuild, then review->done_verified):
#   (1) rebuild lands: mcp-server image .Created > commit a8711e35 ts, RestartCount=0, healthy, peers up.
#   (2) /health toolCount == 164 AND get_market_hexagram present in the live tool list.
#   (3) call_tool get_market_hexagram({}) => plausible: header "=== QUE THI TRUONG ===", "Que N — <name>" N in 1..64,
#       "Tin hieu: TICH CUC|TIEU CUC|TRUNG TINH", "Do tin cay: N%", 6 hao floats each in [-1,1]. Plausibility per /goal#1
#       (NOT an error "Loi khi tinh que..."; if all-zero scores from empty DB it still returns a valid hexagram, but the
#       LIVE named-volume DB has market data so expect non-degenerate hao values).
#
# GUARD: refuse unless task in review[] AND not in done_verified[]. CONSERVATION: total UNCHANGED (in-place).
# Usage: jq --arg now "$NOW" -f scripts/router-d72-hexagram-rawverified-dispatch-ops-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-MARKET-HEXAGRAM-TOOL-MISSING" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| if ([.task_board.review[]? | select(.id==$tid)]|length==0) then error($tid + " not in review[] — refuse")
  elif ([.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already in done_verified[] — refuse")
  else . end
| .task_board.review = [ .task_board.review[]?
    | if .id==$tid then . + {
        root_cause_class:"(a) registration gap — get_market_hexagram DEREGISTERED 2026-05-31 (TSH-1, kinh-dich-service /market 501) but still referenced by 3 agent bootstraps + digest-predict flow.",
        fix_commits:["a8711e35","89a3aaad","5f79b5f0"],
        fix_summary:"re-register get_market_hexagram with LOCAL COMPUTE only (encodeHaos+resolveHexagram+computeMacroIndicatorScore/computeMacroScore); 6 market-wide hao dims from local SQLite; NO HTTP => sidesteps the 501. Same pattern as explain_hexagram.",
        router_raw_verify:"commits zone-clean no -A/secret; board diff scope = only hexagram status flip; NO-501-PATH confirmed (zero getMarketHexagram/http/fetch in + diff); router-run bun test 285-kinhdich 29 pass/0 fail/49 expect; tsc --noEmit exit 0 0-error; SSOT 163->164 coherent across project-stats/tool-registry(+kinhdich 5->6)/system-map(156->164 reconciled).",
        generic_verified:"/goal#2 PASS — 6 local hao dims, no hardcoded date/ticker, works every Sunday.",
        rebuild_required:true,
        rebuild_scope:"mcp-server ONLY (runtime tool registration). Force-recreate only, NEVER down (named-vol market.db + peers).",
        pending_live_gate:"AFTER rebuild: (1) image .Created > commit a8711e35, RestartCount=0, healthy, peers up; (2) /health toolCount==164 AND get_market_hexagram in live tool list; (3) call_tool get_market_hexagram({}) => plausible (header QUE THI TRUONG, Que N 1..64, Tin hieu TICH/TIEU/TRUNG, Do tin cay N%, 6 hao floats in [-1,1], NOT 'Loi khi tinh que'). Plausibility per /goal#1. Then review->done_verified.",
        ops_dispatched_ts:$now,
        rawverified_ts:$now
      } else . end ]
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"ops", rebuild_required:true,
    note:("ROUTER " + $now + " — FIX-MARKET-HEXAGRAM-TOOL-MISSING dev-mcp-server RETURNED (a385cdd3), router RAW-VERIFIED in review[]. Root-cause (a): tool deregistered 2026-05-31 (TSH-1 Go /market 501), re-registered with LOCAL COMPUTE (a8711e35) — NO HTTP, no 501 reintro. Router RAW: zone-clean commits, NO-501-PATH confirmed, bun test 29 pass/0 fail, tsc exit0 0-err, SSOT 163->164 coherent across 3 files. REBUILD_REQUIRED=YES mcp-server ONLY (force-recreate, NEVER down) — router DISPATCHING ops. LIVE GATE post-rebuild: /health toolCount==164 + get_market_hexagram present + plausible hexagram (Que 1..64, 6 hao in [-1,1]); then review->done_verified. Parallel review gates 2026-06-16: FIX-VNSTOCK-TRADINGSTATS-CRASH (08:30Z sweep), FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (01:00Z/02:15Z). FIX-FB-POSTER done_verified (60). ARCH-SHIP-WAVE-REAUDIT parked. Ready: FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL(P2). Holds: ARCH-CRON-SCHEDULER-RELIABILITY(QA-observe), BA-VN-MACRO-TOOLING(design). PUSH held (PO post-gates). Active coding lane=0.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on an in-place field update") else . end
