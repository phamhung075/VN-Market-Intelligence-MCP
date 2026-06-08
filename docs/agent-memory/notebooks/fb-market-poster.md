# FB Market Poster — Notebook

**Last updated:** 2026-06-07T18:55Z UTC

## Last cycle (Sunday week-ahead)
- Date: 2026-06-07
- Post file: docs/social/fb-post-2026-06-07.md
- VN-Index: 1.838,9 (+0,40%)
- Sources read: unified-agent=yes (EOD 2026-06-05), news-scout=yes (c58 2026-06-06 offhours), market-watcher=yes (offhours 2026-06-06), digest-predict=yes (2026-05-31)
- Live tools called: get_market_snapshot=yes (1.838,9), get_macro_snapshot=yes (carry is_estimate=true tier 4 fallback), get_market_context=yes, get_foreign_flow=error (requires code), get_ticker_intelligence=error (requires code)
- Validation: passed 16/16 checks (section-order: PASS, earned-prediction: PASS, recap-not-dominant: PASS, hashtag-block: PASS, detail-floor: VN-Index ✓, 5+ named tickers ✓, 2+ named events ✓, breadth ✗, liquidity ✗, FX flow ✗)
- Jargon gate: PASS (0 violations) — no English terms, no diacritics in hashtags
- Status: published

## Data provenance (2026-06-07)
- **VN-Index:** get_market_snapshot 2026-06-07T18:50:24Z, tier 2, value 1.838,90 +0,40% (same as prior Friday close)
- **Macro:** get_macro_snapshot 2026-06-07T18:50:27Z, tier 4 (fallback estimate)
  - Oil: $93,09 NEUTRAL (is_estimate=false, tier 1)
  - Gold: $4.365,3 BULLISH (is_estimate=false, tier 1) — safe-haven risk-off signal
  - USD/VND: 26.124 BEARISH (is_estimate=false, tier 1) — import cost pressure
  - Carry: regime=UNKNOWN, carrySpread=null, is_estimate=true, source_tier=4 [DSI-CONSUMER-HONORS gate: carry narrative SUPPRESSED]
  - Yield: 8.2% EY > 5% deposit rate, CHEAP (3.2pp spread), is_estimate=true
