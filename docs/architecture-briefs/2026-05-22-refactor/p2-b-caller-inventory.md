---
title: "P2-B0 — Brownfield Inventory: TS TA Callers in mcp-server"
date: "2026-05-23"
author: "dev-technical-analysis"
task: "P2-B0"
goal: "G5"
status: "COMPLETE"
unblocks: "P2-B1"
---

# P2-B0 — Brownfield Inventory: All TS TA Callers in mcp-server

**Purpose:** Identify every TypeScript file in `apps/mcp-server/src/` that imports from or calls
`domain/services/technicalIndicators.ts`. This inventory is the gate document for P2-B1 through P2-B4.

**Smoke check run (2026-05-23):**
```
find apps/mcp-server/src -path "*technical*" -name "*.ts"
# → 3 results (matches inventory §A below)

grep -r "from.*technicalIndicators|computeAllIndicators" apps/mcp-server/src/ --include="*.ts"
# → 5 direct-import lines across 5 files (matches inventory §A + §B below)
```

---

## Discovery Method

Two passes run in parallel:

1. Path pattern: `find apps/mcp-server/src -path "*technical*" -name "*.ts"` — catches files whose path contains the word "technical".
2. Import grep: `grep -r "from.*technicalIndicators\|computeAllIndicators\|DailyCandle\|TechnicalIndicator" apps/mcp-server/src/ --include="*.ts" -l` — catches all files that reference any export from the service.

**Important:** The architect's pre-scan (recorded in the handoff) identified 3 files. This full scan surfaced **5 additional callers** not in the pre-scan. The pre-scan was a structural estimate; this inventory is the authoritative result.

---

## Section A — Files with "technical" in Path (3 files, find command output)

### A1. `apps/mcp-server/src/domain/services/technicalIndicators.ts`

| Field | Value |
|---|---|
| Type | Source — pure domain service |
| Exports | `DailyCandle` (interface), `TechnicalIndicatorResult` (interface), `computeMA`, `computeRSI`, `computeMACD`, `computeBollingerBands`, `computeAllIndicators` |
| Import lines | — (this IS the source, not a caller) |
| Rewire plan | **DELETE** (G5 target). Move to `_deprecated/` in P2-B2. No replacement — the Go service at port 5003 provides equivalent math. |
| Severity | SEV-1 (primary deletion target) |
| Notes | 278 lines. Pure math, zero infrastructure imports. All callers below depend on exports from this file. |

---

### A2. `apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts`

| Field | Value |
|---|---|
| Type | MCP tool handler (interface layer) |
| Import line | `} from "../../../../domain/services/technicalIndicators.js";` (line 31) |
| What it calls | `computeAllIndicators(candles)` (line 141), uses `DailyCandle` type |
| Rewire plan | **REWIRE (P2-B1)** — replace domain import + `computeAllIndicators` call with HTTP call to existing `computeTAIndicators` client in `infrastructure/microservices/clients.ts`. Port 5003 already wired. Endpoint: `POST /ta/indicators` per `api/openapi.yaml`. |
| Severity | SEV-1 (critical path — direct user-facing MCP tool) |
| Notes | This file is the primary HTTP rewire target for P2-B1. The `clients.ts` TA client already exists (`ta: Bun.env.TA_SERVICE_URL ?? 'http://localhost:5003'`). P2-B1 is low-risk. |

---

### A3. `apps/mcp-server/src/__tests__/1302-technical-indicators.test.ts`

| Field | Value |
|---|---|
| Type | Unit test for the domain service |
| Import line | `} from "../domain/services/technicalIndicators.js";` (line 23) |
| What it calls | `computeAllIndicators` (lines 241, 257, 268, 288, 299), plus individual math functions |
| Rewire plan | **QUARANTINE (P2-B2)** — move to `_deprecated/` alongside the domain service. These tests exercise the TS math directly; after G5 they have no production relevance. Integration coverage shifts to the Go service sandbox scenarios. |
| Severity | SEV-1 (must move with A1) |
| Notes | Per P2-B2 spec: add `// DEPRECATED: G5 Phase 2` header comment. |

