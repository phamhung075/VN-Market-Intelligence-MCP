---
task_id: FOU-3-GW
title: REQ2 (Gateway subtask): Capability manifest reading + bounded probe enrichment in api-gateway /health
owner: dev-api-gateway
priority: medium
depends:
  - FOU-1-DESIGN
zone: apps/api-gateway/
status: TODO
---

## Summary

Extend api-gateway `/health` handler to probe mcp-server for capability status on not-deployed services. Reads `capability_manifest` from `docs/data/system-map.json`, runs at most 7 bounded MCP tool calls per 60s window (cached), and enriches the `/health` response with `capability` + `capabilityNote` fields per service.

## Acceptance Criteria

1. **Capability Manifest SSOT**:
   - Read `docs/data/system-map.json` → `host_runtime_set.capability_manifest`
   - Maps each `short_key` (mcp, macro, stock, kinh-dich, alert, news, ta, pdf, rag) to:
     - `probe_type`: "health_endpoint" | "mcp_tool" | "none"
     - `probe`: tool name (e.g. "get_market_snapshot") or REST path
     - `live_evidence`: human-readable proof string (e.g. "2026-06-02 21:00Z")
   - Manifest is the single source of truth; no hard-coded tool lists in api-gateway

2. **Bounded Probe Execution**:
   - Maximum 7 probe calls per 60s window (one per `not_deployed_by_design` short_key)
   - 60s TTL in-memory cache, keyed by `short_key`
   - Each probe timeout: 3000ms
   - On timeout → capability stays at manifest's static baseline

3. **Probe Implementation**:
   - Single targeted MCP tool call per not-deployed service
   - Lightweight arguments (no special params)
   - For mcp itself: call existing /health endpoint (returns `{status:ok, toolCount:156, ...}`)
   - For others: call designated tool from manifest (e.g. `get_market_snapshot` for stock)

4. **Response Enhancement**:
   - `/health` response gains `capability: CapabilityStatus` per service
   - Add optional `capabilityNote: string | null` for explanatory text (e.g. "30/35 candles available")
   - Probe result determined at request time (reads cached manifest + cache, re-probes if stale)

5. **Type Definition** (`domain/health.ts`):
   ```typescript
   export type CapabilityStatus = "live" | "data_limited" | "dark" | "n/a";

   export interface ServiceRow {
     name: string;
     status: ServiceStatus;        // existing container axis
     latencyMs: number | null;
     capability: CapabilityStatus; // new axis
     capabilityNote?: string;      // optional explanation
   }
   ```

6. **Integration Test**:
   - Mock probe responses (e.g. fixture JSON for get_market_snapshot)
   - Verify response shape: `capability` field present, value in valid set
   - Verify cache TTL: same probe-key called twice within 60s reuses cached result
   - Verify timeout: probe that exceeds 3000ms falls back to manifest baseline

7. **No Changes to**:
   - mcp-server code (this task does NOT add new endpoints on mcp-server)
   - Host-safety invariants (7-probe limit enforced, never 156-tool fan-out)

## Technical Details

**Manifest Structure** (in system-map.json):
```json
"capability_manifest": {
  "_note": "...",
  "_ground_truth_date": "2026-06-02",
  "mcp":       { "capability": "n/a", "probe_type": "health_endpoint", "probe": "/health", ... },
  "macro":     { "capability": "live", "probe_type": "mcp_tool", "probe": "get_macro_snapshot", ... },
  "stock":     { "capability": "live", "probe_type": "mcp_tool", "probe": "get_market_snapshot", ... },
  ...
}
```

**Probe Flow in `/health` Handler**:
1. Read manifest from system-map.json
2. Identify `not_deployed` services from manifest
3. For each not_deployed service:
   - Check in-memory cache (TTL 60s)
   - If fresh: return cached capability
   - If stale/miss: call the probe tool (with 3000ms timeout)
   - On success: cache result, return capability
   - On timeout: return manifest baseline capability
4. Enrich response: add `capability` + `capabilityNote` to each ServiceRow

## Anti-Patterns to Avoid

- Do NOT call all 156 MCP tools on every page load (host-safety violation)
- Do NOT fan-out probes from frontend loader (latency + permission issues)
- Do NOT hard-code tool names in Go code (read manifest, SSOT only)
- Do NOT skip caching (60s TTL mandatory for host-safety)

## Files Modified

### New (or extended)
- Probe logic in api-gateway `/health` handler (location: registry.go or equivalent)
- In-memory cache for capability status (may be a simple map[string]CachedProbe)

### Modified
- `domain/health.ts`: add `CapabilityStatus` type + `capability`/`capabilityNote` fields to `ServiceRow`
- Tests: add integration test for probe + cache + timeout scenarios

## Dependencies

- manifest: `docs/data/system-map.json` (reads at handler init or per-request — confirm strategy with brief)
- mcp-server: live /health endpoint (existing) + designated tools (existing)

## Definition of Done

- [ ] Manifest reading implemented (from system-map.json, parsed as JSON)
- [ ] Capability cache implemented (60s TTL, keyed by short_key)
- [ ] Probe calls implemented (max 7/60s, 3000ms timeout per call)
- [ ] Response enriched with `capability` + `capabilityNote`
- [ ] Types updated (CapabilityStatus + ServiceRow)
- [ ] Integration test covers: probe success + cache hit + timeout fallback
- [ ] go test passes (existing scenarios preserved, new capability assertions pass)
- [ ] ops rebuilds api-gateway container after merge
- [ ] QA verifies: live not-deployed service shows correct capability (live/data_limited/dark)

## Interaction with FOU-3-FE

FOU-3-FE (dev-frontend) depends on this task: frontend receives capability field in `/health` response and uses it to render the 2-axis badge. Frontend may fail to render correctly if capability field is missing or malformed.

## Interaction with FOU-3-QA

QA will test the anti-false-green invariant: a genuinely-deployed service that goes DOWN must still render RED regardless of capability status. This task must preserve that invariant (only not_deployed services get a capability axis; deployed services DOWN → always RED).