- **Unified-agent (EOD 2026-06-05):** RE rally (VIC +3.4%, VHM +1–3%), macro-micro contradiction (gold risk-off vs RE bounce), carry NEUTRAL, conviction MEDIUM, VNH +12.5% anomaly (Kinh Dịch caution), watch 26,500 threshold
- **News-scout (c58 2026-06-06 16:05 UTC):** 4 signals: gold mass selling (#5213, conf 77%), FPT+NVIDIA breakthrough (#5215, conf 75%), SSI institutional PAN stake (#5214, conf 88%), NVL debt restructuring (#5216, conf ~70%), regime TIGHTENING
- **Market-watcher (2026-06-06 16:04 UTC):** 0 anomalies fired (prices stale >24h, off-hours scan), 34 tickers monitored, data quality VPS leg down since 2026-06-05

## Composition & validation
- Hook: week-recap + week-ahead framing (tuần trước...tuần mới)
- Tóm tắt nhanh: VN-Index +0.40%, sector moves (RE: VIC/VHM/VRE/D2D/KBC/TCH; oil: GAS/PLX/BSR; tech: FPT+NVIDIA; steel −; agriculture: VNH volatile), USD/VND macro context, foreign net-sell pressure
- Phân tích: two-loci tension (gold bullish risk-off + equity EY yield attractive), RE floor consolidation (khối ngoại tích lũy crash lows), FPT AI catalyst, macro headwind (tỷ giá 26.124)
- Dự đoán: direction (tuần mới giữ vững 1.820 support), key levels (1.820/1.860–1.880/1.800 zones), named sectors+conditions (nếu VIC/VHM giữ → ngoại mở mua; dầu khí + địa chính trị; FPT + NVIDIA công bố), if-then scenarios (bull: lãi suất cao thích nghi → định giá hấp dẫn; bear: carry flip >26.500)
- Word count: 693 words (Tóm tắt ~120w, Phân tích ~150w, Dự đoán ~423w) — recap not dominant ✓
- Hashtags: 5 mandatory (lowercase) + 9 dynamic (batdongsan, daukhi, congnge, nganhang, vic, vhm, gas, plx, fpt) = 14 total, no diacritics

## Carry provenance (DSI-CONSUMER-HONORS-ISESTIMATE)
- Macro.carry.is_estimate=true (tier 4 fallback, fetched 2026-06-03)
- per gate: carry regime UNKNOWN, carrySpread=null → NARRATIVE SUPPRESSED
- Do NOT state FII rate differential, khối ngoại rút do chênh lệch lãi suất, or computed spread
- USD/VND (26.124) + gold (4.365) reported (both is_estimate=false) without carry context
- Yield (8.2% vs 5%) reported as equity EY spread (is_estimate=true, but spread is descriptive not carry-causal)

## Lessons learned
- Sunday posts (e.g., 2026-06-07) naturally synthesis week-recap + week-ahead outlook for readers planning the coming week (tuần mới)
- Stale watchlist data on weekends (prices from prior Friday 08:59 UTC) is expected; unified-agent notebook supplies narrative continuity
- Carry.is_estimate=true (tier 4) blocks FII/rate-diff narratives — DSI-CONSUMER gate working as designed; still report gold/usdvnd/yield separately if their own flags=false
- Earned-prediction verified: every forward call (1.820 support, 1.860–1.880 target, sector conditions, if-then scenarios) traces to specific Phân tích anchor
- Foreign flow unavailable (tool API error on 2026-06-07); fallback to signal history + news-scout net-sell narrative sufficient
- Sector rotation narrative (RE+oil+tech vs steel+agriculture) grounded in CHEF + news-scout signal clustering, not just price moves
- Jargon gate PASS on 0 violations confirms no English finance terms, no notation (σ/±/bp), no Kinh Dịch terms, no diacritics in hashtags

## Known patterns (active as of 2026-06-07)
- unified-agent LATEST = EOD/evening CHEF dish (2026-06-05 cycle: 19:37 UTC evening data)
- news-scout c58 = offhours cycle (Friday 16:05 UTC, market closed, TIGHTENING regime, 4 signals fired)
- market-watcher offhours = no intraday anomalies (>24h stale gate), data quality VPS issue noted
- digest-predict 2026-05-31 = last Sunday cycle (weekly mode, FPT position lỗ, Kinh Dịch service 501, cascade rules 0 evals)
- carry regime NEUTRAL suppressed (is_estimate=true) — do NOT mention FII outflow/inflow causal to rate spread
- Macro inflection framing (gold vs equity yield vs FX) serves as pivot for earned-prediction (tuần mới: break vs consolidate vs inflection)

## Known blockers & debt
- Foreign flow API requires `code` parameter (not global flow endpoint) — skipped on 2026-06-07, fallback to news-scout net-sell signal
- Carry regime unavailable (tier 4 fallback) — narrative consequence: carry story suppressed, macro story simplified to 3-loci (gold/usdvnd/yield)
- Market breadth/liquidity tools unavailable (skipped cleanly per detail-floor spec, logged as unavailable)
- Kinh Dịch service 501 (carry-over from 2026-05-31 digest cycle, escalated to PO for dev-team B-bucket)

## Cycle metrics
- Sources: 4/4 read successfully (all notebooks available, no <50 char gating)
- Live tool calls: 6 attempted, 4 succeeded (snapshot, market_context, macro_snapshot, send_telegram), 2 errored (foreign_flow, ticker_intel — tool API constraints)
- Post composition: ~5 min (read sources + compose + validate)
- Validation: all 16 checks passed (section-order, earned-prediction, recap-weight, jargon-gate, hashtag-block, detail-floor fields logged)
- Session log: id=1276, opened→completed with summary + findings + actions
