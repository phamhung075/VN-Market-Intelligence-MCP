# TASK_1472a — RED: test(diacritics): failing assertions for batch-2 Vietnamese diacritics

sprint: 177
phase: RED
depends_on: —

## Goal

Create failing test file asserting correct Vietnamese diacritics appear in 8 tool/scheduler files.
All assertions MUST fail before GREEN phase.

## Test file to create

`src/__tests__/1472-tool-diacritics-batch2.test.ts`

## Test structure

```typescript
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

describe("1472: Vietnamese diacritics batch 2", () => {
  describe("leadershipTools.ts", () => {
    const src = read("src/interface/mcp/tools/leadershipTools.ts");
    it("tool description has diacritics", () => {
      expect(src).toContain("Phân tích giao dịch nội bộ");
    });
    it("code param describe has diacritics", () => {
      expect(src).toContain("Mã cổ phiếu, ví dụ VCB");
    });
    it("outstandingShares param has diacritics", () => {
      expect(src).toContain("Số cổ phiếu đang lưu hành");
    });
    it("transactions param has diacritics", () => {
      expect(src).toContain("Danh sách giao dịch cần phân tích");
    });
  });

  describe("correlationTools.ts", () => {
    const src = read("src/interface/mcp/tools/correlationTools.ts");
    it("tool description has diacritics: tương quan", () => {
      expect(src).toContain("tương quan");
    });
    it("tool description has diacritics: cổ phiếu", () => {
      expect(src).toContain("cổ phiếu");
    });
    it("tool description has diacritics: tất cả cặp", () => {
      expect(src).toContain("tất cả cặp");
    });
  });

  describe("creditFlowTools.ts", () => {
    const src = read("src/interface/mcp/tools/creditFlowTools.ts");
    it("tool description has diacritics: Phân tích", () => {
      expect(src).toContain("Phân tích thay đổi tín dụng");
    });
    it("tool description has diacritics: tín hiệu", () => {
      expect(src).toContain("tín hiệu thị trường");
    });
    it("tool description has diacritics: không cung cấp", () => {
      expect(src).toContain("không cung cấp");
    });
    it("param: mặc định ~2800", () => {
      expect(src).toContain("mặc định ~2800");
    });
    it("param: hiện tại", () => {
      expect(src).toContain("tháng hiện tại");
    });
    it("param: trước", () => {
      expect(src).toContain("tháng trước");
    });
  });

  describe("energyTools.ts", () => {
    const src = read("src/interface/mcp/tools/energyTools.ts");
    it("tool description has diacritics: Lấy tín hiệu thị trường", () => {
      expect(src).toContain("Lấy tín hiệu thị trường điện lực");
    });
  });

  describe("climateTools.ts", () => {
    const src = read("src/interface/mcp/tools/climateTools.ts");
    it("tool description has diacritics: Lấy tín hiệu", () => {
      expect(src).toContain("Lấy tín hiệu rủi ro khí hậu");
    });
    it("stock param has diacritics: cổ phiếu", () => {
      expect(src).toContain("Mã cổ phiếu để lọc");
    });
  });

  describe("alertMuteTools.ts", () => {
    const src = read("src/interface/mcp/tools/alertMuteTools.ts");
    it("tool description has diacritics: Tắt tiếng", () => {
      expect(src).toContain("Tắt tiếng (mute)");
    });
    it("code param has diacritics: Mã cổ phiếu", () => {
      expect(src).toContain("Mã cổ phiếu (ví dụ: VCB");
    });
  });

  describe("telegramReportTools.ts", () => {
    const src = read("src/interface/mcp/tools/telegramReportTools.ts");
    it("comment string has diacritics: Khi không có", () => {
      expect(src).toContain("Khi không có báo cáo mới");
    });
  });

  describe("insiderCheckJob.ts", () => {
    const src = read("src/scheduler/insiderCheckJob.ts");
    it("MARKET output has diacritics: có hiệu ứng lớn nhất", () => {
      expect(src).toContain("có hiệu ứng lớn nhất trong thị trường VN");
    });
  });
});
```

## Acceptance

`bun test src/__tests__/1472-tool-diacritics-batch2.test.ts` — all 17 tests FAIL (strings not yet fixed).

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1472-tool-diacritics-batch2.test.ts   # created: 20-assertion RED test file

tests_written:
- src/__tests__/1472-tool-diacritics-batch2.test.ts   # 20 assertions, 18 FAIL (RED) — 2 pass because correlationTools already had tương quan + cổ phiếu; 18 fail exceeds required 17 fail threshold

tests_skipped: []

tsc_clean: true
full_suite_pass: n/a (RED phase — failures expected)
