// src/__tests__/FIX-SBV-FETCHER-ZERO-VALUE-EMIT.test.ts
//
// Task FIX-SBV-FETCHER-ZERO-VALUE-EMIT — vn-sbv-fetch push-path storeSbvSnapshot
// rejected-zero events.
//
// Root cause: vps-scripts/fetch-sbv.sh only ever POSTs {usdVndOfficial, fetchedAt}
// to /api/push-sbv-rates (it already fails closed on empty/zero VCB XML before
// pushing). pushSbvRatesHandler.ts defaulted the 6 optional rate fields
// (overnightRatePct/refinancingRatePct/discountRatePct/maxDepositRatePct/
// maxLendingRatePct/interbankOvernightPct) to a synthetic 0 whenever the payload
// omitted them — which it always does from the VPS path. Those synthetic zeros
// tripped storeSbvSnapshot's own SENTINEL_ZERO_COLUMNS guard
// (src/infrastructure/fetchers/sbv.ts), which correctly rejects the WHOLE
// snapshot — including the valid, fresh, non-zero FX rate. The handler never
// checked the {skipped, zeroColumns} return value, so it logged a false-positive
// "stored" line regardless of whether the write actually happened.
//
// Secondary contributor: intelligenceCycleJob.ts step A2 called storeSbvSnapshot
// without the pre-flight sentinel guard sbvRatesJob.ts already has, and also
// ignored the return value.
//
// Fix:
//  1. pushSbvRatesHandler.ts merges any field the VPS payload OMITS with the most
//     recently persisted sbv_rates row (getLatestSbvRatesRow) instead of
//     defaulting to 0 — and checks/logs storeSbvSnapshot's return value.
//  2. intelligenceCycleJob.ts step A2 now routes through runSbvRatesRefreshJob()
//     (the same pre-flight sentinel guard sbvRatesJob.ts's dedicated cron uses)
//     instead of calling fetchSbvRates()+storeSbvSnapshot() directly, and checks
//     the zeroRateSkipped return field.
//
// Tests:
//   TC-01: first-ever write, VPS-shaped payload (usdVndOfficial only) → 200,
//          optional fields land as 0 (no prior row to merge from — matches
//          storeSbvSnapshot's own first-write-allows-zero contract)
//   TC-02: VPS-shaped payload AFTER a good prior row exists → optional fields
//          MERGE from the prior row (non-zero), NOT defaulted to 0 — write
//          succeeds with real carried-forward values, zero storeSbvSnapshot
//          rejected-zero events
//   TC-03: an EXPLICIT 0 sent by the payload for a sentinel field (not merely
//          omitted) is passed through unchanged, not silently overwritten by the
//          merge — storeSbvSnapshot's real guard correctly rejects the write;
//          handler responds {ok:false, skipped:true, zeroColumns} instead of a
//          false-positive "stored" 200, and log.error (not log.info) fires
//   TC-04: on a guard-rejected write, the prior good row is left untouched in
//          the DB (the guard's own job — regression guard for this fix)
//   TC-05: getLatestSbvRatesRow returns null on a fresh DB and the mapped row
//          after a real write
//   TC-06: intelligenceCycleJob.ts step A2 source no longer calls
//          storeSbvSnapshot directly — routes through runSbvRatesRefreshJob and
//          checks zeroRateSkipped (source-inspection, mirrors
//          FIX-NEWS-CB-FALSE-CLOSED.test.ts precedent for verifying wiring
//          changes that are impractical to exercise end-to-end without real HTTP)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";

Bun.env["DB_PATH"] = ":memory:";
Bun.env["VPS_PUSH_API_KEY"] = "test-key-sbv-zero-emit";

// ─── Minimal HTTP mock helpers (mirrors FIX-SBV-PUSH-TYPE-COERCE.test.ts) ─────

function makeReq(body: string, apiKey?: string): IncomingMessage {
  const chunks: string[] = body ? [body] : [];
  let idx = 0;
  const req = {
    headers: {
      "x-api-key": apiKey !== undefined ? apiKey : "test-key-sbv-zero-emit",
      "content-type": "application/json",
    },
    method: "POST",
    url: "/api/push-sbv-rates",
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
    writeHead(code: number, headers?: Record<string, string>) {
      this.statusCode = code;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data?: string) {
      this.body = data ?? "";
    },
  };
  return res;
}

function makeCapturingLog() {
  const info: unknown[][] = [];
  const error: unknown[][] = [];
  return {
    info(...a: unknown[]) { info.push(a); },
    error(...a: unknown[]) { error.push(a); },
    calls: { info, error },
  };
}

// ─── Handler + fixture wiring ──────────────────────────────────────────────

