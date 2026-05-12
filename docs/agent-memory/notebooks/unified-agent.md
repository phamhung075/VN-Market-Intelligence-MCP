# Unified Agent Notebook

> Archived prior to 2026-05-12 → docs/agent-memory/archive/unified-agent-archive-2026-05-12.md

Last updated: 2026-05-12 05:15 UTC | Sprint: current

## This Session
Market open cycle (2026-05-12). VN-Index recovery to 1,920+ (bullish open vs Mon close 1,895.5). FPT +0.57% partial recovery from 70,000. Gold reversed -5.38σ → +1.97σ (SPDR buying, risk-off pivot signal). Regime: TIGHTENING (unchanged, Brent 105.01, carry VND -33bp). Portfolio: FPT -12.3% (-49.5M VND), conviction STRONG 0.61 GIẢM BỚT. BCTC 7 banks (ACB/BID/CTG/EIB/MBB/VCB/VPB) due 2026-05-15 (3 days) — PRIORITY.

## Patterns
- get_system_status EOF appearing as recurring failure (2 consecutive, flagged in BUG 2843) — may need ops investigation
- price_drop alert precision chronic: 25-50% vs 60% threshold (BUG 2844, 2292 ongoing)
- BCTC OCR corruption pattern persisting: FPT and VNM Q4 both zero/near-zero confidence (BUG 2841, 2842)
- FII carry spread remains negative (-33bp VND) → sustained outflow risk for banking sector
- alert accuracy: 0.27% (1/369) — denominator fix in 1876a-A1, but data sample still tiny
- get_macro_snapshot NOT in unified-agent package → always set REGIME=UNKNOWN if macro not derivable from signals

## Carry-over
- BID: news impact (deposits -82,000B, FII selling) — monitor BCTC release 2026-05-15
- BUG 2843 (get_system_status EOF) and BUG 2844 (price_drop precision) unresolved — ops should claim
- BUG #2292 (alert accuracy 0.27%) open
- BCTC: 7 banks (ACB/BID/CTG/EIB/MBB/VCB/VPB) due 2026-05-15 in 3 days — HIGH PRIORITY
- git HEAD.lock pattern recurring — monitor, escalate if >4h

---

## Recent sessions — 2026-05-12

### Coordination Cycle (03:00–03:07 UTC) — 2026-05-12
- Mode: MARKET (open) | System: OK (all CBs green, vnstock RATE_LIMITED OIL/D2D/ACB transient/known, Reuters/TE offline persistent) | Alerts: 16 open (+1 NEW: HSG capital raise >8,000 tỷ MEDIUM)
- Regime: TIGHTENING (unchanged) | Alignment: 1.0 | Headwind: 0% (FPT=tech_export TAILWIND)

## Cycle — 03:00 UTC

- **cycle_date**: 2026-05-12
- **findings**: System OK. FPT 71,100 (+1.57%) recovery. HSG capital raise >8,000 tỷ NEW (news_mention 03:01). Conviction 0.55 GIẢM BỚT (shift -0.05 <0.3). FII: HOT_MONEY persistent. BCTC 3 days. Legal/Crisis CLEAR. Macro stable.
- **actions**: WORK telegram sent (03:07 UTC, clean). Notebook appended.
- **next_cycle_hint**: BCTC 7 banks due 2026-05-15. FPT recovery +1.57% — watch if sustained through session. FII pipeline still paused. HSG capital raise: monitor if conviction triggers on price reaction.
- **estimated_tokens**: 8500 (17 tool calls)

### Coordination Cycle (04:00–04:07 UTC) — 2026-05-12
- Mode: MARKET (open) | System: OK (all 13 sources ready, no rate limits) | Alerts: 20 open (10 in 6h window) | Quality issues: 1 new (price_surge 0% precision, filed MEDIUM)
- Regime: NEUTRAL (DXY 97.99 stable, US10Y 4.41% neutral, carry -0.33% FII_OUTFLOW_RISK) | Alignment: 1.0 | Headwind: 0% (FPT=tech_export TAILWIND)

## Cycle — 04:00 UTC

