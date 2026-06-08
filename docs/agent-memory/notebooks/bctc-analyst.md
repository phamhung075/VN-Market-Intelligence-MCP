# BCTC Analyst — Notebook

**Last updated:** 2026-06-08 18:10 UTC (c033) | **Sprint:** BCTC-EXTRACT-QUALITY

## c031 · 2026-06-08T15:00Z
### Analysis Cycle (15:00–15:10 UTC) — mode: mixed
- E2 guard: PASS (15:00 UTC, outside [02:00,08:00))
- MCP gateway RESTORED (c030 blockage cleared). Double-publish guard claimed (bctc-slot-4:2026-06-08).
- Mode: mixed. 1 routine (FPT) + 22 release blocked (pipeline lag cycle 2; CTG cycle 22).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Investment clock: CORE_VN (score=8, Overheat CPI 5.46%).
- Macro: Brent $95.44 NEUTRAL (+5.4σ EXTREME alert); Gold $4,365.9 BULLISH (+5.27σ EXTREME alert); USD/VND 26124 BEARISH. Market EY 8.20% CHEAP. VN-Index 1838.9 (STALE 2026-06-05).
- FPT Q1-2026: PE 13.8 (sector 17.3, -20%), PB 3.6, ROE 28.3%. EY spread +2.25pp → FAIR. Net margin 19.8%. OCF -2,848ty (ratio -1.15, Q1 seasonal). trick_confidence=medium.
- ESC: 1=F, 2=PASS(0.0001%), 3=DATA-COV-LIM (guard ~4d TTL), 4=F, 5=F. No escalation.
- Legal: CMG/VNECO2 (tax_penalty), PC1 (chairman arrest unresolved), VPB (Lạng Sơn audit). NVL bond 5,000ty due 2026-09-15.
- Signals: #5332 FPT (0.8), #5333 BATCH-22 (0.6). Log ID: 1281.

### Carry-over to c032 (next slot, 2026-06-08 18:00 UTC)
- 22 release tickers blocked: extraction pipeline lag. CTG at cycle 22. RELEASE priority.
- ACB/DHG/EIB: PUB-5 blocked. NVL: bond 5,000ty due 2026-09-15. VPB: Lạng Sơn legal.
- FPT ESC-3: DATA-COV-LIM guard held (~4d TTL).

## c032 · 2026-06-08T18:00Z
### Analysis Cycle (18:00–18:15 UTC) — mode: mixed
- E2 guard: PASS (18:00 UTC, outside [02:00,08:00))
- Double-publish guard: claimed=true (bctc-slot-1:2026-06-08). Log ID: 1286.
- Mode: mixed. 1 routine (FPT) + 3 NEW release tickers (CTG filed 2026-06-08, NVL filed 2026-06-08, REE filed 2026-06-08).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 7.05% CHEAP (+2.05pp). VN-Index 1790.53 (DOWN -48.37 — broad sell-off).
- Macro: Brent $94.36 NEUTRAL; Gold $4,346.5 BULLISH (safe-haven risk-off); USD/VND 26127 BEARISH. Investment clock: CORE_VN score=8.
- Market context: broad sector sell-off 2026-06-08. Banking -2.18% avg (ACB -3.44%, VPB -3.21%); Steel -2.46%; BĐS VIC -5.80%, VRE -5.13%, VHM -3.49%; Tech FPT -2.80%. EIB: 3-4 HĐQT members resigned (news_mention alerts 11:32+15:00).
- FPT Q1-2026 routine: PE 13.8 (sector 17.3, -20%), PB 3.6, ROE 28.3%. EY spread +2.25pp → FAIR. Net margin 19.8%. Balance imbalance=0. OCF -2,848ty seasonal. trick_confidence=medium (cashflow-v1 flagged). ESC: all F/DATA-COV-LIM. No escalation.
- CTG/NVL/REE: PDFs stored (CTG 6.0MB, NVL 1.9MB, REE 3.3MB Q1-2026) but get_bctc_full empty. CTG cycle 23, NVL cycle 2, REE cycle 1. DATA_INSUFFICIENT. RELEASE deferred.
- Legal: CMG/VNECO2 tax_penalty ongoing. PC1 chairman arrest unresolved. VPB Lạng Sơn audit open. EIB governance event (3 HĐQT resignations today).
- Signals: #5400 FPT fundamental_validation (critic 0.8), #5401 BATCH-CTG-NVL-REE (critic 1.0). Log ID: 1286.
- Signal files: bctc_signal_FPT_20260608_routine.json, bctc_signal_BATCH_20260608_pending.json

