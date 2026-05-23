---
task_id: "P0-KD-1"
pilot: "kinh-dich"
phase: "0"
title: "Brownfield inventory of apps/kinh-dich-service (architect + system-auditor)"
estimate: "2h"
owner: "architect + system-auditor"
status: "READY"
date: "2026-05-24"
---

# TASK P0-KD-1 — kinh-dich Brownfield Inventory

## Summary

Read-only audit of `apps/kinh-dich-service/` to document:
1. Current DDD layer structure (domain, application, infrastructure, interface)
2. The hexagram resolver and NguHanh classification logic (domain entity location)
3. Where external dependencies (SQLite, Markov data) currently live in infrastructure
4. Candidate primitive/module boundaries per charter targets
5. **R-FENCE gate validation:** confirm `eslint-plugin-boundaries` can catch Fence-A violations on real `.js`-suffixed ESM imports
6. Which MCP-server tools handlers reach kinh-dich domain (G5b scope)

## Acceptance Criteria

### AC-1: Domain layer audit complete
- [ ] Read `apps/kinh-dich-service/src/domain/` (all .ts files)
- [ ] Document: entity types (HexagramReading, NguHanhResult, HaoReading, etc.), service signatures (resolveHexagram, classifyNguHanh, computeReading), error types
- [ ] Identify: embedded data structures (TRIGRAM_LINES, QUE_META, QUE_DATA, threshold constants)
- [ ] List any legacy or superseded domain logic (G5a scope)
- [ ] Output section in `p0-brownfield-inventory.md` with entity/service summary

### AC-2: Infrastructure layer audit + R-FENCE feasibility confirmation
- [ ] Read `apps/kinh-dich-service/src/infrastructure/` and `src/index.ts`
- [ ] Identify: SQLite usage pattern (Markov data repository), any external API integration points
- [ ] Identify: current HTTP interface (if any; kinh-dich may be embedded or standalone)
- [ ] **R-FENCE critical:** audit the import style used in domain/services.ts (check for `.js` suffix usage on relative imports — e.g., `import type { ReadingRequest } from '../../application/dtos.js'`)
- [ ] Verify: no infrastructure imports in domain or application layers (fence-a/b/c candidates)
- [ ] Output section: "R-FENCE Feasibility" with findings (eslint-plugin-boundaries applicability confirmation on actual import style; confirm `.js` suffix pattern exists and will be catchable by boundaries rule)

### AC-3: Primitive candidate extraction logic review
- [ ] Read decision logic in `src/domain/services.ts` (resolveHexagram, classifyNguHanh, computeReading flow)
- [ ] Read transformation logic in relevant application/domain files (hao encoding, hexagram computation, reading scoring, nuclear hexagram computation)
- [ ] Map each charter-proposed primitive to exact source code location (5 candidates listed in §Refactor Targets)
- [ ] Assess: which 3-5 primitives are highest-leverage (most called, least entangled with infra)
- [ ] Output section: "Primitive Candidates (Confirmed)" with file locations + rationale for selection (e.g., "hexagram-resolver from src/domain/services.ts resolveHexagram() + TRIGRAM_LINES constant")

### AC-4: Module candidate + port design
- [ ] Document the full-reading composition flow (how computeReading orchestrates all transformations)
- [ ] Design the module-level port interface: `MarkovPort` (input: optional Markov data, output: fallback hexagram or null)
- [ ] Confirm: module composes primitives via this port, never directly imports SQLite client or Markov repository
- [ ] Output section: "Module Candidate (reading_composer)" with port interface signature + composition pattern + Markov data lifecycle

### AC-5: MCP-server market-data tool handlers audit (G5b scope)
- [ ] Read: `apps/mcp-server/src/interface/mcp/tools/` and search for any handlers that might reach kinh-dich domain (candidates: `explain_hexagram`, `get_kinhdich_reading`, `get_market_hexagram` per system-map.json tools list)
- [ ] Identify which handlers actually consume kinh-dich data (direct import vs HTTP call to port 5005)
- [ ] Check current integration path: embedded domain logic vs HTTP call to the kinh-dich microservice
- [ ] Document: which handlers need rewiring to HTTP (G5b deliverable scope)
- [ ] Output section: "MCP-Server Integration Points" with handler names + current state + rewire scope

### AC-6: R-FENCE summary + phase-1 risk gate
- [ ] Write final "R-FENCE Confirmation Summary" section
- [ ] Confirm eslint-plugin-boundaries element pattern matches actual import style in the service (e.g., `../../application/dtos.js` pattern with `.js` suffix)
- [ ] Output: "Status: FEASIBLE — eslint-plugin-boundaries (SI-3 Option A) can catch Fence-A violations on actual import style. No CGO analog (TypeScript/Bun). Phase 0 R-FENCE gate pre-cleared. Deliberate-violation proof (AC-4b) will proceed as charted."
- [ ] If any feasibility risk found: output "Status: RISK — [description]. Mitigation: [option]." (e.g., may need @typescript-eslint/parser fallback per SI-3 §6.3)

## Implementation Guidance

1. **Zone inspection order:** `src/domain/` → `src/application/` → `src/infrastructure/` → `src/index.ts` → `src/interface/`
2. **Search patterns:** `grep -rn "SQLite\|resolveHexagram\|classifyNguHanh\|computeReading\|TRIGRAM\|QUE_META"` to locate key areas
3. **R-FENCE import audit:** `grep -rn "from.*\.js" src/domain/ src/application/ src/interface/` to confirm `.js`-suffixed ESM import style exists and will be testable
4. **Forbidden reads:** do NOT modify any source code; read-only audit only
5. **Handoff output:** single document `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md` (markdown, ~2–3 KB)

## Handoff File Output

**File:** `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md`

**Structure (required sections):**
1. Executive summary (1 paragraph)
2. Current DDD layer structure (table: layer → files → status → deviations)
3. Primitive candidates (recommended 3–5; each with source location + calibration)
4. Module candidate (MarkovPort interface, composition pattern)
5. MCP-server integration points (G5b scope: handler names + current state + rewire scope)
6. R-FENCE feasibility confirmation (FEASIBLE / RISK / BLOCKED + detailed findings + import style examples)
7. Phase 0 exit gate readiness (go/no-go for primitive/module extraction)

## Constraints

- **L84 explicit-file staging:** handoff file only (markdown)
- **No source changes:** read-only audit
- **No git push:** local commit only
- **Anchor held:** do not create tags or rewrite history
- **Charter reference:** docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md §Refactor Targets + §R-FENCE Boundary Clause + §Language Lock

## Hard Gates

- [ ] **R-FENCE CONFIRMED:** eslint-plugin-boundaries (SI-3 Option A) is viable on this service's actual import style (`.js` suffix confirmed); AC-4b deliberate-violation proof is feasible (no Option C fallback needed preemptively — but mitigation path exists per SI-3 §6.3 if R-2 bites)

## RETURN Block

**Signal to emit:** docs/signals/pm-p0-kd1-brownfield-inventory-complete-<UTC>.json
- Status: DONE | BLOCKED
- File: p0-brownfield-inventory.md path
- R-FENCE verdict: FEASIBLE | RISK | BLOCKED
- Primitive recommendations: [ list of 3–5 names ]
- Module candidate: name + port interface name
- MCP-server handlers to rewire: [ list ]
- Next task: PM waits for all 5 remaining Phase 0 deliverables before exit gate

**Expected timeline:** 2026-05-24 (same-day delivery, architect/system-auditor)
