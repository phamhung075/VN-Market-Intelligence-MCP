# Alert Commander — Notebook

**Last updated:** 2026-07-04 16:10 UTC | **Sprint:** idle (bash/jq unavailable again this session — 6th consecutive session with this gap; defaulted to idle per documented fallback rule)

> Prior cycles archived → `docs/archive/notebooks/alert-commander-2026-05-22.md`
> AC-2b prune (2026-07-04 16:10 cycle): oldest sub-block (2026-07-04 00:18 UTC, SILENT-EXIT) dropped from "This session" — accumulator exceeded the ≥4 sub-block cap. Content preserved in git history of this file (uncommitted rounds — see PROCESS GAP below).

## Current state

**Regime:** NEUTRAL (fallback — macro_snapshot JSON shape still has no literal REGIME text line, 6th cycle confirming; `signals.carry.regime`=NEUTRAL, carrySpread=1.37% — unchanged since 08:11 cycle) | Pivot window: inactive (`get_macro_calendar` status=unavailable, is_estimate=true, 0 events)
**Last fired:** MBB `legal_risk` CRITICAL 16:10 UTC 2026-07-04 (verdict `d80e6eb9-1a56-4429-8a68-cb62e89101fe` pending) — NEW, 3rd bank named in the Shark Bình AML case (after VCB+EIB fired 08:14 UTC). VCB (`8c1460f7-...`) and EIB (`df46ac12-...`) verdicts from the 08:14 fire remain pending, unchanged.
**write_alert_verdict dedup guard — CONFIRMED live this cycle:** news-scout re-emitted the identical VCB/EIB AML story as fresh signal IDs (8533/8534, createdAt 12:07) ~4h after the original 08:14 fire. Calling `write_alert_verdict(ticker, alertSource="legal_risk")` for both returned `duplicate:true`, echoing the existing 08:14 pending verdicts — correctly proved these are NOT new incidents. Suppressed both (no re-alert to user). This is the authoritative backstop for the "get_legal_risk_signals tool/bus discrepancy" flagged since 08:11: the dedicated tool correctly returns empty (dedup-bounded), while news-scout independently re-posts the same story on the bus — `write_alert_verdict`'s (ticker+alertSource) pending-dedup guard is what actually prevents a duplicate MARKET alert, not the bus layer itself.
**Legal-risk dedup fix (FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK):** still holding at the tool layer — `get_legal_risk_signals(days=1,hours_back=6)` returned empty this cycle even with 3 legal_risk signals live on the bus.

## Known patterns / preferences

