// src/__tests__/ALPHA-S2-OMO-LIQUIDITY-CRON.test.ts
// ALPHA-S2-OMO-LIQUIDITY-CRON — unit tests for runSbvOmoLiquidityCron
// (Sprint FLOW-PRICE-ALPHA-LOOP). Covers the asymmetric fail-loud contract (brief §3):
//   1. HARD fail (macroFetch ok:false — transport/network down) → mocked notifyBug CALLED.
//   2. SOFT fail (HTTP 200, omo.is_estimate===true) → mocked notifyBug NOT called.
//   3. Success (HTTP 200, omo.is_estimate===false) → mocked notifyBug NOT called, PLUS a
//      structural proof (source inspection, no mock.module() needed — avoids leaking an
//      incomplete Database stub into sibling test files via Bun's ESM mock cache, see
//      mock-module-afterall-guard.test.ts) that the job never imports the DB/schema layer
//      at all — confirms the side-effect-free design, not just "test passes".
//
// Design SSOT: docs/architecture-briefs/2026-07-15-alpha-s2-omo-liquidity-cron.md

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runSbvOmoLiquidityCron } from "../scheduler/macro/sbvOmoLiquidityCronJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// globalThis.fetch mocking helpers (mirrors 1570b-yield-spread-signal.test.ts idiom)
// ─────────────────────────────────────────────────────────────────────────────

function makeLiquidityPayload(omoOverrides: Partial<{
  is_estimate: boolean;
  blocked_reason: string;
  auction_date: string;
}> = {}): object {
  const now = new Date().toISOString();
  return {
    status: "ok",
    policy_rates: {
      refi_rate_pct: 4.5,
      discount_rate_pct: 3.5,
      lombard_rate_pct: 5.5,
      source: "sbv.gov.vn",
      fetched_at: now,
      is_estimate: false,
    },
    sjc_gold_gap: {
      sjc_price_mn_vnd: 88.5,
      world_price_mn_vnd: 75.2,
      sjc_gap_mn_vnd: 13.3,
      is_estimate: false,
      note: "",
      fetched_at: now,
    },
    fx_coupling: {
      usd_vnd_center: 24500,
      usd_vnd_buy: 24300,
      usd_vnd_sell: 24700,
      band_pct: 5,
      dxy: 104.2,
      cny_vnd_rate: 3400,
      is_estimate: false,
      fetched_at: now,
    },
    irs: { is_estimate: true, note: "DD-6: HNX OTC IRS not machine-readable" },
    omo: {
      net_outstanding_bn_vnd: omoOverrides.is_estimate ? null : 12345,
      total_add_bn_vnd: 20000,
      total_absorb_bn_vnd: 7655,
      auction_date: omoOverrides.auction_date ?? "2026-07-15",
      is_estimate: omoOverrides.is_estimate ?? false,
      ...(omoOverrides.blocked_reason ? { blocked_reason: omoOverrides.blocked_reason } : {}),
      source: "sbv.gov.vn/nghiep-vu-thi-truong-mo",
      fetched_at: now,
    },
    interbank_1w: {
      rate_1w_pct: null,
      is_estimate: true,
      blocked_reason: "dttktt.sbv.gov.vn = 100% packet loss (architect Decision B)",
    },
    fetched_at: now,
    source: "macro-indicators",
  };
}

function mockLiquidityFetchOk(payload: object): () => void {
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/liquidity-state")) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return original(input, _init);
  };
  return () => { globalThis.fetch = original; };
}

