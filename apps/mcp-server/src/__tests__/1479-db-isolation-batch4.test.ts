// src/__tests__/1479-db-isolation-batch4.test.ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

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
