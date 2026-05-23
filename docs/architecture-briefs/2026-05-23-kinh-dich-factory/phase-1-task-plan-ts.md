---
title: "Phase 1 Task Plan — Kinh-Dich Microservice (TypeScript/Bun)"
date: "2026-05-24"
author: "architect (P0-KD-4)"
pilot: "kinh-dich"
fleet_pilot_number: 4
phase: "1"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md"
language: "TypeScript"
runtime: "bun"
deliverable: "PHASE0-D6 (phase_1_task_plan)"
parent_pattern: "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md (stock-price pilot P0-SP-6)"
service_facts_source: "docs/data/system-map.json (jq verified): zone=apps/kinh-dich-service, port=5005 (internal==external), language=ts, runtime=bun"
---

# Phase 1 Task Plan — Kinh-Dich Microservice (TypeScript/Bun)

**Generated:** 2026-05-24 by architect (Phase 0, task P0-KD-4)
**Pattern:** mirrored from stock-price `phase-1-task-plan-go.md` structure; specialized for kinh-dich TypeScript/Bun native service
**Language:** TypeScript (locked at charter creation — service is already TS/Bun; no rewrite step)
**Status:** READY-FOR-DISPATCH to dev-kinh-dich

---

## Phase 1 Overview

Phase 1 delivers the **TypeScript/Bun scaffold additions** and the **first primitive end-to-end** (`hexagram-resolver`), the **R-FENCE discovery gate**, the **module stub** (`reading_composer`), the **dashboard stub**, and the **sandbox green** baseline.

**Key difference from Go pilot:** kinh-dich is **already a running TypeScript/Bun service**. Phase 1 does NOT recreate `package.json`, `src/index.ts`, or the `src/` DDD layers — they already exist and are clean (per brownfield inventory §2). Instead, Phase 1 **adds** the factory scaffolding on top of the existing service:

- `src/sandbox/` (new — sandbox runner)
- `src/primitive/` (new — primitives)
- `src/module/reading_composer/` (new — module stub)
- `dashboard/` (new — HTML trust layer)

The `package.json` has only `hono` as a runtime dependency, `bun-types` and `typescript` as devDependencies. The sandbox is a pure Bun/TS harness — **no CGO analog exists here**. The per-service risk gate is **R-FENCE**: the first TS service to exercise `eslint-plugin-boundaries` (SI-3 Option A). Phase 1 discovers the exact ESM import style; Phase 2 proves the fence catches violations (AC-4b deliberate-violation proof).

**Goal:** TS/Bun scaffold + first 3 primitives + module stub + dashboard stub + sandbox green, all with zero infrastructure imports in primitive/module/sandbox. R-FENCE discovery gate (import style confirmed) must be recorded in P1-B1 before module stub begins.

Also folded into Phase 1: the minor `config.ts` Bun.env fix (replacing `process.env` with `Bun.env` per dev-standards — one-line change, zero risk).

---

## Phase 1 Scope vs Prior Pilots

| Item | TA Phase 1 | Macro Phase 1 | Stock-Price Phase 1 (Go) | Kinh-Dich Phase 1 (TS) |
|---|---|---|---|---|
| Language rewrite | YES (TS→Go) | YES (TS→Go) | NO — already Go | **NO** — already TS/Bun |
| `go.mod` / `package.json` creation | YES (Go) | YES (Go) | NO — already exists | **NO** — already exists |
| `src/index.ts` / `cmd/server/main.go` creation | YES | YES | NO — already exists | **NO** — already exists (clean) |
| DDD layer scaffold | YES | YES | NO — already exists | **NO** — already exists (clean) |
| `src/sandbox/` creation | YES | YES | YES (`cmd/sandbox/`) | **YES** — new addition |
| `src/primitive/` creation | YES (5 prim.) | YES (1 prim.) | YES (3 prim.) | **YES** (3 prim. — P1-B1, P1-B2, P1-B3) |
| Module stub | YES (1 module) | YES (1 module) | YES (`price_resolution`) | **YES** (1 module: `reading_composer`) |
| Dashboard stub | YES | YES | YES | **YES** |
| R-CGO gate | N/A | N/A | YES — HARD GATE | **N/A — no CGO in TS** |
| R-FENCE discovery | N/A (Go fleet) | N/A (Go fleet) | N/A (Go fleet) | **YES — FIRST TS fleet service; import style discovery in P1-B1** |
| `eslint.config.mjs` creation | N/A | N/A | N/A | **Phase 2 only** — Phase 1 discovers; Phase 2 enforces |
| `process.env` → `Bun.env` fix | N/A | N/A | N/A | **YES** — folded into P1-A (config.ts one-liner) |

**Duration:** 2–3 sprints (10–12 dev-hours estimated)
**Owner:** dev-kinh-dich
**WIP:** 1 sequential (charter wip_limit)

---

## Pre-Revert Tags (Phase 1 Scope)

Phase 1 only scaffolds new directories — no deletion, no CI activation, no fence enforcement. Phase 2 pre-revert tags are the dev-kinh-dich responsibility at those task times:

| Tag | Phase | Who creates | Purpose |
|---|---|---|---|
| `kinh-dich-pre-ci` | Phase 2 — before `eslint.config.mjs` creation + `bunx eslint` CI activation (G4 fence freeze) | dev-kinh-dich | G4 fence freeze anchor |
| `kinh-dich-pre-delete` | Phase 2 — before `git mv` of superseded `domain/services.ts` logic to `src/_deprecated/` | dev-kinh-dich | G5a rollback anchor |
| `kinh-dich-pre-inject` | Phase 2 — before bug-injection commit (G10) | qa | G10 rollback anchor |

PM must reference these tags in all Phase 2 handoff specs. None of these tags are created in Phase 1.

---

## Task Ledger

