---
title: "Pilot Charter — kinh-dich microservice refactor (Factory v2 — fleet pilot 4)"
date: "2026-05-24"
author: "architect"
status: "ACTIVE"
pilot: "kinh-dich"
fleet_pilot_number: 4
deadline_sprints: 6
deadline_iso: "2026-07-05"
version: "2.0"
parent_factory_close: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (v1.0, CLOSED 2026-05-23 verdict=scale)"
sibling_pilot_close: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md (v2.0, CLOSED 2026-05-23 verdict=scale)"
sibling_pilot_active: "docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md (v2.0, ACTIVE Phase 1 — WIP=2 first slot)"
ratification: "docs/po-decisions/2026-05-24-pilot3-phase1-gate-ratify-and-pilot4-kinh-dich-open.md (Decision 2 — kinh-dich OPENED WIP=2 second slot)"
schema_source: "docs/data/pilot-status-schema.json (SI-1 fleet schema v1.0, agent-father 2026-05-23T22:01:07Z)"
language: "TypeScript"
language_lock_source: "docs/signals/po-pilot4-kinh-dich-open-20260523T223738Z.json — kinh-dich is natively TS/Bun (runtime bun per system-map); language locked Day 0, no rewrite step"
si3_source: "docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md (FINAL, chosen_option=A, g4_ac_text_ready=true)"
service_facts_source: "docs/data/system-map.json (jq, never hardcoded): port 5005 (internal==external), zone apps/kinh-dich-service, language ts, runtime bun, specialist dev-kinh-dich, keywords [hexagram, I-Ching, kinh dich, divination]"
---

# Pilot Charter — `kinh-dich` Microservice Refactor (Factory v2 — fleet pilot 4)

**Binding contract for the FOURTH factory pilot and the SECOND fleet-rollout pilot. Inherits the 12-G-goal factory pattern proven TWICE on `technical-analysis` (closed 2026-05-23, verdict=`scale`) and `macro-indicators` (closed 2026-05-23, verdict=`scale`), and continuing on `stock-price` (fleet pilot 3, now Phase 1).**

**Scope:** `apps/kinh-dich-service` only. No other microservice is in scope during this pilot.

---

## Why This Pilot Exists

Both prior factory pilots scored 12/12 with verdict=`scale`. The fleet-rollout ratification (`docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md`) sequenced kinh-dich as pilot 4 (TS), behind stock-price (pilot 3, Go), for one reason: **kinh-dich required SI-3 to resolve before its G4 AC text could be locked.** SI-3 (TS ESLint fence design) is now FINAL (`docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md`, `status: FINAL`, `chosen_option: A`). Both gate conditions are met (SI-3 landed + stock-price cleared Phase 0 / now Phase 1). The WIP=2 second slot is open.

This pilot's purpose:

1. **Exercise the factory on the first TS/Bun service in the fleet.** kinh-dich is natively TypeScript — no rewrite step, no language-pivot risk. This lets the pilot focus exclusively on proving the primitive/module DDD decomposition and the ESLint fence (SI-3 Option A) on a production TS service.
2. **Validate SI-3 Option A in production.** kinh-dich is the FIRST fleet service to exercise `eslint-plugin-boundaries`. The R-FENCE risk gate (§R-FENCE Boundary Clause) is the per-service hard gate for this pilot.
3. **Burn in all carry-over lessons Day 0.** Lessons L1-L7 baked (see §Charter Inherited Lessons). No Amendment-1-style retrofit expected.

**Pilot gate:** if all 12 goals pass the decision matrix → scale continues to pilot 5 (alert-engine, Go) when WIP permits. See §Decision Matrix.

---

## Language Lock (Day 0)

**Implementation language is TypeScript. Runtime is Bun.** Locked at charter creation; not subject to mid-pilot pivot.

**Authority:** `docs/signals/po-pilot4-kinh-dich-open-20260523T223738Z.json` — "language: TypeScript, runtime: Bun, language_locked: true". kinh-dich is **already TS/Bun** (`runtime: bun` per system-map) — there is no rewrite-from-another-language step here. The lock simply forbids any mid-pilot pivot.

**Carry-over lesson L1:** the TA pilot lost 6 commits and ~3 days to a mid-Phase-1 language pivot. Impossible here — language locked Day 0 AND the service is natively TS/Bun.

**Current state (brownfield Day 0):** `apps/kinh-dich-service/` has all 4 DDD layers in `src/` (`domain/`, `application/`, `infrastructure/`, `interface/`) and composition root at `src/index.ts`. It has **NO `src/primitive/`, NO `src/module/`, NO `sandbox/`, NO `dashboard/`** — RED verdict. The `domain/services.ts` (`computeReading` + `classifyNguHanh`) and the embedded hexagram library (TRIGRAM_LINES, QUE_META, QUE_DATA, threshold functions) are the natural decomposition targets. dev-kinh-dich confirms exact primitive/module targets in Phase 0 (§Phase 0).

---

## Refactor Targets (recommended candidates — dev-kinh-dich confirms in Phase 0)

The factory decomposes **pure decision/transformation logic** into primitives and **composition/orchestration** into a module. The existing domain layer is already clean (zero infra imports confirmed — `domain/services.ts` + `domain/models.ts` import nothing outside stdlib/domain). This makes the extraction straightforward: slice the monolithic `domain/services.ts` into individually testable primitive functions.

