/**
 * Insider signal detectors — Poll News (Task 1260 / 1308a, split via FACTORY-APP-split-pollNews)
 * size-justification: 130L — 2 pure classifiers, each carrying its own
 * multi-line Vietnamese keyword-pattern array (family-relation/buying-action/
 * selling-action terms) kept verbatim from the pre-split god-file; the
 * keyword lists themselves are the bulk of the length and are not further
 * factorable without losing the (title, isBuying|isSelling) function shape
 * both call sites and tests depend on.
 *
 * Pure Vietnamese-keyword title classifiers that flag insider / large-shareholder
 * buying and selling activity. No I/O, no DB, no imports — safe to unit test in
 * isolation and safe to import from any layer.
 *
 * Split out of pollNews.ts (FACTORY-APP-split-pollNews, staged god-file split).
 * Re-exported from pollNews.ts unchanged — every existing
 * `from ".../pollNews.js"` import keeps working.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Insider family buying detector (Task 1260)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vietnamese keyword patterns for insider / related-party share accumulation.
 *
 * Returns true when an article title contains BOTH:
 *   (a) a family-relation term (con trai, con gái, vợ, chồng, người nhà, thành viên gia đình, etc.)
 *       OR a related-party term (cổ đông lớn, người thân, lãnh đạo)
 *   AND
 *   (b) a buying-action term (gom cổ phiếu, mua gom, tích lũy, mua vào, đăng ký mua)
 *
 * Exported for unit testing.
 */
export function detectInsiderFamilyBuying(title: string): boolean {
  const lower = title.toLowerCase();

  const FAMILY_RELATION_PATTERNS = [
    "con trai",
    "con gái",
    "con gai",
    "vợ ",
    "vo ",
    "chồng ",
    "chong ",
    "người nhà",
    "nguoi nha",
    "thành viên gia đình",
    "thanh vien gia dinh",
    "người thân",
    "nguoi than",
    "anh trai",
    "em trai",
    "anh gái",
    "em gái",
    "bố ",
    "mẹ ",
    "cha ",
    "me ",
  ];

  const BUYING_ACTION_PATTERNS = [
    "gom cổ phiếu",
    "gom co phieu",
    "mua gom",
    "tích lũy cổ phiếu",
    "tich luy co phieu",
    "mua vào",
    "mua vao",
    "đăng ký mua",
    "dang ky mua",
    "mua thêm",
    "mua them",
    "gom thêm",
    "gom them",
  ];

  const hasFamily = FAMILY_RELATION_PATTERNS.some((p) => lower.includes(p));
  const hasBuying = BUYING_ACTION_PATTERNS.some((p) => lower.includes(p));

  return hasFamily && hasBuying;
}

// ─────────────────────────────────────────────────────────────────────────────
// Insider selling detector (Task 1308a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects insider / large-shareholder SELLING signals in an article title.
 *
 * Mirrors detectInsiderFamilyBuying() but for sell-side actions. Returns true
 * when the title contains any selling-action keyword associated with insider or
 * large-shareholder disposals.
 *
 * Patterns cover:
 *   Vietnamese: xả hàng, bán ra, thoái vốn, dump (transliterated), bán sạch,
 *               thoái sạch, lãnh đạo bán, nội bộ bán, đăng ký bán
 *   English:    dump, selling, divest, divestiture, offload, sell off
 *
 * Exported for unit testing.
 */
export function detectInsiderSelling(title: string): boolean {
  const lower = title.toLowerCase();

  const SELLING_ACTION_PATTERNS = [
    // Vietnamese
    "xả hàng",
    "bán ra",
    "thoái vốn",
    "bán sạch",
    "thoái sạch",
    "lãnh đạo bán",
    "nội bộ bán",
    "đăng ký bán",
    "bán toàn bộ",
    "bán hết",
    // English
    "dump shares",
    "dumping shares",
    "insider selling",
    "executive selling",
    "ceo selling",
    "director selling",
    "divest",
    "divestiture",
    "offload shares",
    "sell off",
  ];

  return SELLING_ACTION_PATTERNS.some((p) => lower.includes(p));
}
