/**
 * FIX-BCTC-BANK-BS-COLUMN-ORDER.test.ts
 *
 * Composite task (FIX-A + FIX-D + FIX-C per architect brief
 * docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md §7-8).
 * Supersedes FIX-BCTC-BANK-BS-SECTION-CLASSIFIER (whose 3 RC fixes, commit
 * 2c7fb5b0, are NOT reverted — non-regressions, verified by TASK-W3's own
 * suite staying green).
 *
 * ROOT CAUSE (report_id 96e36139-5dac-414d-8e4d-20a4725890d1, CTG 2026-Q1
 * consolidated, bank Mẫu B02a/TCTDHN): 3 independent, stacking bugs dropped
 * or corrupted every balance_sheet row before it ever reached
 * bctc_table_rows, freezing total_assets at 0:
 *
 *   FIX-A (application, refinedMarkdownParser.ts, 4+-column branch): the
 *     row parser hardcoded [code, label, value_current, value_prior] —
 *     the CORPORATE VAS convention ("Mã số | Chỉ tiêu | …"). CTG's bank
 *     form header is LABEL-FIRST ("Mục (Item) | Mã (Code) | …"). Every
 *     blank-Mã row (every section header + BOTH grand totals) was silently
 *     DROPPED (blank Mã became an empty labelRaw, tripping the "empty
 *     label" guard); every populated-Mã leaf row had code/label SWAPPED.
 *     Fix: resolveColumnLayout() reads the header's own captured cell text
 *     instead of assuming position (0-diff fallback to code-first when no
 *     header is captured or it is ambiguous).
 *
 *   FIX-D (domain, bctcFormType.ts isBankFormFromRows): the anchor regex
 *     required the code string to be an EXACT bare Roman numeral/letter.
 *     Real agentic-refine markdown bolds section/summary codes as its own
 *     convention (CTG's income statement stores "**I**" … "**XV**", never
 *     bare "I"). 0/451 of CTG's real codes matched pre-fix → the entire
 *     report was misclassified CORPORATE → every VAS-code scalar lookup
 *     resolved null. Fix: strip markdown emphasis markers before testing
 *     either the Roman/section or corporate-3-digit pattern.
 *
 *   FIX-C (application, refinedMarkdownParser.ts SECTION_HEADERS /
 *     FOLDED_SECTION_KEYWORDS): the bank-form canonical balance-sheet title
 *     "BÁO CÁO TÌNH HÌNH TÀI CHÍNH" ("Statement of Financial Position") was
 *     entirely absent from the vocabulary (only the corporate VAS title
 *     "BẢNG CÂN ĐỐI KẾ TOÁN" was recognized). Since detectSection's
 *     non-general branch is the ONLY mechanism that ever overrides
 *     `currentSection`, a bank unit's own real title line could never
 *     correct a bogus carried-in section from a prior unit. Fix: add the
 *     bank BS title (+ diacritic-folded sibling) to both vocabularies.
 *     Also closes the orch-state task-board's explicit "ToC false-positive"
 *     scope note: unit-0001 (MỤC LỤC table-of-contents page) has bullet
 *     lines that MENTION statement names ("- Báo cáo lưu chuyển tiền tệ
 *     hợp nhất") without being those statements' own titles; the
 *     pre-existing exact-phrase pattern already false-matched this bullet
 *     directly (confirmed empirically, not merely a folded-keyword
 *     artifact). Fix: detectSection now skips any bullet-prefixed
 *     ("-"/"*" + space) line entirely — a real statement title is never
 *     itself a markdown list item.
 *
 * Also fixed as a NECESSARY corollary of FIX-A/FIX-D (discovered via
 * hands-on verification against the REAL live markdown below, not
 * previously identified by the architect SPIKE): `parseVnNumber` assumed
 * VN dot-thousands/comma-decimal notation unconditionally and did not
 * strip markdown bold markers. CTG's real transcribed values are English
 * comma-thousands AND bold-wrapped for grand totals (e.g.
 * "**2,924,176,928**") — unfixed, this would have truncated every such
 * value at the first decimal point (parseFloat stops at the 2nd ".") or
 * failed to parse at all (leading "*" is not numeric), silently defeating
 * the very recovery this task exists to deliver. Fix: strip bold markers,
 * then auto-detect comma-vs-dot thousands/decimal format (mirrors the
 * heuristic already proven in the sibling legacy-pipeline parser,
 * domain/services/vnNumberParser.ts).
 *
 * REAL-DATA PROVENANCE (mandatory gate — not synthetic):
 * All markdown constants below are byte-identical to live
 * `bctc_refined_units.markdown` for report_id
 * 96e36139-5dac-414d-8e4d-20a4725890d1, fetched 2026-07-03 via
 * `get_bctc_refined` over HTTP JSON-RPC to the running mcp-server container
 * (POST localhost:3000/mcp, read-only, no mutation) — the same live-DB
 * verification method used by the root-cause SPIKE
 * (docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md). NOT
 * hand-written. unit-0000/0001 (title + table-of-contents, non-tabular)
 * are included alongside unit-0002/0003 (balance sheet: assets +
 * liabilities/equity) and unit-0005/0006 (income statement — the ONLY
 * source of the positive Roman-code signal FIX-D's classifier needs; the
 * balance-sheet units alone have a blank/short-digit Mã column and never
 * trigger bank classification by themselves) to prove the FULL real
 * document sequence — not a cherry-picked subset — resolves correctly
 * end-to-end.
 *
 * @module __tests__/FIX-BCTC-BANK-BS-COLUMN-ORDER
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { parseRefinedMarkdown } from "../application/utils/refinedMarkdownParser.js";
import { isBankFormFromRows } from "../domain/services/financial-reports/bctcFormType.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";

// ═══════════════════════════════════════════════════════════════════════════
// REAL verbatim markdown — see module doc above for provenance.
// ═══════════════════════════════════════════════════════════════════════════

const UNIT_0000_TITLE_MD =
  "# VietinBank — NGÂN HÀNG TMCP CÔNG THƯƠNG VIỆT NAM\n\n## BÁO CÁO TÀI CHÍNH HỢP NHẤT\n\nTại ngày 31 tháng 03 năm 2026 và cho giai đoạn tài chính kết thúc cùng ngày\n\nHà Nội, tháng 04 năm 2026\n";

const UNIT_0001_TOC_MD =
  "# MỤC LỤC\n\n## Nội dung\n\n- Báo cáo tình hình tài chính hợp nhất\n- Báo cáo kết quả hoạt động hợp nhất\n- Báo cáo lưu chuyển tiền tệ hợp nhất\n- Thông tin chung\n- Thuyết minh báo cáo tài chính hợp nhất\n\nNGÂN HÀNG TMCP CÔNG THƯƠNG VIỆT NAM\nĐịa chỉ: 108 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội\n";

const UNIT_0002_ASSETS_MD =
  "# NGÂN HÀNG TMCP CÔNG THƯƠNG VIỆT NAM — BÁO CÁO TÌNH HÌNH TÀI CHÍNH HỢP NHẤT (Tiếp theo)\n\nMẫu số: B02a/TCTDHN  \nĐịa chỉ: 108 Trần Hưng Đạo — Cửa Nam — Hà Nội\n\nTại 31 tháng 03 năm 2026  \nĐơn vị tính: triệu đồng\n\n## TÀI SẢN\n\n| Mục (Item) | Mã (Code) | Năm 2026 | Năm 2025 |\n|---|---|---:|---:|\n| **A. TÀI SẢN** | | | |\n| I. Tiền mặt, vàng bạc, đá quý | | 12,295,797 | 12,583,484 |\n| II. Tiền gửi tại NHNN | | 21,355,164 | 35,225,543 |\n| III. Tiền gửi và cho vay các TCTD khác | | 600,736,438 | 476,487,530 |\n| 1. Tiền gửi tại các TCTD khác | | 584,728,392 | 463,381,166 |\n| 2. Cho vay các TCTD khác | | 16,008,046 | 13,106,364 |\n| IV. Chứng khoán kinh doanh | | 3,579,549 | 2,942,431 |\n| 1. Chứng khoán kinh doanh | | 3,674,290 | 3,044,151 |\n| 2. Dự phòng rủi ro chứng khoán kinh doanh | | (94,741) | (101,720) |\n| V. Các công cụ tài chính phái sinh và các tài sản tài chính khác | | 1,994,058,143 | 228,448 |\n| VI. Cho vay khách hàng | | 2,028,494,571 | 1,957,462,503 |\n| 1. Cho vay khách hàng | | 2,028,494,571 | 1,992,272,868 |\n| 2. Dự phòng rủi ro cho vay khách hàng | | (34,436,428) | (34,810,365) |\n| VII. Chứng khoán đầu tư | | 209,370,664 | 211,880,390 |\n| 1. Chứng khoán đầu tư sẵn sàng để bán | | 189,753,569 | 203,605,111 |\n| 2. Chứng khoán đầu tư giữ đến ngày đáo hạn | | 19,763,854 | 8,806,918 |\n| 3. Dự phòng rủi ro chứng khoán đầu tư | | (146,759) | (531,639) |\n| VIII. Góp vốn, đầu tư dài hạn | | 4,515,197 | 4,428,296 |\n| 1. Vốn góp liên doanh | | 4,280,735 | 4,193,834 |\n| 2. Đầu tư dài hạn khác | | 234,462 | 234,462 |\n| IX. Tài sản cố định | | 10,766,129 | 10,826,743 |\n| 1. Tài sản cố định hữu hình | | 6,535,353 | 6,729,017 |\n| 1.1. Nguyên giá TSCĐ | | 18,564,267 | 18,510,909 |\n| 1.2. Hao mòn TSCĐ | | (12,028,914) | (11,781,892) |\n| 2. Tài sản cố định vô hình | | 4,230,776 | 4,097,726 |\n| 2.1. Nguyên giá TSCD | | 7,553,095 | 7,363,859 |\n| 2.2. Hao mòn TSCD | | (3,323,219) | (3,266,133) |\n| X. Tài sản Có khác | | 67,499,847 | 55,633,032 |\n| 1. Các khoản phải thu | | 44,952,746 | 33,305,817 |\n| 2. Các khoản lãi, phí phải thu | | 18,925,662 | 17,173,963 |\n| 3. Tài sản thuế TNDN hoãn lại | | 434 | 434 |\n| 4. Tài sản Có khác | | 3,728,393 | 5,262,441 |\n| XI. Dự phòng rủi ro cho các tài sản Có | | (107,388) | (108,723) |\n| **TỔNG TÀI SẢN CÓ** | | **2,924,176,928** | **2,767,699,300** |\n";

const UNIT_0003_LIABILITIES_MD =
  "# NGÂN HÀNG TMCP CÔNG THƯƠNG VIỆT NAM — BÁO CÁO TÌNH HÌNH TÀI CHÍNH HỢP NHẤT (Tiếp theo)\n\nMẫu số: B02a/TCTDHN  \nĐịa chỉ: 108 Trần Hưng Đạo — Cửa Nam — Hà Nội\n\nTại 31 tháng 03 năm 2026  \nĐơn vị tính: triệu đồng\n\n## NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU\n\n| Mục (Item) | Mã (Code) | Năm 2026 | Năm 2025 |\n|---|---|---:|---:|\n| **B. NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU** | | | |\n| I. Các khoản nợ Chính phủ và NHNN | 7 | 244,904,306 | 144,592,357 |\n| 1. Tiền gửi và vay Chính phủ, NHNN | | 221,544,095 | 141,627,156 |\n| 2. Giao dịch bán và mua lại trái phiếu Chính | | 23,360,211 | 2,965,201 |\n| II. Tiền gửi và vay các TCTD khác | 8 | 462,375,728 | 417,724,115 |\n| 1. Tiền gửi của các TCTD khác | | 443,246,435 | 399,558,557 |\n| 2. Vay các TCTD khác | | 19,129,293 | 18,165,558 |\n| III. Tiền gửi của khách hàng | 9 | 1,824,177,457 | 1,793,732,057 |\n| IV. Các công cụ tài chính phái sinh và các khoản nợ tài chính khác | 2 | 349,219 | — |\n| V. Vốn tài trợ, ủy thác đầu tư, cho vay TCTD chịu rủi ro | | 2,062,395 | 2,113,898 |\n| VI. Phát hành giấy tờ có giá | 10 | 149,264,503 | 174,030,352 |\n| VII. Các khoản nợ khác | 11 | 52,351,162 | 55,851,516 |\n| 1. Các khoản lãi, phí phải trả | | 27,187,370 | 26,660,549 |\n| 3. Các khoản phải trả và công nợ khác | | 22,636,917 | 26,345,997 |\n| 4. Dự phòng rủi ro khác | | 2,326,875 | 2,844,970 |\n| **TỔNG NỢ PHẢI TRẢ** | | **2,735,484,770** | **2,588,044,295** |\n| **VIII. Vốn chủ sở hữu** | | **188,692,158** | **179,655,005** |\n| 1. Vốn của TCTD | 13 | 88,218,675 | 88,218,675 |\n| a. Vốn điều lệ | | 77,669,446 | 77,669,446 |\n| b. Vốn đầu tư XDCB, mua sắm TSCĐ | | — | — |\n| c. Thặng dư vốn cổ phần | | 8,974,666 | 8,974,666 |\n| d. Cổ phiếu quỹ | | — | — |\n| e. Cổ phiếu ưu đãi | | — | — |\n| g. Vốn khác | | 1,574,563 | 1,574,563 |\n| 2. Quỹ của TCTD | | 31,660,817 | 31,654,355 |\n| 3. Chênh lệch tỷ giá hối đoái | | 431,024 | 362,748 |\n| 4. Lợi nhuận sau thuế chưa phân phối | | 67,132,147 | 58,212,794 |\n| 5. Lợi ích của cổ đông không kiểm soát | 13 | 1,249,495 | 1,206,433 |\n| **TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU** | | **2,924,176,928** | **2,767,699,300** |\n";

const UNIT_0005_INCOME_P1_MD =
  "# NGÂN HÀNG TMCP CÔNG THƯƠNG VIỆT NAM — BÁO CÁO KẾT QUẢ HOẠT ĐỘNG HỢP NHẤT\n\nMẫu số: B03a/TCTDHN  \nĐịa chỉ: 108 Trần Hưng Đạo — Cửa Nam — Hà Nội\n\n**Quý I năm 2026**\n\nĐơn vị tính: triệu đồng\n\n| STT | CHỈ TIÊU (Thuyết minh) | Quý I Năm nay | Năm trước | Năm nay (Hợp nhất) | Năm trước (Hợp nhất) |\n|---|---|---:|---:|---:|---:|\n| 1 | Thu nhập lãi và các khoản thu nhập tương tự | 14 | 41,672,522 | 32,684,212 | 41,672,522 | 32,684,212 |\n| 2 | Chi phí lãi và các chi phí tương tự | 15 | 22,287,369 | 17,208,997 | 22,287,369 | 17,208,997 |\n| **I** | **Thu nhập lãi thuần** | | **19,385,153** | **15,475,215** | **19,385,153** | **15,475,215** |\n| 3 | Thu nhập từ hoạt động dịch vụ | | 3,462,303 | 2,874,899 | 3,462,303 | 2,874,899 |\n| 4 | Chi phí hoạt động dịch vụ | | 1,615,259 | 1,264,360 | 1,615,259 | 1,264,360 |\n| **II** | **Lãi thuần từ hoạt động dịch vụ** | | **1,847,044** | **1,610,539** | **1,847,044** | **1,610,539** |\n| **III** | **Lãi thuần từ hoạt động kinh doanh ngoại hối** | | 1,084,689 | 912,866 | 1,084,689 | 912,866 |\n| **IV** | **Lợi nhuận từ mua bán chứng khoán** | 16 | 23,202 | 238,195 | 23,202 | 238,195 |\n| **V** | **Lãi thuần từ mua bán chứng khoán** | 17 | 392,393 | 90,960 | 392,393 | 90,960 |\n| | Thu nhập từ hoạt động khác | | 2,679,384 | 2,241,243 | 2,679,384 | 2,241,243 |\n| | Chi phí hoạt động khác | | 414,859 | 238,922 | 414,859 | 238,922 |\n| **VI** | **Lãi thuần từ hoạt động khác** | | **2,264,525** | **2,002,321** | **2,264,525** | **2,002,321** |\n| **VII** | **Thu nhập từ góp vốn, mua cổ phần** | 18 | 104,548 | 123,287 | 104,548 | 123,287 |\n| **VIII** | **Chi phí hoạt động** | 19 | 6,261,263 | 5,519,223 | 6,261,263 | 5,519,223 |\n| **IX** | **Chi phí dự phòng rủi ro tín dụng** | | 18,840,291 | 14,934,160 | 18,840,201 | 14,934,160 |\n| **X** | **Chi phí dự phòng rủi ro tín dụng** | | 7,700,931 | 8,110,962 | 7,700,931 | 8,110,962 |\n| **XI** | **Tổng lợi nhuận trước thuế** | | 11,139,360 | 6,823,198 | 11,139,360 | 6,823,198 |\n| 7 | Chi phí thuế TNDN hiện hành | | 2,179,319 | 1,319,472 | 2,179,319 | 1,319,472 |\n| 8 | Chi phí thuế TNDN hoãn lại | | — | 4,339 | — | 4,339 |\n| **XII** | **Chi phí thuế TNDN** | | **2,179,319** | **1,323,811** | **2,179,319** | **1,323,811** |\n";

const UNIT_0006_INCOME_P2_MD =
  "# NGÂN HÀNG TMCP CÔNG THƯƠNG VIỆT NAM — BÁO CÁO KẾT QUẢ HOẠT ĐỘNG HỢP NHẤT (Tiếp theo)\n\nMẫu số: B03a/TCTDHN  \nĐịa chỉ: 108 Trần Hưng Đạo — Cửa Nam — Hà Nội\n\n**Quý I năm 2026**\n\nĐơn vị tính: triệu đồng\n\n| STT | CHỈ TIÊU | Quý I Năm nay | Năm trước | Năm nay (Hợp nhất) | Năm trước (Hợp nhất) |\n|---|---|---:|---:|---:|---:|\n| **XIII** | **Lợi nhuận sau thuế TNDN** | **8,960,041** | **5,499,387** | **8,960,041** | **5,409,387** |\n| **XIV** | **Lợi ích của cổ đông không kiểm soát** | 43,062 | 80,512 | 43,062 | 80,512 |\n| **XV** | **Lợi nhuận thuần của cổ đông Ngân hàng** | **8,916,979** | **5,418,875** | **8,916,979** | **5,418,875** |\n\nHà Nội, ngày 3 tháng 04 năm 2026\n\n| Lập bảng | Kế toán trưởng | Phó Tổng giám đốc |\n|---|---|---|\n| | Trần Thị Thu Hương | Nguyễn Hải Hưng |\n";

// unit-0038 (page 45) — Thuyết minh 13.1, equity roll-forward. Mandatory
// per the PM handoff's explicit AC (docs/handoffs/FIX-BCTC-BANK-BS-COLUMN-ORDER.md):
// a 5-column table with NO Mã/code column at all, merged-cell 2-line header.
const UNIT_0038_EQUITY_ROLLFORWARD_MD =
  "# Ngân hàng TMCP Công thương Việt Nam — Thuyết minh các báo cáo tài chính hợp nhất\n\nMẫu: B05a/TCTDHN  \nTại ngày 31/03/2026 và cho giai đoạn tài chính kết thúc cùng ngày\n\n## 13. VỐN VÀ QUỸ CỦA TỔ CHỨC TÍN DỤNG\n\n### 13.1 Báo cáo tình hình thay đổi vốn chủ sở hữu\n\n**Đơn vị: Triệu đồng**\n\n| Mục | Số dư đầu năm | Phát sinh trong năm | | Số dư cuối kỳ |\n| | | Tăng | Giảm | |\n|---|---:|---:|---:|---:|\n| 1. Vốn góp/Vốn điều lệ | 77,669,446 | — | — | 77,669,446 |\n| 2. Thặng dư vốn cổ phần | 8,974,666 | — | — | 8,974,666 |\n| 3. Cổ phiếu quỹ | — | — | — | — |\n| 4. Chênh lệch đánh giá lại TS | — | — | — | — |\n| 5. Chênh lệch tỷ giá hối đoái | 362,748 | 68,276 | — | 431,024 |\n| 6. Quỹ đầu tư phát triển | 548,467 | 2,723 | — | 551,190 |\n| 7. Quỹ dự phòng tài chính | 18,016,694 | 3,739 | — | 18,020,433 |\n| 8. Quỹ dự trữ bổ sung vốn điều lệ | 13,089,194 | — | — | 13,089,194 |\n| 9. Quỹ khác thuộc vốn chủ sở hữu | — | — | — | — |\n| 10. Lợi nhuận sau thuế chưa phân phối | 58,212,794 | 8,916,979 | (2,374) | 67,132,147 |\n| 11. Lợi ích của cổ đông không kiểm soát | 1,206,433 | 43,062 | — | 1,249,495 |\n| 12. Vốn chủ sở hữu khác | 1,574,563 | — | — | 1,574,563 |\n| **Tổng cộng** | **179,655,005** | **9,034,779** | **(2,374)** | **188,692,158** |\n\n### Thông tin cổ phiếu\n\n| Chỉ tiêu | 31/03/2026 | 31/12/2025 |\n|---|---:|---:|\n| Số lượng cổ phiếu đăng ký phát hành | 7,766,944,637 | 7,766,944,637 |\n| Số lượng cổ phiếu đã bán ra công chúng trong kỳ | 2,396,952,889 | — |\n| — Cổ phiếu phổ thông | 2,396,952,889 | — |\n| — Cổ phiếu ưu đãi | — | — |\n| Số lượng cổ phiếu được mua lại | — | — |\n| Số lượng cổ phiếu đang lưu hành | 7,766,944,637 | 7,766,944,637 |\n| Mệnh giá cổ phiếu đang lưu hành (đồng) | 10,000 | 10,000 |";

// ═══════════════════════════════════════════════════════════════════════════
// Part 1 — FIX-A: label-first bank column order (4+-column branch)
// ═══════════════════════════════════════════════════════════════════════════

describe("FIX-A: label-first bank column order — real CTG unit-0002 (TÀI SẢN side)", () => {
  it("parses all 34 rows with 0 errors, all tagged balance_sheet via the unit's own real title", () => {
    const result = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(34);
    expect(result.rows.every((r) => r.statement_section === "balance_sheet")).toBe(true);
  });

  it("a blank-Mã leaf row survives with code=null and the REAL label/value (not dropped by the empty-label guard)", () => {
    const result = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    const row = result.rows.find((r) => r.label === "I. Tiền mặt, vàng bạc, đá quý");
    expect(row).toBeDefined();
    expect(row!.code).toBeNull();
    expect(row!.value_current).toBe(12295797);
    expect(row!.value_prior).toBe(12583484);
  });

  it("the bold, comma-formatted grand-total row survives with the correct value (not truncated/nulled)", () => {
    const result = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    const total = result.rows.find((r) => r.label === "**TỔNG TÀI SẢN CÓ**");
    expect(total).toBeDefined();
    expect(total!.code).toBeNull();
    expect(total!.value_current).toBe(2924176928);
    expect(total!.value_prior).toBe(2767699300);
    expect(total!.is_summary_row).toBe(1);
  });
});

describe("FIX-A: label-first bank column order — real CTG unit-0003 (NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU side, carried section)", () => {
  it("parses all 29 rows with 0 errors, all tagged balance_sheet (own title repeats + carried section)", () => {
    const unit2 = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    const result = parseRefinedMarkdown(UNIT_0003_LIABILITIES_MD, "ctg-real", [6], unit2.finalSection);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(29);
    expect(result.rows.every((r) => r.statement_section === "balance_sheet")).toBe(true);
  });

  it("a populated-Mã leaf row has code and label in the CORRECT (not swapped) fields", () => {
    const unit2 = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    const result = parseRefinedMarkdown(UNIT_0003_LIABILITIES_MD, "ctg-real", [6], unit2.finalSection);
    const row = result.rows.find((r) => r.label === "I. Các khoản nợ Chính phủ và NHNN");
    expect(row).toBeDefined();
    // BEFORE the fix: code held the label text, label held "7" (swapped).
    expect(row!.code).toBe("7");
    expect(row!.value_current).toBe(244904306);
    expect(row!.value_prior).toBe(144592357);
  });

  it("both remaining grand-total rows + the equity subtotal survive with correct values; the balance identity holds EXACTLY on the real transcribed numbers", () => {
    const unit2 = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    const result = parseRefinedMarkdown(UNIT_0003_LIABILITIES_MD, "ctg-real", [6], unit2.finalSection);
    const liab = result.rows.find((r) => r.label === "**TỔNG NỢ PHẢI TRẢ**");
    const equity = result.rows.find((r) => r.label === "**VIII. Vốn chủ sở hữu**");
    const combined = result.rows.find((r) => r.label === "**TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU**");
    expect(liab?.value_current).toBe(2735484770);
    expect(equity?.value_current).toBe(188692158);
    expect(combined?.value_current).toBe(2924176928);
    expect(liab!.value_current! + equity!.value_current!).toBe(combined!.value_current!);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 1b — FIX-A "label-only" layout (no Mã/code column at all) — real CTG
// unit-0038 (page 45), mandatory per the PM handoff's explicit AC: "All
// declared columns are carried through (not truncated at 4 cells)". This
// table has a merged-cell 2-line header ("Mục | Số dư đầu năm | Phát sinh
// trong năm | | Số dư cuối kỳ" + "| | Tăng | Giảm |" continuation) and 5
// data cells per row with NO code column whatsoever.
// ═══════════════════════════════════════════════════════════════════════════

describe("FIX-A: label-only column layout (no code column) — real CTG unit-0038 (equity roll-forward, 5 cells)", () => {
  it("a plain leaf row: label from cell[0], value_current=closing balance (LAST cell), value_prior=opening balance (FIRST value cell) — delta columns discarded, row NOT dropped", () => {
    const result = parseRefinedMarkdown(UNIT_0038_EQUITY_ROLLFORWARD_MD, "ctg-real", [45]);
    const row = result.rows.find((r) => r.label === "5. Chênh lệch tỷ giá hối đoái");
    expect(row).toBeDefined();
    expect(row!.code).toBeNull();
    expect(row!.value_current).toBe(431024); // closing balance (last cell)
    expect(row!.value_prior).toBe(362748);   // opening balance (first value cell)
  });

  it("the bold grand-total row resolves to the SAME equity_total figures already confirmed from unit-0003 (188,692,158 / 179,655,005) — cross-document consistency", () => {
    const result = parseRefinedMarkdown(UNIT_0038_EQUITY_ROLLFORWARD_MD, "ctg-real", [45]);
    const total = result.rows.find((r) => r.label === "**Tổng cộng**");
    expect(total).toBeDefined();
    expect(total!.code).toBeNull();
    expect(total!.value_current).toBe(188692158);
    expect(total!.value_prior).toBe(179655005);
  });

  it("a row with all-dash delta/value cells (no change in the period) survives with equal value_current/value_prior, not dropped", () => {
    const result = parseRefinedMarkdown(UNIT_0038_EQUITY_ROLLFORWARD_MD, "ctg-real", [45]);
    const row = result.rows.find((r) => r.label === "1. Vốn góp/Vốn điều lệ");
    expect(row).toBeDefined();
    expect(row!.value_current).toBe(77669446);
    expect(row!.value_prior).toBe(77669446);
  });

  it("non-regression: unit-0002/0003 (label-first, WITH a Mã column) are unaffected by the label-only branch", () => {
    const result = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    const row = result.rows.find((r) => r.label === "I. Tiền mặt, vàng bạc, đá quý");
    expect(row!.code).toBeNull(); // genuinely blank Mã cell, not "no Mã column at all"
    expect(row!.value_current).toBe(12295797);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 2 — FIX-C: bank balance-sheet title vocabulary
// ═══════════════════════════════════════════════════════════════════════════

describe("FIX-C: bank balance-sheet title vocabulary (BÁO CÁO TÌNH HÌNH TÀI CHÍNH)", () => {
  it("unit-0002's own real title line resolves to balance_sheet (previously fell through to general)", () => {
    const result = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    expect(result.finalSection).toBe("balance_sheet");
  });

  it("a bogus carried-in section from a prior unit is overridden by the unit's own real title (header always wins — SPIKE brief §5 interaction check)", () => {
    // Simulates the exact interaction flagged in the SPIKE brief: even if a
    // prior unit's carried finalSection is wrong (e.g. from an unrelated
    // ToC false-positive elsewhere in the document), unit-0002's OWN title
    // line must still correctly resolve every one of its rows to
    // balance_sheet, not silently inherit the bogus carried value.
    const result = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5], "cash_flow");
    expect(result.rows[0]?.statement_section).toBe("balance_sheet");
    expect(result.finalSection).toBe("balance_sheet");
  });

  it("real unit-0001 (MỤC LỤC table-of-contents page) no longer false-positives to cash_flow/notes via its bullet list (bullet-prefixed lines are never a real statement title)", () => {
    // unit-0001's ToC bullets ("- Báo cáo lưu chuyển tiền tệ hợp nhất",
    // "- Thuyết minh báo cáo tài chính hợp nhất") MENTION statement names
    // without being those statements' own title lines. Before this guard,
    // the pre-existing exact-phrase SECTION_HEADERS pattern already
    // false-matched the cash_flow bullet directly (confirmed: not a
    // folded-keyword-only defect) — detectSection now skips any
    // bullet-prefixed line entirely, so the ToC never mutates
    // currentSection away from "general".
    const result = parseRefinedMarkdown(UNIT_0001_TOC_MD, "ctg-real", [3]);
    expect(result.finalSection).toBe("general");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 3 — FIX-D: bold-marker-tolerant bank classifier (real codes)
// ═══════════════════════════════════════════════════════════════════════════

describe("FIX-D: bold-marker-tolerant isBankFormFromRows — real CTG codes", () => {
  it("balance-sheet-only rows (unit-0002+0003) alone do NOT trigger bank classification (real bank forms leave Mã blank for most sub-items — no Roman/section code present in this subset)", () => {
    const unit2 = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    const unit3 = parseRefinedMarkdown(UNIT_0003_LIABILITIES_MD, "ctg-real", [6], unit2.finalSection);
    const combined = [...unit2.rows, ...unit3.rows];
    expect(isBankFormFromRows(combined)).toBe(false);
  });

  it("real bold-wrapped Roman codes from the income statement ('**I**' … '**XV**') correctly flip the report to BANK once combined with the balance-sheet rows", () => {
    const unit2 = parseRefinedMarkdown(UNIT_0002_ASSETS_MD, "ctg-real", [4, 5]);
    const unit3 = parseRefinedMarkdown(UNIT_0003_LIABILITIES_MD, "ctg-real", [6], unit2.finalSection);
    const unit5 = parseRefinedMarkdown(UNIT_0005_INCOME_P1_MD, "ctg-real", [8], unit3.finalSection);
    const unit6 = parseRefinedMarkdown(UNIT_0006_INCOME_P2_MD, "ctg-real", [9], unit5.finalSection);
    const allRows = [...unit2.rows, ...unit3.rows, ...unit5.rows, ...unit6.rows];

    // Confirms the real bold codes flow through the parser unstripped
    // (bold-stripping happens inside the classifier, not the parser).
    expect(allRows.some((r) => r.code === "**I**")).toBe(true);
    expect(allRows.some((r) => r.code === "**XV**")).toBe(true);

    expect(isBankFormFromRows(allRows)).toBe(true);

    // Non-regression: a genuine 3-digit corporate code still correctly vetoes.
    expect(isBankFormFromRows([...allRows, { code: "280" }])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 4 — full parse→classify→section→emit through finalize_bctc_refine,
// using the REAL 6-unit CTG sequence (title, ToC, BS-assets, BS-liab+equity,
// income-statement p1, income-statement p2) — proving the fix holds through
// the actual materialization path named in the task, not just the pure
// parser/classifier functions in isolation.
// ═══════════════════════════════════════════════════════════════════════════

function openFullDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

interface FrRow {
  total_assets: number | null;
  total_liabilities: number | null;
  equity_total: number | null;
}

function readReport(db: Database, reportId: string): FrRow | null {
  return db
    .prepare<FrRow, [string]>(
      `SELECT total_assets, total_liabilities, equity_total
       FROM financial_reports WHERE id = ?`,
    )
    .get(reportId);
}

function seedReport(db: Database, id: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at, extraction_confidence,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        total_assets, total_liabilities, equity_total,
        validation_status, validation_notes,
        refine_status, confirm_status)
     VALUES (?, 'CTG', 'VietinBank', 'HOSE', 'other',
             2026, 1, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
             datetime('now'), 0.75,
             '{}', '{}', '{}', '{}',
             0, 24735484770, 244904306,
             'low_confidence',
             'Errors: Accounting identity violated: Assets (0) is not Liabilities (24,735,484,770) + Equity (244,904,306)',
             'PARTIAL', 'PENDING')`,
  ).run(id);
}

describe("Full real-data pipeline: finalize_bctc_refine over the REAL 6-unit CTG sequence", () => {
  let db: Database;

  beforeEach(() => { db = openFullDb(); });
  afterEach(() => { db.close(); });

  it("balance_sheet rows survive (0 leaked to general), and total_assets/total_liabilities/equity_total resolve to the EXACT pre-parse source-markdown values with the identity holding", async () => {
    const REPORT_ID = "ctg-96e36139-real-e2e";
    seedReport(db, REPORT_ID);

    const units: Array<[string, string, number[]]> = [
      ["unit-0000", UNIT_0000_TITLE_MD, [2]],
      ["unit-0001", UNIT_0001_TOC_MD, [3]],
      ["unit-0002", UNIT_0002_ASSETS_MD, [4, 5]],
      ["unit-0003", UNIT_0003_LIABILITIES_MD, [6]],
      ["unit-0005", UNIT_0005_INCOME_P1_MD, [8]],
      ["unit-0006", UNIT_0006_INCOME_P2_MD, [9]],
    ];
    for (const [unitId, md, pages] of units) {
      db.prepare(
        `INSERT INTO bctc_refined_units
           (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
         VALUES (?, ?, ?, ?, 0, 0.8, 'DONE')`,
      ).run(REPORT_ID, unitId, JSON.stringify(pages), md);
    }

    const handler = buildFinalizeBctcRefineHandler(db);
    const raw = await handler({ report_id: REPORT_ID, report_status: "DONE" });
    const response = JSON.parse(raw.content[0]!.text) as { ok: boolean; rows_parsed: number };
    expect(response.ok).toBe(true);
    expect(response.rows_parsed).toBeGreaterThan(0);

    interface BsCountRow { statement_section: string; n: number }
    const sectionCounts = db
      .prepare<BsCountRow, [string]>(
        `SELECT statement_section, COUNT(*) as n FROM bctc_table_rows WHERE report_id = ? GROUP BY statement_section`,
      )
      .all(REPORT_ID);
    const bsCount = sectionCounts.find((s) => s.statement_section === "balance_sheet")?.n ?? 0;
    const generalCount = sectionCounts.find((s) => s.statement_section === "general")?.n ?? 0;

    // CORE ASSERTION: balance_sheet row count is NO LONGER 0 (pre-fix defect)
    // and nothing leaked into "general".
    expect(bsCount).toBeGreaterThan(0);
    expect(generalCount).toBe(0);

    const row = readReport(db, REPORT_ID);
    expect(row).not.toBeNull();
    // Stale scalars (0 / 24,735,484,770 / 244,904,306) are UNFROZEN and
    // replaced with the values that were correct in the source markdown
    // all along (SPIKE brief §2 — transcription was never at fault).
    expect(row!.total_assets).toBe(2924176928);
    expect(row!.total_liabilities).toBe(2735484770);
    expect(row!.equity_total).toBe(188692158);
    expect(row!.total_liabilities! + row!.equity_total!).toBe(row!.total_assets!);
  });
});
