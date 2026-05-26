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
import { fileURLToPath } from "url";
import { dirname } from "path";

// Resolve the apps/frontend/ directory as the root path for pattern matching.
// Without rootPath, the plugin receives absolute paths from eslint-module-utils/resolve
// and the relative patterns (e.g. app/lib/api/**/*) would never match.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      // rootPath: the plugin strips this prefix from resolved absolute paths so
      // the relative patterns (app/domain/formatters/**/*) match correctly.
      "boundaries/root-path": __dirname,
      // Configure eslint-import-resolver-typescript to resolve .js → .ts (ESM style)
      // and the ~ alias from tsconfig.json paths. This allows eslint-plugin-boundaries
      // to resolve import paths to their actual filesystem paths and classify them.
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
      "boundaries/elements": [
        {
          type: "formatter",
          // mode:full uses full file path matching (not folder-segment accumulation).
          // Required so app/domain/formatters/**/* correctly identifies files directly
          // in the formatters/ folder (not in a subdirectory) — the default folder mode
          // appends /**/* to the pattern and misclassifies these as "domain" elements.
          mode: "full",
          pattern: "app/domain/formatters/**/*",
        },
        {
          type: "domain",
          mode: "full",
          pattern: "app/domain/**/*",
        },
        {
          type: "view-model",
          mode: "full",
          pattern: "app/lib/view-models/**/*",
        },
        {
          type: "api-client",
          mode: "full",
          pattern: "app/lib/api/**/*",
        },
        {
          type: "component",
          mode: "full",
          pattern: "app/components/**/*",
        },
        {
          type: "route",
          mode: "full",
          pattern: "app/routes/**/*",
        },
        {
          type: "composition-root",
          mode: "full",
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
          // checkUnknownLocals: true ensures the rule fires even when the resolver
          // cannot resolve the import path (e.g. .js extension in ESM imports that
          // resolve to .ts source files, or ~ alias paths). Without this flag,
          // unresolved imports are silently skipped (isUnknown=true → rule skipped).
          checkUnknownLocals: true,
          rules: [
            // Rule 1 — Fence-C (general: api-client must not be imported by domain/view-model/formatter layers)
            // Listed first so Fence-A and Fence-B (more specific, listed later) take precedence
            // via last-write-wins semantics. Fence-C catches domain→api-client violations where
            // neither Fence-A nor Fence-B applies.
            {
              from: ["formatter", "domain", "view-model"],
              disallow: ["api-client"],
              message:
                "Fence-C: lib/api (I/O) must not be imported by domain or view-model layers",
            },
            // Rule 2 — Fence-B (last-write-wins over Fence-C for view-model violations)
            {
              from: "view-model",
              disallow: ["api-client", "route", "component"],
              message:
                "Fence-B: lib/view-models must not import ${dependency.type} layer",
            },
            // Rule 3 — Fence-A (last-write-wins over Fence-C for formatter violations)
            {
              from: "formatter",
              disallow: ["api-client", "route", "component"],
              message:
                "Fence-A: domain/formatters must not import ${dependency.type} layer",
            },
          ],
        },
      ],
    },
  },
];
