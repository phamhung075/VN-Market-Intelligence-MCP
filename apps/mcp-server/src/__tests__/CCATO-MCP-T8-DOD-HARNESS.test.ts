/**
 * CCATO-MCP-T8-DOD-HARNESS — Integration DoD test suite
 *
 * Replays architecture brief §5 item 2 ("Integration DoD") sub-items (a)-(e)
 * end-to-end through a `callTool()`-style MCP harness (McpServer + explicit
 * `server.tool()` registration + direct `handler(args)` invocation — same
 * pattern as 082-tool-watchlist.test.ts and CCATO-MCP-T6-TOOL-REGISTRATION.
 * test.ts's own `makeServer()`/`callTool()` helpers), plus an in-memory
 * SQLite DB (`DB_PATH=":memory:"`, `initDatabase()`/`closeDb()` lifecycle —
 * same convention as 1986-foreign-flow-endpoint.test.ts / 1131-upsert-
 * foreign-flow.test.ts).
 *
 * WHY a local tool-registration wrapper instead of importing the production
 * `registerNarrativeTruthGateTool` directly: that production handler
 * (interface/mcp/tools/system/narrativeTruthGateTool.ts) calls
 * `runNarrativeTruthGate({post_body, agent_id, cache})` with ZERO deps
 * overrides — always the REAL `DEFAULT_ORCH_STATE_PATH` (the live
 * docs/data/orch/orch-state.json) and the REAL network-calling probe
 * adapters. CCATO-MCP-T6-TOOL-REGISTRATION.test.ts's own header documents
 * this exact gap ("Deliberately does NOT exercise a FAIL verdict through
 * the fully-registered tool end-to-end ... would invoke the REAL
 * writeNarrativeContradictionSignals() against the REAL, live
 * docs/data/orch/orch-state.json — never acceptable from a test"). T8 is a
 * test-only row (T1-T7 production code is not modified here) — the fix for
 * this gap is a test-file-local harness function that is a byte-for-byte
 * copy of the production handler's Zod schema + response-shaping logic,
 * parameterized by an injectable `RunNarrativeTruthGateDeps` bag so FAIL /
 * PASS / signal-emit paths can be exercised deterministically against a
 * disposable fixture orch-state.json and stubbed/DB-seeded probe adapters —
 * NEVER the live file, NEVER live network calls. Zero business logic is
 * reimplemented: `runNarrativeTruthGate` (T5) and `formatGateReport` (T6)
 * are the real, imported, unmodified production functions.
 *
 * Probe strategy per assertion (real code path wherever the test env allows
 * it, stub only where unavoidable):
 *   (a) technical_indicators — `computeTAIndicators` always makes a live
 *       HTTP call to the Go TA microservice with no local fallback (R-3,
 *       confirmed by reading infrastructure/microservices/clients.ts) — no
 *       in-process way to exercise it without a running service. Stubbed
 *       via the injectable `adapters` map (same DI convention T3's own
 *       adapters use), returning realistic non-null TA text.
 *   (b) foreign_flow — REAL `probeForeignFlow` -> `getForeignFlowHistory`
 *       (reads `vnstock_trading_stats` via `getDb()`) -> real
 *       `analyzeForeignFlow`, seeded with 2 real in-memory rows. Zero
 *       stubbing.
 *   (c) financials — REAL `probeFinancials` -> `fetchFinancialReportRow`
 *       (reads `financial_reports` via `getDb()`) against a ticker with
 *       ZERO seeded rows -> the real "Period(s) not found in database"
 *       honest-NULL branch (matches the `tool_null_markers` SSOT entry
 *       "period(s) not found" verbatim). Chosen over foreign_flow's own
 *       1-row "insufficient" branch: that branch's message ("Insufficient
 *       foreign flow data for X: only N row(s) found") does NOT contain any
 *       `tool_null_markers` substring (verified: "insufficient data" is not
 *       a contiguous substring of "insufficient foreign flow data") and
 *       would misclassify NON_NULL/FAIL — exactly the false-positive DoD
 *       (c) exists to rule out. Zero stubbing; zero seed rows required
 *       (empty-table query on a fresh in-memory DB).
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §5.2
 */

Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[CCATO-MCP-T8] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { closeDb, getDb, initDatabase } from "../infrastructure/db/schema.js";
import { runNarrativeTruthGate, type RunNarrativeTruthGateDeps } from "../application/usecases/runNarrativeTruthGate.js";
import { formatGateReport } from "../interface/mcp/tools/system/narrativeTruthGateFormat.js";
import {
  DEFAULT_PROBE_ADAPTERS,
  type ProbeAdapterMap,
  type ProbeResult,
} from "../infrastructure/probes/narrativeTruthProbeAdapters.js";
import { DEFAULT_ORCH_STATE_PATH } from "../infrastructure/signals/narrativeContradictionSignalWriter.js";
import { SignalRowSchema } from "../infrastructure/orchStateSchema.js";

