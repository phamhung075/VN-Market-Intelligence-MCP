---
title: "P0-4 — Composition-Root Plan: technical-analysis"
date: "2026-05-22"
author: "dev-technical-analysis"
status: "READY-FOR-PHASE-1"
task: "TASK_P0-4"
charter_goal: "G3"
phase: 0
---

# P0-4 — Composition-Root Plan: `apps/technical-analysis/`

**Phase:** 0 (read-only audit + plan)
**Output blocks Phase 1:** composition-root rewrite task

---

## 1. Current State Map

### 1.1 Source File Inventory (9 files)

All files live under `apps/technical-analysis/src/`.

| # | File path | DDD Layer | Role | Lines |
|---|---|---|---|---|
| 1 | `src/index.ts` | Composition root (de facto) | DB open, DI wiring, server startup, `export default` for Bun | 31 |
| 2 | `src/domain/models.ts` | Domain | Value objects: `CandleStick`, `TechnicalIndicators` | 37 |
| 3 | `src/domain/repositories.ts` | Domain | Ports: `PriceHistoryRepository`, `TAIndicatorCalculator` | 22 |
| 4 | `src/domain/services.ts` | Domain | `CalculateTAService` — orchestrates repo + calculator, `determineTrend` signal | 58 |
| 5 | `src/application/dtos.ts` | Application | `ComputeTARequest`, `ComputeTAResponse` — I/O contracts | 21 |
| 6 | `src/application/usecases.ts` | Application | `ComputeTAUseCase.execute()` — DTO bridge from HTTP to domain | 26 |
| 7 | `src/infrastructure/calculator.ts` | Infrastructure | `TACalculatorImpl` — RSI/MACD/MA/BB math (Wilder EMA, population σ) | 101 |
| 8 | `src/infrastructure/repositories.ts` | Infrastructure | `SQLitePriceRepository` — `daily_ohlcv` SQL, read-only | 48 |
| 9 | `src/interface/handlers.ts` | Interface | `createRouter()` — Hono HTTP: `/health`, `POST /ta/indicators` | 41 |

Total: 9 source files, 385 lines.

### 1.2 Test File Inventory (3 files, under `__tests__/`)

| File | Tier | What it tests |
|---|---|---|
| `__tests__/unit/ta-calculator.test.ts` | Unit | `TACalculatorImpl` math correctness — 11 assertions |
| `__tests__/unit/calculate-ta-service.test.ts` | Unit | `CalculateTAService` with mocked ports — 6 assertions |
| `__tests__/integration/compute-ta-usecase.test.ts` | Integration | Real calculator + mock repo — 4 assertions |

### 1.3 Non-source Files

| File | Role |
|---|---|
| `package.json` | `module: "src/index.ts"`, `start: bun run src/index.ts` — entry point is hardwired here |
| `tsconfig.json` | ESNext/bundler, strict, includes `src/**/*` and `__tests__/**/*` |
| `Dockerfile` | `CMD ["bun", "run", "src/index.ts"]` — entry hardwired in Docker CMD |

---

## 2. Current Composition-Root: What `src/index.ts` Does Today

`src/index.ts` currently performs four responsibilities:

```
1. CONFIG READ         — PORT (env or 5003), DB_PATH (env or ./data/market.db)
2. INFRASTRUCTURE INIT — new Database(DB_PATH, { readonly:true, create:false })
3. DI WIRING           — calculator → priceRepo → taService → useCase → app
4. SERVER EXPORT       — export default { port: PORT, fetch: app.fetch }
   + side-effect console.log
```

This is a clean, minimal composition root already. It contains no business logic, no `if` conditions on data values, no calculations. The G3 charter requirement reads: "file must contain only import statements, interface wiring (DI bindings), and server startup." `src/index.ts` satisfies that intent today.

**The problem is not the content — it is the name and location.** The architect explicitly requires a file named `composition-root.ts` at `apps/technical-analysis/composition-root.ts` (not nested under `src/`). The reasons are:

