/**
 * FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE — T-1
 *
 * Shared bounded-fetch utility for ALL mcp-server fetch sites.
 *
 * Exports:
 *   - withDeadline<T>    — AbortController + setTimeout + clearTimeout primitive
 *   - macroFetch<T>      — discriminated-result wrapper for the macro-indicators HTTP proxy cluster
 *   - DeadlineError      — typed error thrown by withDeadline on abort
 *   - DegradeEnvelope    — ok:false payload type for macroFetch callers
 *
 * DDD layer: infrastructure/fetchers — MUST NOT import from domain/, application/, or interface/.
 * Uses console.error (Bun global) — NO logger import (NFR-1).
 *
 * @module infrastructure/fetchers/fetchDeadline
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated degrade envelope returned by macroFetch on ok:false.
 * reason:
 *   'deadline'   — AbortController fired (DeadlineError thrown by withDeadline)
 *   'http-error' — HTTP response was received but status was not 2xx
 *   'network'    — fetch threw a non-abort network error
 */
export type DegradeEnvelope = {
  reason: "deadline" | "http-error" | "network";
  status?: number;
  label: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// DeadlineError
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by withDeadline when the AbortController fires.
 *
 * Callers discriminate with:
 *   `err instanceof DeadlineError`
 * or:
 *   `err.name === 'DeadlineError'`
 *
 * The message carries the attribution text so outer catch blocks surface it
 * even when they only log err.message.
 */
export class DeadlineError extends Error {
  readonly label: string;
  readonly deadlineMs: number;

  constructor(label: string, ms: number) {
    super(`[withDeadline][${label}] fetch aborted after ${ms}ms`);
    this.name = "DeadlineError";
    this.label = label;
    this.deadlineMs = ms;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// withDeadline<T>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps an async fetch callback with an AbortController deadline.
 *
 * - Creates one AbortController per call (no shared state between concurrent callers).
 * - Arms a setTimeout(ms) that calls controller.abort() when the deadline fires.
 * - In the finally block: clearTimeout(timerId) — always cleans up on fast paths (EC-1).
 * - On abort: console.error attribution fires immediately (before re-throw) so the
 *   log appears even when an outer catch silences the error (FR-6).
 * - On abort: throws DeadlineError (typed, subclass of Error) — callers discriminate
 *   with instanceof DeadlineError (ARCH-RATIFY-W2-1).
 * - On non-abort errors: propagates unchanged (network errors reach the caller's catch).
 *
 * AbortError discrimination: err.name === 'AbortError' — NOT instanceof DOMException
 * (ARCH-RATIFY-W2-2: codebase-established convention, stable across Bun versions).
 *
 * Deadline values are supplied by callers — all must be < 60_000ms (NFR-2).
 * withDeadline itself has NO hardcoded timeout and NO per-host/per-ticker branch (NFR-3).
 *
 * @param fn        Async callback that receives the AbortSignal and returns Promise<T>
 * @param ms        Deadline in milliseconds (caller-supplied; must be < 60_000)
 * @param label     Human-readable label for attribution logging and DeadlineError.message
 * @returns         The resolved value of fn(signal)
 * @throws          DeadlineError when the deadline fires before fn resolves
 * @throws          Any non-abort error from fn (propagated unchanged)
 */
export async function withDeadline<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), ms);

  try {
    return await fn(controller.signal);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      // Abort attribution fires at abort-time (before re-throw) so it appears
      // in the log even when the outer catch is silent (FR-6 / NFR-1).
      console.error(`[withDeadline][${label}] fetch aborted after ${ms}ms`);
      throw new DeadlineError(label, ms);
    }
    // Network or other errors propagate unchanged to the caller's catch.
    throw err;
  } finally {
    // NFR-4: always clear the timer — prevents timer leak on fast paths (EC-1).
    clearTimeout(timerId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// macroFetch<T>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated-result fetch wrapper for the macro-indicators HTTP proxy cluster.
 *
 * Wraps withDeadline + HTTP POST + response.json() into a single call that
 * returns `{ ok: true; data: T }` on success or `{ ok: false; degrade: DegradeEnvelope }`
 * on any failure — callers need no try/catch.
 *
 * RISK-1 (DDD): macroFetch must NOT import getMacroBaseUrl() from interface/.
 * Callers pass baseUrl as the first parameter (Option A — ARCH-RATIFIED).
 *
 * DegradeEnvelope.reason:
 *   'deadline'   — AbortController fired (DeadlineError from withDeadline)
 *   'http-error' — HTTP response received but status was not 2xx
 *   'network'    — fetch threw a non-abort network error
 *
 * On ok:false: emits one console.error attribution line (NFR-1).
 * NEVER returns fabricated data — ok:false is the only honest degrade (FR-6).
 *
 * @param baseUrl    Full base URL of the macro-indicators service (passed by caller)
 * @param path       Path appended to baseUrl (e.g. '/snapshot', '/trade-balance')
 * @param body       Request body (JSON-serializable)
 * @param opts       { deadlineMs: number } — must be < 60_000
 */
export async function macroFetch<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  opts: { deadlineMs: number },
): Promise<{ ok: true; data: T } | { ok: false; degrade: DegradeEnvelope }> {
  const url = `${baseUrl}${path}`;
  const label = `macroFetch${path}`;

  let response: Response;

  try {
    response = await withDeadline(
      (signal) =>
        fetch(url, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        }),
      opts.deadlineMs,
      label,
    );
  } catch (err: unknown) {
    if (err instanceof DeadlineError) {
      const degrade: DegradeEnvelope = { reason: "deadline", label };
      console.error(`[macroFetch][${path}] degrade: deadline`);
      return { ok: false, degrade };
    }
    // Network error (not an abort)
    const degrade: DegradeEnvelope = { reason: "network", label };
    console.error(`[macroFetch][${path}] degrade: network`);
    return { ok: false, degrade };
  }

  if (!response.ok) {
    const degrade: DegradeEnvelope = { reason: "http-error", status: response.status, label };
    console.error(`[macroFetch][${path}] degrade: http-error status=${response.status}`);
    return { ok: false, degrade };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}
