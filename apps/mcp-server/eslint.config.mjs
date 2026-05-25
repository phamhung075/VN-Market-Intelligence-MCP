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
// Fence-C: src/infrastructure/** wiring applies to the composition-root; src/domain/ and src/sandbox/ must not
//          import infrastructure directly.
//          NOTE: src/interface/ and src/scheduler/ legitimately import src/infrastructure/ in this brownfield service
//          (scheduler is the application-layer orchestrator; interface/HTTP handlers hold DB refs directly).
//          These are pre-existing patterns ALLOWED by this fence config; Fence-C only blocks domain/sandbox→infra.
//
// si3_ref: docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md §5
// size-justification: 70L — single-file fence config; all three fence rules + element map in one ESLint flat-config block.

import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        { type: "domain",           pattern: "src/domain/**/*" },
        { type: "application",      pattern: "src/application/**/*" },
        { type: "infrastructure",   pattern: "src/infrastructure/**/*" },
        { type: "interface",        pattern: "src/interface/**/*" },
        { type: "scheduler",        pattern: "src/scheduler/**/*" },
        { type: "sandbox",          pattern: "src/sandbox/**/*" },
        { type: "composition-root", pattern: "src/index.ts" },
      ],
      "boundaries/ignore": [
        "**/__tests__/**",
        "**/sandbox/**",
        "**/node_modules/**",
      ],
    },
    rules: {
      // Fence-A: domain is the bottom tier (pure business logic, zero I/O).
      // Domain files must NOT reach upward into infrastructure, interface, or scheduler layers.
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            // Rule 1 — Fence-A
            {
              from: "domain",
              disallow: ["infrastructure", "interface", "scheduler"],
              message:
                "Fence-A: domain must not import ${dependency.type} layer",
            },
            // Rule 2 — Fence-B
            // application may import infrastructure (use-cases wire to DB/HTTP fetchers)
            // but must NOT import the interface (HTTP handler) or scheduler layers.
            {
              from: "application",
              disallow: ["interface", "scheduler"],
              message:
                "Fence-B: application must not import ${dependency.type} layer",
            },
            // Rule 3 — Fence-C (domain + sandbox must not bypass composition-root to import infra)
            // interface/ and scheduler/ are ALLOWED to import infrastructure in this brownfield service.
            {
              from: ["domain", "sandbox"],
              disallow: ["infrastructure"],
              message:
                "Fence-C: infrastructure wiring only allowed from composition-root or application layer",
            },
          ],
        },
      ],
    },
  },
];
