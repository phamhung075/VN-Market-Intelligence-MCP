/**
 * Task 1334a — RED phase
 *
 * Two test groups:
 *
 * A. stock_code sentinel normalisation in postSignal()
 *    - stockCode="unknown"  → stored as NULL   (RED: currently stored verbatim)
 *    - stockCode=undefined  → stored as NULL   (regression guard, already passes)
 *    - stockCode=null       → stored as NULL   (regression guard, already passes)
 *    - stockCode="VCB"      → stored as "VCB"  (regression guard, already passes)
 *
 * B. DSC CEO bearish-warning article → market-wide broadcast via cascadeEngine
 *    - VCB + VNM appear in watchlistImpacts    (RED: currently below broadcastMinImpact)
 *    - VCB impact direction is "negative"      (RED)
 *    - cascade entry reasoning contains analyst-warning marker (RED)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { postSignal } from "../infrastructure/db/agentSignalStore.js";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal in-memory DB with the base agent_signals schema. */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent  TEXT NOT NULL,
      to_agent    TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code  TEXT,
      payload     TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'unread',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT NOT NULL
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ── Test A: postSignal sentinel normalisation ─────────────────────────────────

describe("Task 1334a-A — postSignal stock_code sentinel normalisation", () => {
  it('stockCode="unknown" → stock_code stored as NULL', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "unknown",   // sentinel literal — must be normalised to null
      payload: { title: "VN-Index bearish" },
      ttlMinutes: 60,
    });
    const row = db
      .query<{ stock_code: string | null }, [number]>(
        "SELECT stock_code FROM agent_signals WHERE id = ?"
      )
      .get(id);
    expect(row).not.toBeNull();
    expect(row!.stock_code).toBeNull(); // RED: currently stores "unknown"
  });

  it("stockCode=undefined → stock_code stored as NULL (regression guard)", () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "VN-Index falls" },
      ttlMinutes: 60,
    });
    const row = db
      .query<{ stock_code: string | null }, [number]>(
        "SELECT stock_code FROM agent_signals WHERE id = ?"
      )
      .get(id);
    expect(row!.stock_code).toBeNull();
  });

  it("stockCode=null → stock_code stored as NULL (regression guard)", () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: null,
      payload: { title: "Macro event" },
      ttlMinutes: 60,
    });
    const row = db
      .query<{ stock_code: string | null }, [number]>(
        "SELECT stock_code FROM agent_signals WHERE id = ?"
      )
      .get(id);
    expect(row!.stock_code).toBeNull();
  });

  it('valid stock code "VCB" is preserved as-is (regression guard)', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VCB",
      payload: { title: "VCB earnings beat" },
      ttlMinutes: 60,
    });
    const row = db
      .query<{ stock_code: string | null }, [number]>(
        "SELECT stock_code FROM agent_signals WHERE id = ?"
      )
      .get(id);
    expect(row!.stock_code).toBe("VCB");
  });
});

// ── Test B: CEO bearish-warning → market-wide broadcast ───────────────────────

const DSC_ARTICLE: AnalysisEntry = {
  id: "dsc-ceo-bearish",
  level: "country",
  sourceTitle:
    "Tổng Giám đốc DSC: Những nhịp điều chỉnh của VN-Index nếu xảy ra có thể sẽ rất sâu và đau",
  sourceUrl: "",
  sourceType: "news",
  summary:
    "Tổng Giám đốc DSC cảnh báo nhà đầu tư rằng thị trường chứng khoán có thể điều chỉnh sâu và đau. " +
    "Những nhịp điều chỉnh sâu nếu xảy ra có thể khiến VN-Index rất sâu và đau.",
  sentiment: "bearish",
  impactScore: 4,       // below default broadcastMinImpact=6 — must still broadcast via analyst-warning path
  impactDirection: "down",
  confidence: 0.75,
  timeHorizon: "short",
  affectedCountries: ["VN"],
  affectedDomains: ["securities"],
  affectedActions: [],  // no specific ticker — market-wide warning
  parentIds: [],
  tags: [],
  reasoning: "CEO DSC bearish market warning",
  publishedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const WATCHLIST: WatchlistEntry[] = [
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "VNM", domain: "retail", exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
];

describe("Task 1334a-B — CEO bearish warning market-wide broadcast", () => {
  it("DSC CEO warning triggers market-wide broadcast to all watchlist stocks", () => {
    const chain = buildCausalChain(DSC_ARTICLE, WATCHLIST);

    const broadcastCodes = chain.watchlistImpacts.map((w) => w.actionCode);
    // Must reach VCB and VNM (not just SSI which already matches via securities domain)
    expect(broadcastCodes).toContain("VCB");  // RED: currently missing
    expect(broadcastCodes).toContain("VNM");  // RED: currently missing
  });

  it("broadcast entries from CEO warning carry BEARISH (negative) direction", () => {
    const chain = buildCausalChain(DSC_ARTICLE, WATCHLIST);

    const vcbImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VCB");
    expect(vcbImpact).toBeDefined();
    expect(vcbImpact!.impactDirection).toBe("down"); // RED: not present
  });

  it("broadcast cascade entry reasoning contains analyst-warning marker", () => {
    const chain = buildCausalChain(DSC_ARTICLE, WATCHLIST);

    const entries = chain.entries.filter(
      (e) => e.level === "action" && e.affectedActions.includes("VCB")
    );
    expect(entries.length).toBeGreaterThan(0);
    // Reasoning must cite the analyst-warning cascade path
    expect(entries[0]!.reasoning).toMatch(
      /analyst.warning.*cascade|market-wide cascade/i
    ); // RED
  });
});
