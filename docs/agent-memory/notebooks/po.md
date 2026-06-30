# PO Notebook

_Last: 2026-06-30T18:12Z_

## Tick 18:12Z — Triage TA-CONSUMER-STALE-INDICATORS (dev-team finding, coord e71c7736)

**Finding (RAW-verified by dev-team, do NOT re-probe):** OHLCV-depth epic done_verified (86daf9f1/5e4f75ea — daily_ohlcv 2yr depth, cross-restart persistence, price-history serves VCB 501 candles). But momentum/gauge cards are STILL honest-NULL for a NEW root in the TA CONSUMER layer, NOT depth. Explicit watchlist_tickers override STILL null → disproves the env-only diagnosis. SMOKING GUN: get_technical_indicators VCB ~88,000 vs get_price_history VCB (daily_ohlcv) 62,200 SAME day → TA Go svc :5003 serves stale/separate/split-mismatched data.

**Scoped (cheap-first, diagnostic-gated — scripts/po-s135-*.jq | orch-apply.sh, Stage0/1 PASS, 97 pre-existing SHG warnings not mine):**
- ready[]: OPS-TA-INDICATOR-STALE-DIAGNOSTIC (ops, P1, blocking, zone apps/technical-analysis/) — single-svc RESTART technical-analysis :5003 (NOT down&&up) then re-probe; GATES the expensive fixes (RC1 stale-cache resolves cheaply vs RC2/3/4 real bug).
- backlog[] HELD on diag: FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE (dev-technical-analysis, apps/technical-analysis/) = RC2 split-mismatch + RC4 data_gap | FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS (architect, multi) = RC3 absent VN-Index benchmark.
- folded FIX-TA-INDICATORS-TIER3-ROUTING in-place (ALL-N/A premise EVOLVED to stale-VALUE post depth-fix; same root).

**Key calls:**
- Diagnostic gets a CLAIMABLE row not a verdict — gate needs a board row (project_deferred_task_scheduler strand-lesson).
- M2 set single-zone (apps/technical-analysis/) NOT multi — smoking gun is the TA svc; scope_note escalates to multi ONLY if root proves upstream in stock-price adjustment. Avoids a forced architect hop.
- M3 cross-ref'd existing FIX-VNINDEX-CACHE-STARTUP-PURGE — if TA reads vn_index_cache, M3 COLLAPSES into it (reconcile-before-mint, no dup).
- WIP unchanged (in_progress=0); ready 1→2; backlog +2. head LEFT idle — RETURN BATCH to dev-team router for dispatch (po-s132 pattern).
- Foreign-flow accum_rank residual flagged OUT-OF-SCOPE (already tracked TASK17-FOREIGN-FLOW + FIX-FOREIGN-FLOW-COVERAGE + ARCH-DAILY-FOREIGN-FLOW-TABLE).

## Carry-over
- Router: dispatch OPS-TA-INDICATOR-STALE-DIAGNOSTIC first (head→ops). Its verdict UNBLOCKS or SUPERSEDES the 2 held fixes (clear their `depends` / mark superseded).
- If restart resolves all 3 tools → chain RESOLVED by RC1; close diag done_verified + supersede M2/M3.
- Decision trail → decisions/sprint-TA-CONSUMER-STALE-INDICATORS-po.md (po-S1..S5).
