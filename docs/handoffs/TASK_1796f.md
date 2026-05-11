# TASK 1796f — Add machinery sector to sectorPeers.ts + unit test

**Sprint:** 1796
**Wave:** 1 (parallel)
**Type:** FIX
**Priority:** P2
**Owner:** developer
**Estimated effort:** ~45 min

---

## Context

The sectorPeers.ts domain service defines peer groups for 16 sectors. The `machinery` sector is missing, which means DRC (Da Nang Rubber Group, reclassified from pharma by JANITOR-012) has no sector peers. This causes incorrect peer comparisons and DAG sector mismatch.

---

## Acceptance Criteria

1. `apps/mcp-server/src/domain/services/sectorPeers.ts` includes a `machinery` sector entry with at least DRC as a member (add other known machinery tickers if present in the watchlist or stock-classification.json).
2. The machinery entry follows the same structure as existing sector entries (array of ticker strings, keyed by sector name).
3. A unit test file `apps/mcp-server/src/__tests__/1796f-sector-peers-machinery.test.ts` is created with:
   - Test: `getSectorPeers("DRC")` returns a non-empty array containing `"DRC"`
   - Test: `getSectorPeers("DRC")` does not return peers from pharma or any other sector
   - Test: machinery sector is included in the full sector list
4. All existing tests continue to pass.

---

## Files

- Primary: `apps/mcp-server/src/domain/services/sectorPeers.ts`
- New: `apps/mcp-server/src/__tests__/1796f-sector-peers-machinery.test.ts`

---

## Dependencies

None — Wave 1, no blocking tasks. (Coordinate with 1796e on sector naming — use `machinery` consistently.)

---

## Definition of Done

- [ ] `sectorPeers.ts` exports machinery sector with DRC
- [ ] Unit test file created with 3 tests, all passing
- [ ] `bun test` exits 0 (no regressions)
- [ ] Commit: `task(1796f): add machinery sector to sectorPeers.ts + unit test`
