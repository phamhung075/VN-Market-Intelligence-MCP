/**
 * TASK-17-P2-1a-price-history.test.ts
 *
 * Scoped test for GET /api/price-history/:ticker handler.
 *
 * Coverage:
 *   (a) Real reshape — VCB upstream sample → ascending candles + correct latest.change_pct
 *   (b) Upstream failure — data_source:"unavailable", 502, no fabricated numbers
 *   (c) Empty history — count:0, candles:[], data_source:"live" (honest empty, not error)
 *   (d) Junk ticker — 400 invalid_ticker (handler level, no upstream call)
 *
 * Run with: bun test src/__tests__/TASK-17-P2-1a-price-history.test.ts
 */

import { describe, it, expect } from "bun:test";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import {
  fetchAndReshapePriceHistory,
  handleGetPriceHistory,
  type PriceHistoryServeResponse,
} from "../interface/mcp/routes/priceHistoryServeHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fake server infrastructure (mirrors TASK-17-P1-2a pattern exactly)
// ─────────────────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    statusCode: 0,
    body: "",
    headers: {} as Record<string, string>,
    writeHead(code: number, headers: Record<string, string> = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    end(data = "") {
      this.body += data;
    },
  };
  return res;
}

/** Minimal fake IncomingMessage that carries the given URL (for days param parsing). */
function makeFakeReq(url = "/"): IncomingMessage {
  return { url } as IncomingMessage;
}

