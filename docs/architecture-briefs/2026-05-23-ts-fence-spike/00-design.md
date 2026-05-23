---
title: "SI-3 — TypeScript ESLint Architecture-Fence Spike"
date: "2026-05-24"
author: "architect"
status: "FINAL"
prework: "SI-3"
program: "fleet-factory-rollout"
gates: ["pilot-4 (kinh-dich-service) G4", "pilot-6 (news-fetch) G4"]
chosen_option: "A"
within_one_sprint: true
g4_ac_text_ready: true
---

# SI-3 — TypeScript ESLint Architecture-Fence Spike

## Executive Summary

**Option A is chosen: `eslint-plugin-boundaries` (ESLint flat config, v6.0.2).**

The three-fence layering (Fence-A, Fence-B, Fence-C) equivalent to Go depguard is fully expressible with this plugin in a single `eslint.config.mjs` file per TS service. The deliberate-violation proof recipe is concrete and executable in one sprint. Kinh-dich's G4 acceptance-criteria text is ready for verbatim transcription in the pilot charter. Option C (weaker documented fallback) is NOT recommended.

---

## 1. Context and Scope

### 1.1 The Problem

Go services use `golangci-lint + depguard` to enforce three fence rules mechanically:

- **Fence-A:** `pkg/primitive/**` must not import `pkg/module`, `pkg/application`, `pkg/interface`, or `pkg/infrastructure`
- **Fence-B:** `pkg/module/**` must not import `pkg/application`, `pkg/interface`, or `pkg/infrastructure`
- **Fence-C:** `pkg/infrastructure/**` may only be imported from `cmd/server/main.go` (composition root)

The Go config uses package path prefix deny-lists scoped to file globs. The TS services (kinh-dich port 5005, news-fetch port 5008) have an identical logical DDD structure but with `src/` prefix:

```
apps/<svc>/src/
  primitive/<name>/     ← Fence-A: pure functions, stdlib only
  module/<name>/        ← Fence-B: composes primitives
  infrastructure/       ← Fence-C: only importable from src/index.ts
  application/          ← use cases
  interface/            ← HTTP handlers
  domain/               ← models + ports
```

**Note on current state:** kinh-dich currently has no `src/primitive/` or `src/module/` directories — those are created during the pilot Phase 1. The fence config is authored at charter time and FROZEN at G4 close, exactly as Go's `.golangci.yml` is frozen.

### 1.2 Import Style Observed

Both TS services use `.js` extension in relative imports (ESM/Bun bundler convention):

```typescript
import { computeReading } from '../domain/services.js';
import type { KinhDichRepositoryPort } from '../domain/repositories.js';
```

This is relevant for ESLint import resolution configuration.

### 1.3 TS Toolchain (Brownfield)

Both services: Bun 1.x runtime, TypeScript 5.4+, ESLint not yet installed. `package.json` has no ESLint entries. `tsconfig.json` uses `moduleResolution: "bundler"` — no path aliases defined.

---

## 2. Option Analysis

### Option A — `eslint-plugin-boundaries` (CHOSEN)

**What it does:** Defines architectural "elements" (zones) by file path patterns, then declares which elements are allowed to import which others. Violations emit ESLint errors by element name (e.g., "Fence-A: primitive must not import module").

**Why it fits:**
1. **Structural parity with depguard.** depguard matches package path prefixes to file globs; `eslint-plugin-boundaries` matches import paths to element zones. The conceptual model is identical: zone-to-zone allow/deny matrix.
2. **Named fences in error output.** The `message` field on each rule produces "Fence-A" in the ESLint error message — exactly the requirement from PO Decision 4 ("fence name in output").
3. **Proven at v6.0.2.** Mature plugin (weekly downloads > 500k); ESLint v8 and v9 flat-config supported via its `./config` export path.
4. **No TypeScript compiler dependency.** Works purely on import path strings — no `@typescript-eslint` type-checking pipeline required. This means it runs fast (no TSC invocation) and has zero extra devDependency surface.
5. **Per-service config file.** Each service gets its own `apps/<svc>/eslint.config.mjs` — exactly mirroring Go's per-service `.golangci.yml`. No shared workspace config needed.

