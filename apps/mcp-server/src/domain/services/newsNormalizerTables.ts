/**
 * News Normalizer — Keyword & Lookup Data Tables (FACTORY-DOMAIN-split-newsNormalizer)
 *
 * Pure data module: keyword lists, domain lookup maps, currency/geographic
 * disambiguation maps, and the known-ticker set consumed by
 * `newsNormalizerHelpers.ts` and `newsNormalizer.ts`.
 *
 * This is a verbatim, behavior-preserving extraction — no entry added,
 * removed, reordered, or reworded. The classification ALGORITHM that reads
 * these tables stays in `newsNormalizerHelpers.ts` / `newsNormalizer.ts`.
 *
 * Layer: domain/services — must not import from application/ or infrastructure/.
 */

import type { DomainType } from "../../../bctc-schema.js";

export const GLOBAL_KEYWORDS: string[] = [
  "fed",
  "fomc",
  "federal reserve",
  "oil price",
  "crude oil",
  "opec",
  "usd",
  "us dollar",
  "gdp",
  "inflation",
  "interest rate",
  "rate hike",
  "rate cut",
  "world bank",
  "imf",
  "g7",
  "g20",
  "nasdaq",
  "dow jones",
  "s&p 500",
  "s&p500",
  "giá dầu",
  "dầu thô",
  "fed tăng lãi suất",
  "fed cắt giảm",
  "lạm phát toàn cầu",
  "chiến tranh thương mại",
];

export const COUNTRY_KEYWORDS: string[] = [
  "vn-index",
  "vnindex",
  "hose",
  "hnx",
  "upcom",
  "sbv",
  "nhnn",
  "ngân hàng nhà nước",
  "state bank of vietnam",
  "chính phủ việt nam",
  "bộ tài chính",
  "bộ kế hoạch đầu tư",
  "vietnam",
  "việt nam",
  "vnd",
  "đồng việt nam",
  "thị trường chứng khoán việt",
  "ủy ban chứng khoán",
];

