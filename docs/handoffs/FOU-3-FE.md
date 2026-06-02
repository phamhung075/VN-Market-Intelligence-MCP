---
task_id: FOU-3-FE
title: REQ2 (Frontend subtask): 2-axis Service Health rendering (container × capability-via-mcp)
owner: dev-frontend
priority: medium
depends:
  - FOU-1-DESIGN
  - FOU-3-GW
zone: apps/frontend/
status: DONE-PENDING-REBUILD
---

## Summary

Update dashboard.services.tsx to render a 2-axis Service Health view: Container Status (deployed/not-deployed-by-design) × Capability-via-mcp (live/data_limited/dark/n/a). Not-deployed services whose logic is LIVE via mcp-server show a positive blue "LIVE via mcp-server" badge instead of bare grey. Depends on FOU-3-GW to provide capability data in `/health` response.

## Acceptance Criteria

1. **Type Extensions**:
   - `domain/health.ts`: add `CapabilityStatus = "live" | "data_limited" | "dark" | "n/a"` type
   - Extend `ServiceRow` interface with `capability: CapabilityStatus` + optional `capabilityNote: string`
   - Existing `ServiceStatus` type for container axis preserved (ok | degraded | down | not_deployed)

2. **StatusBadge Component Upgrade**:
   - Add optional prop `capability?: CapabilityStatus` to `StatusBadge` component
   - Render logic:
     - For deployed services: existing single-axis badge (ok/degraded/down)
     - For not-deployed services: render capability badge instead (live→blue, data_limited→yellow, dark→grey)
     - For deployed services that are DOWN: always red, regardless of capability (anti-false-green invariant)

3. **CapabilityBadge Sub-Component**:
   - Create private CapabilityBadge component in dashboard.services.tsx (not shared — domain-specific to this page)
   - Maps capability value to visual indicator:
     - `live`: blue "LIVE via mcp-server"
     - `data_limited`: yellow "LIMITED via mcp-server" (with optional `capabilityNote`)
     - `dark`: grey "NOT DEPLOYED" (honest, cannot prove online)
     - `n/a`: grey "N/A" (e.g. mcp-server itself has no separate probe)

4. **Dashboard Update**:
   - dashboard.services.tsx row rendering: pass both `status` (container) and `capability` to badge
   - Row text shows both axes: e.g. "kinh-dich: container off, LIVE via mcp-server"
   - Top overall badge (services page header) still ignores not-deployed, goes RED if any deployed service is DOWN
   - Top badge logic: deployed.some(down) ? "DOWN" : deployed.some(degraded) ? "DEGRADED" : "OK"

5. **Unit Tests**:
   - Test not-deployed + live → renders blue badge
   - Test not-deployed + data_limited → renders yellow badge
   - Test not-deployed + dark → renders grey badge
   - Test deployed + ok → renders green badge (no capability)
   - Test deployed + down → renders red badge (no capability), regardless of capability value
   - Test top badge: ignores not-deployed, red if ANY deployed is down

6. **API Contract Verification**:
   - Loader fetches `/health` from api-gateway
   - Expects response shape: `ServiceRow[]` with `capability` field
   - Handles missing `capability` field gracefully (assumes `n/a`)
   - Handles missing `capabilityNote` gracefully (undefined → no note displayed)

7. **Anti-False-Green**:
   - CRITICAL: A genuinely-deployed service (in `host_runtime_set.services`) that goes DOWN must render RED
   - The capability axis MUST NOT rescue a deployed service from RED (only applies to not_deployed)
   - Deployed+down always red, regardless of capability value (preserve A-01b-4 guarantee)

