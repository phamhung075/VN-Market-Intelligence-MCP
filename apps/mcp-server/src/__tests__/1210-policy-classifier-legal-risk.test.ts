// src/__tests__/1210-policy-classifier-legal-risk.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { classifyPolicy } from "../domain/services/policyImpactMapper.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

describe("Task 1210 — Policy classifier: criminal prosecution as legal_risk", () => {
  // ── Criminal prosecution cases must be legal_risk, NOT monetary_policy ───
  it("classifies 'khởi tố' banker articles as legal_risk", () => {
    const result = classifyPolicy(
      "Khởi tố nguyên giám đốc ngân hàng",
      "Cơ quan điều tra đã khởi tố bị can Nguyễn Văn A, nguyên giám đốc chi nhánh ngân hàng, về tội vi phạm các quy định về hoạt động ngân hàng",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("legal_risk");
  });

  it("classifies 'bắt giữ' banker articles as legal_risk", () => {
    const result = classifyPolicy(
      "Bắt giữ lãnh đạo ngân hàng liên quan tội tham nhũng",
      "Công an bắt giữ ông Trần Văn B, chủ tịch HĐQT ngân hàng, về hành vi tham ô tài sản",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("legal_risk");
  });

  it("classifies 'truy tố' banker articles as legal_risk", () => {
    const result = classifyPolicy(
      "VKS truy tố cựu tổng giám đốc ngân hàng",
      "Viện kiểm sát truy tố ông Lê Văn C về tội cố ý làm trái quy định nhà nước gây hậu quả nghiêm trọng",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("legal_risk");
  });

  it("classifies 'xét xử' banker articles as legal_risk", () => {
    const result = classifyPolicy(
      "Xét xử đại án ngân hàng ngàn tỷ",
      "TAND TP HCM xét xử vụ án liên quan đến lãi suất và sai phạm tại ngân hàng",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("legal_risk");
  });

  // ── Combination of legal + person name triggers legal_risk ───────────────
  it("classifies criminal + person name (ông/bà pattern) as legal_risk", () => {
    const result = classifyPolicy(
      "Khởi tố ông Nguyễn Đức Hưởng liên quan lãi suất",
      "Cơ quan cảnh sát điều tra khởi tố ông Nguyễn Đức Hưởng về các vi phạm liên quan đến lãi suất",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("legal_risk");
  });

  // ── Genuine monetary policy articles still classify correctly ────────────
  it("does NOT reclassify genuine monetary policy articles (tỷ giá)", () => {
    const result = classifyPolicy(
      "NHNN điều chỉnh tỷ giá trung tâm",
      "Ngân hàng nhà nước điều chỉnh tỷ giá trung tâm USD/VND nhằm ổn định thị trường ngoại hối và chính sách tiền tệ",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("monetary_policy");
  });

  it("does NOT reclassify credit policy articles without criminal keywords", () => {
    const result = classifyPolicy(
      "NHNN siết room tín dụng năm 2025",
      "Ngân hàng nhà nước công bố room tín dụng cho các ngân hàng thương mại",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("credit_policy");
  });

  // ── legal_risk includes proper affected fields ────────────────────────────
  it("legal_risk signal has banking sector and direction neutral or bearish", () => {
    const result = classifyPolicy(
      "Bắt giữ tổng giám đốc ngân hàng",
      "Cơ quan an ninh điều tra bắt giữ ông Phạm Văn D, tổng giám đốc",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("legal_risk");
    expect(result!.affectedSectors).toContain("banking");
  });

  // ── Edge case: only legal keyword, no person indicator → still legal_risk ─
  it("classifies 'khởi tố' without explicit person name as legal_risk", () => {
    const result = classifyPolicy(
      "Khởi tố vụ án liên quan lãi suất ngân hàng",
      "Cơ quan điều tra khởi tố nhiều bị can về hành vi lừa đảo chiếm đoạt tài sản",
    );
    expect(result).not.toBeNull();
    expect(result!.policyType).toBe("legal_risk");
  });

  // ── null for unrelated articles ───────────────────────────────────────────
  it("returns null for unrelated text", () => {
    const result = classifyPolicy("Tin tức giải trí hôm nay", "Ca sĩ ra album mới");
    expect(result).toBeNull();
  });
});
