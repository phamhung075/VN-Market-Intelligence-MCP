# TASK_P2-KD-B — eslint.config.mjs Fence-A/B/C Creation + CI Wiring

**Pilot:** kinh-dich-service (fleet pilot 4)  
**Phase:** 2  
**Owner:** dev-kinh-dich  
**Status:** READY  
**Blocked by:** P2-KD-A DONE (tag kinh-dich-pre-ci exists at 2d245200)  
**Blocks:** P2-KD-C (G4 deliberate-violation proof)  
**Estimated effort:** 1 hour  
**Acceptance criteria count:** 5 (AC-1 through AC-5)  
**G-goals advanced:** G4 (partial)

---

## Background

kinh-dich is the FIRST TypeScript/Bun service in the fleet to exercise `eslint-plugin-boundaries` (SI-3 Option A). The fence config is verbatim from charter §G4 template (LOCKED at charter v1 per SI-3 §5; no architect amendment needed). 

Three fences mirror Go depguard Fence-A/B/C on the TS/Bun service:

- **Fence-A:** `src/primitive/**` must not import `src/module`, `src/application`, `src/interface`, or `src/infrastructure`
- **Fence-B:** `src/module/**` must not import `src/application`, `src/interface`, or `src/infrastructure`
- **Fence-C:** `src/infrastructure/**` may only be imported from `src/index.ts` (composition root)

The R-FENCE gate (charter §R-FENCE Boundary Clause) binds on AC-4b in P2-KD-C — this task creates the fence; P2-KD-C proves it catches violations on the real `.js`-suffixed ESM import style.

---

## Files to Create / Modify

| Path | Action | Purpose |
|------|--------|---------|
| `apps/kinh-dich-service/eslint.config.mjs` | CREATE | Fence-A/B/C rules per charter template |
| `apps/kinh-dich-service/package.json` | MODIFY | Add `eslint` and `eslint-plugin-boundaries` to devDependencies |
| `.github/workflows/ci.yml` | MODIFY or DOCUMENT | Add `kinh-dich-ts-lint` job, or document offline `bunx eslint` as CI equiv |

---

## Step 1 — Create `eslint.config.mjs`

Copy the exact template from charter §G4 to `apps/kinh-dich-service/eslint.config.mjs`:

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

## Step 2 — Update `package.json`

Add the following devDependencies to `apps/kinh-dich-service/package.json`:

```json
{
  "devDependencies": {
    "eslint": "^9.0.0",
    "eslint-plugin-boundaries": "^6.0.2"
  }
}
```

Verify:
```bash
jq '.devDependencies | keys | map(select(test("eslint")))' apps/kinh-dich-service/package.json
```

Should return: `["eslint", "eslint-plugin-boundaries"]` (in array form).

---

## Step 3 — Wire CI (optional or document offline)

If `.github/workflows/ci.yml` exists, add a job:
```yaml
kinh-dich-ts-lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v1
    - run: cd apps/kinh-dich-service && bun install
    - run: cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```

If CI file does not exist yet, document offline command in `docs/protocols/` for now:
```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```

---

## Acceptance Criteria

### AC-1 — `eslint.config.mjs` exists with all three fences

**Verification:**
```bash
test -f apps/kinh-dich-service/eslint.config.mjs && echo FOUND
grep -c "Fence-A\|Fence-B\|Fence-C" apps/kinh-dich-service/eslint.config.mjs
```

First command echoes FOUND. Second returns ≥3 (the three fence rules are present in the config).

**Status:** __ PASS __ FAIL

---

### AC-2 — devDependencies include `eslint` and `eslint-plugin-boundaries`

**Verification:**
```bash
jq '.devDependencies | keys | map(select(test("eslint")))' apps/kinh-dich-service/package.json
```

Output must include: `["eslint", "eslint-plugin-boundaries"]` (both present).

**Status:** __ PASS __ FAIL

---

### AC-3 — Clean lint run on current Phase-1 codebase

**Verification:**
```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```

Exit code must be 0 (no fence violations exist — all Phase-1 primitives and the module are already clean; sandbox is excluded by `boundaries/ignore`).

**Paste output here:**

```
[PASTE TERMINAL OUTPUT]
```

**Status:** __ PASS __ FAIL

---

### AC-4 — `eslint.config.mjs` freeze anchor confirmed

**Verification:**
```bash
git log --oneline apps/kinh-dich-service/eslint.config.mjs
```

The MOST RECENT commit on that file must be the P2-KD-B commit (no subsequent commit has touched the file after this task).

**Paste output here:**

```
[PASTE TERMINAL OUTPUT]
```

**Status:** __ PASS __ FAIL

---

### AC-5 — G12 DoD gate: sandbox all-green (14/14 baseline)

**Verification:**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

Exit code must be 0. Output must show ≥14 scenarios PASS (12 primitive + 2 module from Phase-1 baseline).

**Paste output here:**

```
[PASTE TERMINAL OUTPUT]
```

**Status:** __ PASS __ FAIL

---

## Evidence Summary

| AC | Evidence | Status |
|----|----------|--------|
| AC-1 | `eslint.config.mjs` file with 3+ fence references | __ |
| AC-2 | `jq` output showing eslint + eslint-plugin-boundaries in devDeps | __ |
| AC-3 | `bunx eslint src/` exit 0 output | __ |
| AC-4 | `git log` showing P2-KD-B as most recent commit on the file | __ |
| AC-5 | `bun run src/sandbox/runner.ts --tier=all --scenario=all` exit 0 output (≥14 PASS) | __ |

---

## Commit Message

```
feat(kinh-dich): P2-KD-B — eslint.config.mjs Fence-A/B/C + eslint-plugin-boundaries devDep (G4 partial)
```

---

## R-2 Fallback (if AC-3 or AC-5 reveals boundary matching issue)

If `eslint-plugin-boundaries` fails to catch imports on `.js`-suffixed ESM files during P2-KD-C, apply this in-Option-A fix:

1. Add to `apps/kinh-dich-service/package.json` devDependencies:
   ```json
   "@typescript-eslint/parser": "^7.0.0"
   ```

2. Add to `apps/kinh-dich-service/eslint.config.mjs` (inside the config object):
   ```javascript
   import tsParser from "@typescript-eslint/parser";
   // ... in the export default [ { ... } ]:
   languageOptions: { parser: tsParser },
   ```

3. Rerun AC-3 and AC-5.

This fallback stays within Option A and does NOT require a new task — apply it inline if needed.

---

## Notes for Developer

- Copy the `eslint.config.mjs` template EXACTLY as specified in the charter. Do not modify rule names, message templates, or boundary patterns.
- Ensure the fence rules match the three layers: primitive (Fence-A), module (Fence-B), and infrastructure (Fence-C).
- The `boundaries/ignore` patterns exclude test and sandbox code from linting — both are correct for this phase.
- Do NOT commit the R-2 fallback now; apply it only if empirical testing in P2-KD-C reveals a matching issue.
- All other tests (AC-1 through AC-5) pass cleanly before dev declares DONE.

---

## Next Task

After P2-KD-B DONE signal is received and verified:
- PM sequences P2-KD-C (G4 deliberate-violation proof — Fence-A violation, non-zero exit, reverted)

---

**Charter references:**  
- Pilot charter: `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` §G4  
- Phase-2 task plan: `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-ts.md` §P2-KD-B  
- SI-3 fence spike: `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md` (Option A final)
