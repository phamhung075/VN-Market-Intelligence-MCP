# PO Notebook

## Carry-over (next cycle)
- **BCTC-CTG-FLEET-SERVE-SPIKE — OPENED 2026-06-12T20:30Z (→architect SPIKE).** RAW-verified `get_bctc_full(CTG)` STILL "Chưa có dữ liệu BCTC" + `get_recent_fixes(15)` has NO bug#2776 → bctc-analyst cycle-14 escalation (signal 2787) is ACCURATE; board over-claims. FIX-CTG-1/2/3 + FU-CTG-REFINE-PICKUP all DONE/SUPERSEDED yet live empty 7+ days on a top-5 bank → recurring-bug → architect, not another point-fix. Scope: why refine→serve never materializes CTG row 69fa303f (PUB-1/PUB-3 withhold), fleet class CTG/VCB/D2D + 28 tickers (signal 2776). Output = findings doc. zone=apps/mcp-server/ (+ refine path). Journal po-S3.
- **FU-SCHEMA-DRIFT-P8-IMPL [REWORK] — do NOT dispatch.** Dispatcher framed it "dispatchable" once CI-RED preempt lifted, but task content = DDL-DEFAULT hypothesis DISPROVEN (4th consecutive fail, +2 WORSE); cluster PARKED best-effort-exhausted per path-B; 629=schema-drift FLOOR; "No 7th touch"; superseded by FU-CI-PROFILE-629. PARK upheld. Journal po-S4.
- **RLI-FORENSICS-CLEANUP — DEFER to 2026-06-14.** Date-gated retention cleanup (~670MB bak/dump); dispatch ONLY 06-14 after live DB integrity_check=ok. Not dispatchable today. Journal po-S5.
- **CI-RED-8081e584-FIX — DONE (do not reopen).** QA commit 196281e4; fixes 7e341981+8a2ef725; CI green on 8a2ef725 (gate met). Closes preempt note.
- **CONTAM-9 / OHLCV contam — do NOT reopen.** Report id=3135 (69 rows 06-12) = signal CONTAM-9 (commit 6657fc3e) addresses; ops rebuild in-flight, QA next.

## Cycle log
- 2026-06-12 po-S3/S4/S5 (dev-team triage tick 203056Z): pendingSignals[] pre-drained by dispatcher (ci_red×2 dedup/superseded, context_bloat×3 already→claude-manager-helper). Telegram 13 unresolved: BCTC-1345b low-conf spam (FIX-BCTC-1345B-REPORT-BATCH backlog), pollNews 0-items (VPS, ops cron), ohlcv contam id=3135 (CONTAM-9 in-flight), orphan-lock D4 (LET-EXPIRE), chef arg-shape id=2779 (cowork zone, RECURRING — CHEF-ATTN active). **NET-NEW: BCTC-CTG-FLEET-SERVE-SPIKE** — RAW-proved CTG serve empty 14 cycles despite 4 DONE fixes → architect SPIKE. P8-IMPL PARK upheld (do not dispatch). RLI-FORENSICS DEFER 06-14. RETURN BATCH([SPIKE]), PIPELINE=continue.
- 2026-06-12 po-S1/S2 (triage 192519Z): opened CI-RED-8081e584-FIX (now DONE); TNB c93 ACK; orphan-lock LET-EXPIRE.
- 2026-06-12 po-S2 (FE-CORPEVENTS-TICKER-FILTER): SIGN-OFF APPROVED+DONE (17/17 live DOM).
- 2026-06-12 po-S1 (QUE-REFERENCE-PAGE): OPEN, zone=multi→dev-frontend.
- 2026-06-11 SHIP-WAVE-REAUDIT: OPEN + spec APPROVED → architect.
