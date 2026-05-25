// apps/mcp-server/eslint.config.mjs
// Architecture fence — three DDD layer rules adapted to mcp-server brownfield layer structure.
// Frozen at G4 close (P2-B); see pilot-charter.md §G4 and mcp-server-phase-2-task-plan.md §G4.
//
// mcp-server layer structure (not primitive/module; uses domain/application/infrastructure/interface/scheduler/sandbox):
//
// Fence-A: src/domain/** must not import src/infrastructure/, src/interface/, or src/scheduler/.
//          Domain is the pure business-logic layer — zero I/O, zero HTTP, zero DB.
// Fence-B: src/application/** must not import src/interface/ or src/scheduler/.
//          Application use-cases orchestrate domain + infra but must not reach into the interface/HTTP layer.
//          Pre-existing violation: pollNews.ts imports globalSourceTracker from interface/
//          — annotated FENCE-LEGACY (reviewed: sourceHealthTools shared state, brownfield; refactor deferred).
// Fence-C: Fence-A already enforces domain→infrastructure boundary. Sandbox files are excluded via ignores[].
//          NOTE: src/interface/ and src/scheduler/ legitimately import src/infrastructure/ in this brownfield service
//          (scheduler is the application-layer orchestrator; interface/HTTP handlers hold DB refs directly).
//          These are pre-existing patterns ALLOWED by this fence config.
//
// si3_ref: docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md §5
// R-2 fallback applied: @typescript-eslint/parser + @typescript-eslint/eslint-plugin + eslint-import-resolver-typescript
//   resolves .js ESM imports to .ts source files (Bun bundler module resolution convention).
// size-justification: 95L — single-file fence config; Fence-A/B + element map + TS parser/plugin + resolver config.

import boundaries from "eslint-plugin-boundaries";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    ignores: ["src/__tests__/**", "src/sandbox/**", "**/node_modules/**"],
    linterOptions: {
      // Suppress "unused eslint-disable directive" warnings for pre-existing brownfield comments.
      // The @typescript-eslint/* disable comments in existing files are FENCE-LEGACY — they pre-date
      // this fence config and do not affect the boundary enforcement rules.
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      boundaries,
      "@typescript-eslint": tsPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
          extensions: [".ts", ".tsx", ".js"],
        },
      },
      "boundaries/elements": [
        { type: "domain",           pattern: "src/domain/**" },
        { type: "application",      pattern: "src/application/**" },
        { type: "infrastructure",   pattern: "src/infrastructure/**" },
        { type: "interface",        pattern: "src/interface/**" },
        { type: "scheduler",        pattern: "src/scheduler/**" },
        { type: "sandbox",          pattern: "src/sandbox/**" },
        { type: "composition-root", pattern: "src/index.ts" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            // Fence-A: domain is the bottom tier (pure business logic, zero I/O).
            // Domain files must NOT reach upward into infrastructure, interface, or scheduler layers.
            {
              from: { type: "domain" },
              disallow: { to: { type: ["infrastructure", "interface", "scheduler"] } },
              message:
                "Fence-A: domain must not import ${dependency.type} layer",
            },
            // Fence-B: application may import infrastructure (use-cases wire to DB/HTTP fetchers)
            // but must NOT import the interface (HTTP handler) or scheduler layers.
            {
              from: { type: "application" },
              disallow: { to: { type: ["interface", "scheduler"] } },
              message:
                "Fence-B: application must not import ${dependency.type} layer",
            },
          ],
        },
      ],
    },
  },
];
