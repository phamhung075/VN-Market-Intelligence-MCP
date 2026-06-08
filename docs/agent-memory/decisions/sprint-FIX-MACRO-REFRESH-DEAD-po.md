
### STEP po-S1 · po · 2026-06-08T05:03:41Z
**task-id:** FIX-MACRO-REFRESH-DEAD
**what-done:** Raw-verified b7ce338f: C-09 macro half LIVE (get_macro_snapshot fetchedAt fresh, fedFundsRate=3.62, dataSource=live); found B-12 SBV half UNCOVERED (sbvRatesJob.ts:144-148 still swallows→returns, wrapRun records success-while-stale). Raised child FIX-SBV-REFRESH-SILENT-SWALLOW; left parent TODO for PM DONE-PARTIAL.
**what-considered:**
- Flip parent DONE now — REJECTED: over-claims, B-12 silent-swallow live (router-verify-raw lesson)
- Flip DONE-PARTIAL + raise B-12 child FIX — CHOSEN
- Re-open as single L sprint — REJECTED: C-09 verifiably done, only one-file mirror-fix remains (S)
**why-decision:** Two folded root causes; only one shipped+verified. Same silent-swallow class as the macro fix, isolated to one file → clean S child, keeps parent honest.
**why-change:** Carry-over planned full DONE if "B-12 AND C-09 PASS"; B-12 failed verification → split instead of close.
