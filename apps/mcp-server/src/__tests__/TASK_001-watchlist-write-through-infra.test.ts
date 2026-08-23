/**
 * TASK_001-WATCHLIST-WRITE-THROUGH-INFRA
 *
 * Unit tests for systemMapWatchlistWriter.ts (AC-4). Uses injectable
 * readFile/writeFile/renameFile deps — never touches the real
 * docs/data/system-map.json.
 *
 * NOTE on file location: the handoff (docs/handoffs/TASK_001-WATCHLIST-
 * WRITE-THROUGH-INFRA.md AC-4) specified `apps/mcp-server/__tests__/unit/
 * test_systemMapWatchlistWriter.ts` — that directory does not exist anywhere
 * in this repo and the `test_*` prefix does not match Bun's default test
 * discovery pattern (`*.test.ts`/`*_test.ts`/`*.spec.ts`), so `bun test`
 * would never have picked that file up. Placed here instead, matching every
 * other test in this codebase (`apps/mcp-server/src/__tests__/*.test.ts`,
 * the same convention this agent's own flow doc's `test_command` runs).
 *
 * AC-1: upsertSystemMapWatchlistEntry / removeSystemMapWatchlistEntry
 * AC-4 test cases (minimum 4, all present):
 *   1. Upsert a new entry to a fixture JSON — verify it appears in the written file
 *   2. Remove an entry from a fixture JSON — verify it is deleted
 *   3. File write error is caught and logged, does not throw
 *   4. Write succeeds, file is readable afterward (round-trip verify)
 * Plus: merge-on-upsert-existing, remove-not-found no-op, onError callback.
 */

import { describe, it, expect, mock } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  upsertSystemMapWatchlistEntry,
  removeSystemMapWatchlistEntry,
  type WatchlistEntry,
} from "../infrastructure/db/systemMapWatchlistWriter.js";
import { logger } from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fixture fs — never touches the real filesystem
// ─────────────────────────────────────────────────────────────────────────────

function makeFixtureSystemMap(watchlist: WatchlistEntry[]): string {
  return JSON.stringify({
    lastUpdated: "2026-08-01",
    project: {
      name: "vn-market-intelligence",
      watchlist,
      zones: [],
    },
  });
}

function makeFsFake(initial: string) {
  let store = initial;
  let writtenTmp: string | null = null;
  return {
    readFile: (_p: string) => store,
    writeFile: (_p: string, data: string) => {
      writtenTmp = data;
    },
    renameFile: (_from: string, _to: string) => {
      // Simulate the atomic rename: the tmp content becomes the live content.
      if (writtenTmp !== null) store = writtenTmp;
    },
    getStore: () => store,
  };
}

const FAKE_PATH = "/fixture/system-map.json";

