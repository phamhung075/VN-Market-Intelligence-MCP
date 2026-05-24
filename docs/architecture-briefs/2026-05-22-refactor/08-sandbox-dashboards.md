# Sandbox / Dashboard Specification

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

---

## 0. Category Chip Display Convention (fleet-wide)

**Adopted:** 2026-05-24. Applied first to technical-analysis pilot dashboard; retrofitted to alert-engine dashboard same day.

Scenario `category` field values in JSON files (SSOT) are: `golden`, `edge`, `failure`.
The render/display layer maps them to "Plain meaning" labels via a lookup table — never shows raw values to the user.

| JSON value (SSOT) | Display label |
|---|---|
| `golden` | Valid Input |
| `edge` | Edge Case |
| `failure` | Bad Input → Error |

The `Bad Input → Error` legend entry includes a `(test PASSES)` clarifier so a passing negative-test is never misread as a failure.

**Implementation rule:** any new dashboard must implement a `categoryLabel(cat)` lookup map at the render layer. Do NOT rename the `category` field values in JSON — those are the SSOT consumed by the sandbox runner.

---

## 1. Core Principle

A sandbox process has zero DB credentials, zero external API keys. All external dependencies are replaced by in-memory port adapters that read `scenarios/*.json` files. This is not a test database — it is not a database at all. The sandbox is a pure function: JSON in → trace JSON out → HTML page out.

---

## 2. sandbox-kit Primitive

**Location:** `packages/primitives/sandbox-kit/`

This is itself a primitive — it follows P-1 through P-7 metrics. It is the only primitive that other primitives, modules, and services depend on (but only in test/sandbox paths, never in production code).

Structure:
```
packages/primitives/sandbox-kit/
├── src/
│   ├── narrator.ts          ← ~60 LoC API
│   ├── render.ts            ← ~150 LoC HTML emitter
│   └── index.ts             ← exports { narrator, render }
├── contract.md
└── scenarios/               ← sandbox-kit tests itself (dogfood)
```

### 2a. narrator.ts API

```typescript
interface Narrator {
  story(name: string, fn: () => Promise<void>): void
  step(name: string): void
  input<T>(label: string, data: T): T            // passthrough — returns data unchanged
  output(label: string, data: unknown): void
}
```

- `narrator.story()` registers a story, wraps execution, captures the full trace.
- `narrator.step()` records a named step in the current story's trace.
- `narrator.input()` records and returns input (passthrough — caller can chain).
- `narrator.output()` records the final output.
- On completion, writes `trace/<kebab-story-name>.json` relative to calling file.
- On failure, writes the trace with `"passed": false` and the error message.

**Production safety:** `narrator.ts` is imported ONLY in `*.sandbox.ts` and `*.narrated.test.ts` files. Never in production service files. Enforced by ESLint rule at L4.

### 2b. Trace JSON schema

```json
{
  "id": "kebab-story-name",
  "tier": "primitive | module | microservice",
  "subject": "package or service name",
  "story": "Human-readable story name",
  "steps": ["step 1 text", "step 2 text"],
  "input": { "label": "description", "data": {} },
  "output": { "label": "description", "data": {} },
  "passed": true,
  "durationMs": 12,
  "edgeCases": [
    { "scenario": "null input", "input": {}, "output": {}, "passed": true }
  ]
}
```

### 2c. render.ts behavior

- Reads all `trace/*.json` files.
- Groups by `tier` and `subject`.
- Per primitive: emits `packages/primitives/<name>/dashboard.html`.
- Per module: emits `packages/modules/<name>/dashboard.html`.
- Per microservice: emits `apps/<name>/dashboard.html`.
- Emits master `apps/mcp-server/dashboard/index.html` with all cards.
- Stack: Tailwind CDN (no build) + highlight.js for JSON syntax color.
- No server, no build step — static HTML, open in browser directly.

### 2d. Category chip display labels

