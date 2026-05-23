---
title: "P0-KD-1 — Brownfield Inventory: apps/kinh-dich-service"
date: "2026-05-24"
author: "architect"
task_id: "P0-KD-1"
pilot: "kinh-dich"
phase: "0"
status: "DONE"
charter: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md"
handoff: "docs/handoffs/TASK_P0-KD-1-brownfield-inventory.md"
---

# P0-KD-1 — Brownfield Inventory: `apps/kinh-dich-service`

## 1. Executive Summary

`apps/kinh-dich-service` is a well-structured TypeScript/Bun microservice (port 5005) that already has all four DDD layers in place (`domain/`, `application/`, `infrastructure/`, `interface/`) with a clean composition root at `src/index.ts`. The domain layer is genuinely pure: `domain/services.ts` contains zero infrastructure imports and exports `computeReading()` and `classifyNguHanh()` as the main public API, with all hexagram library data (TRIGRAM_LINES, QUE_META, QUE_DATA) embedded inline. The service has NO `src/primitive/`, `src/module/`, `src/sandbox/`, or `src/dashboard/` directories — confirming RED verdict per the factory charter. The five charter-proposed primitive candidates are all directly extractable from `domain/services.ts` internal helpers, with zero entanglement with infrastructure. The **R-FENCE gate is VIABLE**: the codebase uses `.js`-suffixed ESM imports uniformly across all three audited layers, the `eslint-plugin-boundaries` element pattern `src/application/**/*` will correctly match these imports on the resolved path, and the deliberate-violation target (`resolveHexagram()` in `domain/services.ts`, to become `src/primitive/hexagram-resolver/index.ts`) exists and is confirmed. A critical G5b finding: the `mcp-server` handlers do NOT call port 5005 via HTTP — they import kinh-dich domain logic directly from their own parallel copy in `apps/mcp-server/src/domain/services/kinhDich/`. Full HTTP rewire is required for all six MCP kinh-dich tools. One minor DDD deviation flagged: `infrastructure/config.ts` uses `process.env` instead of `Bun.env` per dev-standards.

---

## 2. Current DDD Layer Structure

Service facts (from `docs/data/system-map.json`): zone `apps/kinh-dich-service`, port 5005 (internal == external), runtime `bun`, language `ts`, specialist `dev-kinh-dich`.

| Layer | Files | Status | Deviations |
|---|---|---|---|
| **domain** | `src/domain/models.ts`, `src/domain/services.ts`, `src/domain/repositories.ts`, `src/domain/errors.ts` | GREEN — zero infra imports confirmed | None. Pure types + pure functions throughout. |
| **application** | `src/application/usecases.ts`, `src/application/dtos.ts` | GREEN — imports domain only | None. Uses ports correctly via constructor injection. |
| **infrastructure** | `src/infrastructure/repositories.ts`, `src/infrastructure/config.ts` | GREEN — correctly isolated | Minor: `config.ts` uses `process.env` not `Bun.env` (dev-standards §Coding Standards). Flag for dev-kinh-dich to fix at composition root. |
| **interface** | `src/interface/handlers.ts`, `src/interface/serializers.ts` | GREEN | None. Hono router, thin HTTP layer, no business logic. `serializers.ts` imports domain errors directly — acceptable (error mapping is interface concern). |
| **composition root** | `src/index.ts` | GREEN | None. Wires all layers via DI; no business logic; imports infra and domain correctly. |
| **primitive** | — | RED — absent | None present. Creation is Phase 1 work. |
| **module** | — | RED — absent | None present. Creation is Phase 1 work. |
| **sandbox** | — | RED — absent | None present. Creation is Phase 1 work. |
| **dashboard** | — | RED — absent | None present. Creation is Phase 1 work. |
| **tests** | `src/__tests__/unit/kinh-dich-service.test.ts`, `src/__tests__/integration/kinh-dich-handlers.test.ts` | GOOD — present, cover domain + HTTP layer | Uses `bun:test`, mock ports pattern correct. |

**Fence-A pre-check (current state):** `grep -rn "from.*infrastructure" src/domain/ src/application/` returns zero results. Domain and application layers are clean.

**ESLint / devDependencies state:** `package.json` has only `bun-types` and `typescript` in devDependencies. No ESLint entries. `eslint.config.mjs` does not exist. This is expected — it is created at the G4 phase-1 task per the charter.

---

## 3. Primitive Candidates (Confirmed)

