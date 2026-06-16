/**
 * Frontend fetch deadline constants and helpers.
 *
 * FETCH_DEADLINE_MS = 55s:
 *   - Below 60s gateway ceiling (ensures frontend abort fires before gateway)
 *   - Above 45s mcp-server bctcPdfPullJob inner deadline (ensures inner hop degrades first)
 *   - Single SSOT — no per-route, per-host, or per-ticker overrides except documented ones
 *
 * Mirrors the mcp-server withDeadline pattern from FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE.
 *
 * Three helpers:
 *   - safeFetch<T>        — dashboard loaders (returns { data, error })
 *   - proxyUpstream       — api.*.tsx proxy routes (returns Response)
 *   - safeFetchOrNull<T>  — non-fatal client wrappers (returns T | null)
 */

export const FETCH_DEADLINE_MS = 55_000;

// ── safeFetch<T> ── dashboard loaders ────────────────────────────────────────

/**
 * Bounded fetch for Remix dashboard loaders.
 *
 * - Applies an AbortController deadline (default: FETCH_DEADLINE_MS = 55s).
 * - On any failure (network error, non-2xx, parse error, deadline):
 *     · Logs one structured console.error with [safeFetch][label] prefix.
 *     · Returns { data: parse(null), error: string }.
 * - parse(null) MUST return the empty-shape struct for the caller's type T.
 * - On success: returns { data: parse(raw), error: null }.
 *
 * RISK-3 guard: timer declared as ReturnType<typeof setTimeout> to avoid
 * NodeJS.Timeout vs number ambiguity under @remix-run/node + ES2022 lib.
 */
export async function safeFetch<T>(
  url: string,
  parse: (raw: unknown) => T,
  opts?: { deadlineMs?: number; label?: string },
): Promise<{ data: T; error: string | null }> {
  const deadlineMs = opts?.deadlineMs ?? FETCH_DEADLINE_MS;
  const label = opts?.label ?? url;
  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | undefined;

  try {
    timerId = setTimeout(() => controller.abort(), deadlineMs);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      const msg = `upstream ${response.status}`;
      console.error(`[safeFetch][${label}] ${msg}`);
      const emptyData = parse(null);
      return { data: emptyData, error: msg };
    }

    const raw = (await response.json()) as unknown;
    try {
      const data = parse(raw);
      return { data, error: null };
    } catch (parseErr) {
      const msg =
        parseErr instanceof Error ? parseErr.message : "parse error";
      console.error(`[safeFetch][${label}] parse error: ${msg}`);
      const emptyData = parse(null);
      return { data: emptyData, error: `parse error: ${msg}` };
    }
  } catch (err) {
    // Use name check only — DOMException.name === 'AbortError' is reliable
    // across jsdom / Node / browser; instanceof Error may fail in jsdom for DOMException.
    const isAbort =
      (err instanceof Error && err.name === "AbortError") ||
      (err !== null &&
        typeof err === "object" &&
        (err as { name?: unknown }).name === "AbortError");
    const msg = isAbort
      ? `AbortError: fetch aborted after ${deadlineMs}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    console.error(`[safeFetch][${label}] ${msg}`);
    const emptyData = parse(null);
    return { data: emptyData, error: msg };
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}

// ── proxyUpstream ── api.*.tsx proxy routes ───────────────────────────────────

/**
 * Bounded transparent proxy for api.*.tsx resource routes.
 *
 * - Applies an AbortController deadline (default: FETCH_DEADLINE_MS = 55s).
 * - On AbortError (deadline): returns 504 { error: 'upstream timeout' }.
 * - On network error: returns 502 { error: message }.
 * - On success: relays upstream response body (binary-safe via arrayBuffer)
 *   and Content-Type header verbatim.
 *
 * Callers build the upstream URL (with query params) before calling;
 * proxyUpstream does NOT forward params from the incoming request.
 */
export async function proxyUpstream(
  upstream: string,
  init?: RequestInit,
  opts?: { deadlineMs?: number; label?: string },
): Promise<Response> {
  const deadlineMs = opts?.deadlineMs ?? FETCH_DEADLINE_MS;
  const label = opts?.label ?? upstream;
  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | undefined;

  try {
    timerId = setTimeout(() => controller.abort(), deadlineMs);
    const upstreamResponse = await fetch(upstream, {
      ...init,
      signal: controller.signal,
    });

    // Relay upstream response as-is (binary-safe via arrayBuffer).
    const upstreamContentType =
      upstreamResponse.headers.get("Content-Type") ?? "application/json";
    const body = await upstreamResponse.arrayBuffer();

    return new Response(body, {
      status: upstreamResponse.status,
      headers: { "Content-Type": upstreamContentType },
    });
  } catch (err) {
    // Use name check only — DOMException.name === 'AbortError' is reliable
    // across jsdom / Node / browser; instanceof Error may fail in jsdom for DOMException.
    const isAbort =
      (err instanceof Error && err.name === "AbortError") ||
      (err !== null &&
        typeof err === "object" &&
        (err as { name?: unknown }).name === "AbortError");
    if (isAbort) {
      console.error(
        `[proxyUpstream][${label}] timeout after ${deadlineMs}ms`,
      );
      return new Response(JSON.stringify({ error: "upstream timeout" }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
      });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[proxyUpstream][${label}] network error: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}

// ── safeFetchOrNull<T> ── non-fatal client wrappers ──────────────────────────

/**
 * Bounded non-fatal fetch for optional enrichment (Cluster C).
 *
 * - Applies an AbortController deadline (default: FETCH_DEADLINE_MS = 55s).
 * - On ANY failure (network, non-2xx, deadline): logs one console.error and
 *   returns null. Callers rely on null to degrade gracefully (no crash).
 * - On success: returns parse(raw) — parse may return null for bad shapes.
 *
 * IMPORTANT: Do not pass a Cluster C function a separate AbortController.
 * This function creates its own controller internally.
 */
export async function safeFetchOrNull<T>(
  url: string,
  parse: (raw: unknown) => T | null,
  opts?: { deadlineMs?: number; label?: string },
): Promise<T | null> {
  const deadlineMs = opts?.deadlineMs ?? FETCH_DEADLINE_MS;
  const label = opts?.label ?? url;
  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | undefined;

  try {
    timerId = setTimeout(() => controller.abort(), deadlineMs);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      const msg = `upstream ${response.status}`;
      console.error(`[safeFetchOrNull][${label}] ${msg}`);
      return null;
    }

    const raw = (await response.json()) as unknown;
    return parse(raw);
  } catch (err) {
    // Use name check only — DOMException.name === 'AbortError' is reliable
    // across jsdom / Node / browser; instanceof Error may fail in jsdom for DOMException.
    const isAbort =
      (err instanceof Error && err.name === "AbortError") ||
      (err !== null &&
        typeof err === "object" &&
        (err as { name?: unknown }).name === "AbortError");
    const name = isAbort
      ? "AbortError"
      : err instanceof Error
        ? err.name
        : "Error";
    const msg = isAbort
      ? `fetch aborted after ${deadlineMs}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    console.error(`[safeFetchOrNull][${label}] ${name}: ${msg}`);
    return null;
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}