**This subsection is the SSOT for the fleet-wide category chip convention. All dashboards across all services must use this mapping.**

Each scenario card carries a category chip — a small coloured label visible to non-technical reviewers. The scenario JSON `category` field keeps its raw data values unchanged (data contract, scenario file format unchanged). The display layer applies a lookup map before rendering:

| Scenario JSON `category` value (SSOT, never changed) | Dashboard chip text (display layer only) |
|---|---|
| `golden`  | Valid Input |
| `edge`    | Edge Case |
| `failure` | Bad Input → Error |

**Rationale.** The bare word "failure" on a green/PASSED card misleads non-technical readers: a `failure`-category scenario verifies that invalid input is correctly rejected, and the test **passes** when the rejection is correct. Relabelling the chip to "Bad Input → Error" preserves the semantic without changing the data contract.

**Rule — data key unchanged.** The `"category"` field in every `scenarios/*.json` file continues to hold the raw values `golden`, `edge`, or `failure`. Only `render.ts` (the display layer) applies the lookup map. No scenario file, gate spec, or regression spec needs to change.

**Implementation note for render.ts.** The lookup map must be applied in the chip-render path only — not in any assertion, gate, or coverage logic. Example (pseudo-code):

```typescript
const CHIP_LABELS: Record<string, string> = {
  golden:  'Valid Input',
  edge:    'Edge Case',
  failure: 'Bad Input → Error',
}

function renderCategoryChip(category: string): string {
  return CHIP_LABELS[category] ?? category  // fallback: raw value if unknown category
}
```

**Scope.** Convention applies to all services: technical-analysis, macro-indicators, kinh-dich, stock-price, alert-engine, and any future service added to the fleet.

### 2e. AI-runnable dash-check.mjs

**Adopted:** 2026-05-24. Fleet-wide SSOT for the AI-inspector convention.

#### Purpose

Each dashboard zone ships `apps/<service>/dashboard/dash-check.mjs` — a Node ESM script an AI (or CI) runs to read the LIVE rendered dashboard DOM and emit a machine-parseable health report. It COMPLEMENTS `verify-render.mjs` (the strict full-green build gate); `dash-check.mjs` is the general-purpose AI inspector: it reports actual state and is tolerant of pending/stub results via WARN rather than hard-failing.

| Script | Role | Failure model |
|---|---|---|
| `verify-render.mjs` | Strict build gate — all green required | Any non-green = non-zero exit |
| `dash-check.mjs` | AI inspector — reports actual state | WARN on pending/stub (exit 0), FAIL on errors or red dots |

#### Placement

One file per zone: `apps/<service>/dashboard/dash-check.mjs`.

Invocation from the service root:

```
node dashboard/dash-check.mjs
```

#### Hard Rules

1. **Self-derived paths.** All paths derived from `import.meta.url` — no hardcoded absolute paths anywhere in the script.
2. **Playwright resolver.** Resolve `playwright-core` from the local service `node_modules` first; fall back to `apps/frontend/node_modules`. Use CommonJS `require` via `createRequire(import.meta.url)` because playwright-core is a CommonJS package.
3. **File-protocol load.** Load `index.html` via `file://` headless Chromium — no HTTP server required, no server started.
4. **Zero credentials.** Security contract: no DB credentials, no API keys, no environment secrets are read or required. The `file://` + headless approach works entirely without a server or credentials in the sandbox environment.

#### Output Contract

Emit exactly one line to stdout in this format:

```
DASH-CHECK-RESULT: {"service":"...","dotsGreen":N,"dotsRed":N,"dotsPending":N,"jsErrors":N,"pageErrors":N,"categoryChips":{"Valid Input":N,"Edge Case":N,"Bad Input → Error":N},"badLabels":[],"verdict":"PASS|WARN|FAIL"}
```