**Primitive candidates (pure, stdlib-only — Fence-A):**

| # | Primitive (proposed) | Pure logic extracted from | Why it is pure |
|---|---|---|---|
| 1 | `hexagram-resolver` | `resolveHexagram()` + `TRIGRAM_LINES` + `TRIGRAMS_TO_QUE` in `domain/services.ts` | Maps 6 binary line signals → hexagram number. Pure table lookup. No I/O. |
| 2 | `hao-encoder` | `classifyHao()` + `encodeHaos()` + thresholds in `domain/services.ts` | Maps 6 raw scores [-1,+1] → HaoReading array (state + binary + isChanging). Pure threshold math. |
| 3 | `ngu-hanh-classifier` | `classifyNguHanh()` exported from `domain/services.ts` | Maps lower/upper trigram elements → NguHanhResult (dynamic + score + interpretation). Pure table lookup. Already exported — easiest extraction. |
| 4 | `reading-scorer` | `extractOutcomeScore()` + `extractTrendScore()` + `majorityVote()` + score synthesis in `computeReading()` | Maps line outcomes + trend text → combined score + trading signal. Pure string-to-number classification. |
| 5 | `nuclear-hexagram-computer` | `computeHoQue()` + `computeBienQue()` in `domain/services.ts` | Maps 6 signals + HaoReadings → nuclear (hộ quẻ) + transformed (biến quẻ) hexagram numbers. Pure bit manipulation. |

Target: **3-5 primitives** (architect/dev-kinh-dich pick the highest-leverage in Phase 0). The five candidates above map cleanly onto the existing internal helpers in `domain/services.ts`. Macro shipped 6, TA 5, stock-price 3-5 — 3-5 is the calibrated band for kinh-dich's pure-compute domain.

**Module candidate (Fence-B):**

- `src/module/reading_composer/` — composes the primitives via ports (DI). The full-reading STORY: inject 6 scores → encode haos → resolve hexagram → compute nuclear + transformed → classify ngu hanh → score reading → return `KinhDichReading`. The Markov lookup (currently optional `markovData` param) is an **injected `MarkovPort`** (infra provides a SQLite impl), never imported directly by the module.

This is the single-module scope (matches TA's 1 module and macro's pilot-one-module discipline). A second module (`hexagram_library`) is **deferred to post-pilot** unless Phase 0 finds it trivial to fold in.

> **dev-kinh-dich Phase 0 confirmation required:** the candidates above are derived from a read-only analysis of `domain/services.ts` + `domain/models.ts`. dev-kinh-dich MUST confirm or refine the exact primitive set + module name in the Phase 0 brownfield inventory before any code lands. The charter does not freeze the primitive names — only the decomposition principle (pure → primitive, orchestration → module, I/O → infra).

---

## R-FENCE Boundary Clause (Phase-0 RISK — kinh-dich's hard gate)

**kinh-dich is TS/Bun with no CGO/native-DB dependency** (no `mattn/go-sqlite3`). The stock-price R-CGO chokepoint does NOT apply. The per-service risk gate for kinh-dich is **R-FENCE**: the first TS service in the fleet to exercise `eslint-plugin-boundaries` (SI-3 Option A).

**Hard rule:** the ESLint fence (`apps/kinh-dich-service/eslint.config.mjs`) MUST be proven to catch Fence-A violations on this service's **actual import style** (`.js`-suffixed ESM imports) before G4 closes.

- **R-2 from SI-3 §6.2 (MEDIUM):** `eslint-plugin-boundaries` matches raw import string patterns. The risk is whether `../../application/dtos.js` (a `.js`-suffixed relative import as used in the current `domain/services.ts`) is correctly matched by the `src/application/**/*` element pattern. The Phase-0/Phase-1 risk gate is the **AC-4b deliberate-violation proof actually producing a non-zero exit with "Fence-A" in the ESLint output on this service's real import style.**
- **Mitigation (SI-3 §6.3, Option-A internal):** if R-2 proves to be a real blocker during the AC-4b proof, the fallback within Option A is to add `@typescript-eslint/parser` as an additional devDependency and add `languageOptions: { parser: tsParser }` to the `eslint.config.mjs` block. This causes ESLint to resolve imports via the TypeScript parser (which resolves `.js` → `.ts`), removing the suffix ambiguity. This fallback takes under 5 minutes and does **NOT drop to Option C.**
- **Fence tool is `eslint-plugin-boundaries` (Option A) exclusively.** No Go depguard, no `.golangci.yml`, no Option C (documented-weaker). The TS fence must be equal-class to the Go fleet's depguard.

**G7 zero-credentials gate carries over unchanged:** kinh-dich sandbox process must have **zero DB credentials, zero API keys, zero secrets** at all times. Hexagram logic is pure compute — the `computeReading()` function requires only 6 float scores and an optional Markov struct. The sandbox invocation against scenario JSON fixtures should naturally be credential-free. G7 env audit confirms: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty.

**Why this matters for trust:** if the sandbox needed live DB creds or a live SQLite connection to the kinh-dich readings table, the "edit JSON and rerun" trust contract (G7) and zero-credentials guarantee would be compromised. The hexagram domain is pure-function reproducible: JSON in → trace JSON out, no DB, no network.

---

## Kickoff Prerequisites

