# Decision Journal — Sprint DASH-CRON-RECHECK-TABLE · dev-frontend

**Sprint goal:** Add a Cron Recheck Table to /dashboard/orchestration — honest
Layer-A (server) vs Layer-B (CLI-session) cron liveness classification.
**Agent:** dev-frontend
**Started:** 2026-07-02T11:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-07-02T11:20Z
**task-id:** TASK-DASH-CRON-2
**what-done:** Built Zone-2 UI: `api.cron-status.tsx` proxy (mirrors `api.orchestration.tsx`), `parseCronStatusDto` + `CronRecheckTable`/`CronLayerTable`/`CronStatusBadge` on `dashboard.orchestration.tsx`, loader `Promise.all` (CN-4), 41-assertion pure-function test file, coverage-map row.
**what-considered:**
- Where to place `CronRecheckTable` in the render tree: inside vs outside the existing `state ? (...) : (...)` conditional.
- Normalization strength for Layer-B `status`: reject-unknown-values-only vs unconditional-force.
- How to verify G12 against real local code once discovering :3001 answers from a live, un-rebuilt Docker container (Playwright `reuseExistingServer` would otherwise silently test stale code).
**why-decision:** (1) Rendered `CronRecheckTable` OUTSIDE the conditional — it consumes an independent endpoint/fetch (AC-25), so gating it on `/api/orchestration`'s success would violate AC-16's "never blank" guarantee if that unrelated fetch failed. (2) Unconditionally forced Layer-B `status` to `SESSION_SCOPED` (not just clamping unrecognized values) — AC-14/NFR-7 is a hard safety invariant ("Layer-B rows MUST NEVER render red/amber"); a value-allowlist alone still trusts upstream for the one value that matters, unconditional force removes that trust entirely. (3) Re-ran the G12 gate with `PLAYWRIGHT_PORT=3012 npm run test:e2e` after `curl`-ing the page and finding zero trace of new content despite HTTP 200 — root-caused to the live frontend container occupying :3001; an isolated port forces Playwright to spawn a fresh dev server against my actual source, which is the only way the gate has real signal.
**why-change:** No change from the architect/BA plan's functional shape — only the two defenses above go stronger than the letter of the spec (both fail-closed toward AC-14/AC-16, never fail-open). The G12-gate port issue is an environment discovery, not a design deviation.
