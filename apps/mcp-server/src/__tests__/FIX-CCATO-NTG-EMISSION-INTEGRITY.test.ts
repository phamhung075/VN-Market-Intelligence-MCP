/**
 * FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID
 *
 * ATTRIBUTION (AC-1), proven before any fix was written — the "forged writer
 * id" premise is REFUTED. The ntg-* rows carrying the frozen ts
 * 2026-08-24T00:00:00Z were emitted by the REAL production writer
 * (writeNarrativeContradictionSignals -> appendSignalQueueRow), driven by
 * CCATO-MCP-T5-USECASE.test.ts: five of its cases reach a FAIL verdict while
 * overriding NEITHER `writeSignalsFn` NOR `orchStatePath`, so
 * runNarrativeTruthGate falls through to the real writer at
 * DEFAULT_ORCH_STATE_PATH (the live docs/data/orch/orch-state.json) with the
 * suite's injected clock `new Date("2026-08-24T00:00:00Z")`. Every `bun test`
 * run therefore appended exactly 6 rows to production state, with the
 * returned_value multiset {60, 61, 61, 62.1, 62.1, "not found in database"} —
 * the exact 1/2/2/1 ratio PO measured live at 12/24/24/12 over 12 batches.
 *
 * The guards below close that class at the write boundary rather than relying
 * on every future test author remembering to stub the writer:
 *   (1) test-harness live-write refusal   — NODE_ENV=test + live target
 *   (2) clock-skew quarantine (AC-7)      — |row.ts - wall clock| > 15 min
 *   (3) null-marker quarantine (AC-4)     — returned_value IS a SSOT
 *                                            tool_null_markers entry
 *   (4) dedup_key + collapse (AC-6)       — repeat findings bump `occurrences`
 *   (5) evidence-derived summary (AC-5)   — no unconditional "non-null" claim
 * All rejections quarantine + log a distinct greppable marker; none silently
 * drops a row (AC-3).
 */

import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeNarrativeContradictionSignals,
  buildNarrativeContradictionRow,
  DEFAULT_ORCH_STATE_PATH,
  type NarrativeContradictionFinding,
} from "../infrastructure/signals/narrativeContradictionSignalWriter.js";
import {
  buildDedupKey,
  buildContradictionSummary,
  MARKER_TEST_HARNESS_LIVE_WRITE,
  MARKER_CLOCK_SKEW,
  MARKER_NULL_MARKER_CONTRADICTION,
} from "../infrastructure/signals/narrativeContradictionGuards.js";
import { OrchStateSchema } from "../infrastructure/orchStateSchema.js";

const MARKERS = ["not found in database", "period(s) not found", "insufficient data"] as const;
const WALL_MS = Date.parse("2026-08-25T07:07:04Z");
const FROZEN = new Date("2026-08-24T00:00:00Z"); // 31h stale — the observed defect
const FRESH = new Date(WALL_MS);

/** The exact finding shape T5's leaking cases produced. */
function finding(returnedValue: string): NarrativeContradictionFinding {
  return {
    dimension: "technical_indicators",
    tool: "get_technical_indicators",
    ticker_or_dim: "VNM",
    probe_ticker: "VNM",
    claim_text: "VNM không có dữ liệu kỹ thuật phiên này.",
    returned_value: returnedValue,
  };
}

let tmpDir: string | undefined;

function makeFixture(): string {
  tmpDir = mkdtempSync(join(tmpdir(), "ntg-emission-integrity-"));
  const p = join(tmpDir, "orch-state.json");
  writeFileSync(
    p,
    JSON.stringify({
      _meta: { schema: "v4", ssot: true, updated_at: "2026-08-25T00:00:00Z", updated_by: "test" },
      head: { status: "idle" },
      task_board: {
        _updated_at: "2026-08-25T00:00:00Z",
        _updated_by: "test",
        active_sprints: [],
        backlog: [],
        archive: [],
      },
      signal_queue: { _updated_at: "2026-08-25T00:00:00Z", _updated_by: "test", rows: [], archive: [] },
    }),
  );
  return p;
}

function rowsOf(p: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(p, "utf8")).signal_queue.rows;
}

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

