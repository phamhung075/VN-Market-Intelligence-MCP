/**
 * FIX-ERRAUDIT-W2-DEADLINE-UNITTEST — Unit tests for fetchDeadline.ts
 *
 * Parent: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE (epic ERROR-AUDIT-2026-06-15, wave 2).
 * The helper logic was already code-verified via a 6-check audit at T-1 sign-off;
 * this task closes the pure test-hygiene gap qa flagged at W2 sign-off.
 *
 * Covers:
 *   withDeadline<T>
 *     (a) deadline fires -> DeadlineError thrown (label/deadlineMs/name preserved)
 *     (b) fast response -> resolves normally AND clearTimeout cleanup fires (EC-1)
 *     (c) non-abort network error -> rethrown unchanged (not wrapped in DeadlineError)
 *   macroFetch<T>
 *     (d) ok:false on each of the 3 DegradeEnvelope.reason branches:
 *         deadline / http-error / network
 *     (e) ok:true ONLY when response.ok is true (never on a non-2xx response)
 *
 * All tests mock globalThis.fetch (or a fake withDeadline callback for the
 * withDeadline-only tests) — no live network calls.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { withDeadline, macroFetch, DeadlineError } from "../fetchDeadline.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build an AbortError-named Error, matching the shape a real fetch() throws on abort. */
function makeAbortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

/**
 * withDeadline callback that never resolves on its own but rejects with an
 * AbortError as soon as the signal fires — mirrors how a real fetch(url, {signal})
 * call behaves when the deadline's AbortController.abort() runs.
 */
function abortAwareFn<T>(): (signal: AbortSignal) => Promise<T> {
  return (signal: AbortSignal) =>
    new Promise<T>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(makeAbortError()));
    });
}

/** Build a minimal Response-like object for mocking global fetch. */
function makeResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Fetch mock that hangs until the AbortSignal fires, then rejects AbortError. */
function makeHangingFetch(): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(makeAbortError()));
    });
  }) as unknown as typeof fetch;
}

// ─────────────────────────────────────────────────────────────────────────────
// withDeadline<T>
// ─────────────────────────────────────────────────────────────────────────────

describe("withDeadline — (a) deadline fires -> DeadlineError thrown", () => {
  it("rejects with a DeadlineError (not the raw AbortError) once the timer fires", async () => {
    const fn = abortAwareFn<string>();
    await expect(withDeadline(fn, 20, "probe-label")).rejects.toThrow(DeadlineError);
  });

  it("DeadlineError carries the typed name, label, deadlineMs, and attribution message", async () => {
    const fn = abortAwareFn<string>();
    let caught: unknown;
    try {
      await withDeadline(fn, 20, "probe-label");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DeadlineError);
    const err = caught as DeadlineError;
    expect(err.name).toBe("DeadlineError");
    expect(err.label).toBe("probe-label");
    expect(err.deadlineMs).toBe(20);
    expect(err.message).toContain("probe-label");
    expect(err.message).toContain("20ms");
  });

  it("emits a console.error attribution line at abort-time (visible even under a silent outer catch, FR-6)", async () => {
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const fn = abortAwareFn<string>();
      await expect(withDeadline(fn, 20, "attribution-label")).rejects.toThrow(DeadlineError);
      expect(errSpy).toHaveBeenCalledTimes(1);
      const logged = errSpy.mock.calls[0]?.[0] as string;
      expect(logged).toContain("attribution-label");
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("withDeadline — (b) fast response -> clearTimeout cleanup", () => {
  let clearSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    clearSpy = spyOn(globalThis, "clearTimeout");
  });

  afterEach(() => {
    clearSpy.mockRestore();
  });

  it("resolves the callback's value when it settles before the deadline", async () => {
    const fn = async (_signal: AbortSignal) => "fast-value";
    const result = await withDeadline(fn, 5_000, "fast-label");
    expect(result).toBe("fast-value");
  });

  it("clears the deadline timer exactly once on the fast path (EC-1 — no timer leak)", async () => {
    const fn = async (_signal: AbortSignal) => "fast-value";
    await withDeadline(fn, 5_000, "fast-label");
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});

describe("withDeadline — (c) non-abort network error -> rethrown unchanged", () => {
  it("propagates a plain network error unchanged (not wrapped as DeadlineError)", async () => {
    const networkErr = new Error("ECONNREFUSED");
    const fn = async (_signal: AbortSignal): Promise<string> => {
      throw networkErr;
    };
    let caught: unknown;
    try {
      await withDeadline(fn, 5_000, "network-label");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(networkErr); // exact same instance — unwrapped
    expect(caught).not.toBeInstanceOf(DeadlineError);
  });

  it("still clears the timer on the error path (finally always runs)", async () => {
    const clearSpy = spyOn(globalThis, "clearTimeout");
    try {
      const fn = async (_signal: AbortSignal): Promise<string> => {
        throw new Error("some other error");
      };
      await expect(withDeadline(fn, 5_000, "network-label-2")).rejects.toThrow("some other error");
      expect(clearSpy).toHaveBeenCalledTimes(1);
    } finally {
      clearSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// macroFetch<T>
// ─────────────────────────────────────────────────────────────────────────────

describe("macroFetch — (d) ok:false degrade branches", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reason:'deadline' when the AbortController fires before fetch resolves", async () => {
    globalThis.fetch = makeHangingFetch();
    const result = await macroFetch("http://macro.local", "/snapshot", { x: 1 }, { deadlineMs: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.degrade.reason).toBe("deadline");
      expect(result.degrade.label).toBe("macroFetch/snapshot");
      expect(result.degrade.status).toBeUndefined();
    }
  });

  it("reason:'http-error' when the response is received but status is not 2xx", async () => {
    globalThis.fetch = (async () => makeResponse(500, { error: "boom" })) as unknown as typeof fetch;
    const result = await macroFetch("http://macro.local", "/trade-balance", {}, { deadlineMs: 5_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.degrade.reason).toBe("http-error");
      expect(result.degrade.status).toBe(500);
      expect(result.degrade.label).toBe("macroFetch/trade-balance");
    }
  });

  it("reason:'network' when fetch throws a non-abort error", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await macroFetch("http://macro.local", "/cpi", {}, { deadlineMs: 5_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.degrade.reason).toBe("network");
      expect(result.degrade.status).toBeUndefined();
      expect(result.degrade.label).toBe("macroFetch/cpi");
    }
  });
});

describe("macroFetch — (e) ok:true ONLY when response.ok is true", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns ok:true with the parsed JSON body on a 2xx response", async () => {
    const payload = { foo: "bar", n: 42 };
    globalThis.fetch = (async () => makeResponse(200, payload)) as unknown as typeof fetch;
    const result = await macroFetch<typeof payload>(
      "http://macro.local",
      "/snapshot",
      { q: 1 },
      { deadlineMs: 5_000 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(payload);
    }
  });

  it("never returns ok:true for a non-2xx response, even with a well-formed JSON body", async () => {
    globalThis.fetch = (async () => makeResponse(404, { foo: "bar" })) as unknown as typeof fetch;
    const result = await macroFetch("http://macro.local", "/missing", {}, { deadlineMs: 5_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.degrade.reason).toBe("http-error");
    }
  });
});