All five charter-proposed primitives map directly to internal helpers in `apps/kinh-dich-service/src/domain/services.ts`. Each is extractable with zero infrastructure entanglement.

| Priority | Primitive name | Source location (exact) | Why it is pure | Extraction complexity |
|---|---|---|---|---|
| 1 (highest) | `hexagram-resolver` | `resolveHexagram()` (L272-L281) + `TRIGRAM_LINES` (L23-L32) + `TRIGRAMS_TO_QUE` map (L198-L201) in `domain/services.ts` | Maps 6 binary line signals → hexagram number via table lookup. No I/O. Throws on invalid trigram pattern. | Low — self-contained. Needs `LINES_TO_TRIGRAM` and `TRIGRAMS_TO_QUE` lookup maps built from `TRIGRAM_LINES` and `QUE_META`. |
| 2 | `hao-encoder` | `classifyHao()` (L245-L249) + `encodeHaos()` (L252-L266) + threshold constants `LAO_DUONG_THRESHOLD` (L205), `THIEU_DUONG_THRESHOLD` (L206), `LAO_AM_THRESHOLD` (L207) + `STATE_TO_BINARY` (L209-L212) + `STATE_TO_CHANGING` (L213-L216) + `HAO_LABELS` (L216-L223) in `domain/services.ts` | Maps 6 raw scores [-1,+1] → `HaoReading[]` (state + binary + isChanging). Pure threshold math. | Low — all constants are co-located. |
| 3 | `ngu-hanh-classifier` | `classifyNguHanh()` (L340-L369, already exported) + `GENERATION` (L236-L239) + `DESTRUCTION` (L240-L242) tables in `domain/services.ts` | Maps lower/upper trigram elements → `NguHanhResult`. Pure table lookup. Already exported — easiest extraction. | Lowest — already the cleanest boundary in the file. |
| 4 | `reading-scorer` | `extractOutcomeScore()` (L301-L307) + `extractTrendScore()` (L309-L315) + `extractAction()` (L317-L325) + `majorityVote()` (L327-L332) + `OUTCOME_SCORES` (L225-L228) + `TREND_SCORE_MAP` (L230-L234) in `domain/services.ts` | Maps line outcome strings + trend text → numeric score + trading action string. Pure string-to-number classification. | Medium — four functions + two constant tables; string matching logic. |
| 5 | `nuclear-hexagram-computer` | `computeHoQue()` (L283-L285) + `computeBienQue()` (L288-L295) in `domain/services.ts` | Maps 6 signals + `HaoReading[]` → nuclear (hộ quẻ) + transformed (biến quẻ) hexagram numbers. Pure bit manipulation. Both delegate to `resolveHexagram()` — will import `hexagram-resolver` primitive. | Low — two small functions. Note: depends on `hexagram-resolver` (cross-primitive import allowed: primitive → primitive is NOT fenced). |

**Recommended extraction order for Phase 1:** `hexagram-resolver` (first, standalone, also the G4 deliberate-violation target) → `ngu-hanh-classifier` (already exported, trivial) → `hao-encoder` → `reading-scorer` → `nuclear-hexagram-computer`.

**Hexagram library data (TRIGRAM_LINES, TRIGRAMS, QUE_META, QUE_DATA):** These are embedded data structures in `domain/services.ts`. Options for Phase 1: (a) keep them in `domain/services.ts` as a shared data file that primitives import, or (b) extract to a thin `src/domain/hexagram-data.ts` constant file. Option (a) is lower-risk for Phase 1; option (b) is cleaner long-term. Dev-kinh-dich decides. Neither creates a Fence-A violation (domain → domain is allowed).

---

## 4. Module Candidate: `reading_composer`

**Module boundary:** `src/module/reading_composer/`

**Full composition flow** (from `computeReading()` in `domain/services.ts`, lines 375-512):