let handlePushSbvRates: (
  req: IncomingMessage,
  res: ServerResponse,
  db: import("bun:sqlite").Database,
  log: { info(...a: unknown[]): void; error(...a: unknown[]): void },
) => Promise<void>;

let storeSbvSnapshot: typeof import("../infrastructure/fetchers/sbv.js").storeSbvSnapshot;
let getLatestSbvRatesRow: typeof import("../infrastructure/fetchers/sbv.js").getLatestSbvRatesRow;
let testDb: import("bun:sqlite").Database;

const GOOD_SNAPSHOT = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  usdVndOfficial: 26115,
  discountRatePct: 1.5,
  maxDepositRatePct: 5.0,
  maxLendingRatePct: 12.0,
  interbankOvernightPct: 4.0,
  fetchedAt: "2026-07-27T08:00:00.000Z",
};

beforeAll(async () => {
  const { initDatabase, getDb, closeDb } = await import("../infrastructure/db/schema.js");
  // Full isolation from any other test file's writes to the shared `:memory:`
  // singleton (sbv_rates has no per-test seam otherwise) — mirrors
  // sbvRatesJob.test.ts's own beforeEach convention.
  closeDb();
  initDatabase();
  testDb = getDb();

  const mod = await import("../interface/mcp/routes/pushSbvRatesHandler.js");
  handlePushSbvRates = mod.handlePushSbvRates;

  const sbvMod = await import("../infrastructure/fetchers/sbv.js");
  storeSbvSnapshot = sbvMod.storeSbvSnapshot;
  getLatestSbvRatesRow = sbvMod.getLatestSbvRatesRow;
});