| ID | Title | Owner | Goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|-------|----------------|--------|------------|-----|----------|
| **P1-A** | `src/sandbox/runner.ts` — Bun sandbox runner (flags: --tier, --module, --scenario) + `config.ts` Bun.env fix | dev-kinh-dich | G7, G12 | P1-B1 | — | 45m | 6 |
| **P1-B1** | Extract first primitive: `src/primitive/hexagram-resolver/` + test + 3 scenario JSONs + **R-FENCE discovery gate** | dev-kinh-dich | G1, G7, G12 | P1-B2 | P1-A | 2h | 8 (incl. 3 R-FENCE discovery) |
| **P1-B2** | Extract second primitive: `src/primitive/ngu-hanh-classifier/` + test + 3 scenario JSONs | dev-kinh-dich | G1, G7, G12 | P1-B3 | P1-B1 | 1h | 5 |
| **P1-B3** | Extract third primitive: `src/primitive/hao-encoder/` + test + 3 scenario JSONs | dev-kinh-dich | G1, G7, G12 | P1-C | P1-B2 | 1.5h | 6 |
| **P1-C** | Module stub: `src/module/reading_composer/` — port + composition function (imports primitives via MarkovPort) | dev-kinh-dich | G2, G12 | P1-D | P1-B3 | 1h | 7 |
| **P1-D** | Dashboard stub: `apps/kinh-dich-service/dashboard/index.html` — 3 panels (primitives, module, microservice), NOT-RUN state | dev-kinh-dich | G6, G8, G9, G12 | P1-E | P1-C | 2h | 7 |
| **P1-E** | Edit-rerun handler + env audit (zero DB creds, zero API keys in sandbox env) | dev-kinh-dich | G7, G8, G12 | P1-F | P1-D | 1h | 6 |
| **P1-F** | Flex / catchup — `src/primitive/reading-scorer/` optional 4th primitive (if Phase 1 time allows) | dev-kinh-dich | G1 | P1-G | P1-E | 1h | 4 |
| **P1-G** | Phase 1 close-gate verification (QA) — sandbox all-green, dashboard ≥90%, G12 streak confirmed | qa | G1, G2, G6, G7, G8, G12 | — | P1-F | 30m | 5 |

**Total atomic tasks:** 9 (P1-A through P1-G)
**Total estimated effort:** ~10–12 dev-hours (single agent, WIP=1)
**Total AC count: 54** (A:6 + B1:8 + B2:5 + B3:6 + C:7 + D:7 + E:6 + F:4 + G:5)

---

## Per-Task Acceptance Criteria

### P1-A — `src/sandbox/runner.ts` + `config.ts` Bun.env Fix

**Files touched:**
- `apps/kinh-dich-service/src/sandbox/runner.ts` (CREATE)
- `apps/kinh-dich-service/src/infrastructure/config.ts` (MODIFY — `process.env` → `Bun.env` one-liner)

**Background:** The sandbox runner drives all G7, G8, G12 verification. It MUST import ONLY `src/primitive/*` and `src/module/*` — zero infrastructure imports (no SQLite, no Hono, no HTTP client). Hexagram logic is pure compute; the sandbox is credential-free by nature.

The `config.ts` fix is folded here as the smallest atomic change. `process.env` violates dev-standards §Coding Standards for Bun services. One-line change; zero risk; zero follow-on impact (the composition root uses `config.ts`, which is NOT imported by sandbox/primitive/module).

**AC-1:** Sandbox accepts three flags:
- `--tier` (values: `primitive` | `module` | `all`) — which sandbox tier to run
- `--module` (value: `kinh-dich`) — module identifier for scenario path resolution
- `--scenario` (values: `all` | path to a specific JSON file)

**AC-2:** Scenario JSON files are loaded from `docs/scenarios/kinh-dich/primitives/` (for `--tier=primitive`) or `docs/scenarios/kinh-dich/module/` (for `--tier=module`). Zero live HTTP calls, zero SQLite connections, zero Hono imports.

**AC-3:** Exits 0 if all loaded scenarios pass; exits non-zero if any scenario fails. Prints per-scenario PASS/FAIL summary to stdout.

**AC-4:** Zero credential or infrastructure reads:
```bash
grep -c "DB_PATH\|KINH_DICH_DB\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|infrastructure\|hono\|SQLite" \
  apps/kinh-dich-service/src/sandbox/runner.ts
```
Must return 0.

**AC-5 (Bun.env fix):** `grep -n "process\.env" apps/kinh-dich-service/src/infrastructure/config.ts` returns 0. `grep -n "Bun\.env" apps/kinh-dich-service/src/infrastructure/config.ts` returns ≥1 match per replaced occurrence.

**AC-6 (zero-import pre-check):**
```bash
grep -rn "from.*infrastructure\|from.*hono\|from.*application\|from.*interface" \
  apps/kinh-dich-service/src/sandbox/runner.ts
```
Must return 0. Evidence pasted into handoff.

**Hard gate:** AC-6 (zero infrastructure imports in sandbox) must pass before P1-B1 is dispatched. If this fails, P1-A is BLOCKED — investigate import chain.

---

### P1-B1 — First Primitive: `hexagram-resolver` + R-FENCE Discovery Gate

**Files touched:**
- `apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts` (CREATE)
- `apps/kinh-dich-service/src/primitive/hexagram-resolver/index.test.ts` (CREATE)
- `docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/hexagram-resolver-edge.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/hexagram-resolver-failure.json` (CREATE)

**Background:** `hexagram-resolver` maps 6 binary line signals → a hexagram number (quẻ chính) via two table lookups: `TRIGRAM_LINES` (6-line → 3-line upper/lower trigram codes) and `TRIGRAMS_TO_QUE` (trigram pair → hexagram number). Currently implemented as `resolveHexagram()` at lines 272–281 of `src/domain/services.ts`, with lookup tables `TRIGRAM_LINES` (L23–L32) and `TRIGRAMS_TO_QUE` (L198–L201).

