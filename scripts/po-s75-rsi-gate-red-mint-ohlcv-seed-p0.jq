# po-s75 atomic board mutation — 2026-06-16
# Trigger: router RAW-verified FIX-ALERT-ENGINE-RSI-SINGLEDIGIT behavioral gate RED.
# Evidence: docs/handoffs/FIX-ALERT-ENGINE-RSI-SINGLEDIGIT-gate-probe-2026-06-16.md
# Pointer: this script is referenced from docs/policies/dev-standards.md § Script Persistence
#          (PO board-mutation scripts family po-sNN-*.jq).
#
# Mutations (head chain FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367 -> ba is LEFT UNTOUCHED):
#  1. review[] FIX-ALERT-ENGINE-RSI-SINGLEDIGIT: stamp gate-RED disposition
#     = HOLD as symptom-mitigated/superseded (NOT done_verified, NOT rejected).
#  2. ready[] += FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 (zone apps/mcp-server, owner dev-mcp-server).
#  3. backlog[] FIX-ALERT-OPEN-ZERO-PRICE-RACE: keep HELD, re-point hold to the new gate.
#  4. SSOT markers bumped.

def stamp_rsi(e):
  e
  + {
      gate_disposition: "HOLD-SYMPTOM-MITIGATED-SUPERSEDED",
      gate_verdict_2026_06_16: "RED",
      gate_red_reason: "Router RAW-verified LIVE 2026-06-16T01:35Z (NOT a badge): canonical get_technical_indicators is ITSELF poisoned — VHM RSI 8.8 (price 136,100, close truncated div1000 -> 136), VIC RSI 6.5 (192,600 -> 193). DB named-volume daily_ohlcv shows the cause: a whole-universe synthetic 2026-06-16 seed candle (1203 rows, flat O=H=L=C, vol=0, data_env=NULL); 77 of them unit-mis-scaled by a clean x1000/div1000 factor (VHM/VIC/VJC div1000 -> single-digit RSI; AAA/ADS/+74 x1000 -> RSI 100.0). Root cause is UPSTREAM of the alert-engine, in apps/mcp-server (writer ohlcvDailyAggregatorJob.ts; guard miss ohlcvSanityCheckJob.ts). This task's MIN_CANDLES=35 guard (commit c9892200) is REAL and stays as symptom mitigation but does NOT fix the live failure — 'make alert-engine match canonical' is moot while canonical is poisoned by the same bad bar.",
      gate_red_disposition_note: "Kept in review[] (NOT done_verified). Superseded by FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0. Re-evaluate this entry for done_verified ONLY after that P0 closes and the same 2026-06-16-style gate (morning-briefing 01:00Z + first TA scan 02:15Z show majors mid-band RSI, no single-digit / no 100.0, match canonical within 0.1pt, generic all tickers) is RAW-verified GREEN. Owner zone apps/alert-engine/ was the WRONG zone for the root cause; this entry is now a downstream consumer of the data fix.",
      gate_disposition_by: "po-s75",
      gate_disposition_at: "2026-06-16T01:45:00Z",
      push_disposition: "HOLD (PO deferred call; unrelated to this gate — separate tsc-red head chain unblocker FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367 governs push)."
    };

def repoint_zero_price(e):
  e
  + {
      hold_reason: "Still HELD by po-s75. depends[] FIX-ALERT-ENGINE-RSI-SINGLEDIGIT gate is RED (2026-06-16). The real open-window root cause is the upstream synthetic seed candle (FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0) — same data-corruption surface. Do NOT dispatch until FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 closes AND the 2026-06-16-style RSI gate observes a clean post-fix market open. The flat zero-volume O=H=L=C seed bar is itself the giá=0 / partial-window source this task targets — folding/sequencing under the P0 avoids double-touching the alert open path.",
      depends: ["FIX-ALERT-ENGINE-RSI-SINGLEDIGIT", "FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0"],
      hold_updated_by: "po-s75",
      hold_updated_at: "2026-06-16T01:45:00Z"
    };

