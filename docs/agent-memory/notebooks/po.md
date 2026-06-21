# PO Notebook

_Last: 2026-06-21T08:42:00Z_

## This cycle — dashboard "Dự báo AI & Kết quả" prediction-resolver triage (2026-06-21, router-verified live)
Router handed a live-verified diagnosis (named-vol /app/data/market.db via mcp-server bun:sqlite) of the prediction-claims dashboard feature reported not-working. Task = DEDUP first, then mint-or-fold. Result: FOLDED, no dup.

- DEDUP: board has 4 prediction tasks. 3 DISTINCT (FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP done_verified double-post; FIX-PREDICTION-SIGNALS-EMPTY = prediction_signals poll write-gap, DIFFERENT table; FIX-FB-PREDICTION-CALIBRATION-LOOP poster ledger). PRED-RESOLVER-GAP-FIX (backlog, owner dev, apps/mcp-server) IS the same producer<->resolver contract bug → folded into it. Mentioned test ids 1125/1154 are test files not board tasks.
- ENRICHED prior framing: old task said resolver "never fetches actual_price" for ids 6/7. Live diagnosis SUPERSEDES — bar is MISSING on exact resolution_date (weekend) because resolver does EXACT-date OHLCV equality while create_prediction_claim computes resolution_date in CALENDAR days (evidenceTools.ts:378-380, code-confirmed). Added PRODUCER leg (calendar-day + neutral/null-target default) + same-DB LIVE re-verify gate (self-confirming-test trap, stuck ids 1,6,7,8,9).
- PRODUCT CALL (neutral predictions): KEEP producing neutral claims + ADD neutral-band rule (|move from creation_price| < 2.0% over trading-day window = HIT else MISS; legacy creation_price=NULL → explicit excluded status, never NULL). Rejecting neutral would bias hit-rate to directional-only + hide flat-call accuracy.
- Promoted backlog→ready + head dispatch (WIP=0 idle, spec complete, single zone → dev direct). P2 (dashboard quality not safety). digest-predict weekly cron untouched (working-as-designed).
- Script: scripts/po-s110-pred-resolver-gap-fold-tradingday-producer-promote.jq (idempotent, conservation-guarded, re-run delta 0).

## Carry-over
- PRED-RESOLVER-GAP-FIX now ready[] + head=in_progress next_agent=dev. Router to spawn dev (apps/mcp-server). qa gate = SAME-DB live re-verify of stuck ids, NOT green tests.
- DRAIN-STATEFILE-DATALOSS (prior cycle) — verify it landed if a recurrence signal surfaces.

## Prior cycle — evening_summary 2026-06-19 data-quality triage (RAW-verified via code-read + named-vol DB sidecar)
4 CONFIRMED + minted, 1 DISMISSED: FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE (P1 multi), FIX-MACRO-FX-SIGMA-PHANTOM-EXTREME (P1), FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN (P2), FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR (P3); D4 "1.825" = VN dot-thousands render, dismissed.
