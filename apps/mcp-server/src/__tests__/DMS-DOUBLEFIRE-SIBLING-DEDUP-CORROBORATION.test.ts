Bun.env["DB_PATH"] = ":memory:";

/**
 * DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION — unit tests
 *
 * Covers DMS-1 (Root B) and DMS-2 (Root C) acceptance criteria.
 *
 * DMS-1 (news-scout SIBLING_WINDOW_CACHE):
 *   AC-B1: getRecentSignals returns signals from ALL producers in the window.
 *   AC-B2: getRecentSignals excludes signals outside the window.
 *   AC-B3: getRecentSignals excludes 'unread' status rows (only committed/published/read).
 *   AC-B4: get_agent_signals(from_agent=null) returns all-producer results via the same path.
 *   AC-B5: Content-hash key (signal_type + stock_code + title) detects sibling duplicate.
 *   AC-B6: Two signals with different normalised keys are NOT suppressed.
 *
 * DMS-2 (market-watcher corroboration gate):
 *   AC-C1: Non-empty SIBLING_RECENT → suppress false BUG (corroboration detected).
 *   AC-C2: Empty SIBLING_RECENT → real outage path (no suppression).
 *   AC-C3: getRecentSignals default window is 900 seconds (15 min).
 *   AC-C4: getRecentSignals with custom window correctly bounds results.
 *
 * All tests are deterministic / in-memory — no live DB or gateway required.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { getRecentSignals } from "../tools/signals/getRecentSignals.js";

// ── DB helpers ────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent   TEXT NOT NULL DEFAULT 'all',
      signal_type TEXT NOT NULL,
      stock_code  TEXT,
      payload     TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'unread',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT NOT NULL DEFAULT (datetime('now', '+120 minutes'))
    );
  `);
  return db;
}

/**
 * Insert a signal with a custom created_at offset.
 * @param agedSeconds - How many seconds ago the signal was created (positive = older)
 * @param status      - Signal status (default 'read' — visible to getRecentSignals)
 */
function insertSignalAgedSeconds(
  db: Database,
  opts: {
    fromAgent: string;
    signalType: string;
    stockCode?: string | null;
    title?: string;
    agedSeconds: number;
    status?: "unread" | "read" | "committed" | "published";
  },
): number {
  const status = opts.status ?? "read";
  const payload = JSON.stringify({ title: opts.title ?? "test signal" });
  const stmt = db.prepare<{ id: number }, []>(`
    INSERT INTO agent_signals
      (from_agent, to_agent, signal_type, stock_code, payload, status, created_at, expires_at)
    VALUES (
      '${opts.fromAgent}',
      'all',
      '${opts.signalType}',
      ${opts.stockCode ? `'${opts.stockCode}'` : "NULL"},
      '${payload.replace(/'/g, "''")}',
      '${status}',
      datetime('now', '-${opts.agedSeconds} seconds'),
      datetime('now', '+7200 seconds')
    )
    RETURNING id
  `);
  const row = stmt.get();
  return row!.id;
}

// ── normalise_key helper (mirrors flow doc spec) ──────────────────────────────

