# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-frontend

**Sprint goal:** cowork guaranteed-slot catchup (ambient sprint id — this task is a BOUNDED-1 backlog pickup, unrelated in content to the sprint goal but stamped per §Resolve Sprint ID protocol)
**Agent:** dev-frontend
**Started:** 2026-07-25T13:35:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-07-25T13:35:00Z
**task-id:** FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY
**what-done:** Added denominator/staleness/breakdown/exclusion-reason context around the server-supplied hitRate on `dashboard.prediction-claims.tsx`; zero frontend recomputation of hitRate.
**what-considered:**
- Single-fetch, compute lastScoredAt from whatever `claims` array the current filter returns — simplest, but marker silently vanishes on "Đang chờ"/"Loại trừ" tabs since those filtered responses lack correct/wrong rows.
- Client-side-only outcome filtering (always fetch unfiltered, filter in JS) — breaks the established server-side `?outcome=` contract test (Suite 9), removes a real pagination-friendly design without being asked to.
- Double-fetch: always-unfiltered "context" call (calibration + lastScoredAt) + a second filtered call only when a filter is active — chosen, preserves 100% of existing URL-forwarding tests unmodified, keeps the banner correct on every filter tab.
**why-decision:** This is explicitly a trust-surface fix; a staleness marker that disappears exactly when the user filters to "Loại trừ" (the bucket that most needs explaining) would undermine the same trust the task exists to restore.
**why-change:** No change from board deliverables (a)-(e); the double-fetch is an implementation detail in service of deliverable (b) working correctly everywhere it renders, not new scope.

### STEP dev-frontend-S2 · dev-frontend · 2026-07-25T13:35:00Z
**task-id:** FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY
**what-done:** `claims[].exclusionReason` added as an OPTIONAL type field consumed defensively (resolveExclusionReason); no server change made or assumed.
**what-considered:**
- Wait for FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE deliverable (c) to ship the field first — rejected, that deliverable is explicitly NOT-YET-SHIPPED per PO ruling (standalone scope-narrowed to deliverable (a) only) and this row is deliberately independent.
- Only: add the field as optional now, consume-when-present/fallback-when-absent — matches the task's explicit instruction verbatim ("do not assume it is on every row").
**why-decision:** Live probe of GET /api/prediction-claims?outcome=excluded (2026-07-25T13:15Z) confirms zero rows currently carry the field — GENERIC_EXCLUSION_REASON is what every excluded claim renders today; the optional field is forward-compatible with no server dependency.
**why-change:** No change from plan.
