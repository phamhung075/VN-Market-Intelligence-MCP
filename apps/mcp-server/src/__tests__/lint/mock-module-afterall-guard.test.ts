// apps/mcp-server/src/__tests__/lint/mock-module-afterall-guard.test.ts
//
// Task BATCH2-CI-C-ML-MOCK-STUB-LEAK-GUARD — meta-test guard
//
// Enforces Section 2b Level 1 of the testing-ci-architecture-rethink brief:
// every test file that calls mock.module() at module scope MUST have a matching
// afterAll restore so the stub does not bleed into sibling files via the Bun
// ESM cache.
//
// Regress-prevention: once clean, any new file that adds a module-scope
// mock.module() without an afterAll restore will fail this guard automatically.
//
// Reference: docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md § 2b Level 1
// Sprint: CI-RED-RECONCILE BATCH2-CI-C-ML-MOCK-STUB-LEAK-GUARD

import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

describe("mock.module() afterAll-restore discipline", () => {
  it("every test file with module-scope mock.module() has an afterAll restore", () => {
    const dir = join(process.cwd(), "src/__tests__");
    const allEntries = readdirSync(dir, { recursive: true }) as string[];
    const files = allEntries.filter((f) => f.endsWith(".test.ts"));
    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf-8");
      // Module-scope = mock.module() outside describe/it/beforeAll blocks
      const hasModuleScopeMock = /^mock\.module\(/m.test(src);
      const hasAfterAllRestore = /afterAll.*mock\.restore|afterAll.*mock\.module\(.*real/s.test(src);
      if (hasModuleScopeMock && !hasAfterAllRestore) violations.push(f);
    }
    expect(violations, `Files with module-scope mock.module() but no afterAll restore: ${violations.join(", ")}`).toHaveLength(0);
  });
});
