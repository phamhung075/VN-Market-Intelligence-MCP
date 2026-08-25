/**
 * CCATO-MCP-T4-SIGNAL-WRITER — unit tests
 *
 * Covers:
 *   1. buildNarrativeContradictionId — format + injectable-suffix determinism.
 *   2. buildNarrativeContradictionRow — byte-faithful shape vs. the bash
 *      engine's row dict (script L417-437), incl. determinism across calls.
 *   3. writeNarrativeContradictionSignals — appends to a fixture orch-state.json
 *      (never the live file), fan-out for N findings, SignalRowSchema/
 *      OrchStateSchema acceptance, `.signal_queue._updated_by` = the writer
 *      identity ("narrative-truth-gate"), not the calling agent.
 *   4. No-op behavior: missing target file, empty findings array.
 *   5. DEFAULT_ORCH_STATE_PATH resolves to the real repo-root file.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 */

import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildNarrativeContradictionId,
  buildNarrativeContradictionRow,
  writeNarrativeContradictionSignals,
  DEFAULT_ORCH_STATE_PATH,
  SIGNAL_WRITER_ID,
  GATE_VERSION,
  type NarrativeContradictionFinding,
} from "../infrastructure/signals/narrativeContradictionSignalWriter.js";
import { OrchStateSchema } from "../infrastructure/orchStateSchema.js";

const REPO_ROOT = resolve(__dirname, "../../../..");

const FINDING: NarrativeContradictionFinding = {
  dimension: "technical_indicators",
  tool: "get_technical_indicators",
  ticker_or_dim: "VNM",
  probe_ticker: "VNM",
  claim_text: "Chưa có dữ liệu chỉ số kỹ thuật cho VNM.",
  returned_value: "RSI 62.1, MACD bullish crossover",
};

let tmpDir: string | undefined;

