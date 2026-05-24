---
title: "Phase 1 Task Plan — Technical-Analysis Pilot"
date: "2026-05-22"
author: "pm"
status: "READY-FOR-DISPATCH"
pilot: "technical-analysis"
sprint_kickoff: "2026-05-22"
sprint_deadline: "2026-07-03"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
po_decision_ref: "docs/po-decisions/2026-05-22-phase-1-go-nogo-technical-analysis.md"
---

# Phase 1 Task Plan — Technical-Analysis Pilot

**Generated:** 2026-05-22 by pm
**Deadline:** 2026-07-03 (kickoff + 6 sprints @ 1 week per sprint)
**Status:** READY-FOR-DISPATCH to dev-technical-analysis and dev-frontend

---

## Summary

Phase 1 expands the 5 execution buckets (P1-A through P1-E) into 11 atomic tasks across 2 developer agents. Tasks are sequenced by dependency: P1-A (composition root) unblocks P1-B and P1-C (primitives + module). P1-D (scenario suite) depends on P1-B. P1-E (dashboard) depends on both P1-C and P1-D. All tasks include G12 enforcement: "run pilot scenarios + verify dashboard green" before marking done.

---

## Task Ledger

| ID | Title | Owner | Goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|-------|----------------|--------|------------|-----|----------|
| P1-A1 | Create `apps/technical-analysis/composition-root.ts` (wiring file) | dev-technical-analysis | G3 | P1-C1 | — | 15m | 6 |
| P1-A2 | Update `apps/technical-analysis/package.json` entry point | dev-technical-analysis | G3 | — | P1-A1 | 2m | 3 |
| P1-A3 | Update `apps/technical-analysis/Dockerfile` CMD + COPY | dev-technical-analysis | G3 | — | P1-A2 | 5m | 3 |
| P1-A4 | Create `apps/technical-analysis/src/interface/openapi.yaml` (HTTP contract doc) | dev-technical-analysis | G3 | — | P1-A2 | 20m | 3 |
| P1-A5 | Delete `src/index.ts`, run tests + tsc, atomic commit | dev-technical-analysis | G3 | P1-B1, P1-C1 | P1-A4 | 5m | 4 |
| P1-B1 | Extract primitive: RSI (calculate-rsi function + 3 scenario JSON files) | dev-technical-analysis | G1, G7, G12 | P1-C1 | P1-A5 | 1.5h | 6 |
| P1-B2 | Extract primitive: MACD (calculate-macd function + 3 scenario JSON files) | dev-technical-analysis | G1, G7, G12 | P1-C1 | P1-A5 | 1.5h | 6 |
| P1-B3 | Extract primitive: Bollinger Bands (calculate-bb function + 3 scenario JSON files) | dev-technical-analysis | G1, G7, G12 | P1-C1 | P1-A5 | 1.5h | 6 |
| P1-B4 | Extract primitive: MA/SMA/EMA (calculate-moving-average function + 3 scenario JSON files) | dev-technical-analysis | G1, G7, G12 | P1-C1 | P1-A5 | 1.5h | 6 |
| P1-B5 | Extract primitive: Signal detection (detect-cross function + 3 scenario JSON files) | dev-technical-analysis | G1, G7, G12 | P1-C1 | P1-A5 | 1.5h | 6 |
| P1-C1 | Build module barrel + composition (packages/modules/technical-analysis/index.ts) | dev-technical-analysis | G2, G12 | P1-D1, P1-E1 | P1-B5 | 1h | 7 |
| P1-D1 | Create scenario JSON suite for primitives (5 × 5 scenario files = 25 files total) | dev-technical-analysis | G1, G7, G12 | P1-E1 | P1-B5 | 2h | 8 |
| P1-D2 | Create multi-primitive scenario suite (5 cross-indicator stories) | dev-technical-analysis | G2, G7, G12 | P1-E1 | P1-C1 | 1h | 5 |
| P1-E1 | Build three-level dashboard (primitive / module / service zoom) | dev-frontend | G6, G8, G9, G12 | — | P1-C1, P1-D2 | 3h | 8 |
| P1-E2 | Dashboard honest red/green + scenario file edit-rerun flow | dev-frontend | G7, G8, G12 | — | P1-E1 | 1.5h | 5 |

