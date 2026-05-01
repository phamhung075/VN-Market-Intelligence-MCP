# TASKS — VN Market Intelligence MCP

Active sprint board. Completed tasks → `docs/TASKS_ARCHIVE.md`.

_Last updated: 2026-04-30 by developer (task 1806a — fix stale 1347b lastUpdated assertion)_

---

## Sprint 1806a — Done

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| 1806a | Fix stale test assertion in 1347b: update lastUpdated to 2026-04-30 | done | developer | pm |

---

## Sprint 1804c — Done

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| 1804c | Fix get_price_history: query daily_ohlcv instead of 24h-pruned market_prices_history | done | developer | pm |

---

## Sprint 1803 — Done

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| 1803 | TA candle guard: explicit 'pending' annotation when history < min required for MACD/RSI | done | developer | pm |

---

## Sprint 1796 — Done

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| 1796 | Sync stale SSOT stats files — toolCount=122, testBaseline=8463, tasks=392, sprint=1795 | done | developer | pm |

---

## Sprint 1407 — Done

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| 1407 | foreignFlow CB: market-hours gate + reset tool + 10min HALF_OPEN backoff | done | developer | qa |

---

## Legend

| Status | Meaning |
|--------|---------|
| pending | Not started |
| in-progress | Being worked on |
| review | PR open / QA |
| done | Merged + verified |
| blocked | Waiting on dependency |

---

## Sprint 1400 — Done

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| 1400 | Centralise VN_OFFSET_MS into timeConstants.ts | done | developer | code-janitor |

---

## Sprint 1398 — Done

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| 1398 | pollNews all-sources-dark DB-backed cooldown — persist last-alert timestamp across server restarts | done | developer | qa |

---

## Sprint 1395 — Done

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| 1395a | alertBatchGrouper — group push-prices alerts by (signal_type, severity) | done | developer | po |

---

## Sprint 1361 — Done

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| 1361 | Add 48h purge for telegram_reports to daily audit job | done | developer | po |

---

## Backlog — Triaged 2026-04-28

Tasks created from telegram_reports batch (69 real reports, 787 fixtures cleaned).

### HIGH Priority

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| TASK-1362 | [ARCH REVIEW] Foreign flow circuit breaker — recurring OPEN state after multiple fix attempts | pending | ops | telegram:#2626,2630,2649,2652,2613 |
| TASK-1363 | [ARCH REVIEW] BCTC pipeline structural failure — HOSE SPA blocks PDF discovery, SKIP feedback endpoint missing | pending | ops | telegram:#2622,2623,2625,2627,2632,2636,2646 |
| TASK-1364 | [ARCH REVIEW] Sentiment classifier recurring misclassification — selling/loss events labeled BULLISH | pending | developer | telegram:#2628,1914,2566 |
| TASK-1365 | [ARCH REVIEW] post_agent_signal schema gap — chain_catalyst/price_confirmation `root` field blocks all signal posting | pending | developer | telegram:#2612,2651,2655,2603 |
| TASK-1367 | Signal confirmation tracking missing — 41 signals, zero confirmed outcomes, outcome backfill not wired | pending | developer | telegram:#2656 |
| TASK-1371 | Reuters RSS permanently dead (upstream shutdown) — replace with alternative news source | pending | ba | telegram:#2640 |
| TASK-1372 | TradingEconomics API key missing on VPS — TE_API_KEY not set, all 12 indicators return 401 | pending | ops | telegram:#2640 |

### MEDIUM Priority

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| TASK-1366 | [ARCH REVIEW] Test fixture pollution — ghost seeds (1970 epoch), rule_x/rule_y cascade placeholders, prediction_markets test rows | pending | developer | telegram:#1915,2570,2576,2581,2584,2585 |
| TASK-1368 | Macro sigma false positives — add minimum absolute deviation guard (FX <5 VND, Gold <100 USD/oz) | pending | ba | telegram:#2631 |
| TASK-1369 | BCTC_overdue cascade rule gap — conviction penalty not applied when financials are missing | pending | ba | telegram:#2634 |
| TASK-1373 | Cascade rule gap — news items with impact >=8 skipped from run_impact_chain analysis | pending | ba | telegram:#2619 |
| TASK-1375 | Prediction accuracy outcome validation never runs — weeklyPredictionOutcomeCheck appears inactive | pending | developer | telegram:#2582 |

### LOW Priority

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| TASK-1370 | bctc_overdue alert message truncated at Telegram char limit — ticker list cut mid-word | pending | developer | telegram:#2571 |
| TASK-1374 | Cascade rule gap — utilities sector "co bien" idiom not mapped to watchlist/cascade | pending | ba | telegram:#2611 |
| TASK-1376 | mcp-tools.md stale tool refs — QA Responder line 38 lists wrong tools | pending | developer | telegram:#2614 |

---

## Backlog — Triaged 2026-04-28 (market-group flow)

Tasks created from MARKET channel review: 32 messages, 2026-04-27–28.