// ═══════════════════════════════════════════════════════════════════════════
// AC-1 — the actual root cause: a test-runner write to the LIVE file
// ═══════════════════════════════════════════════════════════════════════════

describe("FIX-CCATO-NTG — test-harness live-write refusal", () => {
  it("refuses to append to the LIVE orch-state.json while NODE_ENV=test, logs the marker", () => {
    const before = readFileSync(DEFAULT_ORCH_STATE_PATH, "utf8");
    const logs: string[] = [];
    const quarantine = join(tmpdir(), `ntg-q-${Date.now()}-a.jsonl`);

    writeNarrativeContradictionSignals([finding("62.1")], "chef", DEFAULT_ORCH_STATE_PATH, FROZEN, {
      quarantinePath: quarantine,
      logFn: (m) => logs.push(m),
    });

    expect(readFileSync(DEFAULT_ORCH_STATE_PATH, "utf8")).toBe(before);
    expect(logs.some((m) => m.includes(MARKER_TEST_HARNESS_LIVE_WRITE))).toBe(true);
    // A provably-synthetic row is refused outright, not persisted anywhere.
    expect(existsSync(quarantine)).toBe(false);
  });

  it("a fixture-path write under the SAME NODE_ENV=test is unaffected (negative control)", () => {
    const p = makeFixture();
    writeNarrativeContradictionSignals([finding("62.1")], "chef", p, FRESH, {
      wallClockMs: WALL_MS,
      nullMarkers: MARKERS,
    });
    expect(rowsOf(p)).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC-7 — clock skew, both directions, live-target scoped
// ═══════════════════════════════════════════════════════════════════════════

describe("FIX-CCATO-NTG — clock-skew guard", () => {
  it("quarantines a 31h-STALE ts on a live-target write instead of appending it", () => {
    const p = makeFixture();
    const logs: string[] = [];
    const quarantine = join(tmpdir(), `ntg-q-${Date.now()}-b.jsonl`);

    writeNarrativeContradictionSignals([finding("62.1")], "chef", p, FROZEN, {
      livePath: p, // treat the fixture AS the live artifact
      isTestEnv: false,
      wallClockMs: WALL_MS,
      nullMarkers: MARKERS,
      quarantinePath: quarantine,
      logFn: (m) => logs.push(m),
    });

    expect(rowsOf(p)).toHaveLength(0);
    expect(logs.some((m) => m.includes(MARKER_CLOCK_SKEW))).toBe(true);
    // AC-3 — quarantined, never silently dropped.
    expect(readFileSync(quarantine, "utf8")).toContain("ntg-20260824T000000Z");
    rmSync(quarantine, { force: true });
  });

  it("quarantines a FUTURE ts too (AC-7 literal wording)", () => {
    const p = makeFixture();
    const logs: string[] = [];
    writeNarrativeContradictionSignals([finding("62.1")], "chef", p, new Date(WALL_MS + 3_600_000), {
      livePath: p,
      isTestEnv: false,
      wallClockMs: WALL_MS,
      nullMarkers: MARKERS,
      quarantinePath: join(tmpdir(), `ntg-q-${Date.now()}-c.jsonl`),
      logFn: (m) => logs.push(m),
    });
    expect(rowsOf(p)).toHaveLength(0);
    expect(logs.some((m) => m.includes(MARKER_CLOCK_SKEW))).toBe(true);
  });

  it("NEGATIVE CONTROL — a real clock read on the live target passes unchanged", () => {
    const p = makeFixture();
    writeNarrativeContradictionSignals([finding("62.1")], "chef", p, FRESH, {
      livePath: p,
      isTestEnv: false,
      wallClockMs: WALL_MS,
      nullMarkers: MARKERS,
    });
    const rows = rowsOf(p);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["ts"]).toBe("2026-08-25T07:07:04Z");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC-4 — self-consistency: returned_value that IS a tool_null_marker
// ═══════════════════════════════════════════════════════════════════════════

describe("FIX-CCATO-NTG — null-marker self-consistency gate", () => {
  it("rejects the inverted row (returned_value == a tool_null_markers entry)", () => {
    const p = makeFixture();
    const logs: string[] = [];
    const quarantine = join(tmpdir(), `ntg-q-${Date.now()}-d.jsonl`);

    writeNarrativeContradictionSignals([finding("not found in database")], "chef", p, FRESH, {
      wallClockMs: WALL_MS,
      nullMarkers: MARKERS,
      quarantinePath: quarantine,
      logFn: (m) => logs.push(m),
    });

    expect(rowsOf(p)).toHaveLength(0);
    expect(logs.some((m) => m.includes(MARKER_NULL_MARKER_CONTRADICTION))).toBe(true);
    expect(readFileSync(quarantine, "utf8")).toContain("not found in database");
    rmSync(quarantine, { force: true });
  });

  it("markers are read from the injected SSOT list, never hardcoded (empty list => nothing rejected)", () => {
    const p = makeFixture();
    writeNarrativeContradictionSignals([finding("not found in database")], "chef", p, FRESH, {
      wallClockMs: WALL_MS,
      nullMarkers: [],
    });
    expect(rowsOf(p)).toHaveLength(1);
  });

  it("NEGATIVE CONTROL — a genuine contradiction ('62.1') is never rejected", () => {
    const p = makeFixture();
    writeNarrativeContradictionSignals([finding("62.1")], "chef", p, FRESH, {
      wallClockMs: WALL_MS,
      nullMarkers: MARKERS,
    });
    expect(rowsOf(p)).toHaveLength(1);
    expect(OrchStateSchema.safeParse(JSON.parse(readFileSync(p, "utf8"))).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC-6 — dedup_key emitted AND honoured
// ═══════════════════════════════════════════════════════════════════════════

describe("FIX-CCATO-NTG — dedup_key", () => {
  it("keys on the FINDING, not the emission", () => {
    expect(buildDedupKey("chef", "get_technical_indicators", "VNM", "2026-08-25")).toBe(
      "narrative_contradiction:chef:get_technical_indicators:VNM:2026-08-25",
    );
    expect(buildNarrativeContradictionRow(finding("62.1"), "chef", FRESH).dedup_key).toBe(
      "narrative_contradiction:chef:get_technical_indicators:VNM:2026-08-25",
    );
  });

  it("6 repeat emissions of ONE finding collapse to 1 row with occurrences=6", () => {
    const p = makeFixture();
    for (let i = 0; i < 6; i++) {
      writeNarrativeContradictionSignals([finding("62.1")], "chef", p, FRESH, {
        wallClockMs: WALL_MS,
        nullMarkers: MARKERS,
      });
    }
    const rows = rowsOf(p);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["occurrences"]).toBe(6);
    expect(OrchStateSchema.safeParse(JSON.parse(readFileSync(p, "utf8"))).success).toBe(true);
  });

  it("a DIFFERENT finding still gets its own row (collapse is not over-broad)", () => {
    const p = makeFixture();
    writeNarrativeContradictionSignals([finding("62.1")], "chef", p, FRESH, {
      wallClockMs: WALL_MS,
      nullMarkers: MARKERS,
    });
    writeNarrativeContradictionSignals(
      [{ ...finding("net buy 1.2B"), dimension: "foreign_flow", tool: "get_foreign_flow", ticker_or_dim: "ANI" }],
      "chef",
      p,
      FRESH,
      { wallClockMs: WALL_MS, nullMarkers: MARKERS },
    );
    expect(rowsOf(p)).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC-5 — summary derives from the evidence, and stays <=120 (HC-2)
// ═══════════════════════════════════════════════════════════════════════════

describe("FIX-CCATO-NTG — evidence-derived summary", () => {
  it("quotes the actual returned value instead of asserting 'returned non-null data'", () => {
    const s = buildContradictionSummary("chef", "technical_indicators", "VNM", "get_technical_indicators", "62.1");
    expect(s).toContain("62.1");
    expect(s).not.toContain("returned non-null data");
    expect(s.length).toBeLessThanOrEqual(120);
  });

  it("truncates a long returned value to keep the summary within the 120-char HC-2 cap", () => {
    const s = buildContradictionSummary("chef", "technical_indicators", "VNM", "get_technical_indicators", "x".repeat(400));
    expect(s.length).toBeLessThanOrEqual(120);
    expect(s.endsWith("…")).toBe(true);
  });
});