**Total atomic tasks:** 16 (5 in composition-root bucket P1-A; 5 in primitives bucket P1-B; 1 in module bucket P1-C; 2 in scenario bucket P1-D; 2 in dashboard bucket P1-E)

**Total estimated effort:** ~16.5 hours across 2 agents

**WIP constraint:** max 2 tasks In Progress simultaneously (one per agent)

---

## Per-Task Spec

### P1-A1 — Create `apps/technical-analysis/composition-root.ts`

**Owner:** dev-technical-analysis  
**Goals:** G3 (Microservice has clean composition root)  
**Files touched:**
- `apps/technical-analysis/composition-root.ts` (NEW)

**AC:**
1. File created at `apps/technical-analysis/composition-root.ts` with exact content from P0-4 plan §5.2 (imports, config constants, DI wiring, server export)
2. No business logic in file (zero `if`, `for`, `while`, domain operations like `calculateRSI`)
3. All 6 import statements resolve (tsc --noEmit passes)
4. `grep -r "calculateRSI\|calculateMACD" apps/technical-analysis/composition-root.ts` returns 0
5. File has exactly the 42 lines specified in P0-4 plan (±2 lines for formatting)
6. Commit message references G3 + task ID

**DoD includes:** run `bun tsc --noEmit` locally, verify zero errors. Final commit atomic.

---

### P1-A2 — Update `apps/technical-analysis/package.json` entry point

**Owner:** dev-technical-analysis  
**Goals:** G3  
**Files touched:**
- `apps/technical-analysis/package.json` (MODIFY)

**AC:**
1. `"module"` field changed from `"src/index.ts"` to `"composition-root.ts"`
2. `"scripts"."start"` changed from `"bun run src/index.ts"` to `"bun run composition-root.ts"`
3. JSON syntax valid (bun install succeeds)
4. No other fields modified
5. Commit message references G3

**DoD includes:** run `bun install` to verify JSON is valid.

---

### P1-A3 — Update `apps/technical-analysis/Dockerfile` CMD + COPY

**Owner:** dev-technical-analysis  
**Goals:** G3  
**Files touched:**
- `apps/technical-analysis/Dockerfile` (MODIFY)

**AC:**
1. `CMD` line changed from `["bun", "run", "src/index.ts"]` to `["bun", "run", "composition-root.ts"]`
2. Runtime stage COPY line added: `COPY --from=builder /app/composition-root.ts ./`
3. Dockerfile syntax valid (docker build does not error on syntax)
4. No other lines modified
5. Commit message references G3

**DoD includes:** syntax check only (ops will verify docker build post-merge).

---

### P1-A4 — Create `apps/technical-analysis/src/interface/openapi.yaml`

**Owner:** dev-technical-analysis  
**Goals:** G3  
**Files touched:**
- `apps/technical-analysis/src/interface/openapi.yaml` (NEW)

**AC:**
1. File created with OpenAPI 3.0 spec (yaml syntax valid)
2. Includes `GET /health` endpoint (request/response schemas)
3. Includes `POST /ta/indicators` endpoint (request body + response schemas from `ComputeTARequest` and `ComputeTAResponse` types)
4. Schemas match TypeScript DTOs in `src/application/dtos.ts`
5. YAML passes validation (yamllint or equivalent)
6. Commit message references G3

**DoD includes:** manual YAML validation (lint tool or IDE).

---

### P1-A5 — Delete `src/index.ts`, run tests + tsc, atomic commit

**Owner:** dev-technical-analysis  
**Goals:** G3  
**Files touched:**
- `apps/technical-analysis/src/index.ts` (DELETE)