All of the following must be true before Phase 0 work begins on this pilot:

1. Parent + sibling factories CLOSED — `pilot-status.json` (TA) status=DONE verdict=scale; `pilot-status-macro-indicators.json` status=DONE verdict=scale (both verified 2026-05-23). FROZEN historical records — do NOT mutate.
2. Fleet rollout RATIFIED — `docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md` status=DECIDED; kinh-dich is pilot 4 (Decision 1).
3. SI-3 (TS fence) FINAL — `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md` status=FINAL, chosen_option=A (eslint-plugin-boundaries v6.0.2), g4_ac_text_ready=true (verified 2026-05-24).
4. SI-1 fleet schema LANDED — `docs/data/pilot-status-schema.json` exists (agent-father, 2026-05-23T22:01:07Z). This charter's SSOT (`docs/data/pilot-status-kinh-dich.json`) is instantiated from it.
5. Pilot status SSOT created — `docs/data/pilot-status-kinh-dich.json` exists with all 12 goals = `TBD`, decisionMatrix all `TBD` (present-but-empty), status `ACTIVE`, phase `0`, language `TypeScript` locked (this charter creation cycle; architect authors per §4.5 SSOT-from-Day-0 rule).
6. `apps/kinh-dich-service/` brownfield scan complete — confirm DDD layer state + exact primitive/module targets + R-FENCE feasibility (Phase 0 deliverable; architect or system-auditor owns; dev-kinh-dich confirms deliberate-violation proof on real import style).
7. Bug-inventory entry — `docs/data/bug-inventory.json` gets a `kinh_dich_baseline` block for G10 baseline. If no kinh-dich bugs exist in the 60d window, baselineCycleCount falls back to system-wide `1.5`.

---

## Anti-Scope-Creep Clause

**This pilot covers `apps/kinh-dich-service` only.** Forbidden while the pilot is active:

- Extracting primitives for any other bounded context (stock-price, alerts, news, etc.)
- Rebuilding modules or rewiring composition roots for any service other than `apps/kinh-dich-service`
- Touching DORMANT closed-pilot app source (`apps/technical-analysis/**`, `apps/macro-indicators/**`) — both are FROZEN
- Touching CLOSED pilot SSOTs (`pilot-status.json`, `pilot-status-macro-indicators.json`)
- Adding goals to this charter mid-pilot
- Re-claiming SI-2 fleet dashboard index ownership — SI-2 belongs to stock-price (first fleet pilot to reach G6, per ratification Decision 3). kinh-dich G6 builds only its own `apps/kinh-dich-service/dashboard/index.html`.

The pilot is a controlled experiment, not a rolling refactor. Creep invalidates the measurement.

**If a compelling opportunity arises elsewhere during the pilot:** PM creates a backlog task tagged `post-pilot-4`. It does not start until the 12-goal review is complete. WIP=2 cap (per ratification Decision 1): stock-price (Phase 1) + kinh-dich (Phase 0) are the only two ACTIVE charters — no pilot 5 charter (alert-engine) opens until pilot 3 clears Phase 1.

---

## Hard Deadline

**6 sprints from kickoff.** Kickoff date = 2026-05-24 (charter creation date). **Sprint-6 hard deadline = 2026-07-05.**

No silent extension. At sprint 6 end, PO calls the decision matrix regardless of goal state.

**Mechanically enforced (L3):** Status enum is strictly `ACTIVE | DONE | FAILED`. NO operational labels (`PHASE-2`, `WAITING-USER`) are valid terminal values. If a user-gated goal (G9) stays unresolved past hard deadline, status auto-flips to `FAILED` and PO calls matrix on whatever state exists (G9 → PARTIAL, Trust evaluated on G8 alone). Default G9 path is PO Playwright (Path B, L6) — so async-user-wait should not block.

---

## Security / Zero-Credentials Clause

The sandbox process (used in G7 and throughout Track B) **MUST have zero DB credentials, zero external API keys, AND zero secrets at all times.** Not optional.

