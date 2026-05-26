// eslint.config.mjs
// Architecture fence — three DDD layer rules adapted for the Remix frontend.
// Mirrors Go depguard Fence-A/B/C semantics for the apps/frontend/app/ layout.
// Frozen at G4 close (P2-B); see pilot-charter.md §G4 for AC.
//
// Frontend layer mapping (Remix-adapted, NOT the standard src/primitive layout):
//   app/domain/formatters/**  ← formatter zone (pure formatting: Fence-A enforced)
//   app/domain/**             ← domain zone (types only)
//   app/lib/view-models/**    ← view-model zone (pure data-transform: Fence-B enforced)
//   app/lib/api/**            ← api-client zone (all I/O: Fence-C enforced)
//   app/components/**         ← component zone
//   app/routes/**             ← route zone (Remix loaders/actions)
//   app/root.tsx              ← composition-root
//
// Fence-A: app/domain/formatters/** must not import api-client, route, or component layers
// Fence-B: app/lib/view-models/** must not import api-client, route, or component layers
// Fence-C: app/lib/api/** (I/O) must not be imported by formatter, domain, or view-model layers

import boundaries from "eslint-plugin-boundaries";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["app/**/*.ts", "app/**/*.tsx"],
    ignores: ["app/__tests__/**", "node_modules/**", "build/**"],
    languageOptions: {
      parser: tsParser,
    },
    linterOptions: {
      // Suppress "rule not found" errors for inline eslint-disable comments
      // that reference @typescript-eslint rules not installed in this config
      // (e.g. @typescript-eslint/no-explicit-any used in StockChart.tsx).
      // The fence config is boundary-rules only; @typescript-eslint rules are
      // handled by the Vite/TSC pipeline.
      reportUnusedDisableDirectives: false,
    },
    plugins: {
      boundaries,
      "@typescript-eslint": tsPlugin,
    },
    settings: {
      "boundaries/elements": [
        {
          type: "formatter",
          pattern: "app/domain/formatters/**/*",
        },
        {
          type: "domain",
          pattern: "app/domain/**/*",
        },
        {
          type: "view-model",
          pattern: "app/lib/view-models/**/*",
        },
        {
          type: "api-client",
          pattern: "app/lib/api/**/*",
        },
        {
          type: "component",
          pattern: "app/components/**/*",
        },
        {
          type: "route",
          pattern: "app/routes/**/*",
        },
        {
          type: "composition-root",
          pattern: "app/root.tsx",
        },
      ],
      "boundaries/ignore": [
        "**/__tests__/**",
        "**/node_modules/**",
        "**/build/**",
      ],
    },
    rules: {
      // Fence-A: formatter layer is pure — no I/O, no components, no routes.
      // Formatters may only import domain types and stdlib.
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            // Rule 1 — Fence-A
            {
              from: "formatter",
              disallow: ["api-client", "route", "component"],
              message:
                "Fence-A: domain/formatters must not import ${dependency.type} layer",
            },
            // Rule 2 — Fence-B
            {
              from: "view-model",
              disallow: ["api-client", "route", "component"],
              message:
                "Fence-B: lib/view-models must not import ${dependency.type} layer",
            },
            // Rule 3 — Fence-C (inverse: api-client must not be imported by formatters, domain, or view-models)
            {
              from: ["formatter", "domain", "view-model"],
              disallow: ["api-client"],
              message:
                "Fence-C: lib/api (I/O) must not be imported by domain or view-model layers",
            },
          ],
        },
      ],
    },
  },
];
