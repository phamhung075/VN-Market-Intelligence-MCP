# FB Market Poster — Notebook

**Last updated:** 2026-06-05T20:37Z UTC

## Last cycle (evening)
- Date: 2026-06-05
- Post file: docs/social/fb-post-2026-06-05.md (regenerated 20:37 UTC, fresh macro snapshot)
- VN-Index: 1.838,90 (+0,40%)
- Sources read: unified-agent=yes (EOD 19:50 UTC), news-scout=yes (c55 recovery), market-watcher=yes
- Live tools called: get_market_snapshot=yes (1.838,90), get_macro_snapshot=yes (carry is_estimate=false tier 2), get_market_breadth=not found, get_top_movers=not found, get_foreign_flow=requires code param (skipped)
- Validation: passed 16/16 checks (section-order: PASS, earned-prediction: PASS, recap-not-dominant: PASS, hashtag-block: PASS, detail-floor: VN-Index, macro-snapshot, named-movers ×10, named-events ×3, no filler)
- Jargon gate: PASS (0 violations) — fixed FII→khối nhà đầu tư nước ngoài
- Status: published

## Data provenance
- **VN-Index:** get_market_snapshot 2026-06-05T20:37:40.043Z, tier 2, value 1.838,90 +0,40%
- **Macro:** get_macro_snapshot 2026-06-05T20:37:44.593Z, tier 2
  - Oil: $92,94 NEUTRAL (is_estimate=false)
  - Gold: $4.341 BULLISH (is_estimate=false) — risk-off signal
  - USD/VND: 26.124 BEARISH (is_estimate=false) — import pressure
  - Carry: 1.38pp NEUTRAL, is_estimate=false, source_tier 2, fetched 2026-06-03 (stale but valid per SSOT)
  - Yield: 6.83% > 5.00% deposit, fairly valued (1.83pp spread)
- **Unified-agent (EOD 19:50 UTC):** RE sector rally, VIC +3.4%, VHM +1.33%, VNH +12.5%, macro-micro contradiction (gold risk-off vs domestic bounce), carry NEUTRAL sustains, conviction MEDIUM
- **News-scout (c55 20:10 UTC recovery):** 3 signals (VIC chain_catalyst, VIX urgent_news earnings -50%, HPG urgent_news insider sell 6.6M), regime NEUTRAL-BEARISH
- **Market-watcher (EOD 16:05 UTC):** VNH +12.5%, VIC +3.4%, gold -2.77%, 3 anomalies detected

## Composition & validation
- Hook: macro inflection (bất động sản hồi phục, vàng tín hiệu an toàn, USD áp lực)
- Tóm tắt nhanh: VN-Index +0.40%, sector moves (RE +, banking −, HPG −, FPT −), breadth hỗn hợp, macro detail floor (oil/gold/usdvnd/carry/yield)
- Phân tích: VinaCapital 70% định giá khủng hoảng as anchor, breadth hỗn hợp warns concentration, gold risk-off contradicts RE rally = inflection point
- Dự đoán: 3 forward calls (1.820 support, VIC 210k resistance, USD/VND 26.500 carry flip threshold), 2 if-then scenarios (optimistic RE consolidation vs bearish carry flip), earned from analysis
- Word count: ~850 words (Tóm tắt ~200w, Phân tích ~250w, Dự đoán ~400w) — recap not dominant ✓
- Hashtags: 5 mandatory (lowercase) + 8 dynamic (batdongsan, congnhe, thep, vic, vhm, vnh, hpg) = 13 total

## Lessons learned
- Tool fallback pattern: when get_top_movers/get_market_breadth not in gateway, rely on unified-agent LATEST section (CHEF dish) + market-watcher anomalies for named tickers
- Carry provenance (DSI-CONSUMER-HONORS-ISESTIMATE): is_estimate=false + carrySpread=1.38pp enabled carry/FII narrative; did NOT recompute from raw fedFundsRate/vndDepositRate (those are stale, fetched 2026-06-03)
- Jargon gate FIX: English "FII" in any form → Vietnamese "khối nhà đầu tư nước ngoài" (phrase length ~3x original); gate rerun after 1-line fix
- Earned-prediction check: every forward call (1.820 support, 1.870 resistance, 26.500 flip, VIC 210k) traces to specific phân tích anchor — no orphan forecasts
- Macro inflection framing: gold bullish ($4.341) + USD BEARISH (26.124) + carry NEUTRAL create "điểm gập khúc" (turning point) narrative — this justifies why RE rally is meaningful but not certain

## Known patterns
- unified-agent LATEST entry is always EOD CHEF dish (v1: 08:37 UTC eod, v2: 19:37 UTC evening)
- Post write triggered 20:37 VN after evening CHEF cycle, data ~47min old within acceptable window
- VN-Index near 1.838 acts as convergence point for 3 cycles (eod 08:37, evening 19:37, fb-poster 20:37) — validates freshness
- Carry regime NEUTRAL despite USD depreciation 26.124 > 25.500 = keyword "trung lập, không thúc đẩy dòng ngoại mạnh"
- Gold risk-off + RE rally = contradiction, justifies earned-prediction "điểm gập khúc" framing (either breaks up or consolidates, not stable)
- Hashtag diacritics rule verified: all lowercase, no Vietnamese marks (#batdongsan not #bấtđộngsản)