Enforcement:
- G7 env audit: run the sandbox process and confirm `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty.
- **kinh-dich-specific note:** hexagram logic is pure compute. The sandbox binary runs the extracted primitives + module against scenario JSON fixtures (`input: { stockCode, scores, markovData }` → `output: KinhDichReading`). No SQLite DB connection, no VPS scraper call, no external API key — the domain function requires only in-memory data. The zero-credentials guarantee should be naturally clean, but G7 audit is still the binding confirmation.
- **R-FENCE addition:** the sandbox process also has no ESLint devDependency in its production runtime. The fence check runs as a separate `bunx eslint src/ --max-warnings 0` step in the dev workflow — it is NOT bundled into the sandbox binary. The sandbox is a pure Bun runtime over the primitive/module code.
- If any credential leaks into the sandbox/primitive/module path, G7 is blocked — it does not pass.

Rationale: sandbox is pure-function (JSON in → trace JSON out). Any credential, network call, or external DB dependency in that environment destroys the security and reproducibility guarantee.

---

## 12 Completion Goals

All 12 goals are inherited verbatim from the proven v2 charter, with kinh-dich-specific calibration on G1, G2, G3, G5, G7, G10, G11, G12. Track structure (A=Trust Foundation, B=Dashboard, C=AI-Fixability) is unchanged.

### Track A — Trust Foundation

---

**G1. Primitives ship with scenarios**

**3-5 kinh-dich primitives extracted to TypeScript** (`apps/kinh-dich-service/src/primitive/`), each with ≥3 scenario JSON files (golden/happy + edge + failure). All scenarios pass.

**Recommended candidate list (architect/dev-kinh-dich refine in Phase 0 — see §Refactor Targets):**
1. `hexagram-resolver` — 6 binary signals → hexagram number (table lookup)
2. `hao-encoder` — 6 raw scores → HaoReading array (threshold classification)
3. `ngu-hanh-classifier` — lower/upper trigram elements → NguHanhResult
4. `reading-scorer` — line outcomes + trend text → combined score + trading signal
5. `nuclear-hexagram-computer` — signals + HaoReadings → hộ quẻ + biến quẻ numbers

**Calibration vs prior pilots:** TA had 5 primitives, macro 6, stock-price 3-5. kinh-dich's domain is pure compute (hexagram logic embedded in `domain/services.ts`) — 3-5 is the calibrated band. Architect selects the highest-leverage in Phase 0.

Verification method: `cd apps/kinh-dich-service && bun run sandbox --tier=primitive --module=kinh-dich --scenario=all`. All scenario files execute without error. QA counts scenario files: minimum 3 per primitive × 3 primitives = 9 files minimum. QA checks ≥1 file is a failure scenario (e.g., `scores.length !== 6` → error, or invalid trigram signal pattern). QA confirms `grep -rn "from.*infrastructure" src/primitive/` = 0.

Owner agent: `dev-kinh-dich`

---

**G2. Module composes primitives via ports**

`apps/kinh-dich-service/src/module/reading_composer/` exists. Imports primitives via interface; the Markov data lookup (SQLite-backed) is an injected **`MarkovPort`** (infra implements it), never reached into directly. Module never imports another module. Has its own multi-primitive scenarios (the full-reading STORY: 6 scores → complete `KinhDichReading` with haos, hexagram, hoQue, bienQue, nguHanh, tradingSignal).

**Calibration:** ONE module (`reading_composer`) — matches TA's single-module scope and macro's pilot-one-module discipline. A `hexagram_library` second module (TRIGRAM_LINES / QUE_META / QUE_DATA embedded data) is deferred to post-pilot unless trivial. **Fence-B:** module imports zero infrastructure and zero direct SQLite client.

Verification method: QA runs `grep -rn "src/module/" apps/kinh-dich-service/src/module/reading_composer/` → 0 cross-module imports. QA runs `grep -rn "src/infrastructure" apps/kinh-dich-service/src/module/reading_composer/` → 0. QA runs the module sandbox and verifies ≥1 multi-primitive scenario (e.g., the full reading story: haos encoded → hexagram resolved → ngu hanh classified → score computed → KinhDichReading returned).

Owner agent: `dev-kinh-dich`

---

**G3. Microservice has clean composition root**

`apps/kinh-dich-service/src/index.ts` wires module + adapters (the SQLite Markov repository is wired HERE as the infra impl of `MarkovPort`). No business logic in composition root. HTTP interface contract documented (OpenAPI YAML). **Port = 5005 (internal == external) per system-map.json — never hardcoded elsewhere.**

Verification method: QA reads `src/index.ts` — only imports, DI wiring (including the MarkovPort injection), and server startup (Hono app). No `if` on data values, no hexagram calculations, no domain logic. QA checks `apps/kinh-dich-service/src/interface/` has an HTTP contract doc (OpenAPI YAML or equivalent). QA runs `grep -rn "computeReading\|classifyNguHanh\|resolveHexagram\|encodeHaos" apps/kinh-dich-service/src/index.ts` → 0 (logic lives in module/primitives, not the root).

Owner agent: `dev-kinh-dich`

---

**G4. Architecture fence enforced (offline ESLint boundaries evidence)**

`apps/kinh-dich-service/eslint.config.mjs` exists, contains `eslint-plugin-boundaries` rules for Fence-A (primitive must not import module, application, interface, or infrastructure layers), Fence-B (module must not import application, interface, or infrastructure layers), Fence-C (infrastructure wiring only allowed from src/index.ts composition root). `eslint` and `eslint-plugin-boundaries` present in devDependencies. Deliberate-violation proof executed: intentional Fence-A violation reproduces ESLint exit non-zero with "Fence-A" in output; violation reverted; exit 0 confirmed; violation NEVER committed.

**Acceptance evidence (parallel to Go pilot AC-4a/4b/4c):**

- **AC-4a:** `apps/kinh-dich-service/eslint.config.mjs` file exists and is readable. `devDependencies` in `package.json` include `eslint` and `eslint-plugin-boundaries`. Running `bunx eslint src/ --max-warnings 0` from `apps/kinh-dich-service/` exits 0 on clean source.
- **AC-4b:** Deliberate violation proof — dev agent injects a Fence-A violation (import from `src/primitive/` into `src/application/`), runs `bunx eslint src/ --max-warnings 0`, confirms exit non-zero AND "Fence-A" appears in ESLint error message output, reverts violation via `git checkout`, confirms `git status` clean AND exit 0 on re-run. Violation NEVER staged, NEVER committed. Paste full ESLint output in `TASK_kinh-dich-G4.md §Evidence to Record`.

  **Deliberate-violation example (use actual primitive that exists at G4 time):**
  ```bash
  # Inject violation into src/primitive/hexagram-resolver/index.ts
  echo "" >> src/primitive/hexagram-resolver/index.ts
  echo "// DELIBERATE FENCE-A VIOLATION — DO NOT COMMIT" >> src/primitive/hexagram-resolver/index.ts
  echo "import type { ReadingRequest } from '../../application/dtos.js'; // Fence-A breach" >> src/primitive/hexagram-resolver/index.ts
  ```
  Expected output (non-zero exit, "Fence-A" in output):
  ```
  /apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
    N:N  error  Fence-A: primitive must not import application layer  boundaries/element-types

  1 problem (1 error, 0 warnings)
  ```

- **AC-4c:** `eslint.config.mjs` freeze anchor — `git log --oneline apps/kinh-dich-service/eslint.config.mjs` shows the G4-freeze commit as the most recent commit on that file at G4 close. No subsequent edits to the fence config without a new explicit G4-reopen task.

**Owner agent:** `dev-kinh-dich` (fence implementation) + `qa` (violation proof verification). **NO architect Amendment needed — spec is final at charter v1** (SI-3 has landed; G4 section LOCKED at charter v1 per SI-3 §5 "spec is final at charter v1").

**Pre-revert tag (L5):** `kinh-dich-pre-ci` MUST be created at the commit BEFORE the CI/violation work. No retag, no force, no push.

**R-FENCE gate (binding):** AC-4b proof must produce a non-zero exit with "Fence-A" in output on this service's real `.js`-suffixed ESM import style. If R-2 (SI-3 §6.2) proves to be a real blocker, apply the 5-minute in-Option-A fallback (add `@typescript-eslint/parser` to devDependencies + `languageOptions: { parser: tsParser }` to `eslint.config.mjs`). This fallback does NOT drop to Option C. If the fallback is applied, dev-kinh-dich records it in `TASK_kinh-dich-G4.md §R-FENCE Resolution`.

**Full eslint.config.mjs template (from SI-3 §3.2 — copy verbatim):**

```javascript
// apps/kinh-dich-service/eslint.config.mjs
// Architecture fence — three DDD layer rules matching Go depguard Fence-A/B/C.
// Frozen at G4 close; see pilot-charter.md §G4 for AC.
//
// Fence-A: src/primitive/** must not import src/module, src/application,
//          src/interface, or src/infrastructure
// Fence-B: src/module/** must not import src/application, src/interface,
//          or src/infrastructure
// Fence-C: src/infrastructure/** may only be imported from src/index.ts
//          (composition root). All other files are barred from importing infra.

