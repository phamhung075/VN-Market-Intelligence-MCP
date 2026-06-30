# =============================================================================
# scripts/po-s135-ta-consumer-stale-indicators-diagnostic-mint.jq
# -----------------------------------------------------------------------------
# PO triage-finding-into-task (2026-06-30, po-s135).
#
# CONTEXT: OHLCV-depth epic done_verified (86daf9f1/5e4f75ea — daily_ohlcv 2yr
# depth, cross-restart persistence, price-history serves VCB 501 candles). But
# the momentum/gauge indicator cards are STILL honest-NULL — for a NEW root
# cause in the TA CONSUMER layer, NOT depth. dev-team RAW-verified via gateway
# (explicit watchlist_tickers override STILL null → disproves the gate agent's
# WATCHLIST_TICKERS-env-only diagnosis):
#   - get_roc_momentum      → null (insufficient_history / data_gap_too_large)
#   - get_relative_strength → ALL null "index_data_absent" (low_sample_warning
#                             FALSE → VN-Index benchmark series MISSING)
#   - get_52w_proximity     → MIXED; FPT low_52w=100.3 vs high_52w=99700
#                             (split-adjustment artifact)
#   - SMOKING GUN: get_technical_indicators VCB price ~88,000 while
#     get_price_history VCB (daily_ohlcv) = 62,200 for the SAME day 2026-06-30
#     → TA Go microservice (port 5003) serves STALE/SEPARATE/split-mismatched
#       data that does NOT reflect the backfilled daily_ohlcv.
#
# SCOPING (cheap-first, diagnostic-gated):
#   M1 MINT  OPS-TA-INDICATOR-STALE-DIAGNOSTIC  → ready[]   (ops, P1, blocking)
#            cheapest test: single-svc restart technical-analysis (NOT down&&up)
#            then re-probe → disambiguates RC1 stale-cache from RC2/3/4 real bug.
#   M2 MINT  FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE → backlog[] (dev-technical-
#            analysis, P1, HELD on M1) — RC2 split-mismatch + RC4 data gaps.
#   M3 MINT  FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS → backlog[] (architect/multi,
#            P1, HELD on M1) — RC3 VN-Index benchmark absent for rel-strength.
#   M4 ANNOTATE-IN-PLACE FIX-TA-INDICATORS-TIER3-ROUTING (backlog) — its
#      ALL-N/A premise EVOLVED post depth-fix to stale-VALUE; fold under chain.
#
# Idempotent: M1/M2/M3 id-guarded across ALL lanes; M4 marker-guarded
# (has("folded_under")). Re-run mutates 0.
#
# USAGE:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s135-ta-consumer-stale-indicators-diagnostic-mint.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#   (orch-apply does Zod + dup-key + CAS-mtime + atomic rename. PUSH HELD —
#    the launchd fleet-push timer pushes.)
# =============================================================================