8. **No Changes to**:
   - Other dashboard routes (vps, fetch, analysis, etc.)
   - Overall `/health` response shape (that is FOU-3-GW's scope)

## Technical Details

**Composed Display Logic** (from brief):

| container | capability | Display badge | Color |
|-----------|------------|---------------|-------|
| deployed | n/a | UP / DEGRADED / DOWN (existing) | green / yellow / red |
| not_deployed | live | LIVE via mcp-server | blue |
| not_deployed | data_limited | LIMITED via mcp-server | yellow |
| not_deployed | dark | NOT DEPLOYED | grey |
| down | any | DOWN | red (anti-false-green) |

**Example Row HTML**:
```
kinh-dich service
├─ status: not_deployed
├─ capability: live
├─ badge: BLUE "LIVE via mcp-server"
└─ row text: "kinh-dich: not deployed, LIVE via mcp-server"

vs.

macro-indicators service
├─ status: deployed
├─ container health: ok
├─ capability: n/a
├─ badge: GREEN "UP"
└─ row text: "macro-indicators: UP"

vs.

sbv-fetch service (intentionally killed for testing)
├─ status: deployed
├─ container health: down
├─ capability: dark (or any value)
├─ badge: RED "DOWN" ← NOT rescued by capability
└─ row text: "sbv-fetch: DOWN"
```

## Files Modified

### New
- `apps/frontend/app/components/CapabilityBadge.tsx` (or inline in dashboard.services.tsx)

### Modified
- `apps/frontend/app/domain/health.ts`: add `CapabilityStatus` type + `capability`/`capabilityNote` to `ServiceRow`
- `apps/frontend/app/routes/dashboard.services.tsx`:
  - StatusBadge: add `capability` prop
  - CapabilityBadge logic (inline or separate component)
  - Row rendering: pass both axes to badge
  - Unit tests updated (anti-false-green + capability mapping tests)

## Dependencies

- FOU-3-GW: must provide `capability` field in `/health` response
- api-gateway: must serve `/health` with capability-enriched ServiceRow objects
- system-map.json: must have `capability_manifest` (FOU-1-DESIGN output)

## Definition of Done

- [ ] CapabilityStatus type added (domain/health.ts)
- [ ] ServiceRow extended with capability + capabilityNote
- [ ] StatusBadge component upgraded with capability prop
- [ ] CapabilityBadge logic implemented (5-state mapping)
- [ ] dashboard.services.tsx refactored to render 2-axis rows
- [ ] Top overall badge preserves ignores-not-deployed + red-on-deployed-down logic
- [ ] Unit tests: 6 core scenarios + anti-false-green proven red
- [ ] typecheck passes, 228+ tests green
- [ ] Loader gracefully handles missing capability field (assumes n/a)
- [ ] frontend container rebuilt
- [ ] QA verifies: not-deployed LIVE shows blue, deployed DOWN shows red (PROVEN-RED)

## Interaction with FOU-3-GW

Blocking dependency: FOU-3-GW must be DONE and deployed before FOU-3-FE renders correctly. Frontend cannot distinguish capability tiers without the capability field in `/health` response. dev-frontend should wait for dev-api-gateway /health enrichment before merge.

## Interaction with FOU-3-QA

QA will run PROVEN-RED test: docker-stop a deployed service (e.g. macro-indicators), verify it renders RED on the dashboard. This test validates the anti-false-green invariant is intact.

## [QA] Review Record — cycle-188 · 2026-06-02T23:55Z

Verdict: APPROVED — DONE-PENDING-REBUILD

- health-compose.ts: pure domain layer (0 Remix/React imports). Anti-false-green guard at line 43: `if (status === "down") return "deployed_down"` — capability is never consulted for a down container.
- INJECT-A-VIOLATION: commented out the guard line → 5 tests FAIL (deployed+down × live/data_limited/dark/n/a all received non-deployed_down states; sbv-fetch scenario also FAIL). Reverted → 31/31 PASS.
- 2-axis compose table: all 6 states (deployed_up/degraded/down, not_deployed_live/data_limited/dark) match the brief table exactly.
- parseCapability graceful degradation: undefined/null/unknown → "n/a" (no false positive LIVE badge on missing capability field).
- composeOverallStatus: not_deployed rows excluded, deployed+down overrides gateway ok, not_deployed+live does NOT rescue top badge.
- tsc: 0 errors. DDD: health-compose.ts imports ~/domain/health only. Security: no process.env/secrets.
- Commit: b5e92ee8

Remaining: ops rebuild frontend container; then ops manual PROVEN-RED (docker-stop deployed service → RED).
