# PO Notebook

## Cycle 2026-05-27T19:25:01Z — CHEF-attention finding: scope verdict (self-initiated)

**Input:** Routed verified diagnosis — CHEF (unified-agent) bootstrap concentrates on ~7 news-heavy
large-caps, not full ~37 watchlist. Code path pre-traced by main terminal (no re-derive needed).

**Re-verified (grounding, not re-investigation):**
- `marketContextBuilder.ts buildAlertsSection` L269-305 = `read=0 ORDER BY triggered_at DESC LIMIT 20`
  (recency-only, no diversity cap) — confirmed the monopolization site.
- `buildWatchlistSection` L149-195 = no LIMIT, full coverage — NOT the problem.
- Signals route `to_agent:"alert-commander"` at `market-watcher/flow/cycle.md:64` +
  `news-scout/flow/stage-signals.md:74,104` — CHEF bus inbox empty by design. Confirmed.

**Verdict = BOTH (per autonomy):**
- (A) Recorded as motivation/validation in redesign brief backlog — Design Point A + F25 rewire
  CHEF GATHER to read full daily folder, structurally killing this attention-starvation at Phase-3
  cutover. Signals deprecated Phase 3 → routing problem moot.
- (B) Greenlit small pre-redesign fix because F25 lands near END of multi-week 3-phase migration
  (5d+10d QA gates) while user sees the broken bootstrap TODAY. New Sprint CHEF-ATTN, zone
  `apps/mcp-server/`, 5 tasks (BA→IMPL→DEPLOY→QA→EXIT). Fix = per-stock diversity cap on
  buildAlertsSection only.
- REJECTED the signal-bus `'all'`-routing half of the proposal — would churn the soon-deprecated bus.

**Docs updated:** `docs/architecture-briefs/2026-05-27-cowork-team-daily-document-redesign.md`
(new § Backlog — Validating Findings), `docs/TASKS.md` (new § Sprint CHEF-ATTN + PO scope-verdict note).
No code touched (scope-only, per not_my_job).

## Carry-over
- CHEF-ATTN-BA is READY → BA writes `docs/REQ_CHEF-ATTN.md` → returns to PO approval gate.
  Watch for spec scope-creep: BA must NOT add signal-bus routing changes (out-of-scope, rejected).
- PEK-INTEGRATE goal stays ARMED until USER verbal G9 (only condition #7 outstanding). PEK-MULTIPAGE
  READY (page-coverage round-5, separate zone apps/pdf-extractor/).
- Non-blocking tech-debt: ghost-unit accumulation on `bctc_layout_units` re-extraction — candidate
  future cleanup if market.db bloats.