**AC:**
1. File deleted from disk
2. `cd apps/technical-analysis && bun test` produces 24 pass, 0 fail (existing tests unchanged)
3. `cd apps/technical-analysis && bun tsc --noEmit` produces 0 errors
4. Commit message references G3 + all 5 steps P1-A1..P1-A5 atomic in one commit
5. Commit includes deletion statement only (no code changes)
6. All P1-A1..P1-A5 changes are in same commit (one atomic P1-A commit)

**DoD includes:** run full test + tsc locally before committing. Commit must be atomic: all 5 file changes (composition-root.ts created, package.json modified, Dockerfile modified, openapi.yaml created, src/index.ts deleted) in ONE git commit. Dashboard green check per G12.

---

### P1-B1 — Extract primitive: RSI

**Owner:** dev-technical-analysis  
**Goals:** G1 (Primitives ship with scenarios), G7 (Edit-JSON-and-rerun works), G12 (Dashboard-green before done)  
**Files touched:**
- `packages/primitives/technical-analysis/calculate-rsi.ts` (NEW)
- `packages/primitives/technical-analysis/calculate-rsi.test.ts` (NEW)
- 3 scenario JSON files (NEW)

**AC:**
1. Function `calculateRSI(prices: number[], period: number): number[]` exists and exports from `calculate-rsi.ts`
2. Zero imports from other modules (pure function, no domain/application/infrastructure)
3. Mathematical correctness: Wilder's RSI formula (14-period default, custom periods supported) — verified against known test vector
4. ≥3 scenario JSON files created:
   - Happy path: 14-period RSI on 100-candle price array → expected output array
   - Edge case: RSI on ≤14 prices (insufficient data) → null or empty array
   - Failure case: invalid input (NaN, negative prices) → error or null
5. Unit test file calculates RSI for test vector, asserts output within 0.1% of expected
6. `bun test packages/primitives/technical-analysis/calculate-rsi.test.ts` passes all assertions
7. Commit message references G1, G7, G12

**DoD includes:** run pilot scenarios `bun run sandbox --tier=primitive --module=technical-analysis --primitive=calculate-rsi` — all 3 scenarios green. Verify dashboard reflection.

---

### P1-B2 — Extract primitive: MACD

**Owner:** dev-technical-analysis  
**Goals:** G1, G7, G12  
**Files touched:**
- `packages/primitives/technical-analysis/calculate-macd.ts` (NEW)
- `packages/primitives/technical-analysis/calculate-macd.test.ts` (NEW)
- 3 scenario JSON files (NEW)

**AC:**
1. Function `calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9)` exists
2. Zero imports from other modules (pure function)
3. Mathematical correctness: MACD line (fast EMA - slow EMA) + signal line (9-period EMA of MACD) + histogram — verified against test vector
4. ≥3 scenario JSON files:
   - Happy path: MACD on 100-candle array → {macdLine, signalLine, histogram} arrays
   - Edge case: insufficient data (< 26 prices) → null or empty
   - Failure case: invalid input → error
5. Unit test: MACD calculation vs known reference
6. `bun test packages/primitives/technical-analysis/calculate-macd.test.ts` all green
7. Commit references G1, G7, G12

**DoD includes:** sandbox green for all 3 MACD scenarios, dashboard reflects result.

---

### P1-B3 — Extract primitive: Bollinger Bands

**Owner:** dev-technical-analysis  
**Goals:** G1, G7, G12  
**Files touched:**
- `packages/primitives/technical-analysis/calculate-bollinger-bands.ts` (NEW)
- `packages/primitives/technical-analysis/calculate-bollinger-bands.test.ts` (NEW)
- 3 scenario JSON files (NEW)

**AC:**
1. Function `calculateBollingerBands(prices: number[], period: number = 20, stdDevMultiplier: number = 2)` exists
2. Zero imports from other modules (pure function)
3. Mathematical correctness: middle band (SMA), upper/lower bands (SMA ± std dev * multiplier) — population std dev formula per P0-4 §1
4. ≥3 scenario JSON files:
   - Happy path: BB on 100 prices → {upperBand, middleBand, lowerBand} arrays
   - Edge case: BB on < 20 prices → null or partial output
   - Failure case: invalid input → error
