---
task_id: FIX-ERRAUDIT-W2-FE-T5-VALIDATION-REBUILD
type: sprint-task
title: T-5 Validation gate - pnpm check + container rebuild
epic: FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH
zone: apps/frontend/
owner: dev-frontend
size: XS
created_at: 2026-06-16T07:00:00Z
created_by: pm
depends_on: [FIX-ERRAUDIT-W2-FE-T2-CLIENT-CLUSTER-C, FIX-ERRAUDIT-W2-FE-T3-PROXY-CLUSTER-B, FIX-ERRAUDIT-W2-FE-T4-LOADERS-CLUSTER-A]
---

## Summary

Final validation gate: run TypeScript check in the frontend zone to ensure all 5 core migration tasks (T-1 through T-4) compile correctly with zero type errors. Then rebuild the frontend container (Remix SSR requires a full build, not just a restart) to verify runtime readiness before QA testing.

## Acceptance Criteria

### TypeScript Check

- [ ] Run `pnpm check` from `apps/frontend/` directory
- [ ] Output: **ZERO TypeScript errors**
- [ ] Output: **ZERO TypeScript warnings** (clean run)
- [ ] All imports resolve correctly (safeFetch, proxyUpstream, safeFetchOrNull from fetchUtils.ts)
- [ ] All parser functions type-check correctly (generic `T` constraints satisfied)
- [ ] All loader return types match component expectations

### Container Rebuild

- [ ] Build frontend container: `docker build -f docker/frontend.Dockerfile -t vn-market-frontend:latest .`
  (or equivalent build command per project CI/CD)
- [ ] Build succeeds with **zero errors**
- [ ] Build succeeds with **zero warnings** (if possible)
- [ ] Container starts successfully: `docker run --rm vn-market-frontend:latest npm run check` (or verify via docker ps)
- [ ] SSR server is ready to serve requests (Remix dev server OR production build running)

**CRITICAL:** A `docker restart` is insufficient. The Remix SSR build must be executed in the fresh container (this rebuilds the server bundle with the new code).

### Sanity Checks (dev-frontend pre-flight)

Before handing off to QA:

- [ ] Fetch a page that was migrated (e.g., alerts dashboard): `curl http://localhost:3001/dashboard/alerts`
  - Expect: HTTP 200, valid HTML with loader data rendered
  - Not expected: TypeScript error, missing export, undefined function
- [ ] Check frontend server logs for any startup errors (no red errors on container boot)
- [ ] Verify `FETCH_DEADLINE_MS = 55_000` constant is exported from `fetchUtils.ts` (spot-check)

## Technical Notes

**Why container rebuild is mandatory:**
- Remix SSR compiles TypeScript to JavaScript during the build phase, not at runtime
- A simple restart of an existing container would run the old compiled code
- The new code (fetchUtils.ts, migrations) must be compiled and bundled into the server
- Docker build ensures the full `pnpm check` + TypeScript → JS compilation pipeline runs

**`pnpm check` contract:**
- Runs `bunx tsc --noEmit` (or equivalent per project setup)
- Verifies type safety but does NOT emit output files (dry-run mode)
- Must be zero errors before rebuild is attempted

**Container readiness verification:**
- After rebuild, confirm the container starts cleanly (no init errors)
- One smoke test: fetch a simple page, expect 200 + valid HTML (not a TypeScript error page)

## Blockers

**BLOCKER:** If `pnpm check` fails:
1. Identify the TypeScript error
2. Escalate to dev-frontend (do NOT attempt PO deferred rebuild — the code is not ready)
3. Dev-frontend fixes the type error in one of the migration tasks (T-1 through T-4)
4. Re-run `pnpm check` until clean
5. Then proceed with container rebuild

**BLOCKER:** If container build fails:
1. Check the build log for errors (missing dependency, build script failure, etc.)
2. Escalate to ops if the issue is infrastructure-related (Docker daemon, disk space, etc.)
3. Dev-frontend troubleshoots code-level errors
4. Rebuild until successful
5. Then proceed to QA

## Success Criteria (gate to QA)

- [ ] `pnpm check` PASS (zero TypeScript errors)
- [ ] Container builds successfully
- [ ] Container starts without init errors
- [ ] Smoke test: one migrated page loads (HTTP 200 + valid HTML)
- [ ] No TypeScript error pages in browser
- [ ] Frontend server logs clean (no red errors on startup)

## Next Step (on completion)

- Code + build validation PASS → handoff to QA
- QA runs full Acceptance Criteria (AC-1 through AC-10) from BA spec
- QA may discover runtime bugs (not caught by TypeScript check) — those escalate back to dev-frontend for fixes

## Reference

- BA spec: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-BA-spec.md` § Acceptance Criteria (AC-6 and AC-8)
- AC-6: `pnpm check` passes with zero TypeScript errors
- AC-8: All dashboard pages load correctly with live data on happy path
- Dev-standards: Container rebuild rule (mandatory post-code-change per project CI/CD standards)