```
Input: stockCode (string) + scores: number[6] + markovData?: MarkovData | null

Step 1: encodeHaos(scores)                → HaoReading[6]          [hao-encoder primitive]
Step 2: haosToSignals(haos)               → number[6] binary        [hao-encoder primitive]
Step 3: resolveHexagram(signals)          → queChinhNumber           [hexagram-resolver primitive]
Step 4: QUE_META.find(queChinhNumber)     → queMeta                 [domain data]
Step 5: computeHoQue(signals)             → hoQueNumber              [nuclear-hexagram-computer primitive]
Step 6: computeBienQue(haos)              → bienQueNumber            [nuclear-hexagram-computer primitive]
Step 7: classifyNguHanh(lower, upper)     → NguHanhResult            [ngu-hanh-classifier primitive]
Step 8: getChangingLines(haos)            → number[]                 [inline helper — stays in module]
Step 9: extractTrendScore + outcomeScores → baseScore + outcomeScores [reading-scorer primitive]
Step 10: majorityVote(actions)            → tradingSignal            [reading-scorer primitive]
Step 11: markovData weighting             → confidence               [module logic — markov blending]
Output: KinhDichReading
```

**MarkovPort interface** (port design for the module — replaces the optional `markovData?: MarkovData | null` param):

```typescript
// src/domain/repositories.ts — extend existing file or add to module port file
export interface MarkovPort {
  /** Return Markov transition data for a hexagram number, or null if unavailable. */
  getMarkovData(hexagramNumber: number): MarkovData | null;
}
```

The existing `KinhDichRepositoryPort.getMarkovData()` (in `src/domain/repositories.ts`) already matches this signature exactly — no new interface needed. The module receives a `MarkovPort` via constructor injection; the `SQLiteKinhDichRepository` implementation in `src/infrastructure/repositories.ts` already implements it. The composition root (`src/index.ts`) wires the infra impl to the port and injects it into the module.

**Module contract:** module imports primitives + domain models only. It never imports `src/infrastructure/**` directly. The SQLite connection is provided by the composition root via the `MarkovPort` injection.

**Fence-B compliance:** the module may import primitives (`src/primitive/**`). It must not import `src/application/**`, `src/interface/**`, or `src/infrastructure/**`.

**Markov data lifecycle:** optional at module level. When `MarkovPort.getMarkovData()` returns null (no Markov data), confidence is computed from the trend + outcome scores alone. When it returns data, confidence blends 70% base + 30% Markov probability (line 454-456 of current `computeReading()`).

---

## 5. MCP-Server Integration Points (G5b Scope)

### Current integration path: DIRECT DOMAIN IMPORT (not HTTP)

The six MCP kinh-dich tool handlers in `apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` do **not** call port 5005 via HTTP. They import kinh-dich domain logic directly from a parallel copy inside `apps/mcp-server/src/domain/services/kinhDich/`:

| Import target (in kinhDichTools.ts) | What it is | DDD violation? |
|---|---|---|
| `../../../../domain/services/kinhDich/kinhDichReading.js` | `computeReading()` + `MarkovData` type | YES — interface layer importing domain directly (within mcp-server, this is allowed; cross-service is the violation) |
| `../../../../domain/services/kinhDich/kinhDichFormatter.js` | `formatReading()` | Same |
| `../../../../domain/services/kinhDich/hexagramLibrary.js` | `QUE_META`, `QUE_DATA` | Same |
| `../../../../domain/services/kinhDich/hexagramBacktester.js` | `computeBacktest()`, `BacktestRow`, `PriceRow` | Same |
| `../../../../infrastructure/db/hexagramStore.js` | `storeReading`, `getLatestReading`, `recordTransition`, `getTopTransitions`, `getReadingsForBacktest` | Same |

The `apps/mcp-server/src/domain/services/kinhDich/` directory contains a **separate parallel copy** of the kinh-dich domain with individual files already extracted: `hexagramResolver.ts`, `haoEncoder.ts`, `nguHanhClassifier.ts`, `nuclearComputer.ts`, `transformedComputer.ts`, `kinhDichReading.ts`, `kinhDichFormatter.ts`, `hexagramLibrary.ts`, `hexagramBacktester.ts`, `kinhDichWrapper.ts`. This is a significant DDD cross-service coupling that G5b must resolve.

### MCP handlers requiring HTTP rewire (G5b deliverables)

All six tools in `registerKinhDichTools()` need rewiring to call the kinh-dich service at port 5005 via HTTP:

