# TNB Audit — Supplementary (c118, gate-blocked cycle) — 2026-07-24T~20:31Z

**Not a replacement for the weekly audit row.** `published:tnb-audit:2026-07-20/2026-07-26` is still held by session `9f4a6bfc-...` (claimed 2026-07-21, expires ~2026-07-29) — the routine WORK audit-row cadence stays gated per `FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON` (BACKLOG, agent-father). This is a supplementary, read-only investigation performed while gate-blocked, because today's file-proxy review surfaced two concrete, evidence-backed findings that look time-sensitive enough not to sit until 2026-07-27. `docs/handoffs/tnb-audit-latest.md` (c115, PO-ACK'd) is left untouched.

---

## NEW — F-CHEF-EOD-POSSIBLE-DOUBLE-PUBLISH-0724 (HIGH, tentative — flagging for RAW-verification, not asserting a closed mechanism)

`get_unreviewed_market_messages()` shows two distinct, chef-narrative-signature messages (VN-Index summary → macro factors → watchlist/sector detail → Kinh Dịch → "watch next" trigger — matches `chef.md`'s 5-part dish format) for the same trading-day close:

| id | sent_at (UTC) | Content signature |
|---|---|---|
| 1016 | 2026-07-24 08:53:02 | VN-Index -0.78%, banking -1.35% (VCB/BID/ACB/TCB/SHB named), real estate DIG/DXG/KDH named, FPT -2.78%, **Kinh Dịch quẻ Tỷ (8)**, "theo dõi kháng cự 26.500" |
| 1017 | 2026-07-24 09:02:31 | VN-Index -0.79%, banking+RE "áp lực nhẹ", oil $92, gold $4.052, carry spread 1.37pp — no Kinh Dịch, no watchlist tickers |

Only **id=1017** matches `unified-agent`'s own bookkeeping: `docs/data/unified-agent-synthesis-2026-07-24-eod.json` has `cycle_id: "eod-2026-07-24T09:02:02Z"`, and `unified-agent.md`'s notebook line 27 cites the same 09:02 claim (`published:chef-eod:2026-07-24`, TTL=100800s). **id=1016 has zero trace** in the notebook or in any `unified-agent-synthesis-2026-07-24-*.json` file.

**Why this is not simply a recurrence of the already-tracked root cause:** `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` (BACKLOG, P0, sprint COWORK-RELIABILITY) diagnosed chef-evening's 07-22 double-publish as a VN-midnight-straddle key divergence (19:45 UTC fire = 02:45 VN next day, so two peers reading wall-clock at different instants derive different `WORK_DATE` keys). **chef-eod's cron is `45 8 * * 1-5` = 08:45 UTC = 15:45 VN — same VN calendar day, no midnight crossing.** If today's two messages are confirmed as a genuine double-publish, the midnight-straddle mechanism cannot explain it, which would mean `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR`'s AC(5) ("the fix applies to ALL cowork published gates... the same straddle hits ANY slot whose UTC fire hour maps across VN midnight") does not fully cover this instance — a distinct, 4th mechanism in the marker-gate recurrence ledger (that ticket's own ledger: "8th event, 3rd distinct root cause" as of 07-22).

**Corroborating oddity (not proof):** `task_list_held(task_kind="cowork-slot")` at 20:31Z today shows **no `published:chef-eod:2026-07-24` entry at all** — chef-morning:2026-07-24 and chef-evening:2026-07-24 both show (100800s TTL, held-forever convention), but eod's claimed-at-09:02 100800s-TTL lock (which should still be live for another ~17h) is simply absent. Consistent with, not proof of, an early release or a claim/overwrite anomaly on this specific slot today.

**Why I could not close the loop myself:** `read_telegram_reports` has no working `channel` filter (`F-TNB-READTELEGRAMREPORTS-CHANNEL-PARAM-NOOP`, already tracked) and `unified-agent` writes zero `log_agent_work` rows (`FIX-CHEF-LOG-AGENT-WORK-MISSING`, already tracked, P2, agent-father) — both already-known blockers that limit independent RAW verification beyond what's above. Recommend whoever holds `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` add this as a same-day, non-midnight-straddle data point before closing that ticket's scope.

---

## NEW — F-CHEF-MORNING-TOTAL-SILENT-MISS-0724 (HIGH)

`cowork-schedule.json` confirms chef-morning (guaranteed:true) fired: `last_fired: "2026-07-24T05:22:26Z"`. But:
- `docs/data/unified-agent-synthesis-2026-07-24-morning.json` — absent (Glob-confirmed; 07-22 and 07-23 both have this file).
- `unified-agent.md` notebook — zero `2026-07-24` morning session block (Grep-confirmed; 07-22 and 07-23 both have one).
- `get_unreviewed_market_messages()` — no chef-narrative-signature message in the 05:15–05:35Z window (closest is alert-commander's short cascade alert at 05:27:40, a different format/sender pattern; the 02:23:54 message already belongs to the confirmed intraday cycle).

This is a **total** silent miss — worse than the existing `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST` pattern (P1, whose tracked misses still leave an honest notebook self-report even when the JSON is absent). Here notebook, JSON, and MARKET post are all absent despite a confirmed dispatch. 3/4 dishes today (intraday/eod/evening) did produce artifacts. Recommend either escalating as a fresh, more-severe negative data point against `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST`'s "3 consecutive clean" bar, or minting distinct given the total-miss shape differs from that ticket's tracked symptom.

---

## WATCH (not new-critical, but concrete and self-contained) — USD/VND canonical threshold is 3-way inconsistent

- `apps/mcp-server/src/domain/services/cascade/macroAdjustments.ts` (7 independent cascade rules) = **25,500**
- `docs/standards/market-analysis.md` = **25,500** (consistent)
- `docs/standards/tnb-methodology-layers.md` L12 (Layer 1 rule) = **25500**, but its own L21 (Layer 3 section, 9 lines later) = **"26500 break"** — self-inconsistent within one file
- `docs/agents/tran-ngoc-bau/flow/main.md` L72 (my own Layer-1 row) = **25500**, L74 (my own Layer-3 row) = **26500** — inherits the same self-inconsistency verbatim
- `docs/agents/unified-agent/flow/chef.md` L202/L568 explicitly cites **26,500** for L3, sourced from `tnb-methodology-layers.md`
- Live `get_macro_snapshot()` signal computation uses a **4th** value: `"USDVND at 26130 exceeds 25000 threshold"`

**Concrete consequence today:** the eod synthesis JSON's `vn_macro_layer` field states *"USD/VND 26,130 exceeds 26,500 carry threshold"* — numerically **false** regardless of which candidate value is correct (26,130 < 26,500). A real Layer-1 "state transitions, not levels" violation: a stated threshold-crossing that didn't happen.

**Not auto-cured this cycle** despite having flow-file edit authority: fixing my own main.md L74 alone would just make my audit criteria disagree with chef.md's own spec (which explicitly follows tnb-methodology-layers.md L21's 26,500), and the live code itself disagrees with both (25,500 vs 25,000). This needs one canonical value chosen by PO/architect across code + docs, not a unilateral single-file edit. Recommend minting a ticket to reconcile.

---

## No duplicate WORK/BUG-for-the-weekly-row, no duplicate `tnb-audit-latest.md`

This supplementary note plus a BUG-channel escalation (concise, this cycle) and a `docs/signals/tnb-*.json` drop are the only outputs — consistent with the c116/c117 precedent of not re-publishing the gated weekly artifact.
