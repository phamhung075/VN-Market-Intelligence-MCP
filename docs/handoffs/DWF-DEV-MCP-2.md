---
sprint: DYN-WF-FOUNDATION
task: DWF-DEV-MCP-2
branch: task/dwf-dev-mcp-2-routing-policy-fence
size: S
zone: apps/mcp-server/
depends_on: [DWF-DEV-MCP-1]
blocks: []
---

# DWF-DEV-MCP-2 — Routing-Policy Fence Test (RED-before-GREEN)

## TLDR

Create a test file that verifies `docs/data/routing-policy.json` schema and catch-all integrity. Runs RED before the JSON exists (Phase 0 fence), turns GREEN once DWF-DEV-CROSS-2 creates the file. Proves the fence is not a false-green.

## [PM] Planning Context

**Zone:** `apps/mcp-server/` (test zone, technically cross-service concern but colocated here for dev-mcp-server parallel dispatch)

**Acceptance Criteria:**

- [ ] **AC-P0-2-1:** File `docs/data/routing-policy.json` parses as valid JSON.
- [ ] **AC-P0-2-2:** Every distinct `(type, severity, zone)` from `docs/data/system-map.json` signal types is covered by at least one rule (wildcard coverage acceptable).
- [ ] **AC-P0-2-3:** A catch-all rule (`type:"*", severity:"*", zone:"*", ticker:"*"`) exists as the last entry and routes to `po`.
- [ ] **AC-P0-2-5 (BLOCKING DV):** Deliberate-violation: a lint/test asserts catch-all is present; removing it → test goes RED (proves fence is not a false-green).

**Files to read first:**

- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § routing-policy.json Design (rule schema, signal types, catch-all)
- `docs/REQ_DYN-WF-FOUNDATION.md` § FR-P0-2 (routing-policy SSOT contract)
- `docs/data/system-map.json` (signal types, agent ids for coverage check)

**Files to create:**

- `apps/mcp-server/src/__tests__/DWF-routing-policy-fence.test.ts` — Fence test reading from `docs/data/routing-policy.json` (or stub if file missing):
  - Test 1: JSON parsing (tries to read, fails gracefully if missing)
  - Test 2: Catch-all present (last rule has `type:"*", severity:"*", zone:"*", ticker:"*"`, routes to `po`)
  - Test 3 (DV): Remove catch-all → test must go RED

**Files to modify:**

None. This task is test-only in mcp-server zone (though the production file is created by DWF-DEV-CROSS-2).

**Dependencies:**

- Depends on DWF-DEV-MCP-1 (sequential for single-zone zone-colocation; MCP-1 is already done by MCP-2 start time, so this is gated by sprint ordering, not code dependency)
- Unblocked by DWF-DEV-CROSS-2 (routing-policy.json creation)

**Knowledge needed:**

- `docs/policies/dev-standards.md` — Test structure, DV pattern
- `docs/data/system-map.json` structure (signal_types, agent_ids)
- Architect design (routing-policy.json schema per brief)

**Implementation notes:**

1. **Test structure:**
   - Uses `bun test` or Jest
   - Reads from `docs/data/routing-policy.json` (file may not exist initially — test handles gracefully)
   - Asserts file parses as valid JSON OR logs "file not yet created; test will pass when DWF-DEV-CROSS-2 creates it"

2. **AC-P0-2-3 test:** Reads JSON, extracts last rule, asserts:
   ```typescript
   const lastRule = rules[rules.length - 1];
   expect(lastRule.type).toBe("*");
   expect(lastRule.severity).toBe("*");
   expect(lastRule.zone).toBe("*");
   expect(lastRule.ticker).toBe("*");
   expect(lastRule.target_agents).toContain("po");
   ```

3. **AC-P0-2-5 (DV):** Two test cases:
   - Case A (RED test — before fix): Hardcoded check that catch-all is present → will fail if JSON missing or catch-all absent
   - Case B (GREEN test — after fix): JSON file exists with catch-all → passes

4. **AC-P0-2-4 (no imports):** Separate grep assertion or additional test step:
   - Verify no code in `apps/` imports `routing-policy.json`
   - Can be a separate test or inline assertion

**Test order for RED→GREEN proof:**

1. Write test with catch-all assertion
2. Run test WITHOUT routing-policy.json file existing → RED
3. Wait for DWF-DEV-CROSS-2 to create routing-policy.json
4. Re-run test → GREEN
5. Remove catch-all from JSON → test goes RED again (DV proof)
6. Restore catch-all → GREEN

---

## RETURN

Upon completion, developer will commit with trailers:

```
test(mcp-server): add routing-policy fence test (RED-before-GREEN)

Add DWF-routing-policy-fence.test.ts verifying JSON parsing and catch-all
integrity. Test runs RED until DWF-DEV-CROSS-2 creates docs/data/routing-policy.json.
AC-P0-2-5 DV proves fence is live (removing catch-all → RED).

Task: DWF-DEV-MCP-2
AC: AC-P0-2-1, AC-P0-2-3, AC-P0-2-5
```

This task is complete once the test file exists and runs RED (expected until CROSS-2 creates the JSON). MCP-2 does not block further work; it is a pure test gate that turns GREEN when the production file is available.
