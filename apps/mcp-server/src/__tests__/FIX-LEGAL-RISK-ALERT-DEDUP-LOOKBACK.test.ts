/**
 * FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK
 *
 * Root cause: alert-commander calls `get_legal_risk_signals()` bare (no
 * lookback bound) every cycle (15min market / 4h off-hours); the tool
 * defaulted to an unbounded-from-the-caller's-perspective 30-day window with
 * no already-alerted tracking, and stage-signals.md routes ANY legal_risk
 * hit to CRITICAL unconditionally — so a single event (e.g. PNJ prosecution)
 * re-fired CRITICAL every cycle for up to 30 days. `write_alert_verdict` also
 * blindly appended a new pending row on every fire, with no dedup.
 *
 * Two-tier fix:
 *   QUICK  (docs/agents/alert-commander/flow/stage-bootstrap.md, no deploy):
 *          call site now bounds `days=1` (+ forward-compat `hours_back=6`).
 *   ROBUST (this file, deploy-gated):
 *     1. legalRiskTools.ts — additive, opt-in `hours_back` param (does NOT
 *        change the shared `days=30` default — 5 other consumers rely on
 *        30-day breadth for evidence/summary purposes unrelated to firing).
 *     2. alertVerdictTools.ts — write_alert_verdict dedup guard: skips
 *        appending a new pending row when one already exists for the same
 *        (ticker, alertSource) pair.
 *
 * Tests:
 *   TC1 — hours_back overrides days: a row 2h old is IN, a row 10h old is
 *         OUT when hours_back=6 (agent_signals source).
 *   TC2 — hours_back applies to the alerts-table source too.
 *   TC3 — omitting hours_back preserves prior day-granularity behaviour
 *         (regression guard — existing days=1 semantics unchanged).
 *   TC4 (repeat-fire-suppression) — write_alert_verdict called twice in a
 *        row for the SAME (ticker, alertSource) simulating the same
 *        legal_risk firing across two consecutive alert-commander cycles:
 *        second call is deduped (duplicate:true, no second row appended).
 *   TC5 — a genuinely NEW event (different alertSource, same ticker) is
 *        NEVER suppressed — no-suppression intent preserved.
 *   TC6 — after the prior verdict resolves (verdict != 'pending'), a new
 *        fire for the same (ticker, alertSource) is allowed (not deduped).
 */
import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerLegalRiskTools } from "../interface/mcp/tools/sector/legalRiskTools.js";
import {
  writeAlertVerdict,
  type WriteAlertVerdictInput,
} from "../interface/mcp/tools/alerts/alertVerdictTools.js";
import type { AlertVerdict } from "../infrastructure/fileStore/alertVerdictStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — legalRiskTools
// ─────────────────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      signals_json TEXT,
      affected_actions_json TEXT,
      message TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);
  return db;
}

function makeServer(): McpServer {
  return new McpServer(
    { name: "test-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
}

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

const HOURS_2_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const HOURS_10_AGO = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
const FUTURE_EXPIRES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

describe("FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK — legalRiskTools hours_back", () => {
  it("TC1: hours_back=6 includes a 2h-old row, excludes a 10h-old row (agent_signals source)", async () => {
    const db = makeTestDb();
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, created_at, expires_at)
      VALUES
        ('news-scout', 'alert-commander', 'legal_risk', 'PNJ', '{"title":"PNJ recent","detail":"2h ago"}', '${HOURS_2_AGO}', '${FUTURE_EXPIRES}'),
        ('news-scout', 'alert-commander', 'legal_risk', 'PNJ', '{"title":"PNJ stale","detail":"10h ago"}', '${HOURS_10_AGO}', '${FUTURE_EXPIRES}')
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PNJ", hours_back: 6 });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PNJ recent");
    expect(text).not.toContain("PNJ stale");
  });

  it("TC2: hours_back applies to the alerts-table source too", async () => {
    const db = makeTestDb();
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message, affected_actions_json)
      VALUES
        ('a-recent', '${HOURS_2_AGO}', 'critical', 'PNJ legal risk recent', '["PNJ"]'),
        ('a-stale', '${HOURS_10_AGO}', 'critical', 'PNJ legal risk stale', '["PNJ"]')
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PNJ", hours_back: 6 });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PNJ legal risk recent");
    expect(text).not.toContain("PNJ legal risk stale");
  });

  it("TC3: omitting hours_back preserves prior day-granularity `days` behaviour (regression guard)", async () => {
    const db = makeTestDb();
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, created_at, expires_at)
      VALUES ('news-scout', 'alert-commander', 'legal_risk', 'PNJ', '{"title":"PNJ within 1 day","detail":"10h ago"}', '${HOURS_10_AGO}', '${FUTURE_EXPIRES}')
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    // days=1 (24h) — 10h-old row must still surface when hours_back is NOT provided
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PNJ", days: 1 });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PNJ within 1 day");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — write_alert_verdict dedup
// ─────────────────────────────────────────────────────────────────────────────

