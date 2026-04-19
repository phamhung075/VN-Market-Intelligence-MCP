# TASK 1480a — RED: TDD isolation discovery test

type: test
phase: RED
file: src/__tests__/1480-db-isolation-batch5.test.ts (NEW — must not exist yet)
tech_ref: TECH-181

## What to build

New test file that uses `Bun.Glob` to dynamically discover all `src/__tests__/*.test.ts` files whose line 1 contains `process.env["DB_PATH"]`, then asserts the count is zero.

Must FAIL before the bulk fix (RED). Must PASS after (GREEN).

## Injection point

New file — no injection into existing code.

## Test file content

```typescript
// src/__tests__/1480-db-isolation-batch5.test.ts
// NOTE: no DB_PATH line here — this file does not open the DB
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

describe("1480 DB isolation batch5: Bun.env enforcement", () => {
  it("zero test files use process.env[\"DB_PATH\"] at line 1", async () => {
    const glob = new Bun.Glob("src/__tests__/*.test.ts");
    const offenders: string[] = [];

    for await (const file of glob.scan({ cwd: process.cwd() })) {
      const firstLine = readFileSync(file, "utf8").split("\n")[0] ?? "";
      if (firstLine.includes('process.env["DB_PATH"]')) {
        offenders.push(file);
      }
    }

    if (offenders.length > 0) {
      console.error(`Files still using process.env["DB_PATH"] at line 1 (${offenders.length}):`);
      offenders.forEach((f) => console.error(`  ${f}`));
    }

    expect(offenders).toHaveLength(0);
  });
});
```

## Why it must FAIL before fix

`Bun.Glob` will find all 242 files whose line 1 = `process.env["DB_PATH"] = ":memory:";`. `offenders.length` will be 242, not 0. `expect(offenders).toHaveLength(0)` fails.

## Run command (RED verification)

```bash
bun test src/__tests__/1480-db-isolation-batch5.test.ts
# Expected: FAIL — "Expected length: 0, received: N"
```

## Commit

```
test(1480): RED — dynamic process.env DB_PATH isolation discovery
```

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1480-db-isolation-batch5.test.ts   # new file: Bun.Glob discovery test, RED phase

tests_written:
- src/__tests__/1480-db-isolation-batch5.test.ts   # 1 assertion, RED — 119 offenders found

tests_skipped: []

tsc_clean: true
full_suite_pass: N/A (RED phase — test intentionally fails)
