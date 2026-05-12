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