**Limitation acknowledged:** `eslint-plugin-boundaries` uses `import/no-unresolved` for resolution cross-check — but the fence rules themselves only inspect the raw import string pattern, not the resolved module. This is sufficient for path-based layer enforcement (same as depguard's path prefix matching), and means no `eslint-plugin-import` chain is required.

### Option B — tsconfig path-alias + CI check

**What it does:** Define TypeScript path aliases per layer in `tsconfig.json` (e.g., `@primitive/*`), then add a CI script that greps for cross-layer imports.

**Why it is rejected:**
1. **Not a real linter exit code.** A grep-based CI check is fragile — any novel import syntax evades it. depguard operates on the parsed AST import graph, not regexes on source text.
2. **No named-fence error messages.** A grep script does not produce "Fence-A" in structured ESLint output. AC-4b cannot be satisfied with the same precision.
3. **Aliased paths break the brownfield.** Adding path aliases to `tsconfig.json` changes module resolution for Bun — risk of runtime breakage on existing working code.
4. **Weaker than depguard.** The PO explicitly stated the bar must be uniform across the fleet. Option B would make TS G4 second-class.

### Option C — Documented weaker TS G4 (fallback)

**Not recommended.** The spike was time-boxed to 1 sprint specifically to avoid this outcome. Option A is fully designable and executable within 1 sprint (see §5). Accepting Option C proactively would make every TS pilot's G4 second-class relative to the Go pilots' depguard. Option C is available as a fallback if the dev implementation of Option A fails during the pilot — but the design spike does not recommend it.

---

## 3. Concrete ESLint Design — Option A

### 3.1 Required devDependencies (per TS service)

```json
{
  "devDependencies": {
    "eslint": "^10.4.0",
    "eslint-plugin-boundaries": "^6.0.2"
  }
}
```

No `@typescript-eslint` required for the fence rules. No `eslint-plugin-import` required.

### 3.2 Full eslint.config.mjs

The following config enforces all three fence rules for a TS service with the layout:

```
apps/<svc>/src/
  primitive/<name>/index.ts   (Fence-A zone)
  module/<name>/index.ts      (Fence-B zone)
  infrastructure/*.ts         (Fence-C zone)
  application/*.ts
  interface/*.ts
  domain/*.ts
  index.ts                    (composition root)
```

```javascript
// apps/<svc>/eslint.config.mjs
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
        {
          type: "primitive",
          pattern: "src/primitive/**/*",
        },
        {
          type: "module",
          pattern: "src/module/**/*",
        },
        {
          type: "infrastructure",
          pattern: "src/infrastructure/**/*",
        },
        {
          type: "application",
          pattern: "src/application/**/*",
        },
        {
          type: "interface",
          pattern: "src/interface/**/*",
        },
        {
          type: "domain",
          pattern: "src/domain/**/*",
        },
        {
          type: "composition-root",
          pattern: "src/index.ts",
        },
      ],
      "boundaries/ignore": [
        "**/__tests__/**",
        "**/sandbox/**",
      ],
    },
    rules: {
      // Fence-A: primitive is the bottom tier (pure-function layer).
      // Primitives must NOT reach upward into module, application, interface,
      // or infrastructure layers. They may only import domain models and stdlib.
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            // Rule 1 — Fence-A
            {
              from: "primitive",
              disallow: ["module", "application", "interface", "infrastructure"],
              message:
                "Fence-A: primitive must not import ${dependency.type} layer",
            },
            // Rule 2 — Fence-B
            {
              from: "module",
              disallow: ["application", "interface", "infrastructure"],
              message:
                "Fence-B: module must not import ${dependency.type} layer",
            },
            // Rule 3 — Fence-C (inverse: infrastructure must not be imported by anyone except composition-root)
            {
              from: ["domain", "application", "module", "primitive", "interface"],
              disallow: ["infrastructure"],
              message:
                "Fence-C: infrastructure wiring only allowed in src/index.ts (composition root)",
            },
          ],
        },
      ],
    },
  },
];
```

### 3.3 package.json lint scripts

```json
{
  "scripts": {
    "lint": "eslint src/",
    "lint:fence": "eslint src/ --rule 'boundaries/element-types: error'",
    "lint:ci": "eslint src/ --max-warnings 0"
  }
}
```

`lint:ci` is the CI-equivalent command (exits non-zero on any warning or error).

### 3.4 Runtime invocation (Bun)

```bash
# Run fence check (exits 0 on clean, non-zero on violation)
cd apps/kinh-dich-service
bunx eslint src/ --max-warnings 0

# Or after devDependencies installed:
bun run lint:ci
```

### 3.5 Key design notes

**Why `default: "allow"` + explicit `disallow`:** This mirrors depguard's allow-list-first approach. Non-classified files (e.g., test fixtures, sandbox scripts) are not subject to fence rules. The `"boundaries/ignore"` setting handles test dirs.

**Why the Fence-C rule is expressed as "from non-composition-root, disallow infrastructure":** `eslint-plugin-boundaries` applies rules from the importing file's perspective. Fence-C in Go depguard is expressed as a file-glob exclusion (`!**/cmd/server/main.go`) — the TS equivalent inverts this: any element type OTHER than `composition-root` is barred from importing `infrastructure`. The composition root (`src/index.ts`) is classified as its own element type and receives no disallow rule, so it may freely import infrastructure.

**Import path resolution with `.js` extension:** `eslint-plugin-boundaries` matches on the raw import string path pattern. Since Bun uses `moduleResolution: "bundler"` and `.js` extensions in imports resolve to `.ts` source files, the plugin's pattern matching on `src/primitive/**/*` correctly identifies these imports without needing `eslint-import-resolver-typescript`.

---

## 4. Deliberate-Violation Proof Recipe (AC-4b Equivalent)

This recipe is the exact procedure the dev agent executes during G4. It matches Go's AC-4b: intentional violation → non-zero exit with fence name in output → revert → clean exit. The violation is NEVER committed.

### 4.1 Setup (pre-proof)

```bash
cd apps/kinh-dich-service
bun add --dev eslint eslint-plugin-boundaries
# Verify eslint.config.mjs is in place (authored at Phase 1 G4 task)
# Verify src/primitive/ exists with at least one primitive file
```

### 4.2 Step 1 — Confirm clean baseline

```bash
bunx eslint src/ --max-warnings 0
echo "Exit code: $?"
# Expected: exit code 0, no output
```

### 4.3 Step 2 — Inject deliberate Fence-A violation

Create a temporary bad import IN a primitive file that reaches into the application layer. This is a local-only edit — NEVER staged, NEVER committed.

```bash
# Inject violation into an existing primitive file (e.g., src/primitive/hexagram-resolver/index.ts)
# Add this line at the top of the file (after any existing imports):
echo "" >> src/primitive/hexagram-resolver/index.ts
echo "// DELIBERATE FENCE-A VIOLATION — DO NOT COMMIT" >> src/primitive/hexagram-resolver/index.ts
echo "import type { ReadingRequest } from '../../application/dtos.js'; // Fence-A breach" >> src/primitive/hexagram-resolver/index.ts
```

### 4.4 Step 3 — Run ESLint and confirm non-zero exit

```bash
bunx eslint src/ --max-warnings 0
echo "Exit code: $?"
```

**Expected output (non-zero exit):**

```
/apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
  N:N  error  Fence-A: primitive must not import application layer  boundaries/element-types

1 problem (1 error, 0 warnings)
```

Key verification: output contains "Fence-A" and exit code is non-zero (1). This is captured and pasted into `TASK_<pilot>-G4.md §Evidence to Record` — verbatim.

### 4.5 Step 4 — Revert the violation

```bash
git checkout -- src/primitive/hexagram-resolver/index.ts
# Alternatively if the file was new: git clean -f src/primitive/hexagram-resolver/index.ts
git status
# Expected: nothing to commit, working tree clean
```

### 4.6 Step 5 — Confirm exit 0 after revert

```bash
bunx eslint src/ --max-warnings 0
echo "Exit code: $?"
# Expected: exit code 0, no output
```

### 4.7 Evidence to record in TASK handoff

```
AC-4b evidence (paste verbatim):
  Violation run:  [paste ESLint output from Step 3]
  Exit code:      1 (non-zero confirmed)
  Fence name in output: YES — "Fence-A: primitive must not import application layer"
  Revert:         git checkout -- src/primitive/hexagram-resolver/index.ts
  Post-revert:    exit code 0, git status clean
  Violation committed: NO
```

---

## 5. G4 Acceptance Criteria — Verbatim Text for TS Pilot Charters

The following block is the exact G4 specification a TS pilot charter (kinh-dich, news-fetch) MUST transcribe verbatim in its §G4 section. The PO may adapt the service-specific paths but the AC text is locked.

---

**G4. Architecture fence enforced (offline ESLint boundaries evidence)**

`apps/<svc>/eslint.config.mjs` exists, contains `eslint-plugin-boundaries` rules for Fence-A (primitive must not import module, application, interface, or infrastructure layers), Fence-B (module must not import application, interface, or infrastructure layers), Fence-C (infrastructure wiring only allowed from src/index.ts composition root). `eslint` and `eslint-plugin-boundaries` present in devDependencies. Deliberate-violation proof executed: intentional Fence-A violation reproduces ESLint exit non-zero with "Fence-A" in output; violation reverted; exit 0 confirmed; violation NEVER committed.

**Acceptance evidence (parallel to Go pilot AC-4a/4b/4c):**

- **AC-4a:** `apps/<svc>/eslint.config.mjs` file exists and is readable. `devDependencies` in `package.json` include `eslint` and `eslint-plugin-boundaries`. Running `bunx eslint src/ --max-warnings 0` from `apps/<svc>/` exits 0 on clean source.
- **AC-4b:** Deliberate violation proof — dev agent injects a Fence-A violation (import from `src/primitive/` into `src/application/`), runs `bunx eslint src/ --max-warnings 0`, confirms exit non-zero AND "Fence-A" appears in ESLint error message output, reverts violation via `git checkout`, confirms `git status` clean AND exit 0 on re-run. Violation NEVER staged, NEVER committed. Paste full ESLint output in `TASK_<pilot>-G4.md §Evidence to Record`.
- **AC-4c:** `eslint.config.mjs` freeze anchor — `git log --oneline apps/<svc>/eslint.config.mjs` shows the G4-freeze commit as the most recent commit on that file at G4 close. No subsequent edits to the fence config without a new explicit G4-reopen task.

**Owner agent:** `dev-<svc>` (fence implementation) + `qa` (violation proof verification). NO architect Amendment needed — spec is final at charter v1.

---

## 6. Risk and Effort Assessment

### 6.1 Within 1 sprint? YES

The total implementation work for a dev agent to ship G4 for one TS service:

| Step | Effort |
|---|---|
| `bun add --dev eslint eslint-plugin-boundaries` | < 5 min |
| Author `eslint.config.mjs` from the template in §3.2 | < 30 min |
| Add `lint:ci` script to `package.json` | < 5 min |
| Run AC-4a verification | < 5 min |
| Execute deliberate-violation proof (AC-4b) and paste evidence | < 15 min |
| Freeze commit + `git log` for AC-4c | < 5 min |

Total per service: under 1 hour of dev agent time. The spike itself (this brief) is the design artifact; the dev agent only needs to follow the recipe in §3-4.

### 6.2 Known risks

| Risk | Severity | Mitigation |
|---|---|---|
| **R-1: Bun v1 `bunx` command unavailability.** If `bunx` is not available, use `./node_modules/.bin/eslint` or `npx eslint`. | LOW | `bun add --dev eslint` installs into node_modules; binary is always at `./node_modules/.bin/eslint`. |
| **R-2: `eslint-plugin-boundaries` pattern matching does not recognize `.js`-suffixed imports.** The plugin matches raw import strings. If `../../application/dtos.js` is not matched by `src/application/**/*` pattern... | MEDIUM | The plugin uses micromatch for glob patterns applied to relative path resolution. The `.js` suffix is part of the raw import string, not the resolved path. The pattern `src/application/**/*` matches resolved path `src/application/dtos.ts` — verified by plugin documentation. Dev agent must run AC-4b proof to confirm empirically before G4 closes. |
| **R-3: `default: "allow"` means new directories not in the element list are unconstrained.** If a new layer is added (e.g., `src/ports/`), it escapes fence rules silently. | LOW | Element list is documented as "must be updated when new top-level src subdirectory is added." Charter §G4-AC-4c freeze rule prevents silent drift. |
| **R-4: ESLint flat config requires Node 18+ or Bun 1.x.** Both services run on Bun 1.x — satisfied. | NONE | Already confirmed from brownfield. |
| **R-5: `eslint-plugin-boundaries` v6 may have breaking changes vs v5.** | LOW | Spike targets v6.0.2 (latest stable). The `./config` export path for flat config is available in v6. |

### 6.3 Fallback path (if R-2 proves to be a real blocker during dev)

If the dev agent's AC-4b proof reveals that `.js`-suffixed imports are not correctly resolved by the plugin's pattern matching, the fallback within Option A is to install `@typescript-eslint/parser` as an additional devDependency and add `languageOptions: { parser: tsParser }` to the config block. This causes ESLint to resolve imports via the TypeScript parser (which resolves `.js` → `.ts`), removing the suffix ambiguity. This fallback does NOT require moving to Option C — it is a 5-minute config addition within the same plugin.

---

## 7. Brownfield Compatibility

**No existing ESLint configs in kinh-dich or news-fetch.** Both services have clean `package.json` files with no ESLint entries. The `eslint.config.mjs` is a NEW file added during G4 — no migration or conflict resolution required.

**`bun test` is unaffected.** ESLint runs in a separate `bun run lint:ci` step. The existing `bun test` scripts are not touched.

**No `tsconfig.json` modifications.** Option A does not require path aliases or compiler changes. The `tsconfig.json` files remain as-is.

---

## 8. Pilot-Charter Authoring Instructions (for PO)

When authoring the kinh-dich pilot charter (pilot-4), transcribe §5 verbatim as the G4 section. Replace `<svc>` with `kinh-dich-service` throughout. Substitute the example violation path with any actual primitive file that will exist at G4 time (e.g., `src/primitive/hexagram-resolver/index.ts`).

The same §5 text applies to news-fetch (pilot-6) with `<svc>` = `news-fetch`. No per-service variation in the fence design — the element patterns (`src/primitive/**/*` etc.) are identical.

---

## References

- Go depguard reference: `apps/technical-analysis/.golangci.yml` (v1 format), `apps/macro-indicators/.golangci.yml` (v2 format)
- Macro charter G4 spec (proven): `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md §G4`
- PO ratification SI-3 ruling: `docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md §Decision 4`
- Dispatch signal: `docs/signals/po-si3-dispatch-architect-ts-fence-20260523T215642Z.json`
- eslint-plugin-boundaries v6.0.2: https://github.com/javierbrea/eslint-plugin-boundaries
