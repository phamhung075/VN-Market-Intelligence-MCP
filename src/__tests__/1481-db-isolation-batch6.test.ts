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
