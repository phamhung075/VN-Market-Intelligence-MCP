/**
 * SECTOR_RULES — sector impact cascade rule table
 *
 * size-justification: ~2040L — a single flat data table (SectorRule[]) of
 * keyword→domain cascade rules built up incrementally across dozens of tasks
 * (VN policy overrides, war/geopolitical, macro, sector-specific: oil/gas,
 * banking, real estate, aviation, steel, retail, agriculture, brokerage, etc.).
 * Every entry is an independent, order-sensitive literal object — first
 * matching rule per domain wins (see buildCausalChain in cascadeEngine.ts).
 * Splitting by sub-domain would fragment a rule ordering contract that spans
 * the whole table and gain no maintainability (each entry is already a
 * self-contained 1-6 line literal; the size comes from rule COUNT, not
 * structural complexity). Extracted verbatim from cascadeEngine.ts
 * (FACTORY-DOMAIN-split-cascade-engine, Step 1) — pure data move, no
 * behavior change. Consumed via the cascade/rules barrel.
 *
 * Layer: domain/services
 */

import type { DomainType } from "../../../../../bctc-schema";
import type { ImpactDirection } from "../../newsNormalizer.js";

export interface SectorRule {
  /** Any single keyword match triggers this rule */
  keywords: string[];
  domain: DomainType;
  direction: ImpactDirection;
  confidence: number;
  /** Human-readable rule description, used as CausalChainEntry.title */
  title: string;
  /** Optional: explicitly map rule to specific tickers (Task 1264) */
  affected_actions?: { code: string; direction: ImpactDirection }[];
  /**
   * Optional exclusion guard (FIX-1298/1299): if ANY of these keywords appear
   * in the article summary, the rule is skipped — even if a trigger keyword matched.
   * Use to prevent broad keyword rules from firing on unrelated contexts
   * (e.g., "geopolitical" in Fed/monetary articles should not trigger oil_gas cascade).
   */
  excludeKeywords?: string[];
  /**
   * Optional co-occurrence requirement (FIX-1298/1299): when set, the rule
   * only fires if AT LEAST ONE of these keywords is ALSO present in the article.
   * Use to narrow broad rules: e.g., coal/minerals rule only fires when oil/energy
   * context is also present.
   */
  requireAnyKeyword?: string[];
}

