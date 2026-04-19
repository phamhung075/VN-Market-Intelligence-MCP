# TASK_1479a — RED: DB isolation batch-4 assertions

sprint: 180
phase: RED (failing test)
file: src/__tests__/1479-db-isolation-batch4.test.ts

## Goal

Assert 6 test files have `Bun.env["DB_PATH"] = ":memory:";` as their first executable line.
Tests MUST FAIL before GREEN phase runs.

## Test file to create

```typescript
// src/__tests__/1479-db-isolation-batch4.test.ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const TESTS_DIR = resolve(import.meta.dir);
const ISOLATION_LINE = `Bun.env["DB_PATH"] = ":memory:";`;

function firstExecutableLine(filePath: string): string {
  const lines = readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
    return trimmed;
  }
  return "";
}

const TARGET_FILES = [
  "1192-evening-summary-empty-fallback.test.ts",
  "125-test-e2e-briefing.test.ts",
  "1348-france-summary-cron-window.test.ts",
  "235-telegram-send-merge.test.ts",
  "126-macro-cascade.test.ts",
  "1074-ask-queue-check-job.test.ts",
];

describe("DB isolation batch-4", () => {
  for (const filename of TARGET_FILES) {
    it(`${filename} — first executable line is Bun.env DB_PATH isolation`, () => {
      const filePath = resolve(TESTS_DIR, filename);
      const first = firstExecutableLine(filePath);
      expect(first).toBe(ISOLATION_LINE);
    });
  }
});
```

## Why tests fail (RED)

- 5 files (1192, 125, 1348, 235, 126) have no `Bun.env["DB_PATH"]` at all
- File 1074 has `process.env["DB_PATH"]` only — `Bun.env` line missing
- `firstExecutableLine()` skips blank + comment lines, hits the first code line
- For 1192/125/1348/235/126 that first code line is NOT the isolation line -> `expect` fails
- For 1074 that first code line IS `process.env[...]` not `Bun.env[...]` -> `expect` fails

## Acceptance (RED phase)

```
bun test src/__tests__/1479-db-isolation-batch4.test.ts
# → 6 failing assertions
```

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1479-db-isolation-batch4.test.ts   # created: RED test, 6 assertions

tests_written:
- src/__tests__/1479-db-isolation-batch4.test.ts   # 6 assertions, all RED (0 pass, 6 fail)

tests_skipped: []

tsc_clean: true
full_suite_pass: n/a (RED phase — intentional failures)
