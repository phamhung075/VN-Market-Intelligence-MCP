# BCTC Analyst — Notebook

**Last updated:** 2026-06-09 18:15 UTC (c037) | **Sprint:** BCTC-EXTRACT-QUALITY

## c035 · 2026-06-09T00:10Z
### Analysis Cycle (00:00–00:10 UTC) — mode: mixed
- E2 guard: PASS (00:00 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-4.
- Double-publish guard: claimed=true (bctc-slot-4:2026-06-09). Log ID: 1294.
- Mode: mixed. 1 routine (FPT) + 6 release BLOCKED (CTG/VCB/REE/NVL/D2D/TCH).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 7.05% CHEAP (+2.05pp). VN-Index 1790.53 (DOWN -48.37). Investment clock: Overheat (CPI 5.46%).
- Macro: Brent $94.33 NEUTRAL; Gold $4,341.6 BULLISH (risk-off); USD/VND 26127 BEARISH.
- FPT Q1-2026 routine: PE 13.8 vs sector 17.3 (-20%); PB 3.6; ROE 28.3%; EY spread +2.25pp FAIR. Net profit 2,476.8ty (19.8% margin). OCF -2,847.8ty seasonal. Balance imbalance=0. ESC: 1=F, 2=PASS, 3=DATA-COV-LIM (~1d TTL), 4=F. No escalation. trick_confidence=medium. F-score=5/9. Insider: clean.
- Release batch (CTG/VCB/REE/NVL/D2D/TCH): all get_bctc_full empty. CTG cycle 27+. RELEASE deferred.
- Legal: CMG/VNECO2 tax_penalty, PC1 arrest unresolved, VPB Lạng Sơn open.
- EIB governance: 3-4 HĐQT resignations (signal #5417, unresolved — carry).
- NVL: bond 5,000ty due 2026-09-15 (~99d). VPB: Lạng Sơn legal open.
- Signals: #5454 FPT (0.8), #5455 BATCH-BLOCKED (0.6). Bug: bctc-analyst-20260609T000800Z.json → po.
- Signal files: bctc_signal_FPT_20260609_routine.json, bctc_signal_BATCH_RELEASE_20260609_pending.json.

### Carry-over to c036 (next slot, 2026-06-09 15:00 UTC)
- CTG cycle 27+ CRITICAL: 4th consecutive escalation. dev-team fix MUST deploy.
- VCB/REE/NVL/D2D/TCH: PDFs stored, extraction blocked. RELEASE priority.
- EIB governance: unresolved — alert-commander ack pending.
- NVL: bond 5,000ty due 2026-09-15 (~98d). VPB: Lạng Sơn legal open.
- FPT ESC-3: DATA-COV-LIM guard TTL ~1d. Re-check at c036 — may expire.
- BĐS sector: VIC/VRE rate-sensitive headwind active. Monitor.

## c036 · 2026-06-09T15:15Z
### Analysis Cycle (15:05–15:15 UTC) — mode: mixed
- E2 guard: PASS (15:05 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-1.
- Double-publish guard: claimed=true (bctc-slot-1:2026-06-09). Log ID: 1302.
- Mode: mixed. 1 routine (FPT) + 24 release BLOCKED (pipeline lag cycle 28+).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 8.20% CHEAP (+3.20pp). VN-Index 1793.05 (UP +2.52). Investment clock: Overheat (CPI 5.46%).
- Macro: Brent $91.02 NEUTRAL (-3.51% session); Gold $4,354 BULLISH (risk-off); USD/VND 26128 BEARISH.
- FPT Q1-2026 routine: PE 13.8 vs sector 17.3 (-20%), ROE 28.3%, EY spread +2.25pp FAIR. Net profit 2,476.8ty (19.8% margin). OCF -2,847.8ty seasonal. Balance imbalance=0. ESC: 2=PASS, 3=DATA-COV-LIM GUARD-HELD (30d TTL ~29d rem). E3 cache hit — passes skipped. trick_confidence=medium. F-score=5/9. Insider: clean.
- Release batch (24 tickers): CTG (cycle 28+ CRITICAL), VCB/REE/NVL/D2D/TCH (cycle 3+), HPG/MBB/VPB/VHM/VRE/KBC/HCM/SSI/HVN/MWG/DPM/GVR/NKG/POW/VCI/VIC/PPC/PLX (cycle 1) — all get_bctc_full empty. PDFs stored 2026-06-07/08 (3.0–16.4 MB). RELEASE deferred.
- ACB (38%), EIB (31%), DHG (44%): below PUB-5 threshold. EIB governance unresolved (signal #5417).
- Legal: CMG/VNECO2 tax_penalty, PC1 arrest, VPB Lạng Sơn open. NVL bond 5,000ty due 2026-09-15 (~98d).
- Macro headwind: Brent -3.51% session — GAS/PLX energy sector pressure.
- Signals: #5533 FPT fundamental_validation (0.8), #5534 BATCH-BLOCKED (0.6).
- Signal files: bctc_signal_FPT_20260609_routine.json, bctc_signal_BATCH_RELEASE_20260609_pending.json.

### Carry-over to c037 (next slot, 2026-06-09 18:00 UTC)
- CTG cycle 28+ CRITICAL: 5th consecutive escalation. Pipeline fix UNRESOLVED.
- 24 tickers BLOCKED: structured extraction must unblock. Calendar shows all PDFs stored.
- ACB/EIB/DHG: PUB-5 low-conf pending re-extraction. EIB governance unresolved.
- NVL bond maturity risk (~98d). VPB Lạng Sơn open.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (30d TTL, ~29d remaining).
- Brent -3.51% session: GAS/PLX energy sector headwind. Monitor at c037.

## c037 · 2026-06-09T18:15Z
### Analysis Cycle (18:07–18:15 UTC) — mode: mixed
- E2 guard: PASS (18:07 UTC, outside [02:00,08:00)). Slot: bctc-analyst-slot-2.
- Double-publish guard: claimed=true (bctc-slot-2:2026-06-09). Log ID: 1307.
- Mode: mixed. 1 routine (FPT, E3 cache hit) + 29 release BLOCKED (CTG cycle 29+; VCB/MBB/HPG/VHM/VPB/VRE/KBC/D2D/NVL/TCH/REE/HVN/MWG/SSI/HCM/DPM/GVR/NKG/POW/VCI/VIC/PPC/PLX/HSG empty; ACB 38%/EIB 31%/DHG 44% PUB-5).
- Regime: NEUTRAL (carry +1.38pp). Max Deposit Rate: 5.00%. Market EY 8.20% CHEAP (+3.20pp). VN-Index 1793.05 (UP +2.52). Investment clock: Overheat (CPI 5.46%).
- Macro: Brent $90.06 NEUTRAL (-4.53% session); Gold $4,286.2 BULLISH (risk-off, -1.28%); USD/VND 26128 BEARISH.
- Context: gold -2.18σ, oil -2.07σ macro deviation alerts. BĐS: NVL -4.33%, VRE -1.69%, VIC -0.92%. Dầu khí: PLX -2.88%, GAS -1.79%. VN-Index đảo chiều phục hồi sau nhịp giảm sốc.
- FPT Q1-2026 routine: E3 CACHE HIT — passes skipped. PE 13.8 vs sector 17.3 (-20%); ROE 28.3%; EY spread +2.25pp FAIR. Net profit 2,476.8ty (19.8%). OCF -2,847.8ty seasonal Q1 (Q4 +4,108ty bình thường). Balance imbalance=0. ESC: 2=PASS, 3=DATA-COV-LIM GUARD-HELD (~28d). trick_confidence=medium. F-score=5/9. Insider: clean.
- Release batch (29 tickers): CTG cycle 29+ CRITICAL (filed 2026-06-09). VCB/D2D also filed 2026-06-09 — extraction still empty. All get_bctc_full empty or PUB-5 low-conf. RELEASE deferred cycle 29+.
- Legal carry: NVL bond 5,000ty 2026-09-15 (~98d). VPB Lạng Sơn. CMG/VNECO2 tax_penalty. PC1 arrest unresolved.
- Bond: NVL 5,000ty due 2026-09-15 (~98d, seed data — unverified market source).
- Signals: #5545 FPT fundamental_validation (0.8), #5546 BATCH-BLOCKED (0.6).
- Signal files: bctc_signal_FPT_20260609_routine.json (c037), bctc_signal_BATCH_RELEASE_20260609_pending.json (29 tickers).

### Carry-over to c038 (next slot, 2026-06-09 21:00 UTC)
- CTG cycle 29+ CRITICAL: filed 2026-06-09, extraction still empty. Pipeline fix MUST deploy.
- VCB (filed 2026-06-09), D2D (filed 2026-06-09): new filings, extraction pending.
- 29 tickers total BLOCKED. ACB/EIB/DHG: PUB-5 low-conf re-extraction needed.
- NVL bond maturity risk (~98d). VPB Lạng Sơn legal open.
- FPT ESC-3: DATA-COV-LIM GUARD-HELD (~28d remaining).
- Brent -4.53% session: GAS/PLX energy sector headwind active. Monitor.
