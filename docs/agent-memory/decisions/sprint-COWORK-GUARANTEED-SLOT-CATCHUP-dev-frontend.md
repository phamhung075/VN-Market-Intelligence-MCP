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

### STEP dev-frontend-S4 · dev-frontend · 2026-07-31T07:20:00Z
**task-id:** FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT
**what-done:** `bun install` regenerated `apps/frontend/bun.lock` (was missing `tailwindcss-animate`, added by 48eb49a0c to package.json but only regenerated package-lock.json). Committed 8c45fc1a0, pushed, CI-plane confirmed: run 30611681976 `frontend-eslint` conclusion=success on headSha 8c45fc1a0.
**what-considered:**
- Delete `apps/frontend/package-lock.json` outright (AC-2 option a) — rejected: `apps/frontend/Dockerfile` stage `deps` runs `npm ci --ignore-scripts` against it to build the production image (docker-compose.yml:419 build context), a genuine live consumer, not dead weight.
- Only real path: option (b) — keep both, document the consumer + single regen command `cd apps/frontend && bun install && npm install --package-lock-only`. Ran it this cycle; `--package-lock-only` produced 0 diff (package-lock.json already had tailwindcss-animate from 48eb49a0c).
**why-decision:** Deleting a lockfile a live Dockerfile stage reads would trade one CI-plane defect for a docker-build defect — worse, since the frontend image is the one actually shipped to users. The dual-lockfile pattern is legitimate here (bun for dev/CI speed, npm for the alpine production image), it just needs both regenerated together on every dep change — recorded as the root-cause fix.
**why-change:** No change from AC. Also ran `bun run lint:fence` (AC-3) for the first time in this job's history — 0 violations, exit 0, validating FACTORY-GUARD-CI-TSBOUNDARIES-IMPL's claim with real CI evidence. Full vitest 2183 pass/2 fail — the 2 fails are the pre-existing unrelated QUE_DESCRIPTIONS/Kinh-Dich codegen schema mismatch (last touched 2026-06-13, no import overlap with bun.lock), not this task's scope; did not expand scope to fix them.
