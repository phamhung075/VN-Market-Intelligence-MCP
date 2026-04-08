/**
 * Task 306 — buildEnrichedAnswer in userRequestCheckJob
 *
 * TDD test file. Tests cover:
 *  1. Ticker extraction from both "ask" and "why:" payloads
 *  2. Composed Vietnamese answer includes price / alert / hexagram
 *  3. Telegram is called with channel='chat' (via Chat Channel)
 *  4. Request is marked answered (status='done') after successful send
 *  5. If Telegram send fails, row remains 'pending'
 *  6. Missing data → graceful Vietnamese fallback (no throw)
 *  7. No watchlist ticker found → pure RAG fallback
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { insertUserRequest } from "../infrastructure/db/userRequestStore.js";
import { ensureUserRequestsTable } from "./helpers/userRequestsTestDdl.js";
import { runUserRequestCheck, type UserRequestCheckDeps } from "../scheduler/userRequestCheckJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — build a minimal in-memory DB with required tables
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");

  // user_requests
  ensureUserRequestsTable(db);

  // watchlist — for ticker filtering
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      name TEXT
    )
  `);
  db.exec(`INSERT OR IGNORE INTO watchlist (code, name) VALUES ('VNM', 'Vinamilk')`);
  db.exec(`INSERT OR IGNORE INTO watchlist (code, name) VALUES ('VCB', 'Vietcombank')`);
  db.exec(`INSERT OR IGNORE INTO watchlist (code, name) VALUES ('FPT', 'FPT Corp')`);

  // market_prices — ticker price/change data
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT NOT NULL,
      price REAL,
      change_pct REAL,
      fetched_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`INSERT INTO market_prices (code, price, change_pct) VALUES ('VNM', 75000, 2.3)`);
  db.exec(`INSERT INTO market_prices (code, price, change_pct) VALUES ('VCB', 88000, -0.5)`);

  // alerts — minimal schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT DEFAULT (datetime('now')),
      severity TEXT,
      signals_json TEXT,
      affected_actions_json TEXT,
      analysis_ids_json TEXT,
      message TEXT,
      read INTEGER DEFAULT 0,
      user_note TEXT,
      notified_telegram INTEGER DEFAULT 0
    )
  `);
  db.exec(`
    INSERT INTO alerts (id, severity, message, triggered_at, affected_actions_json)
    VALUES ('alert-vnm-1', 'high', 'VNM tang manh', datetime('now'), '[{"code":"VNM"}]')
  `);

  // kinhdich_readings — minimal schema for hexagram enrichment
  db.exec(`
    CREATE TABLE IF NOT EXISTS kinhdich_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      hexagram_number INTEGER NOT NULL,
      ho_que_number INTEGER,
      bien_que_number INTEGER,
      hao_states TEXT,
      raw_scores TEXT,
      trading_signal TEXT,
      confidence REAL,
      action_note TEXT,
      source TEXT DEFAULT 'manual'
    )
  `);
  db.exec(`
    INSERT INTO kinhdich_readings (stock_code, hexagram_number, trading_signal, confidence)
    VALUES ('VNM', 1, 'MUA (tich cuc)', 0.85)
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ticker extraction — "ask" payload with Vietnamese text containing VNM
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 306 — buildEnrichedAnswer: ticker extraction", () => {
  it("extracts ticker from ask payload containing VNM", async () => {
    const db = makeDb();
    const reqId = insertUserRequest(db, "ask", "VNM hom nay the nao?");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    expect(capturedMessages.length).toBe(1);
    expect(capturedMessages[0]).toContain("VNM");
  });

  it("extracts ticker from why: prefix payload", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "why:VCB");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    expect(capturedMessages.length).toBe(1);
    expect(capturedMessages[0]).toContain("VCB");
  });

  it("extracts ticker from lowercase why: prefix", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "why:vnm");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    // Should extract VNM (uppercased) from why:vnm
    expect(capturedMessages.length).toBe(1);
    expect(capturedMessages[0]).toContain("VNM");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Enriched answer content — price, alert, hexagram
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 306 — buildEnrichedAnswer: enriched content", () => {
  it("includes price data in the answer for VNM", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "VNM hom nay the nao?");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    const msg = capturedMessages[0];
    // Should contain price or change percentage
    expect(msg).toMatch(/75000|75\.000|2\.3%|2\.30%|tang|gia/i);
  });

  it("includes hexagram number in the answer for VNM", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "VNM hom nay the nao?");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    const msg = capturedMessages[0];
    // Hexagram number 1 should appear in message
    expect(msg).toMatch(/Que|hexagram|que so 1|#1|1\b/i);
  });

  it("includes most recent alert for VNM in answer", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "VNM hom nay the nao?");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    const msg = capturedMessages[0];
    // Alert message content should be referenced
    expect(msg).toContain("VNM tang manh");
  });

  it("answer text is in Vietnamese (contains Vietnamese keywords)", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "VNM hom nay the nao?");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    const msg = capturedMessages[0];
    // Should contain Vietnamese phrasing
    expect(msg).toMatch(/hom nay|gia|tin hieu|phan tich|Kinh Dich|Que|canh bao|thi truong/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Telegram channel — sends to Chat Channel (sendTelegramFn is the chat channel)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 306 — buildEnrichedAnswer: Telegram channel", () => {
  it("calls sendTelegramFn (Chat Channel) exactly once per request", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "VNM hom nay the nao?");

    let callCount = 0;
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (_msg) => {
        callCount++;
        return true;
      },
    };

    await runUserRequestCheck(db, deps);
    expect(callCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Request marked answered after successful send
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 306 — buildEnrichedAnswer: marks request answered", () => {
  it("sets status=done and answered_at after successful Telegram send", async () => {
    const db = makeDb();
    const reqId = insertUserRequest(db, "ask", "VNM hom nay the nao?");

    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async () => true,
    };

    await runUserRequestCheck(db, deps);

    const row = db
      .prepare(`SELECT status, answered_at FROM user_requests WHERE id = ?`)
      .get(reqId) as { status: string; answered_at: string | null } | null;

    expect(row).not.toBeNull();
    expect(row!.status).toBe("done");
    expect(row!.answered_at).not.toBeNull();
  });

  it("returns processed=1 after answering one request", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "VNM hom nay the nao?");

    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async () => true,
    };

    const result = await runUserRequestCheck(db, deps);
    expect(result.processed).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Telegram send fails → row remains 'pending' (not marked done)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 306 — buildEnrichedAnswer: send failure keeps row pending", () => {
  it("leaves row with status != done when sendTelegramFn throws", async () => {
    const db = makeDb();
    const reqId = insertUserRequest(db, "ask", "VNM hom nay the nao?");

    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async () => {
        throw new Error("Telegram network error");
      },
    };

    await runUserRequestCheck(db, deps);

    const row = db
      .prepare(`SELECT status FROM user_requests WHERE id = ?`)
      .get(reqId) as { status: string } | null;

    // When send fails, row should NOT be 'done' — it should remain pending or be reset
    // Per AC-306: "If sendTelegramMarket throws, the row remains status='pending'"
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Missing data → graceful Vietnamese fallback (no throw)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 306 — buildEnrichedAnswer: graceful fallback when data missing", () => {
  it("handles missing kinhdich_readings gracefully with Vietnamese fallback text", async () => {
    const db = makeDb();
    // Use a ticker in watchlist but with NO kinhdich_readings row
    db.exec(`INSERT OR IGNORE INTO watchlist (code, name) VALUES ('FPT', 'FPT Corp')`);
    // No kinhdich_readings row for FPT

    insertUserRequest(db, "ask", "FPT hom nay the nao?");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    // Must not throw
    await expect(runUserRequestCheck(db, deps)).resolves.toBeDefined();
    expect(capturedMessages.length).toBe(1);
    // Should contain fallback text for missing hexagram data
    expect(capturedMessages[0]).toMatch(/Chua co|khong co|du lieu|FPT/i);
  });

  it("handles missing market_prices gracefully — no throw", async () => {
    const db = makeDb();
    // FPT has no market_prices row
    insertUserRequest(db, "ask", "FPT hom nay the nao?");

    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async () => true,
    };

    // Should not throw even when price data is absent
    await expect(runUserRequestCheck(db, deps)).resolves.toBeDefined();
  });

  it("handles no alerts for ticker gracefully — no throw", async () => {
    const db = makeDb();
    // FPT has no alerts
    insertUserRequest(db, "ask", "FPT hom nay the nao?");

    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async () => true,
    };

    await expect(runUserRequestCheck(db, deps)).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. No watchlist ticker in payload → pure RAG fallback (no enrichment crash)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 306 — buildEnrichedAnswer: no ticker → RAG fallback", () => {
  it("sends answer even when no watchlist ticker is found in payload", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "Thi truong hom nay the nao?");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [
        {
          id: "r1",
          level: "global",
          title: "Market overview",
          summary: "Thi truong on dinh",
          tags: [],
          actionCode: "",
          createdAt: new Date().toISOString(),
          distance: 0.1,
        },
      ],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    expect(capturedMessages.length).toBe(1);
    // Answer should use RAG content when no ticker
    expect(capturedMessages[0]).toContain("Thi truong on dinh");
  });

  it("returns processed=1 even for no-ticker RAG-only answer", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "Thi truong hom nay the nao?");

    const deps: UserRequestCheckDeps = {
      searchContextFn: async (_q) => [],
      sendTelegramFn: async () => true,
    };

    const result = await runUserRequestCheck(db, deps);
    expect(result.processed).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. why: prefix — structured Vietnamese answer
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 306 — buildEnrichedAnswer: why: prefix handling", () => {
  it("why:VNM produces Vietnamese analysis mentioning VNM with hexagram and price", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "why:VNM");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    expect(capturedMessages.length).toBe(1);
    const msg = capturedMessages[0];
    expect(msg).toContain("VNM");
    // Should have both hexagram and price info
    expect(msg).toMatch(/Que|MUA|tich cuc|75000|75\.000|tang/i);
  });

  it("why:VCB produces answer referencing VCB price", async () => {
    const db = makeDb();
    insertUserRequest(db, "ask", "why:VCB");

    const capturedMessages: string[] = [];
    const deps: UserRequestCheckDeps = {
      searchContextFn: async () => [],
      sendTelegramFn: async (msg) => {
        capturedMessages.push(msg);
        return true;
      },
    };

    await runUserRequestCheck(db, deps);

    expect(capturedMessages.length).toBe(1);
    expect(capturedMessages[0]).toContain("VCB");
    // VCB has price data: 88000
    expect(capturedMessages[0]).toMatch(/88000|88\.000|giam|change/i);
  });
});