const REPO_ROOT = resolve(__dirname, "../../../..");
const FIXED_NOW = new Date("2026-08-24T00:00:00Z");

// ─────────────────────────────────────────────────────────────────────────────
// callTool() harness — local tool-registration wrapper, see file header WHY.
// ─────────────────────────────────────────────────────────────────────────────

function registerTestNarrativeTruthGateTool(server: McpServer, deps: RunNarrativeTruthGateDeps): void {
  const InputSchema = {
    post_body: z.string().min(1),
    agent_id: z.string().min(1),
    cache: z.record(z.record(z.unknown())).optional(),
  };
  server.tool(
    "narrative_truth_gate",
    "Test-harness clone of narrativeTruthGateTool.ts's handler wiring, parameterized by an " +
      "injectable deps bag (the production handler hard-codes zero overrides — see this file's header).",
    InputSchema,
    async ({ post_body, agent_id, cache }) => {
      const result = await runNarrativeTruthGate(
        cache === undefined ? { post_body, agent_id } : { post_body, agent_id, cache },
        deps,
      );
      const text = formatGateReport(result);
      return {
        content: [{ type: "text" as const, text }],
        ...(result.verdict === "CONFIG_ERROR" ? { isError: true } : {}),
      };
    },
  );
}

function makeServer(deps: RunNarrativeTruthGateDeps): McpServer {
  const server = new McpServer({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
  registerTestNarrativeTruthGateTool(server, deps);
  return server;
}

async function callTool(
  server: McpServer,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const registry = (
    server as unknown as {
      _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }>;
    }
  )._registeredTools;
  const entry = registry["narrative_truth_gate"];
  if (!entry) throw new Error('Tool "narrative_truth_gate" not registered');
  return entry.handler(args) as Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture orch-state.json — injectable, disposable, NEVER the live file
// (shape mirrors CCATO-MCP-T4-SIGNAL-WRITER.test.ts's own makeFixture()).
// ─────────────────────────────────────────────────────────────────────────────

let tmpDirs: string[] = [];

function makeOrchStateFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "ntg-t8-dod-"));
  tmpDirs.push(dir);
  const p = join(dir, "orch-state.json");
  const shell = {
    _meta: { schema: "v4", ssot: true, updated_at: "2026-08-24T00:00:00Z", updated_by: "test" },
    head: { status: "idle" },
    task_board: {
      _updated_at: "2026-08-24T00:00:00Z",
      _updated_by: "test",
      active_sprints: [],
      backlog: [],
      archive: [],
    },
    signal_queue: { _updated_at: "2026-08-24T00:00:00Z", _updated_by: "test", rows: [], archive: [] },
  };
  writeFileSync(p, JSON.stringify(shell, null, 2), "utf8");
  return p;
}