- TIGHTENING bullish urgent_news threshold: 0.75 | chain_catalyst: 0.85 | verified_chain: 0.85 | crisis_velocity: 0.90
- legal_risk: auto-fire (no conf gate) — but ALWAYS call `write_alert_verdict(ticker, alertSource)` as a pre-check BEFORE `send_telegram` when a legal_risk/chain-type signal could be a repeat of a recent story; `duplicate:true` in the response = pending verdict already exists for that (ticker, alertSource) pair = SUPPRESS (don't re-alert), not a suppression-judgment violation — it's a concrete system signal, not arbitrary conviction gating.
- `no_cycle_headers: true` — silent exit when 0 alerts fired
- Off-hours: blanket suppression, no per-signal outcome logging (except explicit bus-signal suppress/fire calls, which always fire)
- `fundamental_validation` signals (from financial-analyst/report-analyzer/bctc-analyst) are informational context only — not in the Signal Matrix firing table, no `record_signal_outcome` call needed unless they feed a firing gate directly.

## This session

### Alert Cycle (04:00–04:08 UTC, 2026-07-04) — off-hours cadence, market CLOSED
- **Status:** SILENT-EXIT. Fired: 0 | Suppressed: 1 (id=8515, freshness-sla-monitor class) | log_agent_work id=1569
- position-danger 0/3 (no >5% move, HVN +6.53% up not down), watchlist-opportunity 0/4, CRITICAL overrides 0.
- Filed `submit_feedback` (performance_issue, MEDIUM) for `get_foreign_room` recurring token-budget overflow (3rd occurrence) — routed to @po.

### Alert Cycle (08:11–08:15 UTC, 2026-07-04) — offhours critical-alert slot=alert-commander-critical, market CLOSED
- **Status:** FIRED (CRITICAL override, dual-ticker legal_risk)
- id=8516 VCB `legal_risk` + id=8517 EIB `legal_risk` (news-scout, "Shark Bình rửa tiền 320 tỷ đồng qua VCB", AML/money-laundering, VCB+Eximbank) — both first-seen, CRITICAL-always rule → FIRED. id=8524 freshness-sla-monitor urgent_news → suppressed (same recurring class).
- Fired: 2 | Suppressed: 1 | log_agent_work id=1571
- Actions: `send_telegram(market, VCB, 133 chars)` → `send_telegram(market, EIB, 118 chars)` → `record_signal_outcome` x3 → `write_alert_verdict` x2 (ids above) → `send_telegram(work, "[ac] 08:14 — 3 sigs | fired:2 sup:1 | next:evt")`
- `get_foreign_room` SKIPPED (recurring overflow, already filed 04:00 cycle, `get_recent_fixes` checked — no fix yet, not re-filed).

### Alert Cycle (12:00–12:06 UTC, 2026-07-04) — cowork tick 2026-07-04T12:00Z, slot=alert-commander-critical, market CLOSED
- **Status:** SILENT-EXIT (firing gate not met)
- **Regime:** NEUTRAL (fallback, 5th cycle confirming) | Carry: NEUTRAL (spread 1.37%) | Pivot window: inactive
- **Market:** VN-Index 1,862.08 (Δ-4.27, down) | Brent 72.13 (flat) | Gold 4,187.3 (flat) | USD/VND 26,103 — CLOSED. Volatility: vol_regime=NORMAL, gk_vol_20d_pct=13.32% (29.6th pctile), drawdown_252d=16.38%. Liquidity: OMO=NULL (honest-NULL), interbank_1w=NULL (VPS unreachable) — no liquidity-stress signal.
- **Signals:** id=8532 urgent_news (freshness-sla-monitor, 4th consecutive occurrence of this noise class) → suppressed.
- **position-danger 0/3, watchlist-opportunity 0/4, CRITICAL overrides 0** (legal_risk=0 via dedicated tool, dedup fix holding; verified_chain=0; crisis_velocity=0 — reputation <50: GAS/HPG/KBC/PLX/VNM, none crisis-tier).
- **Fired:** 0 | Suppressed: 1 | log_agent_work id=1574
- `get_foreign_room` SKIPPED again (no fix landed). No Bash/git tool this session (5th consecutive). `orch-state.json` 879.9KB, exceeds Read 256KB cap — SPRINT defaulted "idle".

### Alert Cycle (16:07–16:11 UTC, 2026-07-04) — cowork tick 2026-07-04T16:00Z, slot=alert-commander-critical, dispatcher session 5e735616-452d-42a2-a615-8c4fb6eb1146, market CLOSED
- **Status:** FIRED (CRITICAL override, single-ticker legal_risk — MBB new) + 2 duplicates correctly suppressed (VCB/EIB)
- **Regime:** NEUTRAL (fallback, 6th cycle confirming) | Carry: NEUTRAL (spread 1.37%, unchanged) | Pivot window: inactive
- **Market:** VN-Index 1,862.08 (-0.23%, down) | Brent 72.13 (flat) | Gold 4,187.3 (flat) | USD/VND 26,103 — CLOSED (16:00 UTC outside 02:00-08:59 window). Volatility: vol_regime=NORMAL, gk_vol_20d_pct=13.32%, drawdown_252d=16.38% (unchanged). Liquidity: OMO=NULL (honest-NULL), interbank_1w=NULL (VPS unreachable) — no liquidity-stress signal.
- **Signals evaluated (6 addressed to alert-commander):**
  - id=8533 legal_risk VCB (news-scout re-emission of 08:14 story, createdAt 12:07:28) → `write_alert_verdict` → `duplicate:true` (existing `8c1460f7`) → SUPPRESSED
  - id=8534 legal_risk EIB (same story, createdAt 12:07:29) → `write_alert_verdict` → `duplicate:true` (existing `df46ac12`) → SUPPRESSED
  - id=8549 legal_risk MBB (news-scout, cafef source, genuinely NEW — 3rd bank named) → `write_alert_verdict` → new verdict `d80e6eb9` (no duplicate) → FIRED, `send_telegram(market, 130 chars)`
  - id=8546 fundamental_validation GVR (bctc-analyst, profit outlook intact, impact=4) — informational only, no firing rule applies
  - id=8547 fundamental_validation MBB (bctc-analyst, data-integrity fault not profit risk, impact=3) — informational only
  - id=8548 urgent_news freshness-sla-monitor (5th consecutive occurrence, 8505→8515→8524→8532→8548) → SUPPRESSED
- **position-danger 0/3** (get_alerts type=price → no active alerts, market closed) | **watchlist-opportunity 0/4** (no BUY-majority signal, structural) | **CRITICAL overrides:** legal_risk=3 seen (1 fired, 2 dup-suppressed) | verified_chain=0 | crisis_velocity=0 (no crisis signals; reputation <50: GAS 45/stable, HPG 45/deteriorating, KBC 44/stable, PLX 35/stable, VNM 37/stable — unchanged)
- **Fired:** 1 (MBB) | Suppressed: 3 (VCB dup, EIB dup, freshness-sla-monitor) | Informational: 2 (GVR, MBB fundamental_validation) | log_agent_work id=1579
- **Actions:** `write_alert_verdict` x3 called BEFORE `send_telegram` as a dedup pre-check (deviation from literal doc order, justified — gates whether to fire at all) → `send_telegram(market, MBB)` → `record_signal_outcome` x4 (8533 sup, 8534 sup, 8548 sup, 8549 fired) → `send_telegram(work, "[ac] 16:10 — 6 sigs | fired:1 sup:3 | next:20:00")`
- `get_foreign_room` SKIPPED again (recurring token-budget overflow, `get_recent_fixes(20)` checked — no fix landed, not re-filed).
- **Notable — discrepancy explained:** the "get_legal_risk_signals tool/bus source discrepancy" (flagged since 08:11) is now understood: the dedicated tool correctly stays empty (dedup-bounded), while news-scout independently re-posts the same VCB/EIB story as fresh bus signal IDs — `write_alert_verdict`'s pending-dedup guard is the real backstop, confirmed working. Root cause (news-scout re-emitting an identical AML story under new signal IDs rather than deduping at source) is a news-scout item, not an alert-commander defect.

## Carry-over for next cycle

- PNJ legal_risk verdict `6a2c9cd6-ed0c-497a-a981-90a02baf66c9` pending (fired 2026-07-03 20:20 UTC, resolves ≈ 2026-07-04 20:20)
- VCB legal_risk verdict `8c1460f7-0137-48d7-87f4-82c5054abca2` pending (fired 2026-07-04 08:14 UTC, resolves ≈ 2026-07-05 08:14) — re-confirmed pending this cycle via dedup check
- EIB legal_risk verdict `df46ac12-33b5-4641-8f76-c1b55ef12c77` pending (fired 2026-07-04 08:14 UTC, resolves ≈ 2026-07-05 08:14) — same
- MBB legal_risk verdict `d80e6eb9-1a56-4429-8a68-cb62e89101fe` pending (fired 2026-07-04 16:10 UTC, resolves ≥24h out ≈ 2026-07-05 16:10)
- get_macro_snapshot schema change: 6th cycle confirming, still no literal "Global Liquidity: X"/"US 10Y Yield"/"DXY" text lines — REGIME still falls back to NEUTRAL every cycle. Flag to dev-team/architect: still open, now a 6-cycle-old gap.
- freshness-sla-monitor → alert-commander `urgent_news` routing: now 5 consecutive occurrences (8505→8515→8524→8532→8548), identical shape, doesn't fit event-only MARKET model. Not re-escalating each cycle (known issue, non-blocking, suppressed correctly every time).
- `get_foreign_room` token-budget overflow: filed via `submit_feedback` at the 04:00 cycle. `get_recent_fixes` checked again this cycle — still no fix landed. Continuing to SKIP-and-suppress, not re-filing.
- **NEW this cycle — news-scout re-emission gap:** news-scout appears to re-post the identical Shark Bình AML story as fresh signal IDs (8516/8517 at 08:14 → 8533/8534 at 12:07, ~4h apart, same wording) instead of deduping the underlying article at source. The `write_alert_verdict` (ticker+alertSource) pending-dedup guard caught it correctly this cycle (no duplicate MARKET alert sent), but this is duplicate signal-bus traffic/noise worth a dev-team/architect look at news-scout's own dedup logic.
- **PROCESS GAP (recurring, 6th session):** no Bash/git tool again this session (Read/Write/Edit/MCP-gateway only) — this notebook overwrite is likely UNCOMMITTED again, now 6 consecutive rounds pending a git-capable session/agent to commit (2026-07-03 20:15 through 2026-07-04 16:10 — this round adds 1 new MARKET fire + 1 new verdict + 4 signal-outcome records). `orch-state.json` size concern (879.9KB, exceeds Read's 256KB cap) carried over from 12:00 cycle, not re-diagnosed this cycle.
- Doc self-heal: fixed 1 item in `docs/agents/alert-commander/flow/stage-dispatch-log.md` — documented the `write_alert_verdict` `duplicate:true` response field + added a pre-check-ordering exception (call `write_alert_verdict` BEFORE `send_telegram` when a signal looks like a repeat, gate on `duplicate`) discovered live this cycle. Also added `legal_risk|crisis_velocity` to the documented `alertSource` enum (already live per tool doc, was missing from this flow file's copy).