---

## Section B — Additional Callers Found by Import Grep (5 files NOT in architect pre-scan)

These files were NOT in the architect's pre-scan. They must be resolved before P2-B2 (deletion) can proceed safely.

---

### B1. `apps/mcp-server/src/application/usecases/assembleBriefing.ts`

| Field | Value |
|---|---|
| Type | Application use case (morning briefing orchestrator) |
| Import line | `} from "../../domain/services/technicalIndicators.js";` (line 32) |
| What it calls | `computeRSI(prices, ...)` (line 637), `computeMA(prices, ...)` (line 638) |
| Rewire plan | **REWIRE** — extract `computeRSI` + `computeMA` into a local in-file utility OR redirect to the Go HTTP client. Recommendation: since `assembleBriefing.ts` runs these inline on price arrays already in memory (not per-ticker HTTP calls), the safer path is to duplicate the two pure math functions as local helpers in `assembleBriefing.ts` until a full application-layer migration is planned. Alternatively, route to the Go service if the latency budget allows. This must be resolved in **P2-B1** (not a new task — same atomic rewire window). |
| Severity | SEV-2 (secondary caller — will break if A1 is deleted without this being resolved) |
| Notes | This is a **gap vs the architect pre-scan**. P2-B1 scope must expand to cover this file. The task estimate (45 min) remains adequate. |

---

### B2. `apps/mcp-server/src/__tests__/1408-tool-diacritics.test.ts`

| Field | Value |
|---|---|
| Type | Test — tool diacritics validation |
| Import line | `import type { DailyCandle } from "../domain/services/technicalIndicators.js";` (line 7) |
| What it imports | `DailyCandle` type only (type import, erased at runtime) |
| Rewire plan | **TYPE REDIRECT** — change import to `from "../domain/services/technicalIndicators.js"` → `from "../interface/mcp/tools/market-data/technicalIndicatorTools.js"` if DailyCandle is re-exported there, OR extract DailyCandle into a shared domain types file. The simplest safe option: re-export `DailyCandle` from the tool handler file after rewiring. This is a type-only import — zero runtime risk. |
| Severity | SEV-3 (type-only — compile error only, no runtime breakage) |
| Notes | After P2-B2, `bun tsc --noEmit` will fail if this import is not updated. Must fix in P2-B1 or P2-B2. |

---

### B3. `apps/mcp-server/src/__tests__/1410-tool-diacritics-sweep.test.ts`

| Field | Value |
|---|---|
| Type | Test — tool diacritics sweep |
| Import line | `import type { DailyCandle } from "../domain/services/technicalIndicators.js";` (line 40) |
| What it imports | `DailyCandle` type only (type import) |
| Rewire plan | Same as B2 — **TYPE REDIRECT** to new type source after A1 is moved/deleted. |
| Severity | SEV-3 (type-only) |
| Notes | Same resolution path as B2. Can be fixed in the same P2-B1 or P2-B2 commit. |

---

### B4. `apps/mcp-server/src/__tests__/1881a-source-tier.test.ts`

| Field | Value |
|---|---|
| Type | Test — source_tier contract |
| Import line | `import { registerTechnicalIndicatorTools } from "../interface/mcp/tools/market-data/technicalIndicatorTools.js";` (line 42) |
| What it calls | `registerTechnicalIndicatorTools` from the tool handler (A2), not from domain service directly |
| Rewire plan | **NO CHANGE REQUIRED** — this test imports the tool handler (A2), not the domain service (A1). After A2 is rewired to HTTP in P2-B1, this test will naturally use the rewired version. The test's mock structure may need updating to mock the HTTP client instead of the domain import — assess during P2-B1. |
| Severity | SEV-4 (indirect — depends on A2 rewire, not on A1 directly) |
| Notes | Listed for completeness. Not a direct technicalIndicators.ts dependency. |

