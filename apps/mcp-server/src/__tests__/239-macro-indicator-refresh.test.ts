Bun.env["DB_PATH"] = ":memory:";
import { describe, test, expect, beforeAll, afterEach, mock } from "bun:test";
import { initDatabase, getDb } from "../infrastructure/db/schema.js";
import type { Database } from "bun:sqlite";

interface MockHttpClient {
  get(url: string): Promise<string | { status: number; body: string }>;
  post(url: string, data?: unknown): Promise<{ status: number; body: string }>;
}

interface MockCircuitBreaker {
  wrap(fn: () => Promise<unknown>): Promise<unknown>;
}

interface MockRateLimiter {
  checkLimit(host: string): Promise<void>;
}

interface FetchResult {
  success: boolean;
  sourceUsed: string | null;
  indicatorCount: number;
  metadata?: string;
}

describe("Task 239a — macro-indicator-refresh (RED phase)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    await initDatabase();
    db = getDb();
  });

  afterEach(() => {
    // Clean up macro_indicators table between tests
    db.exec("DELETE FROM macro_indicators");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-1: Yahoo success path → 3 indicators stored with proper timestamps
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-1: Yahoo HTTP 200 success → stores 3 indicators (CPI, GDP, interest_rate) with timestamp", async () => {
    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) {
          return JSON.stringify({
            cpi: 105.2,
            gdp_growth: 6.5,
            interest_rate: 4.25,
          });
        }
        throw new Error("Should not reach other sources in success path");
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    // Dynamic import with mock — this test expects the function to exist
    const { fetchAndStoreMacroIndicators } = await import(
      "../application/usecases/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    const result: FetchResult = await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    expect(result.success).toBe(true);
    expect(result.sourceUsed).toBe("yahoo");
    expect(result.indicatorCount).toBe(3);

    // Verify DB writes
    const row = db
      .prepare("SELECT cpi, gdp_growth, interest_rate, fetched_at FROM macro_indicators WHERE country = ?")
      .get("VN") as {cpi: number; gdp_growth: number; interest_rate: number; fetched_at: string} | undefined;
    expect(row).toBeTruthy();
    expect(row?.cpi).toBe(105.2);
    expect(row?.gdp_growth).toBe(6.5);
    expect(row?.interest_rate).toBe(4.25);
    expect(row?.fetched_at).toBeTruthy();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-2: Yahoo HTTP 504 timeout → automatically fallback to SBV without throwing
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-2: Yahoo HTTP 504 timeout → fallback to SBV without throwing", async () => {
    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) {
          throw new Error("504 Gateway Timeout");
        }
        if (url.includes("sbv")) {
          return JSON.stringify({
            interest_rate: 4.0,
            usd_vnd_official: 24500,
          });
        }
        throw new Error("Unexpected URL");
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../application/usecases/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    const result: FetchResult = await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    // Should NOT throw, should fallback to SBV
    expect(result.success).toBe(true);
    expect(result.sourceUsed).toBe("sbv");
    expect(result.indicatorCount).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-3: SBV HTTP 401 Unauthorized → automatically fallback to GSO without throwing
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-3: SBV HTTP 401 Unauthorized → fallback to GSO without throwing", async () => {
    Bun.env.GSO_VPS_ENDPOINT = "https://gso.vn/";
    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) {
          throw new Error("504 Gateway Timeout");
        }
        if (url.includes("sbv")) {
          throw new Error("401 Unauthorized");
        }
        if (url.includes("gso")) {
          return JSON.stringify({
            gdp_growth: 6.2,
            inflation_rate: 4.5,
          });
        }
        throw new Error("Unexpected URL");
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../application/usecases/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    const result: FetchResult = await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    // Should NOT throw, should fallback to GSO
    expect(result.success).toBe(true);
    expect(result.sourceUsed).toBe("gso");
    expect(result.indicatorCount).toBeGreaterThan(0);
    delete Bun.env.GSO_VPS_ENDPOINT;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-4: All three sources fail → returns { success: false, sourceUsed: null, indicatorCount: 0 }
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-4: All sources fail (yahoo=504, sbv=500, gso=timeout) → return success=false, sourceUsed=null", async () => {
    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) {
          throw new Error("504 Gateway Timeout");
        }
        if (url.includes("sbv")) {
          throw new Error("500 Internal Server Error");
        }
        if (url.includes("gso")) {
          throw new Error("ETIMEDOUT: connection timeout");
        }
        throw new Error("Unexpected URL");
      },
      post: async () => ({ status: 500, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../application/usecases/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    const result: FetchResult = await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    expect(result.success).toBe(false);
    expect(result.sourceUsed).toBeNull();
    expect(result.indicatorCount).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-5: SLA check passes: data age ≤ 24h → freshnessSlaChecker() returns true
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-5: SLA check passes when macro data age ≤ 24h → freshnessSlaChecker returns true", async () => {
    // Insert fresh data (1h old)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO macro_indicators (country, cpi, gdp_growth, interest_rate, fetched_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("vietnam", 105.2, 6.5, 4.25, oneHourAgo);

    const { freshnessSlaChecker } = await import(
      "../domain/services/macroIndicatorSla.js"
    ).catch(() => ({
      freshnessSlaChecker: async () => false,
    }));

    const result = await freshnessSlaChecker(db);

    expect(result).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-6: SLA check fails: data age > 24h → escalation alert sent to WORK channel
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-6: SLA check fails when data age > 24h (48h stale) → alert sent to WORK channel", async () => {
    // Insert stale data (48h old)
    const now = new Date();
    const fortyEightHoursAgo = new Date(
      now.getTime() - 48 * 60 * 60 * 1000
    ).toISOString();
    db.prepare(`
      INSERT INTO macro_indicators (country, cpi, gdp_growth, interest_rate, fetched_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("vietnam", 105.2, 6.5, 4.25, fortyEightHoursAgo);

    const alertsSent: Array<{ channel: string; message: string }> = [];
    const mockSendTelegram = mock(
      async (channel: string, message: string) => {
        alertsSent.push({ channel, message });
      }
    );

    const { freshnessSlaChecker } = await import(
      "../domain/services/macroIndicatorSla.js"
    ).catch(() => ({
      freshnessSlaChecker: async () => false,
    }));

    const result = await freshnessSlaChecker(db, mockSendTelegram);

    expect(result).toBe(false);
    // Verify alert was sent to WORK channel with age in hours
    const workAlert = alertsSent.find((a) => a.channel === "work");
    expect(workAlert).toBeTruthy();
    expect(workAlert?.message).toContain("48"); // hours
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-7: last_refresh_job column persists metadata
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-7: last_refresh_job column stores metadata like '2026-04-21T06:05:12Z — yahoo (3 cols)'", async () => {
    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) {
          return JSON.stringify({
            cpi: 105.2,
            gdp_growth: 6.5,
            interest_rate: 4.25,
          });
        }
        throw new Error("Unexpected URL");
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../application/usecases/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    // Verify last_refresh_job column exists and contains metadata
    const row = db
      .prepare("SELECT last_refresh_job FROM macro_indicators WHERE country = ?")
      .get("VN") as {last_refresh_job: string} | undefined;

    expect(row).toBeTruthy();
    expect(row?.last_refresh_job).toBeTruthy();
    expect(row?.last_refresh_job).toContain("yahoo");
    expect(row?.last_refresh_job).toContain("3"); // number of columns
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-8: Circuit breaker wraps every HTTP call
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-8: Circuit breaker wraps every HTTP call (no naked fetch)", async () => {
    let cbWrapCalls = 0;

    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) {
          return JSON.stringify({
            cpi: 105.2,
            gdp_growth: 6.5,
            interest_rate: 4.25,
          });
        }
        throw new Error("Unexpected URL");
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => {
        cbWrapCalls++;
        return fn();
      },
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../application/usecases/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    // Circuit breaker should be called at least once per HTTP source attempt
    expect(cbWrapCalls).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-9: Rate limiter called exactly 3 times (once per source)
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-9: Rate limiter called exactly 3 times (once per source: yahoo, sbv, gso)", async () => {
    let rateLimiterCalls = 0;

    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) {
          return JSON.stringify({
            cpi: 105.2,
            gdp_growth: 6.5,
            interest_rate: 4.25,
          });
        }
        throw new Error("Unexpected URL");
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async (host: string) => {
        rateLimiterCalls++;
      },
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../application/usecases/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    // All 3 sources should be attempted in fallback chain
    expect(rateLimiterCalls).toBe(3);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-11a: Opaque GSO HTML (no CPI/GDP patterns) → graceful all-failed
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-11a: GSO returns opaque HTML with no CPI/GDP patterns → graceful all-failed", async () => {
    delete Bun.env.GSO_VPS_ENDPOINT;
    let gsoFetchAttempted = false;

    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) throw new Error("yahoo fail");
        if (url.includes("sbv")) throw new Error("sbv fail");
        gsoFetchAttempted = true;
        return "<html><body>Trang chủ GSO</body></html>";
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../application/usecases/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    const result: FetchResult = await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    expect(gsoFetchAttempted).toBe(true);
    expect(result.success).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-11b: GSO HTML contains CPI + GDP patterns → sourceUsed=gso, stored in DB
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-11b: GSO HTML contains CPI+GDP patterns → success=true, sourceUsed=gso, DB row stored", async () => {
    Bun.env.GSO_VPS_ENDPOINT = "https://gso.vn/";

    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) throw new Error("yahoo fail");
        if (url.includes("sbv")) throw new Error("sbv fail");
        return "<html><body><td>CPI</td><td>103.45</td><td>GDP</td><td>6.93</td></body></html>";
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../application/usecases/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    const result: FetchResult = await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    expect(result.success).toBe(true);
    expect(result.sourceUsed).toBe("gso");
    expect(result.indicatorCount).toBeGreaterThanOrEqual(1);

    const row = db
      .prepare("SELECT cpi, gdp_growth FROM macro_indicators WHERE country = ?")
      .get("VN") as { cpi: number; gdp_growth: number } | undefined;
    expect(row).toBeTruthy();
    expect(row?.cpi).toBeCloseTo(103.45, 2);
    expect(row?.gdp_growth).toBeCloseTo(6.93, 2);

    delete Bun.env.GSO_VPS_ENDPOINT;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-12a: Opaque HTML → console.error called with parse-failure message
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-12a: opaque GSO HTML → console.error emits 'no CPI/GDP patterns matched'", async () => {
    Bun.env.GSO_VPS_ENDPOINT = "https://gso.vn/";
    const errorMessages: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => { errorMessages.push(String(args[0])); };

    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) throw new Error("yahoo fail");
        if (url.includes("sbv")) throw new Error("sbv fail");
        return "<html><body>Trang chu GSO</body></html>";
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../domain/services/macro/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    // restore console.error BEFORE assertions
    console.error = origError;
    delete Bun.env.GSO_VPS_ENDPOINT;

    expect(errorMessages.some((m) => m.includes("no CPI/GDP patterns matched"))).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-12b: Variant 1 — number before CPI label → success=true, sourceUsed=gso
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-12b: GSO Variant 1 HTML (number before label) → success=true, sourceUsed=gso", async () => {
    Bun.env.GSO_VPS_ENDPOINT = "https://gso.vn/";
    // HTML fixture: number in <td> before <th>CPI</th>
    const html = "<table><tr><td>103.45</td><th>CPI</th></tr></table>";

    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) throw new Error("yahoo fail");
        if (url.includes("sbv")) throw new Error("sbv fail");
        return html;
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../domain/services/macro/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    const result: FetchResult = await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    delete Bun.env.GSO_VPS_ENDPOINT;

    expect(result.success).toBe(true);
    expect(result.sourceUsed).toBe("gso");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-12c: Variant 2 — data-value attr near GDP → indicatorCount >= 1
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-12c: GSO Variant 2 HTML (data-value near GDP) → indicatorCount >= 1", async () => {
    Bun.env.GSO_VPS_ENDPOINT = "https://gso.vn/";
    const html = '<td><span data-value="6.93">GDP tăng trưởng</span></td>';

    const mockHttpClient: MockHttpClient = {
      get: async (url: string) => {
        if (url.includes("yahoo")) throw new Error("yahoo fail");
        if (url.includes("sbv")) throw new Error("sbv fail");
        return html;
      },
      post: async () => ({ status: 200, body: "" }),
    };

    const mockCircuitBreaker: MockCircuitBreaker = {
      wrap: async (fn: () => Promise<unknown>) => fn(),
    };

    const mockRateLimiter: MockRateLimiter = {
      checkLimit: async () => undefined,
    };

    const { fetchAndStoreMacroIndicators } = await import(
      "../domain/services/macro/macroIndicatorFetcher.js"
    ).catch(() => ({
      fetchAndStoreMacroIndicators: async () => ({
        success: false,
        sourceUsed: null,
        indicatorCount: 0,
      }),
    }));

    const result: FetchResult = await fetchAndStoreMacroIndicators(
      db,
      mockHttpClient,
      mockCircuitBreaker,
      mockRateLimiter
    );

    delete Bun.env.GSO_VPS_ENDPOINT;

    expect(result.indicatorCount).toBeGreaterThanOrEqual(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC-10: Startup stale-data detection: alert includes "STALE" tag if > 24h old
  // ──────────────────────────────────────────────────────────────────────────
  test("AC-10: Startup stale-data detection: if macro table data > 24h old, alert includes STALE tag", async () => {
    // Insert stale data (36h old)
    const now = new Date();
    const thirtyixHoursAgo = new Date(
      now.getTime() - 36 * 60 * 60 * 1000
    ).toISOString();
    db.prepare(`
      INSERT INTO macro_indicators (country, cpi, gdp_growth, interest_rate, fetched_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("vietnam", 105.2, 6.5, 4.25, thirtyixHoursAgo);

    const alertsSent: Array<{ tag: string; message: string }> = [];
    const mockSendTelegram = mock(
      async (channel: string, message: string, options?: { tag?: string }) => {
        alertsSent.push({ tag: options?.tag || "", message });
      }
    );

    const { detectStartupStaleData } = await import(
      "../domain/services/macroIndicatorSla.js"
    ).catch(() => ({
      detectStartupStaleData: async () => undefined,
    }));

    await detectStartupStaleData(db, mockSendTelegram);

    // Verify alert was sent with STALE tag
    const staleAlert = alertsSent.find((a) => a.tag.includes("STALE"));
    expect(staleAlert).toBeTruthy();
  });
});
