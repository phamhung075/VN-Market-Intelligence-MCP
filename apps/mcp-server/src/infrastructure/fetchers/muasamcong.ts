/**
 * Muasamcong Fetcher — Task 248 + Task B (VPS proxy support)
 *
 * Scrapes public procurement results from muasamcong.mpi.gov.vn
 * and maps winning contractors to related listed stocks.
 *
 * Layer: infrastructure/fetchers — HTTP I/O only, no domain logic
 *
 * Contract-to-stock mapping logic lives in mapContractToStocks (exported for testing).
 * Never throws: returns [] on any error.
 *
 * VPS proxy (Task B): muasamcong.mpi.gov.vn is geo-blocked outside Vietnam.
 * Set MUASAMCONG_VPS_PROXY_URL=http://<vps-ip>:8765/proxy?url=<encoded>
 * or MUASAMCONG_VPS_PROXY_URL=http://<vps-ip>:8765/muasamcong to route through VPS.
 * When env var is unset the fetcher hits the origin directly (works from inside VN).
 */

import { parseVnNumber } from "../../domain/services/vnNumberParser.js";
import { BROWSER_UA } from "./browserHeaders.js";
import { withDeadline } from "./fetchDeadline.js";

const MUASAMCONG_ORIGIN =
  "https://muasamcong.mpi.gov.vn/web/guest/home-page-new-ver2/-/thauthau/ket-qua-chon-nha-thau";

/**
 * Resolve the URL to use for fetching muasamcong.mpi.gov.vn.
 *
 * Priority:
 *   1. MUASAMCONG_VPS_PROXY_URL env var (VPS proxy configured by ops)
 *   2. Origin URL directly (works from within Vietnam)
 *
 * The VPS proxy is needed from France because muasamcong.mpi.gov.vn
 * returns 404 for non-VN IP addresses.
 */