- G3 QA verification script greps `apps/technical-analysis/composition-root.ts` by path — wrong path = G3 blocked.
- The three-tier pattern places composition root at the app root, not inside `src/`. `src/` is for DDD layers (domain/application/infrastructure/interface). The wiring layer sits above them.
- `package.json` and Dockerfile entry points must be updated to match.

---

## 3. DDD Layer Adherence — Current State

### 3.1 What is clean

| Layer | Verdict | Evidence |
|---|---|---|
| `domain/models.ts` | CLEAN | Zero imports from infra or interface |
| `domain/repositories.ts` | CLEAN | Only imports from `./models.js` (intra-domain) |
| `domain/services.ts` | CLEAN | Imports only domain interfaces (ports), no infra |
| `application/dtos.ts` | CLEAN | No imports at all — pure type declarations |
| `application/usecases.ts` | CLEAN | Imports `CalculateTAService` as type only, imports DTOs |
| `infrastructure/calculator.ts` | CLEAN | Imports TAIndicatorCalculator port from domain — correct direction |
| `infrastructure/repositories.ts` | CLEAN | Imports `Database` from `bun:sqlite` (external), domain types only |
| `interface/handlers.ts` | CLEAN | Imports `ComputeTAUseCase` from application only — no domain bypass |

### 3.2 Single remaining issue

`src/index.ts` imports from all four layers simultaneously (this is correct for a composition root — it is the one place that must do so). Renaming and relocating it removes it from the `src/` layer hierarchy and makes its cross-layer imports structurally explicit and intentional.

### 3.3 G3 QA grep verification results (current state)

```bash
grep -r "calculateRSI\|calculateMACD\|detectCross\|classifyZone" apps/technical-analysis/src/index.ts
# Result: 0 matches — PASS today
```

The domain operations are absent from the current entry point. G3 grep check will pass on the rewritten file too, provided no calculation logic migrates there.

---

## 4. External Dependencies and Side Effects in Current Wiring

| Dependency | Where | Side effect / note |
|---|---|---|
| `bun:sqlite` `Database` | `src/index.ts` line 8, `infrastructure/repositories.ts` line 8 | DB opened with `readonly:true, create:false` — safe, single connection |
| `hono` | `interface/handlers.ts` | HTTP framework — no side effect at import |
| `process.env['PORT']` | `src/index.ts` line 15 | Env read at startup |
| `process.env['DB_PATH']` | `src/index.ts` line 16 | Env read at startup |
| `console.log` | `src/index.ts` line 31 | Side-effect stdout print at startup |
| `export default { port, fetch }` | `src/index.ts` line 26-29 | Bun server start mechanism |

All side effects are in `src/index.ts`. The four layer files (`domain/`, `application/`, `infrastructure/`, `interface/`) are side-effect-free when imported. This is the correct pattern — all side effects belong in the composition root.

---

## 5. Target `composition-root.ts` Design

### 5.1 File location

```
apps/technical-analysis/composition-root.ts   ← NEW (clean rewrite, not rename)
apps/technical-analysis/src/                   ← unchanged
```

### 5.2 Exact content shape (no business logic)

```typescript
/**
 * Technical Analysis Microservice — Composition Root
 *
 * Responsibility: wire infrastructure adapters to domain ports, export server.
 * Rules (G3): only imports, DI bindings, server startup. No logic.
 */

// ── External ─────────────────────────────────────────────────────────────────
import { Database } from 'bun:sqlite';

// ── Infrastructure adapters ───────────────────────────────────────────────────
import { TACalculatorImpl }         from './src/infrastructure/calculator.js';
import { SQLitePriceRepository }    from './src/infrastructure/repositories.js';

// ── Domain service ────────────────────────────────────────────────────────────
import { CalculateTAService }       from './src/domain/services.js';

// ── Application use case ──────────────────────────────────────────────────────
import { ComputeTAUseCase }         from './src/application/usecases.js';

// ── Interface (HTTP router) ───────────────────────────────────────────────────
import { createRouter }             from './src/interface/handlers.js';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT    = parseInt(process.env['PORT']    ?? '5003', 10);
const DB_PATH = process.env['DB_PATH'] ?? './data/market.db';

// ── DI wiring ─────────────────────────────────────────────────────────────────
const db         = new Database(DB_PATH, { readonly: true, create: false });
const calculator = new TACalculatorImpl();
const priceRepo  = new SQLitePriceRepository(db);
const taService  = new CalculateTAService(priceRepo, calculator);
const useCase    = new ComputeTAUseCase(taService);
const app        = createRouter(useCase);

// ── Server export (Bun native HTTP) ──────────────────────────────────────────
export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`technical-analysis running on port ${PORT}`);
```

