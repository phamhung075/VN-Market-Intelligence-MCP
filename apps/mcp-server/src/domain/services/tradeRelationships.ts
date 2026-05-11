/**
 * Trade Relationships — Domain Service
 *
 * Maps Vietnamese stocks to their ACTUAL trade dependencies:
 *   - Export destinations (which countries buy from this company?)
 *   - Import sources (which countries supply raw materials?)
 *   - Key partners (joint ventures, parent companies)
 *   - Revenue exposure (% of revenue from each market)
 *
 * DESIGN: Hardcoded SEED data below is used to initialize the SQLite table
 * `trade_exposures` on first run. After that, the data lives in SQLite and
 * can be updated by:
 *   1. AI agent (market-analyst) via MCP tool `update_trade_exposure`
 *   2. Auto-learning from BCTC reports (revenue breakdown by geography)
 *   3. Auto-learning from news (e.g., "FPT signs $100M Japan deal")
 *
 * The hardcoded profiles are SEEDS, not the source of truth.
 * SQLite is the source of truth after first run.
 *
 * Layer: domain/services — pure types + seed data. I/O in infrastructure.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TradeExposure {
  /** Country or region */
  market: string;
  /** Approximate % of revenue from this market */
  revenuePct: number;
  /** Type of relationship */
  type: "export" | "import" | "joint_venture" | "subsidiary";
  /** What products/services */
  products: string;
}

