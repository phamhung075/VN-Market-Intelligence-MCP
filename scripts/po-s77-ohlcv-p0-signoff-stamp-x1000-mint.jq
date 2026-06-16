# po-s77 — OHLCV-P0 PO sign-off stamp (in-place, NO lane move) + X1000 follow-on mint (backlog)
#
# Context (2026-06-16): qa cycle-276 already relocated FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
# review[] -> done_verified[] and committed (138bd74e). Its done_verified_evidence is RAW-sound
# (RSI 35.7/36.2/27.3, full 6-figure BB price, image 1c6f739c @04:29Z, 77 corrupt rows deleted,
# 11 non-incident residual). Router independently re-RAW-verified the SAME live values + tsc-green.
# QA's lane move STANDS (the live-heal + deploy are real). PO does NOT thrash the lane.
#
# GAP qa left: no explicit pending_behavioral_gate for the next session. The live-DATA gate is GREEN,
# but the BEHAVIORAL gate ("writers no longer RE-corrupt on the next post-rebuild cycle") is only
# provable next session — Writer D 01:30 UTC + morning-briefing 01:00 UTC + first TA scan 02:15 UTC
# of the NEXT VN session must show NO new synthetic seed bars and majors at real mid-band RSI.
# This mirrors the FIX-ALERT-ENGINE-RSI-SINGLEDIGIT live_partial_verdict + pending_behavioral_gate pattern.
#
# Mutation 1 (IN-PLACE, no relocation — conservation trivially preserved):
#   add a `po_signoff` block to the done_verified OHLCV-P0 row carrying:
#     - signoff_by/at, qa_verdict (APPROVED cycle-275, reconfirmed 276), impl_commits(7)
#     - rebuild_landed_at + rebuild_image (CREATED_GATE PASS)
#     - live_heal evidence (router RAW re-verify)
#     - tsc_green_note (router RAW: bunx tsc --noEmit exit 0 — the TS2367 head-chain is code-resolved;
#       PUSH still HELD per router instruction — push is the router's call, not po's)
#     - pending_behavioral_gate (next-session, mirrors RSI-SINGLEDIGIT)
#   Idempotent: skipped if po_signoff already present.
#
# Mutation 2 (MINT to backlog[]):
#   append FIX-OHLCV-SCALE-X1000-AUTO-REPAIR (P3, dev-mcp-server, apps/mcp-server/) per qa recommendation.
#   Idempotent: skipped if id already in ANY board array.
#
# Harness adds: CONSERVATION guard (done_verified UNCHANGED length; backlog +1; all other lanes byte-unchanged;
# total +1) + signoff-once + mint-once invariants.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s77-ohlcv-p0-signoff-stamp-x1000-mint.jq docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> conservation -> invariant -> rename; commit orch-state by EXPLICIT PATH; PUSH HELD — router's call.)

