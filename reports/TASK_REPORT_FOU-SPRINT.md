## Task Report — FRONTEND-OPERATOR-UX Sprint (FOU-2-REQ1 + FOU-3-GW + FOU-3-FE + FOU-3-QA)

QA agent: qa | Cycle: 188 | Date: 2026-06-02T23:55Z

---

### FOU-2-REQ1 — SSOT QueName Factory Component + Hexagram Tooltip

Commits: 7793ca28
Changed:
- apps/frontend/app/components/QueName.tsx (76L, new)
- apps/frontend/app/components/ui/tooltip.tsx (30L, new)
- apps/frontend/app/lib/que-descriptions.generated.ts (402L, new)
- scripts/gen-que-descriptions.ts (77L, new)
- apps/frontend/app/routes/dashboard.analysis.tsx (33+/-10)
- apps/frontend/package.json (gen:que script + @radix-ui/react-tooltip)

**OPERATOR FACTORY MANDATE: PASS**
- QueName.tsx confirmed sole owner of hexagram name + tooltip logic.
- grep dashboard.analysis.tsx: 4 render sites all use `<QueName hexagram={...} name={...} />` (lines 674, 800-801, 1074, 1408).
- Zero bare hexagram-name renders outside QueName found across all routes and components.

**gen:que empty-diff: PASS (PROVEN)**
- `bun run gen:que` from apps/frontend/: `Written 64 entries → que-descriptions.generated.ts`
- `git diff apps/frontend/app/lib/que-descriptions.generated.ts` = empty. Generator is SSOT; committed file is not a hand-copy.

**Tooltip accessibility: PASS**
- QueName.tsx line 57: `tabIndex={0}` on trigger span (keyboard focusable).
- Radix `Tooltip` wires `aria-describedby` automatically to `TooltipContent`.
- Escape dismisses (Radix default).
- `aria-label` on TooltipContent for screen-reader.

**Tests:** tsc: 0 errors | foi-specific: 0 fail (no dedicated QueName test file — tooltip is in component render path, covered by integration) | pre-existing 43 failures in 1933/36/39/40/45b (pre-date FOU sprint, vi.stubGlobal incompatibility with this bun version, not introduced by FOU-2).

Verdict: **APPROVED**

---

### FOU-3-GW — Capability Manifest + Bounded Probe Enrichment

Commit: 078fcc13
Changed:
- docs/data/system-map.json: capability_manifest (9 short_keys)
- apps/api-gateway/pkg/domain/models.go: CapabilityStatus, ServiceCapability, AggregatedHealth.Capabilities
- apps/api-gateway/pkg/domain/ports.go: CapabilityProberPort interface
- apps/api-gateway/pkg/domain/services.go: WithCapabilityProber + Aggregate enrichment (anti-false-green guard line 120)
- apps/api-gateway/pkg/infrastructure/capability_prober.go: CapabilityProber (TTL cache, 7-probe cap, 3s timeout)
- apps/api-gateway/pkg/infrastructure/capability_prober_test.go: 8 tests
- apps/api-gateway/cmd/server/main.go: wire CapabilityProber

**Host-safety AC: PASS**
- TestCapabilityProber_CacheTTL: second call within TTL = 0 new probes (countAfterSecond == countAfterFirst). ASSERTS cache TTL.
- TestCapabilityProber_TimeoutFallback: 50ms probe timeout, elapsed < 500ms, fallback to manifest baseline — no throw, no block.
- TestCapabilityProber_SevenProbeCap: 7-entry manifest, count <= 7 (no 156-tool fan-out). ASSERTS host-safety hard cap.
- TestCapabilityProber_NoneProbeTypeReturnsBaseline: probeCount == 0 for probe_type=none.
- TestCapabilityProber_HealthEndpointProbe: GET method confirmed for health_endpoint probe_type.
- TestCapabilityProber_CapabilityNotePreserved: capability_note field from manifest preserved in result.

**Anti-false-green: PROVEN-RED (non-tautological)**
- TestAggregateHealthService_DeployedDownNotRescuedByCapability: mock prober reports macro as "live", macro is deployed+DOWN. Test asserts macro stays DOWN AND macro NOT in capabilities map.
- INJECT-A-VIOLATION: changed `if s.notDeployedSet[key]` to `if true` in services.go line 120.
  - Result: `TestAggregateHealthService_DeployedDownNotRescuedByCapability FAIL — anti-false-green violated: deployed+DOWN macro must NOT appear in capabilities map`
  - REVERTED. Guard is load-bearing, test is not a false-green.

