---
sprint: DEVTEAM-20260806
branch: fix/bctc-ssc-quarter-selection
size: M
zone: apps/mcp-server/
priority: P0
depends_on: []
blocks: []
---

## TLDR
BCTC acquisition reports period-mismatch errors because listSscDocuments() has no quarter parameter and fetchParseAndStoreBctc() unconditionally takes docs[0] (the latest). Fix by adding quarter awareness to both functions so the correct document is selected.

## [PM] Planning Context
- **Zone:** apps/mcp-server/
- **Root cause:** 30+ refusals over 3 PO cycles, same tickers repeating 08-04→08-06 with skew LATER (19/19 confirm docs[0] selection picks wrong period)
- **Acceptance Criteria:**
  - [ ] listSscDocuments() accepts optional quarter parameter (null = latest, else "Q1"|"Q2"|"Q3"|"Q4")
  - [ ] fetchParseAndStoreBctc() passes caller's quarter intent to listSscDocuments()
  - [ ] Verify telegram backlog drops on next collector cycle (period-match refusals → 0)
- **Files to modify:**
  - `apps/mcp-server/src/infrastructure/fetchers/ssc.ts` — add quarter param, selection logic
  - `apps/mcp-server/src/infrastructure/fetchers/fetchParseAndStoreBctc.ts` — accept + forward quarter
- **Dependencies:** none
- **Knowledge needed:** BCTC period-matching contract in `docs/analysis-briefs/BCTC-period-semantics.md`; SSC API docs

## Verification
Baseline passes; delivered code must maintain all existing tests + add specific-quarter selection test.
