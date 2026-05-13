// src/__tests__/1892b-vps-contract-push.test.ts
// Task push-path-fix — VPS contract integration tests
//
// Verifies that /api/push-prices and /api/push-news handlers accept the EXACT
// body shapes produced by the deployed VPS scripts (fetch-prices.sh and
// fetch-vn-news.sh). Any schema drift here means the VPS producer and the
// mcp-server consumer are out of contract.
//
// Tests:
//   Prices:
//   (P1) VPS exact body → 200 + market_prices rows inserted (stock unit conversion)
//   (P2) VPS index item (type:"index") → price NOT multiplied by 1000
//   (P3) VPS global_index item → price NOT multiplied by 1000
//   (P4) Malformed body (object not array) → 400
//   (P5) Empty array → 400
//   (P6) Missing auth → 401
//
//   News:
//   (N1) VPS exact body (14-source merge) → 200 + received count matches
//   (N2) Malformed body (string not array) → 400
//   (N3) Missing auth → 401
//   (N4) Heartbeat sentinel item accepted → 200 (VPS sends this on all-empty RSS)

Bun.env["DB_PATH"] = ":memory:";
Bun.env["VPS_PUSH_API_KEY"] = "test-key-1892b";

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handlePushPrices } from "../interface/mcp/routes/pushPricesHandler.js";
import { handlePushNews } from "../interface/mcp/routes/pushNewsHandler.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { _resetStaleTickers_lastNotifiedDate } from "../interface/mcp/server-startup.js";

// ─── HTTP mock helpers ────────────────────────────────────────────────────────

function makeReq(body: string, apiKey?: string | null): IncomingMessage {
  const chunks: string[] = body ? [body] : [];
  let idx = 0;
  const headers: Record<string, string | undefined> = {};
  if (apiKey !== null) {
    headers["x-api-key"] = apiKey ?? "test-key-1892b";
  }
  const req = {
    headers,
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<{ value: string; done: boolean }> {
          if (idx < chunks.length) {
            return Promise.resolve({ value: chunks[idx++]!, done: false });
          }
          return Promise.resolve({ value: "", done: true });
        },
      };
    },
  } as unknown as IncomingMessage;
  return req;
}

interface MockRes {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  writeHead(code: number, headers?: Record<string, string>): void;
  end(data?: string): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: "",
    headers: {},
    writeHead(code, hdrs = {}) {
      res.statusCode = code;
      Object.assign(res.headers, hdrs);
    },
    end(data = "") {
      res.body += data;
    },
  };
  return res;
}

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as never;

// ─── Fixtures — exact body shapes produced by VPS scripts ────────────────────

// fetch-prices.sh Step 2: VN stock item (from bgapidatafeed.vps.com.vn)
// price in thousands VND (e.g. 59.1 = 59,100 VND)
const VPS_PRICE_STOCK = {
  code: "VNM",
  price: 59.1,
  volume: 491960,
  change_pct: "1.66",
  ref_price: "58.2",
  high: "60.1",
  low: "58.7",
  type: "stock" as const,
};

// fetch-prices.sh Step 3: VN index item (from CafeF banggia)
// price already in correct unit (not multiplied by 1000)
const VPS_PRICE_INDEX = {
  code: "VNINDEX",
  price: 1250.5,
  volume: 900000000,
  change_pct: "0.43",
  type: "index" as const,
};

// fetch-prices.sh Step 4: global index item (from Yahoo Finance v8)
const VPS_PRICE_GLOBAL = {
  code: "^GSPC",
  price: 5300.25,
  volume: 0,
  change_pct: "0.12",
  type: "global_index" as const,
};

// fetch-vn-news.sh: single news item (from RSS → Python XML parser)
const VPS_NEWS_ITEM = (source: string, idx: number) => ({
  title: `Article ${idx} from ${source}`,
  url: `https://${source}.vn/article-${idx}`,
  publishedAt: "Wed, 13 May 2026 11:00:00 +0700",
  content: "Nội dung bài viết".slice(0, 500),
  source,
});

// fetch-vn-news.sh heartbeat sentinel (sent when all 14 RSS sources return 0 items)
const VPS_HEARTBEAT_SENTINEL = {
  title: "__heartbeat__",
  url: "",
  publishedAt: new Date().toISOString(),
  content: "",
  source: "heartbeat",
};

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM market_prices");
  db.exec("DELETE FROM market_prices_history");
  db.exec("DELETE FROM daily_ohlcv");
  try {
    db.exec("DELETE FROM vps_push_log");
  } catch {
    /* best effort */
  }
  _resetStaleTickers_lastNotifiedDate();
});

afterAll(() => {
  closeDb();
});

// ─── /api/push-prices ────────────────────────────────────────────────────────