import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        { type: "primitive", pattern: "src/primitive/**/*" },
        { type: "module",    pattern: "src/module/**/*" },
        { type: "infrastructure", pattern: "src/infrastructure/**/*" },
        { type: "application",    pattern: "src/application/**/*" },
        { type: "interface",      pattern: "src/interface/**/*" },
        { type: "domain",         pattern: "src/domain/**/*" },
        { type: "composition-root", pattern: "src/index.ts" },
      ],
      "boundaries/ignore": [
        "**/__tests__/**",
        "**/sandbox/**",
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: "primitive",
              disallow: ["module", "application", "interface", "infrastructure"],
              message: "Fence-A: primitive must not import ${dependency.type} layer",
            },
            {
              from: "module",
              disallow: ["application", "interface", "infrastructure"],
              message: "Fence-B: module must not import ${dependency.type} layer",
            },
            {
              from: ["domain", "application", "module", "primitive", "interface"],
              disallow: ["infrastructure"],
              message: "Fence-C: infrastructure wiring only allowed in src/index.ts (composition root)",
            },
          ],
        },
      ],
    },
  },
];
```

---

**G5. Old kinh-dich domain code deleted + HTTP rewire**

**Calibration vs prior pilots:** kinh-dich is its OWN TS service already. So G5 here is:

- **G5a:** pre-refactor kinh-dich domain logic that gets superseded by the new primitive/module decomposition is moved to `apps/kinh-dich-service/src/_deprecated/` (or deleted with a pre-delete tag) after the new module ships — NOT left as dead duplicate domain logic. (Phase 0 brownfield confirms whether the existing `domain/services.ts` `computeReading()` / `classifyNguHanh()` is fully replaced or partially retained. The embedded hexagram library data — TRIGRAM_LINES, QUE_META, QUE_DATA — may stay as a shared data file imported by both primitives, or be embedded directly in the relevant primitive.)
- **G5b:** any `apps/mcp-server/src/` tool handlers that consume kinh-dich data are verified routed via **HTTP to the TS service on port 5005**, with zero direct domain imports. Phase 0 identifies the exact MCP handlers touching kinh-dich domain (candidates: `kinh-dich`-related tools in mcp-server — dev-kinh-dich confirms which actually reach into kinh-dich domain vs already-HTTP).
- **G5c:** zero `TODO.*migrat` comments in kinh-dich + the affected mcp-server tool dir.

Verification method: QA runs `grep -rn "TODO.*migrat" apps/kinh-dich-service/ apps/mcp-server/src/ --include='*.ts'` → 0. QA confirms superseded logic moved to `_deprecated/` (or deleted under tag). QA verifies the relevant MCP kinh-dich tool returns valid response via HTTP to the TS service.

**Tag-anchor discipline (L5):** Pre-delete tag `kinh-dich-pre-delete` MUST be created at the commit BEFORE any `git mv` to `_deprecated/`. No retag, no force, no push.

Owner agent: `dev-kinh-dich`

---

### Track B — Dashboard Trust Layer

---

**G6. Three-level dashboard renders from JSON traces (3-panel standard)**

`apps/kinh-dich-service/dashboard/index.html` exists. **Three panels visible (the 3-panel standard):**
1. **Primitives panel** — one card per extracted primitive (3-5)
2. **Module panel** — one card for `reading_composer`
3. **Microservice panel** — one card for the kinh-dich service composition

All open from one HTML index. **`file://` works with ZERO network calls and ZERO external API calls** (renders from scenario trace JSON, no live stock data, no SQLite). No CDN, no build server required to view.