5. Unit test: BB calculation vs reference (std dev precision ±0.01%)
6. `bun test packages/primitives/technical-analysis/calculate-bollinger-bands.test.ts` all green
7. Commit references G1, G7, G12

**DoD includes:** sandbox green for all 3 BB scenarios, dashboard reflects result.

---

### P1-B4 — Extract primitive: Moving Averages

**Owner:** dev-technical-analysis  
**Goals:** G1, G7, G12  
**Files touched:**
- `packages/primitives/technical-analysis/calculate-moving-average.ts` (NEW)
- `packages/primitives/technical-analysis/calculate-moving-average.test.ts` (NEW)
- 3 scenario JSON files (NEW)

**AC:**
1. Function exports three calculators:
   - `calculateSMA(prices: number[], period: number): number[]` (simple moving average)
   - `calculateEMA(prices: number[], period: number): number[]` (exponential moving average, Wilder's alpha)
   - `calculateMA(prices: number[], period: number, type: 'SMA' | 'EMA'): number[]` (dispatcher)
2. Zero imports from other modules (pure functions)
3. Mathematical correctness: SMA = mean of window, EMA = exponential smoothing (Wilder formula: α = 2/(period+1))
4. ≥3 scenario JSON files (shared across all 3 calculators, or one file per type):
   - Happy path: MA on 100 prices (period 20, both SMA and EMA) → correct arrays
   - Edge case: period > prices.length → null or partial
   - Failure case: invalid period (≤0) → error
5. Unit tests: SMA/EMA vs reference calculations
6. `bun test packages/primitives/technical-analysis/calculate-moving-average.test.ts` all green
7. Commit references G1, G7, G12

**DoD includes:** sandbox green for all scenarios, dashboard reflects result.

---

### P1-B5 — Extract primitive: Signal Detection

**Owner:** dev-technical-analysis  
**Goals:** G1, G7, G12  
**Files touched:**
- `packages/primitives/technical-analysis/detect-cross.ts` (NEW)
- `packages/primitives/technical-analysis/detect-cross.test.ts` (NEW)
- 3 scenario JSON files (NEW)

**AC:**
1. Function `detectCross(fastLine: number[], slowLine: number[], lookback: number = 1): Array<{index: number, type: 'bullish' | 'bearish'}>` exists
2. Zero imports from other modules (pure function)
3. Mathematical correctness: bullish = fast crosses above slow, bearish = fast crosses below slow, detected by checking sign change of (fast[i] - slow[i]) vs (fast[i-1] - slow[i-1])
4. ≥3 scenario JSON files:
   - Happy path: two crossing arrays → array of cross points {index, type}
   - Edge case: no crosses, parallel lines → empty array
   - Failure case: mismatched array lengths or invalid input → error
5. Unit test: detect crosses in known pattern (e.g., sine waves with phase offset)
6. `bun test packages/primitives/technical-analysis/detect-cross.test.ts` all green
7. Commit references G1, G7, G12

**DoD includes:** sandbox green for all 3 scenarios, dashboard reflects result.

---

### P1-C1 — Build module barrel + composition

**Owner:** dev-technical-analysis  
**Goals:** G2 (Module composes primitives via ports), G12 (Dashboard-green before done)  
**Files touched:**
- `packages/modules/technical-analysis/index.ts` (NEW — barrel export)
- `packages/modules/technical-analysis/compose-ta.ts` (NEW — composition function)
- `packages/modules/technical-analysis/ta-module.test.ts` (NEW — multi-primitive scenario)

**AC:**
1. Barrel export at `packages/modules/technical-analysis/index.ts` exports all 5 primitives by name (calculateRSI, calculateMACD, etc.)
2. Composition function `composeTechnicalAnalysis(prices: number[]): {rsi, macd, bb, ma, crosses}` exists
3. Zero imports from other modules (only imports from primitives/technical-analysis/* + own domain)
4. Composition orchestrates ≥2 primitives in sequence (e.g., RSI + MACD on same price array, then detect crossovers between their outputs)
5. ≥1 multi-primitive scenario JSON file (story that exercises ≥2 primitives together)
6. Unit test: multi-primitive story executes without error, output shape matches schema
7. `bun test packages/modules/technical-analysis/ta-module.test.ts` all green
8. Commit references G2, G12

**DoD includes:** run `bun run sandbox --tier=module --module=technical-analysis` — multi-primitive scenario green. Dashboard reflects module-level result.

---

### P1-D1 — Create scenario JSON suite for primitives

**Owner:** dev-technical-analysis  
**Goals:** G1 (Primitives ship with scenarios), G7 (Edit-JSON-and-rerun works), G12  
**Files touched:**
- 25 scenario JSON files total (NEW)
  - 5 files × 5 primitives = golden + edge + edge + edge + failure per primitive

**AC:**
1. All 25 files created under `docs/scenarios/technical-analysis/primitives/` (new directory)
2. File naming convention: `<primitive>-<scenario-type>.json` (e.g., `rsi-golden.json`, `rsi-edge-1.json`, `rsi-failure.json`)
3. Each file follows schema:
   ```json
   {
     "primitive": "<name>",
     "input": {...},
     "expectedOutput": {...},
     "description": "<human-readable>",
     "category": "golden|edge|failure"
   }
   ```
4. Golden scenarios (1 per primitive): known-good input/output pair
5. Edge scenarios (≥3 per primitive): boundary conditions (min data, max period, zeros, NaN values)
6. Failure scenarios: expected errors (invalid input, type mismatch)
7. All 25 files valid JSON (can parse in isolation)
8. Commit references G1, G7, G12

> Note: the `category` values above (`golden`, `edge`, `failure`) are the data-contract keys — they appear verbatim in scenario JSON files and are never changed. The dashboard renders them as human-facing chip text via a display-label lookup map (see `08-sandbox-dashboards.md §2d Category chip display labels`).

**AC verification steps:**
- `find docs/scenarios/technical-analysis/primitives -name "*.json" | wc -l` = 25
- Each file parses: `bun -e "JSON.parse(require('fs').readFileSync(...))"` for all 25
- Sandbox runs all 25: `bun run sandbox --tier=primitive --module=technical-analysis --scenario=all` → all green

**DoD includes:** all 25 scenario files green in dashboard. User can edit one JSON file and rerun without breaking others.

---

### P1-D2 — Create multi-primitive scenario suite

**Owner:** dev-technical-analysis  
**Goals:** G2 (Module composes primitives via ports), G7 (Edit-JSON-and-rerun works), G12  
**Files touched:**
- 5 scenario JSON files (NEW) under `docs/scenarios/technical-analysis/module/`

**AC:**
1. 5 multi-primitive scenario files created:
   - Scenario 1: RSI + MACD crossover story (RSI overbought + MACD bullish cross = strong signal)
   - Scenario 2: Bollinger Bands + MA compression (bands narrow, price near SMA = volatility play)
   - Scenario 3: EMA crossover + signal detection (fast EMA crosses slow, detect-cross fires)
   - Scenario 4: Full basket (all 5 primitives on same candle array, orchestrated)
   - Scenario 5: Edge case (insufficient candles, some primitives return null, module handles gracefully)
2. Each file schema:
   ```json
   {
     "module": "technical-analysis",
     "primitives": ["calculateRSI", "calculateMACD", ...],
     "input": {...},
     "expectedOutput": {...},
     "description": "<story>",
     "category": "golden|edge|failure"
   }
   ```
3. All 5 files valid JSON
4. Sandbox runs all 5: `bun run sandbox --tier=module --module=technical-analysis --scenario=all` → all green
5. Commit references G2, G7, G12

**DoD includes:** all 5 module scenarios green in dashboard.

---

### P1-E1 — Build three-level dashboard

**Owner:** dev-frontend  
**Goals:** G6 (Three-level dashboard renders from JSON traces), G8 (Red/green status is honest), G9 (Dashboard is trust contract), G12  
**Files touched:**
- `apps/technical-analysis/dashboard/index.html` (NEW)
- `apps/technical-analysis/dashboard/style.css` (NEW)
- `apps/technical-analysis/dashboard/app.js` (NEW)
- `docs/scenarios/technical-analysis/` (scenario JSON files referenced, not created here)

**AC:**
1. HTML file opens without server (file:// URL in browser works)
2. Three panels visible on page load:
   - Primitives panel: ≥5 cards (one per primitive: RSI, MACD, BB, MA, detect-cross)
   - Module panel: ≥1 card (composition story)
   - Microservice panel: (reserved for future, can be empty/placeholder in Phase 1)
3. Each card shows:
   - Primitive/scenario name
   - Status badge: GREEN (pass) or RED (fail)
   - Input summary (e.g., "14-period RSI on 100 candles")
   - Output summary (e.g., "RSI range [23, 78]")
4. Click on any card → detail view (modal or expanded view) showing full input/output JSON
5. Detail view has "Edit & Rerun" button (AC for P1-E2)
6. No JavaScript errors in console (verify with browser DevTools)
7. CSS styling is minimal but readable (no crashes on font/color issues)
8. Commit references G6, G8, G9, G12

**AC verification:**
- Open `apps/technical-analysis/dashboard/index.html` in Safari / Chrome on macOS (file:// URL)
- Screenshot: all 3 panels visible with ≥7 cards total
- Click ≥1 primitive card → detail modal appears
- Browser console: zero errors

**DoD includes:** manual browser verification (user or QA). All scenario files must exist and be valid JSON for cards to render (depends on P1-D1 + P1-D2). Dashboard green check.

---

### P1-E2 — Dashboard honest red/green + scenario file edit-rerun flow

**Owner:** dev-frontend  
**Goals:** G7 (Edit-JSON-and-rerun works), G8 (Red/green status is honest), G12  
**Files touched:**
- `apps/technical-analysis/dashboard/app.js` (MODIFY — add rerun logic)
- `apps/technical-analysis/dashboard/rerun-handler.js` (NEW — sandbox integration)

**AC:**
1. "Edit & Rerun" button in detail view opens editor (native `<textarea>` with JSON content)
2. User modifies JSON (e.g., changes RSI period from 14 to 10), clicks "Save & Rerun"
3. Browser calls `bun run sandbox --scenario=<edited-file>` via Node.js subprocess spawner (or equivalent)
4. Result JSON received and card status updates: GREEN if passed, RED if failed
5. Manual test: deliberately introduce a bug in a primitive (e.g., return wrong value), save scenario JSON with broken expected output, refresh dashboard → card turns RED
6. Manual test: same broken primitive, fix it in code, run `bun run sandbox` locally, refresh dashboard → card turns GREEN
7. Env audit: run `bun run sandbox --tier=primitive --scenario=test.json && env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` → output is empty (zero DB credentials in sandbox process)
8. Commit references G7, G8, G12

**AC verification:**
- User opens dashboard, edits a scenario JSON, clicks Rerun
- Card status updates within 5 seconds
- Verify env audit: no credentials leak into sandbox process
- Manual bug injection: dashboard shows RED

**DoD includes:** 
- Edit JSON + rerun flow tested manually (developer or QA)
- 1 deliberate primitive bug introduced, dashboard shows RED, bug fixed, dashboard shows GREEN
- Env audit: zero credentials in sandbox
- Dashboard green check

---

## Dependency Graph

```
P1-A1 (composition-root.ts created)
  ↓
P1-A2 (package.json updated)
  ↓
P1-A3 (Dockerfile updated)
  ↓
P1-A4 (openapi.yaml created)
  ↓
P1-A5 (src/index.ts deleted, tests + tsc pass, ATOMIC COMMIT A)
  ↓
  ├─→ P1-B1, P1-B2, P1-B3, P1-B4, P1-B5 (5 primitives in parallel)
  │    ↓ (all depend on P1-A5)
  │    └─→ P1-C1 (module barrel on all 5 primitives)
  │         ↓
  │         └─→ P1-E1 (dashboard primitive + module panels)
  │
  └─→ P1-D1 (25 primitive scenario files)
       ↓
       ├─→ P1-D2 (5 module scenario files)
       │    ↓
       │    └─→ P1-E1 (dashboard needs all scenarios)
       │
       └─→ P1-E2 (dashboard edit-rerun, depends on E1)
```

**Critical path:** P1-A5 → P1-B5 → P1-C1 → P1-E1 → P1-E2 (total ~11 hours)  
**Parallel work:** P1-B1..B5 can run in parallel (5 × 1.5h = 7.5h condensed to ~2h wall-clock if run in series dev schedule)

---

## Owner Assignment

**dev-technical-analysis:** P1-A1..A5, P1-B1..B5, P1-C1, P1-D1, P1-D2 (composition, primitives, module, scenarios)

**dev-frontend:** P1-E1, P1-E2 (dashboard)

---

## Goal Mapping

| Goal | Task(s) | Outcome |
|------|---------|---------|
| G1 | P1-B1..B5, P1-D1 | 5 primitives extracted with 3+ scenarios each (golden + edge + failure) |
| G2 | P1-C1, P1-D2 | Module composes primitives via ports; multi-primitive scenarios pass |
| G3 | P1-A1..A5 | Composition root created, old entry deleted, tests pass, HTTP contract documented |
| G4 | (deferred to Phase 2 — eslint fence rules) | Architecture fence enforced in CI |
| G5 | (deferred to Phase 2 — old TA code deletion) | Old TA code in mcp-server removed |
| G6 | P1-E1 | Three-level dashboard renders from JSON traces (primitives, module, service panels) |
| G7 | P1-B1..B5, P1-D1, P1-E2 | Edit scenario JSON, refresh dashboard, new result visible (zero DB creds in sandbox) |
| G8 | P1-E1, P1-E2 | Dashboard shows RED on deliberately broken primitive, GREEN when fixed |
| G9 | P1-E1 | Dashboard is the sole trust contract for indicator correctness (user-facing contract) |
| G10 | (deferred to Phase 2 — QA injected bug, dev fix cycle) | AI agent fixes primitive bug in ≤2 cycles |
| G11 | (deferred to Phase 2 — regression canary) | Regression alarm bell detects when fix breaks sibling scenario |
| G12 | All tasks | Every dev task includes "run pilot scenarios + verify dashboard green" in DoD |

---

## Blockers (None)

All prerequisites from pilot charter §Kickoff Prerequisites are satisfied:
1. Master brief (2026-05-22-deep-module-ddd-with-dashboards.md) is PO-approved ✓
2. Sandbox-kit at L3+ (narrator + renderer extracted) ✓
3. Baseline metric snapshot (docs/data/bug-inventory.json) exists ✓
4. Bug-inventory.json created (29 bugs, baselineCycleCount = 1.5 TA-specific) ✓
5. Brownfield scan complete (P0-4 plan, 9 files audited, 8/9 DDD-clean) ✓

**No CONDITIONAL plan required.** All task owners (dev-technical-analysis, dev-frontend) are real agent types confirmed in dispatch table. All files needed exist or are creatable within task scope.

---

## Notes for Dev-* Agents

### For dev-technical-analysis

- **Mandatory reading before starting:** docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md §12 Completion Goals (G1-G12)
- **Read before each task:** P0-4 plan for composition-root reference (§5.2 exact content, §10 acceptance gates)
- **Primitive extraction pattern:** Each primitive is a pure function (zero side effects, zero imports), with 3 scenario JSON files (happy + edge + failure). Use the same sandbox environment across all 5 (no credential pollution per charter §Security Clause).
- **Dashboard integration:** As you complete each primitive, scenarios appear in `docs/scenarios/technical-analysis/primitives/`. Dashboard (P1-E) will auto-discover and render them.
- **G12 enforcement:** Before marking any P1-B* or P1-C* or P1-D* task DONE, run `bun run sandbox --tier=<tier> --module=technical-analysis` and confirm dashboard shows all scenarios GREEN. If any RED, that task is incomplete.

### For dev-frontend

- **Mandatory reading before starting:** docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md §Track B (G6-G9) and §Security Clause
- **Dashboard design philosophy:** Three panels, minimal UI, no external CSS frameworks (use vanilla CSS). Goal is user trust, not beauty. Red cards must be impossible to miss.
- **Scenario file format:** Read one P1-D1 or P1-D2 scenario file to understand schema. Dashboard reads files directly from `docs/scenarios/technical-analysis/{primitives,module}/`.
- **Edit-JSON-and-rerun (P1-E2):** This is the critical user-facing feature per G7. Must work without page reload. Test manually: edit a scenario JSON in the dashboard's inline editor, see result update within 5 seconds.
- **G12 enforcement:** Before marking P1-E1 or P1-E2 DONE, run full scenario suite and verify all cards GREEN on dashboard.

---

## Handoff Files

Each task will have a handoff file at `docs/handoffs/TASK_P1-<id>.md` with:
- Task description (copy from this plan)
- Acceptance criteria (verbatim from Per-Task Spec section above)
- Files touched (list from Per-Task Spec section above)
- Goal mapping
- Dependencies (blocked by / blocks)
- Test command and type-check command
- Owner agent signature block

Handoff files are created by PM immediately after this plan is approved and ready for dispatch.

---

## Success Criteria for Phase 1 Close

- All 16 tasks completed and merged to main
- All 12 goals (G1-G12) in pilot-status.json flipped from TBD to YES or NO with evidence recorded
- QA has verified G3 acceptance gates (composition root, HTTP contract)
- QA has verified G1 acceptance gates (≥5 primitives × 3 scenarios = ≥15 files, all execute without error)
- QA has verified G6 acceptance gates (dashboard opens, all 3 panels visible, no console errors)
- QA has verified G7 acceptance gates (edit scenario JSON, rerun, result updates; env audit shows zero DB creds)
- QA has verified G8 acceptance gates (deliberate bug → RED, fix → GREEN)
- User has verbally confirmed G9 (dashboard is trustworthy without reading code)
- At sprint 6 deadline (2026-07-03), PO calls decision matrix on all 12 goals and records verdict (3 YES = scale, 2 YES = rescope, 0-1 YES = STOP)

---

## Next Steps

1. **PM:** Create handoff files TASK_P1-A1.md through TASK_P1-E2.md with AC + files touched + dependencies (copy from Per-Task Spec section above)
2. **PM:** Update docs/TASKS.md with all 16 tasks in Todo state, P1-A1 first task for dev-technical-analysis, P1-E1 first task for dev-frontend after P1-C1 completes
3. **Main terminal:** Dispatch P1-A1 to dev-technical-analysis via `run .claude/flows/dev-technical-analysis/main.md` with TASK_P1-A1.md handoff
4. **Dev-technical-analysis:** Complete P1-A1..A5 atomically (one commit), mark P1-A DONE in docs/TASKS.md
5. **Dev-technical-analysis:** Pick up P1-B1 (one of the 5 primitives), work through P1-B1..B5 in series or (if WIP allows) in parallel batches
6. **Dev-frontend:** After P1-C1 + P1-D2 complete, pick up P1-E1
7. **All agents:** After each task completion, update pilot-status.json goal state from TBD to IN-PROGRESS, then to YES/NO with evidence URL
8. **QA:** At each goal completion, run acceptance gates from charter and populate goal evidence fields in pilot-status.json
