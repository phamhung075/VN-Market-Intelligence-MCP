# TNB Audit — Cycle 39 — 2026-05-12 02:47 UTC

## Overall: NEEDS_ATTENTION
Direction: **IMPROVING** (financial-analyst recovered c38→c39 — silence broken; alert accuracy +1 hit; 2 fresh chain catalysts; first read against new methodology lens v2026-05-11.2)

## Cycle context

This is the **first cycle to audit agents using methodology v2026-05-11.2 in earnest** (commit `0131dce8` from prior session). financial-analyst RECOVERED at 23:00 UTC after 4-day silence — c38 finding #3 RESOLVED. VN market just opened (02:00 UTC) so this cycle catches the open.

## Findings

| # | Issue | Agent/Module | Severity | Category | Evidence |
|---|-------|-------------|----------|----------|----------|
| 1 | financial-analyst BCTC opinions missing NI vs OCF comparison (Layer 7 Step G) | financial-analyst | high | flow-edit | 23:00 UTC cycle: VCB/FPT/HPG verdicts cite PE/ROE/EY_SPREAD only. No NI vs OCF comparison anywhere in 3 fundamental_validation signals (#2950/2951/2952). Catalogue: "BCTC opinion missing NI vs OCF comparison" — auto-cure if 3+ cycles. **Note:** Sprint 1885 (M-Score/F-Score) and Sprint 1878 (OCF column) still pending — agent CAN read OCF from vnstock cash-flow table today by direct fetch. Flow edit needed: add `get_cash_flow(ticker)` step before verdict. |
| 2 | financial-analyst missing cycle phase declaration (Layer 8 Step H) | financial-analyst | medium | flow-edit | 3 verdicts (FAIR/FAIR/FAIR-low-conf) issued without declaring Reflation/Recovery/Overheat/Stagflation phase. Investment Clock classifier (Sprint 1880) pending but agent can hand-classify today: PMI direction + CPI slope + Fed posture data already in macro snapshot. |
| 3 | unified-agent FPT pillar gap PERSISTS (carry from c38) — 2nd cycle | unified-agent | medium | tracking | Notebook still shows 22:01/23:01 daily reviews; no fresh cycle since c38. Agent fires 4× daily so next cycle expected ~02:01 UTC (just past). Defer to c40 to count 3rd cycle for auto-cure trigger. |
| 4 | financial-analyst tool-package gaps (PERSISTING from c33) | financial-analyst | low | flow-edit | `get_macro_snapshot` not in package (regime estimated), `get_insider_signals` requires per-stock outstandingShares, `get_bond_maturity_calendar` missing. Same gaps for 6+ cycles now. Was DEFERRED LOW; should re-evaluate as financial-analyst became active. |
| 5 | Alert accuracy marginal +1 hit (1→2/141, 35% scored) | verdict-pipeline | medium | carry | price_drop now 50% (2/4) was 25%. UNKNOWN 136→135. Slight verdict-resolution progress. VPB now 100% (1/1), HVN 33% (1/3). VHM/VRE still 0%. |
| 6 | 5 of 8 c36 findings still OPEN + 5 c38 carry-overs (Sprint 1869 deploy, MEMORY.md broken pointers, RSS degraded, write_alert_verdict missing, header drift trio, etc.) | meta | medium | carry | No movement on backlog this 4h window. |
| 7 | architect notebook header still drifted (carry from c38) | architect | low | flow-edit | Same forward-only-fix pattern. Header `2026-05-03 / Sprint 1839b` despite ARCH-1884 session entry written. |
| 8 | alert-commander notebook header still missing (carry from c38) | alert-commander | low | flow-edit | Same `Last updated: — / Sprint: —` despite continuing fresh cycles. |

## Auto-cures applied
- **None this cycle.** Findings #1, #2 are NEW (1st cycle of evidence). Finding #3 is 2nd cycle. Need 3rd cycle of evidence per protocol. Defer to c40.

## Persisting blockers
- 5 of 8 c36 findings still OPEN (1869 deploy, MEMORY.md pointers, market-watcher header, PO governance, RSS degradation)
- write_alert_verdict tool missing (now silently dropped — alert-commander stopped logging the error)
- get_recent_fixes 9d stale, get_unreviewed_market_messages 79k overflow
- Reuters/TE Ngưng 41 errors (Sprint 1862c-D OPS-gated)
- TNB-c33-F7 git HEAD.lock from Spotlight — recurring (cleared again this turn pre-emptively in c38 commit chain)
- PM-as-dispatcher governance still informal (since cycle 18)
- Forward-only fix pattern (#7, #8) — same root-cause class as architect c33-c37 regression

## Positive signals

- ✅ **financial-analyst RECOVERED** — c38 finding #3 RESOLVED. 3 stocks analyzed (VCB EY_SPREAD +2.39%, FPT EY_SPREAD +2.55%, HPG EY_SPREAD +2.34%). 3 signals posted. 4-day silence broken. **Sprint 1885/1886 ROI saved.**
- ✅ **2 fresh TNB chain catalysts** — VIC (Vingroup lawsuit win, BDS confidence rebuild, +86% conf) + FPT (institutional bottom-fishing, +2.00% session, foreign still selling). Both well-causally-chained. **news-scout still GOOD on Step C.**
- ✅ **Alert accuracy +1 hit** — 1→2 hits over 141 alerts. price_drop 25%→50%. Verdict pipeline slowly catching up on Sprint 1869 verdicts.
- ✅ **VN market opened** at 02:00 UTC (today is 2026-05-12 Tuesday). σ data was ready 382/30 across watchlist. detection chains armed.
- ✅ **Container stability HOLDS** — uptime now ~12h (8h57m at c38 + 4h gap). NO new restart pattern.
- ✅ **All 16 circuit breakers OK**, sources 14/16 healthy.
- ✅ **MARKET queue still near-empty** (1 message — BCTC-1345b VNM OCR corruption skip — auto-handled, expected).
- ✅ **Methodology v2026-05-11.2 driving NEW findings** (#1, #2 financial-analyst Layer 7/8 gaps would not have been flagged under prior 6-step methodology). Confirms upgrade is working as audit lens.

## Methodology audit (Layer 5, 9-step) — by agent

```
[Methodology] financial-analyst A=✓ B=✓ C=✓ D=n/a E=n/a F=2/4 G=✗ H=✗ I=✓ → NEEDS_ATTENTION (4/9)
  gaps: "BCTC opinion missing NI vs OCF comparison" + "Investment thesis missing cycle phase declaration"
[Methodology] news-scout         A=✓ B=✓ C=✓ D=n/a E=n/a F=n/a G=n/a H=n/a I=✓ → GOOD (4/4 effective, 5 n/a)
  (VIC + FPT chain catalysts with cause + transmission)
[Methodology] alert-commander    — N/A (no fresh cycle in window since c38; 21:02 UTC was last)
[Methodology] unified-agent      — N/A (no fresh cycle in window since c38; 23:01 UTC was last)
[Methodology] market-watcher     — pending (notebook fresh mtime 04:41 local but didn't read content this cycle for time-budget)
```

## Macro context (c38 → c39)

- Brent **+0.93** to 105.26 (mild oil rally continues)
- Gold -13.4 to 4737.80 (slight risk-on / safe-haven moderation)
- DXY +0.21 to 98.12 (mild USD strength, FII outflow pressure persists)
- US10Y 4.41% UNCHANGED (NEUTRAL)
- USD/VND 26,320 UNCHANGED (carry -0.33% FII_OUTFLOW_RISK persists)
- VN market OPEN since 02:00 UTC (intraday data starting to flow)

## Recommendation to PO

1. **Prioritize Sprint 1880 (Investment Clock + Pyramid classifiers)** — the cycle-phase gap (#2) on financial-analyst is the most acute Layer-8 finding and Sprint 1880 is GO-now S-effort. Fastest unlock.
2. **Add a flow-edit task to financial-analyst flow** — instruct it to call `get_cash_flow(ticker)` before issuing FAIR/CHEAP/EXPENSIVE verdicts. **This is a stop-gap until Sprint 1878 (OCF column) lands.** Catalogue auto-cure when 3rd cycle hits.
3. **Re-evaluate financial-analyst tool-package gaps** (#4) — agent now active, gaps from c33 persist. Worth a small addendum task to either add tools to package or deprecate the missing-tool branches.
4. **Bundle the 2 forward-only header drift fixes** (alert-commander + architect from c38) into one minor sprint — same root-cause class.
5. **Continue tracking unified-agent pillar gap** — c40 will be 3rd cycle of evidence if the next 02:01 UTC daily review repeats the FPT-without-pillars pattern.