. as $root
| ($root.task_board.review // [] | map(if .id == "FIX-ALERT-ENGINE-RSI-SINGLEDIGIT" then stamp_rsi(.) else . end)) as $review2
| ($root.task_board.backlog // [] | map(if .id == "FIX-ALERT-OPEN-ZERO-PRICE-RACE" then repoint_zero_price(.) else . end)) as $backlog2
| {
    id: "FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0",
    type: "FIX",
    title: "FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 — the whole-universe synthetic 2026-06-16 daily_ohlcv seed candle (1203 rows, flat O=H=L=C, vol=0, data_env=NULL) is unit-mis-scaled on 77 tickers by a clean x1000/div1000 factor (VHM/VIC/VJC div1000 -> single-digit RSI; AAA/ADS/+74 x1000 -> RSI 100.0); this poisons canonical get_technical_indicators RSI/MA/BB daily across 77 tickers incl. 3 watchlist majors and emits 'giá 0 dưới BB' false breakouts to LIVE MARKET",
    zone: "apps/mcp-server/",
    owner: "dev-mcp-server",
    owner_agent: "dev-mcp-server",
    status: "READY",
    priority: "P0",
    size: "M",
    recon_first: true,
    recurring_class: true,
    root_cause: "RECURRING CLASS (3rd+ touch — escalate per feedback_recurring_bug_escalation). The daily-seed candle writer apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts writes a synthetic 2026-06-16 row for ALL 1203 tickers (flat O=H=L=C from current/intraday price, volume=0, data_env=NULL). On 77 of them the seeded close is unit-mis-scaled by a clean x1000/div1000 factor vs the prior REAL close: VHM 136.1 (prior 136,100), VIC 192.6 (prior 192,600), VJC 141.3 (prior 183,700) -> div1000 -> 6-figure majors collapse to single-digit RSI; AAA 7.3M (prior 7,260), ADS 9.22M, +72 more -> x1000 -> RSI pegs 100.0. The existing guard apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts (which ALREADY carries CONTAM-5/CONTAM-7 ohlcv-unit-contam tests) is either not run before the aggregator's upsert lands, or its unit check does not cover this synthetic-seed write path — so the bad bar reaches daily_ohlcv. This is the SAME defect class as the closed FIX-STOCK-PRICE-SCALE-CORRUPT (apps/stock-price normalizer) / OHLCV-UNIT-CONTAM / CONTAM-5 / CONTAM-7 — a shipped guard is NOT catching the live synthetic rows.",
    related_prior: ["FIX-STOCK-PRICE-SCALE-CORRUPT(done_verified)", "OHLCV-UNIT-CONTAM(closed)", "CONTAM-5(done)", "CONTAM-7(done)"],
    fix_spec: "RECON FIRST (named-volume DB, not host ./data — sqlite3 sidecar per feedback_live_db_is_named_volume_not_host_data): confirm the 06-16 seed-write path in ohlcvDailyAggregatorJob.ts and why ohlcvSanityCheckJob.ts let the 77 x1000/div1000 rows land. THEN: (1) WRITER — the daily-seed candle writer must normalize ALL tickers to raw VND generically (/goal#2), not per-ticker; the unit must be derived/validated against the prior real close, never trusted raw from the intraday source. (2) GUARD — ohlcvSanityCheckJob.ts must REJECT-OR-REPAIR before-it-lands any candle whose close diverges ~x1000 or ~div1000 from the prior real close (extend CONTAM-5/CONTAM-7 coverage to the synthetic-seed path; fail-loud, no silent swallow). (3) SYNTHETIC-SEED DECISION — a flat zero-volume O=H=L=C seed bar is itself a synthetic placeholder and violates the standing 'no fake/synthetic/placeholder data' goal: EITHER stop seeding today's flat candle, OR mark it (data_env / synthetic flag) and EXCLUDE it from RSI/MA/BB computation so indicators use only real candles. BA/architect to choose stop-vs-mark+exclude in the spec. (4) REPAIR — recompute/repair the 77 already-corrupt 2026-06-16 rows in daily_ohlcv (prefer recompute-on-read or corpus re-flow per feedback_derived_column_fix_needs_reflow; if backfilled, recompute from the real prior close, not the corrupt value).",
    verification_gate: "LIVE post-rebuild RAW (named-volume DB + gateway tools, NOT badges): (a) daily_ohlcv has NO 06-16 (and no future-day) candle whose close is ~x1000/div1000 off the prior real close — for ALL 1203 tickers, generic; (b) get_technical_indicators VHM/VIC/VJC return REAL mid-band RSI (no single-digit), and AAA/ADS/the other x1000 tickers are NOT pegged at RSI=100.0; (c) BB 'Price=' field for VHM/VIC shows the full 6-figure price, not div1000-truncated; (d) the next morning-briefing 01:00Z + first TA scan 02:15Z show NO single-digit RSI and NO RSI=100.0 saturation and NO 'giá 0 dưới BB' false breakouts on MARKET; (e) the seed-bar decision (stop or mark+exclude) is reflected in the indicator inputs; (f) the new reject/repair guard test is GREEN in CI. This gate, GREEN, also unblocks FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (review[]) for done_verified re-evaluation and FIX-ALERT-OPEN-ZERO-PRICE-RACE (backlog HELD).",
    unblocks: ["FIX-ALERT-ENGINE-RSI-SINGLEDIGIT", "FIX-ALERT-OPEN-ZERO-PRICE-RACE"],
    rebuild_required: "mcp-server",
    first_agent: "ba",
    first_hop_reason: "P0 but multi-decision (stop-vs-mark+exclude the synthetic seed bar; writer-normalize vs guard-reject-or-repair split; 77-row repair strategy) AND a recurring class touching a shipped guard — needs a BA spec + architect sign-off before a dev-mcp-server fixer, per feedback_recurring_bug_escalation. Not well-specified enough for a direct fixer.",
    source: "router RAW LIVE 2026-06-16T01:35Z — get_unreviewed_market_messages (msg 744/745/746/759/760/761), get_technical_indicators (10 tickers via gateway call_tool), named-volume DB vn-market-intelligence-mcp_market_data /data/market.db daily_ohlcv (sqlite3 sidecar). Evidence handoff: docs/handoffs/FIX-ALERT-ENGINE-RSI-SINGLEDIGIT-gate-probe-2026-06-16.md",
    user_impact: "P0 — corrupts live MARKET RSI/BB daily across 77 tickers incl. 3 watchlist majors (VHM/VIC/VJC); drives false single-digit-RSI and RSI=100.0 alerts and 'giá 0 dưới BB' false breakouts into the LIVE MARKET channel every market open; violates standing no-fake-data goal and /goal#2.",
    created_at: "2026-06-16T01:45:00Z",
    created_by: "po-s75",
    triaged_by: "po-s75"
  } as $newtask
| $root
  | .task_board.review = $review2
  | .task_board.backlog = $backlog2
  | .task_board.ready = (($root.task_board.ready // []) + [$newtask])
  | .task_board._updated_at = "2026-06-16T01:45:00Z"
  | .task_board._updated_by = "po-s75"
  | ._updated_at = "2026-06-16T01:45:00Z"
  | ._updated_by = "po-s75"
  | .updated_at = "2026-06-16T01:45:00Z"
  | .updated_by = "po-s75"