export function getMuasamcongUrl(): string {
  return (
    (typeof Bun !== "undefined" ? Bun.env["MUASAMCONG_VPS_PROXY_URL"] : undefined) ??
    MUASAMCONG_ORIGIN
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ContractCategory =
  | "highway"
  | "construction"
  | "technology"
  | "energy"
  | "healthcare"
  | "education"
  | "other";

export interface PublicContract {
  title: string;
  value: number;
  agency: string;
  winner: string;
  awardDate: string;
  category: ContractCategory;
  relatedStocks: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword-to-category mapping
// ─────────────────────────────────────────────────────────────────────────────

const HIGHWAY_KEYWORDS =
  /cao tốc|cầu đường|đường bộ|hạ tầng giao thông|đường cao tốc|quốc lộ|nút giao|cầu vượt/i;

const TECH_KEYWORDS =
  /công nghệ thông tin|phần mềm|hệ thống|số hóa|dữ liệu|cntt|it|digital|phần mềm/i;

const ENERGY_KEYWORDS =
  /điện|năng lượng|solar|mặt trời|gió|phong điện|nhà máy điện|lưới điện|trạm biến áp/i;

const CONSTRUCTION_KEYWORDS =
  /xây dựng|nhà ở|chung cư|khu đô thị|bệnh viện|trường học|công trình dân dụng/i;

const HEALTHCARE_KEYWORDS = /y tế|bệnh viện|thuốc|thiết bị y tế|dược|vaccine/i;

const EDUCATION_KEYWORDS = /giáo dục|trường|đào tạo|học/i;

// ─────────────────────────────────────────────────────────────────────────────
// Stock mapping rules
// ─────────────────────────────────────────────────────────────────────────────

const STOCK_MAPPING: Array<{ pattern: RegExp; stocks: string[] }> = [
  // Energy patterns MUST come before construction ("xây dựng nhà máy điện" hits energy first)
  { pattern: /điện mặt trời|solar|năng lượng mặt trời/i, stocks: ["GEG", "REE", "PC1"] },
  { pattern: /điện gió|phong điện/i, stocks: ["GEG", "REE", "EVN"] },
  { pattern: /nhà máy điện|lưới điện|trạm biến áp/i, stocks: ["PC1", "REE", "GEG"] },
  { pattern: /\bđiện\b/i, stocks: ["GEG", "REE", "PC1"] },
  // IT / digital
  { pattern: /công nghệ thông tin|phần mềm|số hóa|cntt|it\b|digital/i, stocks: ["FPT", "CMG"] },
  { pattern: /hệ thống thông tin|dữ liệu/i, stocks: ["FPT", "CMG", "ELC"] },
  // Transport / highway
  { pattern: /cao tốc|cầu đường|đường bộ|đường cao tốc|quốc lộ|nút giao|cầu vượt/i, stocks: ["HHV", "CII", "VCG"] },
  { pattern: /hạ tầng giao thông|giao thông/i, stocks: ["CII", "VCG", "HHV"] },
  // General construction (after energy/IT)
  { pattern: /xây dựng|nhà ở|khu đô thị|công trình dân dụng/i, stocks: ["CTD", "HBC", "VCG"] },
  // Healthcare / pharma
  { pattern: /y tế|bệnh viện|thiết bị y tế/i, stocks: ["DBD", "IMP", "TRA"] },
  { pattern: /dược|thuốc|vaccine/i, stocks: ["IMP", "TRA", "DMC"] },
  // Materials
  { pattern: /thép|sắt/i, stocks: ["HPG", "HSG", "NKG"] },
  { pattern: /xi măng|bê tông/i, stocks: ["HT1", "BCC", "SCJ"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map contract title to related listed stock codes.
 * Pure synchronous function — no I/O.
 */
export function mapContractToStocks(title: string): string[] {
  for (const rule of STOCK_MAPPING) {
    if (rule.pattern.test(title)) {
      return rule.stocks;
    }
  }
  return [];
}

/**
 * Classify a contract title into a category.
 */
function classifyContract(title: string): ContractCategory {
  if (HIGHWAY_KEYWORDS.test(title)) return "highway";
  if (TECH_KEYWORDS.test(title)) return "technology";
  if (ENERGY_KEYWORDS.test(title)) return "energy";
  if (HEALTHCARE_KEYWORDS.test(title)) return "healthcare";
  if (EDUCATION_KEYWORDS.test(title)) return "education";
  if (CONSTRUCTION_KEYWORDS.test(title)) return "construction";
  return "other";
}

/**
 * Parse HTML table rows into PublicContract objects.
 * Expects a <table class="table-result"> with columns:
 *   [title, value, agency, winner, awardDate]
 */
function parseContractsFromHtml(html: string): PublicContract[] {
  const contracts: PublicContract[] = [];

  // Find all <tr> rows after the header row
  // Match rows containing <td> cells
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowContent = rowMatch[1]!;
    const cells: string[] = [];

    let cellMatch: RegExpExecArray | null;
    const localCellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((cellMatch = localCellPattern.exec(rowContent)) !== null) {
      // Strip HTML tags and trim
      const text = cellMatch[1]!
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      cells.push(text);
    }

    // Need at least 5 columns
    if (cells.length < 5) continue;

    const title = cells[0]!;
    const valueRaw = cells[1]!;
    const agency = cells[2]!;
    const winner = cells[3]!;
    const awardDate = cells[4]!;

    // Skip if title looks like a header
    if (!title || /tên gói thầu|gói thầu/i.test(title) && valueRaw === "") continue;
    if (!title.trim()) continue;

    const value = parseVnNumber(valueRaw) ?? 0;
    const category = classifyContract(title);
    const relatedStocks = mapContractToStocks(title);

    contracts.push({
      title,
      value,
      agency,
      winner,
      awardDate,
      category,
      relatedStocks,
    });
  }

  return contracts;
}

/**
 * HTTP client interface for injection in tests.
 */
export interface HttpClient {
  get(url: string): Promise<string>;
}

/**
 * Default HTTP client using Bun.fetch with browser User-Agent.
 */
const defaultHttpClient: HttpClient = {
  async get(url: string): Promise<string> {
    const resp = await withDeadline(
      (signal) => fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal }),
      30_000,
      "muasamcong",
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.text();
  },
};

/**
 * Fetch public procurement contracts from muasamcong.mpi.gov.vn.
 * Never throws — returns [] on any error.
 *
 * Uses getMuasamcongUrl() to resolve VPS proxy vs origin.
 * From France the origin returns 404 — set MUASAMCONG_VPS_PROXY_URL
 * to route through the Vinahost VPS.
 *
 * @param httpClient - Optional HTTP client (injected in tests)
 * @returns Array of parsed PublicContract objects
 */
export async function fetchPublicContracts(
  httpClient?: HttpClient,
): Promise<PublicContract[]> {
  const client = httpClient ?? defaultHttpClient;
  const url = getMuasamcongUrl();

  try {
    const html = await client.get(url);
    return parseContractsFromHtml(html);
  } catch (err) {
    console.error("[fetchPublicContracts] Failed to fetch muasamcong:", err);
    return [];
  }
}
