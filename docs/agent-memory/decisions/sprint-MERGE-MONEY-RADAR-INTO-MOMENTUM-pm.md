# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · pm

**Sprint goal:** One unified /dashboard/momentum surface carrying BOTH money-flow radar and momentum indicators — without homogenizing the two card contracts.
**Agent:** pm
**Started:** 2026-07-02T18:45:00Z

---

### STEP pm-S1 · pm · 2026-07-02T18:45:00Z
**task-id:** BA-MERGE-MONEY-RADAR-INTO-MOMENTUM
**what-done:** Decomposed BA spec (docs/handoffs/BA-MERGE-MONEY-RADAR-INTO-MOMENTUM.md, §11) into atomic dev-frontend work units. Ratified PM-RATIFY-1 (colocate money-radar DTO/parser/formatter/fetcher inside dashboard.momentum.tsx). Updated orch-state parent task row: next_agent → dev-frontend, decomposed_tasks metadata added.
**decomposition:**

**WU-1 (dev-frontend, READY):** Dashboard merge + Nav relabel + Test updates (AC1-AC8, one atomic commit)
- **Files touched:**
  - `apps/frontend/app/routes/dashboard.momentum.tsx` (expand: add FR-1 sections + FR-2.1/2.2 ported DTO/parser/formatter/fetcher/loader)
  - `apps/frontend/app/routes/dashboard.money-radar.tsx` (collapse: redirect-only per FR-2.3)
  - `apps/frontend/app/components/TopNav.tsx` (FR-4: relabel ANALYST_NAV[26] only; no count bump, no other entries touched)
  - `apps/frontend/app/__tests__/money-radar-cards.test.ts` (FR-2.4: import path ~/routes/dashboard.money-radar → ~/routes/dashboard.momentum; no assertion content changes)
  - `apps/frontend/app/__tests__/ind-p1-momentum-nav.test.tsx` (AC8: update 6 hardcoded "Động Lực P1" label assertions + DOM-render assertion to the new relabeled nav copy; SAME COMMIT as TopNav.tsx relabel, no red-test window)
  - `apps/frontend/app/__tests__/FE-HEADER-SSOT-top-nav.test.tsx` (verify: no changes expected — array length unchanged, no count assertions to update per AC5/§2)
- **Acceptance (AC1-AC8):**
  - AC1: `/dashboard/momentum` serves ONE page with all 8 cards (4 momentum + 4 radar) in labelled sections with per-card FreshnessBadge + source-link
  - AC2: Loader fetches both feeds via Promise.allSettled; one feed failure leaves other section rendering (per-section isolation)
  - AC3: Do-NOT-homogenize preserved (two distinct DTO/parser/formatter families, radar non-null on live data, momentum honest-NULL when blocked)
  - AC4: `/dashboard/money-radar` 302-redirects to `/dashboard/momentum`; api.money-radar.tsx still serves 200
  - AC5: TopNav.tsx ONE unified entry (relabel ANALYST_NAV[26] only); SSOT count comments 27/34 stay UNCHANGED; no unrelated nav entry touched
  - AC6: FIX-FE-HEADER-NAV-MONEY-RADAR confirmed superseded (not independently shipped)
  - AC7: tsc + full frontend test suite GREEN; money-radar-cards.test.ts assertions preserved/migrated (import path updated, assertion content unchanged); no momentum regression
  - AC8: ind-p1-momentum-nav.test.tsx 6 label assertions + DOM-render assertion updated to new relabeled copy in SAME commit as TopNav.tsx (no red-test window)
- **Scope:** ~2h (page merge + loader merge + nav relabel + 2 test updates in one atomic commit)
- **Dependencies:** None (frontend-only, no backend/mcp-server change)
- **Blockers:** None (all PO decisions locked in spec; all product constraints specified)
- **Risk:** Test-file churn (AC8 requires strict same-commit sequencing) — dev-frontend must land TopNav.tsx + ind-p1-momentum-nav.test.tsx in the SAME commit or CI goes red between commits (main-only, no branch safety valve)

**WU-2 (dev-frontend, OPTIONAL):** Coverage-map backfill (AC9, can be separate or folded into WU-1)
- **Files touched:**
  - `docs/data/frontend-data-coverage-map.json` (FR-5: append 4 new rows under page: "/dashboard/momentum" for radar scalars: score, components.foreign_accum_z_market, components.rel_vol_z_20, divergence.flag)
- **Acceptance (AC9):**
  - Closes pre-existing zero-coverage gap for money-radar (opened 2026-07-01 when Money Radar P0 shipped; no coverage-map rows backfilled)
  - 4 new rows follow existing momentum rows' shape: endpoint="/api/money-radar → <field>", sla="daily", asof="generated_at", l3b_status="WIRED"
- **Scope:** ~10min (JSON edit)
- **Dependencies:** None
- **Note:** BA recommends folding into WU-1 (same context, low-risk addition); pm accepts recommendation. WU-2 can be split to a follow-up task if pm/dev-frontend prefer smaller commit diff.

**pm-ratify-1 verdict:** RATIFY BA's recommendation to colocate money-radar DTO/parser/formatter/fetcher inside dashboard.momentum.tsx (not extracted to new app/lib/moneyRadar/ module). Reasoning: (1) Mirrors codebase precedent — momentum already imports formatZScore from sibling dashboard.indicator-gauges.tsx, both source pages already self-colocate DTO+parser+formatter+fetcher+component in one file; (2) Smaller diff, less architectural disruption; (3) Easier to RAW-verify (all imports contained in dashboard.momentum.tsx); (4) Non-blocking — either approach satisfies all ACs. FR-2.1 exports are unchanged (no merged DTO type; two distinct families remain); FR-2.4 import path change is identical either way.

**why-decision:** BA's spec is complete, comprehensive, and RAW-verified. Single-zone (apps/frontend/) + single dev-frontend + no architect step + no cross-service dependency makes decomposition straightforward. WU-1 is atomic (all interdependent changes land together, preventing red-test window per AC8 hard requirement). WU-2 is optional but folding recommended (~10-line JSON addition on a file WU-1 already opens). PM-RATIFY-1 colocate choice is codebase-consistent and lowest-risk implementation path.

**board-mutation:** Parent task (BA-MERGE-MONEY-RADAR-INTO-MOMENTUM) status=IN_PROGRESS (unchanged), next_agent=dev-frontend (changed from pm), decomposed_tasks=[WU-1, WU-2], parallel_dispatch=false (sequential in dev-frontend, same zone), WIP after dispatch = (current_wip_dev_frontend + 1). AC8 risk flagged in task description.

**qa-gate:** RAW-live verify per task-board row verification_gate (after dev-frontend ships + rebuild):
- (a) curl /dashboard/momentum → both card families render (radar non-null values present, momentum honest-NULL where blocking)
- (b) curl /dashboard/money-radar → 302 → /dashboard/momentum
- (c) grep rendered nav: ONE enabled anchor reaching merged surface, ZERO href='/dashboard/money-radar' entry
- (d) FE-HEADER-SSOT test + full frontend suite + tsc GREEN

**follow-ons (queued):** None. Sprint scope is complete with WU-1+WU-2.