**go test ./... ALL PASS (9 packages)**

Verdict: **APPROVED — DONE-PENDING-REBUILD** (ops must rebuild api-gateway container)

---

### FOU-3-FE — 2-axis Service Health Rendering

Commit: b5e92ee8
Changed:
- apps/frontend/app/__tests__/fou-3-fe-2axis-health.test.ts (248L, new)
- apps/frontend/app/domain/health-compose.ts (90L, new)
- apps/frontend/app/domain/health.ts (+28)
- apps/frontend/app/lib/api/client.ts (+6)
- apps/frontend/app/routes/dashboard.services.tsx (180+/-44)

**2-axis compose logic vs brief table: PASS**
- deployed+ok → deployed_up (GREEN) ✓
- deployed+degraded → deployed_degraded (YELLOW) ✓
- deployed+down+ANY capability → deployed_down (RED) ✓ ANTI-FALSE-GREEN
- not_deployed+live → not_deployed_live (BLUE) ✓
- not_deployed+data_limited → not_deployed_data_limited (AMBER) ✓
- not_deployed+dark/n/a → not_deployed_dark (GREY) ✓

**Anti-false-green: PROVEN-RED (non-tautological)**
- 4 tests: deployed+down+live/data_limited/dark/n/a → deployed_down (full capability matrix).
- INJECT-A-VIOLATION: removed `if (status === "down") return "deployed_down"` guard in health-compose.ts.
  - Result: 5 tests FAIL (deployed+down+live received not_deployed_live, etc.)
  - REVERTED. Guard is load-bearing, tests are not false-greens.

**Graceful degradation: PASS**
- parseCapability(undefined) → "n/a", parseCapability(null) → "n/a", parseCapability("unknown") → "n/a".
- Loader handles missing capability field by defaulting to "n/a" → not_deployed_dark (no false positive LIVE badge).

**Top badge: PASS**
- composeOverallStatus ignores not_deployed rows. deployed+down overrides gateway ok. not_deployed+live does NOT rescue top badge.

**Tests:** 31/31 PASS (fou-3-fe-2axis-health.test.ts)
tsc: 0 errors
DDD: PASS (health-compose.ts imports only ~/domain/health — zero framework/infra imports)
Security: PASS (no process.env, no hardcoded secrets)

Verdict: **APPROVED — DONE-PENDING-REBUILD** (ops must rebuild frontend container)

---

### FOU-3-QA — Anti-false-green PROVEN-RED QA Task

**Unit PROVEN-RED: PASS** (4 capability values, all return deployed_down, inject-a-violation confirmed non-tautological)
**Unit PROVEN-BLUE: PASS** (not_deployed+live → not_deployed_live)
**Unit PROVEN-GREY: PASS** (not_deployed+dark/n/a → not_deployed_dark)
**Top badge ignores not_deployed: PASS**
**Manual PROVEN-RED (docker-stop):** DEFERRED — containers not yet rebuilt. ops rebuild required first per handoff dependency.

Verdict: **DONE** (automated invariants proven; manual docker-stop test deferred to ops post-rebuild)

---

### Summary

| Task | Status | Evidence |
|---|---|---|
| FOU-2-REQ1 | DONE | Factory mandate ✓, gen:que empty-diff ✓, keyboard/aria ✓, tsc 0, tests pass |
| FOU-3-GW | DONE-PENDING-REBUILD | 9 packages go test PASS, anti-false-green PROVEN-RED (inject), host-safety 3 ACs ✓ |
| FOU-3-FE | DONE-PENDING-REBUILD | 31/31 tests, anti-false-green PROVEN-RED (inject), 2-axis table matches brief ✓, tsc 0 |
| FOU-3-QA | DONE | Automated invariants proven; manual docker-stop deferred to post-rebuild ops |

**NEXT: ops** — rebuild api-gateway + frontend containers (single-service each, not mass-start). After rebuild: ops live-verifies (a) hover Kiền hexagram on analysis page → tooltip shows coreMeaning text; (b) not-deployed services show blue LIVE badge; (c) docker-stop a deployed service → page shows RED.
