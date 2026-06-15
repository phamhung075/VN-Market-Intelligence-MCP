# PO Notebook

## 2026-06-15T18:33Z — PROMOTED the BCTC enrich-silent-0rows P0 (freed lane by closing planning-complete macro SPEC)

**dev-team :07 tick, off-market VN 01:26.** Drained signals: bctc FPT routine (informational), 2 context-bloat (RESOLVED by Pass-5b — claude-manager-helper 108L / ops 90L / ops-vps-fetch 196L all under cap, commits 1e6b4e2d/3c9751fb/f35d605c; NO janitor), cowork telemetry (no-op).

**(a) PROMOTED `FIX-BCTC-ENRICH-SILENT-0ROWS` ready→in_progress** (`scripts/po-s63-bctc-p0-promote-macro-spec-close-triage.jq`, idempotent, conservation 498→498 + hard-constraint guarded). dev-pdf-extractor leads (B02-TCTD bank-form parse/OCR), dev-mcp-server pairs (enrich fail-loud). TRUE root of `get_bctc_full(VCB/CTG)`='Chưa có dữ liệu BCTC' + cowork bctc-analyst '#2776' release-block (CTG watchlist bank, 27 cycles). Live corroboration: `get_agent_signals` 6225 — bctc source stale 2191min vs 360 threshold (outage live NOW).

**FREED the lane by closing `BA-VN-MACRO-TOOLING` in_progress→done (SPEC-COMPLETE, done_verified=false).** RAW re-verify: it is a PLANNING-complete SPEC row (owner=ba, type=SPEC) — BA→arch→pm→probe→probe-fold ALL router RAW-reverified; the 20-task WAVE plan lives in `active_sprints[VN-MACRO-TOOLING]`; its own po_dispatch_note says ZERO dev WIP consumed. NOT a coding lane. Coding lanes now = 1 (ARCH-CRON-SCHEDULER-RELIABILITY = architect-design phase, dev-mcp-server not yet coding) + this P0 → within WIP≤2. Corrects yesterday's "WIP=2 full" hold (status-lags-ground-truth, opposite direction).

**(b) review[] (4): NONE done_verifiable this tick.** FIX-VNSTOCK-TRADINGSTATS-CRASH gate UNMET until 06-16 08:30Z sweep (host-decoy caught ea4d4e74); FIX-SIGNAL-CONFIDENCE-DEFAULT-50 needs organic non-50 confidence_score DB spread (`get_agent_signals` exposes impact not confidence — no green-badge promote); FIX-ALERT-ENGINE-RSI-SINGLEDIGIT gate = next market-open echo (off-market, no new alert-commander alerts); ARCH-SHIP-WAVE-REAUDIT PARKED. All correctly held.

**(d) head advanced:** active_task_id=FIX-BCTC-ENRICH-SILENT-0ROWS, next_agent=dev-team. Committed 90d77164 (board + script, explicit path; dirty working tree NOT swept — verified all board deltas PO-authored, no foreign false-promotion).

### Carry-over
- **P0 DISPATCHED** — dev-team tick hands FIX-BCTC-ENRICH-SILENT-0ROWS to dev-pdf-extractor + dev-mcp-server. done_verified = real VARIED rows for VCB/CTG vs named-volume market.db (NEVER host ./data, never a badge); B02-TCTD 0-rows MUST fail loud not advance queue; VCB 2025Q4 (112) + FPT 2026Q1 (145) non-regressed. Clearing it RELEASES the bctc-analyst CTG/VCB/D2D gate.
- **WAVE-1 macro dev fan-out** (6 zero-dep, tracked in active_sprints[VN-MACRO-TOOLING]) dispatch once a coding lane frees AND the mcp-server Zone B/C lane is clear of ARCH-CRON.
- **06-16 GATES**: re-probe OPS-BCTC-RECON (27 url_not_found→done) + vnstock-tradingstats 08:30Z sweep → then RSI market-open echo. THEN release held push (PO deferred call; origin ~57 behind benign cloud-chore). PUSH HELD.
- FIX-HNX-SESSION-COOKIE + FIX-SSC-C111-EMPTY-FALLBACK batch one dev-vps-crawls pass (same file) when a cross-service lane frees. FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK: unpark when a BA/architect lane frees.

## 2026-06-15T17:19Z — OPS-BCTC-PIPELINE-RECON COMPLETE → durable hardening sprint + architect brief