- **cycle_date**: 2026-05-12
- **findings**: System OK: 13/13 sources ready. Portfolio: FPT 5,000cp @ 80,300 → 70,400 (-12.3%, -49.5M VND). VaR 95% -0.1%. Conviction STRONG 0.61 GIẢM BỚT. Kinh Dịch Khôn (2) BUY. FPT TAILWIND in TIGHTENING (tech_export). Key price action: VRE +4.02% bounce, GAS +1.22% (oil +3%), HCM +1.45%, FPT +0.57%. Banking all red. FII: HOT_MONEY persistent. BCTC 7 banks due 2026-05-15 (3 days). Quality: price_surge precision 0% → feedback submitted [MEDIUM].
- **actions**: WORK telegram sent (04:06 UTC, clean). Bug feedback submitted. Notebook appended.
- **next_cycle_hint**: Banking BCTC due May 15. FPT recovery +0.57% at 04:01 — watch if holds. VRE +4% bounce — monitor for sustained reversal. FII outflow risk persistent.
- **estimated_tokens**: 8000 (16 tool calls)

### Coordination Cycle (05:00–05:15 UTC)
- Mode: MARKET | System: ok (bootstrap fallback — get_system_status EOF x2) | Alerts: 20 | Quality issues: get_system_status EOF (medium, filed)
- Regime: NEUTRAL | Alignment: 100% (FPT/tech TAILWIND) | Headwind exposure: 0%
- FPT: -12.5% (-50M VND) | RSI=25.8 oversold | Conviction 0.60 STRONG | Rec: GIẢM BỚT
- VRE +5.21% surge | GAS HIGH oil news | HCM -6.90% drop | HSG capital +8,000t | VIC VCBF exit
- BCTC: 24 tickers overdue 12d | Banks (ACB/BID/CTG/EIB/MBB/VCB/VPB) due 2026-05-15

### Coordination Cycle (07:00–07:15 UTC) — 2026-05-12
- Mode: MARKET (open) | System: OK (all 16 CBs green, get_system_status 1st call failed/retry ok, Reuters/TE 26 errors ongoing, foreign-flow fallbacks exhausted) | Alerts: 20 open | Quality issues: price_drop precision 20% (<60%)
- Regime: NEUTRAL (DXY 97.99, US10Y 4.41%, carry -0.33% FII_OUTFLOW_RISK) | Alignment: 1.0 | Headwind: 0% (FPT=tech_export TAILWIND)

## Cycle — 07:00 UTC

- **cycle_date**: 2026-05-12
- **findings**: FPT 70,400 (-12.3%, -49.5M VND), RSI 25.8 oversold, conviction MODERATE 0.55 GIẢM BỚT, below stop-loss 74,679. FII type=HOT_MONEY (carry -0.33% FII_OUTFLOW_RISK, tiền nóng co cụm, FPT -14,100 tỷ foreign outflow). Smart money accumulating (SGI Capital, cá mập). FPT Telecom compliance issue (POL pillar). BCTC: FPT Q1 overdue 12d; 7 banks due May 15 (3 days). GAS HIGH alert +2.17% (oil $105.43, geopolitics). Legal/Crisis clear. price_drop alert precision degraded to 20% (was 50% last week).
- **actions**: WORK telegram sent (07:13 UTC, clean + FII HOT_MONEY warning + BCTC alerts + quality flag). No conviction shift ≥0.3. Pillars: M2=✓ COC=✓ EPS=✓ POL=✓ (4/4).
- **next_cycle_hint**: Banking BCTC due 2026-05-15 (ACB/BID/CTG/EIB/MBB/VCB/VPB). FPT oversold RSI 25.8 — watch for reversal. FII outflow risk persistent. Monitor price_drop precision trend.
- **estimated_tokens**: 10000 (20 tool calls)

### Coordination Cycle (08:00–08:10 UTC) — 2026-05-12
- Mode: MARKET (closing 08:59 UTC) | System: OK (bootstrap ok, get_system_status connector error but infrastructure live) | Alerts: 20 open | Quality issues: alert accuracy 1% (ongoing)
- Regime: TIGHTENING (tentative, prev NEUTRAL) | Alignment: 1.0 | Headwind: 0% (FPT=tech_export TAILWIND)

