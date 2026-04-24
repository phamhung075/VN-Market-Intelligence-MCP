Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1037 — reputation_scores DDL dedup regression
 *
 * `initReputationTable()` was removed from
 * `src/infrastructure/db/reputationStore.ts`. The canonical DDL lives only in
 * `src/infrastructure/db/schema.ts:initDatabase()`. This test guards against
 * the helper being re-introduced.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as reputationStore from "../infrastructure/db/reputationStore.js";

describe("Task 1037 — reputation_scores DDL dedup", () => {
  it("reputationStore.ts no longer exports initReputationTable", () => {
    expect((reputationStore as Record<string, unknown>).initReputationTable).toBeUndefined();
  });

  it("reputationStore.ts source contains no CREATE TABLE reputation_scores", () => {
    const src = readFileSync(
      join(import.meta.dir, "..", "infrastructure", "db", "reputationStore.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/CREATE TABLE[^;]*reputation_scores/i);
  });

  it("schema.ts (or its schema-news slice) still defines reputation_scores (canonical)", () => {
    // Sprint 209: DDL moved to schema-news.ts slice. Accept either file.
    const schemaSrc = readFileSync(
      join(import.meta.dir, "..", "infrastructure", "db", "schema.ts"),
      "utf8",
    );
    const newsSrc = readFileSync(
      join(import.meta.dir, "..", "infrastructure", "db", "schema-news.ts"),
      "utf8",
    );
    expect(schemaSrc + newsSrc).toMatch(/CREATE TABLE IF NOT EXISTS reputation_scores/);
  });
});
