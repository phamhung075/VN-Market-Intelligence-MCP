/**
 * layerBCronRegistry.test.ts — TASK-DASH-CRON-1
 *
 * Fixture-dir tests: primary bullet regex, fallback comment regex, deprecated
 * skip-list, multi-cron numbering, drift-detector WARN (non-throwing).
 * Plus a live-directory integration test against the real
 * .claude/commands/crons/ tree (AC-12 — 13 live cron-bearing files).
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  parseLayerBCrons,
  getLayerBCronRows,
  _resetLayerBCronCacheForTests,
  DEPRECATED_LAYER_B_FILES,
} from "../infrastructure/cron/layerBCronRegistry.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "layerb-fixture-"));
  _resetLayerBCronCacheForTests();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  _resetLayerBCronCacheForTests();
});

describe("parseLayerBCrons — fixture dir", () => {
  it("single-cron file (primary bullet regex) → 1 row", () => {
    writeFileSync(
      join(tmpDir, "cron-single.md"),
      "Create x cron with CronCreate:\n\n- **cron**: `0 8 * * 1-5` (daily 08:00 UTC weekdays)\n",
    );
    const rows = parseLayerBCrons(tmpDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("cron-single");
    expect(rows[0]!.cron_expr).toBe("0 8 * * 1-5");
    expect(rows[0]!.layer).toBe("cli-session");
    expect(rows[0]!.status).toBe("SESSION_SCOPED");
    expect(rows[0]!.last_fire).toBeNull();
    expect(rows[0]!.expected_last_fire).toBeNull();
    expect(rows[0]!.expected_next_fire).toBeNull();
    expect(rows[0]!.last_status).toBeNull();
  });

  it("multi-cron file (3 bullets) → 3 rows with #1/#2/#3 suffix", () => {
    writeFileSync(
      join(tmpDir, "cron-multi.md"),
      [
        "Create multi cron:",
        "- **cron**: `7 2-8 * * 1-5`",
        "- **cron**: `12,27,42,57 2-8 * * 1-5`",
        "- **cron**: `3 16 * * 1-5`",
      ].join("\n"),
    );
    const rows = parseLayerBCrons(tmpDir);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(["cron-multi#1", "cron-multi#2", "cron-multi#3"]);
    expect(rows.map((r) => r.cron_expr)).toEqual([
      "7 2-8 * * 1-5",
      "12,27,42,57 2-8 * * 1-5",
      "3 16 * * 1-5",
    ]);
  });

  it("fallback-shape file (# Schedule: '<expr>') → 1 row when primary yields 0 matches", () => {
    writeFileSync(
      join(tmpDir, "cron-fallback.md"),
      "---\n# Fleet dispatcher\n# Schedule: '0 9,14,20 * * *' UTC\n---\nrun docs/agents/x/flow/main.md\n",
    );
    const rows = parseLayerBCrons(tmpDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("cron-fallback");
    expect(rows[0]!.cron_expr).toBe("0 9,14,20 * * *");
  });

  it("deprecated skip-listed file → 0 rows even if it contains cron-looking table text", () => {
    writeFileSync(
      join(tmpDir, "cron-fb-market-poster.md"),
      [
        "# fb-market-poster Cron — DEPRECATED",
        "| slot_id | cron | UTC |",
        "|---|---|---|",
        "| `fb-daily` | `15 9 * * 1-5` | 09:15 UTC |",
      ].join("\n"),
    );
    const rows = parseLayerBCrons(tmpDir);
    expect(rows).toHaveLength(0);
  });

  it("file with primary matches does NOT also apply the fallback regex", () => {
    writeFileSync(
      join(tmpDir, "cron-both-shapes.md"),
      "# Schedule: 'this-should-be-ignored'\n- **cron**: `0 0 * * *`\n",
    );
    const rows = parseLayerBCrons(tmpDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cron_expr).toBe("0 0 * * *");
  });

  it("non-.md files in the directory are ignored", () => {
    writeFileSync(join(tmpDir, "cron-single.md"), "- **cron**: `0 8 * * *`\n");
    writeFileSync(join(tmpDir, "README.txt"), "- **cron**: `should-not-count`\n");
    const rows = parseLayerBCrons(tmpDir);
    expect(rows).toHaveLength(1);
  });

  it("empty dir → 0 rows, no crash", () => {
    expect(parseLayerBCrons(tmpDir)).toHaveLength(0);
  });

  it("drift detector — WARN (not throw) for a non-skip-listed file that looks deprecated", () => {
    writeFileSync(
      join(tmpDir, "cron-looks-deprecated.md"),
      "# some-cron Cron — DEPRECATED\n\n- **cron**: `0 0 * * *`\n",
    );
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    let rows: ReturnType<typeof parseLayerBCrons> = [];
    expect(() => {
      rows = parseLayerBCrons(tmpDir);
    }).not.toThrow();
    expect(rows).toHaveLength(1); // still parsed — WARN only, not skipped
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("getLayerBCronRows — CN-5 memoized singleton", () => {
  it("second call with a different dir still returns the FIRST call's cached rows (memoized)", () => {
    writeFileSync(join(tmpDir, "cron-a.md"), "- **cron**: `0 8 * * *`\n");
    const first = getLayerBCronRows(tmpDir);
    expect(first).toHaveLength(1);

    const tmpDir2 = mkdtempSync(join(tmpdir(), "layerb-fixture2-"));
    writeFileSync(join(tmpDir2, "cron-b.md"), "- **cron**: `0 9 * * *`\n");
    writeFileSync(join(tmpDir2, "cron-c.md"), "- **cron**: `0 10 * * *`\n");
    const second = getLayerBCronRows(tmpDir2);
    expect(second).toHaveLength(1); // still the memoized first-call result
    expect(second).toBe(first);
    rmSync(tmpDir2, { recursive: true, force: true });
  });

  it("_resetLayerBCronCacheForTests clears the memoized cache", () => {
    writeFileSync(join(tmpDir, "cron-a.md"), "- **cron**: `0 8 * * *`\n");
    const first = getLayerBCronRows(tmpDir);
    expect(first).toHaveLength(1);

    _resetLayerBCronCacheForTests();
    writeFileSync(join(tmpDir, "cron-b.md"), "- **cron**: `0 9 * * *`\n");
    const second = getLayerBCronRows(tmpDir);
    expect(second).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Live-directory integration — real .claude/commands/crons/ tree (AC-12)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseLayerBCrons — live .claude/commands/crons/ directory (AC-12)", () => {
  const LIVE_DIR = resolve(process.cwd(), "..", "..", ".claude", "commands", "crons");

  it("cron-fb-market-poster.md → 0 rows (deprecated, skip-listed)", () => {
    const rows = parseLayerBCrons(LIVE_DIR);
    expect(rows.some((r) => r.name.startsWith("cron-fb-market-poster"))).toBe(false);
    expect(DEPRECATED_LAYER_B_FILES).toContain("cron-fb-market-poster.md");
  });

  it("cron-refine-bctc.md → 1 row (fallback regex)", () => {
    const rows = parseLayerBCrons(LIVE_DIR);
    const matches = rows.filter((r) => r.name === "cron-refine-bctc");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.cron_expr).toBe("0 9,14,20 * * *");
  });

  it("multi-cron files parse into N rows each", () => {
    const rows = parseLayerBCrons(LIVE_DIR);
    expect(rows.filter((r) => r.name.startsWith("cron-market-watcher#"))).toHaveLength(3);
    expect(rows.filter((r) => r.name.startsWith("cron-news-scout#"))).toHaveLength(2);
    expect(rows.filter((r) => r.name.startsWith("cron-system-auditor#"))).toHaveLength(3);
  });

  it("every row has layer=cli-session, status=SESSION_SCOPED, no fabricated timestamps (AC-13/14/15)", () => {
    const rows = parseLayerBCrons(LIVE_DIR);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.layer).toBe("cli-session");
      expect(row.status).toBe("SESSION_SCOPED");
      expect(row.last_fire).toBeNull();
      expect(row.expected_last_fire).toBeNull();
      expect(row.expected_next_fire).toBeNull();
      expect(typeof row.reason).toBe("string");
    }
  });
});
