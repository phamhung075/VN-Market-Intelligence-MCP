# TASK 1481a — RED: TDD full-file scan for process.env["DB_PATH"]

type: test
phase: RED
file: src/__tests__/1481-db-isolation-batch6.test.ts (NEW — must not exist yet)
sprint: 182

## What to build

New test file that uses `Bun.Glob` to scan entire content (not just line 1) of all
`src/__tests__/*.test.ts` files for the string `process.env["DB_PATH"]`.
Asserts count = 0. Must FAIL before the bulk fix (RED). Must PASS after GREEN.

Key difference from batch5: batch5 checked line 1 only. This test checks the full file
body — catches beforeEach / afterEach / describe body occurrences that slipped through.

## Injection point

New file — no injection into existing code.

## Test file content

```typescript
// src/__tests__/1481-db-isolation-batch6.test.ts
// NOTE: no DB_PATH line here — this file does not open the DB
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

describe("1481 DB isolation batch6: full-file Bun.env enforcement", () => {
  it("zero test files contain process.env[\"DB_PATH\"] anywhere in file", async () => {
    const glob = new Bun.Glob("src/__tests__/*.test.ts");
    const offenders: string[] = [];

    for await (const file of glob.scan({ cwd: process.cwd() })) {
      const content = readFileSync(file, "utf8");
      if (content.includes('process.env["DB_PATH"]')) {
        offenders.push(file);
      }
    }

    if (offenders.length > 0) {
      console.error(
        `Files still using process.env["DB_PATH"] anywhere (${offenders.length}):`
      );
      offenders.forEach((f) => console.error(`  ${f}`));
    }

    expect(offenders).toHaveLength(0);
  });
});
```

## Why it must FAIL before fix

~50 test files still contain `process.env["DB_PATH"]` inside beforeEach / afterEach /
describe body blocks. `offenders.length` will be ~50, not 0. Test fails.

## Run command (RED verification)

```bash
bun test src/__tests__/1481-db-isolation-batch6.test.ts
# Expected: FAIL — "Expected length: 0, received: ~50"
```

## Commit

```
test(1481): RED — full-file process.env DB_PATH isolation discovery
```

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1481-db-isolation-batch6.test.ts   # new file: full-file scan test, RED phase

tests_written:
- src/__tests__/1481-db-isolation-batch6.test.ts   # 1 assertion, RED (51 offenders found)

tests_skipped: []

tsc_clean: true
full_suite_pass: N/A (RED phase — test intentionally fails)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1481-db-isolation-batch6.test.ts

merge_commit: 7c4df5f
