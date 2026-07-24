# PO Notebook

_Last: 2026-07-24T21:28Z (dev-team Step-1 triage — 2 HIGH tnb asks + 8 routine BCTC + 1 cowork-fire)_

## Tick 2026-07-24T21:07–21:28Z — dev-team Step-1 signal triage

**Inputs:** 2 HIGH to:po rows (tnb c118 methflag + tnb chef-reliability) left NEW by dev-team; 8× routine BCTC signals + 1 cowork-fire (already in processed/). WIP=1 (FIX-OHLCV live worker) — did NOT dispatch.

**RAW-verified the chef-eod double-publish (dispatcher's primary ask).** `get_unreviewed_market_messages` → CONFIRMED two eod-window chef dishes same VN close: **id=1016@08:53:02Z** (FULL 5-part: Kinh Dịch Tỷ(8)+watchlist+"kháng cự 26.500") is UNTRACKED; **id=1017@09:02:31Z** (macro-only) is the ONLY one traced in `unified-agent-synthesis-2026-07-24-eod.json` (cycle_id eod-…T09:02:02Z). chef-eod cron 08:45 UTC=15:45 VN → **no midnight straddle**, so `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` AC5 (straddle-universality) cannot explain it. Decision: **EXTENDED** that umbrella P0 row (broadened AC = marker must engage on EVERY dispatch path incl cron/RemoteTrigger backstop + stay held; ledger 9th/4th) rather than mint a competing double-publish ticket. Isolation still blocked by FIX-CHEF-LOG-AGENT-WORK-MISSING.

**ZERO new rows minted** — every finding mapped to an existing tracked ticket (annotated, not duplicated):
- chef-morning TOTAL silent miss (05:22Z fired, 0 JSON/notebook/MARKET) → `FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION` (07-24 data point appended; total-miss = firer SIGTERMs fan-out pre-write).
- eod false `layers 1-6 (full)` while degraded/no-PMI → `FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION` (READY; 2nd occurrence crosses escalate bar).
- USD/VND "26,130 exceeds 26,500" (numerically FALSE) + gold $2,200-vs-$4,300 self-inconsistency in one doc → `FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE` (broadened to ALL macro thresholds); SSOT choice stays `FIX-USDVND-THRESHOLD-SSOT`.
- L6-token evening drop → `FIX-CHEF-L6-TOKEN-PERSISTENCE-RECURRING` (isolation RESOLVED: persist-step drop, evening-leaning; eod known_gaps[] RAW-confirmed carries both tokens).
- 8 routine BCTC + cowork-fire = informational (mode=routine, beat_miss=null, blocked-cluster unchanged) → ACK+skip.

Both HIGH rows flipped NEW→RESOLVED with disposition notes. Commit scoped to orch-state + this notebook (dev-mcp-server worker holds apps/mcp-server/).

## Carry-over
- **chef double-publish is now recurring across mechanisms** (07-22 evening straddle + 07-24 eod non-straddle). The real fix is one robust marker gate that (1) engages on every dispatch path and (2) stays held post-publish — NOT more key-derivation patches. Whoever picks up FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR must treat AC5 as necessary-but-insufficient.
- **Observability blocker compounds everything chef:** FIX-CHEF-LOG-AGENT-WORK-MISSING (zero agent_work_log rows) + read_telegram_reports channel-filter no-op mean chef reliability can only be audited by file-proxy. Prioritize the log fix so the double-publish mechanism can actually be isolated.
- **Macro-threshold drift is a class, not a metric:** USD/VND + gold both cite SSOT-less narrative thresholds that self-contradict within one synthesis doc. The numeric-assertion gate should be metric-agnostic.