**RECON closed in_progress→done (done_verified WITHHELD).** ops-vps-fetch deployed 2 GENERIC discovery fixes to VPS (`vps-scripts/discover-bctc-urls-browser.py`): Root A afrLoop counter rollover `r"(26\d{14,16})"`→`r"(\d{15,18})"` + winId positional parse (removes the `26000000000000000` hardcode — aligns no-fake-data goal); Pre-existing A `exchange_code "1"(HOSE)`→`""`(all exchanges). Live: VCB+FPT Q1/2026 PDFs downloaded. done_verified DEFERRED to next 6h VPS cycle — re-probe `get_bctc_full` + `bctc_vps_queue` (expect 27 url_not_found → done).

**KEY INSIGHT — discovery fix ≠ user-facing P0.** Router RAW-verified `get_bctc_full(VCB)` STILL returns "Chưa có dữ liệu BCTC". TRUE root = **enrich-silent-0-rows**: `financial_reports` HAS VCB 2026Q1 (id b1ea447a…, parsed 06-13T17:29, conf 0.75) but `bctc_table_rows=0` AND `bctc_md_tables=0`. VCB is a BANK → B02-TCTD form → likely bank-form parse/OCR regression that silently yields 0 rows while still inserting the header. VCB 2025Q4 (112 rows) + FPT 2026Q1 (145 rows) do NOT reproduce.

**MINTED 6 to ready[]** (`scripts/po-s61-bctc-recon-done-enrich-hardening-triage.jq`, idempotent, conservation+hard-constraint guarded):
- `FIX-BCTC-ENRICH-SILENT-0ROWS` **P0** — dev-pdf-extractor (+dev-mcp-server), zone multi. The ACTUAL user-facing root. Generic B02-TCTD parse + enrich MUST fail-loud not silent-advance the queue. done_verified = real VARIED rows vs named-vol DB (/goal#1).
- `FIX-HNX-SESSION-COOKIE` **P1** — dev-vps-crawls, cross-service. Root B: HNX POST→302; prior-GET referrer + shared CookieJar.
- `FIX-SSC-C111-EMPTY-FALLBACK` **P1** — dev-vps-crawls, cross-service. Pre-existing B: c111 empty for UPCOM/state filers → fall back to c3. (Same SSOT file as HNX fix — batch the pass.)
- `FIX-BCTC-ZERO-URL-ALERT` **P2** — dev-mcp-server. Alert on 0-URL-all-tickers 2+ cycles (would've caught this 34h earlier).
- `FIX-BCTC-FRESHNESS-GATE` **P2** — dev-mcp-server. Gate health on max(last_success_age) not liveness (ties passive_health_masks_dead_data).
- `ARCH-BCTC-PIPELINE-DURABILITY` **P1 SPIKE** — architect (+agents-architect), umbrella over the 5 children.

**recurring-bug-escalation DECISION: architect BRIEFED — YES.** 2nd recurrence of BCTC-VPS-PIPELINE-STALE; the first "fix" self-recovered/one-time-flushed, never hardened. Shared root across discovery-brittleness + enrich-silent-0 + no-freshness-gate = "NO active zero-result/freshness alerting" → a true cross-cutting design, not 5 leaf patches. Per policy (2+ recurrence same module → architect). Annotated `FIX-BCTC-VPS-PIPELINE-STALE-5D` (recurrence_count HELD 2 — same incident, no new outage; `architect_briefed:true`). in_progress now 2 (BA-VN-MACRO-TOOLING, ARCH-CRON-SCHEDULER-RELIABILITY untouched); review[] 4 untouched.

### Carry-over
- **NEXT 6h VPS CYCLE GATE**: re-probe `get_bctc_full(VCB/FPT)` + `bctc_vps_queue` distribution to convert OPS-BCTC-PIPELINE-RECON done→done_verified. Expect 27 url_not_found → done; 9 pending HNX/UPCOM stay blocked until FIX-HNX-SESSION-COOKIE + FIX-SSC-C111-EMPTY-FALLBACK ship.
- **FIX-BCTC-ENRICH-SILENT-0ROWS is the real user-facing P0** — dispatch FIRST among the BCTC children. done_verified = real VARIED rows vs named-volume market.db (NOT host ./data, never a badge).
- Batch FIX-HNX-SESSION-COOKIE + FIX-SSC-C111-EMPTY-FALLBACK on one dev-vps-crawls pass (same file). P2 alert/freshness gates pair under ARCH-BCTC-PIPELINE-DURABILITY.
- Prior carry still live: double-fire roots (3 in ready[]) + FIX-SIGNAL-CONFIDENCE (review, router gate) + 06-16 RSI/vnstock gates → then release held push (HEAD ~53 ahead, PO's deferred call). PUSH HELD until post-06-16 gates.
- FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK: unpark to ready when a BA/architect lane frees.