export const DOMAIN_KEYWORD_MAP: Record<DomainType, string[]> = {
  oil_gas: [
    "dầu khí",
    "khí đốt",
    "petrovietnam",
    "pvn",
    "xăng dầu",
    "giá xăng",
    "pvgas",
    "pvd",
    "oil",
    "gas",
    "petroleum",
    "lng",
  ],
  banking: [
    "ngân hàng",
    "bank",
    "lãi suất",
    "tín dụng",
    "huy động vốn",
    "npl",
    "nợ xấu",
    "vcb",
    "vietcombank",
    "bidv",
    "vietinbank",
    "tcb",
    "techcombank",
    "vpbank",
    "mb bank",
    "sacombank",
    "acb",
    "banking sector",
  ],
  real_estate: [
    "bất động sản",
    "real estate",
    "căn hộ",
    "nhà đất",
    "phân khúc",
    "dự án nhà ở",
    "vingroup",
    "vinhomes",
    "novaland",
    "phát đạt",
    "khang điền",
    "property",
    "housing",
  ],
  steel: [
    "thép",
    "steel",
    "hòa phát",
    "hsg",
    "nkg",
    "hpg",
    "tôn mạ",
    "cuộn cán",
    "phôi thép",
    "giá thép",
    "iron ore",
    "quặng sắt",
  ],
  aviation: [
    "hàng không",
    "aviation",
    "vietnam airlines",
    "hvn",
    "vietjet",
    "vjc",
    "máy bay",
    "sân bay",
    "airport",
    "airline",
    "nhiên liệu bay",
    "jet fuel",
  ],
  retail: [
    "bán lẻ",
    "retail",
    "mwg",
    "thế giới di động",
    "frt",
    "fpt retail",
    "dgw",
    "digiworld",
    "siêu thị",
    "chuỗi bán lẻ",
    "consumer electronics",
  ],
  tech: [
    "công nghệ",
    "technology",
    "tech",
    "fpt",
    "cmg",
    "phần mềm",
    "software",
    "it",
    "digital",
    "chuyển đổi số",
    "fintech",
    "startup",
  ],
  utilities: [
    "điện",
    "electricity",
    "năng lượng",
    "energy",
    "ree",
    "pc1",
    "pow",
    "điện lực",
    "evn",
    "thủy điện",
    "hydropower",
    "solar",
    "wind",
  ],
  agriculture: [
    "nông nghiệp",
    "agriculture",
    "thủy sản",
    "seafood",
    "hag",
    "vhc",
    "anv",
    "lúa gạo",
    "rice",
    "cà phê",
    "coffee",
    "cây trồng",
    "xuất khẩu nông sản",
  ],
  insurance: [
    "bảo hiểm",
    "insurance",
    "bvh",
    "baoviet",
    "pvi",
    "tái bảo hiểm",
    "reinsurance",
    "life insurance",
    "bảo hiểm nhân thọ",
  ],
  securities: [
    "chứng khoán",
    "securities",
    "ssi",
    "vnd",
    "hcm",
    "môi giới",
    "broker",
    "margin",
    "ký quỹ",
    "tự doanh",
    "custodian",
  ],
  pharma: [
    "dược",
    "pharma",
    "dhg",
    "imp",
    "dmc",
    "thuốc",
    "medicine",
    "pharmaceutical",
    "y tế",
    "healthcare",
    "vaccine",
  ],
  logistics: [
    "logistics",
    "vận tải",
    "vận chuyển",
    "kho vận",
    "chuỗi cung ứng",
    "supply chain",
    "gmd",
    "gemadept",
    "stg",
    "sotrans",
    "vtp",
    "viettelpost",
    "freight",
    "shipping",
    "cảng",
    "port",
  ],
  gold_mining: [
    "vàng",
    "gold",
    "pnj",
    "sjc",
    "khai thác vàng",
    "gold mining",
    "precious metals",
    "kim loại quý",
  ],
  automotive: [
    "ô tô",
    "xe hơi",
    "xe máy",
    "honda",
    "toyota",
    "ford",
    "veam",
    "automotive",
    "automobile",
    "lắp ráp ô tô",
    "công nghiệp ô tô",
  ],
  construction: [
    "xây dựng",
    "hạ tầng",
    "cao tốc",
    "cầu đường",
    "đầu tư công",
    "capex",
    "infrastructure",
    "construction",
    "hhv",
    "ctd",
    "vcg",
  ],
  energy: [
    "năng lượng tái tạo",
    "điện mặt trời",
    "điện gió",
    "solar",
    "wind power",
    "geg",
    "renewable energy",
    "điện sạch",
  ],
  machinery: [
    "máy móc",
    "công nghiệp",
    "cơ khí",
    "machinery",
    "industrial",
    "manufacturing",
    "dag",
    "da nang rubber",
    "cao su đà nẵng",
    "thiết bị công nghiệp",
  ],
  pharmaceutical: [
    "dược phẩm",
    "pharmaceutical",
    "dược hậu giang",
    "imexpharm",
    "bidiphar",
    "pymepharco",
    "traphaco",
    "opc pharma",
    "thuốc điều trị",
    "đăng ký lưu hành",
    "cục quản lý dược",
    "dav",
    "bệnh viện công",
    "đấu thầu thuốc",
    "vaccine distributor",
  ],
  chemicals: [
    "hóa chất",
    "phân bón",
    "dầu thô",
    "petrochemical",
    "chemical",
    "dgc",
    "dpm",
  ],
  other: [],
};

export const BULLISH_KEYWORDS: string[] = [
  "tăng",
  "tăng trưởng",
  "lợi nhuận tăng",
  "vượt kế hoạch",
  "vượt dự báo",
  "khởi sắc",
  "tích cực",
  "surge",
  "rise",
  "rally",
  "growth",
  "profit",
  "beats",
  "exceeds",
  "bullish",
  "up",
  "higher",
  "strong",
  "record",
];

export const BEARISH_KEYWORDS: string[] = [
  "giảm",
  "giảm mạnh",
  "thua lỗ",
  "khủng hoảng",
  "sụt giảm",
  "tiêu cực",
  "rủi ro",
  "fall",
  "drop",
  "decline",
  "loss",
  "crash",
  "crisis",
  "bearish",
  "down",
  "lower",
  "weak",
  "miss",
  "disappoints",
];

/**
 * Known VN stock tickers (HOSE / HNX / UPCOM).
 * Used for action-level classification and affectedActions population.
 */
