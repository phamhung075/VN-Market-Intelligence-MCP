/**
 * emit-pressure-state.test.ts — EMIT-DARK-OPTION-C +
 *                               FIX-CYCLE-SNAPSHOT-STALE-PROMOTE-FAILSAFE
 *
 * Tests for emit_pressure_state MCP tool (runEmitPressureState core logic).
 *
 * AC:
 *   (1) Computed fields populate from fixture signal-dir + orch-state
 *   (2) Atomic write produces valid 9-key JSON
 *   (3) Cycle-snapshot promotion when present / no-op when absent
 *   (4) Never-throws on missing paths (returns success:false or null fields)
 *   (5) [FIX-CYCLE-SNAPSHOT-STALE-PROMOTE-FAILSAFE]
 *       Fresh snapshot → promoted:true, stale:false
 *       Stale snapshot REFUSED → promoted:false, stale:true, latest UNTOUCHED
 *       Missing/broken timestamp → treated as stale → REFUSED
 *
 * Sink strategy — ALL writes go to tmp; no production state touched:
 *   - signalsDir    → tmpDir/signals/
 *   - orchStatePath → tmpDir/orch-state.json
 *   - dataDir       → tmpDir/data/
 *   - pressureState → tmpDir/data/pressure-state.json
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  runEmitPressureState,
  computeSignalBacklog,
  computeDevQueueDepth,
  writePressureStateAtomic,
  promoteCycleSnapshot,
  SNAPSHOT_MAX_STALENESS_MS,
  type EmitPressureStateDeps,
  type PressureState,
  type PromoteCycleSnapshotResult,
} from "../interface/mcp/tools/system/emitPressureStateTool.js";

// ─────────────────────────────────────────────────────────────────────────────
// Per-test temp directory
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir = "";

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "emit-ps-test-"));
});

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeSignalsDir(dir: string, files: string[]): string {
  const signalsDir = join(dir, "signals");
  mkdirSync(signalsDir, { recursive: true });
  for (const f of files) {
    writeFileSync(join(signalsDir, f), "{}", "utf8");
  }
  return signalsDir;
}

function makeOrchState(dir: string, tasks: Array<{ status: string }>): string {
  const orchDir = join(dir, "orch");
  mkdirSync(orchDir, { recursive: true });
  const orchStatePath = join(orchDir, "orch-state.json");
  const state = {
    _schema: "v3",
    head: {},
    task_board: {
      _updated_at: "2026-06-05T00:00:00Z",
      _updated_by: "test",
      active_sprints: [
        {
          id: "TEST-SPRINT-1",
          status: "ACTIVE",
          tasks: tasks.map((t, i) => ({
            task_id: `T-${i + 1}`,
            title: `Task ${i + 1}`,
            type: "DEV",
            owner: "test-agent",
            depends: null,
            status: t.status,
          })),
        },
      ],
      backlog: [],
      archive: [],
    },
    signal_queue: {
      _updated_at: "2026-06-05T00:00:00Z",
      _updated_by: "test",
      rows: [],
      archive: [],
    },
  };
  writeFileSync(orchStatePath, JSON.stringify(state, null, 2), "utf8");
  return orchStatePath;
}

/** ISO string that is `offsetMs` ms before `nowIso` */
function tsAgo(nowIso: string, offsetMs: number): string {
  return new Date(new Date(nowIso).getTime() - offsetMs).toISOString();
}

/** Build a minimal valid cycle-snapshot JSON string */
function makeSnapJson(createdAt: string): string {
  return JSON.stringify({
    tick: "12:00",
    created_at: createdAt,
    macro_snapshot: { fetchedAt: createdAt, oilUsd: 79.49, goldUsd: 4344.9 },
  });
}

const NOW_ISO = "2026-06-17T12:00:00.000Z";
const FRESH_AGE_MS = SNAPSHOT_MAX_STALENESS_MS - 60_000; // 1 min inside window
const STALE_AGE_MS = 15 * 24 * 60 * 60 * 1000; // 15 days — well beyond threshold

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: computeSignalBacklog
// ─────────────────────────────────────────────────────────────────────────────

