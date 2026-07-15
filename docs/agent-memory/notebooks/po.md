# PO Notebook

_Last: 2026-07-15T01:29Z (Step 0-SIG triage of 3 pendingSignals; 1 MINT, 2 skip; WIP=0, head idle; coordination_session 69b0312e)_

## Tick 2026-07-15T01:07Z — dev-team signal triage (3 signals, PLAN-ONLY)
Router passed 3 file-sourced signals (drained+DB-recorded+moved to processed/). head IDLE, WIP=0. No sprint launch, no `.head` touch.
- **SIG-1 bctc-analyst bug-escalation (HIGH) → MINT (+1 backlog 396→397):** `FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T` (P-high, ops, zone:multi, recon-first). 15 watchlist tickers have Q1-2026 PDFs on VPS (06-07..06-13) but earnings-calendar=QUA HAN + get_bctc_full empty. PO RAW-verified via gateway (list_stored_pdfs + get_earnings_calendar 2026-07-15T01:29Z): all 15 stored yet QUA HAN. SMOKING-GUN: 18 sibling tickers WITH stored Q1-2026 PDFs ARE marked DA NOP → PARTIAL ingest/reconcile stall, NOT total dormancy. DEDUP: distinct from 14-ticker serve-layer/CORRUPT-SKIP/PUB-5 cluster (BUG 3406/3411) AND from FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP (total refine-dispatch dormancy since 07-04, presupposes financial_reports PENDING exist; here get_bctc_full EMPTY = earlier layer). Row instructs: recon which layer, fold into durable-trigger IF same root, do NOT build parallel trigger.
- **SIG-2 FPT bctc_signal routine → SKIP.** Informational analysis output (critic 0.8, valuation FAIR, ESC-4/5 FALSE, esc3 DATA-COVERAGE-LIMITED = standing known-limited state, quarters_returned=2, coverage guard already keyed). No data-quality defect. Existing ROUTE-BCTC-FPT-Q1-2026-ROUTINE already parks the routine-signal route. No task.
- **SIG-3 cowork-fire telemetry → SKIP.** Fire-record noise (to=dev-team, drift 7min, all matched=won, headroom 4542MB). No task.
- **Inbox-pollution note (NOT minted — covered):** 49 non-signal-shape files (cowork-team-*.json + price_anomaly) trip the >50 drain-guard. Already tracked by `CLEAN-SIGNALS-DIR-NONSIGNAL-ARTIFACTS` (teach drain to archive from/-less) + `FIX-PRICE-ANOMALY-DISH-SIGNAL-ENVELOPE`. Growth data-point for next groom: CLEAN row says "3 artifacts" but live=49. No over-mint.
- **WRITE:** one atomic `jq --slurpfile row … '.task_board.backlog += $row' | bash scripts/orch-apply.sh` (Zod Stage0+1 PASS; conservation live=576→cand=577 net +1; CAS clean). Verified live: head idle both keys, row present, backlog 397. NO commit (router owns post-cycle commit + RAW-verify).

## Standing method (survives rotation)
- **Bug-escalation from an analyst agent:** RAW-reverify the premise on live tools BEFORE minting (calendar-check staleness — feedback_premise_date_error); dedup against the named lineage the router hands (here: 14-ticker cluster + BUG 3406/3411 + durable-trigger row); mint recon-first with a fold-if-same-root instruction so a shared-root defect can't spawn a parallel fix (churn guard).
- **PLAN-ONLY intake:** mint to backlog[] status:BACKLOG; ops-owned FIX = supervised (NOT BOUNDED-1 auto-pickup); `.head` never touched; verification_gate = live-tool RAW reconcile, never badges.
- **Board writes:** ONE atomic `jq … | bash scripts/orch-apply.sh` (Zod+dup-key+conservation+CAS+atomic rename); top-level `.task_total` is null/untracked — the conservation check derives the real total from rows (576→577), so never hand-set the null field.
- **task_total formula:** flat-lane objects + active_sprints[].tasks[] + closed_sprints (now 577).

## Carry-over
- **NEXT (ops):** `FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T` drains via supervised ops dispatch (recon-first); if recon proves same root as FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP → fold, don't parallel-build.
- **Prior carry (still open):** FIX-MCP-TEST-SUITE-INTERVAL-TIMER-LEAK-TEARDOWN + ALPHA-S2-FF-SUB6-BUCKETING-HELPER (both dev-mcp-server, non-gating); FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK (stale P1, awaits supervised promote); FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT stays PLAN-ONLY in review[].
