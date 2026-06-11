/**
 * macroRegimeHandler.ts — GET /api/macro-regime
 *
 * TASK-17 P1-2a: Serve a clean, flat frontend DTO backed by the live macro
 * snapshot from the macro-indicators Go service (port 5004).
 *
 * Mirrors MAW-P1-1a (newsSentimentHandler.ts) pattern exactly:
 *   – Proxies upstream via HTTP; reshapes into a stable frontend envelope.
 *   – On upstream failure: data_source="unavailable", stale_served=true, 502.
 *   – Never fabricates numbers. Never silently stale.
 *
 * Upstream: POST http://macro-indicators:5004/snapshot
 * Env SSOT:  MACRO_INDICATORS_URL (default: http://localhost:5004)
 *            Resolved via getMacroBaseUrl() — same SSOT used by all macro tools.
 *
 * Response shape (200 OK):
 *  {
 *    generated_at: string,           // ISO 8601 server clock
 *    data_source:  "live" | "stale" | "unavailable",
 *    stale_served: boolean,          // true when upstream says stale or is unreachable
 *    indicators: {
 *      vnIndex: number | null,
 *      oilUsd:  number | null,
 *      goldUsd: number | null,
 *      usdVnd:  number | null,
 *    },
 *    signals: {
 *      investment_clock: { phase: string, score: number, tier: string },
 *      oil:    { direction: string, price_usd: number, reasoning: string },
 *      gold:   { direction: string, price_usd: number, reasoning: string },
 *      usdvnd: { direction: string, rate_vnd:  number, reasoning: string },
 *    },
 *    calendar: { available: boolean, events: unknown[], note: string },
 *  }
 *
 * 502 on upstream failure (body carries data_source:"unavailable").
 *
 * DDD Layer: interface — imports only getMacroBaseUrl from infrastructure-adjacent
 * tools/macro module. No domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getMacroBaseUrl } from "../tools/macro/macroHttpClient.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types — upstream snapshot shape (POST /snapshot)
// ─────────────────────────────────────────────────────────────────────────────

interface UpstreamInvestmentClock {
  tier:  string;
  score: number;
  phase: string;
}

interface UpstreamOilSignal {
  impact:    string;   // "NEUTRAL" | "BULLISH" | "BEARISH" — normalised to "direction"
  priceUSD:  number;
  reasoning: string;
}

interface UpstreamGoldSignal {
  direction: string;
  priceUSD:  number;
  reasoning: string;
}

interface UpstreamUsdVndSignal {
  direction: string;
  rateVND:   number;
  reasoning: string;
}

interface UpstreamSignals {
  "investment-clock"?: UpstreamInvestmentClock;
  oil?:                UpstreamOilSignal;
  gold?:               UpstreamGoldSignal;
  usdvnd?:             UpstreamUsdVndSignal;
}

interface UpstreamSnapshot {
  status:     string;
  vnIndex?:   number | null;
  oilUsd?:    number | null;
  goldUsd?:   number | null;
  usdVnd?:    number | null;
  dataSource?: string;
  signals?:    UpstreamSignals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — upstream calendar shape (GET /macro-calendar)
// ─────────────────────────────────────────────────────────────────────────────

interface UpstreamCalendar {
  status?:      string;
  is_estimate?: boolean;
  events?:      unknown[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — served envelope
// ─────────────────────────────────────────────────────────────────────────────

export interface MacroRegimeIndicators {
  vnIndex: number | null;
  oilUsd:  number | null;
  goldUsd: number | null;
  usdVnd:  number | null;
}

export interface MacroRegimeInvestmentClock {
  phase: string;
  score: number;
  tier:  string;
}

export interface MacroRegimeSignalItem {
  direction:  string;
  price_usd?: number;
  rate_vnd?:  number;
  reasoning:  string;
}

export interface MacroRegimeSignals {
  investment_clock: MacroRegimeInvestmentClock;
  oil:    MacroRegimeSignalItem;
  gold:   MacroRegimeSignalItem;
  usdvnd: MacroRegimeSignalItem;
}

export interface MacroRegimeCalendar {
  available: boolean;
  events:    unknown[];
  note:      string;
}

export interface MacroRegimeResponse {
  generated_at: string;
  data_source:  "live" | "stale" | "unavailable";
  stale_served: boolean;
  indicators:   MacroRegimeIndicators;
  signals:      MacroRegimeSignals;
  calendar:     MacroRegimeCalendar;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOT_TIMEOUT_MS = 8_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a safe unavailable envelope — used on upstream failure. */
function unavailableEnvelope(now: Date): MacroRegimeResponse {
  return {
    generated_at: now.toISOString(),
    data_source:  "unavailable",
    stale_served: true,
    indicators: {
      vnIndex: null,
      oilUsd:  null,
      goldUsd: null,
      usdVnd:  null,
    },
    signals: {
      investment_clock: { phase: "UNKNOWN", score: 0, tier: "UNKNOWN" },
      oil:    { direction: "UNKNOWN", price_usd: 0, reasoning: "upstream unavailable" },
      gold:   { direction: "UNKNOWN", price_usd: 0, reasoning: "upstream unavailable" },
      usdvnd: { direction: "UNKNOWN", rate_vnd:  0, reasoning: "upstream unavailable" },
    },
    calendar: {
      available: false,
      events:    [],
      note:      "macro-indicators service unreachable",
    },
  };
}