| Field | Type | Description |
|---|---|---|
| `service` | string | Service name (e.g. `technical-analysis`) |
| `dotsGreen` | number | Count of green status dots |
| `dotsRed` | number | Count of red status dots |
| `dotsPending` | number | Count of pending/NOT-RUN/stub dots |
| `jsErrors` | number | JS console error count |
| `pageErrors` | number | Page crash/load error count |
| `categoryChips` | object | Count per display label (the three plain-meaning labels from §2d) |
| `badLabels` | string[] | Any chip labels found that are NOT in the approved set |
| `verdict` | string | `PASS`, `WARN`, or `FAIL` |

Exit 0 on `PASS` or `WARN`. Non-zero exit on `FAIL`.

#### Verdict Logic (data-driven — no hardcoded totals)

| Condition | Verdict |
|---|---|
| Any red dot, OR any JS error, OR any page error, OR any entry in `badLabels` | `FAIL` |
| Any pending/NOT-RUN/stub dot with zero red dots and zero errors | `WARN` |
| All dots green, zero errors, zero bad labels | `PASS` |

**Bad label definition.** A label is "bad" if it is a bare legacy raw value (`golden`, `edge`, `failure`) or any chip text outside the three approved display labels (`Valid Input`, `Edge Case`, `Bad Input → Error`). This enforces §2d fleet-wide at inspection time.

#### DRY Stance

Where `verify-render.mjs` already exists in a zone (currently: `technical-analysis`, `kinh-dich`), `dash-check.mjs` reuses the same in-zone playwright resolver pattern. Per-zone copies are accepted — zone enforcement forbids cross-zone shared code, so duplication of the resolver across zones is intentional and correct.

---

## 3. In-Memory Port Adapters

Each scenario JSON for a module/microservice includes an `"adapters"` section that specifies mock return values for each port:

```json
{
  "scenario": "HPG RSI scan — overbought",
  "adapters": {
    "PriceHistoryRepository": {
      "findByTicker": [
        { "date": "2026-05-22", "close": 28500 },
        { "date": "2026-05-21", "close": 28200 }
      ]
    }
  },
  "input": { "ticker": "HPG", "window": 14 },
  "expectedOutput": { "signal": "overbought", "value": 72.4 }
}
```

The sandbox runner reads this JSON, instantiates in-memory adapters that return the specified mock data, injects them via DI into the primitive/module, and runs the operation.

**Zero credentials rule:** Sandbox runner never reads `Bun.env.DB_PATH`, `Bun.env.TELEGRAM_TOKEN`, or any external credential. If any primitive/module attempts to read env credentials in sandbox mode, it is a P-2 port-driven violation.

---

## 4. Three-Level Zoom

Each dashboard renders three zoom levels using the same narrator + renderer:

```
Microservice card (top level)
    └── Module calls (second level — which modules were called in which order)
            └── Primitive calls (third level — which primitives each module called)
```

In the master dashboard HTML:
- Click a microservice card → expands to show module composition trace.
- Click a module trace → expands to show primitive call sequence.
- Each level shows: step names, input JSON, output JSON, duration, pass/fail.

This three-level zoom is what makes the dashboard valuable to a non-technical user: they see "System computed RSI for HPG, then classified the signal as overbought, then formatted the alert" — not TypeScript code.

---

## 5. Edit-JSON-and-Rerun Interaction

From Phase 6 (L3/L4 on dashboard metrics), each dashboard has an inline editor:

```
[Scenario: HPG RSI scan — overbought]
┌─────────────────────────────────────────────┐
│  { "ticker": "HPG", "window": 14 }          │  ← editable JSON
└─────────────────────────────────────────────┘
                     [Rerun]
```

Click "Rerun" → sandbox re-runs the scenario with the new JSON input → output updates inline.

Implementation: small `<script>` tag in the HTML that POSTs the new input to a local sandbox HTTP endpoint (started by `bun run sandbox-server`). The sandbox server runs only locally during development/review. In CI, the static HTML is rendered from pre-run traces (no rerun capability in CI, but trace JSON is committed and always fresh).