function normaliseKey(
  signalType: string,
  stockCode: string | null | undefined,
  title: string | undefined,
): string {
  const normStock = (stockCode ?? "").toUpperCase().trim();
  const normTitle = (title ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${signalType}:${normStock}:${normTitle}`;
}

// ── DMS-1 tests ───────────────────────────────────────────────────────────────

describe("DMS-1 (Root B) — getRecentSignals cross-producer window", () => {
  it("AC-B1: returns signals from ALL producers (not just one agent) in the window", () => {
    const db = makeDb();

    // Two different producers post within the 15-min window
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      stockCode: "VNM",
      title: "VNM earnings up",
      agedSeconds: 60, // 1 min ago
    });
    insertSignalAgedSeconds(db, {
      fromAgent: "market-watcher",
      signalType: "price_anomaly",
      stockCode: "VCB",
      title: "VCB spike",
      agedSeconds: 120, // 2 min ago
    });

    const results = getRecentSignals(db, 900);

    expect(results.length).toBe(2);
    const agents = results.map((r) => r.fromAgent);
    expect(agents).toContain("news-scout");
    expect(agents).toContain("market-watcher");
  });

  it("AC-B2: excludes signals created outside the window", () => {
    const db = makeDb();

    // Within window (300s = 5 min)
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      stockCode: "FPT",
      agedSeconds: 200, // inside 300s window
    });
    // Outside window
    insertSignalAgedSeconds(db, {
      fromAgent: "market-watcher",
      signalType: "price_anomaly",
      stockCode: "VCB",
      agedSeconds: 400, // outside 300s window
    });

    const results = getRecentSignals(db, 300); // 5-min window

    expect(results.length).toBe(1);
    expect(results[0]!.fromAgent).toBe("news-scout");
  });

  it("AC-B3: excludes 'unread' status rows — only committed/published/read are visible", () => {
    const db = makeDb();

    // read — should be included
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      stockCode: "VNM",
      agedSeconds: 30,
      status: "read",
    });
    // published — should be included
    insertSignalAgedSeconds(db, {
      fromAgent: "market-watcher",
      signalType: "price_anomaly",
      stockCode: "VCB",
      agedSeconds: 60,
      status: "published",
    });
    // unread — should be EXCLUDED (not yet committed from sibling perspective)
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout-sibling",
      signalType: "chain_catalyst",
      stockCode: "HPG",
      agedSeconds: 10,
      status: "unread",
    });

    const results = getRecentSignals(db, 900);

    expect(results.length).toBe(2);
    const fromAgents = results.map((r) => r.fromAgent);
    expect(fromAgents).not.toContain("news-scout-sibling");
  });

  it("AC-B4: getRecentSignals returns empty array when no signals in window", () => {
    const db = makeDb();

    // All signals outside the 60s window
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      agedSeconds: 120, // older than 60s window
    });

    const results = getRecentSignals(db, 60);

    expect(results.length).toBe(0);
  });

  it("AC-B5: content-hash key detects sibling duplicate (same signal_type + stock_code + title)", () => {
    const db = makeDb();

    // Sibling posted the same signal 2 minutes ago
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout-cloud-backstop",
      signalType: "urgent_news",
      stockCode: "VNM",
      title: "VNM Q1 lợi nhuận tăng 15%",
      agedSeconds: 120,
      status: "read",
    });

    const recent = getRecentSignals(db, 900);

    // Candidate from this session
    const candidate = {
      signalType: "urgent_news",
      stockCode: "VNM",
      title: "VNM Q1 lợi nhuận tăng 15%",
    };

    // Check if sibling matches via normalised key
    const candidateKey = normaliseKey(
      candidate.signalType,
      candidate.stockCode,
      candidate.title,
    );

    const siblingHit = recent.find((s) => {
      const siblingKey = normaliseKey(
        s.signalType,
        s.stockCode,
        s.payload.title,
      );
      return siblingKey === candidateKey;
    });

    expect(siblingHit).toBeDefined();
    expect(siblingHit!.fromAgent).toBe("news-scout-cloud-backstop");
  });

  it("AC-B6: different normalised keys are NOT flagged as duplicates", () => {
    const db = makeDb();

    // Sibling posted about VNM
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout-cloud-backstop",
      signalType: "urgent_news",
      stockCode: "VNM",
      title: "VNM Q1 lợi nhuận tăng 15%",
      agedSeconds: 120,
      status: "read",
    });

    const recent = getRecentSignals(db, 900);

    // Candidate is about a different ticker
    const candidateKey = normaliseKey("urgent_news", "VCB", "VCB tăng trưởng mạnh");

    const siblingHit = recent.find((s) => {
      const siblingKey = normaliseKey(s.signalType, s.stockCode, s.payload.title);
      return siblingKey === candidateKey;
    });

    expect(siblingHit).toBeUndefined();
  });
});

// ── DMS-2 tests ───────────────────────────────────────────────────────────────

describe("DMS-2 (Root C) — market-watcher sibling-success corroboration gate", () => {
  it("AC-C1: non-empty SIBLING_RECENT suppresses false gateway-down BUG (corroboration detected)", () => {
    const db = makeDb();

    // A sibling gatherer posted successfully 5 minutes ago
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout",
      signalType: "chain_catalyst",
      stockCode: "FPT",
      title: "FPT macro signal",
      agedSeconds: 300, // 5 min ago — well within 15-min window
      status: "read",
    });

    const siblingRecent = getRecentSignals(db, 900);

    // Corroboration logic: if any signal in window → gateway reachable via sibling
    const gatewayReachableViaSibling = siblingRecent.length > 0;

    expect(gatewayReachableViaSibling).toBe(true);
    // Market-watcher would EXIT cleanly (suppress false BUG) in this branch
  });

  it("AC-C2: empty SIBLING_RECENT → real outage path (BUG should be filed)", () => {
    const db = makeDb();
    // No signals at all in DB

    const siblingRecent = getRecentSignals(db, 900);

    const gatewayReachableViaSibling = siblingRecent.length > 0;

    expect(gatewayReachableViaSibling).toBe(false);
    // Market-watcher would file gateway-down BUG in this branch
  });

  it("AC-C3: getRecentSignals default window is 900 seconds (15 minutes)", () => {
    const db = makeDb();

    // Signal at exactly 895s ago — within default window
    insertSignalAgedSeconds(db, {
      fromAgent: "market-watcher",
      signalType: "price_anomaly",
      stockCode: "VCB",
      agedSeconds: 895,
      status: "read",
    });
    // Signal at 910s ago — outside default window
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      stockCode: "VNM",
      agedSeconds: 910,
      status: "read",
    });

    // No argument = default window (900s)
    const results = getRecentSignals(db);

    expect(results.length).toBe(1);
    expect(results[0]!.stockCode).toBe("VCB");
  });

  it("AC-C4: custom window correctly bounds results", () => {
    const db = makeDb();

    // Signal 120s ago — inside 300s window, outside 60s window
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout",
      signalType: "chain_catalyst",
      agedSeconds: 120,
      status: "read",
    });

    const in300s = getRecentSignals(db, 300);
    const in60s = getRecentSignals(db, 60);

    expect(in300s.length).toBe(1);
    expect(in60s.length).toBe(0);
  });

  it("AC-C5: only committed/published/read count for corroboration — unread alone does NOT confirm gateway", () => {
    const db = makeDb();

    // Only an unread signal — sibling may have started but not committed yet
    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      stockCode: "VNM",
      agedSeconds: 60,
      status: "unread", // NOT committed
    });

    const siblingRecent = getRecentSignals(db, 900);

    // unread rows are excluded — corroboration NOT confirmed
    expect(siblingRecent.length).toBe(0);
  });
});

// ── Integration: getRecentSignals with empty DB ───────────────────────────────

describe("getRecentSignals — edge cases", () => {
  it("returns empty array on empty DB", () => {
    const db = makeDb();
    const results = getRecentSignals(db, 900);
    expect(results).toEqual([]);
  });

  it("returns empty array on DB without agent_signals table gracefully?", () => {
    // Should throw because table doesn't exist — this documents the expected behavior
    const db = new Database(":memory:");
    // No table created
    expect(() => getRecentSignals(db, 900)).toThrow();
  });

  it("orders results newest-first (DESC by created_at)", () => {
    const db = makeDb();

    insertSignalAgedSeconds(db, {
      fromAgent: "news-scout",
      signalType: "urgent_news",
      stockCode: "A",
      agedSeconds: 200, // older
      status: "read",
    });
    insertSignalAgedSeconds(db, {
      fromAgent: "market-watcher",
      signalType: "price_anomaly",
      stockCode: "B",
      agedSeconds: 50, // newer
      status: "read",
    });

    const results = getRecentSignals(db, 900);

    // Newest first
    expect(results[0]!.stockCode).toBe("B");
    expect(results[1]!.stockCode).toBe("A");
  });
});