describe("systemMapWatchlistWriter — upsertSystemMapWatchlistEntry", () => {
  it("1: upserts a NEW entry — appears in the written file", async () => {
    const fake = makeFsFake(makeFixtureSystemMap([{ ticker: "VNM", sector: "Dairy", exchange: "HOSE", active: true }]));

    await upsertSystemMapWatchlistEntry(
      FAKE_PATH,
      { ticker: "HPG", sector: "Steel", exchange: "HOSE" },
      { deps: fake },
    );

    const written = JSON.parse(fake.getStore());
    const codes = written.project.watchlist.map((e: WatchlistEntry) => e.ticker);
    expect(codes).toContain("HPG");
    expect(codes).toContain("VNM"); // pre-existing entry untouched
    const hpg = written.project.watchlist.find((e: WatchlistEntry) => e.ticker === "HPG");
    expect(hpg.sector).toBe("Steel");
    expect(hpg.exchange).toBe("HOSE");
    expect(hpg.active).toBe(true); // defaulted
  });

  it("upserts an EXISTING entry — merges fields, does not duplicate the row", async () => {
    const fake = makeFsFake(
      makeFixtureSystemMap([{ ticker: "VNM", sector: "Dairy", exchange: "HOSE", active: true, note: "old note" }]),
    );

    await upsertSystemMapWatchlistEntry(
      FAKE_PATH,
      { ticker: "vnm", sector: "Agriculture / Dairy", exchange: "HOSE" }, // lowercase ticker, case-insensitive match
      { deps: fake },
    );

    const written = JSON.parse(fake.getStore());
    expect(written.project.watchlist).toHaveLength(1); // no duplicate
    const vnm = written.project.watchlist[0];
    expect(vnm.ticker).toBe("VNM"); // normalized uppercase
    expect(vnm.sector).toBe("Agriculture / Dairy"); // updated
    expect(vnm.note).toBe("old note"); // preserved (not overwritten by omission)
  });

  it("2/4: round-trip — file is readable afterward with the new entry intact", async () => {
    const fake = makeFsFake(makeFixtureSystemMap([]));
    await upsertSystemMapWatchlistEntry(FAKE_PATH, { ticker: "FPT", sector: "Tech", exchange: "HOSE" }, { deps: fake });

    // Re-parse the written file exactly as a fresh reader would.
    const rereadParsed = JSON.parse(fake.getStore());
    expect(rereadParsed.project.watchlist).toEqual([
      { ticker: "FPT", sector: "Tech", exchange: "HOSE", active: true },
    ]);
    // Untouched sibling keys survive the read-modify-write.
    expect(rereadParsed.project.name).toBe("vn-market-intelligence");
    expect(rereadParsed.lastUpdated).toBe("2026-08-01");
  });

  it("3: file read error is caught and logged, does not throw", async () => {
    const warnSpy = mock(() => {});
    const originalWarn = logger.warn;
    (logger as unknown as { warn: typeof logger.warn }).warn = warnSpy as unknown as typeof logger.warn;

    const throwingDeps = {
      readFile: (_p: string) => {
        throw new Error("ENOENT: fixture read failure");
      },
      writeFile: () => {},
      renameFile: () => {},
    };

    let caught: unknown = null;
    let onErrorCalledWith: Error | null = null;
    try {
      await upsertSystemMapWatchlistEntry(
        FAKE_PATH,
        { ticker: "XYZ", sector: "Other", exchange: "HOSE" },
        { deps: throwingDeps, onError: (err) => { onErrorCalledWith = err; } },
      );
    } catch (err) {
      caught = err;
    }

    (logger as unknown as { warn: typeof logger.warn }).warn = originalWarn;

    expect(caught).toBeNull(); // never throws
    expect(warnSpy).toHaveBeenCalled(); // logged
    expect(onErrorCalledWith).not.toBeNull();
    expect((onErrorCalledWith as unknown as Error).message).toContain("ENOENT");
  });

  it("write error (renameFile throws) is also caught and logged, does not throw", async () => {
    const warnSpy = mock(() => {});
    const originalWarn = logger.warn;
    (logger as unknown as { warn: typeof logger.warn }).warn = warnSpy as unknown as typeof logger.warn;

    const throwingDeps = {
      readFile: (_p: string) => makeFixtureSystemMap([]),
      writeFile: () => {},
      renameFile: () => {
        throw new Error("EACCES: permission denied");
      },
    };

    let caught: unknown = null;
    try {
      await upsertSystemMapWatchlistEntry(FAKE_PATH, { ticker: "ABC", sector: "Other", exchange: "HOSE" }, { deps: throwingDeps });
    } catch (err) {
      caught = err;
    }

    (logger as unknown as { warn: typeof logger.warn }).warn = originalWarn;

    expect(caught).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("systemMapWatchlistWriter — real filesystem round-trip (no injected deps)", () => {
  it("4: upsert via the REAL default fs functions (tmp + rename) is readable by a fresh fs read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "systemmap-watchlist-writer-"));
    const filePath = join(dir, "system-map.json");
    try {
      const fixture = makeFixtureSystemMap([{ ticker: "VNM", sector: "Dairy", exchange: "HOSE", active: true }]);
      // Real write via node:fs (no deps override) — proves the actual
      // tmp-file + renameSync production path, not just the injected fake.
      writeFileSync(filePath, fixture, "utf-8");

      await upsertSystemMapWatchlistEntry(filePath, { ticker: "GAS", sector: "Oil & Gas", exchange: "HOSE" });

      // Fresh, independent read — not the same in-memory reference the writer used.
      const reread = JSON.parse(readFileSync(filePath, "utf-8"));
      const codes = reread.project.watchlist.map((e: WatchlistEntry) => e.ticker);
      expect(codes).toContain("GAS");
      expect(codes).toContain("VNM");
      const gas = reread.project.watchlist.find((e: WatchlistEntry) => e.ticker === "GAS");
      expect(gas.sector).toBe("Oil & Gas");
      expect(gas.active).toBe(true);

      // Tmp file must not be left behind — atomic rename consumed it.
      expect(() => readFileSync(`${filePath}.tmp`, "utf-8")).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("systemMapWatchlistWriter — removeSystemMapWatchlistEntry", () => {
  it("2: removes an existing entry — deleted from the written file", async () => {
    const fake = makeFsFake(
      makeFixtureSystemMap([
        { ticker: "VNM", sector: "Dairy", exchange: "HOSE", active: true },
        { ticker: "HPG", sector: "Steel", exchange: "HOSE", active: true },
      ]),
    );

    await removeSystemMapWatchlistEntry(FAKE_PATH, "HPG", { deps: fake });

    const written = JSON.parse(fake.getStore());
    const codes = written.project.watchlist.map((e: WatchlistEntry) => e.ticker);
    expect(codes).not.toContain("HPG");
    expect(codes).toContain("VNM");
  });

  it("case-insensitive removal matches regardless of stored/requested casing", async () => {
    const fake = makeFsFake(makeFixtureSystemMap([{ ticker: "VNM", sector: "Dairy", exchange: "HOSE", active: true }]));
    await removeSystemMapWatchlistEntry(FAKE_PATH, "vnm", { deps: fake });
    const written = JSON.parse(fake.getStore());
    expect(written.project.watchlist).toHaveLength(0);
  });

  it("removing a code not present is a no-op — no write performed", async () => {
    const initial = makeFixtureSystemMap([{ ticker: "VNM", sector: "Dairy", exchange: "HOSE", active: true }]);
    const fake = makeFsFake(initial);
    let writeCalled = false;
    const spiedDeps = {
      ...fake,
      writeFile: (p: string, data: string) => {
        writeCalled = true;
        fake.writeFile(p, data);
      },
    };

    await removeSystemMapWatchlistEntry(FAKE_PATH, "NOTPRESENT", { deps: spiedDeps });

    expect(writeCalled).toBe(false);
    expect(fake.getStore()).toBe(initial); // byte-identical, untouched
  });

  it("3: file error on remove is caught and logged, does not throw", async () => {
    const warnSpy = mock(() => {});
    const originalWarn = logger.warn;
    (logger as unknown as { warn: typeof logger.warn }).warn = warnSpy as unknown as typeof logger.warn;

    const throwingDeps = {
      readFile: (_p: string) => {
        throw new Error("corrupt JSON fixture");
      },
      writeFile: () => {},
      renameFile: () => {},
    };

    let caught: unknown = null;
    try {
      await removeSystemMapWatchlistEntry(FAKE_PATH, "VNM", { deps: throwingDeps });
    } catch (err) {
      caught = err;
    }

    (logger as unknown as { warn: typeof logger.warn }).warn = originalWarn;

    expect(caught).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});