# --- all task ids across every lane (string or object rows) -----------------
def all_ids:
  [ (.task_board.ready // [])[],
    (.task_board.backlog // [])[],
    (.task_board.in_progress // [])[],
    (.task_board.review // [])[],
    (.task_board.done // [])[],
    (.task_board.done_verified // [])[]
  ] | map(if type=="object" then .id else . end);

. as $root
| ($root | all_ids) as $ids

# ---------------------------------------------------------------------------
# M1 — diagnostic gate (ready[], ops)
# ---------------------------------------------------------------------------
| ( if ($ids | index("OPS-TA-INDICATOR-STALE-DIAGNOSTIC")) then .
    else .task_board.ready += [{
      "id": "OPS-TA-INDICATOR-STALE-DIAGNOSTIC",
      "type": "FIX",
      "size": "S",
      "status": "READY",
      "priority": "high",
      "blocking": true,
      "zone": "apps/technical-analysis/",
      "owner": "ops",
      "next_agent": "ops",
      "dispatcher": "dev-team",
      "created_by": "po",
      "created_at": $now,
      "sprint": "TA-CONSUMER-STALE-INDICATORS",
      "title": "Cheap-first diagnostic gate — single-svc RESTART technical-analysis (port 5003) then RE-PROBE momentum tools to disambiguate stale-cache (RC1) from a real data-source/split-mismatch bug (RC2/3/4). The OHLCV depth fix is DONE+DURABLE but indicator cards are STILL null; dev-team RAW-disproved the env-only diagnosis (explicit watchlist override still null).",
      "deliverables": [
        "D1 RESTART the technical-analysis service ONLY — single-svc (e.g. `docker compose restart technical-analysis`). NEVER `down && up` (destroys peers ~21min — feedback_rebuild_recreate_destroys_peers). Confirm all peer services stay UP after.",
        "D2 RE-PROBE via gateway call_tool(server=vn-market): (a) get_technical_indicators VCB vs get_price_history VCB for 2026-06-30 — capture both prices RAW (was 88,000 vs 62,200); (b) get_roc_momentum / get_relative_strength / get_52w_proximity with EXPLICIT watchlist_tickers=[VCB,FPT,HPG,MWG,SSI,VNM,BID,CTG] — capture null_reason / low_sample_warning for each.",
        "D3 VERDICT: classify which root cause is live and record it on this task's findings + as the dispatch signal for the held fixes."
      ],
      "acceptance": [
        "AC1 restart was single-svc — peers verified still UP (not down&&up).",
        "AC2 post-restart re-probe captured RAW from the gateway (price values + null_reasons), not relayed from a sub-agent badge.",
        "AC3 verdict recorded: RC1 stale-in-memory-cache (prices now MATCH daily_ohlcv + tools non-null → RESOLVED; mark FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE + FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS superseded) OR RC2/3/4 real bug (still 88k / still null after restart → UNBLOCK both held fixes by clearing their `depends`)."
      ],
      "verification_gate": "This task GATES the expensive fixes. If single-svc restart makes get_technical_indicators VCB == get_price_history VCB (~62,200) AND the 3 momentum tools return non-null for the watchlist 8 → the whole chain is RESOLVED by the restart (RC1). Otherwise the restart proves the TA service reads a SEPARATE/split-mismatched source → the held fixes are the real work.",
      "depends": [],
      "note": "Blast radius = the technical-analysis (port 5003) service ONLY. PO does NOT run the restart — routed to ops. This is a CLAIMABLE diagnostic board row (a gate needs a row, not just a verdict — strand-lesson project_deferred_task_scheduler)."
    }] end )

# ---------------------------------------------------------------------------
# M2 — RC2 split-mismatch + RC4 data-gaps fix (backlog[], dev-technical-analysis, HELD)
# ---------------------------------------------------------------------------
| ( if ($ids | index("FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE")) then .
    else .task_board.backlog += [{
      "id": "FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE",
      "type": "FIX",
      "size": "M",
      "status": "BACKLOG",
      "priority": "high",
      "zone": "apps/technical-analysis/",
      "owner": "dev-technical-analysis",
      "next_agent": "dev-technical-analysis",
      "dispatcher": "dev-team",
      "created_by": "po",
      "created_at": $now,
      "sprint": "TA-CONSUMER-STALE-INDICATORS",
      "title": "TA Go service (port 5003) serves STALE/SEPARATE/split-mismatched price data that does NOT reflect the backfilled daily_ohlcv. SMOKING GUN: get_technical_indicators VCB ~88,000 vs get_price_history VCB (daily_ohlcv) 62,200 SAME day 2026-06-30. Plus FPT get_52w_proximity low_52w=100.3 vs high_52w=99700 (split-adjustment artifact) + get_roc_momentum FPT/BID/CTG null_reason=data_gap_too_large (non-contiguous bars as TA reads them). Reconcile the TA service price source/adjustment pipeline to read the split-adjusted daily_ohlcv consistently.",
      "root_cause": "TA service does NOT read (or reads a stale/separately-adjusted copy of) the backfilled daily_ohlcv. Covers RC2 (split-adjustment mismatch — 88k vs 62.2k, FPT 100.3 vs 99700) + RC4 (data_gap_too_large = non-contiguous gaps as the TA service reads the bars).",
      "depends": ["OPS-TA-INDICATOR-STALE-DIAGNOSTIC"],
      "hold_reason": "HELD on OPS-TA-INDICATOR-STALE-DIAGNOSTIC. Only fires if the single-svc restart does NOT resolve (RC1 stale-cache disproved). If the diagnostic restart fixes it, this task is superseded.",
      "scope_note": "Primary zone apps/technical-analysis/. If the diagnostic proves the split-adjustment root is UPSTREAM in the price-ingest/adjustment layer (apps/stock-price/), ESCALATE this row to zone=multi for an architect split before dispatch.",
      "verification_gate": "RAW gateway re-probe GREEN: get_technical_indicators VCB price == get_price_history VCB same day; get_52w_proximity bounds split-consistent (no 100.3-vs-99700); get_roc_momentum non-null for the watchlist 8 with NO data_gap_too_large. done_verified WITHHELD until this RAW probe passes (exists/rebuilt != serving-correct — feedback_router_verify_raw_not_badges)."
    }] end )

# ---------------------------------------------------------------------------
# M3 — RC3 VN-Index benchmark absent (backlog[], architect/multi, HELD)
# ---------------------------------------------------------------------------
| ( if ($ids | index("FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS")) then .
    else .task_board.backlog += [{
      "id": "FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS",
      "type": "FIX",
      "size": "M",
      "status": "BACKLOG",
      "priority": "high",
      "zone": "multi",
      "owner": "architect",
      "next_agent": "architect",
      "dispatcher": "dev-team",
      "created_by": "po",
      "created_at": $now,
      "sprint": "TA-CONSUMER-STALE-INDICATORS",
      "title": "get_relative_strength returns ALL 8 watchlist = null_reason 'index_data_absent' with low_sample_warning=FALSE → the VN-Index benchmark series the TA service uses for relative strength is MISSING (NOT a sample/env issue). Determine where TA reads its index benchmark and ingest/repair it so relative-strength can compute.",
      "root_cause": "RC3 — VN-Index benchmark OHLCV series absent from the TA relative-strength path. Two candidate sources: (a) TA reads mcp-server vn_index_cache (purged-on-boot + market-hours-only refresh strands it=0 off-hours — see FIX-VNINDEX-CACHE-STARTUP-PURGE); (b) TA has its OWN index OHLCV ingest and the universe depth-backfill MISSED the index symbol → ingest VN-Index OHLCV depth mirroring the daily_ohlcv 2yr backfill.",
      "depends": ["OPS-TA-INDICATOR-STALE-DIAGNOSTIC"],
      "hold_reason": "HELD on OPS-TA-INDICATOR-STALE-DIAGNOSTIC (the restart will not fix an absent benchmark series, but the diagnostic confirms the source TA actually reads before committing the ingest/cache fix).",
      "cross_ref": ["FIX-VNINDEX-CACHE-STARTUP-PURGE", "FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH"],
      "scope_note": "zone=multi → architect SPLITs (apps/technical-analysis/ for the benchmark read + apps/mcp-server/ or apps/stock-price/ for the index OHLCV ingest/cache). RECONCILE against the two existing VN-Index tasks before minting any new ingest task: FIX-VNINDEX-CACHE-STARTUP-PURGE (BACKLOG, apps/mcp-server/, the recurring purge-on-boot root) + FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (DONE-never-done_verified). If TA reads vn_index_cache, this collapses INTO FIX-VNINDEX-CACHE-STARTUP-PURGE — do NOT duplicate it.",
      "verification_gate": "RAW gateway re-probe GREEN: get_relative_strength non-null for the watchlist 8 (index benchmark present + sufficient depth). done_verified WITHHELD until this RAW probe passes."
    }] end )

# ---------------------------------------------------------------------------
# M4 — annotate FIX-TA-INDICATORS-TIER3-ROUTING in-place (fold under chain)
# ---------------------------------------------------------------------------
| .task_board.backlog |= map(
    if (type=="object" and .id=="FIX-TA-INDICATORS-TIER3-ROUTING" and (has("folded_under")|not))
    then . + {
      "zone": "apps/technical-analysis/",
      "folded_under": "TA-CONSUMER-STALE-INDICATORS",
      "superseded_note": "Symptom EVOLVED post-OHLCV-depth-fix (86daf9f1/5e4f75ea): get_technical_indicators no longer returns ALL MA/RSI/MACD/BB = N/A (candles now exist) — it returns STALE/split-mismatched VALUES (VCB 88k vs daily_ohlcv 62.2k same day). Same TA-consumer-serving root, evolved. Folded under the diagnostic-gated chain (OPS-TA-INDICATOR-STALE-DIAGNOSTIC -> FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE). Do NOT work in isolation — the diagnostic decides whether a separate fix is needed.",
      "folded_at": $now
    }
    else . end
  )
