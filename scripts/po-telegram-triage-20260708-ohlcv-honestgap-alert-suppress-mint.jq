# po telegram-triage 2026-07-08T19:07Z dev-team tick — single id-guarded mint, pipe through scripts/orch-apply.sh
# Context: Telegram-queue triage of 14 reports. Cluster 2 = 5x "[OHLCV-DEPTH] VPS backfill stalled after 5 retries"
# (reports 3527/3529/3530/3531/3532, 03:36Z-18:34Z, byte-identical BDI:1 DLC:41 JSH:0 SIS:0 VDC:0).
#
# GROUND TRUTH (PO-verified): the PIPELINE root cause was already fixed. OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST
# (minted po-s135 2026-07-01 for the same signature report 3366) was root-caused 07-07 (deploy-vinahost.sh never
# deployed /root/fetch-ohlcv-backfill.sh) and VERIFIED COMPLETE 2026-07-08T02:12Z (109 tickers ok / 3 skipped /
# 0 errors / 77434 bars pushed), then cold-evicted DONE_VERIFIED -> archive/2026-07.json. All 5 reports fired AFTER
# that fix, with unchanged bar-counts across 07-01/03/04/08 => NOT a regression; the pipeline delivers for every code
# that HAS data, these 5 are honest-gap (JSH/SIS/VDC=0 bars = the 3 skipped, no fetchable source history).
#
# RESIDUAL (this mint): apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts /api/ohlcv-backfill-done
# re-queues depth-shortfall codes until retry_count>=5 (R-5 cap) then fires the [OHLCV-DEPTH] BUG alert — with NO
# exemption for codes that can never reach DEPTH_FLOOR=252. So these permanently-shallow codes loop forever and
# re-emit ~every backfill cycle. Per feedback_recurring_bug_escalation + CLAUDE.md "fix root cause not recurrent
# symptom": mint the DEFINITIVE emitter fix (honest-gap-aware alert). LOW / PLAN-ONLY: zero serving-layer impact,
# non-watchlist peripheral codes, only cost is alert-channel noise. Idempotent: id-guarded across ALL lanes.

($now // (now|todateiso8601)) as $ts
| ([ .task_board | (.backlog,.ready,.in_progress,.review,.qa,.done,.done_verified)[]?
     | if type=="object" then .id else . end ]) as $all_ids
| (if ($all_ids | index("FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS")) == null
   then .task_board.backlog += [{
     id: "FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS",
     title: "OHLCV depth-shortfall R-5 alert re-fires forever on permanently-shallow non-watchlist honest-gap codes (BDI/DLC/JSH/SIS/VDC) — make the emitter honest-gap-aware",
     type: "FIX",
     size: "S",
     status: "BACKLOG",
     priority: "low",
     plan_only: true,
     owner: "po",
     next_agent: "architect",
     zone: "apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts",
     depends: [],
     sprint: null,
     created_at: $ts,
     created_by: "po-telegram-triage-20260708T1907Z",
     source_report_ids: [3527, 3529, 3530, 3531, 3532],
     recurrence_anchor: "OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST",
     note: "PIPELINE ROOT ALREADY FIXED: OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST DONE_VERIFIED 2026-07-08T02:12Z (deploy-vinahost.sh gap deploying /root/fetch-ohlcv-backfill.sh; 109 ok/3 skipped/0 err/77434 bars), archived. RESIDUAL = alert noise only: /api/ohlcv-backfill-done (ohlcvBackfillHandler.ts ~L230-252) re-queues depth-shortfall codes, and at retry_count>=5 (R-5 cap) fires the [OHLCV-DEPTH] BUG alert with NO exemption for codes that can never hit DEPTH_FLOOR=252. JSH/SIS/VDC=0 bars have no fetchable source data => loop forever => re-emit ~every 3h. 5 reports 3527/3529-3532 (07-08 03:36Z-18:34Z, all POST-fix, unchanged signature since 07-01) consolidated here; NOT a regression. Definitive fix: exempt permanently-unavailable/honest-gap codes (no source history) from the depth-shortfall retry+R-5 BUG-alert loop, or scope the alert to watchlist codes. LOW: zero serving impact, peripheral non-watchlist codes, only cost is recurring alert-channel noise. Filed by po telegram-triage 2026-07-08T19:07Z per feedback_recurring_bug_escalation (8+ occurrences across 4 waves: 3366/3418/3501 + these 5)."
   }]
   else . end)
