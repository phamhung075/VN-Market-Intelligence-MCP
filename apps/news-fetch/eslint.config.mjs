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
// R-2 fallback applied: @typescript-eslint/parser added so ESLint can parse
// TypeScript syntax. See SI-3 §6.3 R-2.

import boundaries from "eslint-plugin-boundaries";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
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
      "boundaries/dependencies": [
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
