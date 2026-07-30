/**
 * FIX-SIGNALQUALITYAUDIT-WRITE-GATE-UNREACHABLE-BY-EMITTER-CONTRACT (2026-07-30)
 *
 * MECHANISM (decisive live-DB probe, run before any code change):
 *   docker exec into the running mcp-server container, readonly bun:sqlite
 *   query against the LIVE production market.db:
 *     - price_confirmation: 0 rows ALL TIME (dead emitter — out of scope here).
 *     - urgent_news: 13 rows all-time, 9 since 2026-06-05 (the exact epoch the
 *       signal_quality_audit SLA anchors on). ZERO of those 9 carried a numeric
 *       `finding_data.confidence`. The live urgent_news template (news-scout —
 *       docs/agents/news-scout/flow/stage-signals.md) instead populates
 *       `regime_adjusted_score` (0-10 scale).
 *   -> outcome (b) from the task's decision table: signals ARE posted (not a
 *      dead emitter), but the required field is absent/non-numeric — the
 *      write gate's `typeof finding_data.confidence === 'number'` precondition
 *      is the actual, sole blocker for the signal type that flows.
 *
 * DECISION: WIRE (not retire). `deriveAuditConfidence()`
 * (domain/services/signalValidator.ts) falls back to
 * `regime_adjusted_score / 10` when `confidence` is absent, making the write
 * path reachable for real urgent_news traffic using the REAL quality signal
 * news-scout already computes, instead of a fabricated constant.
 * price_confirmation is unaffected (schema already requires `confidence`).
 *
 * This file pins:
 *   AC-A: deriveAuditConfidence — pure unit tests (priority, fallback, clamp, null).
 *   AC-B: bidirectional proof via the REAL post_agent_signal handler —
 *         (b1) urgent_news w/ regime_adjusted_score only -> row lands.
 *         (b2) urgent_news w/ neither field -> row legitimately absent.
 *         (b3) price_confirmation w/ confidence (regression) -> row lands, unchanged.
 *         (b4) non-qualifying type (chain_catalyst) w/ confidence -> no row (guard unaffected).
 *   AC-C: swallow observability — both catch sites now call logger.warn
 *         (not console.warn), so a future dead write path is queryable via
 *         system_logs instead of vanishing into stdout.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ── AC-C setup: capture logger.warn calls (module-scope mock, restored in afterAll) ──
// Neither agentSignalTools.ts nor signalQualityAuditStore.ts's OTHER transitive
// imports (agentSignalStore.ts, schema.ts, signalValidator.ts, signalTypes.ts,
// regimeConfidenceThreshold.ts, signalRejectionStore.ts, getRecentSignals.ts)
// import infrastructure/logger.js — verified via grep before writing this mock —
// so this substitution is scoped to exactly the two files this fix touches.
const warnCalls: Array<{ message: string; context: Record<string, unknown> | undefined }> = [];
const _realLoggerModule = {
  logger: {
    warn: (message: string, context?: Record<string, unknown>) => {
      warnCalls.push({ message, context });
    },
    info: () => {},
    debug: () => {},
    error: () => {},
  },
  createLogger: (..._args: unknown[]) => ({
    warn: (message: string, context?: Record<string, unknown>) => {
      warnCalls.push({ message, context });
    },
    info: () => {},
    debug: () => {},
    error: () => {},
  }),
};
mock.module("../infrastructure/logger.js", () => _realLoggerModule);

afterAll(() => {
  // Restore so this global module substitution never bleeds into sibling
  // test files sharing the same Bun test worker.
  mock.module("../infrastructure/logger.js", () => _realLoggerModule);
});

import { deriveAuditConfidence } from "../domain/services/signalValidator.js";
import { insertSignalQualityAudit } from "../infrastructure/db/signalQualityAuditStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerAgentSignalTools } from "../interface/mcp/tools/news-analysis/agentSignalTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// AC-A: deriveAuditConfidence — pure unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-A: deriveAuditConfidence (domain/services/signalValidator.ts)", () => {
  it("returns `confidence` directly when present and numeric", () => {
    expect(deriveAuditConfidence({ confidence: 0.82 })).toBe(0.82);
  });

  it("`confidence` takes priority over `regime_adjusted_score` when both present", () => {
    expect(
      deriveAuditConfidence({ confidence: 0.9, regime_adjusted_score: 3 }),
    ).toBe(0.9);
  });

  it("falls back to regime_adjusted_score / 10 when confidence is absent", () => {
    expect(deriveAuditConfidence({ regime_adjusted_score: 7 })).toBeCloseTo(0.7);
  });

  it("clamps regime_adjusted_score fallback to [0,1]", () => {
    expect(deriveAuditConfidence({ regime_adjusted_score: 15 })).toBe(1);
    expect(deriveAuditConfidence({ regime_adjusted_score: -3 })).toBe(0);
  });

  it("returns null when confidence is non-numeric and regime_adjusted_score is absent", () => {
    expect(deriveAuditConfidence({ confidence: "high" })).toBeNull();
  });

  it("returns null when neither field is present — the legitimately-blocked case", () => {
    expect(deriveAuditConfidence({ headline: "x", source: "cafef", severity: "low" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-B: bidirectional proof via the real post_agent_signal handler
// ─────────────────────────────────────────────────────────────────────────────

type ToolResponse = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<unknown> }
      >;
    }
  )._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return tool.handler(args) as Promise<ToolResponse>;
}

function auditRowCount(signalId: number): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as n FROM signal_quality_audit WHERE signal_id = ?")
    .get(String(signalId)) as { n: number };
  return row.n;
}

describe("AC-B: signal_quality_audit write gate — bidirectional proof", () => {
  let server: McpServer;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    server = new McpServer(
      { name: "test-fix-signalqualityaudit-write-gate", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAgentSignalTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  it("(b1) urgent_news with ONLY regime_adjusted_score (the real live news-scout shape) -> audit row lands", async () => {
    const result = await callTool(server, "post_agent_signal", {
      from_agent: "news-scout",
      to_agent: "alert-commander",
      signal_type: "urgent_news",
      stock_code: "VNM",
      payload: {
        title: "VNM breaking news — regime-adjusted-score shape",
        detail:
          "VNM cost of capital outlook improves as policy easing lowers funding cost; " +
          "profit outlook revised up, direction bullish, evidence: SBV circular.",
        impact_score: 8,
      },
      finding_data: {
        headline: "VNM breaking news headline",
        source: "cafef",
        severity: "high",
        regime: "NEUTRAL",
        regime_adjusted_score: 7.0,
        hot_money_risk: false,
        cpi_pressure_risk: false,
      },
      ttl_minutes: 120,
    });

    const body = JSON.parse(result.content[0]!.text) as { success: boolean; signal_id: number };
    expect(body.success).toBe(true);
    expect(body.signal_id).toBeGreaterThan(0);

    expect(auditRowCount(body.signal_id)).toBe(1);

    const db = getDb();
    const row = db
      .prepare("SELECT signal_type, confidence_score FROM signal_quality_audit WHERE signal_id = ?")
      .get(String(body.signal_id)) as { signal_type: string; confidence_score: number };
    expect(row.signal_type).toBe("news");
    expect(row.confidence_score).toBeCloseTo(70); // regime_adjusted_score(7.0) / 10 * 100
  });

  it("(b2) urgent_news with NEITHER confidence NOR regime_adjusted_score -> audit row legitimately absent", async () => {
    const result = await callTool(server, "post_agent_signal", {
      from_agent: "news-scout",
      to_agent: "alert-commander",
      signal_type: "urgent_news",
      stock_code: "VCB",
      payload: {
        title: "VCB breaking news — no quality signal present",
        detail:
          "VCB cost of capital outlook mixed; policy stance unclear, profit impact " +
          "uncertain pending further filings from the issuer.",
        impact_score: 8,
      },
      finding_data: {
        headline: "VCB breaking news headline",
        source: "cafef",
        severity: "medium",
      },
      ttl_minutes: 120,
    });

    const body = JSON.parse(result.content[0]!.text) as { success: boolean; signal_id: number };
    expect(body.success).toBe(true);
    expect(body.signal_id).toBeGreaterThan(0);

    // Precondition legitimately fails — no fabricated audit row.
    expect(auditRowCount(body.signal_id)).toBe(0);
  });

  it("(b3) price_confirmation with schema-required confidence -> audit row lands (regression, unchanged behavior)", async () => {
    const result = await callTool(server, "post_agent_signal", {
      from_agent: "market-watcher",
      to_agent: "alert-commander",
      signal_type: "price_confirmation",
      stock_code: "HPG",
      payload: {
        title: "HPG price confirms catalyst",
        detail:
          "HPG price move confirms prior catalyst; cost of capital and profit outlook " +
          "both support the confirmed direction, policy tailwind intact.",
        impact_score: 8,
      },
      finding_data: {
        price_change_pct: 3.2,
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.9,
      },
      ttl_minutes: 120,
    });

    const body = JSON.parse(result.content[0]!.text) as { success: boolean; signal_id: number };
    expect(body.success).toBe(true);
    expect(body.signal_id).toBeGreaterThan(0);

    expect(auditRowCount(body.signal_id)).toBe(1);
    const db = getDb();
    const row = db
      .prepare("SELECT signal_type, confidence_score FROM signal_quality_audit WHERE signal_id = ?")
      .get(String(body.signal_id)) as { signal_type: string; confidence_score: number };
    expect(row.signal_type).toBe("price");
    expect(row.confidence_score).toBeCloseTo(90);
  });

  it("(b4) non-qualifying type (chain_catalyst) with confidence present -> no audit row (guard unaffected by this fix)", async () => {
    const result = await callTool(server, "post_agent_signal", {
      from_agent: "news-scout",
      to_agent: "all",
      signal_type: "chain_catalyst",
      stock_code: "GAS",
      payload: {
        title: "GAS catalyst — money supply + policy context",
        detail:
          "GAS catalyst driven by money supply expansion and policy tailwind; " +
          "cost of capital declining, profit outlook improving on SOE flows.",
        impact_score: 9,
      },
      finding_data: {
        event_type: "macro",
        direction: "bullish",
        confidence: 0.85,
        affected_stocks: ["GAS"],
        affected_sectors: ["energy"],
        headline: "GAS catalyst headline",
        source: "cafef",
      },
      ttl_minutes: 120,
    });

    const body = JSON.parse(result.content[0]!.text) as { success: boolean; signal_id: number };
    expect(body.success).toBe(true);
    expect(body.signal_id).toBeGreaterThan(0);

    expect(auditRowCount(body.signal_id)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-C: swallow observability — both catch sites log via logger.warn
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-C: swallow observability", () => {
  it("signalQualityAuditStore.insertSignalQualityAudit logs via logger.warn (not console.warn) when the INSERT throws", () => {
    warnCalls.length = 0;

    const throwingDb = {
      prepare: () => {
        throw new Error("simulated: no such table: signal_quality_audit");
      },
    } as unknown as import("bun:sqlite").Database;

    // Must not throw — fire-and-forget contract preserved.
    expect(() =>
      insertSignalQualityAudit(throwingDb, {
        signal_id: "999",
        signal_type: "news",
        confidence_score: 70,
        confidence_score_final: 70,
        confidence_penalty: 1.0,
        created_at: new Date().toISOString(),
      }),
    ).not.toThrow();

    expect(warnCalls.length).toBe(1);
    expect(warnCalls[0]!.message).toContain("[signalQualityAuditStore]");
    expect(warnCalls[0]!.context?.["signal_id"]).toBe("999");
  });

  it("a DB-level write failure during post_agent_signal is swallowed via the signalQualityAuditStore path (logger.warn, not console.warn) and the MCP response stays success:true", async () => {
    warnCalls.length = 0;

    closeDb();
    await initDatabase();
    const server = new McpServer(
      { name: "test-fix-signalqualityaudit-write-gate-swallow", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAgentSignalTools(server);

    const db = getDb();
    const originalPrepare = db.prepare.bind(db);
    (db as unknown as { prepare: typeof db.prepare }).prepare = ((
      sql: string,
      ...rest: unknown[]
    ) => {
      if (typeof sql === "string" && sql.includes("INSERT OR IGNORE INTO signal_quality_audit")) {
        throw new Error("simulated: database disk image is malformed");
      }
      return (originalPrepare as unknown as (...a: unknown[]) => unknown)(sql, ...rest);
    }) as typeof db.prepare;

    const result = await callTool(server, "post_agent_signal", {
      from_agent: "news-scout",
      to_agent: "alert-commander",
      signal_type: "urgent_news",
      stock_code: "MWG",
      payload: {
        title: "MWG breaking news — audit write forced to throw",
        detail:
          "MWG cost of capital and profit outlook both improve on policy support; " +
          "direction bullish, evidence: company filing.",
        impact_score: 8,
      },
      finding_data: {
        headline: "MWG breaking news headline",
        source: "cafef",
        severity: "high",
        regime_adjusted_score: 6.5,
      },
      ttl_minutes: 120,
    });

    // MCP response must remain unaffected by the swallowed audit-write failure
    // (Task 1920f fire-and-forget contract, preserved by this fix).
    const body = JSON.parse(result.content[0]!.text) as { success: boolean };
    expect(body.success).toBe(true);
    expect(result.isError).toBeUndefined();

    // The failure is now queryable (logger.warn -> system_logs in production),
    // not a silent console.warn.
    expect(
      warnCalls.some((c) => c.message.includes("[signalQualityAuditStore]")),
    ).toBe(true);

    closeDb();
  });

  it("regression pin: both catch sites use logger.warn, not console.warn (source-text guard against silent revert)", async () => {
    const agentSignalToolsSrc = await Bun.file(
      new URL(
        "../interface/mcp/tools/news-analysis/agentSignalTools.ts",
        import.meta.url,
      ),
    ).text();
    const storeSrc = await Bun.file(
      new URL("../infrastructure/db/signalQualityAuditStore.ts", import.meta.url),
    ).text();

    expect(agentSignalToolsSrc).not.toContain('console.warn("[post_agent_signal] audit write failed');
    expect(agentSignalToolsSrc).toContain('logger.warn("[post_agent_signal] audit write failed');

    expect(storeSrc).not.toContain("console.warn(");
    expect(storeSrc).toContain('logger.warn("[signalQualityAuditStore] insertSignalQualityAudit failed');
  });
});