async function startFakeUpstream(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr !== "object") {
        reject(new Error("Could not get server address"));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
    server.on("error", reject);
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Upstream fixtures — VCB sample from task brief (30-day window excerpt)
// ─────────────────────────────────────────────────────────────────────────────

/** Two-candle excerpt matching the task brief format. */
const VCB_UPSTREAM_SAMPLE = {
  code: "VCB",
  history: [
    // Upstream may return in any order — handler must sort ascending
    { date: "2026-05-13", open: 60100, high: 60500, low: 59800, close: 60200, volume: 7100000 },
    { date: "2026-05-12", open: 60300, high: 60400, low: 59600, close: 59900, volume: 6549200 },
  ],
};

// Expected after ascending sort:
//   [0] 2026-05-12 close=59900
//   [1] 2026-05-13 close=60200
// latest.change_abs = 60200 - 59900 = 300
// latest.change_pct = (300 / 59900) * 100 ≈ 0.5008...

const EXPECTED_CHANGE_PCT = ((60200 - 59900) / 59900) * 100;

// ─────────────────────────────────────────────────────────────────────────────
// (a) Real reshape — VCB upstream sample
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 P2-1a — real reshape (VCB upstream sample)", () => {
  it("(a-1) ascending candle sort: oldest date first", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(VCB_UPSTREAM_SAMPLE));
    });

    try {
      const result = await fetchAndReshapePriceHistory("VCB", 30, baseUrl);

      expect(result.count).toBe(2);
      expect(result.candles[0]!.date).toBe("2026-05-12");
      expect(result.candles[1]!.date).toBe("2026-05-13");
    } finally {
      await stopServer(server);
    }
  });

  it("(a-2) correct latest.change_pct computed from last two candles", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(VCB_UPSTREAM_SAMPLE));
    });

    try {
      const result = await fetchAndReshapePriceHistory("VCB", 30, baseUrl);

      expect(result.latest).not.toBeNull();
      expect(result.latest!.date).toBe("2026-05-13");
      expect(result.latest!.close).toBe(60200);
      expect(result.latest!.change_abs).toBe(300);
      // Allow floating-point tolerance
      expect(Math.abs(result.latest!.change_pct! - EXPECTED_CHANGE_PCT)).toBeLessThan(0.0001);
    } finally {
      await stopServer(server);
    }
  });

  it("(a-3) top-level envelope fields present and typed correctly", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(VCB_UPSTREAM_SAMPLE));
    });

    try {
      const result = await fetchAndReshapePriceHistory("VCB", 30, baseUrl);

      expect(result.ticker).toBe("VCB");
      expect(result.data_source).toBe("live");
      expect(result.stale_served).toBe(false);
      expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await stopServer(server);
    }
  });

  it("(a-4) HTTP handler returns 200 with correct body", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(VCB_UPSTREAM_SAMPLE));
    });

    try {
      const fakeRes = makeRes();
      await handleGetPriceHistory(makeFakeReq(), fakeRes as unknown as ServerResponse, "VCB", baseUrl);

      expect(fakeRes.statusCode).toBe(200);
      const body = JSON.parse(fakeRes.body) as PriceHistoryServeResponse;
      expect(body.ticker).toBe("VCB");
      expect(body.data_source).toBe("live");
      expect(body.candles).toHaveLength(2);
    } finally {
      await stopServer(server);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) Upstream failure — network error / non-2xx
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 P2-1a — upstream failure path", () => {
  it("(b-1) network error → 502, data_source:'unavailable'", async () => {
    // Deliberately unreachable port
    const badBaseUrl = "http://127.0.0.1:19997";

    const fakeRes = makeRes();
    await handleGetPriceHistory(makeFakeReq(), fakeRes as unknown as ServerResponse, "VCB", badBaseUrl);

    expect(fakeRes.statusCode).toBe(502);
    const body = JSON.parse(fakeRes.body) as PriceHistoryServeResponse;
    expect(body.data_source).toBe("unavailable");
    expect(body.stale_served).toBe(true);
  });

  it("(b-2) non-2xx upstream → 502, data_source:'unavailable'", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "service unavailable" }));
    });

    try {
      const fakeRes = makeRes();
      await handleGetPriceHistory(makeFakeReq(), fakeRes as unknown as ServerResponse, "VCB", baseUrl);

      expect(fakeRes.statusCode).toBe(502);
      const body = JSON.parse(fakeRes.body) as PriceHistoryServeResponse;
      expect(body.data_source).toBe("unavailable");
    } finally {
      await stopServer(server);
    }
  });

  it("(b-3) failure envelope has candles:[] and latest:null — no fabricated prices", async () => {
    const badBaseUrl = "http://127.0.0.1:19997";

    const fakeRes = makeRes();
    await handleGetPriceHistory(makeFakeReq(), fakeRes as unknown as ServerResponse, "VCB", badBaseUrl);

    const body = JSON.parse(fakeRes.body) as PriceHistoryServeResponse;
    expect(body.candles).toEqual([]);
    expect(body.latest).toBeNull();
    expect(body.count).toBe(0);
    // Ticker still echoed
    expect(body.ticker).toBe("VCB");
  });

  it("(b-4) fetchAndReshapePriceHistory throws on network error", async () => {
    const badBaseUrl = "http://127.0.0.1:19997";
    await expect(fetchAndReshapePriceHistory("VCB", 30, badBaseUrl)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) Empty history — upstream returns [] → honest 200 with count:0
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 P2-1a — empty history (unknown ticker / no data)", () => {
  it("(c-1) empty upstream history → 200, count:0, candles:[], data_source:'live'", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: "ZZZZ", history: [] }));
    });

    try {
      const fakeRes = makeRes();
      await handleGetPriceHistory(makeFakeReq(), fakeRes as unknown as ServerResponse, "ZZZZ", baseUrl);

      expect(fakeRes.statusCode).toBe(200);
      const body = JSON.parse(fakeRes.body) as PriceHistoryServeResponse;
      expect(body.data_source).toBe("live");
      expect(body.count).toBe(0);
      expect(body.candles).toEqual([]);
      expect(body.latest).toBeNull();
    } finally {
      await stopServer(server);
    }
  });

  it("(c-2) single candle → latest.change_abs/change_pct are null (no prior close)", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        code: "VCB",
        history: [{ date: "2026-05-12", open: 60300, high: 60400, low: 59600, close: 59900, volume: 6549200 }],
      }));
    });

    try {
      const result = await fetchAndReshapePriceHistory("VCB", 1, baseUrl);

      expect(result.count).toBe(1);
      expect(result.latest).not.toBeNull();
      expect(result.latest!.change_abs).toBeNull();
      expect(result.latest!.change_pct).toBeNull();
    } finally {
      await stopServer(server);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) Ticker validation — 400 on junk input
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 P2-1a — ticker validation", () => {
  it("(d-1) empty string ticker → 400 invalid_ticker", async () => {
    const fakeRes = makeRes();
    await handleGetPriceHistory(makeFakeReq(), fakeRes as unknown as ServerResponse, "", "http://127.0.0.1:19997");

    expect(fakeRes.statusCode).toBe(400);
    const body = JSON.parse(fakeRes.body) as { error: string };
    expect(body.error).toBe("invalid_ticker");
  });

  it("(d-2) ticker with special chars → 400 invalid_ticker", async () => {
    const fakeRes = makeRes();
    await handleGetPriceHistory(makeFakeReq(), fakeRes as unknown as ServerResponse, "V C B!", "http://127.0.0.1:19997");

    expect(fakeRes.statusCode).toBe(400);
    const body = JSON.parse(fakeRes.body) as { error: string };
    expect(body.error).toBe("invalid_ticker");
  });

  it("(d-3) ticker too long (>20 chars) → 400 invalid_ticker", async () => {
    const fakeRes = makeRes();
    await handleGetPriceHistory(makeFakeReq(), fakeRes as unknown as ServerResponse, "ABCDEFGHIJKLMNOPQRSTU", "http://127.0.0.1:19997");

    expect(fakeRes.statusCode).toBe(400);
    const body = JSON.parse(fakeRes.body) as { error: string };
    expect(body.error).toBe("invalid_ticker");
  });

  it("(d-4) valid lowercase ticker is uppercased before upstream call", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: "VCB", history: [] }));
    });

    try {
      const fakeRes = makeRes();
      await handleGetPriceHistory(makeFakeReq(), fakeRes as unknown as ServerResponse, "vcb", baseUrl);

      // Should NOT be a 400 — lowercase is valid, uppercased before use
      expect(fakeRes.statusCode).toBe(200);
      const body = JSON.parse(fakeRes.body) as PriceHistoryServeResponse;
      expect(body.ticker).toBe("VCB");
    } finally {
      await stopServer(server);
    }
  });
});
