# PO Notebook
_overwritten 2026-06-17T04:37Z_

## Last cycle (2026-06-17T04:36Z dev-team :07 tick, po-s96) — LIVE USER BUG (false RSI/BB on MARKET) → BATCH 2×P0 + recurring-bug-escalation
USER filed: "actual RSI and BB calcul on report is false". Router RAW-verified first-hand (MARKET msg 783-790, 02:15-03:15Z): single-digit RSI universe-wide (CTG 3.4/SSI 6.8/VCB 3.7 on +0.48% day = impossible) + "giá 0 dưới BB"; canonical get_technical_indicators CLEAN by 04:30Z. Board {ready:1→3,in_prog:1,review:8,done:162,dv:99,backlog:294}.

ROOT (PO code-traced, builds on router): **writeForeignFlowToOhlcv** (apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts L58-69) is the LAST daily_ohlcv writer BYPASSING writeOhlcvBatch SSOT — at market open (foreign-flow fetch gated 02:00Z, fires BEFORE real bar) it INSERTs an all-zero stub (O=H=L=C=0,vol=0) ON CONFLICT(code,date). taAlertScanJob/bbAlertScanJob CANDLE_SQL (date>=-60d ORDER BY day ASC) read C=0 as today's latest candle → Wilder RSI collapses single-digit + close=Math.round(0)=0 → "giá 0 dưới BB". Real bar UPSERTs over stub later → canonical clean by 04:30Z (self-heal masks it). The migrated-writer set (FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0: aggregator/backfill/pushPrices) MISSED this writer.

DECISION — 4th recurrence → recurring-bug-escalation (owner zone apps/alert-engine proven WRONG twice; real root is a WRITER in apps/mcp-server):
- **MINTED ARCH-OHLCV-WRITER-SSOT-DURABLE** (P0, architect, apps/mcp-server/, recon_first) — durable producer root: route the foreign-flow writer (and audit the remaining RAW-INSERT bypass writers: server.ts L1247, ohlcvBackfill.ts, priceBackfillService.ts) through writeOhlcvBatch / NULL-OHLCV honest-gap; close the writer-bypass class. Also the ÷1000 majors leak (VHM 136) → coordinate FIX-OHLCV-SCALE-X1000-AUTO-REPAIR.
- **MINTED FIX-ALERT-SCAN-REJECT-STUB-BAR-P0** (P0, dev-mcp-server, apps/mcp-server/) — consumer defense-in-depth: both scan jobs reject latest bar close<=0 OR volume<=0 BEFORE compute (guards the VALUE not just MIN_CANDLES count); fail-closed skip like FIX-RSI-REPORT-FAILCLOSED. SELECT volume in CANDLE_SQL.
- Did NOT re-open FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (kept review[], gate stays RED — downstream consumer in wrong zone). Did NOT re-open closed OHLCV-seeder P0s (real+dv but non-generic coverage gap, NOT a regression). po-s85 data_source_fixed:true CONTRADICTED by 06-17 open.
- GATE (shared, both tasks): NEXT VN open 2026-06-18 briefing 01:00Z + first TA scan 02:15Z — RSI matches canonical within 0.1pt, no single-digit, no 100.0, no "giá 0/÷1000 dưới BB", generic all tickers (RAW get_unreviewed_market_messages) + live DB probe 02:00-03:30Z: 0 C=0 stubs poisoning latest bar.
- WIP: PO-authorized exception — in_prog=1 is ARCH-CRON (design/gate-held, not active coding lane); these P0s lead ready[]. /goal#1 highest-value.
- Signals routed: (a) context_bloat qa.md 236L>200 → claude-manager-helper (already in CLEAN-CONTEXT-BLOAT epic; no new mint). (b) cowork cloud_backstop_defer + gatherer-doublefire (READ) → informational/DESIGN-GATHERER, no action.

## Carry-over
- **NEW HEAD-OF-LINE: 2 P0 OHLCV-writer tasks** ready[] — router locks+spawns architect (ARCH-OHLCV-WRITER-SSOT-DURABLE) + dev-mcp-server (FIX-ALERT-SCAN-REJECT-STUB-BAR-P0) in parallel (same zone, distinct files: producer ohlcvForeignFlowStore.ts vs consumer scan jobs). Both rebuild mcp-server.
- Behavioral gate fires NEXT :07 tick AFTER 2026-06-18 02:15Z first TA scan — RAW-read MARKET; do NOT flip done_verified before a clean post-fix open observed (recurring class; self-heal window masks steady-state probes — verify AT market open, not at 04:30Z).
- **PUSH still HELD** (origin frozen behind FIX-CI-RED-STANDING; PO out-of-band). Recurring ci_red on frozen origin HEAD = dup → NOTHING; do NOT re-mint.
- HELD: ARCH-CRON umbrella (market-day gate) + DESIGN-GATHERER + DMS-1/DMS-2 + FIX-BCTC-BANK-SCALAR-MAPPING + CLEAN-CONTEXT-BLOAT (6 targets incl qa.md@236).
- FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD = DONE, done_verified WITHHELD BY DESIGN. Do NOT re-open.
