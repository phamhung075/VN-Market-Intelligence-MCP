/**
 * Board Details Fetcher — RAPID-DATA-LAYER FIX-I-B
 *
 * Fetches board-member appointment_year data from the Vinahost VPS proxy.
 * Endpoint: GET http://<VPS>:8765/proxy/board-details?batch=T1,T2,...
 *
 * Each officer record includes FromDate (appointment date string).
 * null/N/A/empty FromDate → appointment_year null (never 0, never string).
 *
 * Chunking: 10 tickers per request (same pattern as agmPlanFetcher).
 * Auth: VPS_PUSH_API_KEY sent as X-API-Key header.
 * Timeout: 120 seconds per chunk.
 *
 * Never throws — returns null on all-chunk failure.
 *
 * @module infrastructure/fetchers/boardDetailsFetcher
 */

// ─────────────────────────────────────────────────────────────────────────────
// VPS config
// ─────────────────────────────────────────────────────────────────────────────

const VPS_BOARD_DETAILS_URL =
  Bun.env["BOARD_DETAILS_VPS_URL"] ??
  "http://125.212.251.27:8765/proxy/board-details";

const FETCH_TIMEOUT_MS = 120_000;
const VPS_MAX_BATCH = 10;

// ─────────────────────────────────────────────────────────────────────────────
// VPS response types
// ─────────────────────────────────────────────────────────────────────────────

interface VpsOfficer {
  /** Officer full name (diacritics may differ from VCI Vietstock) */
  name: string;
  /** Position title */
  position_text?: string;
  /** Appointment year — already parsed on VPS side, integer or null for N/A */
  appointment_year: number | null;
  closed_date?: string;
  year_of_birth?: number;
  independence?: number;
  total_shares?: number;
}

interface VpsResponse {
  status: string;
  tickers_ok?: string[];
  tickers_error?: string[];
  data?: Record<string, VpsOfficer[]>;
  fetched_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsed output types (exported for store consumers)
// ─────────────────────────────────────────────────────────────────────────────

export interface BoardDetailsOfficer {
  code: string;
  name: string;
  position: string;
  /** Year extracted from FromDate, or null when absent/N/A/unparseable */
  appointment_year: number | null;
  fetched_at: string;
}

export interface BoardDetailsFetchResult {
  officers: BoardDetailsOfficer[];
  tickers_ok: string[];
  tickers_error: string[];
  fetched_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge a single VPS JSON response into the accumulator arrays.
 * VPS returns data[ticker] as an array of officers (not nested under .officers).
 * Each officer has snake_case fields; appointment_year is already parsed (number | null).
 */
function parseVpsResponse(
  json: VpsResponse,
  officers: BoardDetailsOfficer[],
  tickersOk: string[],
  tickersError: string[],
): void {
  const fetchedAt = json.fetched_at ?? new Date().toISOString();

  for (const [ticker, tickerData] of Object.entries(json.data ?? {})) {
    const code = ticker.toUpperCase();

    // tickerData is the array directly, not an object with .officers
    for (const member of (tickerData ?? [])) {
      const name = (member.name ?? "").trim();
      if (!name) continue; // skip nameless rows

      officers.push({
        code,
        name,
        position: (member.position_text ?? "").trim(),
        appointment_year: member.appointment_year, // already parsed on VPS side
        fetched_at: fetchedAt,
      });
    }
  }

  for (const t of json.tickers_ok ?? []) tickersOk.push(t.toUpperCase());
  for (const t of json.tickers_error ?? []) tickersError.push(t.toUpperCase());
}

/**
 * Fetch a single chunk from the VPS proxy.
 * Returns null on network / HTTP error.
 */
async function fetchChunk(
  chunk: string[],
  fetchFn: typeof fetch,
): Promise<VpsResponse | null> {
  const url = `${VPS_BOARD_DETAILS_URL}?batch=${chunk.join(",")}`;

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
  };
  const apiKey = Bun.env["VPS_PUSH_API_KEY"];
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetchFn(url, { signal: controller.signal, headers });

    if (!resp.ok) {
      console.error(
        `[boardDetailsFetcher] VPS returned ${resp.status} for chunk [${chunk.join(",")}]`,
      );
      return null;
    }

    return (await resp.json()) as VpsResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[boardDetailsFetcher] fetch error: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch board-details (officers + appointment dates) for a batch of tickers.
 *
 * Chunks requests into groups of VPS_MAX_BATCH (10) and merges results.
 *
 * @param tickers  Array of stock codes (e.g. ["FPT", "VCB"])
 * @param fetchFn  Injectable fetch for unit testing (defaults to global fetch)
 * @returns Aggregated officers across all chunks, or null if all chunks fail
 */
export async function fetchBoardDetails(
  tickers: string[],
  fetchFn: typeof fetch = fetch,
): Promise<BoardDetailsFetchResult | null> {
  if (tickers.length === 0) return null;

  const normalized = tickers.map((t) => t.toUpperCase().trim());
  const officers: BoardDetailsOfficer[] = [];
  const tickersOk: string[] = [];
  const tickersError: string[] = [];
  let anySuccess = false;
  let latestFetchedAt = new Date().toISOString();

  for (let i = 0; i < normalized.length; i += VPS_MAX_BATCH) {
    const chunk = normalized.slice(i, i + VPS_MAX_BATCH);
    const json = await fetchChunk(chunk, fetchFn);

    if (json === null) {
      for (const t of chunk) tickersError.push(t);
      continue;
    }

    if (json.fetched_at) latestFetchedAt = json.fetched_at;
    parseVpsResponse(json, officers, tickersOk, tickersError);
    anySuccess = true;
  }

  if (!anySuccess && officers.length === 0) {
    return null;
  }

  return {
    officers,
    tickers_ok: tickersOk,
    tickers_error: tickersError,
    fetched_at: latestFetchedAt,
  };
}