### Carry-over to c033 (next slot, 2026-06-08 21:00 UTC)
- CTG/NVL/REE: RELEASE priority. CTG cycle 24 if still blocked — pipeline fix escalation needed.
- EIB: HĐQT 3 member resignations today — governance risk. ACB/DHG/EIB PUB-5 still blocked.
- NVL: bond 5,000ty due 2026-09-15 (~99d). VPB: Lạng Sơn legal risk open.
- FPT ESC-3: DATA-COV-LIM guard held (~3d TTL). trick_confidence=medium carry.
- BĐS sector: VIC -5.80%, VRE -5.13% — rate-sensitive headwind active. Monitor.

## c033 · 2026-06-08T18:10Z
### Analysis Cycle (18:07–18:20 UTC) — mode: mixed
- E2 guard: PASS (18:07 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2.
- Double-publish guard: claimed=true (bctc-slot-2:2026-06-08). Log ID: 1290.
- Mode: mixed. 1 routine (FPT) + 6 release BLOCKED (CTG/VCB/REE/NVL/D2D/TCH).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 7.05% CHEAP. VN-Index 1790.53 (DOWN -48.37).
- Macro: Brent $94.44 NEUTRAL; Gold $4,362.4 BULLISH; USD/VND 26127 BEARISH. Investment clock: CORE_VN score=8.
- FPT Q1-2026 routine: PE 13.8 vs 17.3 (-20%), ROE 28.3%, EY spread +2.25pp FAIR. OCF -2,848ty seasonal. Balance imbalance=0. ESC: 1=F, 2=PASS, 3=DATA-COV-LIM (~3d TTL), 4=F, 5=F. No escalation. trick_confidence=medium. Kinh Dich unavailable (URL error).
- Release batch (6 tickers): CTG/VCB/REE/NVL/D2D/TCH all get_bctc_full empty (pipeline lag cycle 25+ for CTG). PDFs stored. ACB/EIB PUB-5 blocked (conf 31-38%). RELEASE deferred again.
- CTG partial: vector store shows LNST 8,960ty, doanh thu 3,910ty (unverified structured path).
- EIB GOVERNANCE CRITICAL: 3-4 HĐQT resigned 2026-06-08 (count discrepancy 3 vs 4 sources). Signal #5417 posted.
- Legal: CMG/VNECO2 tax_penalty, PC1 arrest unresolved, VPB Lạng Sơn open.
- Signals: #5416 FPT (critic 1.0), #5417 EIB governance (critic 0.8), #5418 BATCH-BLOCKED (critic 0.8).
- Signal files: bctc_signal_FPT_20260608_routine.json, bctc_signal_BATCH_RELEASE_20260608_pending.json.

### Carry-over to c034 (next slot, 2026-06-08 21:00 UTC)
- CTG cycle 25+: URGENT pipeline fix escalation. dev-team must unblock extraction.
- VCB/D2D/TCH: NEW filings 2026-06-08, PDFs stored, extraction blocked. RELEASE priority.
- ACB/EIB PUB-5 blocked. EIB governance event unresolved.
- NVL: bond 5,000ty due 2026-09-15 (~99d). VPB: Lạng Sơn legal open.
- FPT ESC-3: DATA-COV-LIM guard held (~3d TTL remaining).
