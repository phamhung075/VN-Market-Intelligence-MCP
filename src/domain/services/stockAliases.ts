/**
 * Stock Aliases — Domain Service
 *
 * Maps Vietnamese stock tickers to their known Vietnamese trade names,
 * abbreviations, and brand names. Provides two pure functions for lookup
 * and alias-based detection in free text.
 *
 * Design rules:
 * - Zero imports from infrastructure or application layers (DDD: domain-only)
 * - No runtime I/O, no side effects, no mutation
 * - All alias values are pre-normalised at module load via normalizeText()
 *   so call-time normalisation only applies to the incoming text
 *
 * Usage:
 *   import { getAliasesForCode, detectStocksInText } from "./stockAliases.js";
 */

// ─────────────────────────────────────────────────────────────────────────────
// Private helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a string for alias comparison:
 *   1. Unicode NFD decomposition (separates base chars from combining marks)
 *   2. Strip all Unicode combining marks (diacritics) via regex category \p{M}
 *   3. Lowercase
 *
 * Private — not exported.
 *
 * @example
 *   normalizeText("Hòa Phát")  // → "hoa phat"
 *   normalizeText("Vinamilk")  // → "vinamilk"
 */
function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Static alias dictionary
// Each value array uses UN-normalised strings — they are passed through
// normalizeText() at module load time (see NORMALISED_ALIASES below).
//
// Rule: minimum 3 aliases per stock, covering:
//   (a) Full Vietnamese company name
//   (b) Short trade name / brand
//   (c) English name or accent-free variant
// ─────────────────────────────────────────────────────────────────────────────

