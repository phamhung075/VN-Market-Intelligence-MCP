# PO Notebook

_Last: 2026-06-29T20:18Z_

## This cycle — KICKOFF: MARKET-INDICATOR-DEPTH-P0 (verified indicator roadmap → first sprint)

User directive: "more indices / deeper analysis so the helper (analyst) agents analyze better." A VERIFIED 56-agent gap analysis (supply-vs-demand mapped, every proposal adversarially checked vs the STANDING no-fake-data rule + VN data reachability) was already done — NOT re-done.

**Persisted roadmap** → `docs/roadmaps/vn-market-indicator-roadmap.md` (new dir). 37 kept / 2 dropped; §3 P0/P1/P2, §4 DO-NOT-BUILD (fabrication-risk), §5 first sprint.

**Kicked off `MARKET-INDICATOR-DEPTH-P0`** (sprint_goal.entries + board, one atomic orch-apply write):
- Sprint-0 OHLCV backfill (450-row queue exists; ~2yr daily bars VN-Index+watchlist via VPS dchart) = the single unlock for all † items.
- 5 P0 in order: Volatility Primitives (dev-technical-analysis) → Foreign-Room Saturation (dev-stock-price+mcp) → SBV OMO Curve (dev-macro) → News-Sentiment Z (dev-rag/mcp) → Insider Net Sentiment (dev-mcp) + Breadth Time-Series (forward-accruing, accruing_since, NO backfill).
- BA task `BA-INDICATOR-DEPTH-P0` → ready[]; head→ba; **FULL cascade IN EFFECT** (gate NOT lifted — genuinely new features; po_signoff PENDING BA spec review).
- 21 backlog rows minted PLAN-ONLY: `IND-ROADMAP-LEDGER` + 16 `IND-P1-*` + 4 `IND-P2-*`. † items carry gated note (no depends array → no dangling ref). Fear&Greed = build-last. Rejected items NOT on board (roadmap §4 only).

**Lessons applied:** no-fake-data (every FR computed from on-hand/already-fetched only) · orch-apply gated write (jq bug: `$ids|index(.id)` rebinds `.` to the array → bound the row first) · sprint-kickoff full-cascade vs composition-only gate-lift.

---
## Carry-over
- NEXT: ba writes the requirement spec (ready[] BA-INDICATOR-DEPTH-P0); returns to PO for review (po/review-ba-spec.md) before architect.
- Sprint umbrella lock `task:MARKET-INDICATOR-DEPTH-P0` claimed (sprint-task, ttl 3600).
- 3 pre-existing intra-backlog dup ids (FIX-FB-GATE-* / FIX-FB-JARGON-*) — NOT mine, separate triage.
- HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING (prior cycle) — router-tracked.