### HIGH Priority

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| TASK-1377 | [BUG] alert-digest job fires twice per day for same date — duplicate digests (ids 309+310, 2026-04-27, 4h apart, 25 vs 26 alerts) | pending | developer | market-group |
| TASK-1378 | [BUG] VCB price_drop alert fires twice in same digest — bare price_drop duplicates price_drop+volume_spike composite | done | qa | market-group |
| TASK-1379 | [BUG] Raw HTML tag `<br/>` leaking into Telegram message content (id 324, GAS user_ask_reply 2026-04-28) | done | qa | market-group |
| TASK-1380 | [BUG] alert_engine pre-open phantom — change_pct alerts fire during pre-open window (00:00–02:00 UTC) against inconsistent reference price; no VPS/data issue (GAS feed confirmed fresh, log_fix id 193) — fix: suppress change_pct alerts outside VN trading window (02:00–09:00 UTC) or validate reference price matches prior session close before firing | done | qa | market-group |

### MEDIUM Priority

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| TASK-1381 | [QUALITY] volume_spike alerts repeating for same 7 tickers (PPC/POW/NKG/HVN/HSG/GVR/DHG) on consecutive days with zero news — add day-cooldown dedup or raise threshold from 5x to 8x | pending | ba | market-group |
| TASK-1382 | [QUALITY] Signal outcome tracking broken — 90% alert outcomes "unknown", 0 confirmed signals across all agents in 7-day window — wire record_signal_outcome() into alert lifecycle | done | qa | market-group |

