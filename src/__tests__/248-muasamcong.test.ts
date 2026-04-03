// src/__tests__/248-muasamcong.test.ts
import { describe, it, expect } from "bun:test";
import {
  fetchPublicContracts,
  mapContractToStocks,
  type PublicContract,
} from "../infrastructure/fetchers/muasamcong.js";

const MOCK_HTML = `
<html>
<body>
<table class="table-result">
  <tr>
    <th>Tên gói thầu</th><th>Giá trị</th><th>Bên mời thầu</th><th>Nhà thầu</th><th>Ngày kết quả</th>
  </tr>
  <tr>
    <td>Gói thầu xây dựng cầu đường cao tốc Bắc Nam đoạn 1</td>
    <td>1.500.000.000.000</td>
    <td>Bộ GTVT</td>
    <td>HHV Construction JSC</td>
    <td>2026-03-15</td>
  </tr>
  <tr>
    <td>Gói thầu công nghệ thông tin số hóa dữ liệu</td>
    <td>250.000.000.000</td>
    <td>Bộ Kế hoạch và Đầu tư</td>
    <td>FPT Software</td>
    <td>2026-03-10</td>
  </tr>
  <tr>
    <td>Gói thầu xây dựng nhà máy điện mặt trời</td>
    <td>800.000.000.000</td>
    <td>EVN</td>
    <td>GEG Energy</td>
    <td>2026-03-20</td>
  </tr>
</table>
</body>
</html>
`;

const EMPTY_HTML = `<html><body><p>Không có kết quả</p></body></html>`;

function makeClient(html: string) {
  return { get: async () => html };
}

describe("Task 248 — Muasamcong Fetcher", () => {
  it("returns an array of PublicContract", async () => {
    const result = await fetchPublicContracts(makeClient(MOCK_HTML));
    expect(Array.isArray(result)).toBe(true);
  });

  it("parses at least 1 contract from mock HTML", async () => {
    const result = await fetchPublicContracts(makeClient(MOCK_HTML));
    expect(result.length).toBeGreaterThan(0);
  });

  it("each contract has required fields", async () => {
    const result = await fetchPublicContracts(makeClient(MOCK_HTML));
    for (const c of result) {
      expect(typeof c.title).toBe("string");
      expect(typeof c.value).toBe("number");
      expect(typeof c.agency).toBe("string");
      expect(typeof c.winner).toBe("string");
      expect(typeof c.awardDate).toBe("string");
      expect(typeof c.category).toBe("string");
      expect(Array.isArray(c.relatedStocks)).toBe(true);
    }
  });

  it("highway contract maps to HHV/CII/VCG", async () => {
    const result = await fetchPublicContracts(makeClient(MOCK_HTML));
    const highway = result.find((c) => /cao tốc|cầu đường/i.test(c.title));
    expect(highway).toBeDefined();
    expect(highway!.relatedStocks.some((s) => ["HHV", "CII", "VCG"].includes(s))).toBe(true);
  });

  it("IT contract maps to FPT or CMG", async () => {
    const result = await fetchPublicContracts(makeClient(MOCK_HTML));
    const it = result.find((c) => /công nghệ thông tin|số hóa/i.test(c.title));
    expect(it).toBeDefined();
    expect(it!.relatedStocks.some((s) => ["FPT", "CMG"].includes(s))).toBe(true);
  });

  it("returns empty array on HTML with no contracts", async () => {
    const result = await fetchPublicContracts(makeClient(EMPTY_HTML));
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array when HTTP client throws", async () => {
    const badClient = {
      get: async () => { throw new Error("Network error"); },
    };
    const result = await fetchPublicContracts(badClient);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("mapContractToStocks: power keywords → GEG/REE/PC1", () => {
    const stocks = mapContractToStocks("Xây dựng nhà máy điện năng lượng mặt trời");
    expect(stocks.some((s) => ["GEG", "REE", "PC1"].includes(s))).toBe(true);
  });
});
