# FB Market Poster — Notebook

**Last updated:** 2026-07-01T09:22:00Z UTC

## Last cycle (2026-07-01 DAILY)

- **Date:** 2026-07-01 (Wednesday)
- **Mode:** DAILY (Mon–Fri pipeline, mode-router evaluated VN_DOW=3)
- **Post file:** docs/social/fb-post-2026-07-01.md (1,129 words, PUBLISHED ✓)
- **VN-Index:** 1,867.21 (+0.39% = +7.2 points)
- **Sources read:** unified-agent=yes (5 sessions, EOD 08:45 UTC latest), news-scout=yes (c105 08:07 UTC), market-watcher=yes (08:09 UTC), digest-predict=yes (2026-06-24 catch-up, FPT/VPB resolution tracking)
- **chef_dish_available:** true — CHEF 08:45 UTC EOD dish qualified (3 clusters, layers 1–6 walked, partial L2 US macro gap noted)
- **TNB synthesis:** 
  - clock_phase=CORE_VN (investment score 8/10, GDP earnings +11.9%)
  - regime=NEUTRAL (cheap equity yield 7.05% vs 5% deposit, balanced by gold risk-off)
  - regime_confidence=MEDIUM (all 6 layers walked, L2 macro partial but carry 1.37pp stable, FII selective not strong)
- **Conviction calls:** 5 total examined; banking (4 tickers VCB/VPB/MBB/CTG) high-conviction, real estate (2 tickers VIC/VHM) low-conviction despite capex news, FPT/GAS medium-conviction
- **known_gaps:** breadth=190/120 confirmed ✓, liquidity_tybillion=17,183.8 ✓, foreign_net_tybillion=+2.5k (watchlist coverage only, not full exchange)
- **Validation:** passed all 16 checks (section-order: pass, earned-prediction: pass, recap-not-dominant: pass (Tóm tắt 25% vs Phân+Dự 75%), hashtag-block: pass with 13 tags, detail-floor: complete)
- **Live data spine:** per-ticker moves from live get_market_snapshot=yes for all movers; honest-gap tickers: none (all core watchlist live-fetched)
- **Jargon gate:** PASS (0 violations) — bash scripts/fb-jargon-gate.sh confirmed
- **Data-integrity gate:** PASS (0 violations) — bash scripts/fb-data-integrity-gate.sh confirmed
- **Privacy gate:** PASS (no portfolio/personal language detected)
- **Status:** published (dedup claimed, WORK notified, log closed)

## Key observations (2026-07-01)

**Market structure:**
- Banking sector breakout (ta_bb_breakout_up on all 4 majors VCB/VPB/MBB/CTG) aligned with GDP earnings +11.9% CHEF signal
- Real estate divergence: positive Vingroup capex news (metro, highway) but prices down (VIC -1.32%, VHM -2.04%) → signal of institutional profit-taking or TA weakness
- Tech recovery: FPT +3.85% recovered from prior -9.22% selloff (predict resolution: bearish thesis FAILED, FPT target 70.8 breached to 72.9)
- Liquidity concern: turnover -11.3% vs prior day + breadth positive (190 up) = market "tiết cung" (supply constraint) — waiting for next move

**Macro regime:**
- Gold down -0.85% to 3,991.2 (13-year record lows noted by news-scout) = risk-off signal
- Oil neutral at 72.26 (-1.49%) = no emergency commodity pressure
- USD/VND at 26,106 (VND depreciation, >25k threshold) = import cost pressure
- Carry 1.37pp stable = no hot money inflow pressure
- Equity yield 7.05% CHEAP vs deposit 5% = valuation supports selective entry

**Foreign flow:**
- Market-wide FII +2.5k net buy concentrated in REE (renewable energy/Vingroup linkage)
- Coverage: watchlist tickers only (97 instruments), not full 3,200-stock exchange
- Selective entry pattern confirms regime=NEUTRAL (not panic selling, not aggressive buying)

## Lessons from cycle

1. **Stale prediction carry-forward risk:** FPT predicted bearish on 2026-06-24 (horizon 5d → resolution 2026-07-01) with target 70.8. Actual: recovered to 72.9 intraday. Live snapshot at composition time (09:21 UTC) caught reversal — correct to downgrade conviction to trung_binh and note high distribution volume (1.16M shares). Next cycle: include *intraday price check* for any ticker with multi-session downtrend prediction.

2. **News vs technicals divergence:** Vingroup capex (metro/highway HCMC) is objectively bullish news, but VIC/VHM fell anyway. Market interpretation: profit-taking or institutional position reduction ahead of earnings confirmation. Teaches: separate "news sentiment" from "price action" — news alone insufficient for MUA conviction if technicals weak.

3. **Supply constraint signal validity:** Turnover -11.3% with positive breadth (190T/120G) is indeed "market waiting" not "dead money" — breadth ADL -10 (mild bearish) from market-watcher confirms. Did NOT falsely interpret as panic or euphoria. Signal used correctly to advise caution.

4. **Carry stability as regime anchor:** Carry 1.37pp has remained flat for 7+ cycles (news-scout c97–c105 span). High confidence in NEUTRAL regime classification. No need to second-guess macro pressure.

5. **L2 partial data acceptance:** CHEF noted L2_US_macro partial (carry proxy only, no PMI/EFFR), but cycle proceeded successfully. Carry proxy is valid for regime layer since `get_macro_snapshot` is authoritative on yield/spread. No recitation needed.

## Known patterns

- unified-agent EOD dish at 08:45 UTC: 5 sessions daily, latest is most current (read `[Session: 2026-07-01]` block marked `[LATEST]`)
- DAILY mode fires: 09:15 UTC Mon–Fri (16:15 VN), but manual dispatch this cycle at 09:22 UTC (within window)
- news-scout c105 (2026-07-01T08:07Z): 5 signals (Q2 earnings 9/10, gold bearish 10/10, Vingroup capex 3x, FPT Sendo, GAS decline)
- digest-predict (2026-06-24 catch-up): FPT/VPB bearish id=10/11 (resolution=2026-07-01 ← TODAY, outcomes will be recorded next cycle)
- Kinh Dịch rotation: Minh Di (bearish 64%, 2026-06-24) → Phong (favorable, 2026-06-25) → Khon (neutral 38%, 2026-07-01). Phase transitioning from indecision to consolidation.

## Previous cycles archive

- 2026-06-30: post written, post-market dispatch (15:23 UTC), DAILY mode, regime=NEUTRAL, CHEF shortcut Quẻ Phuc favorable
- 2026-06-29 and earlier: see git log for full history
