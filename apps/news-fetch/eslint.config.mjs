// apps/news-fetch/eslint.config.mjs
// Architecture fence — three DDD layer rules matching Go depguard Fence-A/B/C.
// Frozen at G4 close; see pilot-charter.md §G4 for AC.
//
// Fence-A: src/primitive/** must not import src/module, src/application,
//          src/interface, or src/infrastructure
// Fence-B: src/module/** must not import src/application, src/interface,
//          or src/infrastructure
// Fence-C: src/infrastructure/** may only be imported from src/index.ts
//          (composition root). All other files are barred from importing infra.
//
// R-2 fallback applied (SI-3 §6.2): @typescript-eslint/parser added so that
// ESLint flat config can parse .ts files. This is the Option-A internal
// fallback — stays within eslint-plugin-boundaries, no drop to Option C.
//
// v6 migration (P2-NF-B inline fix — mirrors kinh-dich P2-KD-C):
//   1. Layer patterns changed from src/<layer>/**/* to src/<layer>/** so files
//      directly inside a layer directory (e.g. src/application/use-cases.ts)
//      are matched — **/* requires an intermediate subdirectory.
//   2. import/resolver set to typescript so .js-suffixed ESM imports resolve
//      to .ts files. Requires eslint-import-resolver-typescript devDependency.
//   3. v6 object-based selectors used for disallow (from/disallow with to:{type}).

import boundaries from "eslint-plugin-boundaries";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts"],
    plugins: {
      boundaries,
    },
    languageOptions: {
      parser: tsParser,
    },
    settings: {
      "import/resolver": {
        typescript: true,
      },
      "boundaries/elements": [
        { type: "primitive",         pattern: "src/primitive/**" },
        { type: "module",            pattern: "src/module/**" },
        { type: "infrastructure",    pattern: "src/infrastructure/**" },
        { type: "application",       pattern: "src/application/**" },
        { type: "interface",         pattern: "src/interface/**" },
        { type: "domain",            pattern: "src/domain/**" },
        { type: "composition-root",  pattern: "src/index.ts" },
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
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            // Rule 1 — Fence-A
            {
              from: { type: "primitive" },
              disallow: { to: { type: ["module", "application", "interface", "infrastructure"] } },
              message: "Fence-A: primitive must not import ${dependency.type} layer",
            },
            // Rule 2 — Fence-B
            {
              from: { type: "module" },
              disallow: { to: { type: ["application", "interface", "infrastructure"] } },
              message: "Fence-B: module must not import ${dependency.type} layer",
            },
            // Rule 3 — Fence-C (inverse: infrastructure must not be imported by anyone except composition-root)
            {
              from: { type: ["domain", "application", "module", "primitive", "interface"] },
              disallow: { to: { type: "infrastructure" } },
              message: "Fence-C: infrastructure wiring only allowed in src/index.ts (composition root)",
            },
          ],
        },
      ],
    },
  },
];