function makeFixture(): string {
  tmpDir = mkdtempSync(join(tmpdir(), "ntg-signal-writer-test-"));
  const p = join(tmpDir, "orch-state.json");
  const shell = {
    _meta: { schema: "v4", ssot: true, updated_at: "2026-08-06T00:00:00Z", updated_by: "test" },
    head: { status: "idle" },
    task_board: {
      _updated_at: "2026-08-06T00:00:00Z",
      _updated_by: "test",
      active_sprints: [],
      backlog: [],
      archive: [],
    },
    signal_queue: {
      _updated_at: "2026-08-06T00:00:00Z",
      _updated_by: "test",
      rows: [],
      archive: [],
    },
  };
  writeFileSync(p, JSON.stringify(shell, null, 2), "utf8");
  return p;
}

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. buildNarrativeContradictionId
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T4 — buildNarrativeContradictionId", () => {
  it("builds ntg-<compactTs>-<dimension>-<ticker_or_dim>-<suffix>, injectable suffix is deterministic", () => {
    const id = buildNarrativeContradictionId(FINDING, "2026-08-06T07:37:00Z", () => "abc123");
    expect(id).toBe("ntg-20260806T073700Z-technical_indicators-VNM-abc123");
  });

  it("default (non-injected) suffix generator produces distinct ids across calls", () => {
    const id1 = buildNarrativeContradictionId(FINDING, "2026-08-06T07:37:00Z");
    const id2 = buildNarrativeContradictionId(FINDING, "2026-08-06T07:37:00Z");
    expect(id1).not.toBe(id2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. buildNarrativeContradictionRow
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T4 — buildNarrativeContradictionRow", () => {
  const FIXED_NOW = new Date("2026-08-06T07:37:00.123Z");

  it("matches the bash engine's row shape 1:1 (script L417-437)", () => {
    const row = buildNarrativeContradictionRow(FINDING, "digest-predict", FIXED_NOW, () => "abc123");

    expect(row.id).toBe("ntg-20260806T073700Z-technical_indicators-VNM-abc123");
    expect(row.ts).toBe("2026-08-06T07:37:00Z"); // ms stripped — byte-faithful to python %Y-%m-%dT%H:%M:%SZ
    expect(row.from).toBe("digest-predict");
    expect(row.to).toBe("po");
    expect(row.type).toBe("narrative_contradiction");
    // AC-5 (FIX-CCATO-NTG-...): the summary now QUOTES the probe evidence. The old
    // template asserted "... returned non-null data" without ever reading
    // returned_summary, so a row whose own payload said the opposite still read as an
    // accusation (7 such rows were filed against chef). Kept byte-faithful to the bash
    // engine's new template at scripts/narrative-truth-gate.sh.
    // Evidence tail is budgeted to the 120-char HC-2 cap, so a long probe value is
    // elided with "…" rather than silently chopped by appendSignalQueueRow.
    expect(row.summary).toBe(
      "CCATO: digest-predict claimed no technical_indicators for VNM; get_technical_indicators returned: RSI 62.1, MACD bullis…",
    );
    expect(row.summary.length).toBeLessThanOrEqual(120);
    expect(row.severity).toBe("MED");
    expect(row.status).toBe("NEW");
    expect(row.payload_ref).toBeNull();
    // AC-6: keyed on the finding, not the emission.
    expect(row.dedup_key).toBe("narrative_contradiction:digest-predict:get_technical_indicators:VNM:2026-08-06");
    expect(row.payload).toEqual({
      agent_id: "digest-predict",
      claim: FINDING.claim_text,
      tool: "get_technical_indicators",
      ticker: "VNM",
      probe_ticker: "VNM",
      returned_value: "RSI 62.1, MACD bullish crossover",
      cycle: "2026-08-06",
      gate_version: GATE_VERSION,
    });
  });

  it("determinism: identical inputs → identical row (DoD-style determinism, brief §5.2(d) spirit)", () => {
    const row1 = buildNarrativeContradictionRow(FINDING, "digest-predict", FIXED_NOW, () => "abc123");
    const row2 = buildNarrativeContradictionRow(FINDING, "digest-predict", FIXED_NOW, () => "abc123");
    expect(row1).toEqual(row2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. writeNarrativeContradictionSignals
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T4 — writeNarrativeContradictionSignals", () => {
  it("appends exactly one row for a single finding; row validates against SignalRowSchema/OrchStateSchema", () => {
    const path = makeFixture();

    writeNarrativeContradictionSignals([FINDING], "digest-predict", path, new Date("2026-08-06T07:37:00Z"));

    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk.signal_queue.rows).toHaveLength(1);
    expect(onDisk.signal_queue.rows[0].type).toBe("narrative_contradiction");
    // .signal_queue._updated_by is the writer/tool identity, NOT the calling agent
    // (byte-faithful to script L445 `--arg who "narrative-truth-gate"`)
    expect(onDisk.signal_queue._updated_by).toBe(SIGNAL_WRITER_ID);
    expect(onDisk.signal_queue._updated_by).not.toBe("digest-predict");

    const parsed = OrchStateSchema.safeParse(onDisk);
    expect(parsed.success).toBe(true);
  });

  it("fan-out: N findings → N rows appended, each own CAS-retry window", () => {
    const path = makeFixture();
    const findingB: NarrativeContradictionFinding = {
      ...FINDING,
      dimension: "foreign_flow",
      tool: "get_foreign_flow",
      ticker_or_dim: "ANI",
      probe_ticker: "ANI",
      claim_text: "Không có dữ liệu khối ngoại cho ANI.",
      returned_value: "net buy 1.2B VND",
    };

    writeNarrativeContradictionSignals([FINDING, findingB], "market-watcher", path, new Date("2026-08-06T07:37:00Z"));

    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk.signal_queue.rows).toHaveLength(2);
    const dims = onDisk.signal_queue.rows.map((r: { payload: { ticker: string } }) => r.payload.ticker).sort();
    expect(dims).toEqual(["ANI", "VNM"]);
    expect(OrchStateSchema.safeParse(onDisk).success).toBe(true);
  });

  it("empty findings array → no-op, rows unchanged", () => {
    const path = makeFixture();
    writeNarrativeContradictionSignals([], "digest-predict", path, new Date());
    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk.signal_queue.rows).toHaveLength(0);
  });

  it("missing target file → no-op, never throws (mirrors appendSignalQueueRow's own guard)", () => {
    const missingPath = join(tmpdir(), `ntg-missing-${Date.now()}.json`);
    expect(() =>
      writeNarrativeContradictionSignals([FINDING], "digest-predict", missingPath, new Date()),
    ).not.toThrow();
    expect(existsSync(missingPath)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. DEFAULT_ORCH_STATE_PATH
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T4 — DEFAULT_ORCH_STATE_PATH", () => {
  it("resolves to the real repo-root docs/data/orch/orch-state.json", () => {
    expect(DEFAULT_ORCH_STATE_PATH).toBe(resolve(REPO_ROOT, "docs/data/orch/orch-state.json"));
    expect(existsSync(DEFAULT_ORCH_STATE_PATH)).toBe(true);
  });
});
