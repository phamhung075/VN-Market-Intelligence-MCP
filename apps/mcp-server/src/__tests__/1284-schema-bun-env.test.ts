Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1284-schema-bun-env.test.ts
// Task 1284 — schema.ts must not reference process.env for DB_PATH
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const SCHEMA_PATH = join(
  import.meta.dir,
  "../../src/infrastructure/db/schema.ts"
);

describe("Task 1284 — schema.ts uses Bun.env exclusively for DB_PATH", () => {
  it("schema.ts does not contain process.env[\"DB_PATH\"]", () => {
    const src = readFileSync(SCHEMA_PATH, "utf-8");
    const matches = src.match(/process\.env\["DB_PATH"\]/g);
    expect(matches).toBeNull();
  });

  it("schema.ts contains at least two Bun.env[\"DB_PATH\"] references", () => {
    const src = readFileSync(SCHEMA_PATH, "utf-8");
    const matches = src.match(/Bun\.env\["DB_PATH"\]/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