## Cycle — 08:00 UTC

- **cycle_date**: 2026-05-12
- **findings**: FPT 70,600 (+0.86%, -12.1%, -48.5M VND). RSI 25.8 oversold. Conviction MODERATE 0.49 GIẢM BỚT. Kinh Dịch Kiển (39) GIU 48%. FII: HOT_MONEY (carry -0.33%, FPT most-sold). VRE +5.51% today (bull trap risk — Kinh Dịch THẬN TRỌNG 34%). GAS +3.94% (oil $106.2 +3%, US ATH). Banking all red (CTG -0.98%, VCB -0.66%). No legal/crisis signals. BCTC: 7 banks due 2026-05-15 (3 days). 24 other tickers 12d overdue. Supply chain stable. Signal effectiveness 0/7d. Alert accuracy 1% (2/381).
- **regime_transition**: NEUTRAL → TIGHTENING (Brent $106.2, inflation 8%, banks no rate cut, carry -0.33%) — pillar_count=2/4 (M2 missing, EPS missing) → NO conviction shift issued
- **actions**: WORK telegram sent (08:09 UTC). Notebook appended.
- **next_cycle_hint**: Market closes 08:59. BCTC banks due May 15. FPT oversold persists. VRE: monitor if +5% sustained. GAS: oil geopolitics driver. 23:00 UTC daily-review cycle next.
- **estimated_tokens**: 7000 (14 tool calls)
- **Pillars**: M2=✗ (not available) COC=✓ (carry -0.33%, banks no cut, Brent $106) EPS=✗ (BCTC overdue 12d) POL=✓ (FPT Telecom compliance issue) → 2/4

### Coordination Cycle (13:00–13:05 UTC) — 2026-05-12
- Mode: OFF-SCHEDULE PROBE (market CLOSED) | System: OK (bootstrap live, get_portfolio_conviction connector error) | Alerts: 25 pending | Quality issues: none new
- Regime: TIGHTENING (unchanged, Brent $107.79) | Alignment: 1.0 | Headwind: 0%

## Cycle — 13:00 UTC

- **cycle_date**: 2026-05-12
- **trigger**: Off-schedule (13:00 UTC not in defined slot) — automated run
- **findings**: Market CLOSED (last prices 08:17 UTC). New post-market alerts: VIC/VHM/VCB 12:35 news_mention ("Thanh khoản giảm mạnh, thị trường xoay trụ?" — vneconomy). Bearish analysis: securities firm lowered VN-Index forecast due to external risks. Legal/Crisis: CLEAR. FPT unchanged: 70,600 (-12.1%, -48.5M VND), conviction 0.49 GIẢM BỚT, RSI 25.8 oversold. No conviction shifts triggered.
- **actions**: WORK telegram sent (13:05 UTC). Notebook appended.
- **next_cycle_hint**: BCTC 7 banks due 2026-05-15 (2 days — ACB/BID/CTG/EIB/MBB/VCB/VPB). Daily-review 23:00 UTC next. Monitor VN-Index rotation/liquidity theme overnight.
- **estimated_tokens**: 2500 (4 tool calls)
- **Pillars**: M2=✗ COC=✓ (Brent $107.79, carry -0.33%) EPS=✗ (BCTC overdue) POL=✗ → 1/4 (off-schedule probe, no conviction output)

### Coordination Cycle (14:00–14:09 UTC) — 2026-05-12
- Mode: MARKET (off-schedule 14:00 UTC, market CLOSED) | System: OK (all 16 CBs green, vnstock rate-limit WARN on ACB/VCB/SSI, news sources degraded but last push 1.5h ago) | Alerts: 17 open | Quality issues: price_drop 17%, price_surge 33% (<60%) → feedback filed

## Cycle — 14:00 UTC

