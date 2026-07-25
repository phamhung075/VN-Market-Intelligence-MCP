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

### STEP dev-frontend-S3 · dev-frontend · 2026-07-25T14:03:34Z
**task-id:** FE-PG-QUALITY-AUDIT-LASTVERIFIED-RENDER-FIX
**what-done:** Added per-check `last_verified` + 7d staleness badge to `dashboard.quality-audit.tsx` via new `app/domain/formatters/check-verification.ts`, wrapping the existing `classifyStaleBadge`.
**what-considered:**
- Inline the typeof-guard + threshold directly in the route file — smaller diff, but breaks this zone's own `ddd_layers: strict` rule and the `isStale`/`classifyStaleBadge` precedent (both live in `app/domain/`, both single-call-site, both independently unit-tested).
- New domain wrapper reusing `classifyStaleBadge` (chosen) — zero duplication of the date-parsing logic that already tolerates all 4 live shapes (bare/sec/ms/µs — verified via `new Date()` on all 4 in node before writing code); only new logic is the `typeof rawLastVerified === "string"` runtime guard, needed because `parseQualityChecklistDto` is an unchecked pass-through cast so `last_verified` is `unknown` at the type boundary.
**why-decision:** `classifyStaleBadge` already had 8 green tests covering exactly this parsing behavior; duplicating it would violate DRY and risk drift. The guard is the only genuinely new logic and it is what AC(d) (no crash on non-string) requires.
**why-change:** No change from board note. Verification note: live `:3001` container predates this commit (rebuild user-gated) — proved all 4 ACs against the REAL served path anyway via a throwaway `PLAYWRIGHT_PORT=3011` dev server hitting the real (unmodified) mcp-server `:3000` data, which already naturally contains all four timestamp shapes (no synthetic fixture). 16 unit + 3 e2e tests green. Board flips to review with PENDING-REBUILD noted for live-container re-verification (code proven, deploy pending), mirroring the FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY precedent above.