This primitive is chosen first because: (a) it is standalone with no cross-primitive dependencies, (b) it is the G4 deliberate-violation proof target (the `import type { ReadingRequest } from '../../application/dtos.js'` proof pair confirmed in P0-KD-1 §6.3), and (c) `nuclear-hexagram-computer` depends on it — extracting it first unblocks that later extraction.

**Exported interface:**
```typescript
// src/primitive/hexagram-resolver/index.ts
export function resolveHexagram(signals: number[]): number;
// signals: 6-element array of binary (0 | 1) values
// returns: hexagram number (1-64)
// throws: Error('Unknown trigram pattern') on invalid input
```

The `TRIGRAM_LINES` and `TRIGRAMS_TO_QUE` constant tables are co-located in `index.ts`. No external module imports — only TypeScript/Bun built-ins.

**AC-1:** `src/primitive/hexagram-resolver/index.ts` exports `resolveHexagram(signals: number[]): number`. No infrastructure imports, no application imports, no module imports. Self-contained with embedded lookup tables.

**AC-2:** Unit test with `bun:test`, ≥5 test cases:
- Valid 6-signal array → correct hexagram number (golden: known trigram pair from `TRIGRAMS_TO_QUE`)
- All-zero signals → correct hexagram
- All-one signals → correct hexagram
- Signals length !== 6 → throws `Error` (failure: input validation)
- Invalid trigram code not in `TRIGRAMS_TO_QUE` → throws `Error('Unknown trigram pattern')`

**AC-3:** `cd apps/kinh-dich-service && bun test src/primitive/hexagram-resolver/` exits 0.

**AC-4 (sandbox green):** `cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all` exits 0. Paste sandbox output into handoff doc as evidence.

**Scenario JSON spec (in `docs/scenarios/kinh-dich/primitives/`):**
- `hexagram-resolver-golden.json` — signals=[1,0,1,0,1,0], expected hexagram number (e.g., Quẻ Thuần Càn = 1 when upper+lower are both Càn trigram)
- `hexagram-resolver-edge.json` — signals=[0,0,0,0,0,0] → expected hexagram (Quẻ Thuần Khôn = 2)
- `hexagram-resolver-failure.json` — signals=[1,0] (length 2) → expected: error captured in trace output, not a process crash

**AC-5 — Fence-A pre-check:**
```bash
grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" \
  apps/kinh-dich-service/src/primitive/hexagram-resolver/
```
Must return 0 (zero cross-layer imports). Evidence pasted into handoff.

**AC-6 — R-FENCE discovery gate (Phase 1 discovery — Phase 2 enforcement):**

Dev-kinh-dich records the **exact ESM import style** used throughout the service. During file creation, confirm by reading the existing files:
```bash
grep -rn "from.*\.js'" apps/kinh-dich-service/src/domain/ apps/kinh-dich-service/src/application/ | head -5
```
Expected output: imports with `.js` suffix (e.g., `from './models.js'`, `from '../domain/services.js'`).

Record in the P1-B1 completion handoff:
- Import style confirmed: e.g., `import type { ReadingRequest } from '../../application/dtos.js'`
- Phase 2 G4 task will use this discovery to calibrate the deliberate-violation proof.
- Deliberate violation pair: `src/primitive/hexagram-resolver/index.ts` adding `import type { ReadingRequest } from '../../application/dtos.js'` → MUST produce non-zero `bunx eslint` exit with "Fence-A" in output.

**This discovery is Phase 1. The AC-4b deliberate-violation proof is Phase 2 (G4 task). Phase 1 only records which import style is active.**

**AC-7 — R-FENCE discovery verdict:**
Dev-kinh-dich writes the following line in the P1-B1 handoff `§R-FENCE Discovery`:
```
Import style confirmed: .js-suffixed ESM (e.g., from '../../application/dtos.js').
Phase 2 G4 deliberate-violation pair calibrated to this style.
R-FENCE discovery: RECORDED.
```

