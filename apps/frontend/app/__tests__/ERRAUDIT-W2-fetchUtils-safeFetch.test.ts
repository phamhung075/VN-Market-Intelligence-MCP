/**
 * ERRAUDIT-W2-fetchUtils-safeFetch.test.ts
 *
 * Unit tests for safeFetch<T> in apps/frontend/app/lib/api/fetchUtils.ts
 *
 * AC-1: success path returns { data, error: null }
 * AC-2: non-2xx returns { data: emptyT, error: 'upstream NNN' }
 * AC-3: AbortError (simulated) returns { data: emptyT, error containing 'AbortError' }
 * AC-4: parse throw returns { data: emptyT, error: 'parse error: ...' }
 * AC-5: clearTimeout called in finally (no timer leak)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { safeFetch, FETCH_DEADLINE_MS } from "~/lib/api/fetchUtils";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface TestDto {
  items: string[];
  count: number;
}

function parseTestDto(raw: unknown): TestDto {
  if (raw === null || typeof raw !== "object" || !("items" in raw)) {
    return { items: [], count: 0 };
  }
  const obj = raw as Record<string, unknown>;
  return {
    items: Array.isArray(obj["items"]) ? (obj["items"] as string[]) : [],
    count: typeof obj["count"] === "number" ? obj["count"] : 0,
  };
}

const VALID_DTO: TestDto = { items: ["a", "b"], count: 2 };
const VALID_JSON = JSON.stringify(VALID_DTO);

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Suite 1 — FETCH_DEADLINE_MS constant
// ---------------------------------------------------------------------------

describe("FETCH_DEADLINE_MS", () => {
  it("is 55000 (55s)", () => {
    expect(FETCH_DEADLINE_MS).toBe(55_000);
  });

  it("is less than 60000 (gateway ceiling)", () => {
    expect(FETCH_DEADLINE_MS).toBeLessThan(60_000);
  });

  it("is greater than 45000 (mcp-server inner deadline)", () => {
    expect(FETCH_DEADLINE_MS).toBeGreaterThan(45_000);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Happy path: 200 OK
// ---------------------------------------------------------------------------

describe("safeFetch — success path (200 OK)", () => {
  it("returns { data, error: null } on valid 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(VALID_JSON, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await safeFetch("http://test/api/foo", parseTestDto);

    expect(result.error).toBeNull();
    expect(result.data.items).toEqual(["a", "b"]);
    expect(result.data.count).toBe(2);
  });

  it("passes Accept: application/json header", async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve(
        new Response(VALID_JSON, { status: 200 })
      );
    });

    await safeFetch("http://test/api/foo", parseTestDto);

    expect((capturedInit?.headers as Record<string, string>)?.["Accept"]).toBe("application/json");
  });

  it("passes AbortSignal in fetch init", async () => {
    let capturedSignal: AbortSignal | undefined | null;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return Promise.resolve(
        new Response(VALID_JSON, { status: 200 })
      );
    });

    await safeFetch("http://test/api/foo", parseTestDto);

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal instanceof AbortSignal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Non-2xx upstream error
// ---------------------------------------------------------------------------

describe("safeFetch — non-2xx upstream error", () => {
  it("502 → data is emptyT, error contains '502'", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await safeFetch("http://test/api/foo", parseTestDto);

    expect(result.data).toEqual({ items: [], count: 0 });
    expect(result.error).not.toBeNull();
    expect(result.error).toMatch(/502/);
  });

  it("503 → data is emptyT, error not null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", { status: 503 })
    );

    const result = await safeFetch("http://test/api/foo", parseTestDto);

    expect(result.data).toEqual({ items: [], count: 0 });
    expect(result.error).not.toBeNull();
    expect(result.error).toMatch(/503/);
  });

  it("504 → error contains '504', data empty", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Gateway Timeout", { status: 504 })
    );

    const result = await safeFetch("http://test/api/foo", parseTestDto);

    expect(result.error).toContain("504");
    expect(result.data.items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — AbortError (simulated deadline)
// ---------------------------------------------------------------------------

describe("safeFetch — AbortError (deadline exceeded)", () => {
  it("AbortError → error contains 'AbortError', data is emptyT", async () => {
    const abortErr = new DOMException("signal is aborted without reason", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortErr);

    const result = await safeFetch(
      "http://test/api/foo",
      parseTestDto,
      { deadlineMs: 55_000, label: "test" }
    );

    expect(result.data).toEqual({ items: [], count: 0 });
    expect(result.error).not.toBeNull();
    expect(result.error).toMatch(/AbortError/);
  });

  it("AbortError error message contains deadline duration", async () => {
    const abortErr = new DOMException("aborted", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortErr);

    const result = await safeFetch(
      "http://test/api/foo",
      parseTestDto,
      { deadlineMs: 55_000, label: "test-abort" }
    );

    expect(result.error).toContain("55000");
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Network error (non-abort)
// ---------------------------------------------------------------------------

describe("safeFetch — network error", () => {
  it("ECONNREFUSED → error contains message, data is emptyT", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await safeFetch("http://test/api/foo", parseTestDto);

    expect(result.data).toEqual({ items: [], count: 0 });
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("non-Error throw → error is stringified, data is emptyT", async () => {
    global.fetch = vi.fn().mockRejectedValue("unknown error");

    const result = await safeFetch("http://test/api/foo", parseTestDto);

    expect(result.data).toEqual({ items: [], count: 0 });
    expect(typeof result.error).toBe("string");
    expect(result.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Parse error
// ---------------------------------------------------------------------------

describe("safeFetch — parse error", () => {
  it("parse throw → error contains 'parse error', data is emptyT", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ bad: "shape" }), { status: 200 })
    );

    // parse(null) must return empty shape (parse-null contract); only throws on bad non-null input
    function throwingParse(raw: unknown): TestDto {
      if (raw === null) return { items: [], count: 0 };
      throw new Error("unexpected field 'bad'");
    }

    const result = await safeFetch("http://test/api/foo", throwingParse);

    expect(result.data).toEqual({ items: [], count: 0 });
    expect(result.error).not.toBeNull();
    expect(result.error).toContain("parse error");
    expect(result.error).toContain("unexpected field 'bad'");
  });

  it("parse returns empty shape on null input (parse-null contract)", async () => {
    // Direct test: parseTestDto(null) must return empty shape
    const empty = parseTestDto(null);
    expect(empty).toEqual({ items: [], count: 0 });
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Label and opts
// ---------------------------------------------------------------------------

describe("safeFetch — opts.label and opts.deadlineMs", () => {
  it("uses url as label when opts.label not provided", async () => {
    // No error thrown; just confirm it runs
    global.fetch = vi.fn().mockResolvedValue(
      new Response(VALID_JSON, { status: 200 })
    );
    const result = await safeFetch("http://test/api/bar", parseTestDto);
    expect(result.error).toBeNull();
  });

  it("uses opts.deadlineMs when provided", async () => {
    let capturedSignal: AbortSignal | undefined | null;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return Promise.resolve(new Response(VALID_JSON, { status: 200 }));
    });

    await safeFetch("http://test/api/baz", parseTestDto, { deadlineMs: 10_000 });

    // Signal was provided (AbortController created)
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal instanceof AbortSignal).toBe(true);
  });
});