---

### B5. `apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts` and `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts`

| Field | Value |
|---|---|
| Type | Scheduler jobs — TA and BB alert scanners |
| Import line | `grep` reported `computeAllIndicators` in doc comments only (lines 20, 21 of each) — NOT in actual import statements |
| Actual imports | `computeTAIndicators` from `../../infrastructure/microservices/clients.js` — ALREADY HTTP-ROUTED |
| Rewire plan | **NO ACTION REQUIRED** — both jobs already use the HTTP client (`computeTAIndicators` from `clients.ts`). The `computeAllIndicators` references are in JSDoc comments (historical notation), not live code. |
| Severity | SEV-5 (no action — already migrated) |
| Notes | These are **false positives** from the grep pattern. They were previously refactored to HTTP. Confirmed by reading source: imports are `from "../../infrastructure/microservices/clients.js"`, not from the domain service. The JSDoc comment text mentions the old name as documentation context. |

---

## Section C — Barrel and Registry Files (pass-through, no direct domain dependency)

These files re-export or register the tool handler (A2) but do NOT import from `technicalIndicators.ts` directly.

| File | Role | Action |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/tools/market-data/index.ts` | Re-exports `registerTechnicalIndicatorTools` from A2 | No change — barrel remains valid after A2 rewire |
| `apps/mcp-server/src/interface/mcp/tools/registry.ts` | Calls `registerTechnicalIndicatorTools(server, db)` | No change — calls the same function after A2 rewire |

---

## Section D — DailyCandle Type Conflict (Structural Risk)

**Two distinct `DailyCandle` interfaces exist in the codebase:**

| Source | Shape | Used by |
|---|---|---|
| `domain/services/technicalIndicators.ts` | `{ day: string; close: number }` | A1, A2, A3, B1, B2, B3 |
| `domain/repositories/IBacktestPriceRepository.ts` | `{ date: string; open: number; high: number; low: number; close: number; volume: number }` | `domain/backtesting/`, `infrastructure/db/backtestPriceRepo.ts`, tests 1842d/1842e/1843 |

**Risk:** After A1 is deleted, any file still importing `DailyCandle` from `technicalIndicators.ts` will get a compile error. B2 and B3 use the `{ day, close }` shape — this type is NOT the same as the backtesting `DailyCandle`. After rewiring, the tool handler (A2) must define or re-export its own local candle type.

**Resolution plan (for P2-B1):**
1. In `technicalIndicatorTools.ts` (A2), after removing the domain import, define a local `interface ToolCandle { day: string; close: number }` or reuse from a new shared types location.
2. B2 and B3 test files must be updated to import from the new type source.
3. Do NOT re-use `IBacktestPriceRepository.DailyCandle` for the tool handler — the shapes are incompatible.

---

## Section E — TODO: migrate Scan

**Result: ZERO `TODO.*migrat` patterns found in scope.**

```bash
grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/ --include="*.ts" --include="*.go"
# → 0 results
```

P2-B3 (remove TODO migrate comments) is effectively a no-op. The only `migrate` keyword references found are:
- `1303: migrated from market_prices_history → daily_ohlcv` (informational comment in A2, line 303 — not a TODO)
- Schema migration functions (`migrateWatchlistThresholds`, `migrateForeignFlowColumns`) — unrelated to TA migration

P2-B3 should still run the grep as AC confirmation, but no files need editing.

---

## Deletion Target Summary (Ranked by Severity)

| # | Severity | File | Action | Blocks P2-B1? | Blocks P2-B2? |
|---|---|---|---|---|---|
| 1 | SEV-1 | `domain/services/technicalIndicators.ts` (A1) | DELETE (move to `_deprecated/`) | — | Yes — do last |
| 2 | SEV-1 | `interface/mcp/tools/market-data/technicalIndicatorTools.ts` (A2) | REWIRE (HTTP to port 5003) | YES — this IS P2-B1 | Yes — must rewire first |
| 3 | SEV-1 | `__tests__/1302-technical-indicators.test.ts` (A3) | QUARANTINE (move to `_deprecated/`) | No | Yes — move with A1 |
| 4 | SEV-2 | `application/usecases/assembleBriefing.ts` (B1) | REWIRE (`computeRSI`/`computeMA` local or HTTP) | YES — must fix before A1 delete | Yes |
| 5 | SEV-3 | `__tests__/1408-tool-diacritics.test.ts` (B2) | TYPE REDIRECT (`DailyCandle` source update) | No | Yes — or tsc fails |
| 6 | SEV-3 | `__tests__/1410-tool-diacritics-sweep.test.ts` (B3) | TYPE REDIRECT | No | Yes — or tsc fails |
| 7 | SEV-4 | `__tests__/1881a-source-tier.test.ts` (B4) | ASSESS during P2-B1 (mock update may be needed) | No | No |
| 8 | SEV-5 | `scheduler/market-data/taAlertScanJob.ts` (B5a) | NO ACTION (already HTTP-routed) | — | — |
| 9 | SEV-5 | `scheduler/alerts/bbAlertScanJob.ts` (B5b) | NO ACTION (already HTTP-routed) | — | — |

**Total deletion/rewire targets: 7 (SEV-1 through SEV-4). SEV-5 = already done.**

---

## Gate Decision for P2-B1

**P2-B1 SCOPE EXPANSION REQUIRED.**

The architect pre-scan identified 3 files. This inventory confirms 3 primary files (A1–A3) plus **4 additional callers** (B1–B4) that must be resolved before or during P2-B1/P2-B2. The critical addition is:

- **B1 (`assembleBriefing.ts`)** imports `computeRSI` and `computeMA` directly from the domain service. This is a SEV-2 gap — deleting A1 without fixing B1 will break the morning briefing use case at runtime. P2-B1 must include a fix for B1.
- **B2 + B3** are type-only but will fail `bun tsc --noEmit`. Fix during P2-B1 or P2-B2.

**HTTP client status: CONFIRMED IN PLACE.**
`apps/mcp-server/src/infrastructure/microservices/clients.ts` line 25:
```typescript
ta: Bun.env.TA_SERVICE_URL ?? 'http://localhost:5003',
```
`computeTAIndicators` function is exported. P2-B1 rewire of A2 is low-risk.

**Rollback gate:** Before any deletion commit in P2-B2, run:
```bash
git tag p2-b-pre-delete
```

---

## Verification Commands (AC-3 + AC-4 from Handoff)

```bash
# AC-3: find output
find apps/mcp-server/src -path "*technical*" -name "*.ts"
# Expected: 3 results (A1, A2, A3)

# AC-4: grep output
grep -r "from.*technicalIndicators\|computeAllIndicators" apps/mcp-server/src/ --include="*.ts"
# Expected: 5 import lines across 5 files (A2, A3, B1, B2, B3) — matches this inventory exactly
```

Both commands must be re-run after P2-B1 completes to confirm rewiring eliminated the direct imports.

---

## Notes for P2-B1 Author

1. Expand P2-B1 scope to include B1 (`assembleBriefing.ts`) fix and B2/B3 type redirects.
2. The `DailyCandle` type from `technicalIndicators.ts` has a **different shape** than the one in `IBacktestPriceRepository.ts` — do not conflate them. Define a local tool-layer candle type in the rewired tool handler.
3. `taAlertScanJob.ts` and `bbAlertScanJob.ts` are already HTTP-routed — no action needed.
4. No `TODO.*migrat` comments exist — P2-B3 is a confirmatory no-op run.
5. The `_deprecated/` folder does not yet exist — P2-B2 must create it.