**SI-2 note:** kinh-dich is NOT the SI-2 owner. SI-2 (fleet dashboard index `docs/dashboards/index.html`) was corrected to stock-price (first fleet pilot to hit G6) per ratification Decision 3. kinh-dich G6 builds **only** `apps/kinh-dich-service/dashboard/index.html` — a local service dashboard. The fleet index is stock-price's G6 deliverable.

Owner agent: `dev-kinh-dich`

---

**G7. Edit-JSON-and-rerun works (zero credentials in sandbox)**

User edits a scenario JSON (e.g., changes 6 input scores), refreshes the dashboard, sees the new hexagram reading. **ZERO DB credentials, ZERO external API keys, ZERO secrets in the sandbox process.** The rerun handler invokes the sandbox against the edited fixtures.

**kinh-dich-specific env audit:** `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty. No `KINH_DICH_DB_PATH`, no SQLite handle in the primitive/module execution path — hexagram logic is pure compute.

Owner agent: `dev-kinh-dich`

---

**G8. Red/green status is honest (honest-red contract)**

Dashboard shows RED when a scenario fails (proven by 1 deliberate broken primitive). No false greens (QA runs known-bad scenarios).

**Carry-over evidence pattern (the honest-red contract):**
- **Test A** = deliberate corruption of a golden scenario (e.g., flip an expected hexagram number in `hexagram-resolver` golden, or flip an expected `dynamic` value in `ngu-hanh-classifier` golden) → dashboard renders RED, diff captured.
- **Test B** = known-good golden scenario → dashboard renders GREEN, diff = null.

Both proven before G8 grades YES. Pattern identical across all pilots — no false green tolerated.

Owner agent: `qa` (verification) + `dev-kinh-dich` (dashboard honesty impl)

---

**G9. Dashboard is the trust contract — short-circuit via PO Playwright (Day-0 default, L6)**

**Lesson burned in (L6):** synchronous user verbal confirm blocked the TA pilot for cycles 15-18. Path B (PO Playwright short-circuit) is the Day-0 DEFAULT, equal weight to Path A.

G9 PASS = ONE of:
- **Path A (synchronous user verbal — preferred if user available):** user shown only the dashboard, answers YES to "Can you tell from this dashboard whether kinh-dich hexagram resolution is working correctly?" PO records verbal YES in `docs/po-decisions/<date>-g9-kinh-dich-user-confirmation.md`.
- **Path B (PO Playwright short-circuit — DEFAULT if user defers):** user directive delegates verification to PO. PO runs Playwright + chromium-headless-shell against `file://apps/kinh-dich-service/dashboard/index.html` (TCC-staged via Terminal.app per L87). Acceptance: ZERO console errors, ZERO pageerrors, ZERO requestfailed, all primitive + module + microservice cards rendered, NOT-RUN status honestly displayed. PO records verdict in decision doc. SAME WEIGHT as user verbal per cycle-19 precedent.

**Either path satisfies G9.** No synchronous user wait required.

Owner agent: `po` (review facilitation + Playwright verification)

---

### Track C — AI-Fixability Proof

---

**G10. AI agent fixes a primitive bug without looping (≤2 cycles)**

QA injects 1 deliberate bug into a kinh-dich primitive. `dev-kinh-dich` fixes in ≤2 cycles (baseline was 4-6 system-wide). Dashboard turns green.

**Baseline source:** `docs/data/bug-inventory.json` — Phase 0 adds a `kinh_dich_baseline` block. If no kinh-dich bugs in the 60d window, falls back to system-wide `baselineCycleCount=1.5`.

**Bug-injection spec (proven on TA + macro):** off-by-one / wrong-divisor / wrong-multiplier / wrong-threshold single-literal injection. Calibrate to a kinh-dich primitive (e.g., wrong threshold constant in `hao-encoder` — e.g., `LAO_DUONG_THRESHOLD = 0.85` instead of `0.75`, or a flipped comparison in `reading-scorer`). The bug must be a SINGLE literal/operator change with a deterministic correct fix.

Owner agent: `dev-kinh-dich` (fix) + `qa` (injection + cycle count)

---

**G11. Regression alarm bell works**

AI fixes bug A, breaks scenario B → dashboard flips B RED → AI forced to fix B before "done".

**Grading rubric (TA cycle-17 / macro cycle-57 precedent — 2-trial coupling-proof):**
- **Trial-1** = the G10 primitive mutation + fix; verify ≥1 COUPLED scenario goes RED, single-edit fix repairs all coupled REDs.
- **Trial-2** = a DIFFERENT primitive mutation + fix; same coupling proof.
- Both showing outcome-(a) (coupled REDs from one mutation, single-edit fix repairs all) = PASS. Counts as alarm-mechanism-functional.

