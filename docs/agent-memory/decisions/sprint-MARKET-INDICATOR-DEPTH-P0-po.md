# Decision Journal — Sprint MARKET-INDICATOR-DEPTH-P0 · po

**Sprint goal:** Add 5 P0 indicator families + breadth time-series (zero-new-fetch / already-fetched, strict no-fake-data) to give the helper/analyst agents a deeper risk-normalized market read. From the VERIFIED 56-agent indicator roadmap §5.
**Agent:** po
**Started:** 2026-06-29T20:18:13Z

---

### STEP po-S1 · po · 2026-06-29T20:18:13Z
**task-id:** BA-INDICATOR-DEPTH-P0
**what-done:** Persisted the verified indicator roadmap to docs/roadmaps/vn-market-indicator-roadmap.md and kicked off sprint MARKET-INDICATOR-DEPTH-P0 (sprint_goal entry + BA task → ready[] + head→ba + 21 P1/P2 backlog rows).
**what-considered:**
- Lift the BA→architect→pm gate (FRONTEND-HUB / FB-COWORK precedent) since analysis is pre-verified
- Run the FULL cascade (user directive: "via your normal cascade BA spec → architect → pm")
**why-decision:** Ran FULL cascade — these are genuinely NEW analytical features (new MCP tools + a backfill), not a composition-only restructure; spec + blueprint are load-bearing and the no-fake-data gate must be encoded per-FR. po_signoff left PENDING (will review BA spec via review-ba-spec.md).
**why-change:** No change from directive.

### STEP po-S2 · po · 2026-06-29T20:18:13Z
**task-id:** BA-INDICATOR-DEPTH-P0
**what-done:** Scoped Sprint-0 (OHLCV backfill, 450-row queue exists) IN as the first-sprint prerequisite; recorded P1 (16) + P2 (4) as PLAN-ONLY BACKLOG rows; left REJECTED items (roadmap §4) OUT of the board entirely.
**what-considered:**
- Mint every roadmap item (incl. rejected) as backlog rows
- Mint only buildable P1/P2; keep rejected as a DO-NOT-BUILD ledger in the doc
**why-decision:** Rejected items would require fabrication (fail no-fake-data) — they are not work, so they stay in roadmap §4 only. † items carry gated:"OHLCV-backfill" notes (no `depends` array → avoids dangling-ref validation). Fear&Greed gauge tagged build-last (composes P0/P1 legs).
**why-change:** No change from roadmap.
