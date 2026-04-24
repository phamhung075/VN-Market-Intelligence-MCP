/**
 * Task 241 — Policy Impact Mapper
 *
 * Tests for classifyPolicy() pure domain service.
 * 16 tests covering each policy type, direction classification, and edge cases.
 */
import { describe, it, expect } from "bun:test";
import { classifyPolicy, type PolicySignal, type PolicyType } from "../domain/services/policyImpactMapper.js";

describe("Task 241 — Policy Impact Mapper", () => {
  it("returns null for empty title and body", () => {
    const result = classifyPolicy("", "");
    expect(result).toBeNull();
  });

  it("returns null for text with no policy keywords", () => {
    const result = classifyPolicy(
      "Kết quả kinh doanh HPG quý 2",
      "Doanh thu tăng 15% so với cùng kỳ",
    );
    expect(result).toBeNull();
  });

  it("classifies 'room tín dụng' as credit_policy affecting banking", () => {
    const result = classifyPolicy(
      "Ngân hàng Nhà nước nới room tín dụng thêm 2%",
      "NHNN công bố tăng hạn mức tăng trưởng tín dụng",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("credit_policy");
    expect(result!.affectedSectors).toContain("banking");
    expect(result!.affectedStocks).toContain("VCB");
  });

  it("classifies 'lãi suất điều hành' as credit_policy", () => {
    const result = classifyPolicy(
      "NHNN giảm lãi suất điều hành 0.5%",
      "Quyết định giảm lãi suất hỗ trợ nền kinh tế",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("credit_policy");
    expect(result!.affectedSectors).toContain("banking");
  });

  it("classifies 'thuế TTĐB' as tax_change affecting automotive", () => {
    const result = classifyPolicy(
      "Tăng thuế TTĐB đối với xe hơi nhập khẩu",
      "Bộ Tài chính đề xuất tăng thuế tiêu thụ đặc biệt",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("tax_change");
    expect(result!.affectedSectors).toContain("automotive");
  });

  it("classifies 'thuế nhập khẩu' as tax_change", () => {
    const result = classifyPolicy(
      "Chính phủ điều chỉnh thuế nhập khẩu thép",
      "Bộ Công Thương kiến nghị thay đổi thuế nhập khẩu",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("tax_change");
  });

  it("classifies 'khu công nghiệp' as industrial_zone", () => {
    const result = classifyPolicy(
      "Chính phủ phê duyệt khu công nghiệp mới tại Hưng Yên",
      "Quy hoạch mở rộng KCN tạo cơ hội thu hút FDI",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("industrial_zone");
    expect(result!.affectedStocks).toContain("IDC");
    expect(result!.direction).toBe("up");
  });

  it("classifies 'KCN' abbreviation as industrial_zone", () => {
    const result = classifyPolicy(
      "Bộ Kế hoạch phê duyệt mở rộng KCN Nam Định",
      "",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("industrial_zone");
  });

  it("classifies 'quy hoạch điện' as energy_policy", () => {
    const result = classifyPolicy(
      "Bộ Công Thương ban hành Quy hoạch điện VIII",
      "Định hướng phát triển năng lượng đến 2030",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("energy_policy");
    expect(result!.affectedStocks).toContain("REE");
  });

  it("classifies 'FIT' feed-in tariff as energy_policy", () => {
    const result = classifyPolicy(
      "Chính phủ công bố giá FIT mới cho điện mặt trời",
      "Cơ chế giá điện mặt trời mới hỗ trợ nhà đầu tư",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("energy_policy");
  });

  it("classifies 'siết tín dụng BĐS' as real_estate_policy bearish", () => {
    const result = classifyPolicy(
      "NHNN siết tín dụng BĐS, hạn chế cho vay bất động sản",
      "Quy định mới về tỷ lệ cho vay BĐS tại các ngân hàng",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("real_estate_policy");
    expect(result!.affectedSectors).toContain("real_estate");
    expect(result!.direction).toBe("down");
    expect(result!.affectedStocks).toContain("VHM");
  });

  it("classifies 'luật đất đai' as real_estate_policy", () => {
    const result = classifyPolicy(
      "Quốc hội thông qua Luật Đất đai sửa đổi 2024",
      "Những điểm mới của Luật Đất đai ảnh hưởng đến thị trường BĐS",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("real_estate_policy");
    expect(result!.affectedSectors).toContain("real_estate");
  });

  it("classifies 'FTA' as trade_policy affecting steel", () => {
    const result = classifyPolicy(
      "Việt Nam ký kết FTA với EU, mở rộng thị trường xuất khẩu",
      "Hiệp định thương mại tự do mới tác động tích cực đến thép",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("trade_policy");
    expect(result!.affectedStocks).toContain("HPG");
  });

  it("classifies 'tỷ giá' as monetary_policy affecting banking", () => {
    const result = classifyPolicy(
      "NHNN điều chỉnh tỷ giá USD/VND lên mức mới",
      "Chính sách tỷ giá linh hoạt hỗ trợ xuất khẩu",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("monetary_policy");
    expect(result!.affectedSectors).toContain("banking");
  });

  it("includes summary in output signal", () => {
    const result = classifyPolicy(
      "NHNN điều chỉnh dự trữ bắt buộc ngân hàng",
      "Tỷ lệ dự trữ bắt buộc thay đổi từ đầu tháng 5",
    );
    expect(result).not.toBeNull();
    expect(result!.summary).toBeTruthy();
    expect(typeof result!.summary).toBe("string");
  });

  it("confidence is between 0 and 1", () => {
    const result = classifyPolicy(
      "Phê duyệt khu công nghiệp tại Bình Dương",
      "KCN mới quy mô 500ha được phê duyệt",
    );
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });
});
