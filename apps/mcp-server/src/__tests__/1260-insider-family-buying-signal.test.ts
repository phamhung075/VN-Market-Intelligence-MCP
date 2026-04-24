/**
 * Task 1260 — Cascade rule gap: HPG family-member buyback fires as LOW news_mention
 *
 * Bug: Articles with Vietnamese insider/family buying patterns (e.g. "con trai tỷ phú gom cổ phiếu HPG")
 * were classified as type=news_mention severity=LOW instead of type=insider_trading severity=medium.
 *
 * Fix: Add isInsiderFamilyBuying() keyword detector in pollNews.ts signal generation.
 * When article title matches insider-family-buying patterns, emit insider_trading MEDIUM
 * instead of news_mention LOW.
 *
 * Acceptance criteria:
 *   AC-1: "con trai tỷ phú gom cổ phiếu HPG" → insider_trading MEDIUM
 *   AC-2: "người nhà lãnh đạo mua gom VHM" → insider_trading MEDIUM
 *   AC-3: "tích lũy cổ phiếu" by family → insider_trading MEDIUM
 *   AC-4: Normal news article (no family/insider keywords) → news_mention (unchanged)
 *   AC-5: "con trai" without buying action → news_mention (no false positive)
 */

import { describe, test, expect } from "bun:test";
import { detectInsiderFamilyBuying } from "../application/usecases/pollNews";

describe("Task 1260 — isInsiderFamilyBuying keyword detector", () => {
  test("AC-1: 'con trai tỷ phú gom cổ phiếu HPG' → detected", () => {
    expect(
      detectInsiderFamilyBuying(
        "Con trai tỷ phú chi hơn 800 tỷ đồng gom cổ phiếu, HPG bứt phá"
      )
    ).toBe(true);
  });

  test("AC-2: 'người nhà lãnh đạo mua gom VHM' → detected", () => {
    expect(
      detectInsiderFamilyBuying("Người nhà lãnh đạo Vinhomes mua gom cổ phiếu VHM")
    ).toBe(true);
  });

  test("AC-3: 'thành viên gia đình tích lũy cổ phiếu' → detected", () => {
    expect(
      detectInsiderFamilyBuying(
        "Thành viên gia đình chủ tịch HĐQT tích lũy cổ phiếu FPT trong 3 tháng"
      )
    ).toBe(true);
  });

  test("AC-4: normal market article (no family/insider keywords) → not detected", () => {
    expect(
      detectInsiderFamilyBuying("VN-Index tăng mạnh nhờ nhóm ngân hàng và thép")
    ).toBe(false);
  });

  test("AC-5: 'con trai' alone without buying action → not detected (no false positive)", () => {
    expect(
      detectInsiderFamilyBuying("Con trai tỷ phú Elon Musk thành lập công ty AI mới")
    ).toBe(false);
  });

  test("AC-6: 'mua vào' by related party → detected", () => {
    expect(
      detectInsiderFamilyBuying(
        "Vợ Chủ tịch TCB đăng ký mua vào 2 triệu cổ phiếu Techcombank"
      )
    ).toBe(true);
  });

  test("AC-7: 'đăng ký mua' by family → detected", () => {
    expect(
      detectInsiderFamilyBuying(
        "Con gái Chủ tịch HDBank đăng ký mua 500.000 cổ phiếu HDB"
      )
    ).toBe(true);
  });
});