Owner agent: `dev-kinh-dich` (flow rule compliance) + `qa` (scenario pair design)

---

**G12. Dev-kinh-dich flow requires dashboard-green before "done" (3-task streak)**

`.claude/flows/dev-kinh-dich/main.md` updated with the hard DoD-Gate rule (sandbox-green-before-RETURN). 3 consecutive dev tasks verified following the rule.

**Carry-over (L from TA/macro):** the G12 DoD Gate rule lives in TA's flow (commit `cc7578f1`) and was cloned into macro's and stock-price's flows Day 0. For kinh-dich, `agent-father` updates/clones the `dev-kinh-dich` flow at Phase 0 to bake the DoD Gate from Day 0 (no separate flow-edit task). Streak = the first 3 Phase 1 dev tasks (first-primitive + module-stub + dashboard-stub bucket pattern).

**Status candidacy:** may be held as EARNED-PENDING per §4.5 once the streak completes; PO flips YES only at 12/12 terminal atomic close.

Owner agent: `agent-father` (flow rule baking) + `qa` (3-task verification, using kinh-dich's first 3 Phase 1 dev tasks)

---

## Phase 0 (exit gate)

**Owner:** architect + system-auditor + agent-father (+ dev-kinh-dich for R-FENCE feasibility confirmation).
**Duration:** 1 sprint.

Deliverables (per SI-1 schema `phase0.deliverables`):
1. `pilot_status_ssot` — `docs/data/pilot-status-kinh-dich.json` (DONE this charter cycle, architect).
2. `brownfield_inventory` — `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md`. MUST confirm: exact primitive set + module name; which existing `domain/services.ts` logic is superseded vs retained (G5a scope); the exact MCP handlers that reach kinh-dich domain (G5b scope); **and the R-FENCE feasibility (AC-4b deliberate-violation proof on real import style confirms fence catches violations).**
3. `bug_inventory_entry` — `docs/data/bug-inventory.json` `kinh_dich_baseline` block (baselineCycleCount; fallback 1.5).
4. `dev_agent_file` — `.claude/agents/dev-kinh-dich.md` updated/confirmed for factory mode (TS primary, G12 DoD constraint, R-FENCE gate lazy-load). Already exists — agent-father confirms factory-readiness.
5. `dev_agent_flow_file` — `.claude/flows/dev-kinh-dich/main.md` with G12 DoD Gate baked Day 0 + Fence-A/B/C + pre-revert tag protocol (`kinh-dich-pre-ci`, `kinh-dich-pre-delete`, `kinh-dich-pre-inject`).
6. `phase_1_task_plan` — `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-ts.md` (atomic tasks, per-task AC, WIP=1, R-FENCE gate baked into the first-fence task AC exactly as stock-price baked R-CGO into P1-B1).

**Exit gate:** all 6 deliverables landed + SSOT phase-0 fields populated + no code in `src/primitive`/`src/module` yet + architect verification signal.

---

## Charter Inherited Lessons (from TA close + macro close 2026-05-23)

| # | Lesson source | Prior pain | kinh-dich charter v1 fix |
|---|---|---|---|
| L1 | TA language pivot (6 reverted commits) | TS scaffold before user verdict; pivot cost 3-4 days | §Language Lock — TypeScript Day 0, AND service is natively TS/Bun (no rewrite step) |
| L2 | TA G4 Amendment 1 | Whole-project CI noisy | §G4 — offline ESLint boundaries evidence OR pilot-scoped CI; AC explicit at v1 |
| L3 | TA Q5 status-enum violation | `PHASE-2` label allowed silent escape | §Hard Deadline — enum strictly `ACTIVE\|DONE\|FAILED`; auto-FAILED on G9-blocked deadline |
| L4 | TA Q6 matrix authorship undefined | decisionMatrix set by wrong agent | §4.5 / §Constraints — PO-only, populate ONLY after 12/12 terminal in atomic commit |
| L5 | TA Q7 pre-revert tags missing | tags retrofitted | §G4 + §G5 + §G10 require pre-* tags Day 0 (`kinh-dich-pre-ci/-delete/-inject`) |
| L6 | TA G9 cycle-19 user-delegation | Synchronous confirm blocked pilot | §G9 — Path B PO Playwright Day-0 default, equal weight |
| L7 | TA cycle-26+ SSOT discipline | Discovered mid-pilot | §Constraints — L84 / no-force / local-only / anchor-hold Day 0 |
| L-FENCE | NEW (kinh-dich-specific, analog of stock-price R-CGO, macro FRED gate, alert-engine Telegram gate) | n/a — proactive | §R-FENCE Boundary Clause — `eslint-plugin-boundaries` fence must catch violations on real `.js`-suffixed ESM imports; AC-4b proof gate; 5-min Option-A fallback if R-2 bites (NOT Option C) |

Full carry-over chain: macro `01-lessons-from-ta-pilot.md` + stock-price charter §CGO Boundary Clause + this charter §R-FENCE Boundary Clause.

---

## Constraints (binding from Day 0)

- **L84 explicit-file staging** — `git add <path>` per file. NEVER `git add -A` or `git add .`.
- **No `--force`, no `--no-verify`, no `--no-gpg-sign`** — ever. Hook fails → fix + NEW commit.
- **No `git push` of source/CI changes** — local-only. User owns push (CI billing block).
- **All work on `main`** — NO branches (CLAUDE.md).
- **SSOT: one active dispatch per task** — no shadow dispatches, no orphaned signals.
- **Anchor discipline** — once a commit is the frozen anchor for a contract (`eslint.config.mjs` freeze, pre-revert tags), no retag, no rewrite, no push.
- **§4.5 matrix-authorship rule** — `decisionMatrix.{speed,trust,scale}` populates ONLY by PO, ONLY after 12/12 G-goals reach terminal grade, ONLY in atomic commit with the last G-goal flip + verdict signature. Block stays present-but-empty (`TBD`) the entire pilot until then.
- **DORMANT/CLOSED freeze** — do NOT touch `apps/technical-analysis/**`, `apps/macro-indicators/**` (dormant source), `pilot-status.json`, `pilot-status-macro-indicators.json` (closed SSOTs).
- **SI-2 ownership** — do NOT touch `docs/dashboards/index.html` (stock-price's G6 deliverable). kinh-dich G6 = `apps/kinh-dich-service/dashboard/index.html` only.
- **R-FENCE fence tool** — `eslint-plugin-boundaries` (Option A) exclusively. No Go depguard, no Option C fallback to documented-weaker.
- **System facts via jq on `system-map.json`** — never hardcode port/zone/agent.
- **Notebook + signal hygiene** — PO notebook overwritten end of cycle (≤200 lines); signals `{agent}-{ISO}.json`.

---

## Decision Matrix (§4.5)

Applied MECHANICALLY by PO after 12/12 terminal. Block stays empty (`TBD`) until then.

| Question | YES criteria | NO criteria |
|---|---|---|
| **Speed** — fewer fix loops vs baseline? | G10 confirmed ≤2 cycles vs baseline AND G11 regression alarm fired (proving it works) | G10 not met OR alarm never fired |
| **Trust** — user can verify pilot quality from dashboard alone? | G9 confirmed (Path A verbal YES OR Path B Playwright PASS) AND G8 red/green honesty proven | G9 not confirmed by either path OR G8 false-green found |
| **Scale** — worth doing for next microservice? | All 12 goals YES AND both tracks A+B delivered within 6 sprints | ≥2 goals still NO at deadline OR overran 6 sprints |

**Derivation (mechanical, per SI-1 schema `_criteria_source`):** Speed = G10 ∧ G11. Trust = G9 (PASS, not PARTIAL) ∧ G8. Scale = all-12 YES ∧ sprintCount ≤ 6.

**Outcome:**
- **3 YES** → `scale` → continue fleet to pilot 5 (alert-engine, Go) when WIP permits (stock-price must clear Phase 1 first).
- **2 YES** → `rescope` (max 2 additional sprints; do not start pilot 5 until 3 YES).
- **0-1 YES** → `stop-MVR`. Architect writes MVR brief within 1 sprint.

**Pilot review meeting:** PO schedules within 1 sprint of all 12 goals reaching terminal state.

---

## Status Tracking

Pilot goal state tracked in `docs/data/pilot-status-kinh-dich.json` (NEW file, instantiated from SI-1 schema `docs/data/pilot-status-schema.json`). Separate from `pilot-status.json` (FROZEN TA), `pilot-status-macro-indicators.json` (CLOSED macro), and `pilot-status-stock-price.json` (ACTIVE pilot 3) — all untouched.

**Valid goal states:** `TBD | IN-PROGRESS | YES | NO | PARTIAL | DEFER`
**Valid top-level status:** `ACTIVE | DONE | FAILED` (L3 — no operational labels)
**Valid phase status:** `OPEN | CLOSED` (phase0), `NOT-STARTED | ACTIVE | READY_FOR_CLOSE_GATE | APPROVED | ARCHIVED` (phase1), `NOT-STARTED | AWAITING-PLAN | OPEN | CLOSED` (phase2).

Pilot is DONE when all 12 goals are YES and decisionMatrix is terminal.

---

## Phase Skeleton

| Phase | Goal | Duration | Owner |
|---|---|---|---|
| **Phase 0** | Brownfield + R-FENCE feasibility confirm + agent/flow + pilot-status SSOT + bug-inventory entry + phase-1 task plan | 1 sprint | architect + system-auditor + agent-father (+ dev-kinh-dich R-FENCE confirm) |
| **Phase 1** | TS scaffold: `sandbox/` runner + first primitive extracted + module stub + dashboard stub + sandbox green | 2-3 sprints | dev-kinh-dich |
| **Phase 2** | Remaining primitives + module wiring + composition root + `eslint.config.mjs` fence + dashboard + G5 rewire + G1-G12 chain | 2-3 sprints | dev-kinh-dich + qa + po |
| **Phase 3** | Closure: 12/12 terminal + decisionMatrix populated atomically + charter CLOSES | atomic | po |

**Total:** 6 sprints (hard deadline 2026-07-05).

---

## Amendments

(None at v1 — lessons L1-L7 + L-FENCE baked in. G4 section LOCKED at charter v1 — SI-3 has landed, no architect Amendment authorized per SI-3 §5. Future amendments require PO sign-off + signal trail.)
