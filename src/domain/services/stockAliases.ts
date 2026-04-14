/**
 * Stock Catalog — Domain Service
 *
 * CANONICAL source of truth for Vietnamese stock ticker metadata:
 *   - Display name (companyName)
 *   - Searchable aliases (Vietnamese + English, with and without diacritics)
 *
 * Consumed by:
 *   - `stockSearch.ts`   — builds the user-facing MCP search catalogue by
 *                          merging STOCK_CATALOG with sector/exchange from
 *                          SECTOR_PEERS via getStockProfile().
 *   - `pollNews.ts`, `cascadeEngine.ts`, `legalRiskDetector.ts` — use
 *                          detectStocksInText() to spot ticker mentions in
 *                          free-text news articles.
 *
 * Design rules:
 * - Zero imports from infrastructure or application layers (DDD: domain-only).
 * - No runtime I/O, no side effects, no mutation.
 * - ONE place to add a ticker. To register a new stock end-to-end you need:
 *     1. `SECTOR_PEERS` in sectorPeers.ts   — classification + exchange
 *     2. `STOCK_CATALOG` in this file       — display name + aliases
 *     3. `mcp.config.json` market.watchlist — if it should be a default
 *
 * @module domain/services/stockAliases
 */

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a string for alias comparison:
 *   1. Unicode NFD decomposition (separates base chars from combining marks)
 *   2. Strip all Unicode combining marks (diacritics) via regex category \p{M}
 *   3. Lowercase
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
// STOCK_CATALOG — canonical ticker → { companyName, aliases }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single entry in the stock catalog.
 *
 * `aliases` must include at minimum:
 *   (a) Full Vietnamese company name (with diacritics)
 *   (b) Short trade name / brand
 *   (c) English name or accent-free variant
 *
 * Both diacritic and ascii-free variants should be present where possible —
 * callers normalise at comparison time via normalizeText().
 */
export interface StockCatalogEntry {
  companyName: string;
  aliases: string[];
}