# --- helper: does the X1000 id exist anywhere on the board? ---
def x1000_exists:
  ([.task_board | to_entries[] | select(.value|type=="array") | .value[] | (.id // "")]
   | any(. == "FIX-OHLCV-SCALE-X1000-AUTO-REPAIR"));

# --- Mutation 1: stamp po_signoff on the done_verified OHLCV-P0 row (in place, idempotent) ---
.task_board.done_verified |= map(
  if (.id // "") == "FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0" and (has("po_signoff") | not)
  then . + {
    po_signoff: {
      verdict: "DONE_VERIFIED-with-pending-behavioral-gate",
      signoff_by: "po-s77",
      signoff_at: $now,
      note: "qa cycle-276 relocated review->done_verified (138bd74e); PO sign-off STAMPED on top — qa lane move STANDS (live-heal + deploy real). PO accepts done_verified for the CODE+CI+DEPLOY+LIVE-DATA dimensions (all RAW-re-verified by router) and attaches the next-session BEHAVIORAL gate qa omitted.",
      qa_verdict: "APPROVED cycle-275 (reconfirmed cycle-276); full CI 13050 pass / 42 skip / 17 fail = 6 flaky + 4 pre-existing zero-overlap (chromium/bctc_table_rows/stale-1837a-enum), no regression; fix-specific 106 tests 0 fail; DDD/security/mock-guard PASS; choke-point integrity PASS",
      impl_commits: [
        "a719c138 SUBTASK-1 ohlcvWriteService SSOT choke-point",
        "31306d76 SUBTASK-2 Writer D -> writeOhlcvBatch SSOT",
        "ac8e28a6 SUBTASK-3 UPSERT_INTRADAY + pushPricesHandler (x1000 source killed)",
        "866dc899 SUBTASK-4 FR-G2/FR-G3 sanity detectors",
        "647e773e SUBTASK-5 ohlcvSanityCheckEarly cron 00:45 UTC",
        "e4801dcc SUBTASK-6 fast-track repair script",
        "8f087043 SUBTASK-7 regression suite AC-T1..T8"
      ],
      impl_commit_count: 7,
      rebuild_landed_at: "2026-06-16T04:29:22Z",
      rebuild_image: "sha256:1c6f739ca954f21ba50b323097a51f9e00af8b30f44082166a0d17f9066fb47f",
      created_gate: "PASS — image .Created 2026-06-16T04:29:22Z > latest fix commit 02:31Z; container Up 4min (healthy); 13 containers healthy (no peers dropped); ohlcvWriteService present in running container",
      live_heal_verified: "router RAW re-verify 2026-06-16T04:33Z via gateway call_tool get_technical_indicators: VHM RSI 35.7 price 136,100 / VIC RSI 36.2 price 193,500 / VJC RSI 27.3 price 138,400 — all real mid-band/oversold (NO single-digit, NO RSI=100.0), full 6-figure BB Price (NO div1000 truncation); 77 corrupt 06-16 rows deleted 02:13Z (0 incident rows remain); 11 residual = non-incident (5 all-zero stubs + 6 global-index snapshots)",
      residual_boundary: "qa-judged acceptable: detectAndNormalizeScaleFromPrevClose corrects div1000 at write-time (gate tickers fixed); x1000 in 10K-10M band FLAGGED post-write by FR-G2 (not auto-repaired) but incident SOURCE (handler pre-x1000) killed — follow-on FIX-OHLCV-SCALE-X1000-AUTO-REPAIR (P3) minted this pass",
      tsc_state_note: "router RAW 2026-06-16T04:33Z: bunx tsc --noEmit in apps/mcp-server EXIT 0 (zero errors) — the TS2367 head-chain (FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367) is CODE-RESOLVED on HEAD (6f9b3eba). PUSH still HELD by router decision (push is the router's call, not po's); po-s77 does NOT touch the head chain or push.",
      pending_behavioral_gate: "NEXT SESSION (mirrors FIX-ALERT-ENGINE-RSI-SINGLEDIGIT): the post-rebuild Writer D (01:30 UTC) + morning-briefing (01:00 UTC) + first TA scan (02:15 UTC) of the NEXT VN session must show (a) NO new whole-universe synthetic seed candle (no flat O=H=L=C vol=0 data_env=NULL daily_ohlcv rows minted for the new day across the universe), (b) NO ticker with a 06-16/future-day close ~x1000/div1000 off its prior real close, (c) majors VHM/VIC/VJC at real mid-band RSI (no single-digit, no 100.0) matching canonical within 0.1pt, generic all tickers, (d) NO 'gia 0 duoi BB' false breakouts on MARKET. Provable only next session on the hourly dev-team :07 tick. The DEPLOY is what prevents re-corruption; this gate proves the deployed writers behave. done_verified holds for code+ci+deploy+live-data NOW; this gate is the final RE-corruption proof."
    }
  }
  else . end
)

# --- Mutation 2: mint X1000 follow-on to backlog[] (idempotent) ---
| if x1000_exists then .
  else .task_board.backlog += [{
    id: "FIX-OHLCV-SCALE-X1000-AUTO-REPAIR",
    type: "FIX",
    status: "BACKLOG",
    priority: "P3",
    size: "S",
    zone: "apps/mcp-server/",
    owner: "dev-mcp-server",
    owner_agent: "dev-mcp-server",
    title: "FIX-OHLCV-SCALE-X1000-AUTO-REPAIR — extend ohlcvWriteService detectAndNormalizeScaleFromPrevClose to AUTO-REPAIR the x1000 direction at write-time (current/prevClose >= 50 -> div1000), closing the residual that FR-G2 currently only FLAGS post-write.",
    scope: "P0 FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 killed the x1000 incident SOURCE (pushPricesHandler no longer pre-multiplies) and corrects the div1000 direction at write-time. The x1000 direction (inflated AAA/ADS class, current/prevClose >= 50, price in 10K-10M band) is currently only DETECTED post-write by FR-G2 (emits BUG alert, no auto-repair). Extend detectAndNormalizeScaleFromPrevClose to also correct the x1000 direction at write-time so an edge-case x1000 candle self-heals instead of landing + flagging. GENERIC across all tickers (/goal#2), validated against the DB-seeded prior real close.",
    root_cause: "SUBTASK-3 boundary: detectAndNormalizeScaleFromPrevClose handles only the div1000 direction (prevClose/current >= 50 -> x1000). The symmetric x1000 direction was descoped per architect P0 design Section 2.1 (post-write defense-in-depth via FR-G2, not auto-correction). Low-urgency residual.",
    verification_gate: "(a) a synthetic x1000-inflated candle (e.g. AAA written at 7.3M vs prior real 7,260) is auto-corrected to raw VND at write-time by ohlcvWriteService, NOT merely flagged by FR-G2; (b) new regression test in FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts (or sibling) GREEN for the x1000 auto-repair path; (c) FR-G2 still fires for genuine threshold-crossing anomalies that are NOT a clean x1000 (no over-correction of real volatility); (d) full CI green; rebuild mcp-server.",
    rebuild_required: "mcp-server",
    first_agent: "dev-mcp-server",
    fast_track_eligible: true,
    fast_track_reason: "well-specced S-size single-file extension of an existing service method with an existing test suite — direct FIX candidate (dev-team Step 3) unless router opts for ba review; not a recurring-class re-touch (the recurring class is closed by the P0).",
    source: "qa cycle-275 follow-on recommendation (FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-qa-report.md Section 'Residual Judgment' + TASK_REPORT 'Follow-on recommendation'); minted by po-s77.",
    user_impact: "LOW — the incident x1000 rows are already healed and the source is killed; this only adds write-time auto-repair for a future edge-case x1000 candle that FR-G2 would otherwise flag-not-fix.",
    created_at: $now,
    created_by: "po-s77",
    triaged_by: "po-s77",
    parent_task: "FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0"
  }]
  end