function makeFakeVerdictStore() {
  const rows: AlertVerdict[] = [];
  return {
    rows,
    appendOne: async (v: AlertVerdict) => {
      rows.push(v);
    },
    readAll: async () => rows,
  };
}

const BASE_LEGAL_RISK_INPUT: WriteAlertVerdictInput = {
  ticker: "PNJ",
  direction: "bearish",
  conviction: 0.9,
  alertSource: "legal_risk",
  firedAt: "2026-07-03T18:00:00.000Z",
};

describe("FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK — write_alert_verdict dedup (repeat-fire-suppression)", () => {
  it("TC4: same legal_risk (ticker+alertSource) across two consecutive cycles fires once — second call is deduped", async () => {
    const store = makeFakeVerdictStore();

    // Cycle 1
    const first = await writeAlertVerdict(BASE_LEGAL_RISK_INPUT, { store });
    expect(first.duplicate).toBeUndefined();
    expect(store.rows).toHaveLength(1);

    // Cycle 2 — alert-commander re-evaluates the SAME still-pending legal_risk event
    const second = await writeAlertVerdict(
      { ...BASE_LEGAL_RISK_INPUT, firedAt: "2026-07-03T22:00:00.000Z" },
      { store },
    );
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    // No second row appended — fires once at the bookkeeping layer
    expect(store.rows).toHaveLength(1);
  });

  it("TC5: a genuinely NEW event (different alertSource, same ticker) is never suppressed", async () => {
    const store = makeFakeVerdictStore();

    await writeAlertVerdict(BASE_LEGAL_RISK_INPUT, { store });
    const distinctEvent = await writeAlertVerdict(
      { ...BASE_LEGAL_RISK_INPUT, alertSource: "crisis_velocity" },
      { store },
    );

    expect(distinctEvent.duplicate).toBeUndefined();
    expect(store.rows).toHaveLength(2);
  });

  it("TC6: after the prior verdict resolves, a new fire for the same pair is allowed (not deduped)", async () => {
    const store = makeFakeVerdictStore();

    const first = await writeAlertVerdict(BASE_LEGAL_RISK_INPUT, { store });
    // Simulate verdictResolutionJob resolving the pending row
    const resolvedIdx = store.rows.findIndex((r) => r.id === first.id);
    store.rows[resolvedIdx] = { ...store.rows[resolvedIdx]!, verdict: "confirmed", resolvedAt: "2026-07-04T18:00:00.000Z" };

    const second = await writeAlertVerdict(
      { ...BASE_LEGAL_RISK_INPUT, firedAt: "2026-07-05T18:00:00.000Z" },
      { store },
    );
    expect(second.duplicate).toBeUndefined();
    expect(store.rows).toHaveLength(2);
  });

  it("legacy fake store without readAll() falls through to append unchanged (backward compat)", async () => {
    const rows: AlertVerdict[] = [];
    const legacyStore = {
      appendOne: async (v: AlertVerdict) => {
        rows.push(v);
      },
    };
    await writeAlertVerdict(BASE_LEGAL_RISK_INPUT, { store: legacyStore });
    await writeAlertVerdict(BASE_LEGAL_RISK_INPUT, { store: legacyStore });
    // No readAll available — dedup cannot be evaluated, both appends proceed
    expect(rows).toHaveLength(2);
  });
});
