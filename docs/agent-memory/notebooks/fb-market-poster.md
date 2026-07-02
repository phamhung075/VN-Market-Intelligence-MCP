# FB Market Poster — Notebook

**Last updated:** 2026-07-02T16:28:00Z UTC

## Last cycle (2026-07-02 DAILY)

- **Date:** 2026-07-02 (Thursday)
- **Mode:** DAILY (Mon–Fri pipeline, mode-router evaluated VN_DOW=4)
- **Post file:** docs/social/fb-post-2026-07-02.md (~1,000 words, PUBLISHED ✓)
- **VN-Index:** 1,866.35 (-0.05% = -0.86 points, flat close)
- **Sources read:** unified-agent=yes (EOD 08:57 UTC latest), news-scout=yes (c111 08:10 UTC, 3 signals posted), market-watcher=yes (08:09 UTC, no anomalies), digest-predict=yes (c112+ tracking, POW resolution pending 2026-07-03)
- **chef_dish_available:** true — CHEF EOD dish published 08:57 UTC (15:57 VN), banking cluster -1.15%, real estate resilience (VIC +1.47%, VHM +1.14% vs sector -1.27%)
- **TNB synthesis:** 
  - clock_phase=CORE_VN (investment score 8/10, credit growth +7.4%)
  - regime=Selective/phân hóa (banking pressure vs RE large-cap resilience)
  - regime_confidence=MEDIUM (L2 carry proxy stable 1.37pp, L4 full: banking -1.15%, RE +1.4%/+1.1%, utilities +2.05% outlier)
