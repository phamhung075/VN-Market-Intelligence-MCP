# PO Notebook

## Cycle 2026-05-30T08:17Z — :07 dispatcher triage (Sat, HOSE closed)

**HARD LANE CONSTRAINT (user /goal):** apps/pdf-extractor OWNED BY PARALLEL SESSION this cycle. Whole BTB / BTB-DRIFT / BCTC-LAYOUT-FIRST / BCTC-AGENTIC-REFINE / PEK family OFF-LIMITS. No dev-pdf-extractor / ops-rebuild / qa of pdf-extractor. If only candidate = pdf-extractor => return NOTHING.

**Acknowledged-not-touched:** BTB-DRIFT chain (brief 2026-05-30-btb-drift-convergence.md + 06fb1f10 + e71f845d FPT 31u/4prose) DONE+committed, handed back to parallel session. BCTC-AGENTIC-REFINE umbrella (I kicked it off earlier this session, NEXT→ba) is multi-zone INCLUDING pdf-extractor => AR chain PAUSED this cycle, NOT driven into contended zone. Do not re-dispatch AR until lane released.

**BATCH dispatched (2 tasks, WIP=2, uncontended apps/mcp-server lane):**
- DPI-FU-A — restore fresh EFFR (fred_series_daily latest 2026-05-14, 15d stale => DPI-2b fedFundsRate degrades to fixture 5.33). Live-win.
- DPI-FU-B — restore market_earning_yield job (zero rows in tracked_indicators => DPI-2b earningYield degrades to fixture 8.2). Live-win.
- NEXT → dev-mcp-server (impl) → ops rebuild mcp-server (stale-image rule) → qa verify via in-container direct DB read (NOT push echo): EFFR fresh + earning-yield rows>0 + DPI-2b returns LIVE not fixture.

**Why FU-A/B over X-1 (HIGH):** X-1 is internal self-improve emit-path plumbing, no user-facing data. FU-A/B turn documented fixture-degrades into real live data the user sees TODAY — matches standing "trust = live tool data not fixtures" directive. Both same zone, same restoration nature => paired.

**Routed as signals (NOT BATCH):** D4-abort #3006/#3008 → agents-architect (transient read race, re-route carried fwd); /news #3004 + BCTC-filings #3007 → cowork (data-availability); TASKS.md >80L + signal-file bloat → janitor. #3011 BTB-OPS = parallel-owned, no action.

## Carry-over
- AR (BCTC-AGENTIC-REFINE) chain PAUSED — resume NEXT→ba only when pdf-extractor lane released by parallel session. Umbrella lock task:BCTC-AGENTIC-REFINE still claimed. User-LOCKED decisions in plan magical-cooking-cocoa.md (OCR=local Tesseract swappable, REPLACE outright, analyst feed=BOTH rows+refined).
- Next-tick backlog (uncontended mcp-server): SELF-IMPROVE-GATE X-1 (HIGH, top), CHEF-ATTN (MED), DPI-FU-C (MED test-debt: retro-own 36a91a59 + writeForeignFlowToOhlcv real-schema integration test). string-vs-enum HELD.
- FU-MON TIME-CRITICAL Monday: re-probe Brent/Gold delta post-06:00Z + get_foreign_flow(HPG) post-open → flip DONE or REOPEN.
- commit-mutex enum NOW VALID (task_kind enum has 'commit-mutex') — prior drift fixed.
- Scoped `git add <file>` only — working tree has MANY unrelated uncommitted files; NEVER `-A`.
- HOUSEKEEPING non-blocking: TASKS.md >80L, signal-file bloat → janitor; never block exit on it.