---

## 6. Coverage Gate

If line coverage for the subject is below 80%, the dashboard injects a red banner:

```html
<div style="background:#dc2626;color:#fff;padding:1rem;text-align:center;font-weight:bold">
  WARNING: This dashboard shows 63% of code paths.
  Stories below may not reflect all system behavior.
  Target: 80% before trusting this dashboard.
</div>
```

If coverage JSON is missing entirely, banner reads: "Coverage data unavailable."

Coverage data comes from `bun test --coverage --coverage-reporter=json`. `render.ts` reads the JSON output and checks `statements` coverage per file/module.

---

## 7. Master Dashboard Layout

```
VN Market Intelligence — System Health Dashboard
Last updated: 2026-05-22 14:32 UTC
─────────────────────────────────────────────────────────────────────

PRIMITIVES (48 total)                          [48 GREEN / 0 YELLOW / 0 RED]
 ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
 │  kinh-dich-     │  │  ta-rsi-        │  │  bctc-ratio-    │
 │  hexagram-      │  │  calculator     │  │  computer       │
 │  resolver       │  │  Coverage: 94%  │  │  Coverage: 87%  │
 │  Coverage: 96%  │  │  Stories: 3     │  │  Stories: 4     │
 └─────────────────┘  └─────────────────┘  └─────────────────┘

MODULES (11 total)                             [11 GREEN / 0 YELLOW / 0 RED]
 ┌─────────────────────┐  ┌─────────────────────┐
 │  kinh-dich module   │  │  technical-analysis  │
 │  Coverage: 91%      │  │  Coverage: 88%       │
 │  Primitives: 7      │  │  Primitives: 6       │
 └─────────────────────┘  └─────────────────────┘

MICROSERVICES (10 total)                       [10 GREEN / 0 YELLOW / 0 RED]
 ┌──────────────────────────┐  ┌──────────────────────────┐
 │  mcp-server              │  │  kinh-dich-service       │
 │  Health: OK              │  │  Health: OK              │
 │  E2E scenarios: 12/12    │  │  E2E scenarios: 3/3      │
 └──────────────────────────┘  └──────────────────────────┘
```

Health badge colors: GREEN = all L2+ metrics pass; YELLOW = 1-2 metrics at L1; RED = any metric at L0.

---

## 8. File Paths

| File | Purpose |
|---|---|
| `packages/primitives/sandbox-kit/src/narrator.ts` | Story recorder |
| `packages/primitives/sandbox-kit/src/render.ts` | HTML emitter |
| `packages/primitives/<name>/scenarios/*.json` | Primitive scenarios |
| `packages/modules/<name>/scenarios/*.json` | Module scenarios |
| `apps/<service>/scenarios/*.json` | Microservice E2E scenarios |
| `apps/mcp-server/dashboard/index.html` | Master dashboard |
| `apps/mcp-server/dashboard/<module>.html` | Per-module dashboards |

**Location decision (from original brief Question 3):** sandbox-kit lives in `packages/primitives/` so it can serve all tiers (primitives, modules, apps) without duplication. This is the "eat your own dogfood" choice — the sandbox-kit is itself a primitive following all P-metrics.

**dashboard/ location:** `apps/mcp-server/dashboard/` for now (module-scoped). If other microservices are added to the dashboard in Phase 6, add a top-level `docs/dashboards/` redirect or move the master index there. PO decision deferred to Phase 5.

---

## 9. npm/bun Scripts

In `apps/mcp-server/package.json`:

```json
"scripts": {
  "trace":     "bun test --pattern '*.narrated.test.ts' --coverage",
  "render":    "bun packages/primitives/sandbox-kit/src/render.ts",
  "dashboard": "bun run trace && bun run render",
  "sandbox":   "bun run sandbox-server.ts"
}
```

`dashboard/` output is committed to the repository as static HTML. No server required for the user to view it — open `apps/mcp-server/dashboard/index.html` in any browser.