### LOW Priority

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| TASK-1383 | [UX] user_ask_reply messages use inconsistent format — some emoji-bullet, some tabular (id 311 EOD vs id 316 BCTC reply) — standardize template per message_type | pending | ba | market-group |
| TASK-1384 | [QUALITY] VRE price_surge fires twice within 25 min for 50 VND price delta (30,250 → 30,300) — add minimum absolute price delta guard between consecutive price_surge alerts for same ticker (suggested: <0.5% or <100 VND within same session) | pending | ba | market-group |
| TASK-1389 | [UX] Alert summary cuts messages mid-word/mid-quote — "Cảnh báo gần nhất" digest truncates at raw char limit leaving broken text (e.g. "Vinhomes báo lãi quý 1 hơn 25.600 tỷ, "vô…"). Fix: truncate at word boundary, never inside a quoted string, append "…" only after a complete word | done | qa | user |

---

---

## Sprint 1423 — Trần Ngọc Báu Macro Framework (Phase 1)

WIP limit: max 3 tasks In Progress simultaneously.
Parallelizable: 1423a + 1423b + 1423c (no shared files). 1423e independent. 1423d depends on 1423a + 1423b + 1423c.

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| TASK-1423a | Add US10Y yield (^TNX) to Yahoo Finance fetcher + commodity_prices column | todo | developer | architect |
| TASK-1423b | FRED API fetcher for Fed Funds Rate → tracked_indicators | todo | developer | architect |
| TASK-1423c | Carry Trade Signal domain service (pure function, all 3 regime branches, unit tests) | todo | developer | architect |
| TASK-1423d | Surface [Thien Thoi] section in get_macro_snapshot — DXY + US10Y + Carry + Liquidity regime | todo | developer | architect |
| TASK-1423e | get_macro_calendar MCP tool — static GSO/PMI/FOMC calendar, 60d window | done | developer | qa |

---

## Backlog — Triaged 2026-04-29

New bugs from channel scan (2026-04-28/29 messages). Cross-referenced against existing tasks.

### Already covered by existing tasks (no new task needed)
| Existing Task | Bug | Status |
|---|---|---|
| TASK-1362 | foreignFlow CB recurring OPEN | pending (ARCH REVIEW) |
| TASK-1363 | BCTC queue url=MISSING + SKIP endpoint | pending (ARCH REVIEW) |
| TASK-1364 | Sentiment "xả hàng"/"bán ra" → BULLISH misclassification | pending (ARCH REVIEW) |
| TASK-1365 | post_agent_signal `root` field schema gap | pending (ARCH REVIEW) |
| TASK-1367 | Signal outcome tracking broken — 0 confirmed outcomes | pending |
| TASK-1368 | Macro σ thresholds too tight (FX/Gold false positives) | pending |
| TASK-1369 | BCTC_overdue no conviction penalty cascade | pending |
| TASK-1371 | Reuters RSS dead — replace source | pending |
| TASK-1372 | TradingEconomics API key missing on VPS | pending |
| TASK-1380 | Pre-open phantom alerts (change_pct outside 02:00–09:00 UTC) | **done** |
| TASK-1384 | VRE alert dedup — same alert 24× per day post-1395a fix | pending |

### NEW tasks — HIGH Priority

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| TASK-1422 | [BUG] pollNews 0 items persistent — vn-news-fetch crash-looping, no cooldown guard, fires every 15min with identical message | pending | ops | telegram:#2641,2643,2644,2648,2659,2662,2663,2664,2666,2667,2671,2672 |
| TASK-1423 | [BUG] Macro CRITICAL alerts stuck notified_telegram=0 — Brent +5.38σ and Gold -5.39σ fired at 06:23 UTC, never dispatched to Telegram | pending | developer | telegram:#2661 |
| TASK-1424 | [BUG] push-bctc-pdf min size guard too small — 100B threshold accepts 459B synthetic test PDFs; raise to ≥10KB to reject placeholder/test PDFs | pending | developer | telegram:#2623 |

### NEW tasks — MEDIUM Priority

| Task | Title | Status | Agent | Source |
|------|-------|--------|-------|--------|
| TASK-1425 | [BUG] vps_service_health CHECK constraint rejects "idle" status — INSERT fails every 5min for price/foreign-flow outside market hours; add "idle" to allowed values | pending | developer | telegram:#2669 |
| TASK-1426 | [BUG] 5 stale watchlist tickers never get price data (VDC, BDI, DLC, JSH, SIS) — bgapidatafeed returns empty for these; WARN flood every 60s in logs — verify listing status, remove or fix | pending | ba | telegram:#2660 |
| TASK-1427 | [BUG] BCTC OCR confidence=0 recurring for VNM/BSR — assets<equity or margin>100% corruption pattern; conviction signal silently skipped — needs extraction validation fix | pending | developer | telegram:#2642,2647,2665 |
| TASK-1428 | [UX] TA indicators show "only 2 candles available" in morning briefing — RSI/MACD require 35+ candles; price history pipeline needs backfill or rolling window fix | pending | ba | market-group:#342 |

---

## Notes on Recurrent Issues

### TASK-1362 — Foreign Flow Circuit Breaker (ARCH REVIEW)
- Sprint 1346b: fixed UNIQUE constraint on vnstock_trading_stats
- Sprint 1337: suppressed CB open log spam
- Sprint 1329: circuit breaker state logging
- Still recurring as of 2026-04-28 with 85 cumulative failures
- Architect must review: UNIQUE constraint only partially fixed, CB reset logic missing, VPS vn-foreign-flow.service intermittently unreachable

### TASK-1363 — BCTC Pipeline (ARCH REVIEW)
- Sprints 1343/1344/1345/1352: multiple BCTC pipeline fixes
- Root structural issue: HOSE migrated to React SPA — no automated PDF URL discovery possible for majority of watchlist
- SKIP feedback endpoint never implemented — queue loops forever at 0 attempts
- Architect must design: SSC portal as primary source, company IR pages as fallback, manual upload as last resort

### TASK-1364 — Sentiment Misclassification (ARCH REVIEW)
- Sprint 1308a: insider selling detector + bearish macro patterns added
- Sprint 1346c-a: sentiment negation fix
- Still misclassifying "xả hàng" / "bán ra" (dump/sell) as BULLISH
- Architect must review: classifier coverage for Vietnamese sell-event verbs

### TASK-1365 — Signal Schema Gap (ARCH REVIEW)
- Sprint 1293: signal validation + rejection audit log implemented
- Issue persists: chain_catalyst and price_confirmation signal types missing `root` field documentation
- Blocks all agent-to-agent signal coordination
- Developer + BA must document schema and add example payloads to TECH_1293_ROOTCAUSE.md

### TASK-1366 — Test Fixture Pollution (ARCH REVIEW)
- Sprint 1486: cleaned VCB test rows from market_prices
- Sprint 1372/1373: test fixture cleanup
- Still leaking: ghost seeds (1970 epoch in telegram_reports), rule_x/rule_y in cascade engine, prediction_markets test rows
- Developer must implement: DB startup guard to purge test records, test isolation enforcement

---

## Processed Reports (batch 2026-04-28)

Reports marked processed — resolved, informational, or OPS status updates:

| IDs | Reason |
|-----|--------|
| 2567, 2572, 2574 | Transient/resolved (market closed, Docker migration fixed) |
| 2568 | Likely resolved by subsequent code cleanup |
| 2575 | Fixed Sprint 1345b (VNM BCTC extraction validation) |
| 2583 | Fixed Sprint 1329b (WAL sentinel + named volume) |
| 2616, 2621 | False alarm — knowledge files present |
| 2617, 2618, 2620 | Resolved per OPS incident 2635 |
| 2624 | OPS report — SSH key fix applied, informational |
| 2629 | PO informational — BCTC filing compliance noted |
| 2633 | Duplicate of BCTC pipeline group (1363) |
| 2635 | OPS incident report — status update only |
| 2637, 2638, 2639, 2640 | OPS deploy status updates |
| 2641, 2643, 2644, 2648, 2654 | pollNews 0 items — recurring VPS outage symptom, subsumed into TASK-1363 |
| 2642, 2647 | BCTC low confidence — known, informational |
| 2645 | Price/news SLA breach — transient |
| 2650 | Overdue telegram reports — addressed by Sprint 1361 (48h purge) |
| 2653 | FPT portfolio risk — PO noted, decision deferred to user |
| 2615 | HSC IFCI — backlog idea, not actionable this sprint |
| 787 | Test fixture rows (Report A/B, Report 1/2, ghost seeds) — bulk cleaned |
| 2657 | Duplicate of TASK-1380 (GAS pre-open phantom alert, alert_engine change_pct, log_fix id 193) |
| 2658 | Duplicate of TASK-1365 (post_agent_signal root field schema gap, chain_catalyst/cross_validate/urgent_news) |
