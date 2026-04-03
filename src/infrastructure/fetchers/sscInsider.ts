/**
 * SSC Insider Fetcher — Task 249
 *
 * Scrapes insider transaction disclosures from the SSC (State Securities Commission)
 * portal: congbothongtin.ssc.gov.vn
 *
 * Layer: infrastructure/fetchers — HTTP I/O only, no domain logic
 * Never throws: returns [] on any error.
 */

const SSC_INSIDER_URL =
  "https://congbothongtin.ssc.gov.vn/faces/oracle/webcenter/portalapp/pages/giaodichnoibo/ketquagiaodich.jspx";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RawInsiderRow {
  code: string;
  insiderName: string;
  position: string;
  type: "buy" | "sell" | "other";
  registeredVolume: number;
  executedVolume: number;
  price: number;
  fromDate: string;
  toDate: string;
}

export interface HttpClient {
  get(url: string): Promise<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a Vietnamese number string (dots as thousand separators).
 */
function parseVnNumber(s: string): number {
  const cleaned = s.replace(/\./g, "").replace(/,/g, ".").trim();
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Normalise transaction type from Vietnamese text.
 */
function parseType(raw: string): "buy" | "sell" | "other" {
  const lower = raw.toLowerCase().trim();
  if (/^mua/.test(lower)) return "buy";
  if (/^bán/.test(lower)) return "sell";
  return "other";
}

/**
 * Strip HTML tags, decode common entities, collapse whitespace.
 */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse rows from the SSC insider disclosure HTML table.
 *
 * Expects a <table> with columns:
 *   [code, insiderName, position, type, registeredVolume, executedVolume, price, fromDate, toDate]
 */
function parseInsiderHtml(html: string): RawInsiderRow[] {
  const rows: RawInsiderRow[] = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowContent = rowMatch[1]!;
    const cells: string[] = [];

    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowContent)) !== null) {
      cells.push(stripTags(cellMatch[1]!));
    }

    if (cells.length < 9) continue;

    const code = cells[0]!.trim().toUpperCase();
    if (!code || code.length > 10) continue; // skip header rows

    const row: RawInsiderRow = {
      code,
      insiderName: cells[1]!,
      position: cells[2]!,
      type: parseType(cells[3]!),
      registeredVolume: parseVnNumber(cells[4]!),
      executedVolume: parseVnNumber(cells[5]!),
      price: parseVnNumber(cells[6]!),
      fromDate: cells[7]!,
      toDate: cells[8]!,
    };

    rows.push(row);
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default HTTP client
// ─────────────────────────────────────────────────────────────────────────────

const defaultHttpClient: HttpClient = {
  async get(url: string): Promise<string> {
    const resp = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.text();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse insider transaction disclosures from the SSC portal.
 * Never throws — returns [] on any error.
 *
 * @param httpClient - Optional injected HTTP client (for testing)
 * @returns Array of parsed RawInsiderRow
 */
export async function fetchInsiderTransactions(
  httpClient?: HttpClient,
): Promise<RawInsiderRow[]> {
  const client = httpClient ?? defaultHttpClient;

  try {
    const html = await client.get(SSC_INSIDER_URL);
    return parseInsiderHtml(html);
  } catch (err) {
    console.error("[fetchInsiderTransactions] Failed to fetch SSC insider data:", err);
    return [];
  }
}
