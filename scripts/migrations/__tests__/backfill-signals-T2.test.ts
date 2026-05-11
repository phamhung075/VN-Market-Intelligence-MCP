// scripts/migrations/__tests__/backfill-signals-T2.test.ts
// Unit tests for backfill-signals-db migration script.
// All file I/O uses a temp dir; all DB ops use :memory: via the exported API.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, basename } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";

import {
  backfillFromDir,
  computeFingerprint,
  type BackfillResult,
} from "../backfill-signals-db.ts";
import { SIGNALS_DDL } from "../create-signals-db.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  for (const stmt of SIGNALS_DDL) {
    db.exec(stmt);
  }
  return db;
}

function writeSignal(dir: string, name: string, data: object): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}

function validSignal(overrides: object = {}): object {
  return {
    from: "agents-architect",
    to: "po",
    type: "architecture-handoff",
    priority: "high",
    payload: { brief: "docs/architecture-briefs/test.md" },
    createdAt: "2026-05-11T10:00:00Z",
    processedAt: "2026-05-11T10:01:00Z",
    processedBy: "dev-team",
    result: "routed-to-po",
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("signal-T2 — backfill-signals-db", () => {
  let tmpDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "signal-T2-"));
    db = makeDb();
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── AC: empty dir → 0 inserted, 0 errors ─────────────────────────────────

  it("empty dir: scanned=0, inserted=0, skipped=0, errors=0", () => {
    const result = backfillFromDir(tmpDir, db);
    expect(result.scanned).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  // ── AC: 3 valid files → 3 inserted ───────────────────────────────────────

  it("3 valid files → inserted=3, skipped=0, errors=0", () => {
    writeSignal(tmpDir, "sig-a.json", validSignal({ createdAt: "2026-05-11T10:00:00Z" }));
    writeSignal(tmpDir, "sig-b.json", validSignal({ createdAt: "2026-05-11T10:01:00Z", type: "task-assigned" }));
    writeSignal(tmpDir, "sig-c.json", validSignal({ createdAt: "2026-05-11T10:02:00Z", from: "pm" }));

    const result = backfillFromDir(tmpDir, db);
    expect(result.scanned).toBe(3);
    expect(result.inserted).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  // ── AC: re-run → 0 inserted (idempotency) ────────────────────────────────

  it("re-run on same dir → inserted=0, skipped=3 (idempotent)", () => {
    writeSignal(tmpDir, "sig-a.json", validSignal({ createdAt: "2026-05-11T10:00:00Z" }));
    writeSignal(tmpDir, "sig-b.json", validSignal({ createdAt: "2026-05-11T10:01:00Z", type: "task-assigned" }));
    writeSignal(tmpDir, "sig-c.json", validSignal({ createdAt: "2026-05-11T10:02:00Z", from: "pm" }));

    backfillFromDir(tmpDir, db); // first run
    const second = backfillFromDir(tmpDir, db); // second run
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(3);
    expect(second.errors).toBe(0);
  });

  // ── AC: legacy file w/o fingerprint → compute on-fly + insert ────────────

  it("legacy file without fingerprint field → computes fingerprint and inserts", () => {
    const sig = {
      from: "agents-architect",
      to: "po",
      type: "architecture-handoff",
      payload: "docs/architecture-briefs/legacy.md",
      priority: "normal",
      createdAt: "2026-05-10T00:00:00Z",
      // NO fingerprint field
      processedAt: "2026-05-10T01:00:00Z",
      processedBy: "dev-team",
      result: "routed-to-po",
    };
    writeSignal(tmpDir, "legacy-sig.json", sig);

    const result = backfillFromDir(tmpDir, db);
    expect(result.inserted).toBe(1);
    expect(result.errors).toBe(0);

    // Verify the computed fingerprint is present in DB
    const expected = computeFingerprint(
      sig.from,
      sig.type,
      sig.payload,
      sig.createdAt
    );
    const row = db
      .query("SELECT fingerprint FROM signals_processed WHERE fingerprint = ?")
      .get(expected) as { fingerprint: string } | null;
    expect(row).not.toBeNull();
    expect(row?.fingerprint).toBe(expected);
  });

  // ── AC: malformed JSON → skip + log error (errors=1) ─────────────────────

  it("malformed JSON file → skipped with error count=1, others still inserted", () => {
    writeFileSync(join(tmpDir, "bad.json"), "{ not valid json {{");
    writeSignal(tmpDir, "good.json", validSignal({ createdAt: "2026-05-11T11:00:00Z" }));

    const result = backfillFromDir(tmpDir, db);
    expect(result.scanned).toBe(2);
    expect(result.inserted).toBe(1);
    expect(result.errors).toBe(1);
  });

  // ── AC: missing dir → throws with clear message ───────────────────────────

  it("missing processed/ dir → throws with descriptive message", () => {
    const missingDir = join(tmpDir, "does-not-exist");
    expect(() => backfillFromDir(missingDir, db)).toThrow(/missing|not found|does not exist/i);
  });

  // ── AC: source_filename stored correctly ─────────────────────────────────

  it("source_filename stored as basename of the processed file", () => {
    const sig = validSignal({ createdAt: "2026-05-11T12:00:00Z" });
    writeSignal(tmpDir, "my-signal-2026-05-11.json", sig);

    backfillFromDir(tmpDir, db);

    const row = db
      .query("SELECT source_filename FROM signals_processed WHERE source_filename = ?")
      .get("my-signal-2026-05-11.json") as { source_filename: string } | null;
    expect(row).not.toBeNull();
    expect(row?.source_filename).toBe("my-signal-2026-05-11.json");
  });

  // ── AC: non-.json files are ignored ──────────────────────────────────────

  it("non-json files in dir are ignored", () => {
    writeFileSync(join(tmpDir, "README.md"), "# readme");
    writeFileSync(join(tmpDir, "signals.db"), "binary");
    writeSignal(tmpDir, "real-sig.json", validSignal({ createdAt: "2026-05-11T13:00:00Z" }));

    const result = backfillFromDir(tmpDir, db);
    expect(result.scanned).toBe(1); // only the .json file
    expect(result.inserted).toBe(1);
  });

  // ── AC: computeFingerprint matches spec algorithm ─────────────────────────

  it("computeFingerprint matches sha256(from+type+JSON.stringify(payload)+createdAt)", () => {
    const from = "agents-architect";
    const type = "architecture-handoff";
    const payload = { brief: "test.md" };
    const createdAt = "2026-05-11T10:00:00Z";

    const expected = createHash("sha256")
      .update(from + type + JSON.stringify(payload) + createdAt)
      .digest("hex");

    expect(computeFingerprint(from, type, payload, createdAt)).toBe(expected);
  });

  // ── AC: file with existing fingerprint field uses it (no recompute) ───────

  it("file with fingerprint field uses provided fingerprint, not recomputed", () => {
    const providedFp = "abc123providedfingerprint";
    const sig = validSignal({
      createdAt: "2026-05-11T14:00:00Z",
      fingerprint: providedFp,
    });
    writeSignal(tmpDir, "with-fp.json", sig);

    backfillFromDir(tmpDir, db);

    const row = db
      .query("SELECT fingerprint FROM signals_processed WHERE fingerprint = ?")
      .get(providedFp) as { fingerprint: string } | null;
    expect(row).not.toBeNull();
  });
});