export const KNOWN_VN_STOCKS: Set<string> = new Set([
  // Banking
  "VCB", "BID", "CTG", "TCB", "VPB", "MBB", "STB", "ACB", "HDB", "EIB",
  // Oil & Gas
  "GAS", "PVD", "PVS", "OIL", "PLX", "BSR",
  // Real Estate
  "VIC", "VHM", "NVL", "PDR", "KDH", "DXG", "NLG",
  // Steel
  "HPG", "HSG", "NKG",
  // Aviation
  "HVN", "VJC",
  // Retail
  "MWG", "FRT", "DGW",
  // Tech
  "FPT", "CMG",
  // Utilities
  "REE", "PC1", "POW",
  // Agriculture
  "HAG", "VHC", "ANV",
  // Insurance
  "BVH", "PVI",
  // Securities
  "SSI", "VND", "HCM",
  // Pharma
  "DHG", "IMP", "DMC",
  // Others
  "VNM", "SAB", "MSN",
]);

/**
 * Currency-context exclusion map.
 * Key: uppercase ticker that shares its name with a currency/unit abbreviation.
 * Value: lowercase context tokens — if any appear in the 40-char window around
 *        a Pattern-2 match, that match is discarded as a currency reference.
 *
 * Task 1198: guard "VND" (VNDirect Securities) against ISO-4217 currency hits
 * in forex articles (e.g. "USD/VND tăng", "tỷ giá USD/VND").
 * Pattern 1 (parenthetical) is NOT guarded — "(VND)" always means the ticker.
 */
export const CURRENCY_CONTEXT_MAP: Map<string, string[]> = new Map([
  [
    "VND",
    [
      "usd/vnd", "vnd/usd", "tỷ giá", "exchange rate",
      "đồng/usd", "billion vnd", "tỷ vnd", "nghìn tỷ vnd",
      "triệu vnd", "tỷ đồng", "nghìn tỷ đồng", "mệnh giá",
      "currency", "/vnd", "vnd/",
    ],
  ],
]);

/**
 * Geographic-context exclusion map — Task 1788.
 *
 * Certain VN stock tickers share their code with Vietnamese city / province
 * abbreviations. When those abbreviations appear in text, Pattern 2 extracts
 * the code as a false-positive ticker alert.
 *
 * Key: uppercase ticker code.
 * Value: lowercase substrings that, when found in the 10-character window
 *        IMMEDIATELY BEFORE the matched token (look-behind), indicate the
 *        token is a geographic reference, not a stock ticker.
 *
 * Example (Task 1788):
 *   "TP.HCM" → dot is a \b boundary → Pattern 2 extracts "HCM"
 *   "TP HCM" → space is a \b boundary → Pattern 2 extracts "HCM"
 *   "TPHCM"  → H starts a new word at boundary → Pattern 2 extracts "HCM"
 *
 * Pattern 1 (parenthetical "HCM") is NOT guarded — "(HCM)" always means
 * the securities company ticker.
 *
 * Look-behind window: 10 chars (covers "tphcm ", "tp.hcm", "tp hcm" etc.)
 */
export const GEOGRAPHIC_CONTEXT_MAP: Map<string, string[]> = new Map([
  [
    "HCM",
    [
      "tp.hcm", "tp hcm", "tphcm",
      "tp.", "tp ",
      "tp. hcm",  // dot-space variant — belt-and-suspenders for TP. HCM (HCM-D1)
      "tp-hcm",   // hyphen variant — genuine gap (HCM-D1)
      "thành phố hồ chí minh", "thanh pho ho chi minh",
      "thành phố hcm", "thanh pho hcm",
    ],
  ],
]);

/**
 * Vietnamese display labels for each DomainType.
 * Partial<Record> enables safe fallback: DOMAIN_VN_LABEL[d] ?? null
 * Unknown/unsupported DomainType → undefined → omit domain segment (no crash).
 */
export const DOMAIN_VN_LABEL: Partial<Record<string, string>> = {
  oil_gas:       "dầu khí",
  banking:       "ngân hàng",
  real_estate:   "bất động sản",
  steel:         "thép",
  aviation:      "hàng không",
  retail:        "bán lẻ",
  tech:          "công nghệ",
  utilities:     "điện",
  agriculture:   "nông nghiệp",
  insurance:     "bảo hiểm",
  securities:    "chứng khoán",
  pharma:        "dược phẩm",
  logistics:     "vận tải",
  gold_mining:   "vàng",
  automotive:    "ô tô",
  construction:  "xây dựng",
  energy:        "năng lượng tái tạo",
};
