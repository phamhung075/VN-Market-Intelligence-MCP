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
