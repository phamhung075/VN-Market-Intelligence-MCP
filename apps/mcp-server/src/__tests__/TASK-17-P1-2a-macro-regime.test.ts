/**
 * TASK-17-P1-2a-macro-regime.test.ts
 *
 * Scoped test file for GET /api/macro-regime handler.
 *
 * Coverage:
 *   (a) Real-shape reshape  — upstream snapshot fixture → correct flat envelope
 *   (b) Upstream failure    — network error → data_source:"unavailable", 502, no fabricated numbers
 *   (c) Oil impact→direction normalization — "impact" field promoted to "direction" key
 *
 * Run with: bun test src/__tests__/TASK-17-P1-2a-macro-regime.test.ts
 */

import { describe, it, expect } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  fetchAndReshapeMacroRegime,
  handleGetMacroRegime,
  type MacroRegimeResponse,
} from "../interface/mcp/routes/macroRegimeHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fake server infrastructure
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

const fakeReq = {} as IncomingMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Fake upstream server — starts on a random port for each describe block
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";
import type { Server } from "node:http";

async function startFakeUpstream(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
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
// The exact upstream snapshot from the task brief
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_SNAPSHOT = {
  status: "ok",
  vnIndex: 1797.4,
  oilUsd: 93.74,
  goldUsd: 4105,
  usdVnd: 26130,
  dataSource: "live",
  signals: {
    "investment-clock": { tier: "VN_DIRECT", score: 8, phase: "CORE_VN" },
    oil: {
      impact: "NEUTRAL",
      priceUSD: 93.74,
      reasoning: "Oil at $93.74/barrel is within the $60–$100 neutral band (NEUTRAL)",
    },
    gold: {
      direction: "BULLISH",
      priceUSD: 4105,
      reasoning: "Gold at $4105.00/oz exceeds $2200 threshold — safe-haven demand signals risk-off (BULLISH)",
    },
    usdvnd: {
      direction: "BEARISH",
      rateVND: 26130,
      reasoning: "USDVND at 26130 exceeds 25000 threshold — VND depreciation creates import cost pressure",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// (a) Real-shape reshape
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 P1-2a — real-shape reshape", () => {
  it("(a-1) correct flat envelope from live upstream snapshot", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(LIVE_SNAPSHOT));
    });

    try {
      const result = await fetchAndReshapeMacroRegime(baseUrl);

      // Top-level envelope fields
      expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.data_source).toBe("live");
      expect(result.stale_served).toBe(false);

      // Indicators
      expect(result.indicators.vnIndex).toBe(1797.4);
      expect(result.indicators.oilUsd).toBe(93.74);
      expect(result.indicators.goldUsd).toBe(4105);
      expect(result.indicators.usdVnd).toBe(26130);

      // Investment clock
      expect(result.signals.investment_clock.phase).toBe("CORE_VN");
      expect(result.signals.investment_clock.score).toBe(8);
      expect(result.signals.investment_clock.tier).toBe("VN_DIRECT");

      // Gold signal
      expect(result.signals.gold.direction).toBe("BULLISH");
      expect(result.signals.gold.price_usd).toBe(4105);
      expect(result.signals.gold.reasoning).toContain("safe-haven");

      // USDVND signal
      expect(result.signals.usdvnd.direction).toBe("BEARISH");
      expect(result.signals.usdvnd.rate_vnd).toBe(26130);
      expect(result.signals.usdvnd.reasoning).toContain("VND depreciation");
    } finally {
      await stopServer(server);
    }
  });

  it("(a-2) HTTP handler returns 200 with correct body", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(LIVE_SNAPSHOT));
    });

    try {
      const fakeServerRes = makeRes();
      await handleGetMacroRegime(fakeReq, fakeServerRes as unknown as ServerResponse, baseUrl);

      expect(fakeServerRes.statusCode).toBe(200);
      const body = JSON.parse(fakeServerRes.body) as MacroRegimeResponse;
      expect(body.data_source).toBe("live");
      expect(body.indicators.vnIndex).toBe(1797.4);
      expect(body.signals.investment_clock.phase).toBe("CORE_VN");
    } finally {
      await stopServer(server);
    }
  });

  it("(a-3) calendar block surfaces availability honestly", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(LIVE_SNAPSHOT));
    });

    try {
      const result = await fetchAndReshapeMacroRegime(baseUrl);
      // Calendar is currently unavailable (upstream returns events:[])
      expect(result.calendar.available).toBe(false);
      expect(Array.isArray(result.calendar.events)).toBe(true);
      expect(result.calendar.events.length).toBe(0);
      expect(typeof result.calendar.note).toBe("string");
      expect(result.calendar.note.length).toBeGreaterThan(0);
    } finally {
      await stopServer(server);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) Upstream failure — network error / non-2xx
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 P1-2a — upstream failure path", () => {
  it("(b-1) network error → 502, data_source:'unavailable', stale_served:true", async () => {
    // Use a port that is definitely not listening
    const badBaseUrl = "http://127.0.0.1:19999";

    const fakeServerRes = makeRes();
    await handleGetMacroRegime(fakeReq, fakeServerRes as unknown as ServerResponse, badBaseUrl);

    expect(fakeServerRes.statusCode).toBe(502);
    const body = JSON.parse(fakeServerRes.body) as MacroRegimeResponse;
    expect(body.data_source).toBe("unavailable");
    expect(body.stale_served).toBe(true);
  });

  it("(b-2) non-2xx upstream → 502, data_source:'unavailable'", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "service unavailable" }));
    });

    try {
      const fakeServerRes = makeRes();
      await handleGetMacroRegime(fakeReq, fakeServerRes as unknown as ServerResponse, baseUrl);

      expect(fakeServerRes.statusCode).toBe(502);
      const body = JSON.parse(fakeServerRes.body) as MacroRegimeResponse;
      expect(body.data_source).toBe("unavailable");
      expect(body.stale_served).toBe(true);
    } finally {
      await stopServer(server);
    }
  });

  it("(b-3) failure envelope contains no fabricated numbers", async () => {
    const badBaseUrl = "http://127.0.0.1:19999";

    const fakeServerRes = makeRes();
    await handleGetMacroRegime(fakeReq, fakeServerRes as unknown as ServerResponse, badBaseUrl);

    const body = JSON.parse(fakeServerRes.body) as MacroRegimeResponse;
    // All indicators must be null — not fabricated values
    expect(body.indicators.vnIndex).toBeNull();
    expect(body.indicators.oilUsd).toBeNull();
    expect(body.indicators.goldUsd).toBeNull();
    expect(body.indicators.usdVnd).toBeNull();
  });

  it("(b-4) fetchAndReshapeMacroRegime throws on network error", async () => {
    const badBaseUrl = "http://127.0.0.1:19999";
    await expect(fetchAndReshapeMacroRegime(badBaseUrl)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) Oil impact → direction normalization
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 P1-2a — oil impact→direction normalization", () => {
  it("(c-1) oil.impact:'NEUTRAL' is surfaced as oil.direction:'NEUTRAL'", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(LIVE_SNAPSHOT));
    });

    try {
      const result = await fetchAndReshapeMacroRegime(baseUrl);
      // upstream has signals.oil.impact:"NEUTRAL" — must become direction:"NEUTRAL"
      expect(result.signals.oil.direction).toBe("NEUTRAL");
      // price_usd preserved verbatim
      expect(result.signals.oil.price_usd).toBe(93.74);
      // reasoning preserved verbatim
      expect(result.signals.oil.reasoning).toContain("NEUTRAL");
    } finally {
      await stopServer(server);
    }
  });

  it("(c-2) oil.impact:'BULLISH' is surfaced as oil.direction:'BULLISH'", async () => {
    const bullishSnapshot = {
      ...LIVE_SNAPSHOT,
      signals: {
        ...LIVE_SNAPSHOT.signals,
        oil: {
          impact: "BULLISH",
          priceUSD: 120.0,
          reasoning: "Oil above $100 — bullish supply shock",
        },
      },
    };

    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(bullishSnapshot));
    });

    try {
      const result = await fetchAndReshapeMacroRegime(baseUrl);
      expect(result.signals.oil.direction).toBe("BULLISH");
      expect(result.signals.oil.price_usd).toBe(120.0);
    } finally {
      await stopServer(server);
    }
  });

  it("(c-3) oil and gold and usdvnd all share direction key in served shape", async () => {
    const { server, baseUrl } = await startFakeUpstream((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(LIVE_SNAPSHOT));
    });

    try {
      const result = await fetchAndReshapeMacroRegime(baseUrl);
      // All three signals must have a 'direction' key
      expect(typeof result.signals.oil.direction).toBe("string");
      expect(typeof result.signals.gold.direction).toBe("string");
      expect(typeof result.signals.usdvnd.direction).toBe("string");
      // oil must NOT expose an 'impact' key at the served level
      expect("impact" in result.signals.oil).toBe(false);
    } finally {
      await stopServer(server);
    }
  });
});
