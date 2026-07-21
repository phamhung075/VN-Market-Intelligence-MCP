# PO Notebook

_Last: 2026-07-21T14:56Z (Step 0-SIG triage, 32 signals — 2 high mints, 2 dup rows retired, board write-block cleared)_

## Tick 2026-07-21T14:51Z — Step 0-SIG triage (dev-team cron 14:37Z)

**2 dashboard signals — BOTH folded, zero mints** (as the dispatcher predicted): A-20 pdf-extractor → `PDF-AVAIL-02-FIX` (recurring_bug_count HELD 6 — same continuous episode); A-30 mem 91.19% → `FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE`, which re-emitted ~20min AFTER that row was minted at 14:23 = Nth-instance confirmation of the exact FP class it exists to stop.

**The dashboard signals were the small half.** The file-bus carried the real finding.

**MINT 1 — `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP` (high, apps/mcp-server, supervised).** bctc-analyst escalated 4x over 27h (4→6→8→16 tickers), all still NEW, unactioned. An unattended reprocess writes back BOTH corrupt financials (total_assets=0) AND a NGAY NOP of the processing day. **Verified on 4 planes, not taken on report:** get_bctc_full(DGC Q1-2026) = "[CORRUPT DATA — SKIP]"; get_earnings_calendar = exactly 16 rows flipped to 07-19/07-20, matching the agent's count. The filing-date flip is the worse half and is user-facing: HAN NOP was 30/04 and 15/05, so these are 2+ months overdue but now render "ĐÃ NỘP" instead of "QUÁ HẠN". 12+ adjacent BCTC rows exist — all are victim-remediation or validation-gate; **none targets the running writer**, so this was a genuine mint, not a fold.

**MINT 2 — `FIX-OHLCV-HISTORY-PLANE-EMPTY-LIVE-PLANE-HEALTHY` (high, apps/mcp-server, supervised).** digest-predict's Sunday report was nearly skippable as a market-closed artifact. Re-tested live Tuesday mid-session instead: correlation **0 codes / 0 pairs** (worse than the reported 2; was 33/496 a week ago) while `get_market_snapshot` returned complete healthy data the same minute. Live plane green, history plane dead → dashboards look fine while correlation/sector/5d/TA/alert-accuracy all serve nothing.

**Dev-team's signals-dir follow-up — NO new row.** Grep found the class already tracked **4x**. Escalated `CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR` in place (low→high) and retired 2 stale-scope duplicates ("3 artifacts", "4 files" — live count 52) to archive as CANCELLED with `superseded_by`. Kept `FIX-PRICE-ANOMALY-DISH-SIGNAL-ENVELOPE` separate — that one is real data-loss, not hygiene.

**MINT 3 (incidental, from my own write failing) — `FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE` (high).** This tick's drain (0ab70d437) moved a payload to processed/ but left `signal_queue.payload_ref` at the old path. Validator Stage 1c hard-fails on a dangling ref, so **every agent's orch-state write was blocked fleet-wide** until I repointed it. Confirmed structural, not a fluke: `drain-signals.js` contains no `signal_queue`/`payload_ref` handling at all.

**Skipped, with reason:** 23 bctc routine (per triage table); market-watcher exec-proof-fail (self-caveated "market CLOSED, zero results expected" — benign, agent was honest); tnb c114 (ACK'd 07-19); 2 po-* (own emissions, already dispositioned); signalqueue brief_complete (to=agent-father). BCTC-ZERO-URL folded onto `BCTC-ENRICHER-OLD-QUARTERS` as a **lead not a fact** — single Telegram plane, not re-verified.

## Carry-over
- **VERIFY BEFORE MINT (reinforced twice this tick):** the market-hours re-test is the only thing that separated the OHLCV regression from the known market-hours-blind FP class; the 4-plane check is what made the BCTC mint defensible. A Sunday-dated report is never sufficient on its own.
- **GREP THE BOARD FIRST (held):** 4 pre-existing rows on the signals-dir class. A 5th would have been pure churn. New information was *severity*, not a new problem → escalate in place.
- **A-30 TRIPWIRE (STANDING):** escalate ops ONLY on OOMKilled / baseline >93% no-dip / peak >97% no-reclaim. 85–93% sawtooth = FOLD.
- **APPEND-ALWAYS CONTRACT (STANDING):** signal_queue is an E-3 ledger; never instruct the auditor to skip minting. Distrust `rows_written` — jq the delta.
- **PDF-AVAIL-02 expectation-setting:** fix is COMMITTED (c78839c6c) but deploy is USER-GATED. A-20 will re-emit every Tier-1 cycle indefinitely until the rebuild. Those re-emits are NOT the fix failing — it has not run anywhere yet.
- Detection-only tick: read-only tool calls, no container/job/data touched. Halting the live reparse batch is ops/user-gated — PO disposes, never deploys.