export interface StockTradeProfile {
  code: string;
  companyName: string;
  /** Key trade exposures, ordered by revenue importance */
  exposures: TradeExposure[];
  /** Countries whose economic health directly impacts this stock */
  keySensitivities: string[];
  /** Vietnamese description of key trade dependencies */
  summaryVi: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Country/region keywords for cascade matching
// ─────────────────────────────────────────────────────────────────────────────

/** Maps country/region names to keywords that appear in news articles */
export const COUNTRY_KEYWORDS: Record<string, string[]> = {
  us: ["united states", "usa", "american", "mỹ", "hoa kỳ", "washington", "wall street", "u.s."],
  china: ["china", "chinese", "trung quốc", "beijing", "shanghai", "pmi china"],
  japan: ["japan", "japanese", "nhật bản", "tokyo", "boj", "honda", "toyota", "mitsubishi", "suzuki"],
  korea: ["korea", "korean", "hàn quốc", "seoul", "kospi"],
  eu: ["europe", "european", "eurozone", "châu âu", "ecb", "euro area"],
  asean: ["asean", "southeast asia", "đông nam á", "indonesia", "thailand", "philippines", "malaysia"],
  middle_east: ["middle east", "trung đông", "iran", "iraq", "saudi", "uae", "dubai", "hormuz", "opec"],
  australia: ["australia", "australian", "úc"],
  india: ["india", "indian", "ấn độ"],
  uk: ["united kingdom", "british", "anh quốc", "london"],
  taiwan: [
    "taiwan", "taiwanese", "đài loan", "taipei", "tsmc",
    "taiwan strait", "eo biển đài loan",
  ],
};

/** Keywords that need whole-word matching (too short for substring matching). */
const WHOLE_WORD_COUNTRY_KEYWORDS: Record<string, string[]> = {
  us: ["us", "fed"],
  eu: ["eu"],
  uk: ["uk"],
  japan: ["yen"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Stock trade profiles — based on real export/import data
// ─────────────────────────────────────────────────────────────────────────────

const TRADE_PROFILES: Record<string, StockTradeProfile> = {
  VNM: {
    code: "VNM",
    companyName: "Vinamilk",
    exposures: [
      { market: "vietnam", revenuePct: 80, type: "export", products: "Sữa, sản phẩm từ sữa" },
      { market: "middle_east", revenuePct: 8, type: "export", products: "Sữa xuất khẩu sang Iraq, UAE, Oman" },
      { market: "asean", revenuePct: 5, type: "export", products: "Sữa xuất khẩu sang Campuchia, Myanmar" },
      { market: "us", revenuePct: 3, type: "subsidiary", products: "Driftwood Dairy (công ty con tại Mỹ)" },
      { market: "china", revenuePct: 2, type: "export", products: "Sữa xuất khẩu sang TQ" },
    ],
    keySensitivities: ["middle_east", "asean"],
    summaryVi: "VNM: 80% nội địa, 8% Trung Đông (Iraq/UAE), 5% ASEAN. Chiến tranh Trung Đông ảnh hưởng trực tiếp xuất khẩu sữa.",
  },
  FPT: {
    code: "FPT",
    companyName: "FPT Corporation",
    exposures: [
      { market: "vietnam", revenuePct: 52, type: "export", products: "Viễn thông, CNTT nội địa" },
      { market: "japan", revenuePct: 22, type: "export", products: "IT outsourcing, digital transformation" },
      { market: "us", revenuePct: 12, type: "export", products: "IT services, cloud, AI" },
      { market: "eu", revenuePct: 8, type: "export", products: "IT outsourcing Đức, Pháp, Đan Mạch" },
      { market: "asean", revenuePct: 4, type: "export", products: "IT services khu vực" },
      { market: "korea", revenuePct: 2, type: "export", products: "Samsung partnership" },
    ],
    keySensitivities: ["japan", "us", "eu"],
    summaryVi: "FPT: 22% Nhật, 12% Mỹ, 8% EU — IT outsourcing. Suy thoái Nhật/Mỹ ảnh hưởng trực tiếp doanh thu.",
  },
  VCB: {
    code: "VCB",
    companyName: "Vietcombank",
    exposures: [
      { market: "vietnam", revenuePct: 92, type: "export", products: "Ngân hàng thương mại nội địa" },
      { market: "us", revenuePct: 3, type: "import", products: "Giao dịch ngoại hối USD, trái phiếu Mỹ" },
      { market: "japan", revenuePct: 2, type: "joint_venture", products: "Mizuho Bank đối tác chiến lược (15% cổ phần)" },
      { market: "china", revenuePct: 1, type: "export", products: "Thanh toán biên mậu" },
    ],
    keySensitivities: ["us", "japan"],
    summaryVi: "VCB: 92% nội địa nhưng nhạy cảm với FED (tỷ giá USD/VND, dòng vốn ngoại) và Mizuho (Nhật).",
  },
  HPG: {
    code: "HPG",
    companyName: "Hòa Phát Group",
    exposures: [
      { market: "vietnam", revenuePct: 65, type: "export", products: "Thép xây dựng, ống thép nội địa" },
      { market: "asean", revenuePct: 15, type: "export", products: "Xuất khẩu thép sang Campuchia, Lào, Myanmar" },
      { market: "china", revenuePct: 5, type: "import", products: "Nhập quặng sắt, than cốc từ TQ" },
      { market: "australia", revenuePct: 5, type: "import", products: "Nhập quặng sắt từ Úc" },
      { market: "eu", revenuePct: 5, type: "export", products: "Xuất khẩu HRC sang EU (rủi ro chống bán phá giá)" },
      { market: "india", revenuePct: 3, type: "export", products: "Xuất thép sang Ấn Độ" },
    ],
    keySensitivities: ["china", "asean", "australia", "eu"],
    summaryVi: "HPG: 65% nội địa, 15% ASEAN, nhập quặng từ TQ/Úc. TQ siết tín dụng → giá quặng giảm (tích cực chi phí). EU áp thuế → rủi ro xuất khẩu.",
  },
  VEA: {
    code: "VEA",
    companyName: "VEAM (Honda/Toyota/Ford JV)",
    exposures: [
      { market: "japan", revenuePct: 55, type: "joint_venture", products: "Honda VN (30% vốn), Toyota VN (20% vốn) — cổ tức ~6000 tỷ/năm" },
      { market: "us", revenuePct: 25, type: "joint_venture", products: "Ford VN (25% vốn) — cổ tức ~350 tỷ/năm" },
      { market: "vietnam", revenuePct: 15, type: "export", products: "Máy nông nghiệp, xe tải nhẹ" },
    ],
    keySensitivities: ["japan", "us"],
    summaryVi: "VEA: 80% lợi nhuận từ cổ tức Honda/Toyota/Ford VN. Suy thoái ô tô Nhật/Mỹ ảnh hưởng trực tiếp.",
  },
  DHG: {
    code: "DHG",
    companyName: "Dược Hậu Giang",
    exposures: [
      { market: "vietnam",  revenuePct: 85, type: "export",  products: "Dược phẩm nội địa" },
      { market: "china",    revenuePct: 40, type: "import",  products: "API/nguyên liệu dược từ TQ (~40% chi phí)" },
      { market: "india",    revenuePct: 20, type: "import",  products: "API/nguyên liệu dược từ Ấn Độ (~20% chi phí)" },
    ],
    keySensitivities: ["china", "india"],
    summaryVi: "DHG: 85% doanh thu nội địa. Phụ thuộc nhập khẩu API từ TQ (40%) và Ấn Độ (20%). TQ/Ấn Độ siết xuất khẩu dược → rủi ro chi phí.",
  },
  GMD: {
    code: "GMD",
    companyName: "Gemadept",
    exposures: [
      { market: "asean",   revenuePct: 25, type: "export",  products: "Vận tải biển khu vực ASEAN" },
      { market: "china",   revenuePct: 15, type: "export",  products: "Port calls TQ" },
      { market: "korea",   revenuePct: 5,  type: "import",  products: "Nhập thiết bị cảng từ Hàn Quốc" },
      { market: "japan",   revenuePct: 5,  type: "import",  products: "Nhập thiết bị cảng từ Nhật" },
      { market: "vietnam", revenuePct: 50, type: "export",  products: "Cảng nội địa, kho bãi logistics" },
    ],
    keySensitivities: ["asean", "china"],
    summaryVi: "GMD: 25% ASEAN sea freight, 15% TQ port calls. Xung đột biển Đông / Đài Loan ảnh hưởng trực tiếp tuyến vận chuyển.",
  },
  CTD: {
    code: "CTD",
    companyName: "Coteccons",
    exposures: [
      { market: "vietnam", revenuePct: 90, type: "export",  products: "Xây dựng dân dụng và công nghiệp nội địa" },
      { market: "china",   revenuePct: 8,  type: "import",  products: "Thép xây dựng, máy móc từ TQ" },
      { market: "korea",   revenuePct: 2,  type: "import",  products: "Máy móc thiết bị từ Hàn Quốc" },
    ],
    keySensitivities: ["china"],
    summaryVi: "CTD: 90% nội địa. Nhập vật liệu xây dựng từ TQ (8%). Ít nhạy cảm với địa chính trị, chủ yếu rủi ro chi phí thép/vật liệu.",
  },
  NKG: {
    code: "NKG",
    companyName: "Nam Kim Steel",
    exposures: [
      { market: "vietnam", revenuePct: 55, type: "export",  products: "Thép cuộn cán nguội, tôn mạ nội địa" },
      { market: "asean",   revenuePct: 20, type: "export",  products: "Xuất khẩu thép sang ASEAN" },
      { market: "eu",      revenuePct: 10, type: "export",  products: "Xuất khẩu tôn mạ sang EU (rủi ro chống bán phá giá)" },
      { market: "china",   revenuePct: 35, type: "import",  products: "Nhập HRC coil từ TQ (~35% chi phí)" },
      { market: "taiwan",  revenuePct: 15, type: "import",  products: "Nhập HRC coil từ Đài Loan (~15% chi phí)" },
    ],
    keySensitivities: ["china", "taiwan", "asean", "eu"],
    summaryVi: "NKG: 20% ASEAN + 10% EU xuất khẩu. Nhập HRC từ TQ (35%) và Đài Loan (15%). Căng thẳng Đài Loan → gián đoạn nguồn cung HRC.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Checks if a short keyword appears as a whole word (not a substring of another word). */
function matchesWholeWord(text: string, word: string): boolean {
  const regex = new RegExp(`\\b${word}\\b`, "i");
  return regex.test(text);
}

/**
 * Returns the trade profile for a stock, or null if not mapped.
 */
export function getTradeProfile(code: string): StockTradeProfile | null {
  return TRADE_PROFILES[code] ?? null;
}

/**
 * Returns all stocks that have significant exposure to a country/region.
 *
 * @param country - Country key (e.g., "japan", "middle_east", "us")
 * @param minExposurePct - Minimum revenue % exposure to include (default: 5)
 * @returns Array of { code, exposure } for stocks exposed to this country
 */
export function getStocksExposedToCountry(
  country: string,
  minExposurePct = 5,
): { code: string; exposure: TradeExposure }[] {
  const results: { code: string; exposure: TradeExposure }[] = [];

  for (const [code, profile] of Object.entries(TRADE_PROFILES)) {
    for (const exp of profile.exposures) {
      if (exp.market === country && exp.revenuePct >= minExposurePct) {
        results.push({ code, exposure: exp });
      }
    }
  }

  return results.sort((a, b) => b.exposure.revenuePct - a.exposure.revenuePct);
}

/**
 * Detects which country/region a news article is about, based on keywords.
 *
 * @param text - Article title + content
 * @returns Array of detected countries, ordered by keyword match count
 */
export function detectCountries(text: string): string[] {
  const lower = text.toLowerCase();
  const counts: { country: string; matches: number }[] = [];

  for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    let matchCount = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) matchCount++;
    }
    // Also check whole-word keywords (short terms like "us", "eu", "uk", "fed")
    const wholeWordKws = WHOLE_WORD_COUNTRY_KEYWORDS[country];
    if (wholeWordKws) {
      for (const kw of wholeWordKws) {
        if (matchesWholeWord(lower, kw)) matchCount++;
      }
    }
    if (matchCount > 0) {
      counts.push({ country, matches: matchCount });
    }
  }

  return counts
    .sort((a, b) => b.matches - a.matches)
    .map((c) => c.country);
}

/** Product/industry keywords per stock — article must mention these to be relevant.
 * IMPORTANT: Short keywords like "xe", "ai", "it" cause false positives via substring
 * matching (e.g., "fixed" contains "xe", "affordable" contains "ford").
 * Use word-boundary-safe terms or multi-word phrases instead. */
const STOCK_RELEVANCE_KEYWORDS: Record<string, string[]> = {
  // VNM: dairy/milk-specific only. "consumer", "food", "tiêu dùng" were too generic
  // (CPI articles, retail/consumer-confidence reports were bridging into Middle East
  //  cascades via the body text). See reports 982/983/988 — Loop #32 false positives.
  VNM: ["dairy", "milk", "sữa", "vinamilk", "vinamil", "infant formula", "yogurt", "sữa chua"],
  FPT: ["technology", "outsourcing", "software", "cloud", "digital", "công nghệ", "phần mềm", "fpt"],
  VCB: ["bank", "ngân hàng", "credit", "tín dụng", "lending", "interest rate", "lãi suất", "forex", "ngoại hối"],
  HPG: ["steel", "thép", "iron ore", "quặng", "xây dựng", "hrc", "hòa phát"],
  VEA: ["automotive", "automobile", "vehicle", "honda", "toyota", "ô tô", "xe hơi", "xe ô tô", "veam", "motor vehicle"],
  DHG: ["dược", "pharma", "pharmaceutical", "thuốc", "api", "dược hậu giang", "dhg"],
  GMD: ["logistics", "cảng", "vận tải biển", "container", "gemadept", "gmd", "freight"],
  CTD: ["xây dựng", "construction", "coteccons", "ctd", "nhà thầu"],
  NKG: ["thép", "steel", "hrc", "nam kim", "nkg", "cuộn cán nguội"],
};

/**
 * For a given news article, determines which watchlist stocks are impacted
 * based on their trade relationships with the detected countries.
 *
 * IMPORTANT: Only returns impacts when the article is RELEVANT to the stock's
 * business — not just because it mentions a country. "Euro rebounds on Iran"
 * should NOT trigger VEA/Ford just because Iran is in the Middle East.
 *
 * Relevance check: article must contain at least one keyword related to the
 * stock's products/industry (from STOCK_RELEVANCE_KEYWORDS).
 *
 * @param text - Article title + content
 * @param watchlistCodes - Codes to check
 * @returns Array of { code, country, revenuePct, reasoning }
 */
export function analyzeTradeImpact(
  text: string,
  watchlistCodes: string[],
): { code: string; country: string; revenuePct: number; reasoning: string }[] {
  const countries = detectCountries(text);
  if (countries.length === 0) return [];

  const lower = text.toLowerCase();
  const impacts: { code: string; country: string; revenuePct: number; reasoning: string }[] = [];

  for (const code of watchlistCodes) {
    const profile = TRADE_PROFILES[code];
    if (!profile) continue;

    // Relevance gate: article must mention the stock's industry/products
    // OR mention the stock code directly (whole word only)
    const keywords = STOCK_RELEVANCE_KEYWORDS[code] ?? [];
    const isRelevant = keywords.some((kw) => lower.includes(kw)) ||
                       matchesWholeWord(lower, code.toLowerCase());
    if (!isRelevant) continue;

    for (const country of countries) {
      for (const exp of profile.exposures) {
        if (exp.market === country && exp.revenuePct >= 5) {
          impacts.push({
            code,
            country,
            revenuePct: exp.revenuePct,
            reasoning: `${code} có ${exp.revenuePct}% doanh thu từ ${country} (${exp.products})`,
          });
        }
      }
    }
  }

  return impacts.sort((a, b) => b.revenuePct - a.revenuePct);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Exposure Updates (Sprint 041 — Task 255)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Data extracted from a BCTC report for updating trade exposure weights.
 */
export interface BctcExposureData {
  /** % of revenue from exports */
  exportRevenuePct?: number;
  /** % of costs from imports */
  importCostPct?: number;
  /** Primary export/import market (country key) */
  primaryMarket?: string;
  /** Source of update: "bctc" | "news" | "manual" */
  source?: string;
}

/**
 * In-memory cache of dynamic exposure updates.
 * SQLite persistence is handled by tradeStore.ts (infrastructure layer).
 * This in-memory cache is queried by getDynamicExposure() for hot reads.
 */
const _dynamicExposureCache = new Map<string, BctcExposureData & { updatedAt: string }>();

/**
 * Updates trade exposure weights for a stock based on BCTC data.
 *
 * This is a pure domain operation — it updates the in-memory cache.
 * Infrastructure persistence (SQLite) is handled separately by tradeStore.ts.
 *
 * Called after parseBctcReport() when geographic revenue breakdown is available.
 *
 * @param code - Stock ticker (e.g. "HPG", "VNM")
 * @param data - Extracted exposure data from BCTC or news
 */
export function updateExposureFromBctc(
  code: string,
  data: BctcExposureData,
): void {
  _dynamicExposureCache.set(code, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Returns the latest dynamic exposure update for a stock, or null if not updated.
 *
 * @param code - Stock ticker
 */
export function getDynamicExposure(
  code: string,
): (BctcExposureData & { updatedAt: string }) | null {
  return _dynamicExposureCache.get(code) ?? null;
}

/**
 * Clears all dynamic exposure cache entries.
 * Used in tests to reset state.
 */
export function clearDynamicExposureCache(): void {
  _dynamicExposureCache.clear();
}
