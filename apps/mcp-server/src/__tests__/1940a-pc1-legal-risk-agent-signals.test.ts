/**
 * Task 1940a — PC1 legal_risk gap: get_legal_risk_signals must query agent_signals
 *
 * Root cause: tool only queries `alerts` table. News-scout posts legal_risk
 * signals to `agent_signals` (via post_agent_signal). The PC1 chairman arrest
 * signal (#3318, #3343) was never surfaced because tool never looked there.
 *
 * Fix: extend queryLegalRiskAlerts to also scan agent_signals WHERE
 *   signal_type = 'legal_risk' AND (stock_code = ? | payload LIKE '%legal%')
 *   within the look-back window, then merge results.
 *
 * Tests:
 *   TC1 — agent_signals legal_risk row (matching stock) IS returned
 *   TC2 — agent_signals row for DIFFERENT stock NOT returned when stock filter set
 *   TC3 — both alerts + agent_signals rows merged when both exist
 *   TC4 — agent_signals row with no stock_code (all-stock signal) IS returned even with stock filter
 *   TC5 — agent_signals row outside look-back window NOT returned
 *   TC6 — agent_signals row with wrong signal_type NOT returned
 *   TC7 — PC1 chairman arrest scenario: payload mentions "chủ tịch bị bắt" returned
 */
import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerLegalRiskTools } from "../interface/mcp/tools/sector/legalRiskTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  // alerts table (existing)
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
  // agent_signals table (new source)
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
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
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

// ISO UTC timestamp within the last 30 days
const RECENT_TS = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
// ISO UTC timestamp outside 30-day window
const OLD_TS = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();  // 35 days ago
// expires_at must be future for signal not to be expired
const FUTURE_EXPIRES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
// old_expires in the past (expired)
const PAST_EXPIRES = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1940a — get_legal_risk_signals queries agent_signals", () => {
  it("TC1: legal_risk agent_signal for matching stock is returned", async () => {
    const db = makeTestDb();
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, created_at, expires_at)
      VALUES (
        'news-scout', 'alert-commander', 'legal_risk', 'PC1',
        '{"title":"Chủ tịch PC1 bị khởi tố","detail":"Cơ quan điều tra khởi tố chủ tịch PC1 về tội danh kinh tế"}',
        '${RECENT_TS}', '${FUTURE_EXPIRES}'
      )
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PC1", days: 30 });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PC1");
  });

  it("TC2: agent_signal for DIFFERENT stock NOT returned when stock filter set", async () => {
    const db = makeTestDb();
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, created_at, expires_at)
      VALUES (
        'news-scout', 'alert-commander', 'legal_risk', 'VCB',
        '{"title":"VCB legal issue","detail":"Some legal matter for VCB"}',
        '${RECENT_TS}', '${FUTURE_EXPIRES}'
      )
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PC1", days: 30 });
    const text = result.content[0]?.text ?? "";
    // Should not find VCB signal when filtering for PC1
    expect(text).not.toContain("VCB");
  });

  it("TC3: both alerts + agent_signals rows merged in result", async () => {
    const db = makeTestDb();
    // Insert into alerts table
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message, affected_actions_json)
      VALUES (
        'alert-001', '${RECENT_TS}', 'critical',
        'PC1 legal risk: phong tỏa tài sản', '["PC1"]'
      )
    `);
    // Insert into agent_signals table
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, created_at, expires_at)
      VALUES (
        'news-scout', 'alert-commander', 'legal_risk', 'PC1',
        '{"title":"PC1 chairman arrested","detail":"Chủ tịch PC1 bị bắt"}',
        '${RECENT_TS}', '${FUTURE_EXPIRES}'
      )
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PC1", days: 30 });
    const text = result.content[0]?.text ?? "";
    // Should mention both sources
    expect(text).toContain("PC1");
    // Text should reflect ≥2 signals found
    expect(text).toMatch(/[2-9]\s+tín hiệu/);
  });

  it("TC4: agent_signal with no stock_code (all-stock) returned when stock filter is set", async () => {
    const db = makeTestDb();
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, created_at, expires_at)
      VALUES (
        'news-scout', 'alert-commander', 'legal_risk', NULL,
        '{"title":"VN legal risk event","detail":"Broad legal risk across market"}',
        '${RECENT_TS}', '${FUTURE_EXPIRES}'
      )
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PC1", days: 30 });
    const text = result.content[0]?.text ?? "";
    // Broad signals (null stock_code) should appear even with stock filter
    expect(text).toContain("Broad legal risk");
  });

  it("TC5: agent_signal outside look-back window NOT returned", async () => {
    const db = makeTestDb();
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, created_at, expires_at)
      VALUES (
        'news-scout', 'alert-commander', 'legal_risk', 'PC1',
        '{"title":"Old PC1 legal signal","detail":"This is an old signal outside window"}',
        '${OLD_TS}', '${FUTURE_EXPIRES}'
      )
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    // Only look back 7 days — old signal (35 days ago) should NOT appear
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PC1", days: 7 });
    const text = result.content[0]?.text ?? "";
    expect(text).not.toContain("Old PC1 legal signal");
  });

  it("TC6: agent_signal with wrong signal_type NOT returned", async () => {
    const db = makeTestDb();
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, created_at, expires_at)
      VALUES (
        'news-scout', 'alert-commander', 'price_drop', 'PC1',
        '{"title":"PC1 price drop","detail":"Price dropped 10%"}',
        '${RECENT_TS}', '${FUTURE_EXPIRES}'
      )
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PC1", days: 30 });
    const text = result.content[0]?.text ?? "";
    // price_drop signals should not appear in legal_risk results
    expect(text).not.toContain("price drop");
  });

  it("TC7: PC1 chairman arrest scenario — chủ tịch bị bắt payload surfaces in result", async () => {
    const db = makeTestDb();
    // Simulate what news-scout #3343 would have posted (conf=0.78, legal_risk)
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, created_at, expires_at)
      VALUES (
        'news-scout', 'alert-commander', 'legal_risk', 'PC1',
        '{"title":"Chủ tịch PC1 bị khởi tố","detail":"Cơ quan điều tra khởi tố chủ tịch HĐQT PC1 về tội lừa đảo chiếm đoạt tài sản","confidence_score":0.78}',
        '${RECENT_TS}', '${FUTURE_EXPIRES}'
      )
    `);
    const server = makeServer();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { stock: "PC1", days: 30 });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PC1");
    expect(text).not.toBe("Không có tín hiệu rủi ro pháp lý nào trong khoảng thời gian này.");
  });
});
