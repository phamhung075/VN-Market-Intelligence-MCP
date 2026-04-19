// src/__tests__/1480-db-isolation-batch5.test.ts
// NOTE: no DB_PATH line here — this file does not open the DB
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

describe("1480 DB isolation batch5: Bun.env enforcement", () => {
  it("zero test files use " + 'process.env' + '["DB_PATH"]' + " at line 1", async () => {
    const glob = new Bun.Glob("src/__tests__/*.test.ts");
    const offenders: string[] = [];

    const banned = 'process.env' + '["DB_PATH"]';
    for await (const file of glob.scan({ cwd: process.cwd() })) {
      const firstLine = readFileSync(file, "utf8").split("\n")[0] ?? "";
      if (firstLine.includes(banned)) {
        offenders.push(file);
      }
    }

    if (offenders.length > 0) {
      console.error(`Files still using ${banned} at line 1 (${offenders.length}):`);
      offenders.forEach((f) => console.error(`  ${f}`));
    }

    expect(offenders).toHaveLength(0);
  });
});