- **cycle_date**: 2026-05-12
- **findings**: Market CLOSED (prices as of 08:17 UTC). REGIME=NEUTRAL (corrected: DXY~98, US10Y NEUTRAL, Carry -0.33% per yesterday digest). FPT 70,600 (-12.1%, -48.5M VND), conviction 0.49 MODERATE GIẢM BỚT, RSI 25.8 oversold, Kinh Dịch Kiển(39) GIU 48%. Brent $107.94 (+2.23σ HIGH). No legal/crisis signals. Supply chain stable. Energy grid normal. 97% alerts unreviewed (unknown accuracy). Banking BCTC deadline 2026-05-15 (3 days: VCB/BID/EIB/MBB/ACB/CTG/VPB). FPT BCTC Q1 overdue 12d. VCBF + whale exiting VIC, holding FPT. SGI Capital accumulating FPT.
- **actions**: WORK telegram sent (14:09 UTC, clean + methodology flags). Feedback filed: alert_quality MEDIUM. No conviction shifts.
- **next_cycle_hint**: BCTC banks due 2026-05-15 (ACB/BID/CTG/EIB/MBB/VCB/VPB) — EPS pillar event. FPT oversold RSI 25.8. Daily-review 23:00 UTC next.
- **estimated_tokens**: 10500 (21 tool calls)
- **Pillars**: M2=✗ (data not available) COC=✓ (carry -0.33%, Brent $107.94 inflationary) EPS=✓ (BCTC overdue but SGI Capital accumulating = implicit bullish EPS view) POL=✗ → 2/4 [Methodology gap logged]

### Coordination Cycle (15:01–15:08 UTC) — 2026-05-12
- Mode: MARKET (off-schedule 15:00 UTC, market CLOSED) | System: OK (all 16 CBs green, CTG rate-limit WARN vnstock, RSS degraded/flowing) | Alerts: 17 open | Quality: 22% accuracy < 60% → feedback filed HIGH

## Cycle — 15:00 UTC

- **cycle_date**: 2026-05-12
- **trigger**: Off-schedule (15:00 UTC not in defined slot) — automated run
- **regime_transition**: NEUTRAL → TIGHTENING (Brent $107.89 +2.23σ, Inflation 8%, SBV 5%, Carry -0.33%)
- **findings**: Market CLOSED. VN-Index recovered to 1,909 (from 1,896 morning open, -1.04%). FPT 70,600 +0.86% today, conviction 0.49 MODERATE GIẢM BỚT, Kinh Dịch Kiển(39) GIU 48%, RSI 25.8 oversold. ALIGNMENT_SCORE=1.0 (FPT=tech_export=TAILWIND). Key FPT signals: FPT Telecom regulatory risk (POL), VCBF+whale holding FPT (bullish institutional). BCTC Q1 overdue 12d (all watchlist). Banking BCTC deadline 2026-05-15 (3d: ACB/BID/CTG/EIB/MBB/VCB/VPB). No conviction shift ≥0.3. No legal/crisis signals. Prediction market: China/Taiwan 50.5% YES (neutral). Alert accuracy: 22% (score filed HIGH).
- **actions**: WORK telegram sent (15:05 UTC) with REGIME_TRANSITION. Feedback filed: alert_quality HIGH. Notebook appended.
- **next_cycle_hint**: Banking BCTC 2026-05-15 = EPS pillar trigger. Daily-review 23:00 UTC next. Monitor FPT RSI oversold recovery + Telecom regulatory outcome.
- **estimated_tokens**: 9000 (17 tool calls)
- **Pillars**: M2=✗ (not available) COC=✓ (Brent $107.89 +2.23σ, carry -0.33%, inflation 8%) EPS=∂ (BCTC overdue 12d, oversold RSI proxy) POL=✓ (FPT Telecom compliance risk) → 2/4 [Methodology gap logged to WORK]

### Coordination Cycle (16:01–16:10 UTC) — 2026-05-12
- Mode: MARKET (off-schedule 16:00 UTC, market CLOSED) | System: OK (25 alerts pending, all 11 API sources ready) | Alerts: 17 open (10 reviewed queue) | Quality: 22% accuracy < 60% (filed HIGH prior cycles)
- Regime: TIGHTENING (unchanged — Brent $107.51 +2.23σ, inflation 8%, carry -0.33%, DXY 98.35) | Alignment: 1.0 | Headwind: 0% (FPT=tech_export=TAILWIND)