**What this file contains:** imports (11 lines), config constants (2 lines), DI bindings (5 lines), server export (4 lines), startup log (1 line). Zero `if` on data values. Zero calculations. Zero domain operations.

**G3 QA grep check will pass:**
```bash
grep -r "calculateRSI\|calculateMACD\|detectCross\|classifyZone" apps/technical-analysis/composition-root.ts
# Expected: 0 results
```

---

## 6. Migration Steps (Clean Rewrite — NOT rename of `src/index.ts`)

The architect was explicit: clean rewrite, not rename. `src/index.ts` must remain in place until all callers (package.json, Dockerfile) are updated atomically in the same commit.

### Step 1 — Create `composition-root.ts` (new file)

```
CREATE apps/technical-analysis/composition-root.ts
```

Content: as specified in §5.2 above. Import paths use `./src/` prefix since the file lives one level above `src/`.

### Step 2 — Update `package.json`

```json
// Before
"module": "src/index.ts",
"scripts": { "start": "bun run src/index.ts" }

// After
"module": "composition-root.ts",
"scripts": { "start": "bun run composition-root.ts" }
```

### Step 3 — Update `Dockerfile`

```dockerfile
# Before
CMD ["bun", "run", "src/index.ts"]

# After
CMD ["bun", "run", "composition-root.ts"]

# Also update COPY line: add composition-root.ts to runtime stage
COPY --from=builder /app/composition-root.ts ./
```

### Step 4 — Delete `src/index.ts`

```
DELETE apps/technical-analysis/src/index.ts
```

This is safe only after Step 1-3 are done and tests pass. `src/index.ts` is not imported by any test file — tests import from `src/domain/`, `src/application/`, and `src/infrastructure/` directly. Deleting it does not break any test.

### Step 5 — Run tests + type-check

```bash
cd apps/technical-analysis && bun test && bun tsc --noEmit
```

All 21 existing assertions must remain GREEN. No new tests needed for the composition root itself (it has no logic to test — it is wiring only).

### Step 6 — Add HTTP contract document

Per G3: "QA checks that `apps/technical-analysis/src/interface/` contains an HTTP contract document (OpenAPI YAML or equivalent)."

```
CREATE apps/technical-analysis/src/interface/openapi.yaml
```

Minimum content: OpenAPI 3.0 document describing `GET /health` and `POST /ta/indicators` (request body + response schemas).

This is a new file, not a modification of existing files.

---

## 7. What Stays / What Moves / What Gets Deleted

| File | Action | Reason |
|---|---|---|
| `src/domain/models.ts` | STAYS | Pure value objects, no change needed |
| `src/domain/repositories.ts` | STAYS | Pure ports, no change needed |
| `src/domain/services.ts` | STAYS | Business logic belongs here, correct |
| `src/application/dtos.ts` | STAYS | Correct location |
| `src/application/usecases.ts` | STAYS | Correct location |
| `src/infrastructure/calculator.ts` | STAYS | Correct location |
| `src/infrastructure/repositories.ts` | STAYS | Correct location |
| `src/interface/handlers.ts` | STAYS | Correct location |
| `src/index.ts` | DELETED | Replaced by `composition-root.ts` |
| `composition-root.ts` | CREATED | New canonical composition root at app root |
| `package.json` | MODIFIED | Entry point updated: `src/index.ts` → `composition-root.ts` |
| `Dockerfile` | MODIFIED | CMD + COPY updated |
| `src/interface/openapi.yaml` | CREATED | G3 HTTP contract requirement |