function mockLiquidityFetchNetworkError(): () => void {
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/liquidity-state")) {
      throw new Error("ECONNREFUSED");
    }
    return original(input, _init);
  };
  return () => { globalThis.fetch = original; };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("runSbvOmoLiquidityCron — fail-loud contract", () => {
  it("HARD fail (macroFetch ok:false — network down) → notifyBug CALLED, persisted:false", async () => {
    const restore = mockLiquidityFetchNetworkError();
    try {
      let notifyCallCount = 0;
      let capturedMsg = "";
      const notifyBug = async (msg: string) => {
        notifyCallCount++;
        capturedMsg = msg;
        return 12345;
      };

      const result = await runSbvOmoLiquidityCron({
        baseUrl: "http://localhost:5004",
        deadlineMs: 2_000,
        notifyBug,
      });

      expect(result.persisted).toBe(false);
      expect(result.reason).toBe("transport:network");
      expect(notifyCallCount).toBe(1);
      expect(capturedMsg).toContain("unreachable");
      expect(capturedMsg).toContain("sbv_omo_daily did NOT accrue today");
    } finally {
      restore();
    }
  });

  it("SOFT fail (HTTP 200, omo.is_estimate===true, single-day) → notifyBug NOT called", async () => {
    const payload = makeLiquidityPayload({
      is_estimate: true,
      blocked_reason: "SBV OMO HTML fetch/parse failed",
    });
    const restore = mockLiquidityFetchOk(payload);
    try {
      let notifyCallCount = 0;
      const notifyBug = async (_msg: string) => {
        notifyCallCount++;
        return 0;
      };

      const result = await runSbvOmoLiquidityCron({
        baseUrl: "http://localhost:5004",
        deadlineMs: 2_000,
        notifyBug,
      });

      expect(result.persisted).toBe(false);
      expect(result.reason).toBe("omo-degrade:SBV OMO HTML fetch/parse failed");
      expect(notifyCallCount).toBe(0);
    } finally {
      restore();
    }
  });

  it("Success (HTTP 200, omo.is_estimate===false) → notifyBug NOT called", async () => {
    const payload = makeLiquidityPayload({ is_estimate: false, auction_date: "2026-07-15" });
    const restore = mockLiquidityFetchOk(payload);
    try {
      let notifyCallCount = 0;
      const notifyBug = async (_msg: string) => {
        notifyCallCount++;
        return 0;
      };

      const result = await runSbvOmoLiquidityCron({
        baseUrl: "http://localhost:5004",
        deadlineMs: 2_000,
        notifyBug,
      });

      expect(result.persisted).toBe(true);
      expect(result.reason).toBe("ok");
      expect(notifyCallCount).toBe(0);
    } finally {
      restore();
    }
  });

  it("side-effect-free proof: job source never imports/touches the DB layer (zero local write surface)", () => {
    // Structural proof (not a runtime mock.module() trap — see file header note): this job
    // triggers a remote persist on the macro-indicators Go service and writes NOTHING itself
    // (architecture brief §2). Reading the compiled source and asserting it never references
    // the DB/schema layer is a stronger, leak-free guarantee than a mocked DB handle — it
    // fails loudly if a future change ever wires in a getDb()/db.prepare() call, without risking
    // an incomplete Database stub bleeding into sibling test files via Bun's ESM mock cache.
    const src = readFileSync(
      join(process.cwd(), "src/scheduler/macro/sbvOmoLiquidityCronJob.ts"),
      "utf-8",
    );
    expect(src).not.toContain("getDb");
    expect(src).not.toContain("schema.js");
    expect(src).not.toContain(".prepare(");
    expect(src).not.toContain("bun:sqlite");
  });

  it("schema-mismatch (HTTP 200, payload fails LiquidityStateResponseSchema) → notifyBug CALLED, persisted:false", async () => {
    // Deliberately missing all required fields — exercises the contract-drift guard.
    const restore = mockLiquidityFetchOk({ status: "ok" });
    try {
      let notifyCallCount = 0;
      const notifyBug = async (_msg: string) => {
        notifyCallCount++;
        return 0;
      };

      const result = await runSbvOmoLiquidityCron({
        baseUrl: "http://localhost:5004",
        deadlineMs: 2_000,
        notifyBug,
      });

      expect(result.persisted).toBe(false);
      expect(result.reason).toBe("schema-mismatch");
      expect(notifyCallCount).toBe(1);
    } finally {
      restore();
    }
  });
});