/** Seed 2 real, nonzero-volume vnstock_trading_stats rows -> real probeForeignFlow classifies NON_NULL. */
function seedForeignFlowRows(code: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO vnstock_trading_stats (code, date, fetched_at, foreign_volume, foreign_room, current_holding_ratio)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(code, "2026-08-01", "2026-08-01T00:00:00Z", 100000, 500000, 0.12);
  db.prepare(
    `INSERT INTO vnstock_trading_stats (code, date, fetched_at, foreign_volume, foreign_room, current_holding_ratio)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(code, "2026-08-02", "2026-08-02T00:00:00Z", 150000, 495000, 0.13);
}

/** Stub for the ONE dimension that structurally cannot run offline (see file header). */
const STUB_TA_ADAPTERS: ProbeAdapterMap = {
  ...DEFAULT_PROBE_ADAPTERS,
  get_technical_indicators: (_ticker: string): Promise<ProbeResult> =>
    Promise.resolve({ raw: { note: "RSI 65.2, MACD bullish crossover, MA20 43.100" }, isError: false }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});

afterEach(() => {
  closeDb();
  for (const dir of tmpDirs) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

// ═══════════════════════════════════════════════════════════════════════════
// (a) VNM TA-absence claim -> FAIL naming VNM + a technical-indicator token
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T8 — §5.2(a) VNM TA-absence claim -> FAIL naming VNM + TA token", () => {
  it("GATE_VERDICT: FAIL, [FAIL] line has ticker=VNM and an RSI/MACD-style token", async () => {
    const orchStatePath = makeOrchStateFixture();
    const server = makeServer({ adapters: STUB_TA_ADAPTERS, orchStatePath, now: FIXED_NOW });

    const result = await callTool(server, {
      post_body: "VNM không có dữ liệu kỹ thuật phiên này.",
      agent_id: "ccato-mcp-t8-test-agent",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("GATE_VERDICT: FAIL (1 contradiction(s))");
    expect(text).toContain("dimension=technical_indicators");
    expect(text).toContain("ticker=VNM");
    expect(text).toContain("RSI"); // technical-indicator token
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (b) foreign-flow-absence claim -> FAIL (real DB-seeded adapter, no stub)
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T8 — §5.2(b) foreign-flow-absence claim -> FAIL (real getForeignFlowHistory + analyzeForeignFlow)", () => {
  it("GATE_VERDICT: FAIL, [FAIL] line names dimension=foreign_flow tool=get_foreign_flow", async () => {
    seedForeignFlowRows("VNM");
    const orchStatePath = makeOrchStateFixture();
    const server = makeServer({ orchStatePath, now: FIXED_NOW }); // real DEFAULT_PROBE_ADAPTERS, no stub

    const result = await callTool(server, {
      post_body: "Khối ngoại không có dữ liệu giao dịch của VNM hôm nay.",
      agent_id: "ccato-mcp-t8-test-agent",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("GATE_VERDICT: FAIL (1 contradiction(s))");
    expect(text).toContain("dimension=foreign_flow");
    expect(text).toContain("tool=get_foreign_flow");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (c) genuine honest-NULL (insufficient historical depth) -> PASS, no FP
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T8 — §5.2(c) genuine honest-NULL (zero-row financials query) -> PASS, no false positive", () => {
  it("empty financial_reports table for XYZ -> real 'Period(s) not found' honest-NULL -> PASS, zero signal rows", async () => {
    const orchStatePath = makeOrchStateFixture();
    const server = makeServer({ orchStatePath, now: FIXED_NOW }); // real adapters, zero seed rows

    const result = await callTool(server, {
      post_body: "XYZ chưa có dữ liệu báo cáo tài chính quý này.",
      agent_id: "ccato-mcp-t8-test-agent",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("GATE_VERDICT: PASS");
    expect(text).toContain("honest no-data confirmed");
    expect(text).not.toContain("[FAIL]");

    const onDisk = JSON.parse(readFileSync(orchStatePath, "utf8"));
    expect(onDisk.signal_queue.rows).toHaveLength(0); // PASS must never emit a signal
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (d) identical post_body -> identical verdict across repeated calls
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T8 — §5.2(d) identical post_body -> identical verdict across repeated calls (determinism)", () => {
  it("two independent calls, same input + deps -> byte-identical formatted report", async () => {
    const postBody = "VNM không có dữ liệu kỹ thuật phiên này.";
    const args = { post_body: postBody, agent_id: "ccato-mcp-t8-test-agent" };

    const server1 = makeServer({ adapters: STUB_TA_ADAPTERS, orchStatePath: makeOrchStateFixture(), now: FIXED_NOW });
    const result1 = await callTool(server1, args);

    const server2 = makeServer({ adapters: STUB_TA_ADAPTERS, orchStatePath: makeOrchStateFixture(), now: FIXED_NOW });
    const result2 = await callTool(server2, args);

    expect(result1.isError).toBe(result2.isError);
    expect(result1.content[0]?.text).toBe(result2.content[0]?.text);
    expect(result1.content[0]?.text).toContain("GATE_VERDICT: FAIL (1 contradiction(s))");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (e) FAIL path appends exactly one narrative_contradiction row to the
// injectable fixture; type present + matches SignalRowSchema; live file
// (docs/data/orch/orch-state.json) is NEVER touched.
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T8 — §5.2(e) FAIL path appends exactly one narrative_contradiction row (fixture only, never live)", () => {
  it("single FAIL finding -> exactly 1 row on the fixture, type present, SignalRowSchema-valid", async () => {
    const orchStatePath = makeOrchStateFixture();
    const server = makeServer({ adapters: STUB_TA_ADAPTERS, orchStatePath, now: FIXED_NOW });

    const result = await callTool(server, {
      post_body: "VNM không có dữ liệu kỹ thuật phiên này.",
      agent_id: "ccato-mcp-t8-test-agent",
    });
    expect(result.content[0]?.text).toContain("GATE_VERDICT: FAIL");

    const onDisk = JSON.parse(readFileSync(orchStatePath, "utf8"));
    expect(onDisk.signal_queue.rows).toHaveLength(1);
    const row = onDisk.signal_queue.rows[0];
    expect(row.type).toBe("narrative_contradiction");
    expect(SignalRowSchema.safeParse(row).success).toBe(true);
  });

  it("never touches the live docs/data/orch/orch-state.json (mtime + row count unchanged)", async () => {
    const beforeMtime = statSync(DEFAULT_ORCH_STATE_PATH).mtimeMs;
    const beforeRows = JSON.parse(readFileSync(DEFAULT_ORCH_STATE_PATH, "utf8")).signal_queue.rows.length;

    const orchStatePath = makeOrchStateFixture();
    const server = makeServer({ adapters: STUB_TA_ADAPTERS, orchStatePath, now: FIXED_NOW });
    await callTool(server, {
      post_body: "VNM không có dữ liệu kỹ thuật phiên này.",
      agent_id: "ccato-mcp-t8-test-agent",
    });

    const afterMtime = statSync(DEFAULT_ORCH_STATE_PATH).mtimeMs;
    const afterRows = JSON.parse(readFileSync(DEFAULT_ORCH_STATE_PATH, "utf8")).signal_queue.rows.length;
    expect(afterMtime).toBe(beforeMtime);
    expect(afterRows).toBe(beforeRows);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bonus — real fixture end-to-end (docs/social/fb-post-2026-06-30.md,
// confirmed present per brief R-6). Reproduces the exact 2-candidate set
// CCATO-MCP-T1-DOMAIN-ENGINE.test.ts's §5.1 side-by-side parity AC already
// proved (technical_indicators::VNM + foreign_flow::foreign_flow, both
// ticker VNM) — this test additionally drives them all the way through
// probe -> classify -> signal-emit, which T1's scanner-only parity AC does
// not exercise.
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T8 — real fixture end-to-end (docs/social/fb-post-2026-06-30.md)", () => {
  it("both real CCATO instances in the fixture classify FAIL and fan out to 2 signal rows", async () => {
    seedForeignFlowRows("VNM");
    const orchStatePath = makeOrchStateFixture();
    const postBody = readFileSync(resolve(REPO_ROOT, "docs/social/fb-post-2026-06-30.md"), "utf8");
    const server = makeServer({ adapters: STUB_TA_ADAPTERS, orchStatePath, now: FIXED_NOW });

    const result = await callTool(server, { post_body: postBody, agent_id: "ccato-mcp-t8-test-agent" });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("GATE_VERDICT: FAIL (2 contradiction(s))");
    expect(text).toContain("dimension=technical_indicators");
    expect(text).toContain("dimension=foreign_flow");

    const onDisk = JSON.parse(readFileSync(orchStatePath, "utf8"));
    expect(onDisk.signal_queue.rows).toHaveLength(2);
    for (const row of onDisk.signal_queue.rows) {
      expect(row.type).toBe("narrative_contradiction");
      expect(SignalRowSchema.safeParse(row).success).toBe(true);
    }
  }, 10000);
});