describe("1892b — /api/push-prices VPS contract", () => {
  it("(P1) VPS stock item → 200 + price stored as full VND (price × 1000)", async () => {
    const payload = [VPS_PRICE_STOCK];
    const req = makeReq(JSON.stringify(payload));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    const db = getDb();

    await handlePushPrices(req, res, db, silentLog);

    expect(mockRes.statusCode).toBe(200);
    const body = JSON.parse(mockRes.body);
    expect(body.ok).toBe(true);
    expect(body.updated).toBe(1);

    // VPS price 59.1 (thousands VND) → stored as 59100
    const row = db
      .prepare("SELECT price FROM market_prices WHERE code = ?")
      .get("VNM") as { price: number } | null;
    expect(row).not.toBeNull();
    expect(row!.price).toBe(59100);
  });

  it("(P2) VPS index item (type:index) → price stored as-is (no × 1000)", async () => {
    const payload = [VPS_PRICE_INDEX];
    const req = makeReq(JSON.stringify(payload));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    const db = getDb();

    await handlePushPrices(req, res, db, silentLog);

    expect(mockRes.statusCode).toBe(200);
    const body = JSON.parse(mockRes.body);
    expect(body.ok).toBe(true);

    const row = db
      .prepare("SELECT price FROM market_prices WHERE code = ?")
      .get("VNINDEX") as { price: number } | null;
    expect(row).not.toBeNull();
    // Index price: stored as-is (1250.5), not 1250500
    expect(row!.price).toBeCloseTo(1250.5, 1);
  });

  it("(P3) VPS global_index item → price stored as-is (no × 1000)", async () => {
    const payload = [VPS_PRICE_GLOBAL];
    const req = makeReq(JSON.stringify(payload));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    const db = getDb();

    await handlePushPrices(req, res, db, silentLog);

    expect(mockRes.statusCode).toBe(200);
    const body = JSON.parse(mockRes.body);
    expect(body.ok).toBe(true);

    const row = db
      .prepare("SELECT price FROM market_prices WHERE code = ?")
      .get("^GSPC") as { price: number } | null;
    expect(row).not.toBeNull();
    expect(row!.price).toBeCloseTo(5300.25, 1);
  });

  it("(P4) Malformed body (object not array) → 400", async () => {
    const req = makeReq(JSON.stringify({ code: "VNM", price: 59.1 }));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;

    await handlePushPrices(req, res, getDb(), silentLog);

    expect(mockRes.statusCode).toBe(400);
    const body = JSON.parse(mockRes.body);
    expect(body.error).toMatch(/array/i);
  });

  it("(P5) Empty array → 400", async () => {
    const req = makeReq(JSON.stringify([]));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;

    await handlePushPrices(req, res, getDb(), silentLog);

    expect(mockRes.statusCode).toBe(400);
    const body = JSON.parse(mockRes.body);
    expect(body.error).toMatch(/non-empty/i);
  });

  it("(P6) Missing auth header → 401", async () => {
    const req = makeReq(JSON.stringify([VPS_PRICE_STOCK]), null);
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;

    await handlePushPrices(req, res, getDb(), silentLog);

    expect(mockRes.statusCode).toBe(401);
    expect(JSON.parse(mockRes.body)).toEqual({ error: "Unauthorized" });
  });
});

// ─── /api/push-news ──────────────────────────────────────────────────────────

describe("1892b — /api/push-news VPS contract", () => {
  it("(N1) VPS 14-source news merge → 200 + received count matches", async () => {
    // Simulate 14 sources × 10 items each = 140 total (after unique_by(.url))
    const sources = [
      "cafef",
      "vnexpress",
      "vneconomy",
      "vietstock",
      "vietnambiz",
      "vnbusiness",
      "tuoitre",
      "nhandan",
      "nld",
      "cafef",
      "vneconomy",
      "vietstock",
      "vietstock",
      "nhandan",
    ];
    let itemIdx = 0;
    const items = sources.flatMap((src, srcIdx) =>
      Array.from({ length: 10 }, (_, i) => VPS_NEWS_ITEM(`${src}-${srcIdx}`, itemIdx++))
    );
    // Remove duplicates by url (mimicking VPS jq unique_by(.url))
    const seen = new Set<string>();
    const unique = items.filter((it) => {
      if (seen.has(it.url)) return false;
      seen.add(it.url);
      return true;
    });

    const req = makeReq(JSON.stringify(unique));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;

    await handlePushNews(req, res, getDb(), silentLog);

    expect(mockRes.statusCode).toBe(200);
    const body = JSON.parse(mockRes.body);
    expect(body.ok).toBe(true);
    expect(body.received).toBe(unique.length);
  });

  it("(N2) Malformed body (string not array) → 400", async () => {
    const req = makeReq(JSON.stringify("not an array"));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;

    await handlePushNews(req, res, getDb(), silentLog);

    expect(mockRes.statusCode).toBe(400);
    const body = JSON.parse(mockRes.body);
    expect(body.error).toMatch(/array/i);
  });

  it("(N3) Missing auth header → 401", async () => {
    const req = makeReq(
      JSON.stringify([VPS_NEWS_ITEM("cafef", 999)]),
      null,
    );
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;

    await handlePushNews(req, res, getDb(), silentLog);

    expect(mockRes.statusCode).toBe(401);
    expect(JSON.parse(mockRes.body)).toEqual({ error: "Unauthorized" });
  });

  it("(N4) Heartbeat sentinel item accepted → 200 (VPS sends on all-empty RSS)", async () => {
    const req = makeReq(JSON.stringify([VPS_HEARTBEAT_SENTINEL]));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;

    await handlePushNews(req, res, getDb(), silentLog);

    // Heartbeat is a valid 1-item array — handler accepts it, pollNews treats it
    // as a no-op (unknown source key "heartbeat", no URL → de-duped / skipped).
    expect(mockRes.statusCode).toBe(200);
    const body = JSON.parse(mockRes.body);
    expect(body.ok).toBe(true);
    expect(body.received).toBe(1);
  });
});