export const SECTOR_RULES: SectorRule[] = [
  // ── VN POLICY INTERVENTION OVERRIDE (must be FIRST — wins over war/recession bear rules) ──
  // Reports 920/922: when Vietnam government announces stabilization fund / market support
  // measures, the bullish policy RESPONSE must override bearish triggering-event keywords
  // ("war", "tariff", "decline") that may co-occur in the same article. First-match-wins
  // per domain (see line ~1503), so these rules MUST appear before the bearish rules below.
  {
    keywords: [
      "stabilization fund",
      "stock market support measures",
      "market support measures",
      "government stock market support",
      "government-backed",
      "government support package",
      "stimulus package",
      "quỹ bình ổn",
      "bình ổn thị trường",
      "chính phủ hỗ trợ thị trường",
      "biện pháp hỗ trợ thị trường",
      "hỗ trợ thị trường chứng khoán",
      "gói kích thích",
      "gói hỗ trợ",
      "nới room ngoại",
      "nới room khối ngoại",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.82,
    title: "Chính phủ can thiệp hỗ trợ thị trường — bullish reversal catalyst (CTCK hưởng lợi trực tiếp)",
  },
  {
    keywords: [
      "stabilization fund",
      "stock market support measures",   // FIX-1268: English exact phrase from article titles
      "market support measures",
      "government stock market support", // FIX-1268: English variant
      "quỹ bình ổn",
      "bình ổn thị trường",
      "chính phủ hỗ trợ thị trường",
      "hỗ trợ thị trường chứng khoán",  // FIX-1268: Vietnamese stock-market specific phrase
      "gói kích thích",
      "gói hỗ trợ",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.75,
    title: "Gói hỗ trợ thị trường — thanh khoản hệ thống cải thiện, tích cực cho ngân hàng",
  },
  {
    keywords: [
      "stabilization fund",
      "market support measures",
      "quỹ bình ổn",
      "bình ổn thị trường",
      "gói kích thích",
      "gói hỗ trợ",
    ],
    domain: "real_estate",
    direction: "up",
    confidence: 0.70,
    title: "Gói hỗ trợ — kỳ vọng dòng tiền chảy lại BĐS",
  },
  {
    keywords: [
      "stabilization fund",
      "market support measures",
      "quỹ bình ổn",
      "bình ổn thị trường",
      "gói kích thích",
      "gói hỗ trợ",
    ],
    domain: "retail",
    direction: "up",
    confidence: 0.65,
    title: "Gói hỗ trợ — tâm lý tiêu dùng cải thiện, tích cực bán lẻ",
  },

  // ── Task 1004: SBV / NHNN rate cut — direct monetary easing ──────────────
  // Must appear BEFORE generic "lãi suất giảm" rule so specific SBV
  // stabilization wins first-match-wins per domain for banking + securities.
  {
    keywords: [
      "nhnn hạ lãi suất", "ngân hàng nhà nước hạ lãi suất", "sbv rate cut",
      "hạ lãi suất điều hành", "giảm lãi suất điều hành", "cắt giảm lãi suất điều hành",
      "sbv cuts rate", "nhnn cắt giảm lãi suất", "hạ lãi suất tái cấp vốn",
      "giảm lãi suất tái chiết khấu", "nới lỏng tiền tệ", "monetary easing vietnam",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.87,
    title: "NHNN hạ lãi suất điều hành — NIM ngắn hạn điều chỉnh, thanh khoản hệ thống cải thiện",
  },
  {
    keywords: [
      "nhnn hạ lãi suất", "hạ lãi suất điều hành", "giảm lãi suất điều hành",
      "sbv rate cut", "nhnn cắt giảm lãi suất", "nới lỏng tiền tệ",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.85,
    title: "NHNN hạ lãi suất — chi phí vốn giảm, P/E thị trường mở rộng (CTCK hưởng lợi)",
  },
  {
    keywords: [
      "nhnn hạ lãi suất", "hạ lãi suất điều hành", "giảm lãi suất điều hành",
      "sbv rate cut", "nới lỏng tiền tệ",
    ],
    domain: "real_estate",
    direction: "up",
    confidence: 0.82,
    title: "NHNN hạ lãi suất — lãi vay mua nhà giảm, tích cực cho bất động sản trung dài hạn",
  },

  // ── Task 1004: Fiscal stimulus / Bơm tiền ngân sách ─────────────────────
  {
    keywords: [
      "bộ tài chính bơm tiền", "ngân sách nhà nước bơm tiền", "fiscal stimulus vietnam",
      "gói kích thích tài khóa", "tăng đầu tư công khẩn cấp", "bơm vốn vào thị trường",
      "government cash injection", "giải ngân đầu tư công khẩn cấp",
      "thúc đẩy giải ngân vốn đầu tư công", "gói phục hồi kinh tế",
      "chương trình phục hồi kinh tế", "economic recovery package vietnam",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.88,
    title: "Bơm tiền tài khóa — thanh khoản thị trường cải thiện mạnh, CTCK hưởng lợi trực tiếp",
  },
  {
    keywords: [
      "bộ tài chính bơm tiền", "gói kích thích tài khóa", "tăng đầu tư công khẩn cấp",
      "bơm vốn vào thị trường", "gói phục hồi kinh tế", "giải ngân đầu tư công khẩn cấp",
      "chương trình phục hồi kinh tế",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.80,
    title: "Gói kích thích tài khóa — thanh khoản hệ thống ngân hàng tăng, nợ xấu áp lực giảm",
  },
  {
    keywords: [
      "bộ tài chính bơm tiền", "gói kích thích tài khóa", "tăng đầu tư công khẩn cấp",
      "giải ngân đầu tư công khẩn cấp", "chương trình phục hồi kinh tế",
      "economic recovery package vietnam",
    ],
    domain: "construction",
    direction: "up",
    confidence: 0.78,
    title: "Giải ngân đầu tư công khẩn cấp — tích cực cho xây dựng và vật liệu",
  },
  {
    keywords: [
      "gói phục hồi kinh tế", "gói kích thích tài khóa",
      "chương trình phục hồi kinh tế", "economic recovery package vietnam",
    ],
    domain: "retail",
    direction: "up",
    confidence: 0.72,
    title: "Gói phục hồi kinh tế — cải thiện sức mua tiêu dùng (VNM, MWG)",
  },

  // ── Task 1004: Market Stabilization Fund — SCIC/Treasury intervention ────
  {
    keywords: [
      "scic mua vào cổ phiếu", "nhà nước mua vào cổ phiếu",
      "tổng công ty đầu tư vốn nhà nước", "scic intervenes",
      "state capital investment corporation", "chính phủ mua lại trái phiếu",
      "mua lại trái phiếu chính phủ", "treasury bond buyback",
      "nhnn mua trái phiếu chính phủ", "sbv bond purchase",
      "open market operations vietnam", "nghiệp vụ thị trường mở",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.90,
    title: "SCIC/NHNN can thiệp mua vào — tín hiệu chính phủ bảo vệ thị trường (bullish reversal mạnh)",
  },
  {
    keywords: [
      "scic mua vào cổ phiếu", "nhà nước mua vào cổ phiếu",
      "chính phủ mua lại trái phiếu", "nhnn mua trái phiếu chính phủ",
      "nghiệp vụ thị trường mở",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.82,
    title: "Nghiệp vụ thị trường mở — bơm thanh khoản hệ thống ngân hàng",
  },

  // ── Task 1004: Systemic stress — banking / liquidity crisis ──────────────
  {
    keywords: [
      "nợ xấu hệ thống vượt", "nợ xấu ngân hàng tăng mạnh", "banking system npl",
      "non-performing loan surge", "khủng hoảng thanh khoản ngân hàng",
      "bank liquidity crisis", "ngân hàng thiếu thanh khoản",
      "lãi suất liên ngân hàng tăng đột biến", "interbank rate spike",
      "overnight rate surge", "hệ thống ngân hàng căng thẳng thanh khoản",
      "bank run vietnam", "rút tiền hàng loạt", "bank stress vietnam",
    ],
    domain: "banking",
    direction: "down",
    confidence: 0.90,
    title: "Căng thẳng hệ thống ngân hàng — nợ xấu / thanh khoản hệ thống (rủi ro hệ thống cao)",
  },
  {
    keywords: [
      "nợ xấu hệ thống vượt", "khủng hoảng thanh khoản ngân hàng",
      "bank liquidity crisis", "bank run vietnam", "rút tiền hàng loạt",
      "bank stress vietnam", "banking system npl",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.85,
    title: "Khủng hoảng hệ thống ngân hàng — tâm lý sụp đổ, VN-Index rủi ro giảm mạnh",
  },
  {
    keywords: [
      "nợ xấu hệ thống vượt", "khủng hoảng thanh khoản ngân hàng",
      "bank run vietnam", "bank stress vietnam",
    ],
    domain: "real_estate",
    direction: "down",
    confidence: 0.80,
    title: "Khủng hoảng ngân hàng — tín dụng BĐS đóng băng (VHM, NVL rủi ro cao)",
  },

  // ── Task 1004: SOE restructuring / equitisation ──────────────────────────
  {
    keywords: [
      "cổ phần hóa doanh nghiệp nhà nước", "equitisation vietnam",
      "thoái vốn nhà nước", "nhà nước thoái vốn", "scic thoái vốn",
      "privatisation vietnam", "bán vốn nhà nước", "ipo doanh nghiệp nhà nước",
      "state divestment", "soe restructuring vietnam",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.75,
    title: "Cổ phần hóa/thoái vốn DNNN — cung cổ phiếu mới, cơ hội đầu tư dài hạn (CTCK hưởng lợi phí)",
  },
  {
    keywords: [
      "cổ phần hóa doanh nghiệp nhà nước", "thoái vốn nhà nước",
      "scic thoái vốn", "privatisation vietnam", "state divestment",
    ],
    domain: "real_estate",
    direction: "up",
    confidence: 0.68,
    title: "Thoái vốn DNNN — giải phóng quỹ đất và tài sản BĐS (cơ hội M&A)",
  },
  // Task 1206: prime urban land ("đất vàng") → real_estate bullish
  // "vàng" alone does not appear in gold_mining rules, so no collision risk.
  {
    keywords: ["đất vàng", "quỹ đất vàng", "vị trí đất vàng"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.75,
    title: "Đất vàng — quỹ đất vị trí đắc địa, tích cực trực tiếp cho bất động sản",
  },

  {
    keywords: ["giá dầu tăng", "oil price rise", "crude oil up", "giá dầu tăng mạnh", "opec"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.85,
    title: "Giá dầu tăng — tích cực cho ngành dầu khí",
  },
  {
    keywords: ["giá dầu giảm", "oil price fall", "crude oil down", "oil crash", "oil slump", "oil plunge", "oil drop", "oil decline", "dầu thô giảm", "dầu lao dốc", "worst week", "oil tumble", "crude oil decline", "opec cut", "demand destruction"],
    domain: "oil_gas",
    direction: "down",
    confidence: 0.85,
    title: "Giá dầu giảm — tiêu cực cho ngành dầu khí",
  },
  {
    keywords: ["giá dầu tăng", "oil price rise", "fuel cost", "aviation fuel"],
    domain: "aviation",
    direction: "down",
    confidence: 0.75,
    title: "Giá dầu tăng — tăng chi phí nhiên liệu hàng không",
  },
  // Task 1224: Oil price FALL → aviation BULLISH (inverse relationship)
  // Jet fuel is ~35-40% of airline OPEX. Lower oil = lower fuel cost = VJC bullish.
  {
    keywords: [
      "giá dầu giảm", "oil price fall", "crude oil down", "oil crash", "oil slump",
      "oil plunge", "oil drop", "oil decline", "dầu thô giảm", "dầu lao dốc",
      "worst week", "oil tumble", "crude oil decline",
    ],
    domain: "aviation",
    direction: "up",
    confidence: 0.70,
    title: "Giá dầu giảm — giảm chi phí nhiên liệu hàng không (VJC hưởng lợi)",
  },
  // Task 1224: Fuel tax cut → aviation BULLISH (reduced operating cost)
  {
    keywords: [
      "giảm thuế xăng dầu", "thuế nhiên liệu", "fuel tax", "giảm thuế xăng",
      "thuế xăng dầu về 0", "giảm thuế với xăng dầu", "thuế xăng về 0",
      "tax cut fuel", "fuel tax reduction", "giảm thuế xăng dầu về 0",
    ],
    domain: "aviation",
    direction: "up",
    confidence: 0.72,
    title: "Giảm thuế xăng dầu — chi phí nhiên liệu hàng không giảm (VJC tích cực)",
  },
  {
    keywords: ["lãi suất tăng", "interest rate hike", "fed hike", "fed tăng lãi suất"],
    domain: "banking",
    direction: "up",
    confidence: 0.70,
    title: "Lãi suất tăng — ngắn hạn tích cực cho biên lãi suất ngân hàng",
  },
  {
    keywords: ["lãi suất tăng", "interest rate hike", "fed hike"],
    domain: "real_estate",
    direction: "down",
    confidence: 0.80,
    title: "Lãi suất tăng — tiêu cực cho bất động sản (chi phí vốn tăng)",
  },
  {
    keywords: ["lãi suất giảm", "interest rate cut", "rate cut"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.60,
    title: "Lãi suất giảm — áp lực biên lãi suất ngân hàng",
  },
  {
    keywords: ["lãi suất giảm", "interest rate cut"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.75,
    title: "Lãi suất giảm — tích cực cho bất động sản (vay mua nhà rẻ hơn)",
  },
  {
    keywords: ["giá thép tăng", "steel price rise", "steel price up", "nhu cầu thép"],
    domain: "steel",
    direction: "up",
    confidence: 0.80,
    title: "Giá thép tăng — tích cực cho doanh nghiệp thép",
  },
  {
    keywords: ["giá thép giảm", "steel price fall", "steel price down", "steel slump", "steel crash", "steel decline", "thép giảm giá", "steel overcapacity", "dư thừa thép", "steel dumping", "thép Trung Quốc", "china steel flood", "steel oversupply"],
    domain: "steel",
    direction: "down",
    confidence: 0.80,
    title: "Giá thép giảm — tiêu cực cho doanh nghiệp thép",
  },
  // ── Coal / Mining → utilities (thermal power, energy sector) ─────────────
  // FIX-1299: Changed domain from "oil_gas" to "utilities".
  // Coal/minerals business news directly affects thermal power companies (e.g., POW —
  // Petrovietnam Power, where coal is ~60-70% of fuel COGS). BSR is Binh Son Refinery
  // (crude oil refinery) — it has NO exposure to coal or minerals prices.
  // Using domain "utilities" means: (a) coal articles cascade to thermal power correctly,
  // (b) COMMODITY_TRIGGER_DOMAINS includes "utilities" so market-wide broadcast is
  // restricted — BSR (oil_gas domain) is NOT in alreadyCoveredDomains → skipped.
  // NOTE: "giá than", "giá than tăng", "giá than giảm" are intentionally OMITTED here —
  // they are handled by the more-specific Task 1315a rules below (lines ~1710) with
  // correct directional signals. This rule handles broader coal/mining context only.
  {
    keywords: ["kinh doanh than", "coal mining", "than đá", "coal price", "khoáng sản", "mineral mining"],
    domain: "utilities",
    direction: "up",
    confidence: 0.75,
    title: "Than/khoáng sản — tích cực cho ngành điện/năng lượng (POW hưởng lợi từ giá than cao)",
  },
  {
    keywords: ["coal price drop", "coal price fall", "than đá giảm"],
    domain: "utilities",
    direction: "down",
    confidence: 0.70,
    title: "Giá than giảm — tiêu cực cho doanh nghiệp than, giảm chi phí cho điện than (POW)",
  },
  // ── Large infrastructure projects → aviation + logistics + construction ──
  {
    keywords: ["sân bay long thành", "long thanh airport", "siêu dự án", "dự án hạ tầng", "dự án giao thông", "cao tốc", "dự án 200"],
    domain: "aviation",
    direction: "up",
    confidence: 0.80,
    title: "Dự án hạ tầng lớn — tích cực cho hàng không/logistics",
  },
  {
    keywords: ["sân bay long thành", "long thanh airport", "siêu dự án", "dự án hạ tầng", "dự án giao thông", "cao tốc"],
    domain: "logistics",
    direction: "up",
    confidence: 0.75,
    title: "Dự án hạ tầng lớn — tích cực cho logistics/vận tải",
  },
  {
    keywords: ["vn-index tăng", "vn-index tăng điểm", "market rally", "thị trường tăng"],
    domain: "securities",
    direction: "up",
    confidence: 0.85,
    title: "VN-Index tăng — tích cực trực tiếp cho chứng khoán",
  },
  {
    keywords: ["vn-index giảm", "vn-index giảm điểm", "market decline", "thị trường giảm"],
    domain: "securities",
    direction: "down",
    confidence: 0.85,
    title: "VN-Index giảm — tiêu cực trực tiếp cho chứng khoán",
  },
  // VN-Index → banking (blue-chip constituent, largest sector weight)
  {
    keywords: ["vn-index giảm", "vn-index giảm điểm", "market decline", "thị trường giảm", "mất điểm tháng", "giảm liên tiếp"],
    domain: "banking",
    direction: "down",
    confidence: 0.70,
    title: "VN-Index giảm — tiêu cực cho nhóm ngân hàng blue-chip",
  },
  {
    keywords: ["vn-index tăng", "vn-index tăng điểm", "market rally", "thị trường tăng"],
    domain: "banking",
    direction: "up",
    confidence: 0.70,
    title: "VN-Index tăng — tích cực cho nhóm ngân hàng",
  },
  // VN-Index → real_estate (index-sensitive sector)
  {
    keywords: ["vn-index giảm", "vn-index giảm điểm", "market decline", "thị trường giảm", "mất điểm tháng"],
    domain: "real_estate",
    direction: "down",
    confidence: 0.65,
    title: "VN-Index giảm — tiêu cực cho bất động sản",
  },
  {
    keywords: ["vn-index tăng", "vn-index tăng điểm", "market rally", "thị trường tăng"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.65,
    title: "VN-Index tăng — tích cực cho bất động sản",
  },
  {
    keywords: ["lạm phát cao", "high inflation", "lạm phát tăng"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.65,
    title: "Lạm phát cao — tác động hỗn hợp lên ngân hàng",
  },
  {
    keywords: ["tỷ giá usd", "usd/vnd tăng", "vnd weakens", "đồng đô la tăng"],
    domain: "aviation",
    direction: "down",
    confidence: 0.70,
    title: "USD/VND tăng — tăng chi phí thuê máy bay và nhiên liệu",
  },
  {
    keywords: ["tỷ giá usd", "usd/vnd tăng", "vnd weakens"],
    domain: "steel",
    direction: "up",
    confidence: 0.60,
    title: "USD/VND tăng — tăng giá trị xuất khẩu thép tính bằng VND",
  },
  // ── Logistics: VN fuel-cost-specific phrases (FR-1, Task 1315a) ──────────
  // First-match-wins: VN fuel phrases more specific than generic "giá dầu tăng".
  // Insert BEFORE generic oil rule. GMD/VVN fuel ~30-40% trucking/maritime OPEX.
  {
    keywords: [
      "chi phí xăng dầu tăng",
      "cước nhiên liệu tăng",
      "phí nhiên liệu tăng",
      "giá xăng tăng",
      "xăng dầu tăng giá",
      "fuel surcharge",
      "bunker fuel cost",
      "trucking fuel cost",
    ],
    domain: "logistics",
    direction: "down",
    confidence: 0.72,
    title: "Chi phí xăng dầu tăng — áp lực OPEX nhiên liệu cho logistics (GMD, VVN)",
  },
  // ── Logistics: VN fuel-cost-down (FR-2, Task 1315a) ──────────────────────
  // Insert BEFORE generic "giá dầu giảm" rule. Symmetric inverse of FR-1.
  {
    keywords: [
      "giá xăng giảm",
      "chi phí nhiên liệu giảm",
      "xăng dầu giảm giá",
      "fuel cost down",
      "bunker fuel down",
    ],
    domain: "logistics",
    direction: "up",
    confidence: 0.68,
    title: "Chi phí xăng dầu giảm — OPEX giảm, tích cực cho logistics (GMD, VVN)",
  },
  // ── Logistics: high oil price → cost pressure (bearish) ──────────────────
  {
    keywords: ["giá dầu tăng", "oil price rise", "crude oil up", "fuel cost"],
    domain: "logistics",
    direction: "down",
    confidence: 0.70,
    title: "Giá dầu tăng — tăng chi phí vận chuyển, áp lực lên logistics",
  },
  {
    keywords: ["giá dầu giảm", "oil price fall", "crude oil down"],
    domain: "logistics",
    direction: "up",
    confidence: 0.65,
    title: "Giá dầu giảm — giảm chi phí nhiên liệu, tích cực cho logistics",
  },
  // ── Cement / construction: infrastructure spending → bearish if cut (Task 1200) ─
  // MUST appear BEFORE positive "đầu tư công" → steel rule (first-match-wins per domain).
  {
    keywords: [
      "cắt giảm đầu tư công",
      "giảm đầu tư công",
      "đầu tư công chậm trễ",
      "chậm trễ đầu tư công",
      "đình trệ đầu tư công",
      "đầu tư công đình trệ",
      "đầu tư công giảm",
      "vốn đầu tư công giảm",
      "public investment cut",
      "infrastructure spending cut",
      "capex cut",
    ],
    domain: "steel",
    direction: "down",
    confidence: 0.75,
    title: "Cắt giảm đầu tư công — nhu cầu thép xây dựng giảm (HPG, NKG bị ảnh hưởng)",
  },
  // ── Cement / construction: infrastructure spending → bullish ─────────────
  {
    keywords: ["đầu tư công", "infrastructure spending", "public investment", "gói kích thích", "xây dựng hạ tầng", "cầu đường"],
    domain: "steel",
    direction: "up",
    confidence: 0.72,
    title: "Đầu tư công tăng — tích cực cho thép và vật liệu xây dựng",
  },
  {
    keywords: ["đầu tư công", "infrastructure spending", "public investment", "xây dựng hạ tầng"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.65,
    title: "Đầu tư công tăng — tích cực cho bất động sản khu vực hạ tầng",
  },
  // ── Construction: input-cost squeeze (FR-4, Task 1315a) ──────────────────
  // Insert AFTER demand-side rules (above = "đầu tư công" → infrastructure demand).
  // These rules target commodity price keywords — no overlap with demand rules.
  // CTD/HTI: steel rebar ~20-25% project COGS; cement ~10-15%. Fixed-price contracts.
  {
    keywords: [
      "giá thép xây dựng tăng",
      "giá sắt thép tăng",
      "chi phí thép tăng",
      "thép xây dựng tăng giá",
      "vật liệu xây dựng tăng giá",
      "construction steel price rise",
      "rebar price rise",
      "steel input cost rise",
    ],
    domain: "construction",
    direction: "down",
    confidence: 0.73,
    title: "Giá thép xây dựng tăng — thu hẹp biên lợi nhuận nhà thầu (CTD, HTI)",
  },
  {
    keywords: [
      "giá xi măng tăng",
      "xi măng tăng giá",
      "chi phí xi măng tăng",
      "cement price rise",
      "cement price up",
    ],
    domain: "construction",
    direction: "down",
    confidence: 0.68,
    title: "Giá xi măng tăng — tăng chi phí đầu vào hợp đồng cố định (CTD, HTI)",
  },
  {
    keywords: [
      "giá thép xây dựng giảm",
      "giá xi măng giảm",
      "vật liệu xây dựng giảm giá",
      "construction material cost fall",
      "rebar price fall",
      "cement price fall",
    ],
    domain: "construction",
    direction: "up",
    confidence: 0.65,
    title: "Vật liệu xây dựng giảm — mở rộng biên lợi nhuận hợp đồng cố định (CTD, HTI)",
  },
  // ── Seafood / agriculture: USD/VND rate → export revenue impact ──────────
  {
    keywords: ["tỷ giá usd", "usd/vnd tăng", "vnd weakens", "đồng đô la tăng"],
    domain: "agriculture",
    direction: "up",
    confidence: 0.68,
    title: "USD/VND tăng — tăng doanh thu xuất khẩu thủy sản và nông sản tính bằng VND",
  },
  {
    keywords: ["usd/vnd giảm", "vnd strengthens", "vnd mạnh hơn"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.65,
    title: "USD/VND giảm — giảm doanh thu xuất khẩu thủy sản tính bằng VND",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Global macro → Vietnam cascade (Level 1 → Level 2-3)
  // Triggered by Trading Economics stream data
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Fed / US monetary policy ───────────────────────────────────────────────
  {
    keywords: ["fed rate", "federal reserve", "fomc", "fed funds", "powell", "fed hike", "fed cut"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.72,
    title: "Fed thay đổi chính sách — tác động đến dòng vốn ngoại và lãi suất VN",
  },
  {
    keywords: ["fed rate", "federal reserve", "fomc", "fed tightening", "quantitative tightening"],
    domain: "securities",
    direction: "down",
    confidence: 0.70,
    title: "Fed thắt chặt — rủi ro rút vốn ngoại khỏi thị trường mới nổi (EM outflow)",
  },
  {
    keywords: ["fed cut", "fed easing", "rate cut", "dovish fed"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.68,
    title: "Fed nới lỏng — giảm áp lực tỷ giá, hỗ trợ dòng vốn vào bất động sản",
  },

  // ── US-China trade / tariffs ───────────────────────────────────────────────
  {
    keywords: ["us tariff", "trade war", "china tariff", "trade tension", "us-china"],
    domain: "agriculture",
    direction: "up",
    confidence: 0.65,
    title: "Chiến tranh thương mại Mỹ-Trung — VN hưởng lợi từ chuyển dịch chuỗi cung ứng (thủy sản, nông sản)",
  },
  {
    keywords: ["us tariff", "trade war", "china tariff", "trade tension"],
    domain: "tech",
    direction: "up",
    confidence: 0.60,
    title: "Chiến tranh thương mại — FDI công nghệ chuyển dịch sang VN (Samsung, Apple suppliers)",
  },
  {
    keywords: ["tariff on vietnam", "us vietnam tariff", "vietnam trade deficit"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.75,
    title: "Mỹ áp thuế VN — rủi ro xuất khẩu thủy sản và nông sản sang Mỹ",
  },
  {
    keywords: ["tariff on vietnam", "us vietnam tariff"],
    domain: "retail",
    direction: "down",
    confidence: 0.65,
    title: "Mỹ áp thuế VN — rủi ro xuất khẩu dệt may và hàng tiêu dùng",
  },

  // ── China economy / PMI / slowdown ─────────────────────────────────────────
  {
    keywords: ["china pmi", "china manufacturing", "china slowdown", "china gdp"],
    domain: "steel",
    direction: "down",
    confidence: 0.75,
    title: "Trung Quốc giảm tốc — giảm nhu cầu thép và vật liệu xây dựng khu vực",
  },
  {
    keywords: ["china pmi", "china manufacturing", "china recovery", "china stimulus"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.65,
    title: "Trung Quốc phục hồi — tăng nhu cầu năng lượng khu vực",
  },
  {
    keywords: ["china stock", "shanghai composite", "hang seng", "china market"],
    domain: "securities",
    direction: "neutral",
    confidence: 0.60,
    title: "Thị trường TQ biến động — tâm lý lan tỏa sang EM Đông Nam Á",
  },

  // ── Commodity prices ───────────────────────────────────────────────────────
  {
    keywords: ["gold price", "giá vàng", "gold surge", "gold rally", "precious metal"],
    domain: "gold_mining",
    direction: "up",
    confidence: 0.85,
    title: "Vàng tăng — tích cực trực tiếp cho PNJ và ngành vàng",
  },
  {
    keywords: ["gold price fall", "giá vàng giảm", "gold drop"],
    domain: "gold_mining",
    direction: "down",
    confidence: 0.80,
    title: "Vàng giảm — tiêu cực cho ngành vàng và trang sức",
  },
  {
    keywords: ["wheat", "soybean", "corn", "grain", "food price", "commodity price"],
    domain: "agriculture",
    direction: "neutral",
    confidence: 0.60,
    title: "Giá nông sản thế giới biến động — tác động đến chi phí/doanh thu nông nghiệp VN",
  },

  // ── Task 1309a: Agriculture commodity export rules ────────────────────────
  // Coffee/rice/seafood export decline → agriculture BEARISH.
  // These are commodity-sector articles — must NOT broadcast to real_estate/banking
  // via market-wide path (COMMODITY_TRIGGER_DOMAINS includes "agriculture").
  // FIX-1286: added "cà phê và gạo", "hụt hơi", "giá cà phê", "giá gạo",
  // "nông sản xuất khẩu", "gạo xuất khẩu" so that Vietnamese-language
  // headlines with reversed word order ("Xuất khẩu cà phê và gạo hụt hơi")
  // still match this rule and trigger the commodity broadcast exclusion guard.
  {
    keywords: [
      "coffee export", "coffee export decline", "cà phê xuất khẩu", "xuất khẩu cà phê",
      "coffee export revenues", "giá cà phê xuất khẩu", "cà phê giảm",
      "cà phê và gạo", "giá cà phê", "hụt hơi",
      "rice export", "rice export decline", "xuất khẩu gạo", "gạo xuất khẩu giảm",
      "rice export revenues", "xuất khẩu nông sản giảm", "agriculture exports drop",
      "vietnam agriculture exports", "nông sản xuất khẩu giảm",
      "nông sản xuất khẩu", "giá gạo", "gạo xuất khẩu",
      "seafood export decline", "xuất khẩu thủy sản giảm", "thủy sản xuất khẩu giảm",
    ],
    domain: "agriculture",
    direction: "down",
    confidence: 0.72,
    title: "Xuất khẩu nông sản/cà phê/gạo giảm — tiêu cực cho ngành nông nghiệp (GVR, VNM, ANV, MPC)",
  },
  {
    keywords: ["copper price", "giá đồng", "copper surge", "industrial metal"],
    domain: "steel",
    direction: "up",
    confidence: 0.55,
    title: "Giá kim loại công nghiệp tăng — tín hiệu tích cực cho ngành vật liệu",
  },

  // ── Global inflation / CPI ─────────────────────────────────────────────────
  {
    keywords: ["us inflation", "us cpi", "consumer price", "inflation surge", "inflation rate"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.65,
    title: "Lạm phát Mỹ — ảnh hưởng kỳ vọng Fed, gián tiếp tác động lãi suất VN",
  },
  {
    keywords: ["global recession", "recession risk", "economic downturn", "slowdown"],
    domain: "securities",
    direction: "down",
    confidence: 0.70,
    title: "Rủi ro suy thoái toàn cầu — giảm dòng vốn vào thị trường mới nổi",
  },
  {
    keywords: ["global recession", "recession risk", "economic downturn"],
    domain: "logistics",
    direction: "down",
    confidence: 0.65,
    title: "Rủi ro suy thoái — giảm khối lượng thương mại và vận tải quốc tế",
  },

  // ── DXY / Dollar strength ──────────────────────────────────────────────────
  {
    keywords: ["dollar index", "dxy", "strong dollar", "dollar surge", "usd rally"],
    domain: "securities",
    direction: "down",
    confidence: 0.68,
    title: "USD mạnh — rút vốn ngoại khỏi thị trường mới nổi (Sell VN → Buy USD assets)",
  },
  {
    keywords: ["dollar index", "dxy", "weak dollar", "dollar fall"],
    domain: "securities",
    direction: "up",
    confidence: 0.65,
    title: "USD yếu — dòng vốn ngoại quay lại thị trường mới nổi",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OIL_SUPPLY_SHOCK_RULES (Task 1246)
  // Hormuz blockade / Suez closure / OPEC cut → sector cascades
  // Must appear BEFORE generic geopolitical / oil-price rules so that
  // the specific supply-shock context takes priority (first-match-wins per domain).
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Oil supply shock → oil_gas BULLISH (price spike benefit for upstream) ─
  {
    keywords: [
      "phong tỏa eo biển hormuz",
      "phong tỏa hormuz",
      "eo biển hormuz bị phong tỏa",
      // FIX-1264: article uses "eo hormuz" (without "biển") — add both short variants
      "eo hormuz bị phong tỏa",
      "hormuz bị phong tỏa",
      "hormuz blockade",
      "strait of hormuz blocked",
      "strait of hormuz blockade",
      "hormuz strait blockade",
      "hormuz strait blocked",
      "suez closure",
      "suez canal closed",
      "suez canal closure",
      "opec cắt giảm",
      "opec cut",
      "opec production cut",
      "opec+ cut",
      "gián đoạn nguồn cung dầu",
      "oil supply disruption",
      "oil supply shock",
      "crude oil supply shock",
    ],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.88,
    title: "Gián đoạn nguồn cung dầu (Hormuz/Suez/OPEC) — giá dầu tăng mạnh, tích cực cho PVD, PVS, GAS, BSR",
    affected_actions: [
      { code: "PVD", direction: "up" },
      { code: "PVS", direction: "up" },
      { code: "GAS", direction: "up" },
      // FIX-1264: BSR (Binh Son Refinery) is oil_gas — Hormuz blockade = oil price up = BULLISH
      { code: "BSR", direction: "up" },
    ],
  },

  // ── Oil supply shock → aviation BEARISH (jet fuel cost spike) ─────────────
  {
    keywords: [
      "phong tỏa eo biển hormuz",
      "phong tỏa hormuz",
      // FIX-1264: article uses "eo hormuz" (without "biển") — add both short variants
      "eo hormuz bị phong tỏa",
      "hormuz bị phong tỏa",
      "hormuz blockade",
      "strait of hormuz blocked",
      "strait of hormuz blockade",
      "hormuz strait blockade",
      "hormuz strait blocked",
      "suez canal closed",
      "suez canal closure",
      "suez closure",
      "opec cắt giảm",
      "opec cut",
      "opec production cut",
      "gián đoạn nguồn cung dầu",
      "oil supply disruption",
      "oil supply shock",
    ],
    domain: "aviation",
    direction: "down",
    confidence: 0.84,
    title: "Gián đoạn nguồn cung dầu — chi phí nhiên liệu hàng không tăng mạnh (VJC, HVN chịu áp lực)",
    affected_actions: [
      { code: "VJC", direction: "down" },
      { code: "HVN", direction: "down" },
    ],
  },

  // ── Oil supply shock → logistics BEARISH (route disruption + fuel cost) ────
  {
    keywords: [
      "phong tỏa eo biển hormuz",
      "phong tỏa hormuz",
      "hormuz blockade",
      "strait of hormuz blocked",
      "strait of hormuz blockade",
      "hormuz strait blockade",
      "hormuz strait blocked",
      "suez canal closed",
      "suez canal closure",
      "suez closure",
      "gián đoạn nguồn cung dầu",
      "oil supply disruption",
      "oil supply shock",
    ],
    domain: "logistics",
    direction: "down",
    confidence: 0.82,
    title: "Gián đoạn nguồn cung dầu — tuyến vận tải bị gián đoạn, chi phí tăng (GMD, PHP chịu áp lực)",
    affected_actions: [
      // FIX-1264: BSR removed — BSR is Binh Son Refinery (oil_gas), not logistics
      { code: "GMD", direction: "down" },
      { code: "PHP", direction: "down" },
    ],
  },

  // ── Oil supply shock → securities BEARISH (market-wide risk-off) ───────────
  {
    keywords: [
      "phong tỏa eo biển hormuz",
      "phong tỏa hormuz",
      "eo biển hormuz bị phong tỏa",
      "hormuz blockade",
      "strait of hormuz blocked",
      "strait of hormuz blockade",
      "hormuz strait blockade",
      "hormuz strait blocked",
      "gián đoạn nguồn cung dầu",
      "oil supply shock",
      "crude oil supply shock",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.78,
    title: "Gián đoạn nguồn cung dầu — rủi ro địa chính trị cao, tâm lý risk-off ảnh hưởng VN-Index",
  },

  // ── Oil supply shock / Hormuz → retail BEARISH for VNM (Task 1214) ──────────
  // VNM (Vinamilk) exports ~8% revenue to Middle East. Hormuz blockade or
  // oil supply shock disrupts export logistics and raises shipping costs.
  {
    keywords: [
      "strait of hormuz",
      "hormuz blockade",
      "hormuz blocked",
      "phong tỏa hormuz",
      "eo biển hormuz",
      "oil supply shock",
      "gián đoạn nguồn cung dầu",
      "middle east conflict",
      "middle east tension",
      "xuất khẩu sữa",
    ],
    domain: "retail",
    direction: "down",
    confidence: 0.68,
    title: "Gián đoạn Hormuz/Trung Đông — xuất khẩu sữa VNM sang Trung Đông bị ảnh hưởng, chi phí logistics tăng (VNM bearish)",
  },

  // ── Taiwan / semiconductor DE-ESCALATION (before escalation — first match wins) ──
  {
    keywords: [
      "taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue",
      "taiwan strait reopen", "taiwan ceasefire", "đài loan hòa dịu", "hạ nhiệt eo biển đài loan",
    ],
    domain: "tech",
    direction: "up",
    confidence: 0.80,
    title: "Hạ nhiệt eo biển Đài Loan — chuỗi cung ứng bán dẫn phục hồi, tích cực tech/FPT",
  },
  {
    keywords: [
      "taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue",
      "taiwan strait reopen", "đài loan hòa dịu", "hạ nhiệt eo biển đài loan",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.75,
    title: "Hạ nhiệt Đài Loan — risk-on, dòng vốn quay lại thị trường mới nổi",
  },
  {
    keywords: [
      "taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue",
      "taiwan strait reopen", "đài loan hòa dịu",
    ],
    domain: "retail",
    direction: "up",
    confidence: 0.68,
    title: "Hạ nhiệt Đài Loan — chi phí linh kiện điện tử giảm, tích cực bán lẻ điện máy",
  },

  // ── Geopolitical DE-ESCALATION (MUST be before escalation — first match wins) ──
  // When news contains BOTH "war" and "peace", de-escalation wins because
  // peace/ceasefire keywords are checked first.
  // Moved from bottom of array to before escalation rules.
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "ngừng bắn", "hạ nhiệt", "peace talks", "peace deal", "peace prospects", "iran peace", "iran address", "iran talks", "iran deal", "hormuz reopen"],
    domain: "oil_gas",
    direction: "down",
    confidence: 0.80,
    title: "Hạ nhiệt địa chính trị — giá dầu giảm (nguồn cung phục hồi, Hormuz mở lại)",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt", "peace talks"],
    domain: "aviation",
    direction: "up",
    confidence: 0.78,
    title: "Hạ nhiệt — giá nhiên liệu giảm, tích cực cho hàng không (VJC, HVN)",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt", "hormuz reopen"],
    domain: "logistics",
    direction: "up",
    confidence: 0.75,
    title: "Hạ nhiệt — chuỗi cung ứng phục hồi, vận tải biển bình thường hóa",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt", "risk-on"],
    domain: "gold_mining",
    direction: "down",
    confidence: 0.75,
    title: "Hạ nhiệt — vàng giảm (bớt nhu cầu trú ẩn safe haven → risk-on)",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt", "risk-on"],
    domain: "securities",
    direction: "up",
    confidence: 0.78,
    title: "Hạ nhiệt — risk-on, dòng vốn ngoại quay lại thị trường mới nổi",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.60,
    title: "Hạ nhiệt — kỳ vọng lãi suất ổn định, tâm lý đầu tư BĐS cải thiện",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hạ nhiệt"],
    domain: "retail",
    direction: "up",
    confidence: 0.60,
    title: "Hạ nhiệt — chi phí vận hành giảm, tích cực bán lẻ",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hạ nhiệt"],
    domain: "steel",
    direction: "up",
    confidence: 0.55,
    title: "Hạ nhiệt — thương mại quốc tế phục hồi, xuất khẩu cải thiện",
  },

  // ── Geopolitical ESCALATION (after de-escalation — only fires if no peace keyword matched) ──
  // FIX-1298: This rule uses broad keywords ("geopolitical", "conflict") that can match
  // Fed/monetary policy articles (e.g., "geopolitical uncertainty drives Fed rate cut appeal").
  // Guard: requireAnyKeyword ensures oil/energy context must be present.
  // Guard: excludeKeywords skips the rule when article is primarily about monetary policy
  // (Fed, FOMC, central bank, lãi suất) without oil/energy substance.
  {
    keywords: ["war", "conflict", "geopolitical", "middle east", "chiến tranh", "xung đột", "iran attack", "iran strike", "iran war", "strait of hormuz", "military strike"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.78,
    title: "Rủi ro địa chính trị — đẩy giá dầu lên (supply disruption)",
    // Must contain oil/energy context to cascade to oil_gas domain.
    requireAnyKeyword: [
      "oil", "dầu", "crude", "petroleum", "energy", "năng lượng",
      "opec", "gas", "khí đốt", "refinery", "nhà máy lọc dầu",
      "hormuz", "suez",
    ],
    // Skip if article is about monetary policy / Fed with no oil substance.
    excludeKeywords: [
      "federal reserve", "fed chair", "fed funds", "fomc", "fed rate",
      "monetary policy", "ngân hàng trung ương", "central bank",
      "rate cut", "interest rate", "lãi suất", "net worth",
      "gold selling", "gold reserve",
    ],
  },
  {
    keywords: ["war", "conflict", "geopolitical", "middle east", "strait of hormuz"],
    domain: "logistics",
    direction: "down",
    confidence: 0.72,
    title: "Xung đột — gián đoạn chuỗi cung ứng toàn cầu, tăng chi phí vận tải",
  },
  {
    keywords: ["war", "conflict", "geopolitical", "risk aversion", "safe haven"],
    domain: "gold_mining",
    direction: "up",
    confidence: 0.75,
    title: "Rủi ro địa chính trị — vàng tăng do nhu cầu trú ẩn (safe haven)",
  },

  // ── Taiwan / semiconductor ESCALATION ──────────────────────────────────────
  {
    keywords: [
      "taiwan strait", "taiwan military", "taiwan conflict", "taiwan invasion",
      "china taiwan", "tsmc disruption", "semiconductor supply", "taiwan blockade",
      "eo biển đài loan", "đài loan", "xung đột đài loan", "phong tỏa đài loan",
    ],
    domain: "tech",
    direction: "down",
    confidence: 0.80,
    title: "Căng thẳng eo biển Đài Loan — gián đoạn chuỗi cung ứng bán dẫn (bearish tech/FPT)",
  },
  {
    keywords: [
      "taiwan strait", "taiwan military", "taiwan conflict", "china taiwan",
      "tsmc disruption", "eo biển đài loan", "đài loan căng thẳng",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.75,
    title: "Căng thẳng Đài Loan — risk-off toàn cầu, dòng vốn rút khỏi thị trường mới nổi",
  },
  {
    keywords: [
      "taiwan strait", "taiwan military", "taiwan conflict", "tsmc disruption",
      "semiconductor supply", "eo biển đài loan", "đài loan",
    ],
    domain: "retail",
    direction: "down",
    confidence: 0.68,
    title: "Căng thẳng Đài Loan — chi phí linh kiện điện tử tăng, tác động bán lẻ điện máy",
  },

  // ── FDI / foreign investment ───────────────────────────────────────────────
  {
    keywords: ["fdi vietnam", "foreign investment vietnam", "đầu tư nước ngoài", "fdi tăng"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.72,
    title: "FDI vào VN tăng — tích cực cho BĐS khu công nghiệp và đô thị",
  },
  {
    keywords: ["fdi vietnam", "foreign investment vietnam", "fdi tăng"],
    domain: "tech",
    direction: "up",
    confidence: 0.70,
    title: "FDI vào VN tăng — tích cực cho công nghệ (outsourcing, R&D centers)",
  },

  // ── Bond yields / treasury ─────────────────────────────────────────────────
  {
    keywords: ["treasury yield", "10-year yield", "bond yield", "government bond"],
    domain: "real_estate",
    direction: "down",
    confidence: 0.62,
    title: "Lợi suất trái phiếu tăng — tăng chi phí vốn, tiêu cực cho BĐS",
  },
  {
    keywords: ["treasury yield", "10-year yield", "bond yield rise"],
    domain: "banking",
    direction: "up",
    confidence: 0.58,
    title: "Lợi suất trái phiếu tăng — mở rộng biên lãi suất cho ngân hàng",
  },

  // ── Automotive / EV ────────────────────────────────────────────────────────
  {
    keywords: ["auto sales", "car sales", "automobile", "honda", "toyota", "ford", "ev sales", "electric vehicle"],
    domain: "automotive",
    direction: "neutral",
    confidence: 0.70,
    title: "Tin ngành ô tô — tác động trực tiếp đến VEAM (Honda/Toyota/Ford VN)",
  },

  // ── Pharma / healthcare ────────────────────────────────────────────────────
  {
    keywords: ["pharma", "healthcare", "drug approval", "dược phẩm", "y tế"],
    domain: "pharma",
    direction: "neutral",
    confidence: 0.60,
    title: "Tin ngành dược — tác động đến DHG, IMP, DMC",
  },

  // ── Insurance: natural disaster / catastrophe ──────────────────────────────
  {
    keywords: ["typhoon", "flood", "natural disaster", "bão", "lũ lụt", "thiên tai", "catastrophe"],
    domain: "insurance",
    direction: "down",
    confidence: 0.75,
    title: "Thiên tai — tăng chi trả bồi thường bảo hiểm (BVH, PVI)",
  },

  // ── Energy transition ──────────────────────────────────────────────────────
  {
    keywords: ["renewable energy", "solar", "wind power", "năng lượng tái tạo", "điện mặt trời", "điện gió"],
    domain: "utilities",
    direction: "up",
    confidence: 0.65,
    title: "Chuyển đổi năng lượng — tích cực cho REE, PC1, GEG (năng lượng sạch)",
  },
  // ── Utilities: coal price → thermal power COGS (FR-3, Task 1315a) ─────────
  // POW (Petrovietnam Power): coal ~60-70% fuel COGS. First utilities commodity-input rule.
  {
    keywords: [
      "giá than tăng",
      "than đá tăng giá",
      "chi phí than tăng",
      "giá than nhiệt điện tăng",
      "coal price rise",
      "coal price up",
      "thermal coal surge",
    ],
    domain: "utilities",
    direction: "down",
    confidence: 0.75,
    title: "Giá than tăng — chi phí nhiên liệu điện tăng (POW bị ảnh hưởng)",
  },
  // ── Utilities: gas price → gas-fired + city gas distribution COGS (FR-3) ──
  // HNG (Hà Nội Gas): city gas distribution — gas is primary input cost.
  {
    keywords: [
      "giá khí đốt tăng",
      "giá lng tăng",
      "giá khí tự nhiên tăng",
      "chi phí khí đốt tăng",
      "gas price rise",
      "lng price rise",
      "natural gas price up",
      "gas price surge",
    ],
    domain: "utilities",
    direction: "down",
    confidence: 0.70,
    title: "Giá khí đốt/LNG tăng — áp lực chi phí điện khí và phân phối khí (HNG)",
  },
  // ── Utilities: coal fall (FR-3) ───────────────────────────────────────────
  {
    keywords: [
      "giá than giảm",
      "than đá giảm giá",
      "coal price fall",
      "coal price down",
    ],
    domain: "utilities",
    direction: "up",
    confidence: 0.68,
    title: "Giá than giảm — giảm chi phí nhiên liệu, tích cực cho điện than (POW)",
  },
  // ── Utilities: gas fall (FR-3) ────────────────────────────────────────────
  {
    keywords: [
      "giá khí đốt giảm",
      "giá lng giảm",
      "lng price fall",
      "gas price fall",
    ],
    domain: "utilities",
    direction: "up",
    confidence: 0.65,
    title: "Giá khí đốt giảm — tích cực cho điện khí và phân phối khí (HNG)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPLY_CHAIN_RULES (Sprint 041 — Task 255)
  // Shipping cost surges / port disruptions → logistics + steel + exporters
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Shipping cost surge → logistics (direct: GMD revenue up) ─────────────
  {
    keywords: ["shipping cost surge", "cước vận tải tăng", "bdi surge", "baltic dry", "freight cost rise", "shipping cost rise"],
    domain: "logistics",
    direction: "up",
    confidence: 0.78,
    title: "Cước vận tải tăng — tích cực cho logistics (GMD, PHP doanh thu tăng)",
  },
  // ── Shipping cost surge → steel (inverse: HPG import cost up) ────────────
  {
    keywords: ["shipping cost surge", "cước vận tải tăng", "bdi surge", "freight cost rise", "shipping cost rise"],
    domain: "steel",
    direction: "down",
    confidence: 0.75,
    title: "Cước vận tải tăng — tăng chi phí nhập phế liệu thép (HPG bị ảnh hưởng)",
  },
  // ── Shipping cost surge → consumer goods (inverse: export margins fall) ──
  {
    keywords: ["shipping cost surge", "cước vận tải tăng", "freight cost rise", "container rate surge"],
    domain: "retail",
    direction: "down",
    confidence: 0.68,
    title: "Cước vận tải tăng — giảm biên lợi nhuận xuất khẩu hàng tiêu dùng (VNM)",
  },
  // ── Port disruption → logistics (negative: congestion hurts efficiency) ──
  {
    keywords: ["port congestion", "tắc nghẽn cảng", "dock strike", "đình công cảng", "cảng tắc nghẽn"],
    domain: "logistics",
    direction: "down",
    confidence: 0.80,
    title: "Tắc nghẽn cảng — gián đoạn hoạt động logistics/vận tải (GMD, PHP)",
  },
  // ── Canal blockage → all export sectors ─────────────────────────────────
  {
    keywords: ["suez canal", "panama canal", "kênh suez", "kênh panama", "canal blockage"],
    domain: "steel",
    direction: "down",
    confidence: 0.82,
    title: "Tắc kênh đào — gián đoạn xuất nhập khẩu thép (HPG bị ảnh hưởng)",
  },
  {
    keywords: ["suez canal", "panama canal", "kênh suez", "kênh panama", "canal blockage"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.78,
    title: "Tắc kênh đào — tăng chi phí/thời gian xuất khẩu nông sản (GVR, VNM)",
  },
  // ── Container shortage → exporters ───────────────────────────────────────
  {
    keywords: ["container shortage", "thiếu container", "container scarcity"],
    domain: "retail",
    direction: "down",
    confidence: 0.72,
    title: "Thiếu container — cản trở xuất khẩu hàng tiêu dùng (VNM xuất sữa)",
  },
  // ── Supply chain disruption — broad negative for import-dependent ─────────
  {
    keywords: ["supply chain disruption", "gián đoạn chuỗi cung ứng", "supply chain crisis"],
    domain: "steel",
    direction: "down",
    confidence: 0.70,
    title: "Gián đoạn chuỗi cung ứng — ảnh hưởng đến nguồn nguyên liệu nhập khẩu",
  },
  {
    keywords: ["supply chain disruption", "gián đoạn chuỗi cung ứng", "supply chain crisis"],
    domain: "logistics",
    direction: "neutral",
    confidence: 0.65,
    title: "Gián đoạn chuỗi cung ứng — tác động hỗn hợp cho logistics",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIMATE_RULES (Sprint 042 — Task 261)
  // Weather events → sector/stock cascades
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Typhoon / Bão ─────────────────────────────────────────────────────────
  {
    keywords: ["bão số", "typhoon vietnam", "áp thấp nhiệt đới", "cơn bão mạnh", "bão đổ bộ"],
    domain: "insurance",
    direction: "down",
    confidence: 0.80,
    title: "Bão — tăng chi trả bồi thường bảo hiểm (BVH, PVI)",
  },
  {
    keywords: ["bão số", "typhoon vietnam", "bão đổ bộ", "bão lớn"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.75,
    title: "Bão — thiệt hại ao nuôi tôm/cá và nông sản (MPC, ANV, VNM)",
  },

  // ── Drought / Hạn hán ─────────────────────────────────────────────────────
  {
    keywords: ["hạn hán nghiêm trọng", "thiếu nước hồ thủy điện", "mùa khô thiếu nước", "drought vietnam"],
    domain: "utilities",
    direction: "up",
    confidence: 0.75,
    title: "Hạn hán — thủy điện thiếu nước → nhu cầu solar/wind thay thế tăng (REE, GEG)",
  },
  {
    keywords: ["hạn hán nghiêm trọng", "hạn hán kéo dài", "thiếu nước ao nuôi", "drought vietnam"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.70,
    title: "Hạn hán — thiếu nước ao nuôi, thiệt hại thủy sản và nông nghiệp (MPC, ANV)",
  },

  // ── Power shortage / Thiếu điện ───────────────────────────────────────────
  {
    keywords: ["thiếu điện nghiêm trọng", "cắt điện luân phiên", "power shortage vietnam"],
    domain: "real_estate",  // industrial parks (IDC, KBC) classified under real_estate
    direction: "down",
    confidence: 0.82,
    title: "Thiếu điện — khu công nghiệp bị cắt điện luân phiên, FDI lo ngại (IDC, KBC)",
  },
  {
    keywords: ["thiếu điện nghiêm trọng", "cắt điện luân phiên", "power shortage vietnam"],
    domain: "utilities",
    direction: "up",
    confidence: 0.78,
    title: "Thiếu điện — chính phủ đẩy mạnh năng lượng tái tạo khẩn cấp (REE, GEG)",
  },

  // ── Flood / Lũ lụt ───────────────────────────────────────────────────────
  {
    keywords: ["lũ lụt nghiêm trọng", "lũ lớn kéo dài", "flood vietnam"],
    domain: "insurance",
    direction: "down",
    confidence: 0.75,
    title: "Lũ lụt — tăng bồi thường bảo hiểm tài sản (BVH, PVI)",
  },

  // ── El Niño / La Niña ─────────────────────────────────────────────────────
  {
    keywords: ["el niño", "el nino", "hiện tượng el niño"],
    domain: "utilities",
    direction: "up",
    confidence: 0.72,
    title: "El Niño — hạn hán dài hạn, thủy điện giảm → cơ hội NLTT (REE, GEG)",
  },
  {
    keywords: ["la niña", "la nina", "hiện tượng la niña"],
    domain: "insurance",
    direction: "down",
    confidence: 0.68,
    title: "La Niña — gia tăng mưa lũ → rủi ro bồi thường bảo hiểm",
  },


  // ── CAPEX / Public Investment rules (task 250) ───────────────────────────
  // Task 1200: BEARISH "đầu tư công" rules — must appear BEFORE the bullish rule
  // so first-match-wins fires on negative context (cắt giảm, chậm trễ, đình trệ).
  {
    keywords: [
      "cắt giảm đầu tư công",
      "giảm đầu tư công",
      "đầu tư công bị cắt",
      "đầu tư công chậm trễ",
      "chậm trễ đầu tư công",
      "đình trệ đầu tư công",
      "đầu tư công đình trệ",
      "đầu tư công giảm",
      "vốn đầu tư công giảm",
      "public investment cut",
      "public investment decline",
      "capex cut",
      "infrastructure spending cut",
    ],
    domain: "construction",
    direction: "down",
    confidence: 0.80,
    title: "Cắt giảm/đình trệ đầu tư công — tiêu cực cho ngành xây dựng (CTD, HBC, LCG)",
  },
  {
    keywords: [
      "cắt giảm đầu tư công",
      "giảm đầu tư công",
      "đầu tư công chậm trễ",
      "đình trệ đầu tư công",
      "đầu tư công đình trệ",
      "đầu tư công giảm",
      "vốn đầu tư công giảm",
      "public investment cut",
      "infrastructure spending cut",
      "capex cut",
    ],
    domain: "steel",
    direction: "down",
    confidence: 0.75,
    title: "Cắt giảm đầu tư công — nhu cầu thép xây dựng giảm (HPG, NKG bị ảnh hưởng)",
  },
  {
    keywords: [
      "cao tốc", "đầu tư công", "giải ngân đầu tư", "hạ tầng giao thông",
      "sân bay long thành", "đường sắt", "xây cầu", "cầu đường bộ",
      "cầu vượt", "cầu cao tốc", "cảng biển", "capex",
      "public investment", "infrastructure investment",
    ],
    domain: "construction",
    direction: "up",
    confidence: 0.80,
    title: "Đầu tư công tăng — tích cực cho ngành xây dựng hạ tầng",
  },
  {
    keywords: [
      "năng lượng tái tạo", "điện mặt trời", "điện gió", "renewable energy",
      "solar farm", "wind power", "hệ thống điện", "nhà máy điện",
    ],
    domain: "energy",
    direction: "up",
    confidence: 0.75,
    title: "Đầu tư năng lượng tái tạo tăng — tích cực cho cổ phiếu điện",
  },

  // ── CREDIT / NHNN rules (task 250) ───────────────────────────────────────
  {
    keywords: [
      "nới room tín dụng bất động sản", "tín dụng bất động sản tăng",
      "room tín dụng bđs", "tín dụng bds tăng",
    ],
    domain: "real_estate",
    direction: "up",
    confidence: 0.80,
    title: "Nới room tín dụng BĐS — tích cực cho bất động sản",
  },
  {
    keywords: [
      "siết tín dụng bất động sản", "giảm room tín dụng bđs",
      "hạn chế tín dụng bất động sản", "siết tín dụng bds",
    ],
    domain: "real_estate",
    direction: "down",
    confidence: 0.80,
    title: "Siết tín dụng BĐS — tiêu cực cho bất động sản",
  },
  {
    keywords: [
      "tăng room tín dụng cho ngân hàng", "nới room tín dụng ngân hàng",
      "room tín dụng tăng", "tín dụng ngân hàng tăng trưởng",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.70,
    title: "Nới room tín dụng ngân hàng — hỗ trợ tăng trưởng cho vay",
  },

  // ── Cross-sector: aviation debt default → banking systemic risk ──────────
  {
    keywords: [
      "hàng không nợ", "nợ hàng không", "thu giữ tài sản", "tịch thu tài sản",
      "collateral seizure", "debt default airline", "airline debt",
      "bamboo airways nợ", "vietjet nợ", "seizing land", "thu hồi sổ đỏ",
      "nợ xấu hàng không", "bad debt airline", "airline collateral",
    ],
    domain: "banking",
    direction: "down",
    confidence: 0.72,
    title: "Nợ xấu hàng không → rủi ro hệ thống ngân hàng (tài sản thế chấp giảm giá trị)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHARMA_RULES (Sprint 044)
  // Pharmaceutical sector cascade rules
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Epidemic / outbreak → pharma demand surge ─────────────────────────────
  {
    keywords: [
      "dịch sốt xuất huyết",
      "dịch cúm",
      "cúm a",
      "bùng phát dịch",
      "dịch bệnh lây lan",
      "epidemic",
      "pandemic",
      "outbreak",
      "vaccine distribution demand",
      "nhu cầu thuốc",
      "nhu cầu vaccine",
    ],
    domain: "pharmaceutical",
    direction: "up",
    confidence: 0.75,
    title: "Dịch bệnh bùng phát — tích cực cho ngành dược phẩm",
  },
  // ── Drug price ceiling → pharma margin pressure ───────────────────────────
  {
    keywords: [
      "giá trần thuốc",
      "trần giá thuốc",
      "điều chỉnh trần giá thuốc",
      "price cap drug",
      "drug price ceiling",
      "drug price regulation",
    ],
    domain: "pharmaceutical",
    direction: "down",
    confidence: 0.80,
    title: "Quy định giá trần thuốc — tiêu cực cho biên lợi nhuận dược phẩm",
  },
  // ── Health budget increase → pharma revenue boost ─────────────────────────
  {
    keywords: [
      "tăng ngân sách mua thuốc",
      "tăng ngân sách y tế",
      "hospital budget increase",
      "tăng chi tiêu y tế",
      "health spending increase",
    ],
    domain: "pharmaceutical",
    direction: "up",
    confidence: 0.70,
    title: "Tăng ngân sách y tế — tích cực cho ngành dược phẩm và thiết bị y tế",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHEMICALS_RULES (Task 1850e)
  // Chemicals/petrochemicals sector cascade rules (DGC, DPM)
  // Upstream: crude oil, natural gas prices
  // Downstream: fertilizer, plastic supply chains
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Crude oil price spike → chemicals input cost increase (BEARISH) ────────
  {
    keywords: [
      "giá dầu tăng",
      "oil price rise",
      "crude oil up",
      "giá dầu tăng mạnh",
      "crude oil surge",
      "oil rally",
      "dầu tăng giá",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.75,
    title: "Giá dầu tăng — tăng chi phí nguyên liệu hóa chất (input cost pressure)",
  },

  // ── Crude oil price fall → chemicals input cost decrease (BULLISH) ────────
  {
    keywords: [
      "giá dầu giảm",
      "oil price fall",
      "crude oil down",
      "oil crash",
      "oil slump",
      "dầu lao dốc",
      "crude oil decline",
      "oil tumble",
      "oil drop",
    ],
    domain: "chemicals",
    direction: "up",
    confidence: 0.75,
    title: "Giá dầu giảm — giảm chi phí nguyên liệu, tích cực cho hóa chất (cost relief)",
  },

  // ── Natural gas price surge → fertilizer cost increase (BEARISH) ──────────
  {
    keywords: [
      "giá khí đốt tăng",
      "natural gas price rise",
      "gas price spike",
      "khí đốt tăng giá",
      "natural gas surge",
      "gas rally",
      "giá gas tăng",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.72,
    title: "Giá khí đốt tăng — tăng chi phí phân bón & hóa chất (feedstock pressure)",
  },

  // ── Fertilizer price ceiling → margin compression (BEARISH) ───────────────
  {
    keywords: [
      "giá trần phân bón",
      "trần giá phân bón",
      "điều chỉnh giá phân bón",
      "fertilizer price cap",
      "phân bón giá trần",
      "hạn giá phân bón",
      "price regulation fertilizer",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.78,
    title: "Quy định giá trần phân bón — tiêu cực cho biên lợi nhuận hóa chất",
  },

  // ── Environmental regulation → compliance cost (BEARISH) ─────────────────
  {
    keywords: [
      "quy định môi trường hóa chất",
      "chemical emissions regulation",
      "environmental compliance",
      "quy định phát thải hóa chất",
      "tiêu chuẩn môi trường",
      "environmental standard",
      "pollution control chemical",
      "tiêu chuẩn phát thải",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.70,
    title: "Quy định môi trường — tăng chi phí tuân thủ hóa chất (compliance cost)",
  },

  // ── Supply chain disruption → supply crunch (BEARISH) ────────────────────
  {
    keywords: [
      "cắt nguồn cung hóa chất",
      "chemical supply disruption",
      "refinery shutdown",
      "nguồn cung hóa chất bị gián đoạn",
      "production halt",
      "supply chain disruption",
      "cung cấp hóa chất bị đình trệ",
      "feedstock shortage",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.73,
    title: "Gián đoạn chuỗi cung hóa chất — áp lực cung ứng tiêu cực (supply crunch)",
  },

  // ── Export support policy → demand boost (BULLISH) ───────────────────────
  {
    keywords: [
      "hỗ trợ xuất khẩu hóa chất",
      "chemical export support",
      "export promotion chemical",
      "xuất khẩu hóa chất tăng",
      "thỏa thuận thương mại hóa chất",
      "trade agreement chemical",
      "expand chemical exports",
      "hóa chất thị trường",
    ],
    domain: "chemicals",
    direction: "up",
    confidence: 0.72,
    title: "Hỗ trợ xuất khẩu hóa chất — tích cực cho nhu cầu & doanh thu (export boost)",
  },

  // ── Petrochemical project approval → expansion benefit (BULLISH) ─────────
  {
    keywords: [
      "dự án dầu khí mới",
      "petrochemical project approval",
      "new refinery",
      "chấp thuận dự án hóa dầu",
      "expansion plan chemical",
      "petrochemical facility",
      "dự án lọc dầu",
      "capacity expansion",
    ],
    domain: "chemicals",
    direction: "up",
    confidence: 0.71,
    title: "Phê duyệt dự án hóa dầu/khí — tích cực cho tăng trưởng dài hạn (capex benefit)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1223 — VNDiamond index exclusion → ETF forced selling (BEARISH)
  // When a stock is excluded from VNDiamond, passive ETFs tracking that index
  // are forced to sell, creating systematic downward price pressure.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    keywords: [
      "bị loại khỏi vndiamond",
      "vndiamond loại",
      "rổ vndiamond",
      "loại khỏi vndiamond",
      "vndiamond exclusion",
      "vndiamond remove",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.78,
    title: "VNDiamond exclusion — ETF forced selling: quỹ thụ động buộc phải bán cổ phiếu bị loại (etf_forced_selling)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1229 — Broader ETF / index rebalance rules
  // Any index rebalance removal → BEARISH (etf_forced_selling, confidence 0.75).
  // Any index addition → BULLISH (etf_inclusion, confidence 0.75).
  // VNDiamond-specific rules (Task 1223) take first-match-wins per domain;
  // these cover VN30/VN100/generic ETF rebalance events.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Index inclusion → forced passive buying (BULLISH) ─────────────────────
  {
    keywords: [
      "được thêm vào vn30",
      "thêm vào vn30",
      "được thêm vào chỉ số",
      "thêm vào chỉ số",
      "được thêm vào rổ etf",
      "thêm vào rổ etf",
      "etf inclusion",
      "index inclusion",
      "được đưa vào rổ",
      "gia nhập chỉ số",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.75,
    title: "Index inclusion — ETF forced buying: cổ phiếu được thêm vào chỉ số hưởng dòng tiền thụ động (etf_inclusion)",
  },

  // ── Index removal → forced passive selling (BEARISH) ─────────────────────
  {
    keywords: [
      "bị loại khỏi vn30",
      "loại khỏi vn30",
      "bị loại khỏi vn100",
      "loại khỏi vn100",
      "loại khỏi chỉ số",
      "bị loại khỏi chỉ số",
      "cơ cấu lại rổ",
      "etf cơ cấu",
      "rebalance",
      "index rebalance",
      "quỹ etf loại",
      "loại khỏi rổ etf",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.75,
    title: "Index rebalance — ETF forced selling: cổ phiếu bị loại khỏi chỉ số chịu áp lực bán ròng (etf_forced_selling)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1226 — FTSE/MSCI index upgrade → massive passive fund inflows (BULLISH)
  // Vietnam upgrade from Frontier to Emerging Market status triggers billions
  // in passive fund inflows, especially benefiting banking and large-cap stocks.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    keywords: [
      "ftse nâng hạng",
      "nâng hạng thị trường mới nổi",
      "emerging market",
      "ftse russell",
      "msci nâng hạng",
      "vietnam upgrade",
      "nâng hạng emerging",
      "frontier to emerging",
      "thị trường mới nổi",
      "vn nâng hạng",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.85,
    title: "FTSE/MSCI nâng hạng Việt Nam lên Emerging Market — dòng vốn thụ động khổng lồ, ngân hàng hưởng lợi trực tiếp (index_upgrade_inflow)",
  },
  {
    keywords: [
      "ftse nâng hạng",
      "nâng hạng thị trường mới nổi",
      "emerging market",
      "ftse russell",
      "msci nâng hạng",
      "vietnam upgrade",
      "nâng hạng emerging",
      "frontier to emerging",
      "thị trường mới nổi",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.82,
    title: "FTSE/MSCI nâng hạng — CTCK hưởng lợi từ thanh khoản tăng vọt và dòng vốn ngoại (index_upgrade_inflow)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1237 — ETF/passive fund inflow articles → BULLISH cascade
  // Articles about capital inflows from passive/ETF funds following index events
  // were previously misclassified as NEUTRAL. These keywords signal direct
  // buying pressure from foreign passive fund flows.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    keywords: [
      "dòng vốn etf",
      "quỹ etf đổ vào",
      "passive fund inflow",
      "fund flow vào vn",
      "dòng tiền etf",
      "etf mua ròng",
      "foreign fund inflow",
      "vốn etf vào",
      "khối ngoại mua ròng liên tiếp",
      "foreign passive fund",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.78,
    title: "Dòng vốn ETF/passive fund vào VN — thanh khoản tăng, hỗ trợ thị trường chứng khoán (passive_fund_inflow)",
  },
  {
    keywords: [
      "dòng vốn etf",
      "quỹ etf đổ vào",
      "passive fund inflow",
      "fund flow vào vn",
      "dòng tiền etf",
      "etf mua ròng",
      "foreign fund inflow",
      "vốn etf vào",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.72,
    title: "Dòng vốn ETF/passive fund — ngân hàng lớn (VCB, BID) hưởng lợi do chiếm tỷ trọng cao trong chỉ số (passive_fund_inflow)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1255 — Retail net-buying at scale → securities sector BULLISH
  //
  // "Nhà đầu tư cá nhân mua ròng" at large VND amounts (>1,000 tỷ) is a
  // direct revenue signal for brokerages: higher retail activity → higher
  // commission income for SSI/VCI/VIX/VND/HCM.
  //
  // Previously: article classified bullish impact 9 but no alert generated
  // for securities sector (bug 1261 from unified-agent 2026-04-14).
  // ═══════════════════════════════════════════════════════════════════════════
  {
    keywords: [
      "nhà đầu tư cá nhân mua ròng",
      "cá nhân mua ròng",
      "retail mua ròng",
      "nhà đầu tư cá nhân tăng mua",
      "thanh khoản thị trường tăng",
      "khối cá nhân mua ròng",
      "nhà đầu tư nội mua ròng",
      "dòng tiền cá nhân vào",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.78,
    title: "Nhà đầu tư cá nhân mua ròng quy mô lớn — phí môi giới CTCK (SSI/VCI/VIX/VND) tăng; VCB/BID/CTG/ACB hưởng lợi từ thanh khoản tăng (retail_netbuy_securities)",
    affected_actions: [
      { code: "VCB", direction: "up" },
      { code: "BID", direction: "up" },
      { code: "CTG", direction: "up" },
      { code: "ACB", direction: "up" },
    ],
  },
  {
    keywords: [
      "nhà đầu tư cá nhân mua ròng",
      "cá nhân mua ròng",
      "retail mua ròng",
      "nhà đầu tư cá nhân tăng mua",
      "thanh khoản thị trường tăng",
      "khối cá nhân mua ròng",
      "nhà đầu tư nội mua ròng",
      "dòng tiền cá nhân vào",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.62,
    title: "Nhà đầu tư cá nhân mua ròng — thanh khoản tăng hỗ trợ hoạt động ngân hàng (retail_netbuy_banking)",
  },
  // ── FR-1: VPBankS/OKX → VPB (parent) + TCB (peer) BULLISH (Sprint 1335) ──
  // Must come BEFORE FR-3 — first-match-wins. vpbanks+okx article hits FR-1 first.
  {
    keywords: [
      "vpbanks",
      "vp bank securities",
      "vpbank securities",
      "tăng vốn vpbanks",
      "vpbanks tăng vốn",
      "vpbanks.*okx",
      "okx.*vpbanks",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.88,
    requireAnyKeyword: [
      "tăng vốn",
      "vốn",
      "hợp tác",
      "partnership",
      "okx",
      "crypto",
      "digital asset",
      "tài sản số",
    ],
    title:
      "VPBankS tăng vốn/hợp tác OKX — VPB (công ty mẹ) và TCB (chiến lược tương đồng) hưởng lợi trực tiếp",
    affected_actions: [
      { code: "VPB", direction: "up" },
      { code: "TCB", direction: "up" },
    ],
  },
  // ── FR-3: banking NEUTRAL for crypto/digital-asset headlines (Sprint 1335) ──
  // Comes AFTER FR-1 — pure okx-only/generic crypto articles land here (no vpbanks keyword).
  // Bug 1315: affected_actions added — VCB/BID/EIB/HDB have no digital-asset strategy and
  // face competitive pressure from VPBankS/OKX → bearish (direction: "down").
  {
    keywords: [
      "okx",
      "crypto custody",
      "lưu ký tài sản số",
      "tài sản số vietnam",
      "sàn tiền mã hóa",
    ],
    domain: "banking",
    direction: "neutral",
    confidence: 0.65,
    title:
      "Crypto partnership/lưu ký tài sản số — ngân hàng truyền thống không có chiến lược digital-asset: tác động trung lập",
    affected_actions: [
      { code: "VCB", direction: "down" },
      { code: "BID", direction: "down" },
      { code: "EIB", direction: "down" },
      { code: "HDB", direction: "down" },
    ],
  },
  // ── FR-2: crypto/digital-asset custody → securities brokers BULLISH (Sprint 1335) ──
  {
    keywords: [
      "okx",
      "crypto custody",
      "lưu ký tài sản số",
      "tài sản số",
      "digital asset vietnam",
      "tiền mã hóa hợp pháp",
      "crypto hợp pháp",
      "sàn tiền mã hóa",
      "hợp tác crypto",
      "crypto partnership",
      "tài sản kỹ thuật số",
      "lưu ký crypto",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.72,
    requireAnyKeyword: [
      "chứng khoán",
      "securities",
      "vpbanks",
      "môi giới",
      "broker",
      "lưu ký",
      "custody",
    ],
    title:
      "Hợp tác crypto/lưu ký tài sản số — tín hiệu cạnh tranh/cơ hội mới cho CTCK (SSI/VCI/VIX/VND)",
    affected_actions: [
      { code: "SSI", direction: "up" },
      { code: "VCI", direction: "up" },
      { code: "VIX", direction: "up" },
      { code: "VND", direction: "up" },
    ],
  },
  // ── BK-1: Brokerage-outlook → securities sector bearish (Bug 1314) ──────────
  // CEO/analyst outlooks on brokerage sector, VPBankS competitive pressure, and
  // brokerage commission/margin compression signals cascade to securities domain.
  // Keywords use NFD-stripped Vietnamese so pattern matching is diacritic-agnostic.
  // Domain: "securities" — does not trigger banking (brokerage-only scope).
  {
    keywords: [
      "triển vọng ngành môi giới",
      "trien vong nganh moi gioi",
      "triển vọng môi giới chứng khoán",
      "trien vong moi gioi chung khoan",
      "áp lực cạnh tranh môi giới",
      "ap luc canh tranh moi gioi",
      "brokerage outlook",
      "brokerage competitive pressure",
      "phí môi giới giảm",
      "phi moi gioi giam",
      "cạnh tranh môi giới",
      "canh tranh moi gioi",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.72,
    title:
      "Triển vọng ngành môi giới chịu áp lực — CTCK truyền thống (SSI/VCI/VIX/VND) bị ảnh hưởng cạnh tranh từ VPBankS/OKX",
    affected_actions: [
      { code: "SSI", direction: "down" },
      { code: "VCI", direction: "down" },
      { code: "VIX", direction: "down" },
      { code: "VND", direction: "down" },
    ],
  },
];