| Tool name | Current state | G5b rewire target |
|---|---|---|
| `get_kinhdich_reading` | Calls `computeHaoScores()` locally then `computeReading()` from mcp-server domain copy | HTTP POST/GET to `http://kinh-dich-service:5005/reading/{code}` |
| `get_market_hexagram` | Calls `computeReading("VNINDEX", scores)` from mcp-server domain copy | HTTP GET to `http://kinh-dich-service:5005/market` |
| `get_hexagram_history` | Calls `getReadingsForBacktest()` from mcp-server hexagramStore (SQLite) | HTTP endpoint needed on kinh-dich-service (new: `GET /readings/{code}/history?days=N`) |
| `get_transition_probabilities` | Calls `getTopTransitions()` from mcp-server hexagramStore | HTTP endpoint needed (new: `GET /hexagram/{number}/transitions?code=X`) |
| `run_hexagram_backtest` | Calls `computeBacktest()` + `getReadingsForBacktest()` from mcp-server | HTTP endpoint needed (new: `GET /backtest/{code}?days=N`) |
| `explain_hexagram` | Reads from `QUE_META` + `QUE_DATA` directly from mcp-server hexagramLibrary copy | HTTP endpoint needed (new: `GET /hexagram/{number}/explain`) |

**Important nuance for dev-kinh-dich:** The score-computation helpers (`computeHaoScores`, `computeSentimentScore`, `computeFundamentalsScore`, etc.) in `kinhDichTools.ts` query the **mcp-server's own SQLite DB** (via `getDb()` from mcp-server infrastructure). These score helpers are NOT kinh-dich-service domain — they are mcp-server integration glue that converts mcp-server market data into 6 input scores. Post-G5b architecture: mcp-server computes the 6 scores locally, then sends them to kinh-dich-service via HTTP for the pure hexagram computation. This mirrors the existing `kinh-dich-service` `PriceScorePort` design. The mcp-server should NOT be rewired to import `PriceScorePort` — it should POST the pre-computed scores to kinh-dich-service or include them in the request payload.

**G5a scope:** `apps/kinh-dich-service/src/domain/services.ts` `computeReading()` (the monolithic function) will be superseded by the `reading_composer` module. It should be moved to `src/_deprecated/services.ts` (with the `kinh-dich-pre-delete` tag) after the module ships. The embedded hexagram data (QUE_META, QUE_DATA, TRIGRAM_LINES) may be retained as shared constants or moved to `src/domain/hexagram-data.ts`.

---

## 6. R-FENCE Feasibility Confirmation

### 6.1 Actual ESM import style confirmed

Audit of `domain/`, `application/`, and `interface/` layers (`grep -rn "from.*\.js" src/domain/ src/application/ src/interface/`):

Every relative import in the service uses the `.js`-suffixed ESM style. Confirmed examples:

```typescript
// domain/services.ts (line 18)
} from './models.js';

// domain/repositories.ts (line 7)
import type { KinhDichStoredRow, MarkovData } from './models.js';

// application/usecases.ts (lines 8-11)
import { computeReading, QUE_META } from '../domain/services.js';
import type { KinhDichRepositoryPort, PriceScorePort } from '../domain/repositories.js';
import type { ReadingRequest, ReadingResponse, MarketReadingResponse } from './dtos.js';
import { InsufficientDataError, HexagramNotFoundError } from '../domain/errors.js';

// interface/handlers.ts (lines 9-10)
import type { ReadingUseCase, MarketHexagramUseCase } from '../application/usecases.js';
import { errorToStatus } from './serializers.js';

// interface/serializers.ts (line 7)
import { HexagramNotFoundError, InsufficientDataError } from '../domain/errors.js';
```

This is the canonical Bun ESM style (`moduleResolution: "bundler"` in `tsconfig.json`), matching what SI-3 §1.2 observed for kinh-dich and news-fetch.

### 6.2 R-2 risk assessment (eslint-plugin-boundaries pattern matching)

SI-3 §6.2 risk R-2: "does `eslint-plugin-boundaries` pattern `src/application/**/*` correctly match a raw import string like `../../application/dtos.js`?"

**Assessment: VIABLE with empirical confirmation still required at AC-4b.**

The `eslint-plugin-boundaries` plugin uses micromatch for glob patterns. The element pattern `src/application/**/*` is applied to the **resolved relative path** from the project root, not the raw import string. Given:
- Source file: `src/primitive/hexagram-resolver/index.ts`
- Import: `import type { ReadingRequest } from '../../application/dtos.js'`
- Resolved path from project root: `src/application/dtos.ts` (the `.js` suffix is resolved to `.ts` by the bundler)

The pattern `src/application/**/*` matches `src/application/dtos.ts`. The `.js` → `.ts` resolution occurs because ESLint processes the TypeScript source files (`.ts`), not the compiled output. The import specifier `../../application/dtos.js` is resolved by the TypeScript parser (which ESLint uses to locate files) to `src/application/dtos.ts` — matching the element pattern.