**Summary:** 1 file deleted, 2 files created, 2 files modified, 8 files unchanged.

---

## 8. Risk Assessment Per File Touched

| File | Risk | Mitigation |
|---|---|---|
| `composition-root.ts` (new) | LOW — pure wiring, no logic | Import paths differ (`./src/` prefix vs `./`). Verify with `bun tsc --noEmit` before commit. |
| `src/index.ts` (delete) | LOW — not imported by tests | Confirm via `grep -r "src/index" apps/technical-analysis/__tests__/` before delete. Expected: 0 results. |
| `package.json` (modify) | MEDIUM — if Dockerfile/CI still reference old path, service fails to start | Atomic commit: change both `package.json` and `Dockerfile` in same commit. |
| `Dockerfile` (modify) | MEDIUM — Docker build uses two stages; composition-root.ts must be in COPY for runtime stage | Add `COPY --from=builder /app/composition-root.ts ./` to runtime stage. Verify with local `docker build` (ops responsibility). |
| `src/interface/openapi.yaml` (new) | LOW — documentation only, not imported by code | Validate YAML syntax only. |

**No risk to business logic:** all `src/domain/`, `src/application/`, `src/infrastructure/`, and `src/interface/handlers.ts` files are untouched. The refactor is purely a wiring relocation.

---

## 9. Backwards-Compat Plan (How Callers Transition)

The only external caller of `apps/technical-analysis/` is `apps/mcp-server/` (via HTTP, not import). The service runs on port 5003. The HTTP API contract (`POST /ta/indicators`, `GET /health`) does not change. There is no TypeScript import path to update outside this app.

**Caller impact: ZERO.** This is a pure internal restructuring.

Docker Compose uses `bun run src/index.ts` → after change uses `bun run composition-root.ts`. The container restart is the only operational step required (ops responsibility, not dev).

If the ops restart fails: rollback is one `git revert` — both entry-point files are tiny.

---

## 10. G3 Acceptance Gates (QA Verification Checklist)

These must ALL pass before G3 can be marked YES:

1. **File exists at correct path:**
   ```bash
   test -f apps/technical-analysis/composition-root.ts && echo PASS
   ```

2. **No business logic in composition root (manual read + grep):**
   ```bash
   grep -c "if\|for\|while\|calculateRSI\|calculateMACD\|detectCross\|classifyZone" \
     apps/technical-analysis/composition-root.ts
   # Expected: 0
   ```

3. **HTTP contract document exists:**
   ```bash
   test -f apps/technical-analysis/src/interface/openapi.yaml && echo PASS
   ```

4. **Old entry point deleted:**
   ```bash
   test ! -f apps/technical-analysis/src/index.ts && echo PASS
   ```

5. **All tests still GREEN:**
   ```bash
   cd apps/technical-analysis && bun test
   # Expected: 21 pass, 0 fail
   ```

6. **Type-check clean:**
   ```bash
   cd apps/technical-analysis && bun tsc --noEmit
   # Expected: 0 errors
   ```

---

## 11. Sprint Sequence (Recommended)

This plan is self-contained and has no external dependencies. Recommended execution sequence for Phase 1:

| Sprint step | Action | Owner | Estimate |
|---|---|---|---|
| P1-A | Create `composition-root.ts` per §5.2 | dev-technical-analysis | 15 min |
| P1-B | Update `package.json` entry point | dev-technical-analysis | 2 min |
| P1-C | Update `Dockerfile` CMD + COPY | dev-technical-analysis | 5 min |
| P1-D | Create `src/interface/openapi.yaml` | dev-technical-analysis | 20 min |
| P1-E | Delete `src/index.ts`, run tests + tsc | dev-technical-analysis | 5 min |
| P1-F | Commit (all changes atomic) | dev-technical-analysis | 5 min |
| P1-G | QA runs G3 acceptance gates | qa | 10 min |

Total estimated time: ~1 hour end-to-end.

All steps can be done in a single commit. The `src/index.ts` delete and `composition-root.ts` create are the only risky coordination — they must be in the same atomic commit to avoid a window where neither entry point exists.