describe("computeSignalBacklog", () => {
  test("counts only non-cowork-team JSON files", () => {
    const signalsDir = makeSignalsDir(tmpDir, [
      "bctc_signal_ACB.json",
      "some-signal.json",
      "cowork-team-2026-06-05T18:01:29Z.json", // excluded
      "cowork-team-2026-06-05T12:00:00Z.json", // excluded
      "not-json.txt",                            // excluded (not .json)
    ]);
    const count = computeSignalBacklog(signalsDir);
    // 2 non-cowork json files
    expect(count).toBe(2);
  });

  test("returns 0 for empty signals dir", () => {
    const signalsDir = makeSignalsDir(tmpDir, []);
    expect(computeSignalBacklog(signalsDir)).toBe(0);
  });

  test("returns null when dir is absent", () => {
    expect(computeSignalBacklog(join(tmpDir, "no-such-dir"))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: computeDevQueueDepth
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDevQueueDepth", () => {
  test("counts TODO and IN_PROGRESS tasks, ignores DONE/BLOCKED", () => {
    const orchStatePath = makeOrchState(tmpDir, [
      { status: "TODO" },
      { status: "IN_PROGRESS" },
      { status: "DONE" },
      { status: "BLOCKED" },
      { status: "TODO" },
    ]);
    // 2x TODO + 1x IN_PROGRESS = 3
    expect(computeDevQueueDepth(orchStatePath)).toBe(3);
  });

  test("returns 0 when no active tasks", () => {
    const orchStatePath = makeOrchState(tmpDir, [
      { status: "DONE" },
      { status: "DONE" },
    ]);
    expect(computeDevQueueDepth(orchStatePath)).toBe(0);
  });

  test("returns null when orch-state.json is absent", () => {
    expect(computeDevQueueDepth(join(tmpDir, "no-such-orch.json"))).toBeNull();
  });

  test("returns null when orch-state.json is malformed JSON", () => {
    const path = join(tmpDir, "bad-orch.json");
    writeFileSync(path, "not-json", "utf8");
    expect(computeDevQueueDepth(path)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: writePressureStateAtomic
// ─────────────────────────────────────────────────────────────────────────────

describe("writePressureStateAtomic", () => {
  test("writes valid 9-key JSON atomically", () => {
    const pressureStatePath = join(tmpDir, "pressure-state.json");
    const state: PressureState = {
      emitted_at: "2026-06-05T18:01:31Z",
      tick_id: "2026-06-05T18:00:00Z",
      signal_backlog: 5,
      last_regime: "bull",
      last_volatility_level: "low",
      calendar_status: "open",
      dev_queue_depth: 3,
      host_headroom_mb: 4096,
      stale_warning: false,
    };

    const err = writePressureStateAtomic(pressureStatePath, state);
    expect(err).toBeNull(); // no error

    // File must exist
    expect(existsSync(pressureStatePath)).toBe(true);

    // Parse and validate 9 keys
    const parsed = JSON.parse(readFileSync(pressureStatePath, "utf8"));
    expect(Object.keys(parsed)).toHaveLength(9);
    expect(parsed.emitted_at).toBe("2026-06-05T18:01:31Z");
    expect(parsed.tick_id).toBe("2026-06-05T18:00:00Z");
    expect(parsed.signal_backlog).toBe(5);
    expect(parsed.last_regime).toBe("bull");
    expect(parsed.last_volatility_level).toBe("low");
    expect(parsed.calendar_status).toBe("open");
    expect(parsed.dev_queue_depth).toBe(3);
    expect(parsed.host_headroom_mb).toBe(4096);
    expect(parsed.stale_warning).toBe(false);
  });

  test("returns error string when write fails (unwritable path)", () => {
    // Pass a mock that throws
    const err = writePressureStateAtomic(
      join(tmpDir, "out.json"),
      {
        emitted_at: "2026-06-05T00:00:00Z",
        tick_id: "unknown",
        signal_backlog: null,
        last_regime: "unknown",
        last_volatility_level: "unknown",
        calendar_status: "unknown",
        dev_queue_depth: null,
        host_headroom_mb: null,
        stale_warning: false,
      },
      (_p, _c) => { throw new Error("DISK_FULL"); },
      (_f, _t) => {},
    );
    expect(err).toBe("DISK_FULL");
  });

  test("no .tmp file remains after successful write", () => {
    const pressureStatePath = join(tmpDir, "pressure-state.json");
    writePressureStateAtomic(pressureStatePath, {
      emitted_at: "2026-06-05T00:00:00Z",
      tick_id: "unknown",
      signal_backlog: null,
      last_regime: "unknown",
      last_volatility_level: "unknown",
      calendar_status: "unknown",
      dev_queue_depth: null,
      host_headroom_mb: null,
      stale_warning: false,
    });
    // No .tmp file should remain
    const files = require("node:fs").readdirSync(tmpDir) as string[];
    const tmpFiles = files.filter((f: string) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: promoteCycleSnapshot (existing behavior — no-file / happy path)
// ─────────────────────────────────────────────────────────────────────────────

describe("promoteCycleSnapshot — base behavior", () => {
  test("returns false (no-op) when per-tick snapshot is absent", () => {
    const dataDir = join(tmpDir, "data-no-snap");
    mkdirSync(dataDir, { recursive: true });

    const result = promoteCycleSnapshot(dataDir, "12:00");
    expect(result.promoted).toBe(false);
    expect(result.stale).toBe(false);
    expect(existsSync(join(dataDir, "cycle-snapshot-latest.json"))).toBe(false);
  });

  test("promotes a FRESH cycle-snapshot to cycle-snapshot-latest.json", () => {
    const dataDir = join(tmpDir, "data");
    mkdirSync(dataDir, { recursive: true });

    // Write fresh snapshot (age = 1 min — inside SNAPSHOT_MAX_STALENESS_MS window)
    const freshTs = tsAgo(NOW_ISO, FRESH_AGE_MS);
    const snapContent = makeSnapJson(freshTs);
    writeFileSync(join(dataDir, "cycle-snapshot-18:00.json"), snapContent, "utf8");

    const result = promoteCycleSnapshot(
      dataDir,
      "18:00",
      undefined,
      undefined,
      undefined,
      () => NOW_ISO,
    );

    expect(result.promoted).toBe(true);
    expect(result.stale).toBe(false);

    const latestPath = join(dataDir, "cycle-snapshot-latest.json");
    expect(existsSync(latestPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(latestPath, "utf8"));
    expect(parsed.macro_snapshot.oilUsd).toBe(79.49);
  });

  test("no .tmp file remains after promotion", () => {
    const dataDir = join(tmpDir, "data-clean");
    mkdirSync(dataDir, { recursive: true });
    const freshTs = tsAgo(NOW_ISO, FRESH_AGE_MS);
    writeFileSync(
      join(dataDir, "cycle-snapshot-09:00.json"),
      makeSnapJson(freshTs),
      "utf8",
    );

    promoteCycleSnapshot(dataDir, "09:00", undefined, undefined, undefined, () => NOW_ISO);

    const files = require("node:fs").readdirSync(dataDir) as string[];
    const tmpFiles = files.filter((f: string) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: FIX-CYCLE-SNAPSHOT-STALE-PROMOTE-FAILSAFE — freshness gate
// ─────────────────────────────────────────────────────────────────────────────

describe("promoteCycleSnapshot — FAIL-SAFE freshness gate", () => {
  test("REFUSES stale snapshot (15 days old) → promoted:false, stale:true, latest UNTOUCHED", () => {
    const dataDir = join(tmpDir, "data-stale");
    mkdirSync(dataDir, { recursive: true });
    const snapPath = join(dataDir, "cycle-snapshot-12:00.json");
    const latestPath = join(dataDir, "cycle-snapshot-latest.json");

    const staleTs = tsAgo(NOW_ISO, STALE_AGE_MS);
    writeFileSync(snapPath, makeSnapJson(staleTs), "utf8");
    // Plant a sentinel in latest to prove it stays untouched
    writeFileSync(latestPath, JSON.stringify({ _sentinel: "untouched" }), "utf8");

    const result = promoteCycleSnapshot(
      dataDir,
      "12:00",
      undefined,
      undefined,
      undefined,
      () => NOW_ISO,
    );

    expect(result.promoted).toBe(false);
    expect(result.stale).toBe(true);

    // cycle-snapshot-latest.json MUST be byte-for-byte untouched
    const latestContent = JSON.parse(readFileSync(latestPath, "utf8"));
    expect(latestContent._sentinel).toBe("untouched");
  });

  test("REFUSES snapshot with no timestamp → promoted:false, stale:true", () => {
    const dataDir = join(tmpDir, "data-no-ts");
    mkdirSync(dataDir, { recursive: true });
    // Snapshot without fetchedAt or created_at
    writeFileSync(
      join(dataDir, "cycle-snapshot-09:00.json"),
      JSON.stringify({ tick: "09:00", oilUsd: 79 }),
      "utf8",
    );

    const result = promoteCycleSnapshot(
      dataDir,
      "09:00",
      undefined,
      undefined,
      undefined,
      () => NOW_ISO,
    );

    expect(result.promoted).toBe(false);
    expect(result.stale).toBe(true);
  });

  test("REFUSES snapshot with broken JSON → promoted:false, stale:true", () => {
    const dataDir = join(tmpDir, "data-broken");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "cycle-snapshot-09:15.json"),
      "{ THIS IS NOT VALID JSON }",
      "utf8",
    );

    const result = promoteCycleSnapshot(
      dataDir,
      "09:15",
      undefined,
      undefined,
      undefined,
      () => NOW_ISO,
    );

    expect(result.promoted).toBe(false);
    expect(result.stale).toBe(true);
  });

  test("accepts snapshot exactly at the freshness boundary (age = threshold - 1 min)", () => {
    const dataDir = join(tmpDir, "data-boundary");
    mkdirSync(dataDir, { recursive: true });
    const freshTs = tsAgo(NOW_ISO, FRESH_AGE_MS);
    writeFileSync(
      join(dataDir, "cycle-snapshot-12:00.json"),
      makeSnapJson(freshTs),
      "utf8",
    );

    const result = promoteCycleSnapshot(
      dataDir,
      "12:00",
      undefined,
      undefined,
      undefined,
      () => NOW_ISO,
    );

    expect(result.promoted).toBe(true);
    expect(result.stale).toBe(false);
  });

  test("reads fetchedAt inside macro_snapshot as fallback when top-level created_at absent", () => {
    const dataDir = join(tmpDir, "data-macro-fetch");
    mkdirSync(dataDir, { recursive: true });
    const freshTs = tsAgo(NOW_ISO, FRESH_AGE_MS);
    // Only macro_snapshot.fetchedAt — no top-level created_at
    writeFileSync(
      join(dataDir, "cycle-snapshot-12:00.json"),
      JSON.stringify({ tick: "12:00", macro_snapshot: { fetchedAt: freshTs, oilUsd: 79 } }),
      "utf8",
    );

    const result = promoteCycleSnapshot(
      dataDir,
      "12:00",
      undefined,
      undefined,
      undefined,
      () => NOW_ISO,
    );

    expect(result.promoted).toBe(true);
    expect(result.stale).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: never-throws — missing paths return success:false or null fields
// ─────────────────────────────────────────────────────────────────────────────

describe("runEmitPressureState — never throws", () => {
  function buildDeps(overrides: Partial<EmitPressureStateDeps>): EmitPressureStateDeps {
    const dataDir = join(tmpDir, "data");
    mkdirSync(dataDir, { recursive: true });
    const pressureStatePath = join(dataDir, "pressure-state.json");

    return {
      getRoot: () => tmpDir,
      computeSignalBacklogFn: () => null,
      computeDevQueueDepthFn: () => null,
      computeHostHeadroomMbFn: () => null,
      writePressureStateAtomicFn: (path, state) =>
        writePressureStateAtomic(pressureStatePath, state),
      promoteCycleSnapshotFn: (): PromoteCycleSnapshotResult => ({ promoted: false, stale: false }),
      nowIso: () => "2026-06-05T18:01:31.000Z",
      ...overrides,
    };
  }

  test("returns success:true with null computed fields when dirs absent", async () => {
    const deps = buildDeps({
      computeSignalBacklogFn: () => null,
      computeDevQueueDepthFn: () => null,
      computeHostHeadroomMbFn: () => null,
    });

    const result = await runEmitPressureState({}, deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.emitted_at).toBe("2026-06-05T18:01:31.000Z");
      expect(result.cycle_snapshot_promoted).toBe(false);
    }
  });

  test("returns success:false when write fails, never throws", async () => {
    const deps = buildDeps({
      writePressureStateAtomicFn: () => "SIMULATED_WRITE_ERROR",
    });

    let threw = false;
    let result: Awaited<ReturnType<typeof runEmitPressureState>> | null = null;
    try {
      result = await runEmitPressureState({}, deps);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    if (!result!.success) {
      expect(result!.reason).toContain("SIMULATED_WRITE_ERROR");
    }
  });

  test("never throws when getRoot throws", async () => {
    const deps = buildDeps({
      getRoot: () => { throw new Error("NO_GIT"); },
    });

    let threw = false;
    let result: Awaited<ReturnType<typeof runEmitPressureState>> | null = null;
    try {
      result = await runEmitPressureState({}, deps);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    if (!result!.success) {
      expect(result!.reason).toContain("NO_GIT");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 Integration: runEmitPressureState stale/fresh snapshot via deps
// ─────────────────────────────────────────────────────────────────────────────

describe("runEmitPressureState — stale/fresh snapshot integration", () => {
  function makeRunDeps(promoteResult: PromoteCycleSnapshotResult): {
    deps: EmitPressureStateDeps;
    capturedState: { value: PressureState | null };
  } {
    const capturedState: { value: PressureState | null } = { value: null };

    const deps: EmitPressureStateDeps = {
      getRoot: () => "/fake/root",
      computeSignalBacklogFn: () => 0,
      computeDevQueueDepthFn: () => 0,
      computeHostHeadroomMbFn: () => 512,
      writePressureStateAtomicFn: (_path, state) => {
        capturedState.value = state;
        return null; // success
      },
      promoteCycleSnapshotFn: () => promoteResult,
      nowIso: () => NOW_ISO,
    };

    return { deps, capturedState };
  }

  test("stale snapshot → cycle_snapshot_promoted:false, stale_warning:true in result AND pressure-state", async () => {
    const { deps, capturedState } = makeRunDeps({ promoted: false, stale: true });

    const result = await runEmitPressureState(
      { tick_id: "2026-06-17T12:00:00Z" },
      deps,
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.cycle_snapshot_promoted).toBe(false);
    expect(result.stale_warning).toBe(true);

    // pressure-state.json must also carry stale_warning:true
    expect(capturedState.value).not.toBeNull();
    expect(capturedState.value!.stale_warning).toBe(true);
  });

  test("fresh snapshot → cycle_snapshot_promoted:true, stale_warning absent/falsy in result AND pressure-state stale_warning:false", async () => {
    const { deps, capturedState } = makeRunDeps({ promoted: true, stale: false });

    const result = await runEmitPressureState(
      { tick_id: "2026-06-17T12:00:00Z" },
      deps,
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.cycle_snapshot_promoted).toBe(true);
    // stale_warning must not be present (or be falsy)
    expect((result as Record<string, unknown>)["stale_warning"]).toBeFalsy();

    // pressure-state stale_warning:false
    expect(capturedState.value).not.toBeNull();
    expect(capturedState.value!.stale_warning).toBe(false);
  });

  test("no snapshot file → cycle_snapshot_promoted:false, no stale_warning", async () => {
    const { deps, capturedState } = makeRunDeps({ promoted: false, stale: false });

    const result = await runEmitPressureState(
      { tick_id: "2026-06-17T12:00:00Z" },
      deps,
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.cycle_snapshot_promoted).toBe(false);
    expect((result as Record<string, unknown>)["stale_warning"]).toBeFalsy();

    expect(capturedState.value!.stale_warning).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1+2 INTEGRATION: end-to-end with fixture signal-dir + orch-state
// ─────────────────────────────────────────────────────────────────────────────

describe("runEmitPressureState — end-to-end with fixtures", () => {
  test("computes all fields from fixtures and writes valid 9-key JSON", async () => {
    // The tool resolves paths relative to getRoot():
    //   signals: <root>/docs/signals/
    //   orch:    <root>/docs/data/orch/orch-state.json
    //   output:  <root>/docs/data/pressure-state.json
    const root = join(tmpDir, "repo");
    const signalsDir = join(root, "docs", "signals");
    const orchDir = join(root, "docs", "data", "orch");
    const dataDir = join(root, "docs", "data");
    mkdirSync(signalsDir, { recursive: true });
    mkdirSync(orchDir, { recursive: true });

    // Signal fixtures: 2 non-cowork, 1 cowork (excluded)
    writeFileSync(join(signalsDir, "bctc_signal_ACB.json"), "{}", "utf8");
    writeFileSync(join(signalsDir, "bctc_signal_FPT.json"), "{}", "utf8");
    writeFileSync(join(signalsDir, "cowork-team-2026-06-05T18:01:29Z.json"), "{}", "utf8");

    // Orch-state fixture: 1 TODO + 1 IN_PROGRESS + 1 DONE = 2 in queue
    const orchStatePath = join(orchDir, "orch-state.json");
    const orchState = {
      _schema: "v3",
      head: {},
      task_board: {
        _updated_at: "2026-06-05T00:00:00Z",
        _updated_by: "test",
        active_sprints: [
          {
            id: "TEST-SPRINT-1",
            status: "ACTIVE",
            tasks: [
              { task_id: "T-1", title: "Task 1", type: "DEV", owner: "test", depends: null, status: "TODO" },
              { task_id: "T-2", title: "Task 2", type: "DEV", owner: "test", depends: null, status: "IN_PROGRESS" },
              { task_id: "T-3", title: "Task 3", type: "DEV", owner: "test", depends: null, status: "DONE" },
            ],
          },
        ],
        backlog: [],
        archive: [],
      },
      signal_queue: {
        _updated_at: "2026-06-05T00:00:00Z",
        _updated_by: "test",
        rows: [],
        archive: [],
      },
    };
    writeFileSync(orchStatePath, JSON.stringify(orchState, null, 2), "utf8");

    const pressureStatePath = join(dataDir, "pressure-state.json");

    const deps: EmitPressureStateDeps = {
      getRoot: () => root,
      computeSignalBacklogFn: (dir) => computeSignalBacklog(dir),
      computeDevQueueDepthFn: (path) => computeDevQueueDepth(path),
      computeHostHeadroomMbFn: () => 8192, // fixed for test determinism
      writePressureStateAtomicFn: (path, state) =>
        writePressureStateAtomic(path, state),
      promoteCycleSnapshotFn: (): PromoteCycleSnapshotResult => ({ promoted: false, stale: false }),
      nowIso: () => "2026-06-05T18:01:31.000Z",
    };

    const result = await runEmitPressureState(
      {
        calendar_status: "open",
        tick_id: "2026-06-05T18:00:00Z",
        fire_time: "2026-06-05T18:01:29Z",
        pressure_mode: "adaptive",
        last_regime: "bull",
        last_volatility_level: "low",
      },
      deps,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.emitted_at).toBe("2026-06-05T18:01:31.000Z");
    expect(result.cycle_snapshot_promoted).toBe(false);

    // Validate written file at the correct path: <root>/docs/data/pressure-state.json
    expect(existsSync(pressureStatePath)).toBe(true);
    const parsed = JSON.parse(readFileSync(pressureStatePath, "utf8"));

    // Must have exactly 9 keys
    expect(Object.keys(parsed)).toHaveLength(9);

    // Schema validation
    expect(parsed.emitted_at).toBe("2026-06-05T18:01:31.000Z");
    expect(parsed.tick_id).toBe("2026-06-05T18:00:00Z");
    expect(parsed.signal_backlog).toBe(2); // 2 non-cowork json files
    expect(parsed.last_regime).toBe("bull");
    expect(parsed.last_volatility_level).toBe("low");
    expect(parsed.calendar_status).toBe("open");
    expect(parsed.dev_queue_depth).toBe(2); // 1 TODO + 1 IN_PROGRESS from fixture
    expect(parsed.host_headroom_mb).toBe(8192);
    expect(parsed.stale_warning).toBe(false);
  });

  test("cycle-snapshot promoted when tick-id snapshot exists and is fresh", async () => {
    const dataDir = join(tmpDir, "data2");
    mkdirSync(dataDir, { recursive: true });
    const orchDir = join(dataDir, "orch");
    mkdirSync(orchDir, { recursive: true });

    // Create a FRESH per-tick cycle-snapshot
    const freshTs = tsAgo(NOW_ISO, FRESH_AGE_MS);
    writeFileSync(
      join(dataDir, "cycle-snapshot-18:00.json"),
      JSON.stringify({
        tick: "18:00",
        created_at: freshTs,
        regime_status: "sideways",
        volatility_level: "normal",
      }),
      "utf8",
    );

    const deps: EmitPressureStateDeps = {
      getRoot: () => join(tmpDir, "root2"),
      computeSignalBacklogFn: () => 0,
      computeDevQueueDepthFn: () => 0,
      computeHostHeadroomMbFn: () => null,
      writePressureStateAtomicFn: (_path, state) => {
        // Write to dataDir directly for this test
        const adjustedPath = join(dataDir, "pressure-state.json");
        return writePressureStateAtomic(adjustedPath, state);
      },
      promoteCycleSnapshotFn: (_dir, hhmm) =>
        promoteCycleSnapshot(dataDir, hhmm, undefined, undefined, undefined, () => NOW_ISO),
      nowIso: () => NOW_ISO,
    };

    const result = await runEmitPressureState(
      { tick_id: "2026-06-17T18:00:00Z" },
      deps,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.cycle_snapshot_promoted).toBe(true);

    // Check latest was written
    const latestPath = join(dataDir, "cycle-snapshot-latest.json");
    expect(existsSync(latestPath)).toBe(true);
    const latest = JSON.parse(readFileSync(latestPath, "utf8"));
    expect(latest.tick).toBe("18:00");
  });
});
