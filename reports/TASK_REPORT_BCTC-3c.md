## Task Report BCTC-3c
date: 2026-05-15
outcome: APPROVED

changed:
- apps/mcp-server/src/__tests__/BCTC-3c-integration.test.ts (new, 251L, 7 tests)
- apps/mcp-server/src/domain/services/bctcDiscovery.ts (extended: Strategy 0 hsx, _fetchHsx injectable, source:"hsx" union member)

tests: 7 pass / 0 fail (targeted) | 9673 pass / 39 fail (full suite — 39 pre-existing unchanged) | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED

### AC Verification

- AC-1: 7 integration tests GREEN (TC-1 through TC-7)
- AC-2: TC-1 confirms hsx.callCount=1, vps.callCount=0 — Strategy 0 fires first
- AC-3: TC-3 confirms VEA/UPCOM fallthrough — empty hsx → source:"vps-playwright"
- AC-4: TC-1/TC-5/TC-7 confirm source:"hsx" shape: urls[], fallbackUrls:[], fallbackSource:null
- AC-5: tsc 0 errors; DDD PASS (bctcDiscovery.ts has zero infra imports — only comments); Security PASS (no process.env, no hardcoded secrets)
- Baseline: 39 pre-existing failures — unchanged from c124 session baseline