SI-3 §3.5 confirms: "The plugin uses micromatch for glob patterns applied to relative path resolution. The `.js` suffix is part of the raw import string, not the resolved path. The pattern `src/application/**/*` matches resolved path `src/application/dtos.ts`."

**If R-2 proves to be a real blocker during AC-4b:** The in-Option-A fallback (SI-3 §6.3) is to add `@typescript-eslint/parser` as an additional devDependency and add `languageOptions: { parser: tsParser }` to `eslint.config.mjs`. This explicitly forces ESLint to resolve `.js` imports via the TypeScript compiler, eliminating any suffix ambiguity. Estimated effort: under 5 minutes. Does NOT drop to Option C.

### 6.3 G4 deliberate-violation target confirmed

The charter G4 deliberate-violation example uses `src/primitive/hexagram-resolver/index.ts` importing from `../../application/dtos.js`. This is viable because:

1. **`resolveHexagram()` exists** in `domain/services.ts` (lines 272-281) and will be extracted to `src/primitive/hexagram-resolver/index.ts` in Phase 1.
2. **`src/application/dtos.ts`** exists in the brownfield with `ReadingRequest`, `ReadingResponse`, `MarketReadingResponse` — a real file to import from.
3. The import `import type { ReadingRequest } from '../../application/dtos.js'` is a genuine Fence-A violation (primitive importing application layer) on the exact import style already used throughout the service.

**Named primitive for G4 proof:** `hexagram-resolver`, from `resolveHexagram()` in `src/domain/services.ts`. Named domain function: `resolveHexagram()`. Named application DTO for the violation: `ReadingRequest` from `src/application/dtos.ts`.

### 6.4 R-FENCE summary

**Status: VIABLE**

`eslint-plugin-boundaries` (SI-3 Option A) is viable on this service's actual `.js`-suffixed ESM import style. The element patterns (`src/primitive/**/*`, `src/application/**/*`, etc.) will match the resolved source paths. The deliberate-violation proof (AC-4b) is feasible on the real codebase: `src/primitive/hexagram-resolver/index.ts` will exist at G4 time, and `../../application/dtos.js` is a valid import that resolves to the existing `src/application/dtos.ts`. Empirical confirmation at AC-4b is the binding gate — if R-2 bites, the 5-minute `@typescript-eslint/parser` fallback applies within Option A. No Option C fallback is preemptively recommended.

---

## 7. Phase 0 Exit Gate Readiness

| Check | Status | Notes |
|---|---|---|
| DDD layer structure documented | PASS | All 4 layers exist; no infra imports in domain/application |
| No `src/primitive/` or `src/module/` yet | PASS | Confirmed absent — factory starts from clean slate |
| Domain services identified | PASS | `computeReading()`, `classifyNguHanh()` — both confirmed pure |
| Primitive candidates mapped to exact source locations | PASS | 5 candidates, all from `domain/services.ts`, line numbers confirmed |
| Module candidate designed with port interface | PASS | `reading_composer` + `MarkovPort` (already in `domain/repositories.ts`) |
| MCP handler audit complete | PASS | 6 tools in kinhDichTools.ts, all need HTTP rewire (G5b); score helpers stay in mcp-server |
| G5a scope confirmed | PASS | `computeReading()` will be superseded; `src/_deprecated/` destination after module ships |
| R-FENCE: import style confirmed | PASS | `.js` suffix throughout domain/application/interface layers |
| R-FENCE: deliberate-violation target confirmed | PASS | `resolveHexagram()` → `hexagram-resolver` + `ReadingRequest` from `dtos.ts` |
| R-FENCE verdict | VIABLE | AC-4b empirical proof required; 5-min fallback documented |
| Minor DDD deviation flagged | RISK (low) | `config.ts` uses `process.env` not `Bun.env`; dev-kinh-dich to fix |
| Mcp-server parallel copy flagged | RISK (high, G5b) | mcp-server has its own `domain/services/kinhDich/` copy — full HTTP rewire needed for all 6 tools |

**Go/No-Go verdict: GO for Phase 1.**

No blockers. Primitive extraction can begin immediately. The major complexity in this pilot is G5b (6 MCP tools need HTTP rewire AND 4 new endpoints on kinh-dich-service), not the primitive extraction itself.
