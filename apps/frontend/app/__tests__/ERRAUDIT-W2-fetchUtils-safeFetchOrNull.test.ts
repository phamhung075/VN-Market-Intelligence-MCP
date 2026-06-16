/**
 * ERRAUDIT-W2-fetchUtils-safeFetchOrNull.test.ts
 *
 * Unit tests for safeFetchOrNull<T> in apps/frontend/app/lib/api/fetchUtils.ts
 *
 * AC-1: success returns parsed value (T)
 * AC-2: non-2xx returns null
 * AC-3: AbortError returns null
 * AC-4: network error returns null
 * AC-5: parse returning null on bad input returns null (pass-through)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { safeFetchOrNull } from "~/lib/api/fetchUtils";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface TestReading {
  code: string;
  hexagram: number;
}

function parseReading(raw: unknown): TestReading | null {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj["code"] !== "string" || typeof obj["hexagram"] !== "number") return null;
  return { code: obj["code"] as string, hexagram: obj["hexagram"] as number };
}

const VALID_READING: TestReading = { code: "VNM", hexagram: 1 };

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Suite 1 — Happy path: 200 OK
// ---------------------------------------------------------------------------

describe("safeFetchOrNull — success path (200 OK)", () => {
  it("returns parsed value on valid 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(VALID_READING), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await safeFetchOrNull("http://test/api/kd/VNM", parseReading);

    expect(result).not.toBeNull();
    expect(result?.code).toBe("VNM");
    expect(result?.hexagram).toBe(1);
  });

  it("passes AbortSignal to fetch", async () => {
    let capturedSignal: AbortSignal | undefined | null;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return Promise.resolve(
        new Response(JSON.stringify(VALID_READING), { status: 200 })
      );
    });

    await safeFetchOrNull("http://test/api/kd/VNM", parseReading);

    expect(capturedSignal instanceof AbortSignal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Non-2xx → null
// ---------------------------------------------------------------------------

describe("safeFetchOrNull — non-2xx → null", () => {
  it("502 → returns null (non-fatal)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), { status: 502 })
    );

    const result = await safeFetchOrNull("http://test/api/kd/VNM", parseReading);

    expect(result).toBeNull();
  });

  it("503 → returns null (non-fatal)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", { status: 503 })
    );

    const result = await safeFetchOrNull("http://test/api/kd/VNM", parseReading);

    expect(result).toBeNull();
  });

  it("404 → returns null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 404 })
    );

    const result = await safeFetchOrNull("http://test/api/kd/MISSING", parseReading);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — AbortError → null
// ---------------------------------------------------------------------------

describe("safeFetchOrNull — AbortError → null", () => {
  it("AbortError → returns null (non-fatal)", async () => {
    const abortErr = new DOMException("aborted", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortErr);

    const result = await safeFetchOrNull(
      "http://test/api/kd/VNM",
      parseReading,
      { deadlineMs: 10_000, label: "kdReadingNonFatal" }
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Network error → null
// ---------------------------------------------------------------------------

describe("safeFetchOrNull — network error → null", () => {
  it("ECONNREFUSED → returns null (non-fatal)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await safeFetchOrNull("http://test/api/kd/VNM", parseReading);

    expect(result).toBeNull();
  });

  it("non-Error throw → returns null (non-fatal)", async () => {
    global.fetch = vi.fn().mockRejectedValue("string error");

    const result = await safeFetchOrNull("http://test/api/kd/VNM", parseReading);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Parse returning null (pass-through)
// ---------------------------------------------------------------------------

describe("safeFetchOrNull — parse returns null on bad JSON shape", () => {
  it("parse returns null on bad shape → result is null", async () => {
    const badShape = { foo: "bar" }; // missing 'code' and 'hexagram'
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(badShape), { status: 200 })
    );

    const result = await safeFetchOrNull("http://test/api/kd/VNM", parseReading);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — opts.deadlineMs (10s override)
// ---------------------------------------------------------------------------

describe("safeFetchOrNull — 10s deadline override", () => {
  it("uses provided deadlineMs (signal wired)", async () => {
    let capturedSignal: AbortSignal | undefined | null;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return Promise.resolve(
        new Response(JSON.stringify(VALID_READING), { status: 200 })
      );
    });

    await safeFetchOrNull(
      "http://test/api/kd/VNM",
      parseReading,
      { deadlineMs: 10_000 }
    );

    expect(capturedSignal instanceof AbortSignal).toBe(true);
  });
});