## Cycle — 16:00 UTC

- **cycle_date**: 2026-05-12
- **trigger**: Off-schedule (16:00 UTC not in defined slot) — automated run
- **findings**: Market CLOSED. VN-Index closed 1,901 (+0.30% vs prev session 1,896). FPT 70,600 (-12.1%, -48.5M VND), conviction 0.49 MODERATE GIẢM BỚT, Kinh Dịch Kiển(39) GIU 48%, RSI 25.8 oversold. Top movers today: VRE +5.51% (bull trap risk, KD THẬN TRỌNG 34%), GVR +4.46%, GAS +3.94% (oil geopolitics). Banking all red. Post-market bearish: securities firm lowered VN-Index forecast (external risks). Evening summary: VIX 18.75, DXY 98.35, S&P500 7,367, Hang Seng 26,348. Legal/Crisis: CLEAR. Prediction market: China/Taiwan 50.5% YES (neutral). Supply chain stable. No new Telegram reports. No conviction shifts ≥0.3.
- **banking_bctc_alert**: ACB/BID/CTG/EIB/MBB/VCB/VPB Q1/2026 deadline 2026-05-15 (3 days) — EPS pillar trigger imminent.
- **actions**: WORK telegram sent (16:01 UTC). Notebook appended.
- **next_cycle_hint**: Daily-review 23:00 UTC next. Banking BCTC 2026-05-15 = EPS catalyst. FPT oversold RSI 25.8 — watch for post-BCTC reversal signal. VRE bull trap monitoring.
- **estimated_tokens**: 7000 (14 tool calls)
- **Pillars**: M2=✗ (not available) COC=✓ (Brent $107.51 +2.23σ, carry -0.33%, DXY 98.35) EPS=✓ (banking BCTC 3d out, SGI Capital accumulating FPT, BCTC overdue proxy) POL=✓ (FPT Telecom compliance risk) → 3/4

### Daily Review (20:02 UTC)
- Mode: DAILY_REVIEW | Freshness: news-stale(2.7h/>2h), others ok | Bugs: [BCTC-1345b VNM 2025-Q4 OCR corruption suspected]
- Alerts: 15/15 sent (2 HIGH: MACRO oil +2.23σ, GAS news) | System: ok | Rate limits: BDI exhausted, ACB once
- Key: VRE +5.21% surge, HCM -6.90% drop, VCBF reducing VIC / holding FPT, HSG capital increase >8k tỷ
- Feedback submitted: news freshness overage (low severity)

## Cycle — 20:02 UTC

- **cycle_date**: 2026-05-12
- **findings**:
  - System OK; 15 alerts (2 HIGH: MACRO Brent +2.23σ, GAS oil surge); news RSS 2.7h (minor overage)
  - BUG: BCTC-1345b VNM 2025-Q4 OCR corruption (conviction signal skipped)
  - Rate limits: BDI vnstock exhausted retries; market CLOSED as expected
- **actions**: Telegram WORK summary sent | freshness feedback submitted (low/other) | notebook committed
- **next_cycle_hint**: Monitor BDI rate-limit recovery; VNM BCTC OCR fix needed; watch VRE/HCM follow-through next session
- **estimated_tokens**: 3500

### Daily Review (23:01 UTC)
- Mode: DAILY_REVIEW | Freshness: prices-ok(market closed) | news-stale(5.7h/>2h) | Bugs: none new
- News: 10 items (3 bearish: VN-Index forecast downgrade, liquidity drop; 1 bullish: STB near-ceiling; 6 neutral) | Alerts: 0/0 | System: ok | Bugs: 0
- Telegram WORK sent | freshness feedback submitted (low/performance_issue) | no Telegram bug reports
- Key carry-overs: BCTC 7 banks (ACB/BID/CTG/EIB/MBB/VCB/VPB) due 2026-05-15 (tomorrow) — EPS catalyst. FPT oversold RSI 25.8. VRE +5.51% bull-trap risk. Bearish: securities firm cut VN-Index forecast.
