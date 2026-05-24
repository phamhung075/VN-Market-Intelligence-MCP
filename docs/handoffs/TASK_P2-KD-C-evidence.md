# TASK_P2-KD-C Evidence — G4 Deliberate-Violation Proof (R-FENCE Gate)

**Pilot:** kinh-dich-service  
**Phase:** 2  
**Status:** DONE  
**Executed by:** dev-kinh-dich  

---

## R-FENCE Discovery (Inline Fix Applied)

Before the violation proof could run, the fence config from P2-KD-B had two bugs that caused silent failures:

1. **Rule rename:** `boundaries/element-types` is deprecated in v6.0.2; renamed to `boundaries/dependencies`. The legacy rule fired warnings but the disallow rules did not actually catch violations.
2. **Pattern bug:** Element patterns used `src/<layer>/**/*` which requires at least one intermediate subdirectory. Files directly in a layer dir (e.g. `src/application/dtos.ts`) were classified as "unknown" by `@boundaries/elements`, preventing rule matching.
3. **TypeScript resolver:** Added `import/resolver: { typescript: true }` + `eslint-import-resolver-typescript` devDependency so `.js`-suffixed ESM imports resolve to `.ts` files via `eslint-module-utils`.

**Fix applied inline to `eslint.config.mjs`** (same session, before violation proof):
- `boundaries/element-types` → `boundaries/dependencies`
- Legacy string selectors → v6 object-based selectors (`from: { type: "..." }`, `disallow: { to: { type: [...] } }`)
- `src/<layer>/**/*` → `src/<layer>/**` for all layer patterns
- Added `"import/resolver": { typescript: true }` to settings
- Added `eslint-import-resolver-typescript@4.4.4` to devDependencies

---

## AC-1 — Dev-kinh-dich Violation Run (PASS)

**Violation injected in:** `src/primitive/hexagram-resolver/index.ts` (top-level import, line 18):

```typescript
// DELIBERATE FENCE-A VIOLATION — DO NOT COMMIT
import type { ReadingRequest } from '../../application/dtos.js'; // Fence-A breach
```

**ESLint output (non-zero exit):**

```
/Users/.../apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
  18:37  error  Fence-A: primitive must not import application layer  boundaries/dependencies

✖ 1 problem (1 error, 0 warnings)

EXIT_CODE=1
```

**AC-1 PASS**: Exit code 1. Output contains "Fence-A: primitive must not import application layer". Rule: `boundaries/dependencies`.

---

## AC-2 — Linter Exits 0 After Revert (PASS)

Violation reverted with:
```bash
git checkout apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
```

**ESLint output (exit 0):**

```
EXIT_CODE=0
```

No errors, no warnings.

**AC-2 PASS**

---

## AC-3 — Git Status Clean After Revert (PASS)

```bash
git status --short | grep "hexagram-resolver"
# (empty output)
```

No staged or unstaged changes to hexagram-resolver.

**AC-3 PASS**

---

## AC-4 — QA Independent Reproduction on ngu-hanh-classifier (PASS)

**Violation injected in:** `src/primitive/ngu-hanh-classifier/index.ts` (line 2):

```typescript
// DELIBERATE FENCE-A VIOLATION — QA PROOF — DO NOT COMMIT
import type { ReadingRequest } from '../../application/dtos.js'; // Fence-A breach
```

**ESLint output (non-zero exit):**

```
/Users/.../apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts
  2:37  error  Fence-A: primitive must not import application layer  boundaries/dependencies

✖ 1 problem (1 error, 0 warnings)

EXIT_CODE=1
```

**Revert:**
```bash
git checkout apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/index.ts
```

**Post-revert ESLint:** exit 0, no errors.

**Git clean:**
```bash
git status --short | grep "ngu-hanh-classifier"
# (empty output)
```

**AC-4 PASS**: Non-zero exit + "Fence-A" in message on different primitive. Clean after revert.

---

## AC-5 — G12 DoD Gate: Sandbox 14/14 PASS (PASS)

```
[PASS] hao-encoder-edge.json
[PASS] hao-encoder-failure.json
[PASS] hao-encoder-golden.json
[PASS] hexagram-resolver-edge.json
[PASS] hexagram-resolver-failure.json
[PASS] hexagram-resolver-golden.json
[PASS] ngu-hanh-classifier-edge.json
[PASS] ngu-hanh-classifier-failure.json
[PASS] ngu-hanh-classifier-golden.json
[PASS] reading-scorer-edge.json
[PASS] reading-scorer-failure.json
[PASS] reading-scorer-golden.json
[PASS] reading-composer-edge.json
[PASS] reading-composer-golden.json

[sandbox] PASS 14/14 scenarios (0 failed, 0 skipped)
SANDBOX_EXIT=0
```

**AC-5 PASS**

---

## Git Status Final Check

```bash
git status --short apps/kinh-dich-service/src/
# (empty — no source edits)
```

Changed files (committed with this task):
- `apps/kinh-dich-service/eslint.config.mjs` — v6 migration fix
- `apps/kinh-dich-service/package.json` — added eslint-import-resolver-typescript
- `apps/kinh-dich-service/bun.lock` — lock file update

---

## Evidence Summary

| AC | Evidence | Status |
|----|----------|--------|
| AC-1 | Linter violation-run exit 1 + "Fence-A: primitive must not import application layer" | PASS |
| AC-2 | Linter clean-run exit 0 after revert | PASS |
| AC-3 | git status --short \| grep hexagram-resolver = empty | PASS |
| AC-4 | QA proof on ngu-hanh-classifier: exit 1 + "Fence-A" + clean after revert | PASS |
| AC-5 | Sandbox 14/14 PASS exit 0 | PASS |

**All 5 ACs: PASS. G4 R-FENCE gate: PROVEN.**

---

## Anchor Integrity

- Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc`: exists, is ancestor of HEAD
- Tag `kinh-dich-pre-ci`: untouched
- No goal flips (SSOT not touched — PO-only)