const STOCK_ALIASES_RAW: Record<string, string[]> = {
  // ─── Watchlist defaults ────────────────────────────────────────────────────

  VNM: [
    "vinamilk",
    "sữa vinamilk",
    "công ty cổ phần sữa việt nam",
    "cong ty co phan sua viet nam",
    "viet nam dairy",
    "vietnam dairy products",
    "vietnam dairy",
    "sua viet nam",
  ],

  FPT: [
    // "fpt" is both the brand name and the ticker — include as short alias
    // because the company is universally known by the three-letter acronym
    "fpt",
    "fpt corporation",
    "tập đoàn fpt",
    "tap doan fpt",
    "công ty fpt",
    "cong ty fpt",
    "fpt software",
    "fpt telecom",
    "fpt group",
    // Parent-subsidiary: FRT (FPT Retail) is FPT's subsidiary.
    // FRT news (e.g. Dragon Capital buys FRT) cascades to FPT.
    "frt",
    "fpt retail",
    "fpt digital retail",
    "fpt shop",
  ],

  VCB: [
    "vietcombank",
    "ngân hàng vietcombank",
    "ngan hang vietcombank",
    "bank for foreign trade of vietnam",
    "ngân hàng ngoại thương việt nam",
    "ngan hang ngoai thuong viet nam",
    "vietcombank bank",
  ],

  VEA: [
    "veam",
    "tổng công ty máy động lực và nông nghiệp việt nam",
    "tong cong ty may dong luc va nong nghiep viet nam",
    "vietnam engine and agricultural machinery",
    "vietnam engine",
    "may dong luc viet nam",
  ],

  // ─── Top 20 HOSE stocks ────────────────────────────────────────────────────

  HPG: [
    "hòa phát",
    "hoa phat",
    "tập đoàn hòa phát",
    "tap doan hoa phat",
    "hòa phát group",
    "hoa phat group",
    "hoa phat steel",
    "thép hòa phát",
    "thep hoa phat",
  ],

  VIC: [
    "vingroup",
    "tập đoàn vingroup",
    "tap doan vingroup",
    "vingroup corporation",
    "công ty vingroup",
    "cong ty vingroup",
    "vin group",
  ],

  VHM: [
    "vinhomes",
    "công ty cổ phần vinhomes",
    "cong ty cp vinhomes",
    "vinhomes corporation",
    "vinhomes bất động sản",
    "vinhomes bat dong san",
    "vin homes",
  ],

  MSN: [
    "masan",
    "tập đoàn masan",
    "tap doan masan",
    "masan group",
    "công ty masan",
    "cong ty masan",
    "masan consumer",
  ],

  MWG: [
    "thế giới di động",
    "the gioi di dong",
    "mobile world",
    "công ty cổ phần đầu tư thế giới di động",
    "cong ty cp dau tu the gioi di dong",
    "điện máy xanh",
    "dien may xanh",
    "bach hoa xanh",
    "bách hóa xanh",
  ],

  TCB: [
    "techcombank",
    "ngân hàng techcombank",
    "ngan hang techcombank",
    "technological commercial bank",
    "ngân hàng kỹ thương việt nam",
    "ngan hang ky thuong viet nam",
  ],

  BID: [
    "bidv",
    "ngân hàng bidv",
    "ngan hang bidv",
    "bank for investment and development of vietnam",
    "ngân hàng đầu tư và phát triển việt nam",
    "ngan hang dau tu va phat trien viet nam",
  ],

  CTG: [
    "vietinbank",
    "ngân hàng vietinbank",
    "ngan hang vietinbank",
    "vietnam joint stock commercial bank for industry and trade",
    "ngân hàng công thương việt nam",
    "ngan hang cong thuong viet nam",
    "vietin bank",
  ],

  ACB: [
    "ngân hàng á châu",
    "ngan hang a chau",
    "asia commercial bank",
    "ngân hàng acb",
    "ngan hang acb",
    "a chau bank",
    "asia commercial bank of vietnam",
  ],

  VPB: [
    "vpbank",
    "ngân hàng vpbank",
    "ngan hang vpbank",
    "vietnam prosperity bank",
    "ngân hàng việt nam thịnh vượng",
    "ngan hang viet nam thinh vuong",
    "vp bank",
  ],

  HDB: [
    "hdbank",
    "ngân hàng hdbank",
    "ngan hang hdbank",
    "ho chi minh city development bank",
    "ngân hàng phát triển thành phố hồ chí minh",
    "ngan hang phat trien thanh pho ho chi minh",
    "hd bank",
  ],

  STB: [
    "sacombank",
    "ngân hàng sacombank",
    "ngan hang sacombank",
    "sài gòn thương tín",
    "sai gon thuong tin",
    "sai gon thuong tin commercial bank",
    "sacombank bank",
  ],

  GAS: [
    "pv gas",
    "pvgas",
    "petrovietnam gas",
    "tổng công ty khí việt nam",
    "tong cong ty khi viet nam",
    "pv gas corporation",
    "vietnam gas",
  ],

  PLX: [
    "petrolimex",
    "tập đoàn xăng dầu việt nam",
    "tap doan xang dau viet nam",
    "vietnam national petroleum group",
    "xang dau viet nam",
    "petrolimex group",
  ],

  SAB: [
    "sabeco",
    "tổng công ty cổ phần bia rượu nước giải khát sài gòn",
    "tong cong ty cp bia ruou nuoc giai khat sai gon",
    "saigon beer",
    "bia saigon",
    "bia sài gòn",
    "saigon beer alcohol beverage",
  ],

  REE: [
    "ree corporation",
    "công ty cổ phần cơ điện lạnh ree",
    "cong ty co phan co dien lanh ree",
    "ree co dien lanh",
    "cơ điện lạnh ree",
    "co dien lanh ree",
    "ree refrigeration engineering",
  ],

  PNJ: [
    "pnj",
    "công ty cổ phần vàng bạc đá quý phú nhuận",
    "cong ty cp vang bac da quy phu nhuan",
    "phu nhuan jewelry",
    "phú nhuận jewelry",
    "vàng bạc phú nhuận",
    "vang bac phu nhuan",
  ],

  DHG: [
    "dược hậu giang",
    "duoc hau giang",
    "công ty cổ phần dược hậu giang",
    "cong ty co phan duoc hau giang",
    "hau giang pharmaceutical",
    "dược phẩm hậu giang",
    "duoc pham hau giang",
  ],

  // ─── Additional common stocks ──────────────────────────────────────────────

  SSI: [
    "ssi securities",
    "công ty chứng khoán ssi",
    "cong ty chung khoan ssi",
    "sai gon securities",
    "saigon securities",
    "chứng khoán ssi",
    "chung khoan ssi",
  ],

  MBB: [
    "mb bank",
    "ngân hàng mb",
    "ngan hang mb",
    "military commercial bank",
    "ngân hàng quân đội",
    "ngan hang quan doi",
    "mb bank viet nam",
  ],

  VJC: [
    "vietjet",
    "vietjet air",
    "vietjet aviation",
    "công ty cổ phần hàng không vietjet",
    "cong ty cp hang khong vietjet",
    "hang khong vietjet",
    "hàng không vietjet",
  ],

  HVN: [
    "vietnam airlines",
    "hãng hàng không quốc gia việt nam",
    "hang hang khong quoc gia viet nam",
    "vietnam national airline",
    "hang khong viet nam",
    "hàng không việt nam",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Pre-normalise the alias map at module load time
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-normalised alias map: all alias strings are passed through
 * normalizeText() once at module load. Call-time normalisation of
 * the incoming text is all that remains.
 */
const NORMALISED_ALIASES: Record<string, string[]> = (() => {
  const result: Record<string, string[]> = {};
  for (const [code, aliases] of Object.entries(STOCK_ALIASES_RAW)) {
    result[code.toUpperCase()] = aliases.map(normalizeText);
  }
  return result;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Public exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all known aliases for a ticker, already normalised via normalizeText().
 * Returns [] for unknown codes. Never throws.
 *
 * @param code - Stock ticker, e.g. "VNM". Case-insensitive — normalised to
 *               uppercase internally.
 */
export function getAliasesForCode(code: string): string[] {
  return NORMALISED_ALIASES[code.toUpperCase()] ?? [];
}

/**
 * Detect which watchlistCodes have an alias appearing in text.
 *
 * Alias detection is purely substring-based (consistent with the
 * existing ticker scan in newsNormalizer.ts).
 *
 * Normalises text once, then checks each alias as a substring.
 * Returns a deduplicated list of matched codes. Order is not significant.
 * Returns [] for empty text, empty watchlist, or no match. Never throws.
 *
 * Performance note: the alias map is a static pre-built object (no I/O).
 * At 20 watchlist codes × ~7 aliases = ~140 substring checks per call.
 * For 500-char text this completes in < 1 ms.
 *
 * @param text           - Article title + summary concatenated
 * @param watchlistCodes - Ticker codes to check, e.g. ["VNM", "FPT"]
 */
export function detectStocksInText(
  text: string,
  watchlistCodes: string[],
): string[] {
  if (!text || watchlistCodes.length === 0) return [];

  const normText = normalizeText(text);
  const matched = new Set<string>();

  for (const code of watchlistCodes) {
    const upperCode = code.toUpperCase();
    const aliases = NORMALISED_ALIASES[upperCode];
    if (!aliases || aliases.length === 0) continue;

    for (const alias of aliases) {
      if (normText.includes(alias)) {
        matched.add(upperCode);
        break; // one alias match is enough for this code
      }
    }
  }

  return Array.from(matched);
}