afterAll(() => {
  try {
    testDb?.close();
  } catch {
    // ignore
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FIX-SBV-FETCHER-ZERO-VALUE-EMIT — /api/push-sbv-rates carry-forward merge", () => {
  // TC-05a: no prior row on a fresh table
  it("TC-05a: getLatestSbvRatesRow returns null when no row exists yet", () => {
    expect(getLatestSbvRatesRow(testDb)).toBeNull();
  });

  // TC-01: first-ever write, VPS-shaped payload → 200, optional fields land as 0
  // (no prior row to merge from — matches storeSbvSnapshot's own
  // first-write-allows-zero contract, exercised via the real HTTP handler path)
  it("TC-01: first-ever VPS-shaped push (usdVndOfficial only) → 200, no prior row to merge", async () => {
    const payload = JSON.stringify({ usdVndOfficial: "26050", fetchedAt: GOOD_SNAPSHOT.fetchedAt });
    const req = makeReq(payload);
    const res = makeRes();
    const log = makeCapturingLog();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, log);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.usdVnd).toBe(26050);
    expect(log.calls.error.length).toBe(0);

    const row = testDb
      .query<{ overnight_rate_pct: number; max_deposit_rate_pct: number }, []>(
        "SELECT overnight_rate_pct, max_deposit_rate_pct FROM sbv_rates WHERE source = 'sbv'",
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.overnight_rate_pct).toBe(0);
    expect(row!.max_deposit_rate_pct).toBe(0);
  });

  // TC-05b: real row now exists — mapped fields match what TC-01 wrote
  it("TC-05b: getLatestSbvRatesRow maps the real row after a write", () => {
    const row = getLatestSbvRatesRow(testDb);
    expect(row).not.toBeNull();
    expect(row!.usdVndOfficial).toBe(26050);
    expect(row!.overnightRatePct).toBe(0);
  });

  // TC-02: VPS-shaped payload AFTER a good prior row exists → optional fields
  // MERGE from the prior row instead of defaulting to 0.
  it("TC-02: VPS-shaped push after a good prior row merges optional fields (no rejected-zero event)", async () => {
    // Seed a good row directly (simulates the dedicated 4h sbvRatesJob cron
    // having already populated real, positive optional-field values).
    storeSbvSnapshot(GOOD_SNAPSHOT, testDb);

    // A real VPS push only ever carries usdVndOfficial + fetchedAt.
    const payload = JSON.stringify({
      usdVndOfficial: "26200",
      fetchedAt: "2026-07-28T09:00:00.000Z",
    });
    const req = makeReq(payload);
    const res = makeRes();
    const log = makeCapturingLog();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, log);

    // Must NOT be rejected — this is the exact false-positive-rejection bug.
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.skipped).toBeUndefined();
    expect(log.calls.error.length).toBe(0);
    expect(log.calls.info.length).toBe(1);

    const row = testDb
      .query<Record<string, number>, []>(
        `SELECT overnight_rate_pct, refinancing_rate_pct, usd_vnd_official,
                discount_rate_pct, max_deposit_rate_pct, max_lending_rate_pct,
                interbank_overnight_pct
         FROM sbv_rates WHERE source = 'sbv'`,
      )
      .get();
    expect(row).not.toBeNull();
    // FX rate is the freshly-pushed value...
    expect(row!.usd_vnd_official).toBe(26200);
    // ...every omitted optional field carried forward from the prior good row,
    // NOT defaulted to 0.
    expect(row!.overnight_rate_pct).toBe(GOOD_SNAPSHOT.overnightRatePct);
    expect(row!.refinancing_rate_pct).toBe(GOOD_SNAPSHOT.refinancingRatePct);
    expect(row!.discount_rate_pct).toBe(GOOD_SNAPSHOT.discountRatePct);
    expect(row!.max_deposit_rate_pct).toBe(GOOD_SNAPSHOT.maxDepositRatePct);
    expect(row!.max_lending_rate_pct).toBe(GOOD_SNAPSHOT.maxLendingRatePct);
    expect(row!.interbank_overnight_pct).toBe(GOOD_SNAPSHOT.interbankOvernightPct);
  });

  // TC-03 / TC-04: an EXPLICIT 0 (not an omission) must still trip the real
  // guard, and the handler must honestly report the rejection instead of a
  // false-positive "stored" 200.
  it("TC-03: explicit 0 for a sentinel field is passed through (not merged) and correctly rejected", async () => {
    // Re-seed a known-good row (independent of TC-02's mutated state).
    storeSbvSnapshot(GOOD_SNAPSHOT, testDb);

    const payload = JSON.stringify({
      usdVndOfficial: "26300",
      overnightRatePct: "0", // EXPLICIT zero, not omitted
      fetchedAt: "2026-07-28T10:00:00.000Z",
    });
    const req = makeReq(payload);
    const res = makeRes();
    const log = makeCapturingLog();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, log);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(false);
    expect(parsed.skipped).toBe(true);
    expect(parsed.zeroColumns).toContain("overnight_rate_pct");

    // log.error (not log.info) must fire — no false-positive "stored" line.
    expect(log.calls.error.length).toBe(1);
    expect(log.calls.info.length).toBe(0);
  });

  it("TC-04: on a guard-rejected write, the prior good row is left untouched", async () => {
    storeSbvSnapshot(GOOD_SNAPSHOT, testDb);

    const payload = JSON.stringify({
      usdVndOfficial: "26400",
      maxDepositRatePct: "0", // EXPLICIT zero over a good prior positive value
      fetchedAt: "2026-07-28T11:00:00.000Z",
    });
    const req = makeReq(payload);
    const res = makeRes();
    const log = makeCapturingLog();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, log);

    const parsed = JSON.parse(res.body);
    expect(parsed.skipped).toBe(true);

    const row = testDb
      .query<{ usd_vnd_official: number; max_deposit_rate_pct: number; fetched_at: string }, []>(
        "SELECT usd_vnd_official, max_deposit_rate_pct, fetched_at FROM sbv_rates WHERE source = 'sbv'",
      )
      .get();
    expect(row).not.toBeNull();
    // Prior good row untouched — the rejected write never landed.
    expect(row!.usd_vnd_official).toBe(GOOD_SNAPSHOT.usdVndOfficial);
    expect(row!.max_deposit_rate_pct).toBe(GOOD_SNAPSHOT.maxDepositRatePct);
    expect(row!.fetched_at).toBe(GOOD_SNAPSHOT.fetchedAt);
  });
});

describe("FIX-SBV-FETCHER-ZERO-VALUE-EMIT — intelligenceCycleJob.ts step A2 pre-flight guard wiring", () => {
  it("TC-06: step A2's macroFetchFn default routes SBV through runSbvRatesRefreshJob, not a bare storeSbvSnapshot call", () => {
    const srcPath = resolve(
      import.meta.dir,
      "../scheduler/news-analysis/intelligenceCycleJob.ts",
    );
    const src = readFileSync(srcPath, "utf-8");

    const stepStart = src.indexOf("// Step A2: Fetch macro data");
    expect(stepStart).toBeGreaterThan(-1);
    const stepEnd = src.indexOf("// Step A2.5:", stepStart);
    expect(stepEnd).toBeGreaterThan(stepStart);
    const stepBody = src.slice(stepStart, stepEnd);

    // Must import + call the guarded job, not fetchSbvRates/storeSbvSnapshot directly.
    expect(stepBody).toContain("runSbvRatesRefreshJob");
    expect(stepBody).not.toMatch(/storeSbvSnapshot\s*\(/);
    expect(stepBody).not.toMatch(/fetchSbvRates\s*\(/);

    // Must check the return value (zeroRateSkipped), not ignore it.
    expect(stepBody).toContain("zeroRateSkipped");
  });
});
