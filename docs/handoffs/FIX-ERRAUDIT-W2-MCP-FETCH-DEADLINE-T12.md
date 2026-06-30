---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-12
title: Full bun check pass + container rebuild
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: XS
zone: apps/mcp-server/
depends_on: [T-1, T-2, T-3, T-4, T-5, T-6, T-7, T-8, T-9, T-10, T-11]
blocks: []
critical_path: true
---

## TLDR

Run `bun check` in `apps/mcp-server/` to validate all TypeScript changes across all 12 tasks. Zero errors required. Then rebuild the mcp-server Docker container (not just restart) to include the new deadline utilities and all migrated fetch sites. This is the QA gate: container rebuild is mandatory before QA testing.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files:** Validation task (no files to create/modify; all files modified in T-1..T-11)
- **Dependencies:** All upstream tasks T-1..T-11 must be merged and committed
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § AC-8 (bun check), Container Rebuild note

## Acceptance Criteria

- [ ] All code changes from T-1..T-11 are committed and pushed to a feature branch (or merged to main if using main-only workflow)
- [ ] Run `bun check` in `apps/mcp-server/` directory
- [ ] Output shows **zero TypeScript errors** (zero warnings acceptable)
- [ ] Run container rebuild command (not restart):
  ```bash
  docker-compose -f <path-to-docker-compose> build mcp-server
  # or equivalent command to rebuild the mcp-server service image
  ```
- [ ] Build completes successfully with no errors
- [ ] Verify the new image's creation timestamp is recent (confirms rebuild happened, not reuse of old image)
- [ ] Start the rebuilt container:
  ```bash
  docker-compose -f <path-to-docker-compose> up -d mcp-server
  ```
- [ ] Container is running and healthy (wait for health check, if defined)
- [ ] MCP server is responding to requests (basic smoke test: call any MCP tool via gateway, should not 500)
- [ ] No new errors in container logs related to the deadline utilities or fetch migrations

## Files to read first

- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § AC-8 (bun check standard), Acceptance Criteria, Test Strategy
- `docs/standards/microservice-build-standard.md` (container rebuild procedure for mcp-server)

## Implementation Notes

1. **`bun check` is the TypeScript gate:** This is NOT a build-and-run test. `bun check` is a static type checker. It must pass with zero errors. This validates that all types are correct, no `any` without justification, no unsafe casts, etc.

2. **Container rebuild (not restart):** Restarting uses the existing image. Rebuilding compiles the new code into a fresh image. The deadline utilities (new file) and all migrated fetch sites (modified files) must be compiled into the image. Restart would skip this.

3. **Verification after rebuild:** The container should start cleanly. If there are runtime errors (missing imports, initialization failures), they appear in the container logs immediately. Basic smoke tests (calling any MCP tool via the gateway) confirm the server is functional.

4. **Named-volume persistence:** If tests require database-dependent verification (e.g., testing degrade paths that write to the DB), use the named volume `vn-market-intelligence-mcp_market_data`, NOT the host path `./data` (which is a stale decoy).

5. **No new code in T-12:** This task is pure validation. The developer does not write new code here; they run the checks and verify results.

## Testing Strategy (for QA / code review)

- **TypeScript validation:** `bun check` output (zero errors requirement is non-negotiable; warnings may be present but errors must be resolved)
- **Build success:** Docker build log shows no errors or critical warnings
- **Runtime startup:** Container starts without panicking or crashing
- **Basic smoke test:** Call one migrated tool (e.g., `get_macro_snapshot`) via the gateway → should respond (either success or degrade, but no 500 internal error)
- **Logs inspection:** No new errors related to the deadline utilities in the container logs

## Blockers

Depends on all upstream tasks T-1..T-11 being completed, committed, and merged.

## Notes for Developer

- If `bun check` reports errors, DO NOT rebuild the container. Fix the TypeScript errors first (likely in T-1..T-11) and re-run `bun check` until clean.
- If the build fails, read the docker build output carefully — it will point to the line/file causing the issue.
- If the container starts but crashes on first request, check the container logs (`docker logs <container-id>`) for the specific error. It is likely a missing import or a type mismatch propagated from the deadline utilities.
- Container rebuild takes ~1–2 minutes. This is expected (Bun compilation, dependency resolution, etc.).

---

**Task ID:** W2-T-12
**Estimated Duration:** 30 min (bun check + rebuild)
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** Yes (final validation gate; QA cannot start without this passing)
