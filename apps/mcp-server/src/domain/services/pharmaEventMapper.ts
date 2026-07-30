/**
 * Pharma Event Mapper — Task 268
 *
 * Pure domain service. Classifies pharma-related events from text and maps
 * them to affected stock codes in the watchlist.
 *
 * Event types:
 *   - drug_approval    : DAV grants drug registration / marketing authorisation
 *   - hospital_tender  : hospital procurement tender won
 *   - outbreak         : disease outbreak → increased demand for pharma products
 *   - price_regulation : drug price cap / ceiling regulation → margin pressure
 *   - fdi_pharma       : foreign direct investment / M&A in pharma sector
 *
 * Layer: domain/services — ZERO imports from infrastructure/.
 */

import type { ImpactDirection } from "./newsNormalizer.js";
import type { WatchlistEntry } from "./cascadeEngine.js";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type PharmaEventType =
  | "drug_approval"
  | "hospital_tender"
  | "outbreak"
  | "price_regulation"
  | "fdi_pharma";

export type Severity = "low" | "medium" | "high" | "critical";

export interface PharmaStockImpact {
  code: string;
  direction: ImpactDirection;
  reasoning: string;
}

export interface PharmaSignal {
  eventType: PharmaEventType;
  severity: Severity;
  affectedStocks: PharmaStockImpact[];
  confidence: number;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Manufacturer → Stock Code mapping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map Vietnamese manufacturer names / aliases to stock codes.
 * Keys are lowercase for case-insensitive matching.
 */
const PHARMA_STOCKS: Record<string, string> = {
  "dược hậu giang": "DHG",
  "hậu giang": "DHG",
  dhg: "DHG",
  imexpharm: "IMP",
  imp: "IMP",
  "dược bình định": "DBD",
  bidiphar: "DBD",
  dbd: "DBD",
  pymepharco: "PME",
  pme: "PME",
  traphaco: "TRA",
  tra: "TRA",
  "dược phẩm opc": "OPC",
  opc: "OPC",
};

// ═══════════════════════════════════════════════════════════════════════════
// Detection patterns
// ═══════════════════════════════════════════════════════════════════════════

/** Outbreak / epidemic patterns — Vietnamese + English */
const OUTBREAK_PATTERNS: RegExp[] = [
  /dịch\s+(bệnh|sốt xuất huyết|cúm|tay chân miệng|sởi|COVID|dại)/i,
  /sốt xuất huyết/i,
  /cúm\s*[AB]/i,
  /tay chân miệng/i,
  /bùng phát dịch/i,
  /outbreak|epidemic|pandemic/i,
  /tiêm chủng|vaccination campaign/i,
  /WHO.{0,30}(cảnh báo|warning)/i,
  /dịch bệnh lây lan/i,
  /\bvaccine\b/i,
  /\bCOVID\b/i,
  /\bsởi\b/i,
];

/** Drug approval / registration patterns */
const APPROVAL_PATTERNS: RegExp[] = [
  /phê duyệt.{0,50}(thuốc|sản phẩm)/i,
  /cấp phép (lưu hành|đăng ký)/i,
  /đăng ký lưu hành/i,
  /DAV.{0,50}(cấp|phê duyệt|phê chuẩn)/i,
  /cục (quản lý )?dược.{0,30}(phê duyệt|cấp phép|cấp)/i,
  /drug approval|marketing authorisation/i,
  /đăng ký thuốc/i,
  /ra mắt.{0,50}(thuốc|sản phẩm).{0,50}(phê duyệt|cấp phép)/i,
];

/** Hospital tender / procurement patterns */
const TENDER_PATTERNS: RegExp[] = [
  /trúng thầu/i,
  /đấu thầu.{0,50}thuốc/i,
  /cung (cấp|ứng) thuốc.{0,50}bệnh viện/i,
  /hợp đồng.{0,50}(bệnh viện|thuốc|cung ứng)/i,
  /ký hợp đồng cung/i,
  /hospital.{0,30}(tender|supply|procurement|contract)/i,
  /supply.{0,30}hospital/i,
];

/** Drug price regulation patterns */
const PRICE_REGULATION_PATTERNS: RegExp[] = [
  /giá trần thuốc/i,
  /trần giá thuốc/i,
  /điều chỉnh.{0,30}(giá|trần).{0,30}thuốc/i,
  /price (cap|ceiling|regulation).{0,30}(drug|pharma|medicine)/i,
  /drug price (cap|ceiling|regulation)/i,
  /kiểm soát giá thuốc/i,
  /bộ y tế.{0,50}giá thuốc/i,
];

/** FDI / M&A in pharma patterns */
const FDI_PATTERNS: RegExp[] = [
  /đầu tư.{0,80}(dược phẩm|dược|pharma)/i,
  /(dược phẩm|pharma).{0,80}đầu tư/i,
  /mua.{0,30}(cổ phần|cổ phiếu).{0,50}(dược|pharma|IMP|DHG|TRA|DBD|PME|OPC)/i,
  /acquire.{0,50}(pharma|dược)/i,
  /foreign.{0,50}(pharma|dược|invest)/i,
  /FDI.{0,50}dược/i,
  /strategic partnership.{0,50}(pharma|dược)/i,
  /acquires stake in (Traphaco|Imexpharm|Bidiphar|Pymepharco|OPC|DHG)/i,
];

// ═══════════════════════════════════════════════════════════════════════════
// Helper: extract pharma stocks from text
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract stock codes from text by matching manufacturer names.
 * Returns only codes that are present in the watchlist.
 */
function extractStocksFromText(
  text: string,
  watchlist: WatchlistEntry[],
): string[] {
  const lowerText = text.toLowerCase();
  const watchlistCodes = new Set(watchlist.map((w) => w.actionCode));
  const found = new Set<string>();

  for (const [keyword, code] of Object.entries(PHARMA_STOCKS)) {
    if (lowerText.includes(keyword) && watchlistCodes.has(code)) {
      found.add(code);
    }
  }

  return Array.from(found);
}

/**
 * Extract all pharma stocks from watchlist that have domain 'pharma'.
 */
function allPharmaWatchlistStocks(watchlist: WatchlistEntry[]): string[] {
  return watchlist
    .filter((w) => w.domain === "pharma")
    .map((w) => w.actionCode);
}

// ═══════════════════════════════════════════════════════════════════════════
// Classification helpers
// ═══════════════════════════════════════════════════════════════════════════

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

// ═══════════════════════════════════════════════════════════════════════════
// Main classification function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify a text snippet as a pharma event and map it to affected watchlist stocks.
 *
 * Priority order (first match wins):
 *   1. fdi_pharma   — foreign investment / M&A signals (most specific)
 *   2. price_regulation — drug price cap changes
 *   3. hospital_tender  — procurement tender wins
 *   4. drug_approval    — new drug registrations
 *   5. outbreak         — disease outbreaks
 *
 * @param text - Raw text to classify (news headline, summary, etc.)
 * @param watchlist - Current user watchlist to filter affected stocks
 * @returns PharmaSignal if a pharma event is detected, null otherwise
 */
export function classifyPharmaEvent(
  text: string,
  watchlist: WatchlistEntry[],
): PharmaSignal | null {
  if (!text || !text.trim()) return null;

  // Need at least one pharma stock in watchlist to generate a signal
  const pharmaStocks = allPharmaWatchlistStocks(watchlist);
  if (pharmaStocks.length === 0) return null;

  // ── 1. FDI / M&A ────────────────────────────────────────────────────────
  if (matchesAny(text, FDI_PATTERNS)) {
    const mentionedStocks = extractStocksFromText(text, watchlist);
    // If specific stocks are mentioned, use them; otherwise use all pharma
    const targets = mentionedStocks.length > 0 ? mentionedStocks : pharmaStocks;

    return {
      eventType: "fdi_pharma",
      severity: "high",
      affectedStocks: targets.map((code) => ({
        code,
        direction: "up" as ImpactDirection,
        reasoning: "M&A premium / FDI inflow into pharma company",
      })),
      confidence: 0.75,
      description: "Foreign investment or M&A activity detected in Vietnamese pharma sector",
    };
  }

  // ── 2. Price regulation ────────────────────────────────────────────────
  if (matchesAny(text, PRICE_REGULATION_PATTERNS)) {
    return {
      eventType: "price_regulation",
      severity: "medium",
      affectedStocks: pharmaStocks.map((code) => ({
        code,
        direction: "down" as ImpactDirection,
        reasoning: "Drug price cap / ceiling reduces pharma margins",
      })),
      confidence: 0.80,
      description: "Drug price regulation change detected — bearish for pharma margins",
    };
  }

  // ── 3. Hospital tender ─────────────────────────────────────────────────
  if (matchesAny(text, TENDER_PATTERNS)) {
    const mentionedStocks = extractStocksFromText(text, watchlist);
    const targets = mentionedStocks.length > 0 ? mentionedStocks : pharmaStocks;

    return {
      eventType: "hospital_tender",
      severity: "medium",
      affectedStocks: targets.map((code) => ({
        code,
        direction: "up" as ImpactDirection,
        reasoning: "Hospital supply contract win — guaranteed revenue stream",
      })),
      confidence: 0.75,
      description: "Hospital drug procurement tender or supply contract detected",
    };
  }

  // ── 4. Drug approval ───────────────────────────────────────────────────
  if (matchesAny(text, APPROVAL_PATTERNS)) {
    const mentionedStocks = extractStocksFromText(text, watchlist);
    const targets = mentionedStocks.length > 0 ? mentionedStocks : pharmaStocks;

    return {
      eventType: "drug_approval",
      severity: "medium",
      affectedStocks: targets.map((code) => ({
        code,
        direction: "up" as ImpactDirection,
        reasoning: "New drug approval expands product portfolio",
      })),
      confidence: 0.80,
      description: "DAV drug registration / approval detected",
    };
  }

  // ── 5. Outbreak ───────────────────────────────────────────────────────
  if (matchesAny(text, OUTBREAK_PATTERNS)) {
    // All pharma stocks benefit from outbreak (increased treatment demand)
    return {
      eventType: "outbreak",
      severity: "high",
      affectedStocks: pharmaStocks.map((code) => ({
        code,
        direction: "up" as ImpactDirection,
        reasoning: "Increased treatment drug demand during disease outbreak",
      })),
      confidence: 0.70,
      description: "Disease outbreak detected — bullish for pharma sector (increased demand)",
    };
  }

  return null;
}
