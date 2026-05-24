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
//
// R-2 fallback applied (SI-3 §6.2): @typescript-eslint/parser added so that
// ESLint 9 flat config can parse .ts files. This is the Option-A internal
// fallback — stays within eslint-plugin-boundaries, no drop to Option C.
//
// v6 migration (P2-KD-C inline fix):
//   1. boundaries/element-types renamed to boundaries/dependencies; legacy
//      string selectors replaced with object-based selectors (v6 migration).
//   2. Layer patterns changed from src/<layer>/**/* to src/<layer>/** so files
//      directly inside a layer directory (e.g. src/application/dtos.ts) are
//      matched — **/* requires an intermediate subdirectory which does not exist
//      for flat-file layers like application/ and domain/.
//   3. import/resolver set to typescript so .js-suffixed ESM imports resolve to
//      .ts files (needed by eslint-module-utils used internally by boundaries).
//      Requires eslint-import-resolver-typescript devDependency.

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
        { type: "primitive", pattern: "src/primitive/**" },
        { type: "module",    pattern: "src/module/**" },
        { type: "infrastructure", pattern: "src/infrastructure/**" },
        { type: "application",    pattern: "src/application/**" },
        { type: "interface",      pattern: "src/interface/**" },
        { type: "domain",         pattern: "src/domain/**" },
        { type: "composition-root", pattern: "src/index.ts" },
      ],
      "boundaries/ignore": [
        "**/__tests__/**",
        "**/sandbox/**",
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: { type: "primitive" },
              disallow: { to: { type: ["module", "application", "interface", "infrastructure"] } },
              message: "Fence-A: primitive must not import ${dependency.type} layer",
            },
            {
              from: { type: "module" },
              disallow: { to: { type: ["application", "interface", "infrastructure"] } },
              message: "Fence-B: module must not import ${dependency.type} layer",
            },
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