export const STOCK_CATALOG: Record<string, StockCatalogEntry> = {
  // ─── Watchlist defaults ────────────────────────────────────────────────────
  VNM: {
    companyName: "Vinamilk",
    aliases: [
      "vinamilk", "sữa vinamilk", "sua vinamilk",
      "công ty cổ phần sữa việt nam", "cong ty co phan sua viet nam",
      "viet nam dairy", "vietnam dairy products", "vietnam dairy",
      "sua viet nam",
    ],
  },
  FPT: {
    companyName: "FPT Corporation",
    aliases: [
      "fpt", "fpt corporation", "tập đoàn fpt", "tap doan fpt",
      "công ty fpt", "cong ty fpt",
      "fpt software", "fpt telecom", "fpt group",
    ],
  },
  VCB: {
    companyName: "Vietcombank",
    aliases: [
      "vietcombank", "ngân hàng vietcombank", "ngan hang vietcombank",
      "bank for foreign trade of vietnam", "bank for foreign trade",
      "ngân hàng ngoại thương việt nam", "ngan hang ngoai thuong viet nam",
      "ngan hang ngoai thuong",
      "vietcombank bank",
    ],
  },
  VEA: {
    companyName: "VEAM",
    aliases: [
      "veam",
      "tổng công ty máy động lực và nông nghiệp việt nam",
      "tong cong ty may dong luc va nong nghiep viet nam",
      "vietnam engine and agricultural machinery",
      "vietnam engine",
      "may dong luc viet nam",
    ],
  },

  // ─── Banking ───────────────────────────────────────────────────────────────
  BID: {
    companyName: "BIDV",
    aliases: [
      "bidv", "ngân hàng bidv", "ngan hang bidv",
      "bank for investment and development of vietnam",
      "bank for investment and development",
      "ngân hàng đầu tư và phát triển việt nam",
      "ngan hang dau tu va phat trien viet nam",
      "ngan hang dau tu va phat trien",
    ],
  },
  CTG: {
    companyName: "VietinBank",
    aliases: [
      "vietinbank", "ngân hàng vietinbank", "ngan hang vietinbank",
      "vietnam joint stock commercial bank for industry and trade",
      "ngân hàng công thương việt nam",
      "ngan hang cong thuong viet nam",
      "ngan hang cong thuong",
      "vietin bank",
    ],
  },
  TCB: {
    companyName: "Techcombank",
    aliases: [
      "techcombank", "ngân hàng techcombank", "ngan hang techcombank",
      "technological commercial bank",
      "ngân hàng kỹ thương việt nam", "ngan hang ky thuong viet nam",
      "ngan hang ky thuong",
    ],
  },
  MBB: {
    companyName: "MB Bank",
    aliases: [
      "mb bank", "ngân hàng mb", "ngan hang mb",
      "military commercial bank",
      "ngân hàng quân đội", "ngan hang quan doi",
      "mb bank viet nam",
    ],
  },
  VPB: {
    companyName: "VPBank",
    aliases: [
      "vpbank", "ngân hàng vpbank", "ngan hang vpbank",
      "vietnam prosperity bank",
      "ngân hàng việt nam thịnh vượng", "ngan hang viet nam thinh vuong",
      "vp bank",
    ],
  },
  ACB: {
    companyName: "Asia Commercial Bank",
    aliases: [
      "ngân hàng á châu", "ngan hang a chau",
      "asia commercial bank", "asia commercial bank of vietnam",
      "ngân hàng acb", "ngan hang acb",
      "a chau bank",
    ],
  },
  HDB: {
    companyName: "HDBank",
    aliases: [
      "hdbank", "ngân hàng hdbank", "ngan hang hdbank",
      "ho chi minh city development bank",
      "ngân hàng phát triển thành phố hồ chí minh",
      "ngan hang phat trien thanh pho ho chi minh",
      "hd bank",
    ],
  },
  STB: {
    companyName: "Sacombank",
    aliases: [
      "sacombank", "ngân hàng sacombank", "ngan hang sacombank",
      "sài gòn thương tín", "sai gon thuong tin",
      "sai gon thuong tin commercial bank",
      "sacombank bank",
    ],
  },
  SHB: {
    companyName: "Saigon-Hanoi Bank",
    aliases: [
      "shb", "ngân hàng shb", "ngan hang shb",
      "saigon hanoi bank", "ngan hang sai gon ha noi",
      "ngân hàng sài gòn hà nội", "shb bank",
    ],
  },
  EIB: {
    companyName: "Eximbank",
    aliases: [
      "eximbank", "ngân hàng eximbank", "ngan hang eximbank",
      "vietnam export import bank",
      "ngân hàng xuất nhập khẩu việt nam",
      "ngan hang xuat nhap khau viet nam",
      "ngan hang xuat nhap khau",
    ],
  },
  TPB: {
    companyName: "TPBank",
    aliases: [
      "tpbank", "tien phong bank", "ngan hang tien phong", "tp bank",
    ],
  },

  // ─── Tech ──────────────────────────────────────────────────────────────────
  CMG: {
    companyName: "CMC Corporation",
    aliases: ["cmc", "cmc corporation", "tap doan cmc", "cong nghe cmc"],
  },
  ELC: {
    companyName: "Electricsun",
    aliases: ["elcom", "electricsun", "dien tu vien thong"],
  },
  SAM: {
    companyName: "SAM Holdings",
    aliases: ["sam holdings", "sam cables", "cap quang sam"],
  },

  // ─── Real estate ───────────────────────────────────────────────────────────
  VIC: {
    companyName: "Vingroup",
    aliases: [
      "vingroup", "tập đoàn vingroup", "tap doan vingroup",
      "vingroup corporation",
      "công ty vingroup", "cong ty vingroup",
      "vin group",
      // CEO name — frequently appears without "Vingroup" in article titles
      "phạm nhật vượng", "pham nhat vuong",
      "chủ tịch phạm nhật vượng", "chu tich pham nhat vuong",
    ],
  },
  VHM: {
    companyName: "Vinhomes",
    aliases: [
      "vinhomes",
      "công ty cổ phần vinhomes", "cong ty cp vinhomes",
      "vinhomes corporation",
      "vinhomes bất động sản", "vinhomes bat dong san",
      "vin homes",
    ],
  },
  NVL: {
    companyName: "Novaland",
    aliases: [
      "novaland", "nova land", "dia oc nova",
      "địa ốc nova", "tập đoàn novaland", "tap doan novaland",
      "novaland group", "công ty novaland", "cong ty novaland",
    ],
  },
  KDH: {
    companyName: "Khang Dien",
    aliases: ["khang dien", "nha khang dien", "khang dien house"],
  },
  DXG: {
    companyName: "Dat Xanh Group",
    aliases: ["dat xanh", "dat xanh group", "dia oc dat xanh"],
  },
  KBC: {
    companyName: "Kinh Bac City Development",
    aliases: [
      "kinh bac", "khu cong nghiep kinh bac",
      "kinh bac city", "bat dong san kinh bac",
      "kinh bac development",
    ],
  },
  HUT: {
    companyName: "Tasco JSC",
    aliases: [
      "tasco", "thu phi duong bo tasco",
      "tasco jsc", "hut tasco",
      "cong ty tasco",
    ],
  },
  DIG: {
    companyName: "DIC Corp",
    aliases: [
      "dic corp", "dia oc dic",
      "cong ty co phan dia oc dic",
      "dic corporation", "dic group",
    ],
  },
  PDR: {
    companyName: "Phat Dat Real Estate",
    aliases: [
      "phat dat", "bat dong san phat dat",
      "phat dat real estate", "phat dat corporation",
      "cong ty phat dat",
    ],
  },
  VRE: {
    companyName: "Vincom Retail",
    aliases: [
      "vincom retail", "vincom",
      "cong ty co phan vincom retail",
      "trung tam thuong mai vincom",
      "vincom center", "vincom plaza",
    ],
  },

  // ─── Steel ─────────────────────────────────────────────────────────────────
  HPG: {
    companyName: "Hoa Phat Group",
    aliases: [
      "hòa phát", "hoa phat",
      "tập đoàn hòa phát", "tap doan hoa phat",
      "hòa phát group", "hoa phat group",
      "hoa phat steel",
      "thép hòa phát", "thep hoa phat",
    ],
  },
  HSG: {
    companyName: "Hoa Sen Group",
    aliases: ["hoa sen", "tap doan hoa sen", "ton hoa sen"],
  },
  NKG: {
    companyName: "Nam Kim Steel",
    aliases: ["nam kim", "thep nam kim", "nam kim steel"],
  },
  TIS: {
    companyName: "Thai Nguyen Iron & Steel",
    aliases: ["tisco", "thai nguyen steel", "thep thai nguyen"],
  },
  POM: {
    companyName: "Pomina Steel",
    aliases: ["pomina", "thep pomina"],
  },

  // ─── Oil & Gas ─────────────────────────────────────────────────────────────
  GAS: {
    companyName: "PV Gas",
    aliases: [
      "pv gas", "pvgas", "petrovietnam gas",
      "tổng công ty khí việt nam", "tong cong ty khi viet nam",
      "pv gas corporation",
      "vietnam gas", "khi viet nam",
    ],
  },
  PLX: {
    companyName: "Petrolimex",
    aliases: [
      "petrolimex", "petrolimex group",
      "tập đoàn xăng dầu việt nam", "tap doan xang dau viet nam",
      "vietnam national petroleum group",
      "xang dau viet nam", "vietnam petroleum",
    ],
  },
  PVD: {
    companyName: "PetroVietnam Drilling",
    aliases: ["pvd", "khoan dau khi", "petrovietnam drilling"],
  },
  PVS: {
    companyName: "PetroVietnam Technical Services",
    aliases: ["pvs", "dich vu ky thuat dau khi", "petrovietnam technical"],
  },
  BSR: {
    companyName: "Binh Son Refining and Petrochemical",
    aliases: [
      "binh son", "loc dau binh son",
      "binh son refining", "binh son petrochemical",
      "loc hoa dau binh son", "bsr refinery",
    ],
  },

  // ─── Aviation ──────────────────────────────────────────────────────────────
  HVN: {
    companyName: "Vietnam Airlines",
    aliases: [
      "vietnam airlines",
      "hãng hàng không quốc gia việt nam",
      "hang hang khong quoc gia viet nam",
      "vietnam national airline",
      "hang khong viet nam",
      "hàng không việt nam",
    ],
  },
  VJC: {
    companyName: "VietJet Air",
    aliases: [
      "vietjet", "vietjet air", "vietjet aviation",
      "công ty cổ phần hàng không vietjet",
      "cong ty cp hang khong vietjet",
      "hang khong vietjet", "hàng không vietjet",
    ],
  },
  ACV: {
    companyName: "Airports Corporation of Vietnam",
    aliases: ["acv", "cang hang khong viet nam", "airports corporation"],
  },

  // ─── Retail / Consumer ────────────────────────────────────────────────────
  MWG: {
    companyName: "The Gioi Di Dong (Mobile World)",
    aliases: [
      "thế giới di động", "the gioi di dong",
      "mobile world",
      "công ty cổ phần đầu tư thế giới di động",
      "cong ty cp dau tu the gioi di dong",
      "điện máy xanh", "dien may xanh",
      "bach hoa xanh", "bách hóa xanh",
    ],
  },
  MSN: {
    companyName: "Masan Group",
    aliases: [
      "masan", "tập đoàn masan", "tap doan masan",
      "masan group", "masan consumer",
      "công ty masan", "cong ty masan",
    ],
  },
  PNJ: {
    companyName: "Phu Nhuan Jewelry",
    aliases: [
      "pnj",
      "công ty cổ phần vàng bạc đá quý phú nhuận",
      "cong ty cp vang bac da quy phu nhuan",
      "phu nhuan jewelry", "phú nhuận jewelry",
      "vàng bạc phú nhuận", "vang bac phu nhuan",
    ],
  },
  FRT: {
    companyName: "FPT Retail",
    aliases: [
      "fpt retail", "fpt shop", "fpt digital retail",
      "chuoi ban le fpt", "cong ty ban le fpt",
      "frt retail", "fpt retail jsc",
    ],
  },
  KDC: {
    companyName: "Kinh Do Corporation",
    aliases: [
      "kinh do", "kinh đô", "banh keo kinh do",
      "kinh do corporation", "mondelez kinh do",
      "cong ty cp kinh do", "thuc pham kinh do",
    ],
  },
  SAB: {
    companyName: "Sabeco",
    aliases: [
      "sabeco",
      "tổng công ty cổ phần bia rượu nước giải khát sài gòn",
      "tong cong ty cp bia ruou nuoc giai khat sai gon",
      "saigon beer", "saigon beer alcohol beverage",
      "bia saigon", "bia sài gòn",
    ],
  },

  // ─── Securities ────────────────────────────────────────────────────────────
  SSI: {
    companyName: "SSI Securities",
    aliases: [
      "ssi securities",
      "công ty chứng khoán ssi", "cong ty chung khoan ssi",
      "sai gon securities", "saigon securities",
      "chứng khoán ssi", "chung khoan ssi",
    ],
  },
  VND: {
    companyName: "VNDirect Securities",
    aliases: ["vndirect", "chung khoan vndirect"],
  },
  VIX: {
    companyName: "VIX Securities",
    aliases: [
      "vix securities", "chung khoan vix",
      "cong ty chung khoan vix", "vix chung khoan",
    ],
  },
  VCI: {
    companyName: "Viet Capital Securities",
    aliases: [
      "viet capital", "viet capital securities",
      "chung khoan ban viet", "ban viet securities",
      "cong ty chung khoan ban viet",
    ],
  },
  HCM: {
    companyName: "HCM Securities",
    aliases: ["chung khoan ho chi minh", "hcm securities"],
  },

  // ─── Utilities ─────────────────────────────────────────────────────────────
  GEX: {
    companyName: "Gelex Electric",
    aliases: [
      "gelex", "gelex electric", "cong ty gelex",
      "tap doan gelex", "dien co gelex",
      "gelex group",
    ],
  },
  REE: {
    companyName: "REE Corporation",
    aliases: [
      "ree", "ree corporation",
      "công ty cổ phần cơ điện lạnh ree",
      "cong ty co phan co dien lanh ree",
      "ree co dien lanh",
      "cơ điện lạnh ree", "co dien lanh ree",
      "ree refrigeration", "ree refrigeration engineering",
    ],
  },
  POW: {
    companyName: "PetroVietnam Power",
    aliases: ["petrovietnam power", "dien luc dau khi", "pv power"],
  },

  // ─── Agriculture ───────────────────────────────────────────────────────────
  DPM: {
    companyName: "Phu My Fertilizer",
    aliases: [
      "phu my", "phan bon phu my", "dam phu my",
      "petrovietnam fertilizer", "pvfcco",
      "cong ty phan bon va hoa chat dau khi",
      "fertilizer and chemicals phu my",
    ],
  },
  VHC: {
    companyName: "Vinh Hoan Corporation",
    aliases: ["vinh hoan", "ca tra vinh hoan", "pangasius vinh hoan"],
  },
  HAG: {
    companyName: "Hoang Anh Gia Lai",
    aliases: ["hoang anh gia lai", "hagl", "gia lai"],
  },

  // ─── Insurance ─────────────────────────────────────────────────────────────
  BVH: {
    companyName: "Bao Viet Holdings",
    aliases: ["bao viet", "bao viet holdings", "bao hiem bao viet"],
  },

  // ─── Pharma ────────────────────────────────────────────────────────────────
  DHG: {
    companyName: "Hau Giang Pharmaceutical",
    aliases: [
      "dược hậu giang", "duoc hau giang",
      "công ty cổ phần dược hậu giang",
      "cong ty co phan duoc hau giang",
      "hau giang pharmaceutical",
      "dược phẩm hậu giang", "duoc pham hau giang",
    ],
  },
  IMP: {
    companyName: "Imexpharm",
    aliases: ["imexpharm", "duoc pham imexpharm"],
  },

  // ─── Logistics ─────────────────────────────────────────────────────────────
  GMD: {
    companyName: "Gemadept",
    aliases: ["gemadept", "cang bien gemadept", "logistics gemadept"],
  },
  VTP: {
    companyName: "Viettel Post",
    aliases: [
      "viettel post",
      "chuyen phat nhanh viettel",
      "buu chinh viettel",
    ],
  },

  // ─── Automotive ────────────────────────────────────────────────────────────
  HAX: {
    companyName: "Hang Xanh Auto",
    aliases: ["hang xanh", "hang xanh auto", "dai ly oto hang xanh"],
  },

  // ─── Chemicals / Other ─────────────────────────────────────────────────────
  DGC: {
    companyName: "Duc Giang Chemicals",
    aliases: [
      "duc giang", "hoa chat duc giang",
      "duc giang chemicals", "cong ty hoa chat duc giang",
      "duc giang group",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Pre-normalised alias lookup (built once at module load)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-normalised alias map: all alias strings are passed through
 * normalizeText() once at module load. Call-time normalisation of
 * the incoming text is all that remains.
 */
const NORMALISED_ALIASES: Record<string, string[]> = (() => {
  const result: Record<string, string[]> = {};
  for (const [code, entry] of Object.entries(STOCK_CATALOG)) {
    result[code.toUpperCase()] = entry.aliases.map(normalizeText);
  }
  return result;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
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
 * Return the display name for a ticker, or null if unknown.
 *
 * @param code - Stock ticker, case-insensitive.
 */
export function getCompanyName(code: string): string | null {
  return STOCK_CATALOG[code.toUpperCase()]?.companyName ?? null;
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
 * At 50 watchlist codes × ~7 aliases = ~350 substring checks per call.
 * For 500-char text this completes in < 2 ms.
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
      if (isWordBoundaryMatch(normText, alias)) {
        matched.add(upperCode);
        break; // one alias match is enough for this code
      }
    }
  }

  return Array.from(matched);
}

/**
 * Check if `alias` appears in `text` as a whole-word match.
 * A match is valid only if the characters immediately before and after
 * the alias are non-alphanumeric (or start/end of string).
 *
 * This prevents "kinh do" from matching inside "kinh doanh" (business),
 * which caused KDC false positives on every article mentioning commerce.
 */
function isWordBoundaryMatch(text: string, alias: string): boolean {
  let startIdx = 0;
  while (true) {
    const idx = text.indexOf(alias, startIdx);
    if (idx === -1) return false;

    const beforeOk = idx === 0 || !isAlphanumeric(text[idx - 1]!);
    const afterIdx = idx + alias.length;
    const afterOk = afterIdx >= text.length || !isAlphanumeric(text[afterIdx]!);

    if (beforeOk && afterOk) return true;
    startIdx = idx + 1;
  }
}

function isAlphanumeric(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||  // 0-9
    (code >= 65 && code <= 90) ||  // A-Z
    (code >= 97 && code <= 122)    // a-z
  );
}
