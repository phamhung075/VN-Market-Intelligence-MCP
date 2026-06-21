
## PRED-RESOLVER-GAP-FIX (folded) — 2026-06-21
- task_id: PRED-RESOLVER-GAP-FIX
- trigger: router-verified live diagnosis of dashboard "Dự báo AI & Kết quả" reported not-working (named-vol /app/data/market.db via mcp-server bun:sqlite).
- dedup: board scan found 3 prediction tasks + the resolver one. FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (done_verified, double-post) / FIX-PREDICTION-SIGNALS-EMPTY (prediction_signals poll write-gap, DIFFERENT table) / FIX-FB-PREDICTION-CALIBRATION-LOOP (poster ledger) all DISTINCT. PRED-RESOLVER-GAP-FIX (backlog, P high) is the SAME producer<->resolver contract bug — FOLDED into it, did NOT mint a dup. Mentioned-test ids (1125/1154 prediction-resolution-job/loop) are test files, not board tasks.
- enrichment over prior framing: prior task said resolver "never fetches actual_price" for ids 6/7. Live diagnosis SUPERSEDES that — the OHLCV bar is MISSING on the exact resolution_date (weekend/holiday) because the resolver matches by EXACT-date equality while create_prediction_claim computes resolution_date in CALENDAR days (evidenceTools.ts:378-380, confirmed by reading code). Added the PRODUCER leg (calendar-day + neutral/null default), which the resolver-only task lacked. Added same-DB LIVE re-verify gate (self-confirming-test trap).
- product call on neutral predictions: KEEP producing neutral claims + ADD a neutral-band rule (|move from creation_price| < NEUTRAL_BAND_PCT default 2.0% over the trading-day window = HIT, else MISS); legacy neutral with creation_price=NULL -> explicit excluded status, never NULL. Rejecting neutral claims would bias hit-rate to directional-only and hide flat-call accuracy (no-fake / full-accountability standing goals).
- what-considered: fold-only vs fold+promote. Chose fold+promote+head-dispatch — WIP=0, head idle, spec now complete, single zone (apps/mcp-server) so dev direct (no architect split). priority P2 (dashboard quality, not safety) per router.
- script: scripts/po-s110-pred-resolver-gap-fold-tradingday-producer-promote.jq (idempotent, conservation-guarded, re-run delta 0).

## DRAIN-STATEFILE-DATALOSS — 2026-06-21
- task_id: FIX-DRAIN-STATEFILE-DATALOSS
- signal: repair_task_request from dev-team (router), HIGH, recurring manual workaround on >=2 ticks
- ground-truth verified by reading code:
  - drain-signals.js L33 globs ALL docs/signals/*.json, no state-file/shape exclusion; L67-69 fingerprint+move-to-processed+unlink ANY file.
  - db-integrity-history.json (33KB live, 7 entries) is sitting in docs/signals/ RIGHT NOW = armed trap.
  - db-integrity-history-append.sh: on MISSING file (drain removed it) -> else branch L30-34 writes `printf '[]'` with NO backup (backup only for non-empty non-array). Effect = silent wipe of all history. Signal effect-claim holds (exact branch wording in signal slightly off; outcome identical).
  - orphan processed/db-integrity-history.json now gone (cleaned since signal authored) but live file still in inbox.
- path readers to update for option (b): scripts/db-integrity-history-append.sh (HIST default L12), .claude/commands/crons/cron-system-auditor.md, .claude/commands/crons/cron-db-data-integrity.md (3 refs). orch-state.json payload_ref rows are historical signal_queue, not live readers — leave.
- what-considered: only path — classify FIX, drive to board, belt-and-suspenders (a)+(b) per router note. (b) relocate state file to docs/data/ is the durable root fix; (a) shape-guard in drain-signals.js prevents ANY future non-signal *.json sweep. Both cheap.
- why-change: no change from router recommendation. zone = cross-service (scripts/ + .claude/ cron docs; no apps code path). dev_agent = dev-mcp-server (owns agents-flow drain helper + scripts/). rebuild_required: false.
- dedup: board scan 0 hits. WIP=0.