/**
 * Normalise oil's "impact" field to "direction" so all three signals share
 * the same shape. "NEUTRAL" is already a valid direction value.
 */
function normaliseOilDirection(impact: string | undefined): string {
  if (!impact) return "UNKNOWN";
  return impact; // upstream already uses BULLISH | BEARISH | NEUTRAL
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch + reshape — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the upstream macro snapshot and reshape to the flat frontend DTO.
 *
 * @param baseUrl - Override base URL (defaults to getMacroBaseUrl())
 * @throws  on network error or non-2xx response
 */
export async function fetchAndReshapeMacroRegime(
  baseUrl?: string,
): Promise<MacroRegimeResponse> {
  const url = (baseUrl ?? getMacroBaseUrl()) + "/snapshot";
  const now = new Date();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);

  let raw: UpstreamSnapshot;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`macro-indicators /snapshot returned ${resp.status}`);
    }

    raw = (await resp.json()) as UpstreamSnapshot;
  } finally {
    clearTimeout(timer);
  }

  // ── Determine data_source ────────────────────────────────────────────────
  const upstreamSource = raw.dataSource ?? "live";
  const dataSource: "live" | "stale" | "unavailable" =
    upstreamSource === "live"  ? "live"  :
    upstreamSource === "stale" ? "stale" :
    "unavailable";
  const stale_served = dataSource !== "live";

  // ── Reshape indicators ───────────────────────────────────────────────────
  const indicators: MacroRegimeIndicators = {
    vnIndex: typeof raw.vnIndex === "number"  ? raw.vnIndex  : null,
    oilUsd:  typeof raw.oilUsd  === "number"  ? raw.oilUsd   : null,
    goldUsd: typeof raw.goldUsd === "number"  ? raw.goldUsd  : null,
    usdVnd:  typeof raw.usdVnd  === "number"  ? raw.usdVnd   : null,
  };

  // ── Reshape signals ──────────────────────────────────────────────────────
  const sig = raw.signals ?? {};

  const ic = sig["investment-clock"];
  const investment_clock: MacroRegimeInvestmentClock = {
    phase: typeof ic?.phase === "string" ? ic.phase : "UNKNOWN",
    score: typeof ic?.score === "number" ? ic.score : 0,
    tier:  typeof ic?.tier  === "string" ? ic.tier  : "UNKNOWN",
  };

  const oilUp = sig.oil;
  const oil: MacroRegimeSignalItem = {
    direction: normaliseOilDirection(oilUp?.impact),
    price_usd: typeof oilUp?.priceUSD === "number" ? oilUp.priceUSD : 0,
    reasoning: typeof oilUp?.reasoning === "string" ? oilUp.reasoning : "",
  };

  const goldUp = sig.gold;
  const gold: MacroRegimeSignalItem = {
    direction: typeof goldUp?.direction === "string" ? goldUp.direction : "UNKNOWN",
    price_usd: typeof goldUp?.priceUSD  === "number" ? goldUp.priceUSD  : 0,
    reasoning: typeof goldUp?.reasoning === "string" ? goldUp.reasoning : "",
  };

  const usdVndUp = sig.usdvnd;
  const usdvnd: MacroRegimeSignalItem = {
    direction: typeof usdVndUp?.direction === "string" ? usdVndUp.direction : "UNKNOWN",
    rate_vnd:  typeof usdVndUp?.rateVND   === "number" ? usdVndUp.rateVND   : 0,
    reasoning: typeof usdVndUp?.reasoning === "string" ? usdVndUp.reasoning : "",
  };

  // ── Build calendar stub ──────────────────────────────────────────────────
  // Calendar endpoint currently returns events:[] / status:"unavailable".
  // Surfaced honestly — never fabricated.
  const calendar: MacroRegimeCalendar = {
    available: false,
    events:    [],
    note:      "macro-calendar unavailable (is_estimate:true — upstream returns no events)",
  };

  return {
    generated_at: now.toISOString(),
    data_source:  dataSource,
    stale_served,
    indicators,
    signals: { investment_clock, oil, gold, usdvnd },
    calendar,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/macro-regime.
 *
 * @param _req    - Incoming HTTP request (unused)
 * @param res     - HTTP response
 * @param baseUrl - Optional upstream base URL override (for tests)
 */
export async function handleGetMacroRegime(
  _req: IncomingMessage,
  res: ServerResponse,
  baseUrl?: string,
): Promise<void> {
  try {
    const body = await fetchAndReshapeMacroRegime(baseUrl);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (_err) {
    // Upstream unreachable or non-2xx: degrade honestly, never fabricate.
    const envelope = unavailableEnvelope(new Date());
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify(envelope));
  }
}
