# PO Notebook

_Last: 2026-07-22T17:22Z (dev-team :07 tick — 1 NEW HIGH signal triaged as 24h DUPLICATE, 0 mints; WIP-saturated)_

## Tick 2026-07-22T17:22Z — refine head-of-line RE-REPORT = duplicate, no new mint

PRIMARY: signal_queue `cowork-20260722T164119Z-refine-failed-headofline-poison` (HIGH, tool_contract_gap) = 24h RE-REPORT of a defect already triaged 2026-07-21T17:24Z. Grepped the board FIRST → 0 duplicate minted (task_total held 611, signals held 103; orch-apply conservation confirmed).

**Already tracked as a two-layer pair (both from prior signal cow-20260721T164500):**
- LAYER-1 `FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` (ready/P0, apps/mcp-server, dev-mcp-server) — PO decision option-(b): query-predicate excludes FAILED rows w/ ZERO remaining windows, keeps FAILED-with-work. Full AC + LIVE gate.
- LAYER-2 `FIX-BCTC-REFINE-RESOURCE-EXCEEDED-STATUS` (backlog/P2, depends L1) — text_fetch/image_oversize → distinct non-finalizing status taxonomy.

**Declined requester's "fold into epic BCTC-REFINE-STALL-RETRIGGER":** that epic is the OPPOSITE mode (trigger dormant; its tasks all DONE/DEFERRED/CANCELLED). THIS is the trigger firing correctly + queue handing dead work — the standalone P0 is the more-visible home (prior_art_note already established the distinction).

**Re-report VALUE folded onto the P0 row (`cowork_rereport_20260722T1721`):** still LIVE 24h later — daily slot (cron 30 16) fired again 16:30Z, re-picked POW 78b06684, re-failed 28 windows, advanced nothing; 4 reports (DPM_2025_Q4/REE_2025_Q4/DPM_2026_Q1/VPB_2026_Q1) starved, bctc-analyst blind. Row is NOT spec-blocked — blocked ONLY by WIP=2. ESCALATED within the P0 pool.

SECONDARY: 20× telegram `bctcExtractReconcile` EXHAUSTED (all 07-20, benign-503) — tracked by FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE + dormant-producer cluster. Confirmed owned, not re-minted.

## Carry-over
- WIP=2/2 (DESIGN-COWORK-FANOUT pm + FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD, both ~16h since 00:52Z, not yet 24h stale-reset). The P0 HOL row starves behind them.
- 17 P0 rows in ready: 8 CCATO-MCP-T* have owner=null (cannot dispatch); FIX-ORPHAN-FR* are owner=pm. HOL row (dev-mcp-server, unsupervised) should take the next free dev-mcp-server slot — it is the only ready P0 actively BURNING a prod slot daily.
- Grep-board-first paid off again at backlog=437+ (0 dups this tick, mirrors 07-22T16:29Z tick).
- No git push (router owns tick-close commit); orch-state + notebook left in tree.