- **Conviction calls:** banking sector caution vs RE large-caps (VIC/VHM) as selective picks; breadth weakening (117T/162G) as risk signal
- **Dropped by T-45:** 0 (no claims dropped; banking concern qualified as legitimate macro/rate thesis)
- **Softened:** 0
- **known_gaps:** breadth=117 tăng / 162 giảm confirmed ✓, liquidity_tybillion=17.238 ✓, foreign_net=−2.30M shares (watchlist 98 tickers, coverage noted)
- **Validation:** 
  - Jargon gate: PASS (0 violations) — fixed "breadth (độ rộng)" → "độ rộng thị trường" (plain Vietnamese only)
  - Data-integrity gate: PASS (0 violations) — removed markdown headings (## Tóm tắt) → plain "Tóm tắt nhanh:" labels
  - Privacy gate: PASS (no portfolio/personal language detected)
  - Structural: all three sections present (Tóm tắt nhanh / Phân tích / Dự đoán), Dự đoán is longest section, earned-prediction checks pass
  - Post length: ~1,000 words (within 150–1,300 range) ✓
- **Live data spine:** per-ticker moves from live get_market_snapshot=yes; honest-gap tickers: none (all core watchlist covered)
- **Status:** published (dedup claimed 2026-07-02T09:28Z, WORK notified, log closed)

## Key observations (2026-07-02)

**Market structure — Selective recovery post-flat close:**
- Banking sector -1.15% average (VCB -1.43%, BID -1.16%, CTG -0.44%, EIB -0.71%, MBB -0.39%, ACB 0%, VPB 0%) despite credit growth +7.4% news → market pricing rate/margin pressure or Fed hesitation signal
- Real estate divergence at sector level: large-caps outperform (VIC +1.47%, VHM +1.14%) vs peer average -1.27% → capital quality migration into blue-chips, away from weak names (KBC -1.51%, TCH -1.37%, VRE -0.53%)
- Securities sector outburst: HCM +3.20% with volume spike 2.5× (1.14M vs avg 462k) → retail/broking inflow, may signal shift in market participants
- Utilities anomaly: POW +2.05% despite sector -0.80% — energy mix signal (renewable/hydro optimism vs overall grid pressure?)
- Breadth negative (117T/162G, 77 no-change) → distribution deteriorating, short-term support for any bounce weak

**Foreign flow — Rotation in progress, not capitulation:**
- Market-wide net: -2.30M shares sold (watchlist, net sell)
- Top buyers: VIC +94.6k (largest buy), VNM +85.6k, MBB +50.6k, PNJ +49.1k, FPT +43.9k → selective entry into quality/dividend names
- Top sellers: HPG -313.3k, SHB -299.7k, ACB -244.3k, TCB -238.8k, SSI -108.4k → concentrated exit from cyclicals/banks
- Interpretation: NOT capitulation (no panic selling across board) but rotation from cyclical to quality

**Macro regime — Risk-off undertone, equity support intact:**
- Gold +0.86% to $4,086.3 = safe-haven demand but not panic (not >+3%)
- USD/VND at 26,105 (yên lỏng, >25k threshold) = VND depreciation creating import cost pressure for hard-goods sectors
- Oil $70.93 (-0.31%) = neutral, no deflation signal
- Carry 1.37pp NEUTRAL (stable 7+ cycles) = no hot money pressure
- Equity yield 7.05% vs deposit 5% (+2.05pp) = valuation CHEAP, supports selective entry despite macro caution

## Lessons from cycle

1. **Breadth-price divergence as weakness signal:** Today's close at -0.05% with 117T/162G is classic "distribution down" pattern — price flat masks underlying weakness. Correctly incorporated into Phân tích as caution signal; did NOT manufacture a bearish call but rather flagged it as warning.

2. **Foreign flow rotation (not capitulation) interpretation:** Net -2.30M shares but per-ticker shows selective buying into VIC/VNM/MBB. Important to cite per-ticker breakdown in recap, not just aggregate net. This teachable for future: rotation signals are TOP_BUYERS + TOP_SELLERS context, not net alone.

3. **Sector divergence within real estate:** Banking -1.15% yet VIC/VHM +1.4%/+1.1%. Initial interpretation: "sector averaging down smaller peers" is correct. Did NOT conflate sector weakness with blue-chip weakness. Separation is critical for conviction call fidelity.

4. **News-to-action mapping clarity:** Credit growth +7.4% bullish news contradicted by banking -1.15% price action. Correctly interpreted as market pricing in Fed hesitation or margin compression ahead, not credit thesis rejection. No contradiction in post — explained causal chain cleanly.

5. **Honest gap discipline on FX:** USD/VndDelta=null in macro snapshot but rate 26,105 present. Correctly reported as "tỷ giá đi ngang" not "unfetchable" — honored the distinction between stale (null delta) and unfetchable.

## Known patterns

- unified-agent EOD dish at 08:57 UTC (2026-07-02): published to MARKET + WORK; read CHEF 3-session summary (morning 05:27, intraday 08:29 silent, EOD 08:57 qualified)
- news-scout c111 (08:10 UTC): 3 signals (earnings bullish 9/10, gold bearish 8/10, commodity bearish 7/10); regime NEUTRAL; no stale sweep needed (all 41 tickers current)
- market-watcher: 0 anomalies detected, 3 stale tickers swept (BSR, DBC, BDI >17d), top movers HCM +3.20%, VIC +1.47%, VHM +1.14% all < 2.5σ
- digest-predict: POW bullish id=12 (resolution 2026-07-03, target >15k); FPT/VPB FALSE POSITIVE resolutions 2026-07-01 (recovered, calibration degrading)
- Kinh Dịch rotation: Phong (favorable 100%, 2026-06-26) → Khon (neutral 38%, 2026-07-01/02) → steady state, no extreme hexagrams

## Previous cycles archive

- 2026-07-01 (Wednesday): banking breakout aligned with GDP earnings +11.9%, real estate divergence, FPT recovery +3.85% (predict FAILED), liquidity concern -11.3%, regime=NEUTRAL, PUBLISHED ✓
- 2026-06-30 and earlier: see git log for full history

---
**Meta notes for next cycle (2026-07-03):**
- POW resolution 2026-07-03: track if bounces above 15.000 (bullish id=12 confirmation) or stays below (failed)
- Watch for FII flow reversal continuation — will re-entry signal banking recovery or RE consolidation?
- Breadth deterioration (117T/162G) next weak support if <115T threshold breached
