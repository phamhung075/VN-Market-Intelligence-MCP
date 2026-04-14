# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Current Sprint — 079 (ACTIVE)

**Goal:** Restore data pipeline integrity — fix the two root causes that make the evening report produce empty content: VPS push-prices not persisting to `market_prices` table (1193) and BCTC extraction leaving `financial_reports` empty despite PDFs on disk (1196). Also clear the highest-signal domain bugs before the banking BCTC deadline.

**Scope:**
- IN: Task 1193 (prices not persisting), Task 1196 (BCTC extraction broken), Task 1201/1202 (Banking BCTC Q4-2025 — deadline 14/04), Task 1215 sign-off (already merged, needs QA report)
- OUT: New features, UX changes, Kinh Dich layer, Prediction Synthesizer (those are next sprint)

**Success metric:** Evening report on 2026-04-14 contains at least 5 watchlist movers and 3 stories. BCTC extraction for BID/VCB/FPT/HPG shows non-zero values in `financial_reports`. Task 1215 archived as Done.

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 078 | Evening summary empty-content fallback (1192) + bug dedup (1215) | COMPLETE 2026-04-14 |
| 077 | Trading Economics RSS fallback chain (1191) | COMPLETE |
| 076 | Pipeline watchdog job | COMPLETE |