**AC-8 — G12 DoD Gate (streak task #1):** Sandbox all-green before RETURN block is written.

**Hard gate:** R-FENCE discovery (AC-6 + AC-7) must be recorded before P1-B2 is dispatched. This does NOT block on AC-4b proof — that is Phase 2.

---

### P1-B2 — Second Primitive: `ngu-hanh-classifier`

**Files touched:**
- `apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts` (CREATE)
- `apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.test.ts` (CREATE)
- `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-golden.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-edge.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/ngu-hanh-classifier-failure.json` (CREATE)

**Background:** `classifyNguHanh()` (L340–L369 of `domain/services.ts`) is already exported from `domain/services.ts` — it is the **lowest-extraction-complexity** primitive in the set. Maps lower/upper trigram element strings → `NguHanhResult` (dynamic + score + interpretation) via two constant tables: `GENERATION` (L236–L239) and `DESTRUCTION` (L240–L242). Pure table lookup, zero I/O.

**Exported interface:**
```typescript
// src/primitive/ngu-hanh-classifier/index.ts
export function classifyNguHanh(lower: string, upper: string): NguHanhResult;
// NguHanhResult: { dynamic: string; score: number; interpretation: string }
```
The `GENERATION` and `DESTRUCTION` tables are co-located in `index.ts`.

**AC-1:** `index.ts` exports `classifyNguHanh(lower: string, upper: string): NguHanhResult`. The `NguHanhResult` type is defined in `index.ts` (or imported from `src/domain/models.ts` if the type lives there — domain → domain import is Fence-compliant). Zero application/interface/infrastructure imports.

**AC-2:** Unit test with `bun:test`, ≥5 test cases:
- Generation relationship (e.g., Water→Wood) → `dynamic: 'SINH'`
- Destruction relationship (e.g., Wood→Earth) → `dynamic: 'KHAC'`
- Neutral relationship (same element) → `dynamic: 'BINH'`
- Unknown element string → defined behavior (returns `dynamic: 'BINH'` or throws — dev-kinh-dich decides and documents)
- Score range validation: all returned scores are numeric

**AC-3:** `cd apps/kinh-dich-service && bun test src/primitive/ngu-hanh-classifier/` exits 0.

**AC-4 — Fence-A + R-FENCE inherited:**
```bash
grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" \
  apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/
```
Must return 0. R-FENCE discovery already recorded in P1-B1; subsequent primitives inherit the recorded style.

**AC-5 (sandbox green):** `bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all` exits 0 (now covering both P1-B1 and P1-B2 scenarios). Evidence pasted.

**AC-5b — G12 DoD Gate (streak task #2):** Sandbox all-green (all scenarios across hexagram-resolver + ngu-hanh-classifier) before RETURN block.

---

### P1-B3 — Third Primitive: `hao-encoder`

**Files touched:**
- `apps/kinh-dich-service/src/primitive/hao-encoder/index.ts` (CREATE)
- `apps/kinh-dich-service/src/primitive/hao-encoder/index.test.ts` (CREATE)
- `docs/scenarios/kinh-dich/primitives/hao-encoder-golden.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/hao-encoder-edge.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/hao-encoder-failure.json` (CREATE)

**Background:** `classifyHao()` (L245–L249) + `encodeHaos()` (L252–L266) map 6 raw float scores in [-1, +1] → 6 `HaoReading` objects (state + binary + isChanging). The primitive co-locates all threshold constants: `LAO_DUONG_THRESHOLD` (L205), `THIEU_DUONG_THRESHOLD` (L206), `LAO_AM_THRESHOLD` (L207), and the `STATE_TO_BINARY` / `STATE_TO_CHANGING` / `HAO_LABELS` lookup tables (L209–L223). Pure threshold math — no I/O.

**Exported interface:**
```typescript
// src/primitive/hao-encoder/index.ts
export interface HaoReading {
  state: string;      // 'LAO_DUONG' | 'THIEU_DUONG' | 'LAO_AM' | 'THIEU_AM'
  binary: number;     // 0 | 1
  isChanging: boolean;
  label: string;
}

export function classifyHao(score: number): HaoReading;
export function encodeHaos(scores: number[]): HaoReading[];
// scores: 6-element array of floats in [-1, +1]
// throws if scores.length !== 6
```

**AC-1:** `index.ts` exports `HaoReading` interface + `classifyHao(score: number): HaoReading` + `encodeHaos(scores: number[]): HaoReading[]`. All threshold constants embedded. Zero application/interface/infrastructure imports.

**AC-2:** Unit test with `bun:test`, ≥6 test cases:
- Score > LAO_DUONG_THRESHOLD → state='LAO_DUONG', binary=1, isChanging=true
- THIEU_DUONG_THRESHOLD < score ≤ LAO_DUONG_THRESHOLD → state='THIEU_DUONG', binary=1, isChanging=false
- score < LAO_AM_THRESHOLD → state='LAO_AM', binary=0, isChanging=true
- Remaining range → state='THIEU_AM', binary=0, isChanging=false
- `encodeHaos([1,0,-1,0.5,-0.5,0.8])` → array of 6 HaoReadings
- `encodeHaos` with length !== 6 → throws Error

**AC-3:** `cd apps/kinh-dich-service && bun test src/primitive/hao-encoder/` exits 0.

**AC-4 — Fence-A + R-FENCE inherited:**
```bash
grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" \
  apps/kinh-dich-service/src/primitive/hao-encoder/
```
Must return 0.

**AC-5:** `bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all` exits 0 (all 9 scenarios: B1×3 + B2×3 + B3×3). Evidence pasted.

**AC-6 — G12 DoD Gate (streak task #3):** Sandbox all-green (all 9 scenarios across B1 + B2 + B3) before RETURN block. This task completes the G12 streak #3 (QA must verify this task follows the DoD rule for the third consecutive time).

---

### P1-C — Module Stub: `src/module/reading_composer/`

**Files touched:**
- `apps/kinh-dich-service/src/module/reading_composer/ports.ts` (CREATE)
- `apps/kinh-dich-service/src/module/reading_composer/index.ts` (CREATE)
- `apps/kinh-dich-service/src/module/reading_composer/index.test.ts` (CREATE)
- `docs/scenarios/kinh-dich/module/reading-composer-golden.json` (CREATE)
- `docs/scenarios/kinh-dich/module/reading-composer-edge.json` (CREATE)

**Background:** The module stub composes the 3 confirmed primitives via the existing `MarkovPort` (already defined in `src/domain/repositories.ts` as `KinhDichRepositoryPort.getMarkovData()`). The module mirrors the full `computeReading()` orchestration in `domain/services.ts` (L375–L512) but decomposes it: primitives handle the pure transforms, the MarkovPort injection eliminates the SQLite dependency from the module path.

**Fence-B:** module may import `src/primitive/**` and `src/domain/**`. It MUST NOT import `src/application/**`, `src/interface/**`, or `src/infrastructure/**`.

**`ports.ts` — MarkovPort (reuse existing interface):**
```typescript
// src/module/reading_composer/ports.ts
// Re-exports the existing port from domain/repositories.ts — no new interface needed.
// The SQLiteKinhDichRepository in src/infrastructure/repositories.ts already implements it.
export type { KinhDichRepositoryPort as MarkovPort } from '../../domain/repositories.js';
```
If the existing `KinhDichRepositoryPort` exposes methods beyond `getMarkovData()`, the module stub may instead define a slimmer `MarkovPort` interface inline and have the infra impl satisfy it structurally (TypeScript structural typing). Dev-kinh-dich decides — both approaches are Fence-B compliant.

**`index.ts` — module struct:**
```typescript
// src/module/reading_composer/index.ts
import { encodeHaos } from '../../primitive/hao-encoder/index.js';
import { resolveHexagram } from '../../primitive/hexagram-resolver/index.js';
import { classifyNguHanh } from '../../primitive/ngu-hanh-classifier/index.js';
import type { KinhDichReading, MarkovData } from '../../domain/models.js';
// ... additional domain types as needed

export interface MarkovPort {
  getMarkovData(hexagramNumber: number): MarkovData | null;
}

export class ReadingComposer {
  constructor(private readonly markov: MarkovPort) {}
  compose(stockCode: string, scores: number[]): KinhDichReading { /* ... */ }
}
```
Phase 1: the `compose()` function calls primitives in the 10-step order documented in brownfield §4 (encode haos → resolve hexagram → compute hoQue → compute bienQue → classify nguHanh → score reading → majority vote → confidence blend). `reading-scorer` and `nuclear-hexagram-computer` are NOT yet extracted — the module stub calls those steps inline (delegating to `domain/services.ts` helpers directly OR stubbing the output) until Phase 2 extracts them. Dev-kinh-dich chooses the stub strategy. The module must still produce a structurally valid `KinhDichReading` for scenario verification.

**AC-1:** `ports.ts` defines or re-exports a `MarkovPort` interface with `getMarkovData(hexagramNumber: number): MarkovData | null` signature only. Zero infrastructure imports.

**AC-2 — Fence-B (critical):**
```bash
grep -rn "from.*application\|from.*interface\|from.*infrastructure" \
  apps/kinh-dich-service/src/module/reading_composer/
```
Must return 0. Fence-B: module never imports application, interface, or infrastructure layers.

**AC-3:** `cd apps/kinh-dich-service && bun test src/module/reading_composer/` exits 0. Test uses a mock `MarkovPort` implementation (not the real SQLite infra impl).

**AC-4 — No cross-module imports:**
```bash
grep -rn "from.*src/module" apps/kinh-dich-service/src/module/reading_composer/
```
Must return 0 (G2 QA check pattern — no module-to-module imports).

**AC-5:** Module-level sandbox: `bun run src/sandbox/runner.ts --tier=module --module=kinh-dich --scenario=all` exits 0.

**Module scenario JSON spec (both in `docs/scenarios/kinh-dich/module/`):**
- `reading-composer-golden.json` — input: `{ stockCode: "VCB", scores: [0.8, -0.3, 0.6, 0.1, -0.7, 0.4], markovData: null }` → output: `KinhDichReading` with all fields populated (haos array, hexagram number, nguHanh, tradingSignal, confidence)
- `reading-composer-edge.json` — input: same but with `markovData` provided (non-null) → output: KinhDichReading with Markov-blended confidence (≠ base confidence)

**AC-6 — All-tier sandbox:**
```bash
cd apps/kinh-dich-service
bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Must exit 0. Evidence pasted into handoff.

**AC-7 — G12 DoD Gate:** Both sandbox tiers (`--tier=primitive` and `--tier=module`) exit 0 before RETURN block is written.

---

### P1-D — Dashboard Stub: `apps/kinh-dich-service/dashboard/index.html`

**Files touched:** `apps/kinh-dich-service/dashboard/index.html` (CREATE)

**Background:** Three-panel HTML dashboard (the 3-panel standard per charter §G6). Renders from scenario trace JSON. `file://` works with zero network calls, zero CDN, zero live DB. **This is NOT SI-2.** SI-2 (fleet dashboard index at `docs/dashboards/index.html`) belongs to the stock-price pilot. kinh-dich G6 creates `apps/kinh-dich-service/dashboard/index.html` only.

**AC-1:** File opens via `file://` in a browser without any web server. Zero external CDN requests (no `<script src="https://...">`, no `<link rel="stylesheet" href="https://...">`). Zero fetch calls to port 5005 or any HTTP endpoint.

**AC-2:** Three panels visible:
- **Primitives panel** — cards for: `hexagram-resolver`, `ngu-hanh-classifier`, `hao-encoder` (all showing NOT-RUN state initially)
- **Module panel** — card for `reading_composer` (NOT-RUN state)
- **Microservice panel** — card for the `kinh-dich` service (port 5005 per system-map.json — displayed as a label, never hardcoded in fetch logic)

**AC-3:** Status display is honest — NOT-RUN when sandbox has not been executed. No false greens. QA verifies by opening the HTML file cold (no prior sandbox run).

**AC-4 — PO Playwright compatibility (Path B pre-validation):** Dashboard renders correctly when opened via `file://`:
- ZERO console errors (verified manually or via Playwright)
- All cards (3 primitive + 1 module + 1 microservice) are present in the DOM
- NOT-RUN status is displayed honestly

**AC-5:** Zero credentials in dashboard HTML:
```bash
grep -c "DB_PATH\|KINH_DICH_DB\|API_KEY\|SECRET\|TOKEN\|PASSWORD" \
  apps/kinh-dich-service/dashboard/index.html
```
Must return 0.

**AC-6:** Clone color scheme and layout from TA's `apps/technical-analysis/dashboard/index.html` and macro's `apps/macro-indicators/dashboard/index.html` — substitute kinh-dich content (primitive names, module name, service name, port 5005). G6 SI-2 note embedded as a comment in `index.html`:
```html
<!-- SI-2 NOTE: This is apps/kinh-dich-service/dashboard/index.html — kinh-dich local service dashboard.
     SI-2 fleet index (docs/dashboards/index.html) is stock-price's G6 deliverable. Do NOT merge. -->
```

**AC-7 — G12 DoD Gate:** Sandbox all-green (all scenarios: B1+B2+B3 primitives + C module) before any primitive card is allowed to show GREEN status in the HTML.

---

### P1-E — Edit-Rerun Handler + Env Audit

**Files touched:** `apps/kinh-dich-service/dashboard/index.html` (MODIFY — add rerun handler)

**Background:** G7 trust contract — user edits a scenario JSON (e.g., changes 6 input scores in `hexagram-resolver-golden.json`), refreshes the dashboard, sees the new hexagram reading. The rerun handler invokes the Bun sandbox against the edited fixtures. Hexagram logic is pure compute — zero DB credentials in the sandbox by design.

**AC-1:** User can edit any scenario JSON (e.g., change `signals` array in `hexagram-resolver-golden.json`), trigger the rerun from the dashboard, and see the updated output reflected in the corresponding card.

**AC-2:** The rerun command invoked by the handler:
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
```
(Or equivalent call to the pre-built sandbox entry point.) Zero `CGO_ENABLED` flag needed (no CGO in TS).

**AC-3 — Env audit (mandatory G7 gate):**
```bash
env | grep -E "DB_PATH|KINH_DICH_DB|API_KEY|SECRET|TOKEN|PASSWORD"
```
This command, run inside the sandbox process context, MUST return empty. Dev-kinh-dich confirms and pastes the empty output into the handoff. This is expected to be clean because hexagram logic requires no DB credentials.

**AC-4 — Zero-infra audit in sandbox path:**
```bash
grep -rn "from.*infrastructure\|from.*hono\|SQLite\|getDb\|repositories" \
  apps/kinh-dich-service/src/primitive/ \
  apps/kinh-dich-service/src/module/ \
  apps/kinh-dich-service/src/sandbox/
```
Must return 0 matches.

**AC-5:** QA verifies: deliberate scenario edit → updated dashboard result (G7 pattern). QA edits `hexagram-resolver-golden.json`, changes the `signals` array, reruns, confirms dashboard card shows the new output.

**AC-6 — G12 DoD Gate:** All scenarios green (both `--tier=primitive` and `--tier=module`) after the rerun handler edit. No false greens. Evidence pasted into handoff.

---

### P1-F — Flex / `reading-scorer` Optional 4th Primitive

**Files touched (if time allows):**
- `apps/kinh-dich-service/src/primitive/reading-scorer/index.ts` (CREATE)
- `apps/kinh-dich-service/src/primitive/reading-scorer/index.test.ts` (CREATE)
- `docs/scenarios/kinh-dich/primitives/reading-scorer-golden.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/reading-scorer-edge.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/reading-scorer-failure.json` (CREATE)

**Background:** `reading-scorer` maps line outcome strings + trend text → numeric score + trading action string. Source: `extractOutcomeScore()` (L301–L307) + `extractTrendScore()` (L309–L315) + `extractAction()` (L317–L325) + `majorityVote()` (L327–L332) + `OUTCOME_SCORES` (L225–L228) + `TREND_SCORE_MAP` (L230–L234) from `domain/services.ts`. Pure string-to-number classification.

**Exported interface:**
```typescript
export function extractOutcomeScore(outcomeText: string): number;
export function extractTrendScore(trendText: string): number;
export function extractAction(score: number): string;
export function majorityVote(actions: string[]): string;
```

**AC-1:** All four functions exported. Constant tables `OUTCOME_SCORES` and `TREND_SCORE_MAP` embedded. Zero application/interface/infrastructure imports.

**AC-2 — Fence-A + R-FENCE inherited:** `grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" apps/kinh-dich-service/src/primitive/reading-scorer/` returns 0.

**AC-3:** `bun test src/primitive/reading-scorer/` exits 0.

**AC-4:** `bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all` exits 0 (all 12 scenarios: B1×3 + B2×3 + B3×3 + F×3).

**Note:** P1-F is OPTIONAL for Phase 1. If Phase 1 time is consumed by B1/B2/B3 + C/D/E, P1-F defers to Phase 2 bucket. PM decides at P1-E close whether to dispatch P1-F or proceed to P1-G. The `nuclear-hexagram-computer` primitive (5th in extraction order, depends on `hexagram-resolver`) also defers to Phase 2 since it depends on P1-B1 being stable first.

---

### P1-G — Phase 1 Close-Gate Verification (QA)

**Files touched:** none (read-only audit + signal emit)

**Owner:** qa

**AC-1 — Sandbox all-green:**
```bash
cd apps/kinh-dich-service
bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
bun run src/sandbox/runner.ts --tier=module --module=kinh-dich --scenario=all
bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
All three commands exit 0. QA pastes output as evidence.

**AC-2 — Dashboard ≥90%:**
QA opens `apps/kinh-dich-service/dashboard/index.html` via `file://`. Confirms all primitive cards (3 or 4) + module card + microservice card are rendered with expected states. Zero console errors. Panel count: if P1-F shipped → 4 primitive cards + 1 module + 1 microservice = 6 cards expected; if P1-F deferred → 3 primitive cards + 1 module + 1 microservice = 5 cards expected. ≥90% = ≥5/5 or ≥5/6 rendered.

**AC-3 — G12 streak confirmed (3/3 tasks):**
QA verifies that P1-B1, P1-B2, and P1-B3 each have sandbox-green evidence in their handoff docs. Each of the three tasks must have followed the DoD Gate rule (sandbox all-green before RETURN block). Documents as `g12_streak: 3/3 CONFIRMED` in the P1-G signal.

**AC-4 — R-FENCE discovery verified:**
QA confirms that P1-B1 handoff contains a `§R-FENCE Discovery` section with the recorded import style + deliberate-violation pair. Records `r_fence_discovery: RECORDED` in signal.

**AC-5 — Phase 1 exit gate report:**
QA emits `docs/signals/qa-kinh-dich-phase1-close-gate-<UTC>.json` with:
- `sandbox_all_green: true/false`
- `dashboard_render_pct: N` (rendered cards / expected cards × 100)
- `g12_streak: 3/3 CONFIRMED`
- `r_fence_discovery: RECORDED` (Phase 2 G4 can proceed with calibrated import style)
- `p1f_shipped: true/false`
- `phase1_gate: GO / CONDITIONAL-GO / NO-GO` (per exit criteria table below)

---

## Phase 1 Exit Criteria

| # | Criterion | Measurement | GO threshold |
|---|---|---|---|
| 1 | **Time to first primitive** | Wall-clock from P1-A dispatch to P1-B1 DONE signal | ≤ 4 agent-hours |
| 2 | **Sandbox all-green** | `bun run src/sandbox/runner.ts --tier=all --scenario=all` exit code | 0 (all scenarios PASS) |
| 3 | **Dashboard ≥90%** | Panels rendered / panels expected × 100 | ≥ 90% |
| 4 | **G12 earned (3/3 streak)** | QA counts consecutive DoD-Gate-satisfied tasks | 3/3 verified |

**GO** = all 4 criteria met → PO dispatches Phase 2.
**CONDITIONAL GO** = 3 of 4 met → cap Phase 2 at 1 task per sprint for next 2 sprints, then re-evaluate.
**NO-GO** = ≤2 met → architect re-plans Phase 2 scope. Do not start Phase 2.

---

## Critical Path

```
P1-A (Bun sandbox runner — zero-infra import check + config.ts Bun.env fix)
  ↓
P1-B1 (first primitive: hexagram-resolver + R-FENCE discovery — BLOCKER)
  ↓   [R-FENCE discovery MUST BE RECORDED before P1-B2 dispatched]
P1-B2 (second primitive: ngu-hanh-classifier — R-FENCE inherited)
  ↓
P1-B3 (third primitive: hao-encoder — G12 streak task #3)
  ↓
P1-C (module stub: reading_composer — MarkovPort + composition)
  ↓
P1-D (dashboard stub — 3 panels, NOT-RUN)
  ↓
P1-E (edit-rerun handler + env audit)
  ↓
P1-F (optional: reading-scorer 4th primitive)
  ↓
P1-G (QA close-gate verification)
```

**WIP=1 enforced throughout** — dev-kinh-dich works one task at a time. PM dispatches next task only after current task DONE signal + (for P1-B1) R-FENCE discovery recorded.

**R-FENCE discovery is the Phase 1 critical information gate:** if dev-kinh-dich fails to record the import style in P1-B1 §R-FENCE Discovery, Phase 2 G4 cannot calibrate its deliberate-violation proof. This is not a BLOCKER for Phase 1 to proceed, but PM must ensure the discovery is recorded before Phase 2 G4 task is authored.

**There is NO Phase 1 equivalent of R-CGO (no CGO in TypeScript/Bun).** The sandbox naturally builds and runs without any build flags. The fence enforcement (`bunx eslint src/ --max-warnings 0`) is a Phase 2 concern. Phase 1's only fence-related gate is the R-FENCE import style discovery.

---

## G12 DoD Gate Rule (Day-0 — from TA pilot cc7578f1 + macro + stock-price carry-over)

**Hard rule — blocks DONE declaration on every task that produces sandbox-runnable artefacts.**

Do not mark task DONE until sandbox shows all scenarios green:

```bash
cd apps/kinh-dich-service
bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
bun run src/sandbox/runner.ts --tier=module --module=kinh-dich --scenario=all
```

Both must exit 0 with all scenarios GREEN (run whichever tiers exist at that task's point in the sequence — P1-B1 runs primitive tier only; P1-C runs both). Paste sandbox output summary into handoff doc before writing RETURN block.

**G12 streak tasks** (first 3 qualifying tasks after DoD Gate installed):
- Streak #1 = P1-B1 (first primitive — sandbox primitive tier green)
- Streak #2 = P1-B2 (second primitive — all primitive scenarios green)
- Streak #3 = P1-B3 (third primitive — all 9 primitive scenarios green, G12 streak complete candidate)

QA verifies all 3 handoff docs contain sandbox green evidence before declaring G12=EARNED-PENDING.

---

## WIP Policy

**WIP=1 sequential.** PM dispatches ONE task at a time. The single `dev-kinh-dich` agent works sequentially through P1-A → P1-G in the order above.

Exception: P1-G (QA) can overlap with P1-F (if P1-F is dispatched), since QA only reads artefacts. PM judgment call.

No parallel dispatches within Phase 1. Rationale: the primitive extraction tasks are a learning + validation sequence — running them in parallel would mask fence violations and make R-FENCE discovery harder.

---

## Open Questions (Resolved from Brownfield P0-KD-1)

**OQ-1 — Which 3–5 primitives are highest-leverage?**

**Resolved (brownfield §3):** Confirmed 3 primitives for Phase 1 (highest-leverage):
1. `hexagram-resolver` (★★★ highest leverage — standalone, G4 deliberate-violation proof target, unblocks nuclear-hexagram-computer)
2. `ngu-hanh-classifier` (★★★ highest leverage — already exported, trivial extraction boundary, lowest risk)
3. `hao-encoder` (★★ high leverage — supplies haos array to reading_composer; threshold constants self-contained)

Optional 4th (P1-F): `reading-scorer` (★ medium leverage — four functions + two constant tables; string matching logic)
Deferred to Phase 2: `nuclear-hexagram-computer` (depends on `hexagram-resolver` being stable; extracted in Phase 2 after hexagram-resolver is production-verified)

**OQ-2 — Existing domain/application logic: retained or moved to `_deprecated/`?**

**Resolved (brownfield §5):** `domain/services.ts` `computeReading()` is the Phase 1 predecessor — it remains **UNTOUCHED in Phase 1**. Phase 2 G5a moves superseded logic to `src/_deprecated/services_v1.ts` after the `reading_composer` module is validated. The existing tests in `src/__tests__/` are the Phase 1 regression baseline — dev-kinh-dich must not break them when adding new packages.

**OQ-3 — MCP-server handlers that need HTTP rewire?**

**Resolved (brownfield §5):** All 6 MCP kinh-dich tools in `kinhDichTools.ts` currently use DIRECT domain imports from `apps/mcp-server/src/domain/services/kinhDich/` — NOT HTTP. This is the HIGH-RISK G5b finding. Full rewire is required: (a) 6 MCP tool handlers → HTTP to port 5005, (b) 4 new endpoints on kinh-dich-service (`/readings/{code}/history`, `/hexagram/{number}/transitions`, `/backtest/{code}`, `/hexagram/{number}/explain`). Score-computation helpers (mcp-server glue) stay in mcp-server — they POST pre-computed scores to kinh-dich-service. This is a Phase 2 (G5b) task; no Phase 1 work required.

**OQ-4 — Dashboard panels layout (3-level standard)**

**Resolved (charter §G6 + brownfield §2):** 3 panels exactly:
1. Primitives panel: one card per Phase 1 primitive (`hexagram-resolver`, `ngu-hanh-classifier`, `hao-encoder`, and optionally `reading-scorer`)
2. Module panel: one card for `reading_composer`
3. Microservice panel: one card for the kinh-dich service (port 5005 per system-map.json)

Clone layout from TA + macro + stock-price dashboards. dev-kinh-dich owns the dashboard stub (no dev-frontend involvement in Phase 1).

**OQ-5 — Sandbox JSON fixture format**

**Resolved:** Each primitive needs ≥3 JSON scenario files: golden (happy path), edge (boundary condition — empty/zero/threshold), failure (malformed input → error captured in trace, NOT a process crash). Module needs ≥2 JSON scenario files (golden + edge — with and without markovData). All fixtures in `docs/scenarios/kinh-dich/primitives/` and `docs/scenarios/kinh-dich/module/`.

**OQ-6 — New devDependencies needed in Phase 1?**

**Resolved:** Phase 1 adds ZERO new devDependencies. The sandbox uses only TypeScript/Bun built-ins and the existing kinh-dich module's own packages (`src/domain`, `src/primitive/*`, `src/module/*`). `eslint` and `eslint-plugin-boundaries` are Phase 2 additions (G4 task). `bun test` already available via `bun-types`. No `package.json` devDependency changes in Phase 1.

**OQ-7 — MarkovPort: re-export existing vs define slim interface?**

**Resolved (OQ, dev-kinh-dich decides):** Two options, both Fence-B compliant:
- Option A: Re-export `KinhDichRepositoryPort` from `domain/repositories.ts` as `MarkovPort` (zero new interface needed — confirmed by brownfield §4)
- Option B: Define a slimmer `MarkovPort { getMarkovData(n: number): MarkovData | null }` inline in `ports.ts` and rely on TypeScript structural typing

Option A is simpler for Phase 1. Option B is cleaner for long-term DDD separation. Dev-kinh-dich decides and documents the choice in P1-C handoff.

---

## G5b Risk Note (Phase 1 awareness — Phase 2 action)

The mcp-server holds a **PARALLEL 11-file copy** of kinh-dich domain at `apps/mcp-server/src/domain/services/kinhDich/`. All 6 MCP kinh-dich tools use direct domain imports rather than HTTP. Phase 2 G5b scope is:
- (a) Rewire 6 MCP tool handlers → HTTP to port 5005
- (b) Add 4 new HTTP endpoints on kinh-dich-service
- (c) Deprecate the parallel mcp-server copy

**Phase 1 has zero G5b scope.** Phase 1 only adds factory scaffolding. The mcp-server parallel copy is NOT touched. PM must size the G5b task appropriately — it is larger than stock-price's G5b (which was already narrower than expected). The 4 new kinh-dich-service endpoints + 6 MCP rewires make this the most complex G5 in the fleet so far.

`g5b_risk_noted: true` — this risk is carried forward from P0-KD-1 and must be reflected in Phase 2 planning.

---

## Signal to Emit on Completion

**File:** `docs/signals/pm-p0-kd4-phase1-task-plan-complete-<UTC>.json`

**Fields:**
```json
{
  "task_id": "P0-KD-4",
  "pilot": "kinh-dich",
  "status": "DONE",
  "file": "docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-ts.md",
  "task_count": 9,
  "ac_count": 54,
  "estimated_effort": "~10-12 dev-hours, 2-3 sprints",
  "wip_policy": "WIP=1 sequential",
  "r_fence_gate_baked": "YES",
  "r_fence_gate_task": "P1-B1 (AC-6 + AC-7 — discovery; Phase 2 G4 enforces)",
  "primitive_extraction_order": [
    "hexagram-resolver",
    "ngu-hanh-classifier",
    "hao-encoder",
    "reading-scorer (optional P1-F)"
  ],
  "module_name": "reading_composer",
  "g5b_risk_noted": true,
  "g12_streak_tasks": ["P1-B1", "P1-B2", "P1-B3"],
  "dashboard_note": "apps/kinh-dich-service/dashboard/index.html only — NOT docs/dashboards/index.html (SI-2 belongs to stock-price)",
  "phase0_deliverables_d1_to_d4": "DONE (brownfield P0-KD-1 + charter + SSOT + bug-inventory verified prior cycles)",
  "exit_criteria_documented": "YES",
  "critical_path_documented": "YES",
  "next": "PM closes Phase-0 exit gate after confirming all 6 Phase-0 deliverables present; then dispatches Phase-1 P1-A to dev-kinh-dich"
}
```
