# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-technical-analysis

**Sprint goal:** Cowork guaranteed-slot catch-up (this task rode BOUNDED-1 idle-capacity auto-pickup; unrelated to the sprint goal text — resolved per decision-journal SKILL § Resolve Sprint ID, active-entries tail-1).
**Agent:** dev-technical-analysis
**Started:** 2026-07-28T00:00:00Z

---

### STEP dev-technical-analysis-S1 · dev-technical-analysis · 2026-07-28T00:00:00Z
**task-id:** FACTORY-TECHANALYSIS-delete-orphaned-ts-service
**what-done:** Deleted `apps/technical-analysis/src/` (9 TS files) + `__tests__/` (3 test files) + `tsconfig.json`; trimmed `package.json` dead wiring (`module`, `start`, `check`, `test` scripts, `hono` dep); updated 2 code comments + 4 doc pages from "scheduled for deletion" to "deleted 2026-07-28".
**what-considered:**
- Attic to `apps/_attic/` instead of delete — rejected: audit's own recommendation is delete, and both blocking prereqs (Go livepath tests, TA contract reconciliation) are already DONE_VERIFIED, closing the risk that made straight delete premature earlier.
- Keep `package.json` "test"/"check" scripts as no-ops — rejected: empirically `bun test` with 0 test files exits 1 (verified live), which would silently red the DoD's "tests green" gate; removed instead.
**why-decision:** Live grep (repo-wide, filtered for false-positive `../src/` hits from other apps' own `src/`) found the ONLY importers of `apps/technical-analysis/src/` were its own now-deleted `__tests__/`. Dockerfile copies only `cmd/ pkg/ api/`; docker-compose context builds via that Dockerfile. `api/openapi.yaml` + `pkg/application/dtos.go` already carried prior-task comments (FACTORY-TECHANALYSIS-reconcile-ta-contract) independently confirming zero live callers of the TS shape. Premise held — proceeded with delete, not attic.
**why-change:** No deviation from dispatched approach. Additionally removed `hono` dep (sole consumer was deleted `handlers.ts`) and `tsconfig.json` (its entire `include` glob — `src/**/*` + `__tests__/**/*` — was deleted) as direct consequence of the "package.json start/build wiring" cleanup instruction, not scope creep.

**Verification evidence:**
- `go build ./cmd/server` — OK; `go vet ./...` — clean; `go test ./...` — 12/12 packages ok.
- `bash dashboard/build.sh` (G12 gate) — 35/35 scenarios green, headless render-check PASS.
- Dockerfile/docker-compose.yml diff: none (untouched).
- Commit: `099afddd37fdba2625e61fc958c095c03c1ebca4`.
